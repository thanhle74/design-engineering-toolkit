/**
 * [29] DET Studio — GET /api/runs
 *
 * Returns the run summaries the configured DetRunReader offers (newest first).
 * Fixture mode (STUDIO_DET_RUNS_DIR unset) returns the labeled DEMO run.
 */
import { getDetRunReader } from "@/src/server/det-run-reader-factory";
import { detRunErrorResponse } from "@/src/server/api-error";


export async function GET(request: Request): Promise<Response> {
  // Reading any request header marks this route request-time (Cache
  // Components forbids the legacy `dynamic` export; fs/env are not tracked
  // dynamic APIs). Never reflects secrets — the header value is discarded.
  void request.headers.get("accept");

  try {
    const reader = await getDetRunReader();
    const runs = await reader.listRuns();
    return Response.json({ runs });
  } catch (error) {
    return detRunErrorResponse(error);
  }
}
