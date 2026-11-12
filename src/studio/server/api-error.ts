/**
 * [29] DET Studio — shared mapping from DetRunReaderError to API responses.
 *
 * Every `/api/runs/**` route handler returns JSON `{ error: { code, message } }`
 * on failure, with status codes from this closed map. Reader messages are
 * constructed server-side and never embed absolute server paths or environment
 * VALUES (only the env NAME); this module additionally strips control
 * characters so no response can carry them.
 */
import "server-only";

import { DetRunReaderError } from "@/src/studio/shared/contracts";

import { BuildBusyError } from "./build-runner";

const STATUS_BY_CODE: Record<DetRunReaderError["code"], number> = {
  "not-configured": 503,
  "run-not-found": 404,
  "artifact-not-found": 404,
  "artifact-not-downloadable": 403,
  "path-refused": 400,
  "invalid-payload": 500,
};

/** Control characters never reach a response body. */
function sanitizeMessage(message: string): string {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

export function detRunErrorResponse(error: unknown): Response {
  if (error instanceof DetRunReaderError) {
    return Response.json(
      { error: { code: error.code, message: sanitizeMessage(error.message) } },
      { status: STATUS_BY_CODE[error.code] }
    );
  }
  return Response.json(
    { error: { code: "internal-error", message: "Unexpected server error while reading DET run data." } },
    { status: 500 }
  );
}

/**
 * [40] build-control failure mapping for `/api/builds/**` and
 * `/api/build-configs`: same reader codes as above, plus the single-slot
 * busy case (409 with the active job so the UI can render truthful state).
 * Job tails are already capped at capture time; no extra fields are added.
 */
export function buildControlErrorResponse(error: unknown): Response {
  if (error instanceof BuildBusyError) {
    return Response.json(
      {
        error: {
          code: "build-busy",
          message: sanitizeMessage(error.message),
        },
        active: error.active,
      },
      { status: 409 }
    );
  }
  return detRunErrorResponse(error);
}
