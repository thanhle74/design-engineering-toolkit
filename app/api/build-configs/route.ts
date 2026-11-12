/**
 * [40] DET Studio — GET /api/build-configs
 *
 * Lists build-config entries: the committed repository catalogue
 * (examples/build, in place — [58]) plus caller-configured entries from
 * STUDIO_BUILD_PROJECTS_DIR when set (light listing mirror only — det build
 * owns authoritative validation). An explicitly set but invalid env maps to
 * 503 not-configured with the env NAME, never its value. Entries that fail
 * the listing mirror surface in `invalid`, they do not hide the rest of the
 * catalog.
 */
import { DetRunReaderError } from "@/src/studio/shared/contracts";
import { detRunErrorResponse } from "@/src/studio/server/api-error";
import { BuildConfigCatalog, STUDIO_BUILD_PROJECTS_DIR_ENV } from "@/src/studio/server/build-catalog";
import { getBuildRunner } from "@/src/studio/server/build-runner";

export async function GET(request: Request): Promise<Response> {
  // Reading any request header marks this route request-time (Cache
  // Components forbids the legacy `dynamic` export); the value is discarded.
  void request.headers.get("accept");

  try {
    const catalog = await BuildConfigCatalog.open(process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "");
    const listing = await catalog.list();

    // Runner readiness rides along so the UI can disable Build truthfully
    // (control requires BOTH the projects dir and a valid runs dir).
    let runnerReady = true;
    let runnerReason: string | undefined;
    try {
      await getBuildRunner();
    } catch (error) {
      if (error instanceof DetRunReaderError && error.code === "not-configured") {
        runnerReady = false;
        runnerReason = error.message;
      } else {
        throw error;
      }
    }

    return Response.json({ entries: listing.entries, invalid: listing.invalid, runnerReady, ...(runnerReason === undefined ? {} : { runnerReason }) });
  } catch (error) {
    return detRunErrorResponse(error);
  }
}
