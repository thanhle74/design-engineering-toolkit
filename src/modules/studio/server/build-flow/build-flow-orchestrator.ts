/**
 * [70] DET Studio — ONE-CLICK Build flow orchestrator (server-only).
 *
 * One POST starts the whole pipeline — verify-source → pinned-snapshot reuse
 * → AI analysis → deterministic mapping handoff (NO user approval click) →
 * det build → results — and returns 202 immediately; the pipeline continues
 * in the background through `driveStages()`. The AI plan is NEVER
 * user-approved: on a grounded plan-ready analysis the existing deterministic
 * `materializeApprovedInputs` runs automatically (derivedFrom stays
 * "agent-plan"; the journal records the handoff as automatic).
 *
 * House disciplines, mirrored exactly:
 *  - globalThis singleton via `getBuildFlowOrchestrator()` so the ONE flow
 *    slot stays honest across Next route-module reloads; synchronous slot
 *    reservation before the first await (C1) and release on every failed
 *    init path and after the terminal journal write.
 *  - Journal `<STUDIO_DET_RUNS_DIR>/.build-flow-jobs/<flowId>.json` (the dot
 *    dir keeps it out of run listings), atomic tmp+rename, SERIALIZED write
 *    queue (C2), one write per transition. Revival is tolerant: a corrupt or
 *    contract-invalid journal reads `interrupted`, never a fake state, and a
 *    stale `running` whose recorded pid is dead reads `interrupted`.
 *  - `flowId = flow-<Date.now()>` collision-bumped while the slot is held
 *    (mirror of the build runner's finalizeRunId, including the [58] rule
 *    that the scan starts from the provisional id captured synchronously).
 *  - Cancellation is an explicit user action: a `cancelRequested` flag is
 *    checked BEFORE each stage and between polls; a cancel during
 *    `ai-analysis`/`compose` forwards SIGTERM semantics to the child runner;
 *    stages that never started read `skipped` — never silently success.
 *
 * Truthfulness: the snapshot stage REUSES the committed pinned snapshot
 * (never a live fetch); every failure carries a truthful stage/outcome token
 * in a Vietnamese wrapper; no percent progress, no invented parallelism, no
 * fake timings; approved paths and absolute server paths are never echoed.
 */
import "server-only";

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

import {
   BUILD_FLOW_ARTIFACT_FILES,
   BUILD_FLOW_STAGES,
   BuildFlowRunSnapshotSchema,
   type AgentAnalysisSnapshot,
   type AgentPlan,
   type BuildFlowErrorCode,
   type BuildFlowOutputTarget,
   type BuildFlowRunSnapshot,
   type BuildFlowStageName,
   type BuildFlowStageRecord,
   type BuildFlowStageStatus,
   type StudioBuildGapView,
} from "@/src/modules/studio/shared/contracts";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import { RUN_ID_PATTERN } from "../artifact-access";
import {
   BuildBusyError,
   getBuildRunner,
   type BuildJobSnapshot,
} from "../build-runner";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
   type BuildConfigCatalogEntry,
} from "../build-catalog";
import {
   AgentBusyError,
   getAgentAnalysisRunner,
   type AgentAnalysisResult,
} from "../claude-agent/analysis-runner";
import { AgentWorkflowError } from "../claude-agent/agent-errors";
import {
   MaterializeError,
   materializeApprovedInputs,
} from "../claude-agent/plan-materializer";
import {
   assertRequestMatchesSourceIdentity,
   readSourceIdentity,
   type SourceIdentity,
} from "../claude-agent/source-identity";
import { parseFigmaInput } from "../../conversions/figma-input";
import { assertStudioEnvironmentReady } from "../environment";

import { BuildFlowApiError, BuildFlowBusyError } from "./build-flow-errors";

/* ------------------------------ constants ------------------------------ */

/** Studio flow id, `flow-<digits>` — also RUN_ID_PATTERN-safe by contract. */
const FLOW_ID_PATTERN = /^flow-\d+$/;

/** Dot-dir journal root under the runs root (kept out of run listings). */
const JOURNAL_DIR = ".build-flow-jobs";

/** The analysis workspace dir convention shared with the agent runner. */
const ANALYSIS_DIR = ".agent-analyses";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

/** Operator-facing excerpt cap for child diagnostics (stderr tails). */
const MESSAGE_EXCERPT_MAX = 200;

/**
 * Cap for flow-level error payloads — generous enough that the canonical
 * Vietnamese guidance messages (e.g. the source-identity mismatch instruction)
 * survive intact, still bounded against unbounded diagnostics.
 */
const FLOW_MESSAGE_MAX = 600;

/** Terminal AgentRunState values (polling stops on any of these). */
const AGENT_TERMINAL_STATES: ReadonlySet<string> = new Set([
   "exited",
   "timeout",
   "cancelled",
   "spawn-failed",
   "interrupted",
]);

/** Terminal BuildJobState values (polling stops on any of these). */
const BUILD_TERMINAL_STATES: ReadonlySet<string> = new Set([
   "exited",
   "timeout",
   "cancelled",
   "spawn-failed",
   "interrupted",
]);

/* ------------------------------ ports ---------------------------------- */

/**
 * The slice of `AgentAnalysisRunner` the pipeline drives. The real runner
 * satisfies this structurally; tests inject a fake (no real `claude` spawn).
 */
export interface BuildFlowAgentRunnerPort {
   start(
      request: { fileKey: string; nodeId: string; baseConfigId: string },
      baseConfigPath: string,
   ): Promise<AgentAnalysisSnapshot>;
   snapshot(analysisId: string): Promise<AgentAnalysisSnapshot | null>;
   result(analysisId: string): Promise<AgentAnalysisResult | null>;
   cancel(analysisId: string): AgentAnalysisSnapshot | null;
}

/** The slice of `BuildRunner` the compose stage drives. */
export interface BuildFlowBuildRunnerPort {
   start(configId: string, configPath: string): Promise<BuildJobSnapshot>;
   snapshot(runId: string): Promise<BuildJobSnapshot | null>;
   cancel(runId: string): BuildJobSnapshot | null;
}

/* ------------------------------ job bookkeeping ------------------------- */

interface ActiveFlow {
   snapshot: BuildFlowRunSnapshot;
   startOpts: { figmaInput: string; target: BuildFlowOutputTarget };
   /** Catalog-resolved base config path (set by verify-source). */
   baseConfigPath: string | null;
   /** The verified binding the flow runs on (set by verify-source). */
   identity: SourceIdentity | null;
   /** The grounded plan retrieved from the agent runner (set by ai-analysis). */
   plan: AgentPlan | null;
   /** Materialized approved build config path (internal — never echoed). */
   approvedConfigPath: string | null;
   analysisId: string | null;
   buildRunId: string | null;
   cancelRequested: boolean;
   /** Guard so the SIGTERM-semantics forward happens at most once. */
   childCancelSent: boolean;
}

/* ------------------------------ helpers -------------------------------- */

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Bounded, control-char-free diagnostic excerpt for operator messages. */
function boundedExcerpt(raw: string, max = MESSAGE_EXCERPT_MAX): string {
   const clean = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
   return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function freshStages(): BuildFlowStageRecord[] {
   return BUILD_FLOW_STAGES.map((stage) => ({
      stage,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      analysisId: null,
      buildRunId: null,
      message: null,
   }));
}

/** A stage-1 failure the flow reports verbatim as its own error payload. */
class SourceStageError extends Error {
   readonly code: "source-not-pinned" | "invalid-input";
   constructor(code: "source-not-pinned" | "invalid-input", message: string) {
      super(message);
      this.name = "SourceStageError";
      this.code = code;
   }
}

/* ------------------------------ orchestrator ---------------------------- */

export interface BuildFlowStartInput {
   figmaInput: string;
   target: BuildFlowOutputTarget;
}

export type BuildFlowCancelOutcome =
   | { kind: "cancelled"; snapshot: BuildFlowRunSnapshot }
   | { kind: "not-found" }
   | { kind: "not-cancellable"; snapshot: BuildFlowRunSnapshot };

export class BuildFlowOrchestrator {
   private readonly runsRoot: string;
   private readonly agentRunner: BuildFlowAgentRunnerPort;
   private readonly buildRunner: BuildFlowBuildRunnerPort;
   /**
    * The authoritative server-side readiness recheck, run immediately before
    * work is accepted (the POST route gates too — UI state is never
    * authorization). Injectable for hermetic tests.
    */
   private readonly guard: () => Promise<void>;
   private readonly pollIntervalMs: number;
   private active: ActiveFlow | null = null;
   /** Strict journal-write ordering — same C2 discipline as the runners. */
   private journalQueue: Promise<unknown> = Promise.resolve();

   private constructor(deps: {
      runsRoot: string;
      agentRunner: BuildFlowAgentRunnerPort;
      buildRunner: BuildFlowBuildRunnerPort;
      guard: () => Promise<void>;
      pollIntervalMs: number;
   }) {
      this.runsRoot = deps.runsRoot;
      this.agentRunner = deps.agentRunner;
      this.buildRunner = deps.buildRunner;
      this.guard = deps.guard;
      this.pollIntervalMs = deps.pollIntervalMs;
   }

   /**
    * Validate + realpath the runs root exactly once, then wire the pipeline.
    * `agentRunner`/`buildRunner`/`guard` default to the real process-wide
    * runners and the seeded environment gate; tests inject fakes instead.
    */
   static async open(opts: {
      runsRoot: string;
      agentRunner?:
         BuildFlowAgentRunnerPort | Promise<BuildFlowAgentRunnerPort>;
      buildRunner?:
         BuildFlowBuildRunnerPort | Promise<BuildFlowBuildRunnerPort>;
      guard?: () => Promise<void>;
      pollIntervalMs?: number;
   }): Promise<BuildFlowOrchestrator> {
      if (typeof opts.runsRoot !== "string" || opts.runsRoot.trim() === "") {
         throw new BuildFlowApiError(
            "environment-not-ready",
            "The one-click Build flow requires STUDIO_DET_RUNS_DIR to point at a DET output root directory.",
         );
      }
      let resolved: string;
      try {
         resolved = await realpath(opts.runsRoot);
      } catch {
         throw new BuildFlowApiError(
            "environment-not-ready",
            "The one-click Build flow requires STUDIO_DET_RUNS_DIR to point at a readable directory.",
         );
      }
      const info = await stat(resolved).catch(() => null);
      if (info === null || !info.isDirectory()) {
         throw new BuildFlowApiError(
            "environment-not-ready",
            "The one-click Build flow requires STUDIO_DET_RUNS_DIR to point at a directory.",
         );
      }
      return new BuildFlowOrchestrator({
         runsRoot: resolved,
         agentRunner: await (opts.agentRunner ?? getAgentAnalysisRunner()),
         buildRunner: await (opts.buildRunner ?? getBuildRunner()),
         guard:
            opts.guard ??
            (async () => {
               await assertStudioEnvironmentReady();
            }),
         pollIntervalMs: opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      });
   }

   /* ------------------------------ journal ----------------------------- */

   private journalPath(flowId: string): string {
      return path.join(this.runsRoot, JOURNAL_DIR, `${flowId}.json`);
   }

   /** Atomic journal write: temp file + rename inside the same directory. */
   private async writeJournal(snapshot: BuildFlowRunSnapshot): Promise<void> {
      const journalDir = path.join(this.runsRoot, JOURNAL_DIR);
      await mkdir(journalDir, { recursive: true });
      const tmp = path.join(
         journalDir,
         `.${snapshot.flowId}.${randomBytes(4).toString("hex")}.tmp`,
      );
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
      await rename(tmp, this.journalPath(snapshot.flowId));
   }

   /** Serialized journal write — never reordered, never run concurrently. */
   private queueJournal(snapshot: BuildFlowRunSnapshot): Promise<void> {
      const next = this.journalQueue.then(() => this.writeJournal(snapshot));
      this.journalQueue = next.catch(() => undefined);
      return next;
   }

   private async readJournal(
      flowId: string,
   ): Promise<BuildFlowRunSnapshot | null> {
      if (typeof flowId !== "string" || !FLOW_ID_PATTERN.test(flowId))
         return null;
      let raw: string;
      try {
         raw = await readFile(this.journalPath(flowId), "utf8");
      } catch {
         return null;
      }
      let parsed: unknown;
      try {
         parsed = JSON.parse(raw);
      } catch {
         return interruptedFallback(flowId);
      }
      if (typeof parsed !== "object" || parsed === null) {
         return interruptedFallback(flowId);
      }
      const checked = BuildFlowRunSnapshotSchema.safeParse(parsed);
      const snapshot = checked.success
         ? checked.data
         : interruptedFallback(flowId);
      if (
         snapshot.state === "running" &&
         snapshot.pid !== null &&
         !pidAlive(snapshot.pid)
      ) {
         return { ...snapshot, state: "interrupted" };
      }
      return snapshot;
   }

   /* ------------------------------ status ------------------------------ */

   /** Deep-ish copy so callers can never observe later stage mutations. */
   private snapshotCopy(snapshot: BuildFlowRunSnapshot): BuildFlowRunSnapshot {
      return {
         ...snapshot,
         stages: snapshot.stages.map((row) => ({ ...row })),
      };
   }

   /** The live flow's snapshot, or null. */
   activeSnapshot(): BuildFlowRunSnapshot | null {
      return this.active === null
         ? null
         : this.snapshotCopy(this.active.snapshot);
   }

   /**
    * Flow snapshot by id: live memory first, else the persisted journal. A
    * persisted `running` whose recorded pid is no longer alive reads back as
    * `interrupted` (server restarted mid-flow) — never a fake live state.
    */
   async snapshot(flowId: string): Promise<BuildFlowRunSnapshot | null> {
      const live = this.activeSnapshot();
      if (live !== null && live.flowId === flowId) return live;
      return this.readJournal(flowId);
   }

   /* ------------------------------ cancel ------------------------------ */

   /**
    * User cancellation of the live flow: raises `cancelRequested` (honored
    * BEFORE each stage and between polls) and, when a cancellable child is
    * live, forwards the cancellation to it (agent → `cancel`, compose →
    * `cancel`). Returns `cancelled` with the current snapshot, `not-found`
    * for an unknown id, or `not-cancellable` for an already-terminal flow.
    */
   async cancel(flowId: string): Promise<BuildFlowCancelOutcome> {
      const live = this.active;
      if (live !== null && live.snapshot.flowId === flowId) {
         live.cancelRequested = true;
         if (!live.childCancelSent) {
            const stage = live.snapshot.currentStage;
            if (stage === "ai-analysis" && live.analysisId !== null) {
               live.childCancelSent = true;
               this.agentRunner.cancel(live.analysisId);
            } else if (stage === "compose" && live.buildRunId !== null) {
               live.childCancelSent = true;
               this.buildRunner.cancel(live.buildRunId);
            }
         }
         return {
            kind: "cancelled",
            snapshot: this.snapshotCopy(live.snapshot),
         };
      }
      const snap = await this.snapshot(flowId);
      if (snap === null) return { kind: "not-found" };
      return { kind: "not-cancellable", snapshot: snap };
   }

   /* ------------------------------- start ------------------------------ */

   /**
    * Start the ONE one-click flow. Request-level validation (body shape,
    * target vocabulary, Figma-input parse) is ALREADY done by the route; the
    * input is re-parsed synchronously here only so the pre-stage-1 snapshot
    * carries an honest request placeholder — the real binding happens in
    * stage 1 (verify-source).
    *
    * C1: the slot is reserved SYNCHRONOUSLY, before the first await. Every
    * failed initialization path (guard, id finalization, initial journal
    * write) releases the reservation. Throws BuildFlowBusyError when the
    * single flow slot is taken.
    */
   async start(startOpts: BuildFlowStartInput): Promise<BuildFlowRunSnapshot> {
      const busy = this.activeSnapshot();
      if (busy !== null) throw new BuildFlowBusyError(busy);

      const hint = parseFigmaInput(startOpts.figmaInput);
      const snapshot: BuildFlowRunSnapshot = {
         // Provisional id, finalized below while the slot is held (before the
         // first journal write), so concurrent starts cannot collide.
         flowId: `flow-${Date.now()}`,
         journalSchemaVersion: 1,
         state: "queued",
         request: {
            fileKey:
               hint.ok && hint.fileKey !== null ? hint.fileKey : "unknown",
            nodeId: hint.ok ? hint.nodeId : "unknown",
            baseConfigId: "unknown",
            target: startOpts.target,
         },
         stages: freshStages(),
         currentStage: null,
         error: null,
         startedAt: new Date().toISOString(),
         finishedAt: null,
         pid: process.pid,
      };
      const job: ActiveFlow = {
         snapshot,
         startOpts,
         baseConfigPath: null,
         identity: null,
         plan: null,
         approvedConfigPath: null,
         analysisId: null,
         buildRunId: null,
         cancelRequested: false,
         childCancelSent: false,
      };
      this.active = job; // slot reserved — every failed init path releases it

      try {
         await this.finalizeFlowId(job);
         // Authoritative readiness recheck immediately before accepting work
         // (frozen decision: server-side, never UI state). A guard failure
         // releases the reservation via the catch below.
         await this.guard();
         // Pre-pipeline journal write: if the journal is unwritable, refuse
         // to start (truthful) instead of running an unjournaled flow.
         await this.queueJournal(job.snapshot);
         // Background continuation — awaited nowhere.
         void this.driveStages(job);
         return this.snapshotCopy(job.snapshot);
      } catch (error) {
         if (this.active === job) this.active = null;
         throw error;
      }
   }

   /**
    * Finalize the provisional flow id while the slot is held (nothing
    * written yet): collision-bumped against existing journals, pattern-safe.
    * The scan starts FROM the provisional id captured synchronously at slot
    * reservation — never from a fresh Date.now() ([58] correction).
    */
   private async finalizeFlowId(job: ActiveFlow): Promise<void> {
      const provisional = Number.parseInt(
         job.snapshot.flowId.slice("flow-".length),
         10,
      );
      let ms = Number.isFinite(provisional) ? provisional : Date.now();
      for (;;) {
         const flowId = `flow-${ms}`;
         if (!FLOW_ID_PATTERN.test(flowId) || !RUN_ID_PATTERN.test(flowId)) {
            ms += 1;
            continue;
         }
         const existing = await stat(this.journalPath(flowId)).catch(
            () => null,
         );
         if (existing === null) {
            job.snapshot.flowId = flowId;
            return;
         }
         ms += 1;
      }
   }

   /* --------------------------- stage transitions ----------------------- */

   private stageRecord(
      job: ActiveFlow,
      stage: BuildFlowStageName,
   ): BuildFlowStageRecord {
      const row = job.snapshot.stages.find(
         (candidate) => candidate.stage === stage,
      );
      if (row === undefined) {
         throw new Error(`internal: unknown build-flow stage ${stage}`);
      }
      return row;
   }

   private async beginStage(
      job: ActiveFlow,
      stage: BuildFlowStageName,
   ): Promise<void> {
      const row = this.stageRecord(job, stage);
      row.status = "running";
      row.startedAt = new Date().toISOString();
      job.snapshot.currentStage = stage;
      if (job.snapshot.state === "queued") job.snapshot.state = "running";
      await this.queueJournal(job.snapshot);
   }

   private async completeStage(
      job: ActiveFlow,
      stage: BuildFlowStageName,
      status: Extract<BuildFlowStageStatus, "success" | "warning">,
      message: string,
   ): Promise<void> {
      const row = this.stageRecord(job, stage);
      row.status = status;
      row.finishedAt = new Date().toISOString();
      row.message = message;
      job.snapshot.currentStage = null;
      await this.queueJournal(job.snapshot);
   }

   /** Terminal failure: the running row fails, pending rows read skipped. */
   private async failFlow(
      job: ActiveFlow,
      code: BuildFlowErrorCode,
      message: string,
   ): Promise<void> {
      const cleanMessage = boundedExcerpt(message, FLOW_MESSAGE_MAX);
      for (const row of job.snapshot.stages) {
         if (row.status === "running") {
            row.status = "failure";
            row.finishedAt = new Date().toISOString();
            row.message = cleanMessage;
         } else if (row.status === "pending") {
            row.status = "skipped";
            row.message = "Đã bỏ qua vì luồng thất bại ở bước trước đó.";
         }
      }
      job.snapshot.currentStage = null;
      job.snapshot.state = "failed";
      job.snapshot.error = { code, message: cleanMessage };
      job.snapshot.finishedAt = new Date().toISOString();
      job.snapshot.pid = null;
      await this.queueJournal(job.snapshot);
   }

   /** Terminal cancellation: the running row reads cancelled, rest skipped. */
   private async cancelFlow(job: ActiveFlow): Promise<void> {
      for (const row of job.snapshot.stages) {
         if (row.status === "running") {
            row.status = "cancelled";
            row.finishedAt = new Date().toISOString();
            row.message = "Đã hủy theo yêu cầu của người dùng.";
         } else if (row.status === "pending") {
            row.status = "skipped";
            row.message = "Đã bỏ qua vì luồng bị hủy trước đó.";
         }
      }
      job.snapshot.currentStage = null;
      job.snapshot.state = "cancelled";
      job.snapshot.finishedAt = new Date().toISOString();
      job.snapshot.pid = null;
      await this.queueJournal(job.snapshot);
   }

   private async completeFlow(job: ActiveFlow): Promise<void> {
      job.snapshot.currentStage = null;
      job.snapshot.state = "completed";
      job.snapshot.finishedAt = new Date().toISOString();
      job.snapshot.pid = null;
      await this.queueJournal(job.snapshot);
   }

   /** The pre-stage cancellation gate — true when driving must stop. */
   private cancelRequestedBeforeStage(job: ActiveFlow): boolean {
      return job.cancelRequested;
   }

   /* ----------------------------- the pipeline -------------------------- */

   private async driveStages(job: ActiveFlow): Promise<void> {
      try {
         /* ---- 1 verify-source ------------------------------------------- */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "verify-source");
         let verifiedMessage: string;
         try {
            verifiedMessage = await this.runVerifySource(job);
         } catch (error) {
            if (error instanceof SourceStageError) {
               await this.failFlow(job, error.code, error.message);
               return;
            }
            throw error;
         }
         await this.completeStage(
            job,
            "verify-source",
            "success",
            verifiedMessage,
         );

         /* ---- 2 snapshot (honest pinned REUSE, never a live fetch) ------ */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "snapshot");
         const revision =
            job.identity?.providerRevisionId ?? "không rõ revision";
         await this.completeStage(
            job,
            "snapshot",
            "success",
            `Snapshot nguồn đã pin được TÁI SỬ DỤNG từ dự án build đã commit ` +
               `(không gọi Figma live); revision pin: ${revision}.`,
         );

         /* ---- 3 ai-analysis --------------------------------------------- */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "ai-analysis");
         const analysis = await this.runAiAnalysis(job);
         if (analysis.kind === "cancelled") {
            await this.cancelFlow(job);
            return;
         }
         if (analysis.kind === "failed") {
            await this.failFlow(job, analysis.code, analysis.message);
            return;
         }
         await this.completeStage(
            job,
            "ai-analysis",
            "success",
            analysis.message,
         );

         /* ---- 4 mapping (deterministic auto-handoff, NO approval click) - */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "mapping");
         const mapping = await this.runMapping(job);
         if (mapping.kind === "failed") {
            await this.failFlow(job, "internal-error", mapping.message);
            return;
         }
         await this.completeStage(job, "mapping", "success", mapping.message);

         /* ---- 5 compose (the deterministic det build child) -------------- */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "compose");
         const compose = await this.runCompose(job);
         if (compose.kind === "cancelled") {
            await this.cancelFlow(job);
            return;
         }
         if (compose.kind === "failed") {
            await this.failFlow(job, "internal-error", compose.message);
            return;
         }
         await this.completeStage(
            job,
            "compose",
            compose.gaps.length > 0 ? "warning" : "success",
            compose.gaps.length > 0 ? compose.warningMessage : compose.message,
         );

         /* ---- 6 results -------------------------------------------------- */
         if (this.cancelRequestedBeforeStage(job)) {
            await this.cancelFlow(job);
            return;
         }
         await this.beginStage(job, "results");
         const artifactNames = Object.values(BUILD_FLOW_ARTIFACT_FILES).join(
            ", ",
         );
         await this.completeStage(
            job,
            "results",
            "success",
            `Kết quả sẵn sàng: ${artifactNames}. Tải từng artifact qua ` +
               `/api/runs/${job.buildRunId ?? ""}/artifacts/<tên file>.`,
         );

         await this.completeFlow(job);
      } catch (error) {
         // Nothing above may throw; an unexpected error still lands in a
         // truthful terminal state — never a hung "running" slot.
         if (error instanceof DetRunReaderError) {
            await this.failFlow(
               job,
               "internal-error",
               `Nguồn Build không đọc được: ${error.message}`,
            );
            return;
         }
         const detail = error instanceof Error ? error.message : String(error);
         await this.failFlow(
            job,
            "internal-error",
            `Lỗi không mong đợi trong luồng Build: ${detail}`,
         );
      } finally {
         // The slot frees only after the terminal journal write has landed
         // (every transition awaited its serialized write).
         if (this.active === job) this.active = null;
      }
   }

   /* ---- stage 1: verify-source --------------------------------------- */

   /**
    * Parse the input, then bind it to the ONE catalog entry whose committed
    * `source-identity.json` verifies EXACTLY this source. Zero matches, a
    * foreign file key, a wrong node id, an unbound entry or multiple matches
    * all fail closed with `source-not-pinned` — the pipeline never guesses a
    * source.
    */
   private async runVerifySource(job: ActiveFlow): Promise<string> {
      const parsed = parseFigmaInput(job.startOpts.figmaInput);
      if (!parsed.ok) {
         // Defensive: the POST route already rejected this shape.
         throw new SourceStageError("invalid-input", parsed.message);
      }
      const target = job.startOpts.target;
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
      const listing = await catalog.list();

      interface Candidate {
         entry: BuildConfigCatalogEntry;
         identity: SourceIdentity;
         configPath: string;
      }
      const compatible: Candidate[] = [];
      for (const entry of listing.entries) {
         const configPath = await catalog
            .resolveConfigPath(entry.configId)
            .catch(() => null);
         if (configPath === null) continue;
         const identity = await readSourceIdentity(configPath);
         if (identity === null) continue;
         if (
            parsed.fileKey !== null &&
            parsed.fileKey !== identity.figmaFileKey
         ) {
            continue;
         }
         compatible.push({ entry, identity, configPath });
      }
      const matches = compatible.filter(
         (candidate) => candidate.identity.figmaRootNodeId === parsed.nodeId,
      );

      if (matches.length === 1) {
         const match = matches[0]!;
         job.snapshot.request = {
            fileKey: match.identity.figmaFileKey,
            nodeId: match.identity.figmaRootNodeId,
            baseConfigId: match.entry.configId,
            target,
         };
         job.baseConfigPath = match.configPath;
         job.identity = match.identity;
         const revision =
            match.identity.providerRevisionId ?? "không rõ revision";
         return (
            `Nguồn khớp cấu hình cơ sở đã pin "${match.entry.configId}" ` +
            `(file ${match.identity.figmaFileKey}, root ${match.identity.figmaRootNodeId}, ` +
            `revision ${revision}).`
         );
      }

      if (matches.length > 1) {
         const ids = matches.map((match) => match.entry.configId).join(", ");
         throw new SourceStageError(
            "source-not-pinned",
            `Nguồn Figma (file ${parsed.fileKey ?? "không rõ"}, node ${parsed.nodeId}) ` +
               `khớp với ${matches.length} cấu hình cơ sở cùng lúc (${ids}); ` +
               `không thể chọn đúng MỘT nguồn đã pin nên luồng Build bị chặn.`,
         );
      }

      // Zero matches. When the request aimed at exactly one verified binding
      // (same file, or a bare node id against the only bound entry), reuse
      // that helper's canonical Vietnamese mismatch message verbatim.
      if (compatible.length === 1) {
         const candidate = compatible[0]!;
         try {
            await assertRequestMatchesSourceIdentity(
               {
                  fileKey: candidate.identity.figmaFileKey,
                  nodeId: parsed.nodeId,
               },
               candidate.configPath,
               candidate.entry.configId,
            );
         } catch (error) {
            if (error instanceof AgentWorkflowError) {
               throw new SourceStageError("source-not-pinned", error.message);
            }
            throw error;
         }
      }
      throw new SourceStageError(
         "source-not-pinned",
         `Nguồn Figma (file ${parsed.fileKey ?? "không rõ"}, node ${parsed.nodeId}) ` +
            `không khớp với bất kỳ cấu hình cơ sở nào đã gắn nguồn đã xác minh trong catalog ` +
            `(${compatible.length} binding khớp file trên ${listing.entries.length} mục); ` +
            `luồng Build chỉ chạy trên đúng nguồn đã pin — không phán đoán nguồn.`,
      );
   }

   /* ---- stage 3: ai-analysis ----------------------------------------- */

   private async runAiAnalysis(
      job: ActiveFlow,
   ): Promise<
      | { kind: "success"; message: string }
      | { kind: "cancelled" }
      | { kind: "failed"; code: BuildFlowErrorCode; message: string }
   > {
      const request = job.snapshot.request;
      let started: AgentAnalysisSnapshot;
      try {
         started = await this.agentRunner.start(
            {
               fileKey: request.fileKey,
               nodeId: request.nodeId,
               baseConfigId: request.baseConfigId,
            },
            job.baseConfigPath as string,
         );
      } catch (error) {
         if (error instanceof AgentBusyError) {
            return {
               kind: "failed",
               code: "internal-error",
               message:
                  "Không thể bắt đầu phân tích AI: một phân tích khác đang chạy.",
            };
         }
         const detail = error instanceof Error ? error.message : String(error);
         return {
            kind: "failed",
            code: "internal-error",
            message: `Phân tích AI không thể bắt đầu: ${detail}`,
         };
      }
      job.analysisId = started.analysisId;
      this.stageRecord(job, "ai-analysis").analysisId = started.analysisId;
      await this.queueJournal(job.snapshot);

      for (;;) {
         // Between polls: honor cancellation by forwarding it to the child.
         if (job.cancelRequested && !job.childCancelSent) {
            job.childCancelSent = true;
            this.agentRunner.cancel(started.analysisId);
         }
         const snap = await this.agentRunner.snapshot(started.analysisId);
         if (snap === null) {
            return {
               kind: "failed",
               code: "internal-error",
               message: `Phân tích AI ${started.analysisId} không còn đọc được (snapshot null).`,
            };
         }
         if (AGENT_TERMINAL_STATES.has(snap.state)) {
            if (snap.state === "cancelled") return { kind: "cancelled" };
            if (snap.outcome === "plan-ready" && snap.grounded === true) {
               const result = await this.agentRunner.result(started.analysisId);
               if (result !== null && result.plan !== null) {
                  job.plan = result.plan;
                  return {
                     kind: "success",
                     message:
                        `Phân tích AI hoàn tất: plan đã pin sẵn sàng ` +
                        `(analysis ${started.analysisId}, grounded).`,
                  };
               }
               return {
                  kind: "failed",
                  code: "internal-error",
                  message:
                     `Phân tích AI ${started.analysisId} báo plan-ready nhưng ` +
                     `plan không đọc lại được từ bộ nhớ bền.`,
               };
            }
            // Truthful outcome token verbatim + bounded stderr excerpt.
            const outcomeToken = snap.outcome ?? snap.state;
            const stderr = boundedExcerpt(snap.stderrTail);
            return {
               kind: "failed",
               code: "internal-error",
               message:
                  `Phân tích AI không dùng được (outcome: ${outcomeToken}). ` +
                  `stderr: ${stderr === "" ? "(trống)" : stderr}`,
            };
         }
         await sleep(this.pollIntervalMs);
      }
   }

   /* ---- stage 4: mapping (deterministic auto-handoff) ----------------- */

   private async runMapping(
      job: ActiveFlow,
   ): Promise<
      { kind: "success"; message: string } | { kind: "failed"; message: string }
   > {
      const analysisId = job.analysisId as string;
      const analysisDir = path.join(this.runsRoot, ANALYSIS_DIR, analysisId);
      await mkdir(analysisDir, { recursive: true });
      try {
         const { approvedConfigPath, record } = await materializeApprovedInputs(
            {
               analysisId,
               plan: job.plan as AgentPlan,
               baseConfigPath: job.baseConfigPath as string,
               analysisDir,
            },
         );
         // The approved path is internal plumbing — never echoed; the plan
         // content hash is the safe provenance token.
         job.approvedConfigPath = approvedConfigPath;
         const hash = record.planContentHash.slice(0, 12);
         return {
            kind: "success",
            message:
               `Tự động bàn giao plan đã pin thành build inputs (không cần duyệt ` +
               `thủ công, derivedFrom ${record.derivedFrom}): ` +
               `${record.pinnedAssignments}/${record.totalProposedAssignments} đề xuất ` +
               `ghép vào cây pin, ${record.droppedNodeIds.length} đề xuất bị bỏ; ` +
               `plan hash ${hash}….`,
         };
      } catch (error) {
         if (error instanceof MaterializeError) {
            // Its code verbatim — the deterministic bridge's own vocabulary.
            return { kind: "failed", message: error.code };
         }
         throw error;
      }
   }

   /* ---- stage 5: compose ---------------------------------------------- */

   private async runCompose(job: ActiveFlow): Promise<
      | {
           kind: "success";
           message: string;
           gaps: StudioBuildGapView[];
           warningMessage: string;
        }
      | { kind: "cancelled" }
      | { kind: "failed"; message: string }
   > {
      let started: BuildJobSnapshot;
      try {
         started = await this.buildRunner.start(
            job.snapshot.request.baseConfigId,
            job.approvedConfigPath as string,
         );
      } catch (error) {
         if (error instanceof BuildBusyError) {
            return {
               kind: "failed",
               message:
                  "Không thể sinh Page Builder: một build khác đang chạy.",
            };
         }
         const detail = error instanceof Error ? error.message : String(error);
         return {
            kind: "failed",
            message: `det build không thể bắt đầu: ${detail}`,
         };
      }
      job.buildRunId = started.runId;
      this.stageRecord(job, "compose").buildRunId = started.runId;
      await this.queueJournal(job.snapshot);

      for (;;) {
         if (job.cancelRequested && !job.childCancelSent) {
            job.childCancelSent = true;
            this.buildRunner.cancel(started.runId);
         }
         const snap = await this.buildRunner.snapshot(started.runId);
         if (snap === null) {
            return {
               kind: "failed",
               message: `Build ${started.runId} không còn đọc được (snapshot null).`,
            };
         }
         if (BUILD_TERMINAL_STATES.has(snap.state)) {
            if (snap.state === "cancelled") return { kind: "cancelled" };
            if (
               snap.state === "exited" &&
               snap.exitCode === 0 &&
               snap.manifestSummary !== null
            ) {
               const gaps = snap.manifestSummary.gaps;
               const okMessage =
                  `Build hoàn tất: bundle đã xác minh (run ${started.runId}, ` +
                  `${snap.manifestSummary.outputCount} outputs).`;
               if (gaps.length > 0) {
                  const codes = gaps
                     .slice(0, 3)
                     .map((gap) => gap.code)
                     .join(", ");
                  return {
                     kind: "success",
                     gaps,
                     message: okMessage,
                     warningMessage:
                        `Build hoàn tất với ${gaps.length} gap trong mapping ` +
                        `(run ${started.runId}); ví dụ: ${codes}.`,
                  };
               }
               return {
                  kind: "success",
                  gaps: [],
                  message: okMessage,
                  warningMessage: okMessage,
               };
            }
            const exitPart =
               snap.exitCode !== null ? `, exitCode ${snap.exitCode}` : "";
            const stderr = boundedExcerpt(snap.stderrTail);
            return {
               kind: "failed",
               message:
                  `det build không thành công (state: ${snap.state}${exitPart}). ` +
                  `stderr: ${stderr === "" ? "(trống)" : stderr}`,
            };
         }
         await sleep(this.pollIntervalMs);
      }
   }
}

/* ------------------------------- revival -------------------------------- */

/**
 * Tolerant fallback for a journal that exists but cannot be trusted: an
 * honest `interrupted` snapshot — never a fake state. The request fields use
 * "unknown" (the binding is not recoverable from a broken journal); the
 * target stays the only enabled target of this milestone.
 */
function interruptedFallback(flowId: string): BuildFlowRunSnapshot {
   return {
      flowId,
      journalSchemaVersion: 1,
      state: "interrupted",
      request: {
         fileKey: "unknown",
         nodeId: "unknown",
         baseConfigId: "unknown",
         target: "magento-page-builder",
      },
      stages: freshStages(),
      currentStage: null,
      error: {
         code: "internal-error",
         message:
            "Journal của luồng Build hỏng hoặc không hợp đồng; trạng thái hiển thị là interrupted (không phán đoán trạng thái thật).",
      },
      startedAt: null,
      finishedAt: null,
      pid: null,
   };
}

/* ------------------------------- factory -------------------------------- */

const globalForOrchestrator = globalThis as {
   __detStudioBuildFlowOrchestrator?: Promise<BuildFlowOrchestrator>;
};

/**
 * The ONE process-wide flow orchestrator (single flow slot stays honest
 * across Next route-module reloads).
 */
export async function getBuildFlowOrchestrator(): Promise<BuildFlowOrchestrator> {
   if (globalForOrchestrator.__detStudioBuildFlowOrchestrator === undefined) {
      globalForOrchestrator.__detStudioBuildFlowOrchestrator = (async () => {
         const configuredRoot = process.env.STUDIO_DET_RUNS_DIR;
         if (configuredRoot === undefined || configuredRoot.trim() === "") {
            throw new BuildFlowApiError(
               "environment-not-ready",
               "The one-click Build flow requires STUDIO_DET_RUNS_DIR (the flow journals there).",
            );
         }
         return BuildFlowOrchestrator.open({ runsRoot: configuredRoot });
      })().catch((error) => {
         globalForOrchestrator.__detStudioBuildFlowOrchestrator = undefined;
         throw error;
      });
   }
   return globalForOrchestrator.__detStudioBuildFlowOrchestrator;
}
