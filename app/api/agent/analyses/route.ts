/**
 * [74] /api/agent/analyses — thin route: body validation, source-identity
 * pinning, the [70] mutation gate and error mapping live in the server seam
 * (`server/claude-agent/analysis-start.ts`).
 *
 * [65] GET /api/agent/status sibling — see analysis-start.ts for the full
 * start contract (202 {analysisId, state} on accept).
 */
import { startAnalysisFromRequest } from "@/src/modules/studio/server/claude-agent/analysis-start";

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");
   return startAnalysisFromRequest(request);
}
