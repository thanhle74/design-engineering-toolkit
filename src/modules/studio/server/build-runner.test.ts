/**
 * [40] Build runner tests.
 *
 * The happy paths drive the REAL shipped CLI (`node bin/det.js build`) so the
 * single-slot runner is proven end-to-end against actual engine output, per
 * issue #40 ("trigger actual offline build through Studio local runner").
 * Busy/timeout/spawn-failure cases use a controlled fake child via the
 * runner's test seam — no shell strings, ever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
   spawn,
   type ChildProcess,
   type SpawnOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DirectoryDetRunReader } from "./directory-det-run-reader";
import {
   BuildBusyError,
   BuildRunner,
   STUDIO_BUILD_TIMEOUT_MS_ENV,
   getBuildRunner,
   type BuildJobSnapshot,
} from "./build-runner";
import { exampleBuildConfigBody, requireDetCli } from "./test-helpers/det-cli";

// [70] "cancelled" joins the terminal set: user cancellation is a truthful
// terminal state the awaitTerminal poller must recognize.
const TERMINAL = new Set([
   "exited",
   "timeout",
   "spawn-failed",
   "interrupted",
   "cancelled",
]);

let runsRoot: string;
let projectsRoot: string;

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
   await mkdir(path.dirname(filePath), { recursive: true });
   await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Create a catalog entry (real repo fixture paths) + runner over a fresh runs root. */
async function setupRunner(
   options: { config?: Record<string, unknown>; spawnImpl?: typeof spawn } = {},
): Promise<{
   runner: BuildRunner;
   configPath: string;
}> {
   const entryDir = path.join(projectsRoot, "g28-example");
   await writeJson(
      path.join(entryDir, "build-config.json"),
      options.config ?? JSON.parse(exampleBuildConfigBody()),
   );
   const runner = await BuildRunner.open(runsRoot, {
      spawnImpl: options.spawnImpl,
   });
   return { runner, configPath: path.join(entryDir, "build-config.json") };
}

async function awaitTerminal(
   runner: BuildRunner,
   runId: string,
   timeoutMs = 30_000,
): Promise<BuildJobSnapshot> {
   const deadline = Date.now() + timeoutMs;
   let snap = await runner.snapshot(runId);
   while (snap !== null && !TERMINAL.has(snap.state)) {
      if (Date.now() > deadline)
         throw new Error(
            `build ${runId} did not reach a terminal state in time`,
         );
      await sleep(150);
      snap = await runner.snapshot(runId);
   }
   if (snap === null) throw new Error(`build ${runId} lost its snapshot`);
   return snap;
}

interface FakeChild extends EventEmitter {
   pid: number;
   stdout: null;
   stderr: null;
   kill: (signal?: string) => boolean;
}

function makeFakeChild(): FakeChild {
   const child = new EventEmitter() as unknown as FakeChild;
   child.pid = 424242;
   child.stdout = null;
   child.stderr = null;
   child.kill = () => true;
   // Deliberately NO pre-attached no-op `error` listener: masking early error
   // events would hide exactly the C2 ordering bug the early-error regression
   // test exists to catch. Fake-child tests only emit AFTER start() resolves.
   return child;
}

beforeEach(async () => {
   runsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-runs-"));
   projectsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-projects-"));
});

afterEach(async () => {
   await rm(runsRoot, { recursive: true, force: true });
   await rm(projectsRoot, { recursive: true, force: true });
   delete process.env[STUDIO_BUILD_TIMEOUT_MS_ENV];
});

describe("runner configuration", () => {
   it("reports not-configured for unset/invalid runs roots", async () => {
      await expect(BuildRunner.open("")).rejects.toMatchObject({
         code: "not-configured",
      });
      await expect(
         BuildRunner.open(path.join(runsRoot, "missing")),
      ).rejects.toMatchObject({
         code: "not-configured",
      });
      await writeFile(path.join(runsRoot, "file"), "x", "utf8");
      await expect(
         BuildRunner.open(path.join(runsRoot, "file")),
      ).rejects.toMatchObject({
         code: "not-configured",
      });
   });

   it("getBuildRunner names the env var (never its value) when unconfigured", async () => {
      const saved = process.env.STUDIO_DET_RUNS_DIR;
      delete process.env.STUDIO_DET_RUNS_DIR;
      try {
         await expect(getBuildRunner()).rejects.toThrow(/STUDIO_DET_RUNS_DIR/);
         process.env.STUDIO_DET_RUNS_DIR = "/definitely/missing/root-9f3a";
         await expect(getBuildRunner()).rejects.toThrow(/STUDIO_DET_RUNS_DIR/);
         const error = await getBuildRunner().catch((e) => e);
         expect(error.message).not.toContain("/definitely/missing/root-9f3a");
      } finally {
         if (saved === undefined) delete process.env.STUDIO_DET_RUNS_DIR;
         else process.env.STUDIO_DET_RUNS_DIR = saved;
      }
   });
});

describe("real end-to-end build through the runner", () => {
   it(
      "runs the accepted example build to a completed, verifiable bundle",
      { timeout: 30_000 },
      async () => {
         requireDetCli();
         const { runner, configPath } = await setupRunner();
         const started = await runner.start("g28-example", configPath);
         expect(["queued", "running"]).toContain(started.state);

         const final = await awaitTerminal(runner, started.runId);
         expect(final.state).toBe("exited");
         expect(final.exitCode).toBe(0);
         expect(final.timedOut).toBe(false);
         expect(final.manifestSummary).not.toBeNull();
         expect(final.manifestSummary!.stages).toHaveLength(3);
         expect(
            final.manifestSummary!.stages.every(
               (s) => s.status === "completed",
            ),
         ).toBe(true);
         expect(final.manifestSummary!.outputCount).toBeGreaterThan(0);

         // journal persisted where the listing structurally cannot see it
         expect(
            existsSync(
               path.join(runsRoot, ".build-jobs", `${started.runId}.json`),
            ),
         ).toBe(true);

         // the finished bundle is a verified live run through the normal reader
         const reader = await DirectoryDetRunReader.open(runsRoot);
         const ids = (await reader.listRuns()).map((r) => r.runId);
         expect(ids).toContain(started.runId);
         const run = await reader.getRun(started.runId);
         expect(run.build!.manifestVerified).toBe(true);
         const download = await reader.readArtifact(
            started.runId,
            "build-manifest.json",
         );
         expect(download.bytes.byteLength).toBeGreaterThan(0);

         // slot is free again — the runner exposes the terminal state BEFORE its
         // asynchronous manifest/journal finalization releases the slot, so poll
         // boundedly and assert the slot eventually clears (never an instant null).
         const slotDeadline = Date.now() + 5_000;
         while (runner.activeSnapshot() !== null && Date.now() < slotDeadline)
            await sleep(50);
         expect(runner.activeSnapshot()).toBeNull();
         expect(
            await runner.snapshot(`definitely-not-${started.runId}`),
         ).toBeNull();
      },
   );

   it(
      "surfaces a missing-profile config as exit 2 with diagnostics and no bundle",
      { timeout: 30_000 },
      async () => {
         requireDetCli();
         const bogus = JSON.parse(exampleBuildConfigBody());
         bogus.profile = path.join(
            projectsRoot,
            "does-not-exist",
            "profile.json",
         );
         const { runner, configPath } = await setupRunner({ config: bogus });

         const started = await runner.start("g28-example", configPath);
         const final = await awaitTerminal(runner, started.runId);
         expect(final.state).toBe("exited");
         expect(final.exitCode).toBe(2);
         expect(final.manifestSummary).toBeNull();
         expect(final.stdoutTail.length).toBeGreaterThan(0); // usage/schema diagnostics are real

         // no bundle was written, so nothing appears in the run listing
         const reader = await DirectoryDetRunReader.open(runsRoot);
         const ids = (await reader.listRuns()).map((r) => r.runId);
         expect(ids).not.toContain(started.runId);
      },
   );
});

describe("single-slot concurrency, timeout and spawn truth", () => {
   it("answers 409-style busy while the first build holds the slot", async () => {
      let childRef: FakeChild | null = null;
      const spawnImpl: typeof spawn = (() => {
         const child = makeFakeChild();
         childRef = child;
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const first = await runner.start("g28-example", configPath);
      expect(first.state).toBe("running");
      expect(first.pid).toBe(424242);

      const busy = await runner
         .start("g28-example", configPath)
         .catch((error) => error);
      expect(busy).toBeInstanceOf(BuildBusyError);
      expect((busy as BuildBusyError).active.runId).toBe(first.runId);

      childRef!.emit("close", 0, null);
      const final = await awaitTerminal(runner, first.runId);
      expect(final.state).toBe("exited");
      expect(final.exitCode).toBe(0);
      // the slot frees asynchronously after the journal reflects the terminal state
      const slotDeadline = Date.now() + 5_000;
      while (runner.activeSnapshot() !== null && Date.now() < slotDeadline)
         await sleep(50);
      expect(runner.activeSnapshot()).toBeNull();
   });

   it("records an honest timeout state when the child ignores SIGTERM in time", async () => {
      process.env[STUDIO_BUILD_TIMEOUT_MS_ENV] = "1000";
      const spawnImpl: typeof spawn = (() => {
         const child = makeFakeChild();
         child.kill = (signal?: string) => {
            // the child "dies" on SIGTERM — emit the close the runner waits for
            queueMicrotask(() =>
               child.emit("close", null, signal ?? "SIGTERM"),
            );
            return true;
         };
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const started = await runner.start("g28-example", configPath);
      const final = await awaitTerminal(runner, started.runId);
      expect(final.state).toBe("timeout");
      expect(final.timedOut).toBe(true);
      expect(final.signal).toBe("SIGTERM");
      expect(final.exitCode).toBeNull();
   });

   it("records a spawn failure instead of ever faking a build", async () => {
      let childRef: FakeChild | null = null;
      const spawnImpl: typeof spawn = (() => {
         const child = makeFakeChild();
         childRef = child;
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      // start() has resolved → the runner's error/close handlers are attached;
      // emit deterministically (no timing guess that can outrun CI's fs).
      const started = await runner.start("g28-example", configPath);
      childRef!.emit(
         "error",
         Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT" }),
      );
      const final = await awaitTerminal(runner, started.runId);
      expect(final.state).toBe("spawn-failed");
      expect(final.spawnError).toMatch(/could not be spawned/);
      expect(final.exitCode).toBeNull();
      expect(final.manifestSummary).toBeNull();
   });

   it("reads a stale running journal as interrupted when its pid is gone", async () => {
      // a pid that is definitely dead: run `true` to completion
      const dead = spawn(process.execPath, ["-e", ""]);
      await new Promise<void>((resolve) => dead.on("close", () => resolve()));
      expect(dead.pid).not.toBeNull();

      await mkdir(path.join(runsRoot, ".build-jobs"), { recursive: true });
      await writeJson(path.join(runsRoot, ".build-jobs", "build-stale.json"), {
         journalSchemaVersion: 1,
         runId: "build-stale",
         configId: "g28-example",
         state: "running",
         exitCode: null,
         signal: null,
         timedOut: false,
         startedAt: "2026-11-09T00:00:00.000Z",
         finishedAt: null,
         command: ["node", "det.js"],
         stdoutTail: "",
         stderrTail: "",
         manifestSummary: null,
         spawnError: null,
         pid: dead.pid,
      });

      const runner = await BuildRunner.open(runsRoot);
      const snap = await runner.snapshot("build-stale");
      expect(snap).not.toBeNull();
      expect(snap!.state).toBe("interrupted");
   });
});

describe("slot reservation and early spawn-error ordering (Coordinator C1/C2)", () => {
   it("C1: reserves the slot before the first await — concurrent starts yield exactly one spawn + one BuildBusyError", async () => {
      let spawnCount = 0;
      let childRef: FakeChild | null = null;
      const spawnImpl: typeof spawn = (() => {
         spawnCount += 1;
         const child = makeFakeChild();
         childRef = child;
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const results = await Promise.allSettled([
         runner.start("g28-example", configPath),
         runner.start("g28-example", configPath),
      ]);
      const fulfilled = results.filter(
         (r): r is PromiseFulfilledResult<BuildJobSnapshot> =>
            r.status === "fulfilled",
      );
      const rejected = results.filter(
         (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(BuildBusyError);
      expect(
         ((rejected[0]!.reason as BuildBusyError).active as { runId: string })
            .runId,
      ).toBe(fulfilled[0]!.value.runId);
      expect(spawnCount).toBe(1);

      // release the held slot: the fulfilled job is still running
      childRef!.emit("close", 0, null);
      const final = await awaitTerminal(runner, fulfilled[0]!.value.runId);
      expect(final.state).toBe("exited");
      const slotDeadline = Date.now() + 5_000;
      while (runner.activeSnapshot() !== null && Date.now() < slotDeadline)
         await sleep(50);
      expect(runner.activeSnapshot()).toBeNull();
   });

   it("C1: releases the reservation when initialization fails before spawn", async () => {
      const spawnImpl: typeof spawn = (() => {
         throw Object.assign(new Error("spawn node ENOENT"), {
            code: "ENOENT",
         });
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      await expect(
         runner.start("g28-example", configPath),
      ).rejects.toMatchObject({ code: "not-configured" });
      // pending queued journal writes flush, then the slot must be free again
      await sleep(100);
      expect(runner.activeSnapshot()).toBeNull();

      // the freed slot accepts a new build (fake child, resolves cleanly)
      const { runner: runner2, configPath: configPath2 } = await setupRunner({
         spawnImpl: (() => {
            const child = makeFakeChild();
            queueMicrotask(() => child.emit("close", 0, null));
            return child as unknown as ChildProcess;
         }) as unknown as typeof spawn,
      });
      // a fast fake may already be terminal when start() returns — the point
      // is that the freed slot accepts the start and reaches a terminal state
      const retry = await runner2.start("g28-example", configPath2);
      expect(retry.runId).toMatch(/^build-[0-9]+$/);
      const retryFinal = await awaitTerminal(runner2, retry.runId);
      expect(retryFinal.state).toBe("exited");
   });

   it(
      "C2: a genuine spawn ENOENT emitted on a following tick is captured — truthful spawn-failed, no unhandled event",
      { timeout: 30_000 },
      async () => {
         // REAL child_process.spawn of a missing executable: Node returns a
         // ChildProcess synchronously and emits `error` (ENOENT) on a following
         // tick — exactly the ordering that used to race the awaited journal
         // write. No fake child, no pre-attached no-op listener.
         const realSpawn: typeof spawn = ((
            command: string,
            args: readonly string[],
            options: SpawnOptions,
         ) =>
            spawn(
               "/definitely/missing/det-exec-9f3a",
               args,
               options,
            )) as unknown as typeof spawn;

         const { runner, configPath } = await setupRunner({
            spawnImpl: realSpawn,
         });
         const uncaught: unknown[] = [];
         const onUncaught = (error: unknown): void => {
            uncaught.push(error);
         };
         process.on("uncaughtException", onUncaught);
         try {
            const started = await runner.start("g28-example", configPath);
            const final = await awaitTerminal(runner, started.runId);
            expect(final.state).toBe("spawn-failed");
            expect(final.spawnError).toMatch(/could not be spawned/);
            expect(final.exitCode).toBeNull();
            expect(final.manifestSummary).toBeNull();
            // the slot frees only after the terminal journal write lands
            const slotDeadline = Date.now() + 5_000;
            while (
               runner.activeSnapshot() !== null &&
               Date.now() < slotDeadline
            )
               await sleep(50);
            expect(runner.activeSnapshot()).toBeNull();
         } finally {
            process.off("uncaughtException", onUncaught);
         }
         // the early `error` event never reached the process as unhandled
         expect(uncaught).toHaveLength(0);
      },
   );

   it(
      "C2 ordering: a terminal state is never overwritten by the still-pending running-state journal write",
      { timeout: 30_000 },
      async () => {
         const spawnImpl: typeof spawn = (() => {
            const child = makeFakeChild();
            // fail within the same tick window the runner is still initializing
            setTimeout(
               () =>
                  child.emit(
                     "error",
                     Object.assign(new Error("spawn node ENOENT"), {
                        code: "ENOENT",
                     }),
                  ),
               0,
            );
            return child as unknown as ChildProcess;
         }) as unknown as typeof spawn;

         const { runner, configPath } = await setupRunner({ spawnImpl });
         const started = await runner.start("g28-example", configPath);
         const final = await awaitTerminal(runner, started.runId);
         expect(final.state).toBe("spawn-failed");

         // give every queued journal write time to land, then read from DISK:
         // the persisted state must be the terminal one, never "running"
         await sleep(300);
         const reread = await runner.snapshot(started.runId);
         expect(reread!.state).toBe("spawn-failed");
         expect(reread!.spawnError).toMatch(/could not be spawned/);
      },
   );
});

/* --------------------------- [70] cancellation -------------------------- */

describe("BuildRunner.cancel — user cancellation of the live job", () => {
   it("SIGTERMs the live child and records the honest cancelled terminal state", async () => {
      const killedSignals: string[] = [];
      let childRef: FakeChild | null = null;
      const spawnImpl: typeof spawn = (() => {
         const child = makeFakeChild();
         child.kill = (signal?: string) => {
            killedSignals.push(signal ?? "SIGTERM");
            return true;
         };
         childRef = child;
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const started = await runner.start("g28-example", configPath);
      expect(started.state).toBe("running");

      const cancelled = runner.cancel(started.runId);
      expect(cancelled).not.toBeNull();
      expect(cancelled!.cancelled).toBe(true);
      expect(killedSignals).toContain("SIGTERM");

      // The child dies from the SIGTERM: the close handler journals the
      // truthful `cancelled` terminal state (distinct from `exited`).
      childRef!.emit("close", null, "SIGTERM");
      const final = await awaitTerminal(runner, started.runId);
      expect(final.state).toBe("cancelled");
      expect(final.cancelled).toBe(true);
      expect(final.exitCode).toBeNull();
      expect(final.signal).toBe("SIGTERM");
      expect(final.finishedAt).not.toBeNull();

      // the slot frees after the terminal journal write lands
      const slotDeadline = Date.now() + 5_000;
      while (runner.activeSnapshot() !== null && Date.now() < slotDeadline)
         await sleep(50);
      expect(runner.activeSnapshot()).toBeNull();
   });

   it("returns null for an unknown id while a job is live, and for the finished id after it", async () => {
      let childRef: FakeChild | null = null;
      const spawnImpl: typeof spawn = (() => {
         const child = makeFakeChild();
         childRef = child;
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const started = await runner.start("g28-example", configPath);
      // a DIFFERENT id never touches the live job
      expect(runner.cancel("build-999999")).toBeNull();
      expect(started.cancelled).toBe(false);

      childRef!.emit("close", 0, null);
      const final = await awaitTerminal(runner, started.runId);
      expect(final.state).toBe("exited");
      // the slot frees after the terminal journal write lands
      const slotDeadline = Date.now() + 5_000;
      while (runner.activeSnapshot() !== null && Date.now() < slotDeadline)
         await sleep(50);
      // finished jobs are never cancellable — cancel stays null, nothing
      // resurrects the terminal state
      expect(runner.cancel(started.runId)).toBeNull();
      expect(runner.cancel("build-999999")).toBeNull();
      const reread = await runner.snapshot(started.runId);
      expect(reread!.state).toBe("exited");
      expect(reread!.cancelled).toBe(false);
   });

   it("a timeout that already won the race stays timeout (cancel only flags it)", async () => {
      process.env[STUDIO_BUILD_TIMEOUT_MS_ENV] = "1000";
      let childRef: FakeChild | null = null;
      let killCount = 0;
      const timeoutKill = new Promise<void>((resolve) => {
         // fake child IGNORES SIGTERM until the test says otherwise; resolve
         // on the FIRST kill — which must be the runner's timeout timer
         const child = makeFakeChild();
         child.kill = (signal?: string) => {
            killCount += 1;
            if (killCount === 1) resolve();
            void signal;
            return true;
         };
         childRef = child;
      });
      const spawnImpl: typeof spawn = (() =>
         childRef as unknown as ChildProcess) as unknown as typeof spawn;

      const { runner, configPath } = await setupRunner({ spawnImpl });
      const started = await runner.start("g28-example", configPath);

      // Wait for the timeout SIGTERM (the child ignores it, so no close yet).
      await timeoutKill;
      const live = runner.activeSnapshot();
      expect(live).not.toBeNull();
      expect(live!.timedOut).toBe(true);

      // Cancel AFTER the timeout fired: the flag lands on the live snapshot,
      // but the timeout already won — the terminal state stays `timeout`.
      const cancelled = runner.cancel(started.runId);
      expect(cancelled).not.toBeNull();
      expect(cancelled!.cancelled).toBe(true);
      expect(cancelled!.state).toBe("running");

      childRef!.emit("close", null, "SIGTERM");
      const final = await awaitTerminal(runner, started.runId);
      expect(final.state).toBe("timeout");
      expect(final.timedOut).toBe(true);
      expect(final.cancelled).toBe(true);
   });
});
