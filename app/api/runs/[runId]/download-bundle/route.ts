import "server-only";
import fs from "node:fs";
import path from "node:path";
import { RUN_ID_PATTERN } from "@/src/modules/studio/server/artifact-access";
import { packRunBundleZip } from "@/src/modules/studio/server/zip-bundle";
import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";

export async function GET(
   request: Request,
   context: { params: Promise<{ runId: string }> },
): Promise<Response> {
   void request.headers.get("accept");

   try {
      const { runId } = await context.params;

      if (!RUN_ID_PATTERN.test(runId)) {
         return Response.json(
            {
               error: {
                  code: "bad-request",
                  message: `Invalid runId: ${runId}`,
               },
            },
            { status: 400 },
         );
      }

      const runsRoot =
         process.env[STUDIO_DET_RUNS_DIR_ENV] ||
         path.resolve(process.cwd(), "out", "studio-runs");
      const runDir = path.join(runsRoot, runId);

      if (!fs.existsSync(runDir)) {
         return Response.json(
            {
               error: {
                  code: "not-found",
                  message: `Run ${runId} not found on disk.`,
               },
            },
            { status: 404 },
         );
      }

      const zipBuffer = packRunBundleZip(runDir);

      return new Response(new Uint8Array(zipBuffer), {
         status: 200,
         headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="det-bundle-${runId}.zip"`,
            "Cache-Control": "no-store",
         },
      });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Internal server error";
      return Response.json(
         {
            error: {
               code: "internal-error",
               message,
            },
         },
         { status: 500 },
      );
   }
}
