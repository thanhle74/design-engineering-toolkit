/**
 * [29] DET Studio — GET /api/runs/[runId]
 *
 * Returns the full StudioRunView read model for one run (fixture or live).
 */
import { getDetRunReader } from "@/src/modules/studio/server/det-run-reader-factory";
import { detRunErrorResponse } from "@/src/modules/studio/server/api-error";


export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
): Promise<Response> {
  // Reading any request header marks this route request-time (Cache
  // Components forbids the legacy `dynamic` export; fs/env are not tracked
  // dynamic APIs). The header value is discarded.
  void request.headers.get("accept");

  try {
    const { runId } = await context.params;
    const reader = await getDetRunReader();
    const run = await reader.getRun(runId);
    return Response.json(run);
  } catch (error) {
    return detRunErrorResponse(error);
  }
}
