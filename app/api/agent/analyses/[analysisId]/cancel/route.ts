/**
 * [65] POST /api/agent/analyses/[analysisId]/cancel — user cancellation.
 *
 * SIGTERMs the live analysis child (the runner records `cancelled`). 200
 * with the snapshot; 404 unknown id; 409 when no live analysis matches
 * (already terminal).
 */
import { agentErrorResponse, AgentWorkflowError } from "@/src/modules/studio/server/claude-agent/agent-errors";
import { getAgentAnalysisRunner } from "@/src/modules/studio/server/claude-agent/analysis-runner";

export async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> }
): Promise<Response> {
  void request.headers.get("accept");

  try {
    const { analysisId } = await context.params;
    const runner = await getAgentAnalysisRunner();
    const live = await runner.snapshot(analysisId);
    if (live === null) {
      throw new AgentWorkflowError("analysis-not-found", "No analysis matches the requested id.");
    }
    if (live.state !== "running" && live.state !== "queued") {
      throw new AgentWorkflowError(
        "analysis-not-cancellable",
        "The analysis is already terminal; cancellation applies to a running analysis only."
      );
    }
    const snapshot = runner.cancel(analysisId);
    if (snapshot === null) {
      // Raced to terminal between snapshot() and cancel(): report honestly.
      throw new AgentWorkflowError(
        "analysis-not-cancellable",
        "The analysis already reached a terminal state before cancellation."
      );
    }
    return Response.json({ snapshot });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
