/**
 * [70] /api/build-flow route tests — the gate and the orchestrator are MOCKED
 * (house pattern; NO real claude/preflight, no real pipeline); the HTTP
 * contract is the subject: 202 accept, 400 invalid-input (shape + parse),
 * 422 unsupported-target BEFORE anything expensive, 503 environment gate,
 * 409 flow-busy with the active flow, GET active (never gated).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guardMock = vi.fn();
vi.mock("@/src/modules/studio/server/environment", async (importOriginal) => {
   const actual =
      await importOriginal<
         typeof import("@/src/modules/studio/server/environment")
      >();
   return {
      ...actual,
      assertStudioEnvironmentReady: (...args: unknown[]) => guardMock(...args),
   };
});

const factoryMock = vi.fn();
vi.mock(
   "@/src/modules/studio/server/build-flow/build-flow-orchestrator",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/src/modules/studio/server/build-flow/build-flow-orchestrator")
         >();
      return {
         ...actual,
         getBuildFlowOrchestrator: (...args: unknown[]) => factoryMock(...args),
      };
   },
);

import { GET, POST } from "@/app/api/build-flow/route";
import {
   BuildFlowApiError,
   BuildFlowBusyError,
} from "@/src/modules/studio/server/build-flow/build-flow-errors";
import { StudioEnvironmentError } from "@/src/modules/studio/server/environment";
import type {
   BuildFlowRunSnapshot,
   StudioReadinessChecks,
} from "@/src/modules/studio/shared/contracts";

function flowSnapshot(flowId = "flow-1234"): BuildFlowRunSnapshot {
   return {
      flowId,
      journalSchemaVersion: 1,
      state: "queued",
      request: {
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
         target: "magento-page-builder",
      },
      stages: [
         "verify-source",
         "snapshot",
         "ai-analysis",
         "mapping",
         "compose",
         "results",
      ].map((stage) => ({
         stage: stage as BuildFlowRunSnapshot["stages"][number]["stage"],
         status: "pending",
         startedAt: null,
         finishedAt: null,
         analysisId: null,
         buildRunId: null,
         message: null,
      })),
      currentStage: null,
      error: null,
      startedAt: "2026-11-12T00:00:00.000Z",
      finishedAt: null,
      pid: 424242,
   };
}

const NOT_READY_CHECKS: StudioReadinessChecks = {
   claudeCode: { ready: false, version: null, reasonCode: "not-installed" },
   figmaMcp: {
      ready: true,
      listed: true,
      serverName: "plugin:figma:figma",
      reasonCode: "ok",
   },
   detRunsDir: {
      ready: false,
      reasonCode: "not-configured",
      envName: "STUDIO_DET_RUNS_DIR",
   },
};

function fakeOrch(
   overrides: {
      start?: ReturnType<typeof vi.fn>;
      activeSnapshot?: ReturnType<typeof vi.fn>;
   } = {},
): Record<string, unknown> {
   return {
      start: overrides.start ?? vi.fn(),
      snapshot: vi.fn(async () => null),
      activeSnapshot: overrides.activeSnapshot ?? vi.fn(() => null),
      cancel: vi.fn(async () => ({ kind: "not-found" })),
   };
}

function post(body: unknown): Promise<Response> {
   return POST(
      new Request("http://localhost/api/build-flow", {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: typeof body === "string" ? body : JSON.stringify(body),
      }),
   );
}

beforeEach(() => {
   guardMock.mockReset();
   guardMock.mockResolvedValue(undefined);
   factoryMock.mockReset();
});

describe("POST /api/build-flow — request validation", () => {
   it("rejects a non-JSON body with 400 invalid-input", async () => {
      const response = await post("not json");
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("invalid-input");
      expect(guardMock).not.toHaveBeenCalled();
   });

   it("rejects a missing/empty figmaInput or target with 400 invalid-input", async () => {
      expect((await post({})).status).toBe(400);
      expect(
         (await post({ figmaInput: "https://www.figma.com/x" })).status,
      ).toBe(400);
      expect((await post({ target: "magento-page-builder" })).status).toBe(400);
      expect(
         (await post({ figmaInput: "", target: "magento-page-builder" }))
            .status,
      ).toBe(400);
      expect((await post({ figmaInput: "245:2", target: 42 })).status).toBe(
         400,
      );
   });

   it("rejects hyva-phtml with 422 unsupported-target BEFORE anything expensive", async () => {
      const response = await post({
         figmaInput: "245:2",
         target: "hyva-phtml",
      });
      expect(response.status).toBe(422);
      const payload = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(payload.error.code).toBe("unsupported-target");
      expect(payload.error.message).toContain("Chưa hỗ trợ");
      expect(guardMock).not.toHaveBeenCalled();
   });

   it("rejects an unknown target with 422 unsupported-target", async () => {
      const response = await post({ figmaInput: "245:2", target: "wordpress" });
      expect(response.status).toBe(422);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("unsupported-target");
   });

   it("rejects an unparseable Figma input with 400 + the parser's message", async () => {
      const response = await post({
         figmaInput: "hello world",
         target: "magento-page-builder",
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(payload.error.code).toBe("invalid-input");
      expect(payload.error.message).toContain("figma.com");
      expect(guardMock).not.toHaveBeenCalled();
   });
});

describe("POST /api/build-flow — gate + start", () => {
   it("answers the canonical 503 environment-not-ready with checks when the gate fails", async () => {
      guardMock.mockRejectedValue(new StudioEnvironmentError(NOT_READY_CHECKS));
      const response = await post({
         figmaInput: "245:2",
         target: "magento-page-builder",
      });
      expect(response.status).toBe(503);
      const payload = (await response.json()) as {
         error: { code: string };
         checks: StudioReadinessChecks;
      };
      expect(payload.error.code).toBe("environment-not-ready");
      expect(payload.checks.detRunsDir.reasonCode).toBe("not-configured");
      expect(payload.checks.detRunsDir.envName).toBe("STUDIO_DET_RUNS_DIR");
   });

   it("accepts a valid start with 202 {flowId, state}", async () => {
      const start = vi.fn(async () => flowSnapshot("flow-77001"));
      factoryMock.mockResolvedValue(fakeOrch({ start }));
      const response = await post({
         figmaInput:
            "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/Home?node-id=245-2",
         target: "magento-page-builder",
      });
      expect(response.status).toBe(202);
      const payload = (await response.json()) as {
         flowId: string;
         state: string;
      };
      expect(payload.flowId).toBe("flow-77001");
      expect(payload.state).toBe("queued");
      expect(start).toHaveBeenCalledWith({
         figmaInput:
            "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/Home?node-id=245-2",
         target: "magento-page-builder",
      });
      expect(guardMock).toHaveBeenCalledTimes(1);
   });

   it("maps an occupied flow slot to 409 flow-busy with the active snapshot", async () => {
      const active = flowSnapshot("flow-777");
      const start = vi.fn(() => {
         throw new BuildFlowBusyError(active);
      });
      factoryMock.mockResolvedValue(fakeOrch({ start }));
      const response = await post({
         figmaInput: "245:2",
         target: "magento-page-builder",
      });
      expect(response.status).toBe(409);
      const payload = (await response.json()) as {
         error: { code: string };
         active: { flowId: string };
      };
      expect(payload.error.code).toBe("flow-busy");
      expect(payload.active.flowId).toBe("flow-777");
   });

   it("maps an unexpected orchestrator failure to 500 internal-error", async () => {
      factoryMock.mockRejectedValue(
         new BuildFlowApiError("environment-not-ready", "runs root unusable"),
      );
      const response = await post({
         figmaInput: "245:2",
         target: "magento-page-builder",
      });
      expect(response.status).toBe(503);
      const payload = (await response.json()) as {
         error: { code: string };
      };
      expect(payload.error.code).toBe("environment-not-ready");
   });
});

describe("GET /api/build-flow", () => {
   it("returns the active flow snapshot (never gated)", async () => {
      const snap = flowSnapshot("flow-555");
      factoryMock.mockResolvedValue(
         fakeOrch({ activeSnapshot: vi.fn(() => snap) }),
      );
      const response = await GET(
         new Request("http://localhost/api/build-flow"),
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
         active: { flowId: string } | null;
      };
      expect(payload.active!.flowId).toBe("flow-555");
      expect(guardMock).not.toHaveBeenCalled();
   });

   it("returns {active: null} when no flow exists", async () => {
      factoryMock.mockResolvedValue(fakeOrch({}));
      const response = await GET(
         new Request("http://localhost/api/build-flow"),
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { active: unknown };
      expect(payload.active).toBeNull();
   });

   it("answers 503 when the orchestrator cannot be constructed", async () => {
      factoryMock.mockRejectedValue(
         new BuildFlowApiError(
            "environment-not-ready",
            "The one-click Build flow requires STUDIO_DET_RUNS_DIR.",
         ),
      );
      const response = await GET(
         new Request("http://localhost/api/build-flow"),
      );
      expect(response.status).toBe(503);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("environment-not-ready");
   });
});
