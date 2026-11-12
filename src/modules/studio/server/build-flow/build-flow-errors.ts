/**
 * [70] Build-flow API error vocabulary + the ONE HTTP mapping.
 *
 * Every `/api/build-flow**` failure answers the frozen envelope
 * `{error: {code, message}}` with the status from `BUILD_FLOW_ERROR_STATUS`
 * (single mapping, no per-route drift). `flow-busy` additionally carries the
 * `active` flow snapshot; `environment-not-ready` is delegated to the seeded
 * gate's canonical response (which adds `checks`). Messages are constructed
 * server-side and never embed absolute server paths or environment VALUES;
 * this module also strips control characters so no response can carry them.
 */
import "server-only";

import {
   BUILD_FLOW_ERROR_STATUS,
   type BuildFlowErrorCode,
} from "@/src/modules/studio/shared/contracts";

import {
   environmentNotReadyResponse,
   StudioEnvironmentError,
} from "../environment";

import type { BuildFlowRunSnapshot } from "@/src/modules/studio/shared/contracts";

/** Control characters never reach a response body. */
export function sanitizeFlowMessage(message: string): string {
   return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

/**
 * A build-flow failure carrying one CLOSED contract code. Both the routes
 * (HTTP-mapped failures) and the orchestrator (constructor/open failures)
 * throw this; `buildFlowErrorResponse` is the only place it becomes a status.
 */
export class BuildFlowApiError extends Error {
   readonly code: BuildFlowErrorCode;

   constructor(code: BuildFlowErrorCode, message: string) {
      super(sanitizeFlowMessage(message));
      this.name = "BuildFlowApiError";
      this.code = code;
   }
}

/** Thrown when a flow is requested while the ONE flow slot is busy (→ 409). */
export class BuildFlowBusyError extends Error {
   readonly active: BuildFlowRunSnapshot;

   constructor(active: BuildFlowRunSnapshot) {
      super(
         "Một luồng Build khác đang chạy; Studio chỉ chạy MỘT luồng Build tại một thời điểm.",
      );
      this.name = "BuildFlowBusyError";
      this.active = active;
   }
}

/** The single error → response mapping for every /api/build-flow** route. */
export function buildFlowErrorResponse(error: unknown): Response {
   if (error instanceof StudioEnvironmentError) {
      return environmentNotReadyResponse(error);
   }
   if (error instanceof BuildFlowBusyError) {
      return Response.json(
         {
            error: {
               code: "flow-busy",
               message: sanitizeFlowMessage(error.message),
            },
            active: error.active,
         },
         { status: BUILD_FLOW_ERROR_STATUS["flow-busy"] },
      );
   }
   if (error instanceof BuildFlowApiError) {
      return Response.json(
         {
            error: {
               code: error.code,
               message: sanitizeFlowMessage(error.message),
            },
         },
         { status: BUILD_FLOW_ERROR_STATUS[error.code] },
      );
   }
   return Response.json(
      {
         error: {
            code: "internal-error",
            message: "Unexpected server error in the one-click Build flow.",
         },
      },
      { status: BUILD_FLOW_ERROR_STATUS["internal-error"] },
   );
}
