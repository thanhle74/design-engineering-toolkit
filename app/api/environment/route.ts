/**
 * [70] GET /api/environment — the Studio environment readiness check itself.
 *
 * ALWAYS answers 200 with the `StudioReadinessStatus` JSON (`ready` +
 * per-check `claudeCode` / `figmaMcp` / `detRunsDir` reason codes): this
 * endpoint IS the check, so it is never gated by its own result — detection
 * failures live in the per-check reasonCodes, exactly as the frozen [70]
 * contract states. Detection re-runs per request (no cache): the UI's
 * "Kiểm tra lại" and every mutating route's fail-closed guard share this one
 * server-side truth. An unexpected throw (never the readiness result) maps
 * to 500 `{error:{code:"internal-error", message}}` with a fixed generic
 * message — no absolute server paths and no env VALUES ever reach a
 * response.
 */
import { connection } from "next/server";

import { getStudioReadiness } from "@/src/modules/studio/server/environment/index";

export const instant = false;

export async function GET(request: Request): Promise<Response> {
   // Request-time marker (Cache Components): fs/env/child processes are not
   // tracked dynamic APIs, so signal request-time explicitly like every
   // Studio surface.
   void request.headers.get("accept");
   await connection();

   try {
      const status = await getStudioReadiness();
      return Response.json(status);
   } catch {
      return Response.json(
         {
            error: {
               code: "internal-error",
               message:
                  "Unexpected server error while checking the Studio environment.",
            },
         },
         { status: 500 },
      );
   }
}
