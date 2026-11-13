import {
   deleteProject,
   getProject,
} from "@/src/modules/studio/projects/project-store";

export async function GET(
   _request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   try {
      const { projectId } = await params;
      const project = await getProject(projectId);
      if (!project) {
         return Response.json(
            {
               error: {
                  code: "not-found",
                  message: `Không tìm thấy dự án ${projectId}`,
               },
            },
            { status: 404 },
         );
      }
      return Response.json({ project });
   } catch (error) {
      return Response.json(
         {
            error: {
               code: "internal-error",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to get project",
            },
         },
         { status: 500 },
      );
   }
}

export async function DELETE(
   _request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   try {
      const { projectId } = await params;
      const ok = await deleteProject(projectId);
      if (!ok) {
         return Response.json(
            {
               error: {
                  code: "not-found",
                  message: `Không tìm thấy dự án ${projectId}`,
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
                     : "Failed to delete project",
            },
         },
         { status: 500 },
      );
   }
}
