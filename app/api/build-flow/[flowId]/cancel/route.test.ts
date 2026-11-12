/**
 * [70] POST /api/build-flow/[flowId]/cancel route tests — the orchestrator is
 * MOCKED (house pattern); the HTTP contract is the subject: 200 {snapshot},
 * 404 flow-not-found, 409 flow-not-cancellable, 400 bad encoding.
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

import { POST } from "./route";
import type { BuildFlowRunSnapshot } from "@/src/modules/studio/shared/contracts";

function flowSnapshot(flowId = "flow-99001"): BuildFlowRunSnapshot {
   return {
      flowId,
      journalSchemaVersion: 1,
      state: "running",
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
      currentStage: "ai-analysis",
      error: null,
      startedAt: "2026-11-12T00:00:00.000Z",
      finishedAt: null,
      pid: 424242,
   };
}

function post(flowId: string): Promise<Response> {
   return POST(
      new Request(`http://localhost/api/build-flow/${flowId}/cancel`, {
         method: "POST",
      }),
      { params: Promise.resolve({ flowId }) },
   );
}

beforeEach(() => {
   factoryMock.mockReset();
   factoryMock.mockResolvedValue({
      cancel: vi.fn(async () => ({ kind: "not-found" })),
      snapshot: vi.fn(async () => null),
      activeSnapshot: vi.fn(() => null),
      start: vi.fn(),
   });
});

describe("POST /api/build-flow/[flowId]/cancel", () => {
   it("returns 200 {snapshot} for a live flow", async () => {
      const snap = flowSnapshot("flow-99001");
      factoryMock.mockResolvedValue({
         cancel: vi.fn(async () => ({ kind: "cancelled", snapshot: snap })),
         snapshot: vi.fn(async () => snap),
         activeSnapshot: vi.fn(() => snap),
         start: vi.fn(),
      });
      const response = await post("flow-99001");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
         snapshot: { flowId: string; state: string };
      };
      expect(payload.snapshot.flowId).toBe("flow-99001");
   });

   it("404s an unknown flow id", async () => {
      const response = await post("flow-404000");
      expect(response.status).toBe(404);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("flow-not-found");
   });

   it("409s an already-terminal flow (flow-not-cancellable)", async () => {
      const terminal = {
         ...flowSnapshot("flow-99002"),
         state: "completed" as const,
      };
      factoryMock.mockResolvedValue({
         cancel: vi.fn(async () => ({
            kind: "not-cancellable",
            snapshot: terminal,
         })),
         snapshot: vi.fn(async () => terminal),
         activeSnapshot: vi.fn(() => null),
         start: vi.fn(),
      });
      const response = await post("flow-99002");
      expect(response.status).toBe(409);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("flow-not-cancellable");
   });

   it("maps an invalid encoded id to 400 invalid-input", async () => {
      const response = await POST(
         new Request("http://localhost/api/build-flow/flow-x/cancel", {
            method: "POST",
         }),
         { params: Promise.resolve({ flowId: "%zz" }) },
      );
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("invalid-input");
   });
});
