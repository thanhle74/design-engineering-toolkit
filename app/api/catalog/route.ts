/**
 * [74] /api/catalog — thin route: the opt-in catalogue contract (mode-off,
 * indexing, ?runId= lookup) lives in the server seam
 * (`server/catalog/catalog-api.ts`).
 */
import { catalogGetResponse } from "@/src/modules/studio/server/catalog/catalog-api";

export async function GET(request: Request): Promise<Response> {
   // Reading any request header marks this route request-time (Cache
   // Components forbids the legacy `dynamic` export); the value is discarded.
   void request.headers.get("accept");
   return catalogGetResponse(request);
}
