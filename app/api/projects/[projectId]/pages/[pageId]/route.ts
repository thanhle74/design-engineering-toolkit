import { deleteFigmaPage } from "@/src/modules/studio/projects/project-store";

export async function DELETE(
   _request: Request,
   { params }: { params: Promise<{ projectId: string; pageId: string }> },
): Promise<Response> {
   try {
      const { projectId, pageId } = await params;
      const ok = await deleteFigmaPage(projectId, pageId);
      if (!ok) {
         return Response.json(
            {
               error: {
                  code: "not-found",
                  message: `Không tìm thấy trang ${pageId} trong dự án ${projectId}`,
               },
            },
            { status: 404 },
         );
      }
      return Response.json({ ok: true });
   } catch (error) {
      return Response.json(
         {
            error: {
               code: "internal-error",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to delete page",
            },
         },
         { status: 500 },
      );
   }
}
