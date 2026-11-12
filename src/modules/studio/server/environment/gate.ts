/**
 * [70] Studio server environment readiness gate — SEEDED by the Integrator
 * (contract freeze); lane W-B OWNS this directory from here on and may
 * refactor internals freely, but the exported names/signatures below are the
 * frozen cross-lane contract consumed by W-C (orchestrator) and the gated
 * mutation routes.
 *
 * Readiness is FACTUAL and server-side: every mutating Studio route (POST
 * /api/builds, POST /api/agent/analyses, POST .../approve, POST
 * /api/build-flow) re-checks immediately before accepting work and fails
 * closed with `environment-not-ready` (503) + machine reason checks. UI state
 * is never authorization. GET routes, artifact reads and safe cancels are
 * never gated.
 *
 * Checks:
 *  - claudeCode + figmaMcp: the real [65] preflight (`detectClaudeAgentStatus`)
 *    — installed+authenticated `claude` CLI and a CONNECTED Figma MCP server.
 *  - detRunsDir: `STUDIO_DET_RUNS_DIR` must be set and point at an existing
 *    directory (the root launcher creates/defaults it; a bare `next dev`
 *    without it stays honestly blocked).
 */
import "server-only";

import type { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";

import {
   type StudioReadinessChecks,
   type StudioReadinessStatus,
} from "@/src/modules/studio/shared/contracts/build-flow";

import {
   detectClaudeAgentStatus,
   type ClaudeAgentPreflight,
} from "../claude-agent/claude-detect";
import { STUDIO_DET_RUNS_DIR_ENV } from "../det-run-reader-factory";

/** Thrown by the guard when any readiness element is not ready (→ 503). */
export class StudioEnvironmentError extends Error {
   readonly code = "environment-not-ready";
   readonly checks: StudioReadinessChecks;

   constructor(checks: StudioReadinessChecks) {
      super(
         "Môi trường chưa sẵn sàng: một hoặc nhiều kiểm tra Claude Code / Figma MCP / STUDIO_DET_RUNS_DIR chưa đạt — mọi thao tác Build mới bị chặn phía server.",
      );
      this.name = "StudioEnvironmentError";
      this.checks = checks;
   }
}

async function checkDetRunsDir(): Promise<StudioReadinessChecks["detRunsDir"]> {
   const configured = process.env[STUDIO_DET_RUNS_DIR_ENV];
   if (configured === undefined || configured.trim() === "") {
      return {
         ready: false,
         reasonCode: "not-configured",
         envName: "STUDIO_DET_RUNS_DIR",
      };
   }
   try {
      const resolved = await realpath(configured);
      const info = await stat(resolved).catch(() => null);
      if (info === null || !info.isDirectory()) {
         return {
            ready: false,
            reasonCode: "not-a-directory",
            envName: "STUDIO_DET_RUNS_DIR",
         };
      }
      return {
         ready: true,
         reasonCode: "ok",
         envName: "STUDIO_DET_RUNS_DIR",
      };
   } catch {
      return {
         ready: false,
         reasonCode: "not-a-directory",
         envName: "STUDIO_DET_RUNS_DIR",
      };
   }
}

function mergeChecks(
   preflight: ClaudeAgentPreflight,
   detRunsDir: StudioReadinessChecks["detRunsDir"],
): StudioReadinessChecks {
   return {
      claudeCode: {
         ready: preflight.claudeCode.ready,
         version: preflight.claudeCode.version,
         reasonCode: preflight.claudeCode.reasonCode,
      },
      figmaMcp: {
         ready: preflight.figmaMcp.ready,
         listed: preflight.figmaMcp.listed,
         serverName: preflight.figmaMcp.serverName,
         reasonCode: preflight.figmaMcp.reasonCode,
      },
      detRunsDir,
   };
}

/**
 * Run the full readiness status. Never throws for an unready environment —
 * detection failures land in the per-check reason codes (this endpoint IS the
 * check, so GET /api/environment stays ungated).
 */
export async function getStudioReadiness(
   opts: { spawnImpl?: typeof spawn } = {},
): Promise<StudioReadinessStatus> {
   const [preflight, detRunsDir] = await Promise.all([
      detectClaudeAgentStatus({ spawnImpl: opts.spawnImpl }),
      checkDetRunsDir(),
   ]);
   const checks = mergeChecks(preflight, detRunsDir);
   return {
      ready:
         checks.claudeCode.ready &&
         checks.figmaMcp.ready &&
         checks.detRunsDir.ready,
      checks,
   };
}

/**
 * The AUTHORITATIVE mutation guard: re-runs the real checks immediately
 * before accepting any new Build/AI work and throws StudioEnvironmentError
 * (`environment-not-ready`, 503) when anything fails. Routes map the error to
 * the canonical envelope `{error: {code, message}, checks}`.
 */
export async function assertStudioEnvironmentReady(
   opts: { spawnImpl?: typeof spawn } = {},
): Promise<StudioReadinessChecks> {
   const status = await getStudioReadiness(opts);
   if (!status.ready) throw new StudioEnvironmentError(status.checks);
   return status.checks;
}

/** Canonical JSON envelope for a StudioEnvironmentError (→ 503). */
export function environmentNotReadyResponse(
   error: StudioEnvironmentError,
): Response {
   return Response.json(
      {
         error: { code: error.code, message: error.message },
         checks: error.checks,
      },
      { status: 503 },
   );
}
