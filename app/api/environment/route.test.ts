/**
 * [70] GET /api/environment route tests — the HTTP contract only; the gate
 * module is MOCKED (hermetic, no child processes) exactly like the gated
 * route tests mock it. Cases: 200 with the readiness status for a ready AND
 * a broken environment (the endpoint IS the check — never a gate), the 500
 * internal-error mapping for an unexpected throw, and the safe-cancel
 * guarantee: POST .../cancel stays fully usable while the environment gate
 * fails closed (cancel routes are never gated).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `connection()` needs a Next request scope; the HTTP shape under test does
// not. Stub it like the server-only mock.
vi.mock("next/server", () => ({ connection: async () => undefined }));

const getReadinessMock = vi.fn();
const assertReadyMock = vi.fn();
vi.mock("@/src/modules/studio/server/environment/index", () => ({
   StudioEnvironmentError: class extends Error {
      readonly code = "environment-not-ready";
      constructor(
         message: string,
         readonly checks: unknown,
      ) {
         super(message);
      }
   },
   getStudioReadiness: (...args: unknown[]) => getReadinessMock(...args),
   assertStudioEnvironmentReady: (...args: unknown[]) =>
      assertReadyMock(...args),
   environmentNotReadyResponse: (error: {
      code: string;
      message: string;
      checks: unknown;
   }) =>
      Response.json(
         {
            error: { code: error.code, message: error.message },
            checks: error.checks,
         },
         { status: 503 },
      ),
}));

import { GET } from "./route";
import { POST as cancelPost } from "@/app/api/agent/analyses/[analysisId]/cancel/route";
import type { AgentAnalysisSnapshot } from "@/src/modules/studio/shared/contracts";
import type { StudioReadinessStatus } from "@/src/modules/studio/shared/contracts/build-flow";

const READY_STATUS: StudioReadinessStatus = {
   ready: true,
   checks: {
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
   },
};

const BROKEN_STATUS: StudioReadinessStatus = {
   ready: false,
   checks: {
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
   },
};

function get(): Promise<Response> {
   return GET(new Request("http://localhost/api/environment"));
}

beforeEach(() => {
   getReadinessMock.mockReset();
   assertReadyMock.mockReset();
});

afterEach(() => {
   vi.restoreAllMocks();
});

describe("GET /api/environment", () => {
   it("answers 200 with the readiness status of a READY environment", async () => {
      getReadinessMock.mockResolvedValue(READY_STATUS);
      const response = await get();
      expect(response.status).toBe(200);
      const body = (await response.json()) as StudioReadinessStatus;
      expect(body).toEqual(READY_STATUS);
   });

   it("answers 200 with per-check reasonCodes when the environment is BROKEN (never gated)", async () => {
      getReadinessMock.mockResolvedValue(BROKEN_STATUS);
      const response = await get();
      expect(response.status).toBe(200);
      const body = (await response.json()) as StudioReadinessStatus;
      expect(body.ready).toBe(false);
      expect(body.checks.claudeCode.reasonCode).toBe("not-installed");
      expect(body.checks.figmaMcp.reasonCode).toBe("mcp-not-listed");
      expect(body.checks.detRunsDir.reasonCode).toBe("not-configured");
      expect(body.checks.detRunsDir.envName).toBe("STUDIO_DET_RUNS_DIR");
   });

   it("maps an unexpected throw to 500 internal-error (sanitized, fixed message)", async () => {
      getReadinessMock.mockRejectedValue(
         new Error("EACCES: permission denied, lstat '/srv/secret/runs'"),
      );
      const response = await get();
      expect(response.status).toBe(500);
      const body = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(body.error.code).toBe("internal-error");
      // The raw error message (absolute path inside) never reaches the body.
      expect(body.error.message).not.toContain("/srv/secret/runs");
      expect(body.error.message).not.toContain("EACCES");
   });
});

describe("safe cancels stay usable while the environment is broken", () => {
   it("POST /api/agent/analyses/[id]/cancel processes normally (gate never consulted)", async () => {
      // Tripwire: the gate would fail closed for ANY gated route.
      const brokenError = Object.assign(new Error("Môi trường chưa sẵn sàng"), {
         code: "environment-not-ready",
         checks: BROKEN_STATUS.checks,
      });
      assertReadyMock.mockRejectedValue(brokenError);
      getReadinessMock.mockResolvedValue(BROKEN_STATUS);

      // A running analysis served by a minimal runner double in the same
      // globalThis slot the real factory uses (same pattern as the [65]
      // cancel route tests).
      const running = {
         journalSchemaVersion: 1,
         analysisId: "agent-700cancel",
         state: "running",
         request: {
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:2",
            baseConfigId: "slaunchpad-home-real-derived",
         },
         pid: 424242,
         baseConfigPath: null,
         allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
         claudeVersion: "2.1.322",
         command: ["claude"],
         exitCode: null,
         signal: null,
         timedOut: false,
         cancelled: false,
         startedAt: "2026-11-12T00:00:00.000Z",
         finishedAt: null,
         stdoutTail: "",
         stderrTail: "",
         spawnError: null,
         outcome: null,
         envelopeSafe: null,
         grounded: null,
      } as AgentAnalysisSnapshot;
      const snapshots = new Map([[running.analysisId, running]]);
      (
         globalThis as { __detStudioAgentRunner?: unknown }
      ).__detStudioAgentRunner = Promise.resolve({
         snapshot: async (id: string) => snapshots.get(id) ?? null,
         cancel: (id: string) => {
            const snap = snapshots.get(id);
            if (
               snap === undefined ||
               !["running", "queued"].includes(snap.state)
            )
               return null;
            const next = {
               ...snap,
               state: "cancelled",
               cancelled: true,
            } as AgentAnalysisSnapshot;
            snapshots.set(id, next);
            return next;
         },
      });

      try {
         const response = await cancelPost(
            new Request(
               "http://localhost/api/agent/analyses/agent-700cancel/cancel",
               { method: "POST" },
            ),
            { params: Promise.resolve({ analysisId: "agent-700cancel" }) },
         );
         expect(response.status).toBe(200);
         const body = (await response.json()) as {
            snapshot: { state: string; cancelled: boolean };
         };
         expect(body.snapshot).toMatchObject({
            state: "cancelled",
            cancelled: true,
         });
         // The gate was never consulted: the cancel path has no readiness
         // dependency by design.
         expect(assertReadyMock).not.toHaveBeenCalled();
         expect(getReadinessMock).not.toHaveBeenCalled();
      } finally {
         (
            globalThis as { __detStudioAgentRunner?: unknown }
         ).__detStudioAgentRunner = undefined;
      }
   });
});
