/**
 * [29] DET Studio — GET /api/runs/[runId]/artifacts/[artifactId]
 *
 * Validated artifact download. The artifactId must match a manifest entry of
 * that run (e.g. `node-ir/node-ir.json`, URL-encoded as a single segment); the
 * reader re-validates path containment, extension allowlist and size before
 * any bytes leave the server. Always served as an attachment.
 */
import { getDetRunReader } from "@/src/studio/server/det-run-reader-factory";
import { detRunErrorResponse } from "@/src/studio/server/api-error";


export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string; artifactId: string }> }
): Promise<Response> {
  // Reading any request header marks this route request-time (Cache
  // Components forbids the legacy `dynamic` export; fs/env are not tracked
  // dynamic APIs). The header value is discarded.
  void request.headers.get("accept");

  try {
    const { runId, artifactId } = await context.params;

    let decodedArtifactId: string;
    try {
      decodedArtifactId = decodeURIComponent(artifactId);
    } catch {
      return Response.json(
        { error: { code: "bad-request", message: "artifactId is not a valid encoded URI component." } },
        { status: 400 }
      );
    }

    const reader = await getDetRunReader();
    const download = await reader.readArtifact(runId, decodedArtifactId);

    return new Response(new Uint8Array(download.bytes), {
      status: 200,
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": `attachment; filename="${download.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return detRunErrorResponse(error);
  }
}
