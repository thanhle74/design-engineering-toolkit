/**
 * [65] Agent workflow error mapping for `/api/agent/**` routes.
 *
 * The agent surface has its own closed error vocabulary (it must not stretch
 * the reader/build contracts with AI-specific states):
 *  - not-configured → 503 (env/env-value never echoed, only the env NAME)
 *  - agent-not-ready → 503 with the preflight status payload
 *  - analysis-not-found → 404
 *  - analysis-not-approvable / no-pinned-assignments → 409
 *  - base-config-invalid / base-projection-unavailable / workspace-error → 500
 *    (a base project that passed catalog resolution but fails materialization
 *    is a server-side truth problem, not a client mistake)
 *  - build-busy (reused BuildBusyError from the deterministic build runner,
 *    whose single slot the approval flow occupies) → 409 with the active job
 *  - DetRunReaderError (catalog resolution inside the agent routes: unknown
 *    base config id, unconfigured runs root) → the SAME closed status map the
 *    other /api/runs + /api/builds routes already use — the agent surface
 *    stays consistent with established codes instead of diverging.
 *  - anything else → 500 internal-error; messages sanitized of control chars.
 */
import "server-only";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import { BuildBusyError } from "../build-runner";
import { MaterializeError } from "./plan-materializer";

export class AgentWorkflowError extends Error {
  readonly code:
    | "not-configured"
    | "agent-not-ready"
    | "analysis-not-found"
    | "analysis-not-approvable"
    | "analysis-not-cancellable"
    | "analysis-cancelled"
    | "base-source-mismatch"
    | "invalid-request";

  constructor(code: AgentWorkflowError["code"], message: string) {
    super(message);
    this.name = "AgentWorkflowError";
    this.code = code;
  }
}

/** Control characters never reach a response body. */
function sanitizeMessage(message: string): string {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

/** The reader codes carry their own established statuses ([29]/[40]). */
const STATUS_BY_READER_CODE: Record<DetRunReaderError["code"], number> = {
  "not-configured": 503,
  "run-not-found": 404,
  "artifact-not-found": 404,
  "artifact-not-downloadable": 403,
  "path-refused": 400,
  "invalid-payload": 500,
};

const STATUS_BY_AGENT_CODE: Record<AgentWorkflowError["code"], number> = {
  "not-configured": 503,
  "agent-not-ready": 503,
  "analysis-not-found": 404,
  "analysis-not-approvable": 409,
  "analysis-not-cancellable": 409,
  // A start that was cancelled while still at preflight (C65-1 queued
  // placeholder) — nothing was ever spawned.
  "analysis-cancelled": 409,
  // C65-3: the requested Figma source is not the base project's verified
  // binding — a client-correctable mistake, never a server fault.
  "base-source-mismatch": 422,
  "invalid-request": 400,
};

const STATUS_BY_MATERIALIZE_CODE: Record<MaterializeError["code"], number> = {
  "base-config-invalid": 500,
  "base-projection-unavailable": 500,
  "no-pinned-assignments": 409,
  "workspace-error": 500,
};

export function agentErrorResponse(error: unknown): Response {
  if (error instanceof AgentWorkflowError) {
    return Response.json(
      { error: { code: error.code, message: sanitizeMessage(error.message) } },
      { status: STATUS_BY_AGENT_CODE[error.code] }
    );
  }
  if (error instanceof MaterializeError) {
    return Response.json(
      { error: { code: error.code, message: sanitizeMessage(error.message) } },
      { status: STATUS_BY_MATERIALIZE_CODE[error.code] }
    );
  }
  if (error instanceof BuildBusyError) {
    return Response.json(
      { error: { code: "build-busy", message: sanitizeMessage(error.message) }, active: error.active },
      { status: 409 }
    );
  }
  if (error instanceof DetRunReaderError) {
    return Response.json(
      { error: { code: error.code, message: sanitizeMessage(error.message) } },
      { status: STATUS_BY_READER_CODE[error.code] }
    );
  }
  return Response.json(
    { error: { code: "internal-error", message: "Unexpected server error in the AI workflow." } },
    { status: 500 }
  );
}
