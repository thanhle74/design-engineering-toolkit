/**
 * [40] DET Studio — GET /api/builds/[runId]
 *
 * Job state for one Studio-triggered build (live slot first, persisted
 * journal second; a stale `running` journal whose pid is gone reads back as
 * `interrupted`). When the engine wrote a bundle manifest, the summary rides
 * along (stage table + gaps + verified output count). Unknown ids → 404
 * run-not-found. The journal is never downloadable source.
 */
import { DetRunReaderError } from "@/src/shared/contracts";
import { buildControlErrorResponse } from "@/src/server/api-error";
import { getBuildRunner } from "@/src/server/build-runner";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
): Promise<Response> {
  void request.headers.get("accept");

  try {
    const { runId } = await context.params;
    let decodedRunId: string;
    try {
      decodedRunId = decodeURIComponent(runId);
    } catch {
      return Response.json(
        { error: { code: "bad-request", message: "runId is not a valid encoded URI component." } },
        { status: 400 }
      );
    }

    const runner = await getBuildRunner();
    const snapshot = await runner.snapshot(decodedRunId);
    if (snapshot === null) {
      throw new DetRunReaderError(
        "run-not-found",
        `No Studio build job with id "${decodedRunId.length > 100 ? `${decodedRunId.slice(0, 100)}…` : decodedRunId}".`
      );
    }
    return Response.json({ job: snapshot });
  } catch (error) {
    return buildControlErrorResponse(error);
  }
}
