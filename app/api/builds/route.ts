/**
 * [74] /api/builds — thin route: body validation, the [70] mutation gate and
 * error mapping live in the server seam (`server/build-start.ts`).
 */
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";
import { buildControlErrorResponse } from "@/src/modules/studio/server/api-error";
import { startBuildFromRequest } from "@/src/modules/studio/server/build-start";

export async function GET(request: Request): Promise<Response> {
   void request.headers.get("accept");

   try {
      const runner = await getBuildRunner();
      return Response.json({ active: runner.activeSnapshot() });
   } catch (error) {
      return buildControlErrorResponse(error);
   }
}

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");
   return startBuildFromRequest(request);
}
