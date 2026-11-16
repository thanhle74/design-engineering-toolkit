import "server-only";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";
import { detRunErrorResponse } from "@/src/modules/studio/server/api-error";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";

/**
 * [74] server seam for `GET /api/build-configs` — moved VERBATIM from the
 * route file so the route stays thin. HTTP contract unchanged.
 *
 * [40] Lists build-config entries: the committed repository catalogue
 * (resources/examples/build, in place — [58]) plus caller-configured entries
 * from STUDIO_BUILD_PROJECTS_DIR when set (light listing mirror only — det
 * build owns authoritative validation). An explicitly set but invalid env
 * maps to 503 not-configured with the env NAME, never its value. Entries
 * that fail the listing mirror surface in `invalid`, they do not hide the
 * rest of the catalog.
 */
export async function buildConfigsGetResponse(): Promise<Response> {
   try {
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
      const listing = await catalog.list();

      // Runner readiness rides along so the UI can disable Build truthfully
      // (control requires BOTH the projects dir and a valid runs dir).
      let runnerReady = true;
      let runnerReason: string | undefined;
      try {
         await getBuildRunner();
      } catch (error) {
         if (
            error instanceof DetRunReaderError &&
            error.code === "not-configured"
         ) {
            runnerReady = false;
            runnerReason = error.message;
         } else {
            throw error;
         }
      }

      return Response.json({
         entries: listing.entries,
         invalid: listing.invalid,
         runnerReady,
         ...(runnerReason === undefined ? {} : { runnerReason }),
      });
   } catch (error) {
      return detRunErrorResponse(error);
   }
}
