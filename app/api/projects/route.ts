import {
   createProject,
   listProjects,
} from "@/src/modules/studio/projects/project-store";

export async function GET(): Promise<Response> {
   try {
      const projects = await listProjects();
      return Response.json({ projects });
   } catch (error) {
      return Response.json(
         {
            error: {
               code: "internal-error",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to list projects",
            },
         },
         { status: 500 },
      );
   }
}

export async function POST(request: Request): Promise<Response> {
   try {
      const body = (await request.json()) as {
         name?: string;
         id?: string;
         platformId?: string;
         description?: string;
      };

      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
         return Response.json(
            {
               error: {
                  code: "invalid-input",
                  message: "Tên dự án là bắt buộc.",
               },
            },
            { status: 400 },
         );
      }

      const project = await createProject({
         name: body.name,
         id: body.id,
         platformId: body.platformId,
         description: body.description,
      });

      return Response.json({ project }, { status: 201 });
   } catch (error) {
      return Response.json(
         {
            error: {
               code: "internal-error",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to create project",
            },
         },
         { status: 500 },
      );
   }
}
