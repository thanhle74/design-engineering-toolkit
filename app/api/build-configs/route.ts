/**
 * [74] /api/build-configs — thin route: the listing + runner-readiness merge
 * lives in the server seam (`server/build-configs-api.ts`).
 */
import { buildConfigsGetResponse } from "@/src/modules/studio/server/build-configs-api";

export async function GET(request: Request): Promise<Response> {
   // Reading any request header marks this route request-time (Cache
   // Components forbids the legacy `dynamic` export); the value is discarded.
   void request.headers.get("accept");
   return buildConfigsGetResponse();
}
