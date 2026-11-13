import { addFigmaPage } from "@/src/modules/studio/projects/project-store";

export async function POST(
   request: Request,
   { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
   try {
      const { projectId } = await params;
      const body = (await request.json()) as {
         name?: string;
         figmaUrl?: string;
         notes?: string;
      };

      if (!body.figmaUrl || typeof body.figmaUrl !== "string") {
         return Response.json(
            {
               error: {
                  code: "invalid-input",
                  message: "Link Figma hoặc node id là bắt buộc.",
               },
            },
            { status: 400 },
         );
      }

      const page = await addFigmaPage(projectId, {
         name: body.name || "",
         figmaUrl: body.figmaUrl,
         notes: body.notes,
      });

      return Response.json({ page }, { status: 201 });
   } catch (error) {
      return Response.json(
         {
            error: {
               code: "invalid-input",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to add Figma page",
            },
         },
         { status: 400 },
      );
   }
}
