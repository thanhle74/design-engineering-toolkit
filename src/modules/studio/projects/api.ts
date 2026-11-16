import "server-only";

import {
   ProjectStoreError,
   addFigmaPage,
   createProject,
   deleteFigmaPage,
   deleteProject,
   getProject,
   listProjects,
} from "./project-store";

/**
 * [74] HTTP seam for `/api/projects/**` — the ONLY place project store
 * failures map to responses. Route files stay thin (parse nothing, decide
 * nothing); every status/body/error-key contract below is identical to the
 * pre-[74] routes:
 *   - 400 `{error:{code:"invalid-input", message}}` for rejected untrusted
 *     input (missing/invalid name, missing Figma URL, bad Figma URL, malformed
 *     ids, bounds violations);
 *   - 404 `{error:{code:"not-found", message}}` for unknown (but well-formed)
 *     project/page ids — message text unchanged;
 *   - 500 `{error:{code:"internal-error", message}}` for store-level failures
 *     (corrupt store, IO errors) — code unchanged, but the message is now a
 *     typed, sanitized store message (no absolute paths, no control chars)
 *     instead of a raw fs error.
 * Messages are control-character-sanitized before they reach a response body,
 * mirroring the shared api-error.ts convention.
 */
function sanitizeMessage(message: string): string {
   return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

function errorResponse(error: unknown, fallback: string): Response {
   if (error instanceof ProjectStoreError) {
      if (error.code === "invalid-input") {
         return Response.json(
            {
               error: {
                  code: "invalid-input",
                  message: sanitizeMessage(error.message),
               },
            },
            { status: 400 },
         );
      }
      // store-corrupt / store-io: server-side storage failure.
      return Response.json(
         {
            error: {
               code: "internal-error",
               message: sanitizeMessage(error.message),
            },
         },
         { status: 500 },
      );
   }
   return Response.json(
      {
         error: {
            code: "internal-error",
            message:
               error instanceof Error
                  ? sanitizeMessage(error.message)
                  : fallback,
         },
      },
      { status: 500 },
   );
}

export async function projectsListResponse(): Promise<Response> {
   try {
      const projects = await listProjects();
      return Response.json({ projects });
   } catch (error) {
      return errorResponse(error, "Failed to list projects");
   }
}

export async function projectCreateResponse(request: Request): Promise<Response> {
   try {
      const body = (await request.json()) as {
         name?: unknown;
         id?: unknown;
         platformId?: unknown;
         description?: unknown;
      };

      if (
         !body.name ||
         typeof body.name !== "string" ||
         !body.name.trim()
      ) {
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
         id: typeof body.id === "string" ? body.id : undefined,
         platformId:
            typeof body.platformId === "string" ? body.platformId : undefined,
         description:
            typeof body.description === "string"
               ? body.description
               : undefined,
      });

      return Response.json({ project }, { status: 201 });
   } catch (error) {
      return errorResponse(error, "Failed to create project");
   }
}

export async function projectGetResponse(projectId: string): Promise<Response> {
   try {
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
      return errorResponse(error, "Failed to get project");
   }
}

export async function projectDeleteResponse(
   projectId: string,
): Promise<Response> {
   try {
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
      return errorResponse(error, "Failed to delete project");
   }
}

export async function projectAddPageResponse(
   projectId: string,
   request: Request,
): Promise<Response> {
   try {
      const body = (await request.json()) as {
         name?: unknown;
         figmaUrl?: unknown;
         notes?: unknown;
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
         name: typeof body.name === "string" ? body.name : "",
         figmaUrl: body.figmaUrl,
         notes: typeof body.notes === "string" ? body.notes : undefined,
      });

      return Response.json({ page }, { status: 201 });
   } catch (error) {
      // Preserved contract: ANY add-page rejection answers 400 invalid-input
      // with the error message (parser Vietnamese message verbatim for bad
      // Figma URLs). Store-level failures inside addFigmaPage are impossible
      // to distinguish today without changing this frozen shape.
      if (error instanceof ProjectStoreError && error.code !== "invalid-input") {
         return Response.json(
            {
               error: {
                  code: "internal-error",
                  message: sanitizeMessage(error.message),
               },
            },
            { status: 500 },
         );
      }
      return Response.json(
         {
            error: {
               code: "invalid-input",
               message:
                  error instanceof Error
                     ? sanitizeMessage(error.message)
                     : "Failed to add Figma page",
            },
         },
         { status: 400 },
      );
   }
}

export async function projectDeletePageResponse(
   projectId: string,
   pageId: string,
): Promise<Response> {
   try {
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
      return errorResponse(error, "Failed to delete page");
   }
}
