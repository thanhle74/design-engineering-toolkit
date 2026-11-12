/**
 * [65] GET /api/agent/analyses/[analysisId] route tests — the real runner
 * global reads a SEEDED terminal journal + persisted plan (deterministic
 * fixture files, no live claude). The approval preview is computed against a
 * copy of the REAL committed base project, exactly as production does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";
import { REPO_ROOT } from "@/src/modules/studio/server/test-helpers/det-cli";
import { VALID_AGENT_PLAN } from "@/src/modules/studio/shared/contracts/agent-plan.test";

import { GET } from "./route";

const REAL_DERIVED_DIR = path.join(
   REPO_ROOT,
   "resources",
   "examples",
   "build",
   "slaunchpad-home-real-derived",
);

let runsRoot: string;
let baseConfigPath: string;
const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];

function resetRunnerGlobals(): void {
   const g = globalThis as {
      __detStudioAgentRunner?: unknown;
      __detStudioBuildRunner?: unknown;
   };
   g.__detStudioAgentRunner = undefined;
   g.__detStudioBuildRunner = undefined;
}

const REQUEST = {
   fileKey: "vNPtfBRpYM3PsExirVqhmt",
   nodeId: "245:2",
   baseConfigId: "slaunchpad-home-real-derived",
};

async function seedTerminalAnalysis(
   analysisId: string,
   overrides: {
      grounded?: boolean;
      outcome?: string | null;
      withPlan?: boolean;
      baseConfigPath?: string | null;
   } = {},
): Promise<void> {
   const outcome =
      overrides.outcome !== undefined ? overrides.outcome : "plan-ready";
   const grounded = overrides.grounded ?? true;
   const withPlan = overrides.withPlan ?? true;
   const journalDir = path.join(runsRoot, ".agent-jobs");
   const analysisDir = path.join(runsRoot, ".agent-analyses", analysisId);
   await mkdir(journalDir, { recursive: true });
   await mkdir(analysisDir, { recursive: true });
   await writeFile(
      path.join(journalDir, `${analysisId}.json`),
      JSON.stringify({
         journalSchemaVersion: 1,
         analysisId,
         state: "exited",
         request: REQUEST,
         pid: null,
         baseConfigPath:
            overrides.baseConfigPath !== undefined
               ? overrides.baseConfigPath
               : baseConfigPath,
         allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
         claudeVersion: "2.1.322",
         command: ["claude"],
         exitCode: 0,
         signal: null,
         timedOut: false,
         cancelled: false,
         startedAt: "2026-11-11T00:00:00.000Z",
         finishedAt: "2026-11-11T00:00:30.000Z",
         stdoutTail: "",
         stderrTail: "",
         spawnError: null,
         outcome,
         envelopeSafe: {
            isError: false,
            subtype: "success",
            sessionId: "seed",
            numTurns: 2,
            durationMs: 1000,
            costUsd: 0.1,
            permissionDenialCount: 0,
            hasStructuredOutput: withPlan,
         },
         grounded,
      }),
      "utf8",
   );
   if (withPlan) {
      const plan =
         grounded === false
            ? {
                 ...VALID_AGENT_PLAN,
                 observed: {
                    grounded: false,
                    rootName: null,
                    childCount: null,
                    revisionId: null,
                 },
                 sections: [],
                 limitations: ["tool denied"],
              }
            : VALID_AGENT_PLAN;
      await writeFile(
         path.join(analysisDir, "agent-plan.json"),
         JSON.stringify(plan),
         "utf8",
      );
   }
}

function get(analysisId: string): Promise<Response> {
   return GET(
      new Request(`http://localhost/api/agent/analyses/${analysisId}`),
      {
         params: Promise.resolve({ analysisId }),
      },
   );
}

beforeEach(async () => {
   resetRunnerGlobals();
   runsRoot = await mkdtemp(path.join(os.tmpdir(), "det65-get-"));
   process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
   const baseDir = path.join(runsRoot, "base-project");
   await cp(REAL_DERIVED_DIR, baseDir, { recursive: true });
   baseConfigPath = path.join(baseDir, "build-config.json");
});

afterEach(async () => {
   resetRunnerGlobals();
   await rm(runsRoot, { recursive: true, force: true });
   if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
});

describe("GET /api/agent/analyses/[analysisId]", () => {
   it("404s an unknown analysis id", async () => {
      const response = await get("agent-404000");
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("analysis-not-found");
   });

   it("503s when the runs root is not configured", async () => {
      delete process.env[STUDIO_DET_RUNS_DIR_ENV];
      const response = await get("agent-404000");
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not-configured");
   });

   it("serves snapshot + validated plan + honest approval preview", async () => {
      await seedTerminalAnalysis("agent-500001");
      const response = await get("agent-500001");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         snapshot: {
            state: string;
            outcome: string | null;
            grounded: boolean | null;
         };
         plan: { requested: { nodeId: string }; sections: unknown[] } | null;
         approval: {
            preview: {
               pinnedAssignments: number;
               totalProposedAssignments: number;
               droppedNodeIds: string[];
            } | null;
            previewError: string | null;
            approvable: boolean;
         };
      };
      expect(body.snapshot).toMatchObject({
         state: "exited",
         outcome: "plan-ready",
         grounded: true,
      });
      expect(body.plan).not.toBeNull();
      expect(body.plan?.requested.nodeId).toBe("245:2");
      expect(body.approval.preview).not.toBeNull();
      expect(body.approval.preview).toMatchObject({
         pinnedAssignments: 2,
         totalProposedAssignments: 2,
         droppedNodeIds: [],
      });
      expect(body.approval.previewError).toBeNull();
      expect(body.approval.approvable).toBe(true);
   });

   it("marks an ungrounded plan as not approvable", async () => {
      await seedTerminalAnalysis("agent-500002", {
         outcome: "plan-ungrounded",
         grounded: false,
      });
      const response = await get("agent-500002");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         snapshot: { outcome: string | null; grounded: boolean | null };
         approval: { approvable: boolean };
      };
      expect(body.snapshot.outcome).toBe("plan-ungrounded");
      expect(body.approval.approvable).toBe(false);
   });

   it("never claims approvable when the persisted plan cannot load", async () => {
      // Journal claims plan-ready but no plan file exists on disk — the read
      // path returns plan null, so the approval contract stays truthful-false
      // even though the journal outcome says plan-ready.
      await seedTerminalAnalysis("agent-500003", { withPlan: false });
      const response = await get("agent-500003");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         plan: unknown;
         approval: {
            preview: unknown;
            previewError: string | null;
            approvable: boolean;
         };
      };
      expect(body.plan).toBeNull();
      expect(body.approval.preview).toBeNull();
      expect(body.approval.previewError).toBeNull();
      expect(body.approval.approvable).toBe(false);
   });
});
