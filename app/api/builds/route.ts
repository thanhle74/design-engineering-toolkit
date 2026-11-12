/**
 * [40] DET Studio — /api/builds
 *
 * GET: current runner readiness + the active job snapshot (or null), so the
 * build page can render honest state after a page reload mid-build.
 *
 * POST {configId}: start ONE build through the thin server-only runner (S2).
 * The config path is resolved by the pattern-checked catalog — request input
 * never names a server path. While a build runs, the single-slot runner
 * answers 409 with the active job. Responses: 202 {runId, state} on accept.
 */
import { buildControlErrorResponse } from "@/src/modules/studio/server/api-error";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";

export async function GET(request: Request): Promise<Response> {
   void request.headers.get("accept");

   try {
      const runner = await getBuildRunner();
      return Response.json({ active: runner.activeSnapshot() });
   } catch (error) {
      return buildControlErrorResponse(error);
   }
}

interface BuildStartBody {
   configId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");

   let body: BuildStartBody;
   try {
      body = (await request.json()) as BuildStartBody;
   } catch {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message: 'Request body must be JSON: {"configId": string}.',
            },
         },
         { status: 400 },
      );
   }
   const configId = body?.configId;
   if (typeof configId !== "string" || configId.length === 0) {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message: "configId is required and must be a non-empty string.",
            },
         },
         { status: 400 },
      );
   }

   try {
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
      const configPath = await catalog.resolveConfigPath(configId);
      const runner = await getBuildRunner();
      const snapshot = await runner.start(configId, configPath);
      return Response.json(
         { runId: snapshot.runId, state: snapshot.state },
         { status: 202 },
      );
   } catch (error) {
      return buildControlErrorResponse(error);
   }
}
