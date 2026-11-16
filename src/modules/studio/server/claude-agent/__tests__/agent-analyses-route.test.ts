/**
 * [65] POST /api/agent/analyses route tests — the runner + detector are
 * mocked; the HTTP contract (validation, 409 carrier, 503 blocked-with-status,
 * 202 accept) is the subject. The real catalog resolves base config ids
 * against the committed repository catalogue (offline).
 *
 * [70] The environment readiness gate is MOCKED (hermetic — no child
 * processes): default ready so the pre-existing cases keep their behavior,
 * plus gate-ORDER cases (400 before the gate, 503 environment-not-ready with
 * checks before any catalog/preflight/runner work).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const assertReadyMock = vi.fn();
vi.mock(
   "@/src/modules/studio/server/environment/index",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/src/modules/studio/server/environment/index")
         >();
      return {
         ...actual,
         assertStudioEnvironmentReady: (...args: unknown[]) =>
            assertReadyMock(...args),
      };
   },
);

const detectMock = vi.fn();
vi.mock(
   "@/src/modules/studio/server/claude-agent/claude-detect",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/src/modules/studio/server/claude-agent/claude-detect")
         >();
      return {
         ...actual,
         detectClaudeAgentStatus: (...args: unknown[]) => detectMock(...args),
      };
   },
);

const startMock = vi.fn();
vi.mock(
   "@/src/modules/studio/server/claude-agent/analysis-runner",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/src/modules/studio/server/claude-agent/analysis-runner")
         >();
      return {
         ...actual,
         getAgentAnalysisRunner: vi.fn(async () => ({
            start: startMock,
         })),
      };
   },
);

import { POST } from "@/app/api/agent/analyses/route";
import { AgentBusyError } from "@/src/modules/studio/server/claude-agent/analysis-runner";
import { StudioEnvironmentError } from "@/src/modules/studio/server/environment/index";
import { type StudioReadinessChecks } from "@/src/modules/studio/shared/contracts/build-flow";

const READY_CHECKS: StudioReadinessChecks = {
   claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
   figmaMcp: {
      ready: true,
      listed: true,
      serverName: "plugin:figma:figma",
      reasonCode: "ok",
   },
   detRunsDir: {
      ready: true,
      reasonCode: "ok",
      envName: "STUDIO_DET_RUNS_DIR",
   },
};

const BROKEN_CHECKS: StudioReadinessChecks = {
   claudeCode: { ready: false, version: null, reasonCode: "not-installed" },
   figmaMcp: {
      ready: false,
      listed: false,
      serverName: null,
      reasonCode: "mcp-not-listed",
   },
   detRunsDir: {
      ready: false,
      reasonCode: "not-configured",
      envName: "STUDIO_DET_RUNS_DIR",
   },
};

const READY_STATUS = {
   claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
   figmaMcp: {
      ready: true,
      listed: true,
      serverName: "plugin:figma:figma",
      reasonCode: "ok",
   },
   ready: true,
   allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
};

function post(body: unknown): Promise<Response> {
   return POST(
      new Request("http://localhost/api/agent/analyses", {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: typeof body === "string" ? body : JSON.stringify(body),
      }),
   );
}

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
   savedEnv = {
      STUDIO_DET_RUNS_DIR: process.env.STUDIO_DET_RUNS_DIR,
      STUDIO_DATA_DIR: process.env.STUDIO_DATA_DIR,
   };
   detectMock.mockResolvedValue(READY_STATUS);
   startMock.mockReset();
   // [70] Gate default: ready — pre-existing cases keep their old behavior.
   assertReadyMock.mockReset();
   assertReadyMock.mockResolvedValue(READY_CHECKS);
});

afterEach(() => {
   for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
   }
});

describe("POST /api/agent/analyses", () => {
   it("rejects a non-JSON body with 400", async () => {
      const response = await post("not json");
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("bad-request");
   });

   it("[70] rejects a bad body with 400 BEFORE consulting the gate (even broken)", async () => {
      assertReadyMock.mockImplementation(async () => {
         throw new StudioEnvironmentError(BROKEN_CHECKS);
      });
      const response = await post({ fileKey: "bad key!", nodeId: "x" });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("bad-request");
      expect(assertReadyMock).not.toHaveBeenCalled();
   });

   it("[70] fails closed 503 environment-not-ready with checks BEFORE catalog/preflight/runner", async () => {
      assertReadyMock.mockImplementation(async () => {
         throw new StudioEnvironmentError(BROKEN_CHECKS);
      });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(503);
      const payload = (await response.json()) as {
         error: { code: string; message: string };
         checks: StudioReadinessChecks;
      };
      expect(payload.error.code).toBe("environment-not-ready");
      expect(payload.checks).toEqual(BROKEN_CHECKS);
      // No paid or catalog work ever started: the gate runs first for a
      // well-formed body.
      expect(detectMock).not.toHaveBeenCalled();
      expect(startMock).not.toHaveBeenCalled();
   });

   it("[70] passes through when the mocked gate is ready (202 unchanged)", async () => {
      startMock.mockResolvedValue({
         analysisId: "agent-gate",
         state: "running",
      });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(202);
      expect(assertReadyMock).toHaveBeenCalledTimes(1);
   });

   it("rejects an invalid fileKey / nodeId / missing baseConfigId with 400", async () => {
      expect(
         (
            await post({
               fileKey: "bad key!",
               nodeId: "245:2",
               baseConfigId: "x",
            })
         ).status,
      ).toBe(400);
      expect(
         (
            await post({
               fileKey: "vNPtfBRpYM3PsExirVqhmt",
               nodeId: "abc",
               baseConfigId: "x",
            })
         ).status,
      ).toBe(400);
      expect(
         (await post({ fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2" }))
            .status,
      ).toBe(400);
   });

   it("normalizes URL-spelled node ids (123-456 → 123:456)", async () => {
      startMock.mockResolvedValue({ analysisId: "agent-1", state: "running" });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245-2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(202);
      expect(startMock).toHaveBeenCalledWith(
         expect.objectContaining({ nodeId: "245:2" }),
         expect.stringContaining("slaunchpad-home-real-derived"),
      );
   });

   it("answers 404 for an unknown base config id (catalog resolution)", async () => {
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "no-such-config",
      });
      expect(response.status).toBe(404);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("run-not-found");
      expect(startMock).not.toHaveBeenCalled();
   });

   it("answers 409 analysis-busy with the active analysis", async () => {
      startMock.mockImplementation(() => {
         throw new AgentBusyError({
            analysisId: "agent-999",
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
            startedAt: null,
            finishedAt: null,
            pid: null,
            stdoutTail: "",
            stderrTail: "",
            spawnError: null,
            outcome: null,
            envelopeSafe: null,
            grounded: null,
         });
      });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(409);
      const payload = (await response.json()) as {
         error: { code: string };
         active: { analysisId: string };
      };
      expect(payload.error.code).toBe("analysis-busy");
      expect(payload.active.analysisId).toBe("agent-999");
   });

   it("answers 503 agent-not-ready WITH the concrete preflight status", async () => {
      detectMock.mockResolvedValue({
         claudeCode: {
            ready: false,
            version: null,
            reasonCode: "not-authenticated",
         },
         figmaMcp: {
            ready: true,
            listed: true,
            serverName: "plugin:figma:figma",
            reasonCode: "ok",
         },
         ready: false,
         allowedFigmaTool: null,
      });
      const { AgentWorkflowError } =
         await import("@/src/modules/studio/server/claude-agent/agent-errors");
      startMock.mockImplementation(() => {
         throw new AgentWorkflowError("agent-not-ready", "blocked");
      });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(503);
      const payload = (await response.json()) as {
         error: { code: string };
         status: {
            claudeCode: { reasonCode: string };
            figmaMcp: { reasonCode: string };
         };
      };
      expect(payload.error.code).toBe("agent-not-ready");
      expect(payload.status.claudeCode.reasonCode).toBe("not-authenticated");
      expect(payload.status.figmaMcp.reasonCode).toBe("ok");
   });

   it("accepts a valid start with 202", async () => {
      startMock.mockResolvedValue({
         analysisId: "agent-1234",
         state: "running",
      });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(202);
      const payload = (await response.json()) as {
         analysisId: string;
         state: string;
      };
      expect(payload.analysisId).toBe("agent-1234");
      expect(payload.state).toBe("running");
   });
});

describe("POST /api/agent/analyses — C65-3 source-identity binding", () => {
   it("refuses a DIFFERENT Figma file whose node id overlaps the base binding (422, no spawn)", async () => {
      startMock.mockResolvedValue({ analysisId: "agent-x", state: "running" });
      const response = await post({
         fileKey: "OtherFileKey1",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(422);
      const payload = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(payload.error.code).toBe("base-source-mismatch");
      // Vietnamese operator instruction; machine tokens verbatim.
      expect(payload.error.message).toContain("không khớp");
      expect(payload.error.message).toContain("vNPtfBRpYM3PsExirVqhmt");
      // Nothing was paid: preflight and the runner were never reached.
      expect(detectMock).not.toHaveBeenCalled();
      expect(startMock).not.toHaveBeenCalled();
   });

   it("refuses an arbitrary root node id on the RIGHT file (422)", async () => {
      startMock.mockResolvedValue({ analysisId: "agent-x", state: "running" });
      const response = await post({
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "999:999",
         baseConfigId: "slaunchpad-home-real-derived",
      });
      expect(response.status).toBe(422);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("base-source-mismatch");
      expect(startMock).not.toHaveBeenCalled();
   });

   it("refuses a base config with NO verified binding at all (422, fail closed)", async () => {
      const { mkdtemp, mkdir, writeFile, rm } =
         await import("node:fs/promises");
      const { join } = await import("node:path");
      const os = await import("node:os");
      const tmpRoot = await mkdtemp(join(os.tmpdir(), "det65-unbound-"));
      await mkdir(join(tmpRoot, "unbound-base"), { recursive: true });
      await writeFile(
         join(tmpRoot, "unbound-base", "build-config.json"),
         JSON.stringify({ schemaVersion: 1 }),
         "utf8",
      );
      process.env.STUDIO_BUILD_PROJECTS_DIR = tmpRoot;
      startMock.mockResolvedValue({ analysisId: "agent-x", state: "running" });
      try {
         const response = await post({
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:2",
            baseConfigId: "unbound-base",
         });
         expect(response.status).toBe(422);
         const payload = (await response.json()) as {
            error: { code: string; message: string };
         };
         expect(payload.error.code).toBe("base-source-mismatch");
         expect(payload.error.message).toContain(
            "chưa gắn nguồn Figma đã xác minh",
         );
         expect(startMock).not.toHaveBeenCalled();
      } finally {
         delete process.env.STUDIO_BUILD_PROJECTS_DIR;
         await rm(tmpRoot, { recursive: true, force: true });
      }
   });
});
