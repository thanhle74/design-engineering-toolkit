/**
 * [70] DET Studio — POST /api/build-flow/[flowId]/cancel — safe cancel.
 *
 * Frozen contract: src/modules/studio/shared/contracts/build-flow.ts —
 *   POST /api/build-flow/:id/cancel → 200 {snapshot} | 404 | 409 {error}
 *
 * Raises the orchestrator's `cancelRequested` flag (honored before each
 * stage and between polls) and forwards cancellation to the live child
 * runner when one is cancellable (ai-analysis → agent runner, compose →
 * build runner). 200 with the current snapshot; 404 `flow-not-found` for an
 * unknown id; 409 `flow-not-cancellable` for an already-terminal flow.
 * Never gated — cancellation is always allowed.
 */
import {
   buildFlowErrorResponse,
   BuildFlowApiError,
} from "@/src/modules/studio/server/build-flow/build-flow-errors";
import { getBuildFlowOrchestrator } from "@/src/modules/studio/server/build-flow/build-flow-orchestrator";

export async function POST(
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
      const outcome = await orchestrator.cancel(decodedFlowId);
      if (outcome.kind === "cancelled") {
         return Response.json({ snapshot: outcome.snapshot });
      }
      if (outcome.kind === "not-found") {
         throw new BuildFlowApiError(
            "flow-not-found",
            `No build flow with id "${
               decodedFlowId.length > 100
                  ? `${decodedFlowId.slice(0, 100)}…`
                  : decodedFlowId
            }".`,
         );
      }
      throw new BuildFlowApiError(
         "flow-not-cancellable",
         "Luồng Build đã ở trạng thái kết thúc; chỉ có thể hủy khi luồng đang chạy.",
      );
   } catch (error) {
      return buildFlowErrorResponse(error);
   }
}
