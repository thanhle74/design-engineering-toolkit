/**
 * [70] GET /api/build-flow/[flowId] route tests — the orchestrator is MOCKED
 * (house pattern); the HTTP contract is the subject: 200 snapshot, 404
 * flow-not-found (unknown + malformed id), 400 bad encoding.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

import { GET } from "@/app/api/build-flow/[flowId]/route";
import { BuildFlowApiError } from "@/src/modules/studio/server/build-flow/build-flow-errors";
import type { BuildFlowRunSnapshot } from "@/src/modules/studio/shared/contracts";

function flowSnapshot(flowId = "flow-1234"): BuildFlowRunSnapshot {
   return {
      flowId,
      journalSchemaVersion: 1,
      state: "completed",
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
         status: "success",
         startedAt: "2026-11-12T00:00:00.000Z",
         finishedAt: "2026-11-12T00:00:10.000Z",
         analysisId: null,
         buildRunId: null,
         message: null,
      })),
      currentStage: null,
      error: null,
      startedAt: "2026-11-12T00:00:00.000Z",
      finishedAt: "2026-11-12T00:00:10.000Z",
      pid: null,
   };
}

function get(flowId: string): Promise<Response> {
   return GET(new Request(`http://localhost/api/build-flow/${flowId}`), {
      params: Promise.resolve({ flowId }),
   });
}

beforeEach(() => {
   factoryMock.mockReset();
   factoryMock.mockResolvedValue({
      snapshot: vi.fn(async () => null),
      activeSnapshot: vi.fn(() => null),
      start: vi.fn(),
      cancel: vi.fn(async () => ({ kind: "not-found" })),
   });
});

describe("GET /api/build-flow/[flowId]", () => {
   it("serves the flow snapshot", async () => {
      const snap = flowSnapshot("flow-88001");
      factoryMock.mockResolvedValue({
         snapshot: vi.fn(async () => snap),
         activeSnapshot: vi.fn(() => null),
         start: vi.fn(),
         cancel: vi.fn(),
      });
      const response = await get("flow-88001");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as BuildFlowRunSnapshot;
      expect(payload.flowId).toBe("flow-88001");
      expect(payload.state).toBe("completed");
   });

   it("404s an unknown flow id", async () => {
      const response = await get("flow-404000");
      expect(response.status).toBe(404);
      const payload = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(payload.error.code).toBe("flow-not-found");
      expect(payload.error.message).toContain("flow-404000");
   });

   it("404s (not 500s) a malformed flow id — the pattern check reads as not-found", async () => {
      const response = await get("definitely-not-a-flow-id");
      expect(response.status).toBe(404);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("flow-not-found");
   });

   it("maps an invalid encoded id to 400 invalid-input", async () => {
      const response = await GET(
         new Request("http://localhost/api/build-flow/flow-x"),
         { params: Promise.resolve({ flowId: "%zz" }) },
      );
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("invalid-input");
   });

   it("answers 503 when the orchestrator cannot be constructed", async () => {
      factoryMock.mockRejectedValue(
         new BuildFlowApiError("environment-not-ready", "runs root unusable"),
      );
      const response = await get("flow-88001");
      expect(response.status).toBe(503);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("environment-not-ready");
   });
});
