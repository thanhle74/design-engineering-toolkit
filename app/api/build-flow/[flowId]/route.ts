/**
 * [70] DET Studio — GET /api/build-flow/[flowId]
 *
 * Frozen contract: src/modules/studio/shared/contracts/build-flow.ts —
 *   GET /api/build-flow/:id → 200 BuildFlowRunSnapshot | 404 {error}
 *
 * Flow snapshot by id (live slot first, persisted journal second; a stale
 * `running` journal whose pid is gone reads `interrupted`). The id is
 * pattern-checked (`flow-<digits>`); unknown or malformed ids → 404
 * `flow-not-found` with a bounded, sanitized message. Never gated.
 */
import {
   buildFlowErrorResponse,
   BuildFlowApiError,
} from "@/src/modules/studio/server/build-flow/build-flow-errors";
import { getBuildFlowOrchestrator } from "@/src/modules/studio/server/build-flow/build-flow-orchestrator";

export async function GET(
   request: Request,
   context: { params: Promise<{ flowId: string }> },
): Promise<Response> {
   void request.headers.get("accept");

   try {
      const { flowId } = await context.params;
      let decodedFlowId: string;
      try {
         decodedFlowId = decodeURIComponent(flowId);
      } catch {
         throw new BuildFlowApiError(
            "invalid-input",
            "flowId is not a valid encoded URI component.",
         );
      }

      const orchestrator = await getBuildFlowOrchestrator();
      const snapshot = await orchestrator.snapshot(decodedFlowId);
      if (snapshot === null) {
         throw new BuildFlowApiError(
            "flow-not-found",
            `No build flow with id "${
               decodedFlowId.length > 100
                  ? `${decodedFlowId.slice(0, 100)}…`
                  : decodedFlowId
            }".`,
         );
      }
      return Response.json(snapshot);
   } catch (error) {
      return buildFlowErrorResponse(error);
   }
}
