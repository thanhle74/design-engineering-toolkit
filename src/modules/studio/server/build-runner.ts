/**
 * [40] DET Studio — thin server-only local build runner (S2).
 *
 * The ONLY child-process caller in Studio: it spawns the EXISTING shipped CLI
 * (`node <det> build --config <abs> --out <absOut> --json`) as an argv array
 * with `shell: false` — never a shell string, never request-controlled paths
 * (config paths come from the pattern-checked, containment-checked catalog;
 * the output dir is derived from a Studio-generated run id under the
 * configured `STUDIO_DET_RUNS_DIR` root). No DB, auth, queue or cloud: one
 * in-process job slot; a POST while busy fails with 409 + the active job.
 *
 * Truthful capture: exit code / signal, bounded stdout+stderr tails, spawn
 * errors (ENOENT is a runner error, never a fake build), an env-configurable
 * timeout with an honest `timeout` state, and the manifest summary read back
 * FROM DISK (the bundle is the truth, not the child's stdout). A pending
 * journal entry persists under `<runsRoot>/.build-jobs/<runId>.json` — the
 * leading dot structurally keeps it out of the run listing and it is never
 * exposed as downloadable source. A stale `running` journal whose pid is gone
 * reads back as `interrupted`, never as an eternal fake "running".
 */
import "server-only";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
   mkdir,
   readFile,
   realpath,
   rename,
   stat,
   writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
   DetRunReaderError,
   type StudioBuildGapView,
   type StudioBuildStageView,
} from "@/src/modules/studio/shared/contracts";

import { RUN_ID_PATTERN } from "./artifact-access";
import { guardBuildManifest } from "./build-bundle-reader";
import { readJsonRecordIfPresent } from "./contained-read";
import { STUDIO_DET_RUNS_DIR_ENV } from "./det-run-reader-factory";
import { getStudioCatalog, type StudioCatalog } from "./catalog/studio-catalog";

export const STUDIO_DET_CLI_ENV = "STUDIO_DET_CLI";
export const STUDIO_BUILD_TIMEOUT_MS_ENV = "STUDIO_BUILD_TIMEOUT_MS";

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const STDOUT_TAIL_BYTES = 8 * 1024;
const STDERR_TAIL_BYTES = 8 * 1024;
const JOURNAL_DIR = ".build-jobs";

/** src/modules/studio (Studio module dir) — every relative STUDIO_DET_CLI value resolves against it. */
const STUDIO_APP_ROOT = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   "..",
);

export type BuildJobState =
   "queued" | "running" | "exited" | "timeout" | "spawn-failed" | "interrupted";

export interface BuildManifestSummary {
   profileId: string;
   platformId: string;
   sourceId: string;
   revisionId: string;
   stages: StudioBuildStageView[];
   gaps: StudioBuildGapView[];
   outputCount: number;
}

export interface BuildJobSnapshot {
   runId: string;
   configId: string;
   state: BuildJobState;
   exitCode: number | null;
   signal: string | null;
   timedOut: boolean;
   startedAt: string | null;
   finishedAt: string | null;
   /** The exact argv the runner executed (local operator provenance). */
   command: string[];
   stdoutTail: string;
   stderrTail: string;
   manifestSummary: BuildManifestSummary | null;
   spawnError: string | null;
   pid: number | null;
}

/** Thrown when a build is requested while the single slot is busy (→ 409). */
export class BuildBusyError extends Error {
   readonly active: BuildJobSnapshot;
   constructor(active: BuildJobSnapshot) {
      super(
         "A build is already running; this Studio runner executes one build at a time.",
      );
      this.name = "BuildBusyError";
      this.active = active;
   }
}

interface JournalRecord extends BuildJobSnapshot {
   journalSchemaVersion: 1;
}

interface ActiveJob {
   snapshot: BuildJobSnapshot;
   /** Null until spawn() returned; reservation happens before the first await. */
   child: ReturnType<typeof spawn> | null;
   timer: NodeJS.Timeout | null;
   /** Double-terminal guard: `error` and `close` may both fire for one child. */
   terminalHandled: boolean;
}

function pidAlive(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      return (
         error instanceof Error &&
         "code" in error &&
         (error as NodeJS.ErrnoException).code === "EPERM"
      );
   }
}

function parseTimeoutMs(): number {
   const raw = process.env[STUDIO_BUILD_TIMEOUT_MS_ENV];
   if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
   const parsed = Number(raw);
   return Number.isFinite(parsed) && parsed >= MIN_TIMEOUT_MS
      ? parsed
      : DEFAULT_TIMEOUT_MS;
}

function sanitizeSpawnError(error: NodeJS.ErrnoException): string {
   // Only the errno code surfaces — never the full message (it can embed paths).
   return `det CLI could not be spawned (${error.code ?? "unknown error"}).`;
}

export class BuildRunner {
   private readonly runsRoot: string;
   private readonly spawnImpl: typeof spawn;
   /**
    * [50] OPTIONAL catalogue (null when `STUDIO_DATA_DIR` is unset, or when it
    * failed to open — the bundle/journal on disk remain the truth either way).
    * Purely additive best-effort hooks: they never gate spawn, never change a
    * job state, and never touch the single-slot/early-error guarantees.
    */
   private readonly catalog: StudioCatalog | null;
   private active: ActiveJob | null = null;
   /**
    * Strict journal-write ordering (C2): the async `error` event can fire
    * while the running-state write is still pending; without a queue the
    * older write could land last and overwrite a terminal state. Every
    * journal write chains on this promise.
    */
   private journalQueue: Promise<unknown> = Promise.resolve();

   private constructor(
      runsRoot: string,
      spawnImpl: typeof spawn,
      catalog: StudioCatalog | null,
   ) {
      this.runsRoot = runsRoot;
      this.spawnImpl = spawnImpl;
      this.catalog = catalog;
   }

   /** Validate + realpath the runs root exactly once. */
   static async open(
      configuredRunsRoot: string,
      // Test seam ONLY: lets tests hold the job slot with a controlled child and
      // inject an optional [50] catalogue; production always uses the real
      // child_process.spawn and the factory-resolved catalogue.
      opts: { spawnImpl?: typeof spawn; catalog?: StudioCatalog | null } = {},
   ): Promise<BuildRunner> {
      if (
         typeof configuredRunsRoot !== "string" ||
         configuredRunsRoot.trim() === ""
      ) {
         throw new DetRunReaderError(
            "not-configured",
            "Build control requires STUDIO_DET_RUNS_DIR to point at a DET output root directory.",
         );
      }
      let resolved: string;
      try {
         resolved = await realpath(configuredRunsRoot);
      } catch {
         throw new DetRunReaderError(
            "not-configured",
            "Build control requires STUDIO_DET_RUNS_DIR to point at a readable directory.",
         );
      }
      const info = await stat(resolved).catch(() => null);
      if (info === null || !info.isDirectory()) {
         throw new DetRunReaderError(
            "not-configured",
            "Build control requires STUDIO_DET_RUNS_DIR to point at a directory.",
         );
      }
      return new BuildRunner(
         resolved,
         opts.spawnImpl ?? spawn,
         opts.catalog ?? null,
      );
   }

   /* ------------------------------ journal ----------------------------- */

   private journalPath(runId: string): string {
      return path.join(this.runsRoot, JOURNAL_DIR, `${runId}.json`);
   }

   /** Atomic journal write: temp file + rename inside the same directory. */
   private async writeJournal(snapshot: BuildJobSnapshot): Promise<void> {
      const journalDir = path.join(this.runsRoot, JOURNAL_DIR);
      await mkdir(journalDir, { recursive: true });
      const record: JournalRecord = { journalSchemaVersion: 1, ...snapshot };
      const tmp = path.join(
         journalDir,
         `.${snapshot.runId}.${randomBytes(4).toString("hex")}.tmp`,
      );
      await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
      await rename(tmp, this.journalPath(snapshot.runId));
   }

   /** Serialized journal write — never reordered, never run concurrently. */
   private queueJournal(snapshot: BuildJobSnapshot): Promise<void> {
      const next = this.journalQueue.then(() => this.writeJournal(snapshot));
      this.journalQueue = next.catch(() => undefined);
      return next;
   }

   private async readJournal(runId: string): Promise<BuildJobSnapshot | null> {
      if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) return null;
      let raw: string;
      try {
         raw = await readFile(this.journalPath(runId), "utf8");
      } catch {
         return null;
      }
      let parsed: unknown;
      try {
         parsed = JSON.parse(raw);
      } catch {
         return null;
      }
      if (typeof parsed !== "object" || parsed === null) return null;
      const record = parsed as Partial<JournalRecord>;
      if (typeof record.runId !== "string" || record.runId !== runId)
         return null;
      return {
         runId: record.runId,
         configId:
            typeof record.configId === "string" ? record.configId : "unknown",
         state: (typeof record.state === "string"
            ? record.state
            : "interrupted") as BuildJobState,
         exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
         signal: typeof record.signal === "string" ? record.signal : null,
         timedOut: record.timedOut === true,
         startedAt:
            typeof record.startedAt === "string" ? record.startedAt : null,
         finishedAt:
            typeof record.finishedAt === "string" ? record.finishedAt : null,
         command: Array.isArray(record.command)
            ? record.command.filter((c): c is string => typeof c === "string")
            : [],
         stdoutTail:
            typeof record.stdoutTail === "string" ? record.stdoutTail : "",
         stderrTail:
            typeof record.stderrTail === "string" ? record.stderrTail : "",
         manifestSummary: (record.manifestSummary ??
            null) as BuildManifestSummary | null,
         spawnError:
            typeof record.spawnError === "string" ? record.spawnError : null,
         pid: typeof record.pid === "number" ? record.pid : null,
      };
   }

   /* ------------------------------ status ------------------------------ */

   /** The live job's snapshot, or null. */
   activeSnapshot(): BuildJobSnapshot | null {
      return this.active === null ? null : { ...this.active.snapshot };
   }

   /**
    * Job snapshot by run id: live memory first, else the persisted journal.
    * A persisted `running` whose recorded pid is no longer alive reads back as
    * `interrupted` (server restarted mid-build) — never as a fake live state.
    */
   async snapshot(runId: string): Promise<BuildJobSnapshot | null> {
      const live = this.activeSnapshot();
      if (live !== null && live.runId === runId) return live;
      const journal = await this.readJournal(runId);
      if (journal === null) return null;
      if (
         journal.state === "running" &&
         journal.pid !== null &&
         !pidAlive(journal.pid)
      ) {
         return { ...journal, state: "interrupted" };
      }
      return journal;
   }

   /* ------------------------------- start ------------------------------ */

   /**
    * Start one build. Throws BuildBusyError when the single slot is taken and
    * DetRunReaderError("not-configured") when the det CLI env is unusable —
    * never a fabricated success.
    *
    * Event-ordering guarantees (Coordinator review C1/C2, issue #40):
    *  - C1: the slot is reserved SYNCHRONOUSLY, before the first await — two
    *    concurrent start() calls can never both observe an idle slot, and a
    *    failed initialization path always releases the reservation.
    *  - C2: child `error`/`close`/data listeners attach IMMEDIATELY after
    *    spawn(), before any await — a spawn failure (e.g. ENOENT) is emitted
    *    on a following tick and must never be an unhandled event.
    *  - Journal writes are serialized through one queue so a late state can
    *    never overwrite a terminal one, and the slot frees only after the
    *    terminal journal write completes.
    */
   async start(
      configId: string,
      configPath: string,
   ): Promise<BuildJobSnapshot> {
      // C1: synchronous busy check + synchronous reservation.
      const busy = this.activeSnapshot();
      if (busy !== null) throw new BuildBusyError(busy);

      const detEntry = this.resolveDetEntry();
      const snapshot: BuildJobSnapshot = {
         // Provisional id, finalized below while the slot is held (before the
         // first journal write), so concurrent starts cannot collide.
         runId: `build-${Date.now()}`,
         configId,
         state: "queued",
         exitCode: null,
         signal: null,
         timedOut: false,
         startedAt: new Date().toISOString(),
         finishedAt: null,
         command: [],
         stdoutTail: "",
         stderrTail: "",
         manifestSummary: null,
         spawnError: null,
         pid: null,
      };
      const activeJob: ActiveJob = {
         snapshot,
         child: null,
         timer: null,
         terminalHandled: false,
      };
      this.active = activeJob; // slot reserved — every failed init path releases it

      try {
         await this.finalizeRunId(snapshot);
         // [50] Best-effort catalogue record of the RUNNING job. A catalogue
         // failure never blocks a build (files/journal stay the truth); the
         // stale-RUNNING sweep and the scanner reconcile history later.
         if (this.catalog !== null) {
            try {
               this.catalog.recordRunnerStart({
                  runId: snapshot.runId,
                  configId,
                  pid: null,
                  startedAt: snapshot.startedAt ?? new Date().toISOString(),
               });
            } catch {
               /* catalogue is best-effort provenance */
            }
         }
         const absOut = path.join(this.runsRoot, snapshot.runId);
         snapshot.command = [
            process.execPath,
            detEntry,
            "build",
            "--config",
            configPath,
            "--out",
            absOut,
            "--json",
         ];
         // Pre-spawn journal write: if the journal is unwritable, refuse to
         // start (truthful) instead of running an unjournaled build.
         await this.queueJournal(snapshot);

         let child: ReturnType<typeof spawn>;
         try {
            child = this.spawnImpl(
               snapshot.command[0],
               snapshot.command.slice(1),
               {
                  shell: false,
                  stdio: ["ignore", "pipe", "pipe"],
               },
            );
         } catch (error) {
            snapshot.state = "spawn-failed";
            snapshot.spawnError = sanitizeSpawnError(
               error as NodeJS.ErrnoException,
            );
            snapshot.finishedAt = new Date().toISOString();
            await this.queueJournal(snapshot).catch(() => {});
            throw new DetRunReaderError(
               "not-configured",
               snapshot.spawnError ?? "det CLI could not be spawned.",
            );
         }
         activeJob.child = child;

         // C2: attach ALL listeners now — before any await below. A real spawn
         // failure emits `error` on a following tick; an unhandled `error`
         // event would terminate the Studio process.
         const stdoutChunks: Buffer[] = [];
         const stderrChunks: Buffer[] = [];
         child.stdout?.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
            trimTail(stdoutChunks, STDOUT_TAIL_BYTES);
         });
         child.stderr?.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
            trimTail(stderrChunks, STDERR_TAIL_BYTES);
         });

         const timeoutMs = parseTimeoutMs();
         activeJob.timer = setTimeout(() => {
            snapshot.timedOut = true;
            child.kill("SIGTERM");
         }, timeoutMs);

         const finishTerminal = (): void => {
            // Double-terminal guard: `error` and `close` may both fire; the
            // first terminal event wins, the second is ignored.
            if (activeJob.terminalHandled) return;
            activeJob.terminalHandled = true;
            if (activeJob.timer !== null) clearTimeout(activeJob.timer);
            snapshot.finishedAt = new Date().toISOString();
            snapshot.stdoutTail = buffersToText(stdoutChunks);
            snapshot.stderrTail = buffersToText(stderrChunks);
            // Truth from disk: the bundle is the durable contract surface; the
            // child's stdout is diagnostics only (kept as a bounded tail).
            void (async () => {
               snapshot.manifestSummary = await readManifestSummary(
                  this.runsRoot,
                  snapshot.runId,
               ).catch(() => null);
               // [50] Best-effort catalogue update AFTER the manifest is known:
               // a verifiable bundle is indexed from disk truth (status derived
               // from the stage table, outputs byte-verified); a job without one
               // records its truthful terminal state (FAILED / INTERRUPTED).
               if (this.catalog !== null) {
                  try {
                     if (snapshot.manifestSummary !== null) {
                        await this.catalog.indexBundleDir(
                           path.join(this.runsRoot, snapshot.runId),
                           snapshot.runId,
                           {
                              startedAt: snapshot.startedAt,
                              finishedAt: snapshot.finishedAt,
                              exitCode: snapshot.exitCode,
                              signal: snapshot.signal,
                           },
                        );
                     } else {
                        this.catalog.recordRunnerTerminal({
                           runId: snapshot.runId,
                           exitCode: snapshot.exitCode,
                           signal: snapshot.signal,
                           failureKind: snapshot.timedOut
                              ? "timeout"
                              : snapshot.state === "spawn-failed"
                                ? "spawn-failed"
                                : null,
                           finishedAt: snapshot.finishedAt,
                        });
                     }
                  } catch {
                     /* catalogue is best-effort provenance */
                  }
               }
               // Serialized journal write; free the slot only AFTER the journal
               // reflects the terminal state, so a concurrent status read can
               // never fall through to a stale state and misread the job.
               await this.queueJournal(snapshot).catch(() => {});
            })()
               .catch(() => {})
               .finally(() => {
                  if (this.active === activeJob) this.active = null;
               });
         };

         child.on("error", (error: NodeJS.ErrnoException) => {
            if (activeJob.terminalHandled) return;
            snapshot.state = "spawn-failed";
            snapshot.spawnError = sanitizeSpawnError(error);
            finishTerminal();
         });

         child.on("close", (code, signal) => {
            if (activeJob.terminalHandled) return;
            snapshot.state = snapshot.timedOut
               ? "timeout"
               : code === null
                 ? "spawn-failed"
                 : "exited";
            snapshot.exitCode = typeof code === "number" ? code : null;
            snapshot.signal = typeof signal === "string" ? signal : null;
            finishTerminal();
         });

         // Running-state write AFTER the listeners are attached; queued so it
         // can never reorder ahead of (and overwrite) a terminal state.
         snapshot.pid = child.pid ?? null;
         snapshot.state = "running";
         // [50] The catalogue's stale-RUNNING sweep keys on the live pid, so it
         // is recorded as soon as spawn() reveals it (best-effort).
         if (this.catalog !== null && snapshot.pid !== null) {
            try {
               this.catalog.recordRunnerPid(snapshot.runId, snapshot.pid);
            } catch {
               /* catalogue is best-effort provenance */
            }
         }
         await this.queueJournal(snapshot).catch(() => {});

         return { ...snapshot };
      } catch (error) {
         // C1: release the reservation on every failed initialization path —
         // but never out from under a live child (its terminal event owns the
         // release once spawn() returned).
         if (activeJob.child === null && this.active === activeJob) {
            this.active = null;
         }
         throw error;
      }
   }

   /**
    * Finalize the provisional run id while the slot is held (nothing written
    * yet, so updating snapshot.runId here is safe): collision-bumped against
    * existing journals/bundles, pattern-safe.
    *
    * The scan starts FROM the provisional id captured synchronously at slot
    * reservation — never from a fresh Date.now() ([58] CI correction): a
    * millisecond boundary crossed between the synchronous reserve and this
    * await would otherwise change the id AFTER a concurrent start already
    * observed it in the 409 BuildBusyError.active snapshot, breaking the C1
    * determinism the [40] lock asserts. The id now changes only on a real
    * journal/bundle collision.
    */
   private async finalizeRunId(snapshot: BuildJobSnapshot): Promise<void> {
      const provisional = Number.parseInt(
         snapshot.runId.slice("build-".length),
         10,
      );
      let ms = Number.isFinite(provisional) ? provisional : Date.now();
      for (;;) {
         const runId = `build-${ms}`;
         if (!RUN_ID_PATTERN.test(runId)) {
            ms += 1;
            continue;
         }
         const existing = await stat(this.journalPath(runId)).catch(() => null);
         const bundleDir = await stat(path.join(this.runsRoot, runId)).catch(
            () => null,
         );
         if (existing === null && bundleDir === null) {
            snapshot.runId = runId;
            return;
         }
         ms += 1;
      }
   }

   private resolveDetEntry(): string {
      const configured = process.env[STUDIO_DET_CLI_ENV];
      const raw =
         configured === undefined || configured.trim() === ""
            ? path.join("..", "..", "..", "bin", "det.js")
            : configured;
      // Relative values resolve against the Studio module dir (documented contract:
      // the default `../../../bin/det.js` names the checkout root from src/modules/studio).
      const resolved = path.isAbsolute(raw)
         ? raw
         : path.resolve(STUDIO_APP_ROOT, raw);
      return resolved;
   }
}

/* ------------------------------- helpers ------------------------------- */

function trimTail(chunks: Buffer[], capBytes: number): void {
   let total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
   while (total > capBytes && chunks.length > 1) {
      const removed = chunks.shift()!;
      total -= removed.byteLength;
   }
}

function buffersToText(chunks: Buffer[]): string {
   const text = Buffer.concat(chunks).toString("utf8");
   // Control characters never reach a journal or response body.
   return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(-STDERR_TAIL_BYTES);
}

/**
 * Loose manifest summary for job status — read back from the bundle on disk.
 * Uses the same guard as the reader (guardBuildManifest) so the summary can
 * never disagree with what the run page would later render.
 */
async function readManifestSummary(
   runsRoot: string,
   runId: string,
): Promise<BuildManifestSummary | null> {
   if (!RUN_ID_PATTERN.test(runId)) return null;
   const manifestRel = `${runId}/build-manifest.json`;
   const manifest = await readJsonRecordIfPresent(
      runsRoot,
      manifestRel,
      "invalid-payload",
   ).catch(() => null);
   if (manifest === null) return null;
   try {
      const guarded = guardBuildManifest(manifest);
      return {
         profileId: guarded.profileId,
         platformId: guarded.platformId,
         sourceId: guarded.sourceId,
         revisionId: guarded.revisionId,
         stages: guarded.stages,
         gaps: guarded.gaps,
         outputCount: guarded.outputOrder.length,
      };
   } catch {
      return null;
   }
}

/* ------------------------------- factory ------------------------------- */

const globalForRunner = globalThis as {
   __detStudioBuildRunner?: Promise<BuildRunner>;
};

/**
 * The ONE process-wide runner (Next.js dev can reload route modules; the
 * global keeps the single job slot honest across module re-evaluations).
 */
export async function getBuildRunner(): Promise<BuildRunner> {
   if (globalForRunner.__detStudioBuildRunner === undefined) {
      globalForRunner.__detStudioBuildRunner = (async () => {
         const configuredRoot = process.env[STUDIO_DET_RUNS_DIR_ENV];
         if (configuredRoot === undefined) {
            throw new DetRunReaderError(
               "not-configured",
               "Build control requires STUDIO_DET_RUNS_DIR to be set (builds write real bundles there). Unset it to browse the DEMO fixture instead — a build-control UI must never look like it built something it did not.",
            );
         }
         // [50] Optional catalogue: builds keep working (files/journal are the
         // truth) even when STUDIO_DATA_DIR is unset or cannot be opened; the
         // /catalog surface reports catalogue problems honestly on its own.
         const catalog = await getStudioCatalog().catch(() => null);
         return BuildRunner.open(configuredRoot, { catalog });
      })().catch((error) => {
         globalForRunner.__detStudioBuildRunner = undefined;
         throw error;
      });
   }
   return globalForRunner.__detStudioBuildRunner;
}
