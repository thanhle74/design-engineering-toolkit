/**
 * [74] /api/projects/[projectId]/pages — thin route: all validation and error
 * mapping live in the projects module server seam (`projects/api.ts`).
 */
import { projectAddPageResponse } from "@/src/modules/studio/projects/api";

export async function POST(
   request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   const { projectId } = await params;
   return projectAddPageResponse(projectId, request);
}
