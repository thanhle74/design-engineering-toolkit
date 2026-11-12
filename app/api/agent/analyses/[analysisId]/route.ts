/**
 * [65] GET /api/agent/analyses/[analysisId]
 *
 * One analysis: job snapshot +, when terminal with a plan, the validated
 * plan and its approval preview (how many proposed assignments reference the
 * version-pinned snapshot source — computed the exact way the materializer
 * decides, so the operator approves with the real numbers in view).
 */
import { previewApproval } from "@/src/modules/studio/server/claude-agent/plan-materializer";
import {
   agentErrorResponse,
   AgentWorkflowError,
} from "@/src/modules/studio/server/claude-agent/agent-errors";
import { getAgentAnalysisRunner } from "@/src/modules/studio/server/claude-agent/analysis-runner";
import { isApprovableOutcome } from "@/src/modules/studio/shared/contracts";

export async function GET(
   request: Request,
   context: { params: Promise<{ analysisId: string }> },
): Promise<Response> {
   void request.headers.get("accept");

   try {
      const { analysisId } = await context.params;
      const runner = await getAgentAnalysisRunner();
      const result = await runner.result(analysisId);
      if (result === null) {
         throw new AgentWorkflowError(
            "analysis-not-found",
            "No analysis matches the requested id.",
         );
      }
      const { snapshot, plan } = result;
      let approvalPreview = null;
      let approvalPreviewError: string | null = null;
      if (plan !== null && snapshot.baseConfigPath !== null) {
         try {
            approvalPreview = await previewApproval(
               plan,
               snapshot.baseConfigPath,
            );
         } catch (error) {
            approvalPreviewError =
               error instanceof Error
                  ? error.message
                  : "approval preview unavailable";
         }
      }
      return Response.json({
         snapshot,
         plan,
         approval: {
            preview: approvalPreview,
            previewError: approvalPreviewError,
            // The plan file must actually be present and re-validated — journal
            // truth alone can disagree with disk (corruption/loss), and the
            // approve button must never enable on a plan that cannot load.
            approvable:
               plan !== null &&
               snapshot.outcome !== null &&
               isApprovableOutcome(snapshot.outcome) &&
               snapshot.grounded === true,
         },
      });
   } catch (error) {
      return agentErrorResponse(error);
   }
}
