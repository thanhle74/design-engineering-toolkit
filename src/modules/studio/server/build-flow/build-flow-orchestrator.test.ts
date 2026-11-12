/**
 * [70] Build-flow orchestrator tests — the ONE-CLICK pipeline driven with
 * INJECTED fakes (agent runner, build runner, environment guard) over a tmp
 * runs root and a tmp build-config catalog. NO real `claude`, Figma MCP or
 * `det` child process runs here: the agent/build runners are fakes behind the
 * orchestrator's port seam; the mapping stage exercises the REAL deterministic
 * materializer against a copy of the committed real-derived base project
 * (offline, same discipline as plan-materializer.test.ts). The source-matching
 * stage exercises the real catalog + real source-identity reading, including
 * the configured-root-shadows-repository rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
   BUILD_FLOW_STAGES,
   BuildFlowRunSnapshotSchema,
   type AgentAnalysisSnapshot,
   type AgentPlan,
   type BuildFlowRunSnapshot,
} from "@/src/modules/studio/shared/contracts";
import { VALID_AGENT_PLAN } from "@/src/modules/studio/shared/contracts/agent-plan.test";

import { REPO_ROOT } from "../test-helpers/det-cli";
import { BuildBusyError, type BuildJobSnapshot } from "../build-runner";
import { AgentBusyError } from "../claude-agent/analysis-runner";
import {
   BuildFlowOrchestrator,
   getBuildFlowOrchestrator,
   type BuildFlowAgentRunnerPort,
   type BuildFlowBuildRunnerPort,
} from "./build-flow-orchestrator";
import { BuildFlowBusyError } from "./build-flow-errors";

const REAL_DERIVED_DIR = path.join(
   REPO_ROOT,
   "resources",
   "examples",
   "build",
   "slaunchpad-home-real-derived",
);

const PINNED_FILE_KEY = "vNPtfBRpYM3PsExirVqhmt";
const PINNED_ROOT_NODE = "245:2";
const PINNED_REVISION = "2417494580183108397";
const CONFIG_ID = "slaunchpad-home-real-derived";

const FLOW_TERMINAL = new Set([
   "completed",
   "failed",
   "cancelled",
   "interrupted",
]);
const STAGE_INDEX: Record<string, number> = Object.fromEntries(
   BUILD_FLOW_STAGES.map((stage, index) => [stage, index]),
);

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------ fixtures ------------------------------- */

interface Fixture {
   workRoot: string;
   runsRoot: string;
   projectsRoot: string;
}

let fixture: Fixture | null = null;

/** tmp runs root + configured catalog root carrying the real-derived project. */
async function makeFixture(): Promise<Fixture> {
   const workRoot = await mkdtemp(path.join(os.tmpdir(), "det70-flow-"));
   const runsRoot = path.join(workRoot, "runs");
   const projectsRoot = path.join(workRoot, "projects");
   await mkdir(runsRoot, { recursive: true });
   await mkdir(projectsRoot, { recursive: true });
   await cp(REAL_DERIVED_DIR, path.join(projectsRoot, CONFIG_ID), {
      recursive: true,
   });
   return { workRoot, runsRoot, projectsRoot };
}

beforeEach(async () => {
   fixture = await makeFixture();
   // The orchestrator's verify-source reads the catalog through the same env
   // contract as the routes: the configured root (tmp fixture) FIRST, the
   // canonical repository catalogue second.
   process.env.STUDIO_BUILD_PROJECTS_DIR = fixture.projectsRoot;
});

afterEach(async () => {
   delete process.env.STUDIO_BUILD_PROJECTS_DIR;
   if (fixture !== null)
      await rm(fixture.workRoot, { recursive: true, force: true });
   fixture = null;
});

function requireFixture(): Fixture {
   if (fixture === null) throw new Error("fixture not initialised");
   return fixture;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
   await mkdir(path.dirname(filePath), { recursive: true });
   await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Rewrite the copied project's identity to a foreign file key (same root). */
async function rewriteIdentity(
   projectsRoot: string,
   entryId: string,
   fileKey: string,
): Promise<void> {
   const identityPath = path.join(
      projectsRoot,
      entryId,
      "source-identity.json",
   );
   const raw = JSON.parse(await readFile(identityPath, "utf8")) as Record<
      string,
      unknown
   >;
   raw.figmaFileKey = fileKey;
   await writeJson(identityPath, raw);
}

function designUrl(fileKey: string, nodeId: string): string {
   return `https://www.figma.com/design/${fileKey}/Home?node-id=${nodeId.replace(":", "-")}`;
}

/* --------------------------- fake agent runner -------------------------- */

interface FakeAgentScript {
   /** Terminal outcome applied at the first post-start poll (unless held). */
   outcome?: AgentAnalysisSnapshot["outcome"];
   grounded?: boolean | null;
   plan?: AgentPlan | null;
   stderrTail?: string;
   /** start() throws AgentBusyError (another analysis holds the slot). */
   busyStart?: boolean;
   /** Snapshot stays running until release() (manual gate). */
   holdUntilRelease?: boolean;
   /** Snapshot stays running until cancel() flips it to cancelled. */
   holdUntilCancel?: boolean;
}

function makeFakeAgent(
   script: FakeAgentScript = {},
): BuildFlowAgentRunnerPort & {
   release: () => void;
   cancelCalls: () => number;
   lastStarted: () => {
      request: { fileKey: string; nodeId: string; baseConfigId: string };
      baseConfigPath: string;
   } | null;
} {
   let active: AgentAnalysisSnapshot | null = null;
   let counter = 0;
   let cancelled = false;
   let released = script.holdUntilRelease !== true;
   let cancelCallCount = 0;
   let lastStarted: {
      request: { fileKey: string; nodeId: string; baseConfigId: string };
      baseConfigPath: string;
   } | null = null;

   const applyTerminal = (): void => {
      if (active === null || active.state !== "running") return;
      active.state = "exited";
      active.exitCode = 0;
      active.finishedAt = new Date().toISOString();
      active.outcome = script.outcome ?? null;
      active.grounded = script.grounded ?? null;
      active.stderrTail = script.stderrTail ?? "";
   };

   return {
      release: () => {
         released = true;
      },
      cancelCalls: () => cancelCallCount,
      lastStarted: () => lastStarted,
      async start(request, baseConfigPath) {
         lastStarted = { request, baseConfigPath };
         if (script.busyStart) {
            throw new AgentBusyError({
               analysisId: "agent-999999",
               state: "running",
               request: { fileKey: "f", nodeId: "1:1", baseConfigId: "b" },
               baseConfigPath: null,
               allowedFigmaTool: "",
               claudeVersion: null,
               command: [],
               exitCode: null,
               signal: null,
               timedOut: false,
               cancelled: false,
               startedAt: new Date().toISOString(),
               finishedAt: null,
               pid: 424242,
               stdoutTail: "",
               stderrTail: "",
               spawnError: null,
               outcome: null,
               envelopeSafe: null,
               grounded: null,
            });
         }
         counter += 1;
         active = {
            analysisId: `agent-77000${counter}`,
            state: "running",
            request,
            baseConfigPath,
            allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
            claudeVersion: "2.1.322",
            command: ["claude"],
            exitCode: null,
            signal: null,
            timedOut: false,
            cancelled: false,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            pid: 424242,
            stdoutTail: "",
            stderrTail: "",
            spawnError: null,
            outcome: null,
            envelopeSafe: null,
            grounded: null,
         };
         return { ...active };
      },
      async snapshot(analysisId) {
         if (active === null || active.analysisId !== analysisId) return null;
         if (script.holdUntilCancel) {
            if (cancelled && active.state === "running") {
               active.state = "cancelled";
               active.cancelled = true;
               active.finishedAt = new Date().toISOString();
            }
         } else if (released) {
            applyTerminal();
         }
         return { ...active };
      },
      async result(analysisId) {
         if (active === null || active.analysisId !== analysisId) return null;
         return { snapshot: { ...active }, plan: script.plan ?? null };
      },
      cancel(analysisId) {
         if (active === null || active.analysisId !== analysisId) return null;
         cancelCallCount += 1;
         cancelled = true;
         active.cancelled = true;
         active.state = "cancelled";
         active.finishedAt = new Date().toISOString();
         return { ...active };
      },
   };
}

/* --------------------------- fake build runner -------------------------- */

interface FakeBuildScript {
   state?: string; // terminal BuildJobState to land at first poll
   exitCode?: number;
   gaps?: { code: string; message: string }[];
   stderrTail?: string;
   /** start() throws BuildBusyError. */
   busyStart?: boolean;
}

function makeFakeBuild(
   script: FakeBuildScript = {},
): BuildFlowBuildRunnerPort & {
   starts: () => { configId: string; configPath: string }[];
} {
   const starts: { configId: string; configPath: string }[] = [];
   let current: BuildJobSnapshot | null = null;
   let counter = 0;

   return {
      starts: () => starts,
      async start(configId, configPath) {
         if (script.busyStart) {
            throw new BuildBusyError({
               runId: "build-999999",
               configId,
               state: "running",
               cancelled: false,
               exitCode: null,
               signal: null,
               timedOut: false,
               startedAt: new Date().toISOString(),
               finishedAt: null,
               command: ["node", "det.js"],
               stdoutTail: "",
               stderrTail: "",
               manifestSummary: null,
               spawnError: null,
               pid: 424242,
            });
         }
         starts.push({ configId, configPath });
         counter += 1;
         current = {
            runId: `build-77000${counter}`,
            configId,
            state: "running",
            cancelled: false,
            exitCode: null,
            signal: null,
            timedOut: false,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            command: ["node", "det.js"],
            stdoutTail: "",
            stderrTail: "",
            manifestSummary: null,
            spawnError: null,
            pid: 424242,
         };
         return { ...current };
      },
      async snapshot(runId) {
         if (current === null || current.runId !== runId) return null;
         if (current.state === "running") {
            const state = script.state ?? "exited";
            const exitCode = script.exitCode ?? 0;
            current.state = state as BuildJobSnapshot["state"];
            current.exitCode = state === "exited" ? exitCode : null;
            current.finishedAt = new Date().toISOString();
            current.stderrTail = script.stderrTail ?? "";
            if (state === "exited" && current.exitCode === 0) {
               current.manifestSummary = {
                  profileId: "slaunchpad-fashion",
                  platformId: "magento-page-builder",
                  sourceId: "figma-home-desktop",
                  revisionId: PINNED_REVISION,
                  stages: [],
                  gaps: script.gaps ?? [],
                  outputCount: 5,
               };
            }
         }
         return { ...current };
      },
      cancel(runId) {
         if (current === null || current.runId !== runId) return null;
         current.cancelled = true;
         current.state = "cancelled";
         current.finishedAt = new Date().toISOString();
         return { ...current };
      },
   };
}

/* ------------------------------ plumbing -------------------------------- */

const NOOP_GUARD = async (): Promise<void> => {};

async function openOrch(
   fakes: {
      agent?: ReturnType<typeof makeFakeAgent>;
      build?: ReturnType<typeof makeFakeBuild>;
   } = {},
   runsRoot = requireFixture().runsRoot,
): Promise<ReturnType<typeof BuildFlowOrchestrator.open>> {
   return BuildFlowOrchestrator.open({
      runsRoot,
      agentRunner: fakes.agent ?? makeFakeAgent(),
      buildRunner: fakes.build ?? makeFakeBuild(),
      guard: NOOP_GUARD,
      pollIntervalMs: 5,
   });
}

async function awaitFlowTerminal(
   orch: Awaited<ReturnType<typeof BuildFlowOrchestrator.open>>,
   flowId: string,
   timeoutMs = 15_000,
): Promise<BuildFlowRunSnapshot> {
   const deadline = Date.now() + timeoutMs;
   for (;;) {
      const snap = await orch.snapshot(flowId);
      expect(snap).not.toBeNull();
      if (FLOW_TERMINAL.has(snap!.state)) return snap!;
      if (Date.now() > deadline) {
         throw new Error(
            `flow ${flowId} did not reach a terminal state in time`,
         );
      }
      await sleep(10);
   }
}

function seededSnapshot(
   flowId: string,
   overrides: Partial<BuildFlowRunSnapshot> = {},
): BuildFlowRunSnapshot {
   return {
      flowId,
      journalSchemaVersion: 1,
      state: "running",
      request: {
         fileKey: PINNED_FILE_KEY,
         nodeId: PINNED_ROOT_NODE,
         baseConfigId: CONFIG_ID,
         target: "magento-page-builder",
      },
      stages: BUILD_FLOW_STAGES.map((stage) => ({
         stage,
         status: "pending",
         startedAt: null,
         finishedAt: null,
         analysisId: null,
         buildRunId: null,
         message: null,
      })),
      currentStage: "ai-analysis",
      error: null,
      startedAt: "2026-11-12T00:00:00.000Z",
      finishedAt: null,
      pid: 424242,
      ...overrides,
   };
}

/* ------------------------------- tests ---------------------------------- */

describe("happy path — all six stages to completed", () => {
   it("drives every stage with truthful records, ids and per-transition journals", async () => {
      const fx = requireFixture();
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
         holdUntilRelease: true,
      });
      const build = makeFakeBuild({});
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      expect(started.flowId).toMatch(/^flow-\d+$/);
      expect(["queued", "running"]).toContain(started.state);

      // While the agent is held: the LIVE snapshot shows stage 3 running and
      // a SECOND orchestrator reads the same mid-flow truth from the JOURNAL
      // (proving a journal write per transition, not just a final one).
      const midDeadline = Date.now() + 5_000;
      let mid: BuildFlowRunSnapshot | null = null;
      for (;;) {
         const live = await orch.snapshot(started.flowId);
         if (live !== null && live.currentStage === "ai-analysis") {
            const orch2 = await BuildFlowOrchestrator.open({
               runsRoot: fx.runsRoot,
               agentRunner: agent,
               buildRunner: build,
               guard: NOOP_GUARD,
               pollIntervalMs: 5,
            });
            const journaled = await orch2.snapshot(started.flowId);
            if (
               journaled !== null &&
               journaled.state === "running" &&
               journaled.currentStage === "ai-analysis" &&
               journaled.stages[STAGE_INDEX["ai-analysis"]!]!.analysisId !==
                  null
            ) {
               mid = journaled;
               break;
            }
         }
         if (Date.now() > midDeadline) {
            throw new Error("flow never reached the held ai-analysis stage");
         }
         await sleep(5);
      }
      expect(mid!.stages[STAGE_INDEX["ai-analysis"]!]!.analysisId).toMatch(
         /^agent-\d+$/,
      );
      expect(mid!.pid).toBe(process.pid);

      agent.release();
      const final = await awaitFlowTerminal(orch, started.flowId);

      expect(final.state).toBe("completed");
      expect(final.error).toBeNull();
      // The request was rewritten to the VERIFIED binding, not the raw input.
      expect(final.request).toEqual({
         fileKey: PINNED_FILE_KEY,
         nodeId: PINNED_ROOT_NODE,
         baseConfigId: CONFIG_ID,
         target: "magento-page-builder",
      });
      expect(final.stages.map((row) => row.stage)).toEqual([
         ...BUILD_FLOW_STAGES,
      ]);
      expect(final.stages.map((row) => row.status)).toEqual([
         "success",
         "success",
         "success",
         "success",
         "success",
         "success",
      ]);
      for (const row of final.stages) {
         expect(row.startedAt).not.toBeNull();
         expect(row.finishedAt).not.toBeNull();
      }
      // verify-source names the config + pinned revision
      expect(final.stages[STAGE_INDEX["verify-source"]!]!.message).toContain(
         CONFIG_ID,
      );
      expect(final.stages[STAGE_INDEX["verify-source"]!]!.message).toContain(
         PINNED_REVISION,
      );
      // snapshot stage is HONEST: pinned reuse, no live fetch claim
      expect(final.stages[STAGE_INDEX.snapshot!]!.message).toContain(
         "TÁI SỬ DỤNG",
      );
      expect(final.stages[STAGE_INDEX.snapshot!]!.message).toContain(
         PINNED_REVISION,
      );
      // ai-analysis + compose carry the child ids
      expect(final.stages[STAGE_INDEX["ai-analysis"]!]!.analysisId).toMatch(
         /^agent-\d+$/,
      );
      expect(final.stages[STAGE_INDEX.compose!]!.buildRunId).toMatch(
         /^build-\d+$/,
      );
      // results lists the frozen artifact names
      expect(final.stages[STAGE_INDEX.results!]!.message).toContain(
         "install-homepage.php",
      );
      expect(final.stages[STAGE_INDEX.results!]!.message).toContain(
         "pagebuilder-content.html",
      );
      expect(final.stages[STAGE_INDEX.results!]!.message).toContain(
         "/api/runs/",
      );
      // compose consumed the APPROVED copy, never the raw base config
      expect(build.starts()).toHaveLength(1);
      expect(build.starts()[0]!.configId).toBe(CONFIG_ID);
      expect(build.starts()[0]!.configPath).toContain(
         path.join(
            ".agent-analyses",
            final.stages[STAGE_INDEX["ai-analysis"]!]!.analysisId!,
            "approved",
         ),
      );
      expect(final.finishedAt).not.toBeNull();
      expect(final.pid).toBeNull();
      // slot released; post-terminal reads come from the journal
      expect(orch.activeSnapshot()).toBeNull();
      const reread = await orch.snapshot(started.flowId);
      expect(reread!.state).toBe("completed");
      // the persisted journal is contract-valid
      const raw = JSON.parse(
         await readFile(
            path.join(
               fx.runsRoot,
               ".build-flow-jobs",
               `${started.flowId}.json`,
            ),
            "utf8",
         ),
      ) as unknown;
      expect(BuildFlowRunSnapshotSchema.parse(raw).state).toBe("completed");
   });

   it("binds a bare node id to the one verified catalog entry", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const build = makeFakeBuild({});
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: PINNED_ROOT_NODE,
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);
      expect(final.state).toBe("completed");
      expect(final.request.baseConfigId).toBe(CONFIG_ID);
      expect(final.request.fileKey).toBe(PINNED_FILE_KEY);
      expect(final.stages[STAGE_INDEX["verify-source"]!]!.status).toBe(
         "success",
      );
   });
});

describe("ai-analysis failures — truthful outcome tokens", () => {
   it("fails at stage 3 with the verbatim plan-ungrounded token and a bounded stderr excerpt", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ungrounded",
         grounded: false,
         stderrTail: "agent reported no figma data observed",
      });
      const build = makeFakeBuild({});
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);

      expect(final.state).toBe("failed");
      expect(final.error).not.toBeNull();
      expect(final.error!.code).toBe("internal-error");
      expect(final.error!.message).toContain("plan-ungrounded");
      expect(final.error!.message).toContain("no figma data observed");
      expect(final.stages[STAGE_INDEX["ai-analysis"]!]!.status).toBe("failure");
      expect(final.stages[STAGE_INDEX["ai-analysis"]!]!.analysisId).toMatch(
         /^agent-\d+$/,
      );
      // later stages never ran
      expect(final.stages[STAGE_INDEX.mapping!]!.status).toBe("skipped");
      expect(final.stages[STAGE_INDEX.compose!]!.status).toBe("skipped");
      expect(final.stages[STAGE_INDEX.results!]!.status).toBe("skipped");
      expect(build.starts()).toHaveLength(0);
   });

   it("surfaces the schema-failed outcome token verbatim", async () => {
      const agent = makeFakeAgent({
         outcome: "schema-failed",
         grounded: null,
      });
      const orch = await openOrch({ agent });
      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);
      expect(final.state).toBe("failed");
      expect(final.error!.message).toContain("schema-failed");
   });

   it("fails honestly when another analysis already holds the agent slot", async () => {
      const agent = makeFakeAgent({ busyStart: true });
      const orch = await openOrch({ agent });
      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);
      expect(final.state).toBe("failed");
      expect(final.error!.message).toContain("một phân tích khác đang chạy");
      expect(final.stages[STAGE_INDEX["ai-analysis"]!]!.status).toBe("failure");
      expect(final.stages[STAGE_INDEX.mapping!]!.status).toBe("skipped");
   });
});

describe("compose stage — truthful build outcomes", () => {
   it("fails the flow on a nonzero det build exit", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const build = makeFakeBuild({
         state: "exited",
         exitCode: 2,
         stderrTail: "INPUT_SCHEMA_INVALID: profile missing",
      });
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);

      expect(final.state).toBe("failed");
      expect(final.error!.code).toBe("internal-error");
      expect(final.error!.message).toContain("state: exited");
      expect(final.error!.message).toContain("exitCode 2");
      expect(final.stages[STAGE_INDEX.compose!]!.status).toBe("failure");
      expect(final.stages[STAGE_INDEX.compose!]!.buildRunId).toMatch(
         /^build-\d+$/,
      );
      expect(final.stages[STAGE_INDEX.results!]!.status).toBe("skipped");
   });

   it("completes with a warning stage when the verified build carries mapping gaps", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const build = makeFakeBuild({
         gaps: [
            { code: "GAP_UNMAPPED_TEXT", message: "text node without a role" },
            { code: "GAP_UNKNOWN_CAPABILITY", message: "no capability match" },
         ],
      });
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const final = await awaitFlowTerminal(orch, started.flowId);

      expect(final.state).toBe("completed");
      expect(final.error).toBeNull();
      expect(final.stages[STAGE_INDEX.compose!]!.status).toBe("warning");
      expect(final.stages[STAGE_INDEX.compose!]!.message).toContain("2 gap");
      expect(final.stages[STAGE_INDEX.compose!]!.message).toContain(
         "GAP_UNMAPPED_TEXT",
      );
      expect(final.stages[STAGE_INDEX.results!]!.status).toBe("success");
   });
});

describe("one slot + cancellation", () => {
   it("answers a second start with BuildFlowBusyError carrying the active flow", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
         holdUntilRelease: true,
      });
      const orch = await openOrch({ agent });
      const first = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });
      const busy = await orch
         .start({
            figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
            target: "magento-page-builder",
         })
         .catch((error) => error);
      expect(busy).toBeInstanceOf(BuildFlowBusyError);
      expect((busy as BuildFlowBusyError).active.flowId).toBe(first.flowId);
      // cleanup: release the held flow
      await orch.cancel(first.flowId);
      const final = await awaitFlowTerminal(orch, first.flowId);
      expect(final.state).toBe("cancelled");
   });

   it("cancels during ai-analysis: the analysis is cancelled, remaining stages read skipped", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
         holdUntilCancel: true,
      });
      const build = makeFakeBuild({});
      const orch = await openOrch({ agent, build });

      const started = await orch.start({
         figmaInput: designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
         target: "magento-page-builder",
      });

      // wait until the flow is inside ai-analysis, then cancel
      const deadline = Date.now() + 5_000;
      for (;;) {
         const live = await orch.snapshot(started.flowId);
         if (live !== null && live.currentStage === "ai-analysis") break;
         if (Date.now() > deadline) {
            throw new Error("flow never reached ai-analysis");
         }
         await sleep(5);
      }
      const outcome = await orch.cancel(started.flowId);
      expect(outcome.kind).toBe("cancelled");

      const final = await awaitFlowTerminal(orch, started.flowId);
      expect(final.state).toBe("cancelled");
      expect(final.error).toBeNull();
      expect(final.stages[STAGE_INDEX["verify-source"]!]!.status).toBe(
         "success",
      );
      expect(final.stages[STAGE_INDEX.snapshot!]!.status).toBe("success");
      expect(final.stages[STAGE_INDEX["ai-analysis"]!]!.status).toBe(
         "cancelled",
      );
      // everything queued after the cancel point reads skipped — never success
      expect(final.stages[STAGE_INDEX.mapping!]!.status).toBe("skipped");
      expect(final.stages[STAGE_INDEX.compose!]!.status).toBe("skipped");
      expect(final.stages[STAGE_INDEX.results!]!.status).toBe("skipped");
      expect(final.finishedAt).not.toBeNull();
      expect(final.pid).toBeNull();
      // the cancellation was forwarded to the child analysis
      expect(agent.cancelCalls()).toBe(1);
      expect(build.starts()).toHaveLength(0);
      // an already-terminal flow is no longer cancellable
      const late = await orch.cancel(started.flowId);
      expect(late.kind).toBe("not-cancellable");
   });
});

describe("journal revival — restart truth, never fake states", () => {
   it("reads a stale running journal as interrupted when its pid is dead", async () => {
      const fx = requireFixture();
      const dead = spawn(process.execPath, ["-e", ""]);
      await new Promise<void>((resolve) => dead.on("close", () => resolve()));
      await writeJson(
         path.join(fx.runsRoot, ".build-flow-jobs", "flow-700001.json"),
         seededSnapshot("flow-700001", { pid: dead.pid }),
      );
      const orch = await openOrch({}, fx.runsRoot);
      const snap = await orch.snapshot("flow-700001");
      expect(snap).not.toBeNull();
      expect(snap!.state).toBe("interrupted");
   });

   it("reads a corrupt or contract-invalid journal as interrupted (never a fake state)", async () => {
      const fx = requireFixture();
      const journalDir = path.join(fx.runsRoot, ".build-flow-jobs");
      await mkdir(journalDir, { recursive: true });
      await writeFile(
         path.join(journalDir, "flow-700002.json"),
         "{not json at all",
         "utf8",
      );
      await writeFile(
         path.join(journalDir, "flow-700003.json"),
         JSON.stringify({ hello: "world", not: "a flow" }),
         "utf8",
      );
      const orch = await openOrch({}, fx.runsRoot);

      const corrupt = await orch.snapshot("flow-700002");
      expect(corrupt).not.toBeNull();
      expect(corrupt!.state).toBe("interrupted");
      expect(corrupt!.error!.code).toBe("internal-error");

      const invalid = await orch.snapshot("flow-700003");
      expect(invalid).not.toBeNull();
      expect(invalid!.state).toBe("interrupted");
      // both are contract-valid snapshots for the transport shape
      expect(() => BuildFlowRunSnapshotSchema.parse(corrupt)).not.toThrow();
      expect(() => BuildFlowRunSnapshotSchema.parse(invalid)).not.toThrow();

      expect(await orch.snapshot("flow-404000")).toBeNull();
      expect(await orch.snapshot("definitely-not-a-flow-id")).toBeNull();
   });
});

describe("verify-source — fail-closed source pinning", () => {
   async function startAndAwait(
      orch: Awaited<ReturnType<typeof BuildFlowOrchestrator.open>>,
      figmaInput: string,
   ): Promise<BuildFlowRunSnapshot> {
      const started = await orch.start({
         figmaInput,
         target: "magento-page-builder",
      });
      return awaitFlowTerminal(orch, started.flowId);
   }

   it("fails source-not-pinned for a wrong node id on the RIGHT file (canonical mismatch message)", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const orch = await openOrch({ agent });
      const final = await startAndAwait(
         orch,
         designUrl(PINNED_FILE_KEY, "999:9"),
      );
      expect(final.state).toBe("failed");
      expect(final.error!.code).toBe("source-not-pinned");
      expect(final.error!.message).toContain("không khớp");
      expect(final.error!.message).toContain(CONFIG_ID);
      expect(final.stages[STAGE_INDEX["verify-source"]!]!.status).toBe(
         "failure",
      );
      expect(final.stages[STAGE_INDEX.snapshot!]!.status).toBe("skipped");
      // nothing was paid
      expect(agent.lastStarted()).toBeNull();
   });

   it("fails source-not-pinned for a foreign file key whose node id overlaps", async () => {
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const orch = await openOrch({ agent });
      const final = await startAndAwait(
         orch,
         designUrl("OtherFileKey1", PINNED_ROOT_NODE),
      );
      expect(final.state).toBe("failed");
      expect(final.error!.code).toBe("source-not-pinned");
      expect(final.error!.message).toContain("OtherFileKey1");
      expect(agent.lastStarted()).toBeNull();
   });

   it("fails closed when the aimed-at entry has no source identity (shadowed id)", async () => {
      const fx = requireFixture();
      // Replace the configured copy's identity: the configured root claims the
      // id first, so the repository binding can NEVER leak back in.
      const entryDir = path.join(fx.projectsRoot, CONFIG_ID);
      await rm(path.join(entryDir, "source-identity.json"));
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const orch = await openOrch({ agent });
      const final = await startAndAwait(
         orch,
         designUrl(PINNED_FILE_KEY, PINNED_ROOT_NODE),
      );
      expect(final.state).toBe("failed");
      expect(final.error!.code).toBe("source-not-pinned");
      expect(final.error!.message).toContain("đã pin");
      expect(agent.lastStarted()).toBeNull();
   });

   it("fails source-not-pinned when two entries verify to the same source", async () => {
      const fx = requireFixture();
      await cp(
         path.join(fx.projectsRoot, CONFIG_ID),
         path.join(fx.projectsRoot, "alpha-derived"),
         { recursive: true },
      );
      await cp(
         path.join(fx.projectsRoot, CONFIG_ID),
         path.join(fx.projectsRoot, "beta-derived"),
         { recursive: true },
      );
      // Give BOTH configured copies a foreign file key so the repository
      // entry (real key) can never join the match set.
      await rewriteIdentity(
         fx.projectsRoot,
         "alpha-derived",
         "FixtureFileKey1",
      );
      await rewriteIdentity(fx.projectsRoot, "beta-derived", "FixtureFileKey1");
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const orch = await openOrch({ agent });
      const final = await startAndAwait(
         orch,
         designUrl("FixtureFileKey1", PINNED_ROOT_NODE),
      );
      expect(final.state).toBe("failed");
      expect(final.error!.code).toBe("source-not-pinned");
      expect(final.error!.message).toContain("2 cấu hình cơ sở");
      expect(final.error!.message).toContain("alpha-derived");
      expect(final.error!.message).toContain("beta-derived");
      expect(agent.lastStarted()).toBeNull();
   });

   it("fails source-not-pinned when nothing in the catalog verifies at all", async () => {
      const fx = requireFixture();
      // empty configured root: no entry can verify the requested source
      const emptyProjects = path.join(fx.workRoot, "empty-projects");
      await mkdir(emptyProjects, { recursive: true });
      const agent = makeFakeAgent({
         outcome: "plan-ready",
         grounded: true,
         plan: VALID_AGENT_PLAN,
      });
      const orch = await BuildFlowOrchestrator.open({
         runsRoot: fx.runsRoot,
         agentRunner: agent,
         buildRunner: makeFakeBuild({}),
         guard: NOOP_GUARD,
         pollIntervalMs: 5,
      });
      process.env.STUDIO_BUILD_PROJECTS_DIR = emptyProjects;
      try {
         const final = await startAndAwait(
            orch,
            designUrl("NoSuchFile1", "1:1"),
         );
         expect(final.state).toBe("failed");
         expect(final.error!.code).toBe("source-not-pinned");
         expect(final.error!.message).toContain("NoSuchFile1");
         expect(final.stages[STAGE_INDEX["verify-source"]!]!.status).toBe(
            "failure",
         );
         expect(agent.lastStarted()).toBeNull();
      } finally {
         process.env.STUDIO_BUILD_PROJECTS_DIR = fx.projectsRoot;
      }
   });
});

describe("factory — getBuildFlowOrchestrator", () => {
   it("names STUDIO_DET_RUNS_DIR (never its value) when unconfigured", async () => {
      const saved = process.env.STUDIO_DET_RUNS_DIR;
      const globalSlot = globalThis as {
         __detStudioBuildFlowOrchestrator?: unknown;
      };
      try {
         delete process.env.STUDIO_DET_RUNS_DIR;
         globalSlot.__detStudioBuildFlowOrchestrator = undefined;
         await expect(getBuildFlowOrchestrator()).rejects.toThrow(
            /STUDIO_DET_RUNS_DIR/,
         );
         process.env.STUDIO_DET_RUNS_DIR = "/definitely/missing/runs-70f3a";
         globalSlot.__detStudioBuildFlowOrchestrator = undefined;
         const error = await getBuildFlowOrchestrator().catch((e) => e);
         expect(error).toBeInstanceOf(Error);
         expect(error.message).not.toContain("/definitely/missing/runs-70f3a");
      } finally {
         if (saved === undefined) delete process.env.STUDIO_DET_RUNS_DIR;
         else process.env.STUDIO_DET_RUNS_DIR = saved;
         globalSlot.__detStudioBuildFlowOrchestrator = undefined;
      }
   });
});
