/**
 * [74] /api/build-flow — thin route: the frozen POST/GET contract bodies live
 * in the server seam (`server/build-flow/build-flow-start.ts`).
 *
 * Frozen contract: src/modules/studio/shared/contracts/build-flow.ts —
 *   POST /api/build-flow  body {figmaInput: string; target: string}
 *                         → 202 {flowId, state} | 4xx/5xx {error:{code,message}, ...}
 *   GET  /api/build-flow  → 200 {active: BuildFlowRunSnapshot | null} (never gated)
 */
import {
   activeBuildFlowResponse,
   startBuildFlowFromRequest,
} from "@/src/modules/studio/server/build-flow/build-flow-start";

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");
   return startBuildFlowFromRequest(request);
}

export async function GET(request: Request): Promise<Response> {
   void request.headers.get("accept");
   return activeBuildFlowResponse();
}
