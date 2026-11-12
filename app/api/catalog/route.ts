/**
 * [50] DET Studio — /api/catalog
 *
 * The opt-in SQLite project/run catalogue API. `STUDIO_DATA_DIR` unset →
 * `{ mode: "off" }` (200, honest off state — persistence is never implied).
 * Set → opens/migrates the DB, re-indexes the configured runs root when the
 * tree changed since the last scan, and returns projects + runs + stats.
 * `?runId=` returns one catalogued run with its artifact metadata rows.
 *
 * Truth rules: catalog rows never gate downloads (the file-backed reader
 * still re-verifies live bytes on every artifact read); catalogue failures
 * map through the shared reader-error responses (503 not-configured etc.).
 */
import { detRunErrorResponse } from "@/src/modules/studio/server/api-error";
import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";
import {
   getStudioCatalog,
   STUDIO_DATA_DIR_ENV,
} from "@/src/modules/studio/server/catalog/studio-catalog";

export async function GET(request: Request): Promise<Response> {
   void request.headers.get("accept");

   if (process.env[STUDIO_DATA_DIR_ENV] === undefined) {
      return Response.json({
         mode: "off",
         message:
            "The SQLite catalogue is off: STUDIO_DATA_DIR is not set. Fixture and file-backed Studio modes are unaffected; set STUDIO_DATA_DIR to a local directory to persist project/run metadata.",
      });
   }

   try {
      const catalog = await getStudioCatalog();
      if (catalog === null) {
         // Unreachable while the env check above holds; kept honest anyway.
         return Response.json({
            mode: "off",
            message: "The SQLite catalogue is off: STUDIO_DATA_DIR is not set.",
         });
      }

      const runsRoot = process.env[STUDIO_DET_RUNS_DIR_ENV];
      let indexing: { changed: boolean; indexed: number } | null = null;
      if (typeof runsRoot === "string") {
         indexing = await catalog.refreshIndex(runsRoot);
      }

      const runId = new URL(request.url).searchParams.get("runId");
      if (runId !== null) {
         const run = catalog.getRun(runId);
         if (run === null) {
            return Response.json(
               {
                  error: {
                     code: "run-not-found",
                     message: `No catalogued run matching "${runId}".`,
                  },
               },
               { status: 404 },
            );
         }
         return Response.json({
            mode: "on",
            run,
            artifacts: catalog.listArtifacts(runId),
         });
      }

      return Response.json({
         mode: "on",
         stats: catalog.stats(),
         projects: catalog.listProjects(),
         runs: catalog.listRuns(),
         lastIndexing: indexing,
      });
   } catch (error) {
      return detRunErrorResponse(error);
   }
}
