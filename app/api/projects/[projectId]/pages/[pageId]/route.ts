/**
 * [74] /api/projects/[projectId]/pages/[pageId] — thin route: all validation
 * and error mapping live in the projects module server seam
 * (`projects/api.ts`).
 */
import { projectDeletePageResponse } from "@/src/modules/studio/projects/api";

export async function DELETE(
   _request: Request,
   { params }: { params: Promise<{ projectId: string; pageId: string }> },
): Promise<Response> {
   const { projectId, pageId } = await params;
   return projectDeletePageResponse(projectId, pageId);
}
