/**
 * [40] DET Studio — /api/builds
 *
 * GET: current runner readiness + the active job snapshot (or null), so the
 * build page can render honest state after a page reload mid-build. GET is
 * never gated.
 *
 * POST {configId}: start ONE build through the thin server-only runner (S2).
 * The config path is resolved by the pattern-checked catalog — request input
 * never names a server path. While a build runs, the single-slot runner
 * answers 409 with the active job. Responses: 202 {runId, state} on accept.
 *
 * [70] Mutation gate: after body validation (400s unchanged) and immediately
 * before accepting work, POST re-checks the server environment
 * (`assertStudioEnvironmentReady`) and fails closed with 503
 * `environment-not-ready` + per-check `{checks}` — UI state is never
 * authorization. GET stays ungated.
 */
import { buildControlErrorResponse } from "@/src/modules/studio/server/api-error";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";
import {
   assertStudioEnvironmentReady,
   environmentNotReadyResponse,
   StudioEnvironmentError,
} from "@/src/modules/studio/server/environment/index";

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
      // [70] Authoritative environment re-check — AFTER the 400s above, right
      // before accepting work (fail closed 503 + checks on any failure).
      await assertStudioEnvironmentReady();
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
      if (error instanceof StudioEnvironmentError) {
         return environmentNotReadyResponse(error);
      }
      return buildControlErrorResponse(error);
   }
}
