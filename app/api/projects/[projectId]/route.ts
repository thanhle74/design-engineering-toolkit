/**
 * [74] /api/projects/[projectId] — thin route: all validation and error
 * mapping live in the projects module server seam (`projects/api.ts`).
 */
import {
   projectDeleteResponse,
   projectGetResponse,
} from "@/src/modules/studio/projects/api";

export async function GET(
   _request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   const { projectId } = await params;
   return projectGetResponse(projectId);
}

export async function DELETE(
   _request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   const { projectId } = await params;
   return projectDeleteResponse(projectId);
}
