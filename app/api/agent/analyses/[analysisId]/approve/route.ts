/**
 * [65] POST /api/agent/analyses/[analysisId]/approve — the operator GO.
 *
 * Requires a terminal plan-ready + grounded analysis. The materializer
 * (deterministic code, never the AI) copies the version-pinned base build
 * project into the analysis workspace, replaces ONLY semantic-projection.json
 * with the approved assignments that reference the pinned snapshot source
 * (unmatched proposals are dropped and reported), then starts the EXISTING
 * deterministic `det build` through the shared single-slot build runner.
 * The build's run id comes back so the UI can link to the ordinary run view
 * with its genuine MAPPED/GAP dispositions, provenance and download.
 *
 * 202 {buildRunId, state}; 409 when the analysis is not approvable / nothing
 * survives the pinned-source check / the build slot is busy; 404 unknown id;
 * 503 when build control is not configured.
 *
 * [70] Mutation gate: approval starts a NEW `det build`, so POST re-checks
 * the server environment (`assertStudioEnvironmentReady`) first and fails
 * closed with 503 `environment-not-ready` + per-check `{checks}` — before
 * any lookup, materialization or spawn. The route has no request body, so
 * there are no body validations to order ahead of the gate; a broken
 * environment blocks every approval attempt regardless of the analysis id.
 */
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";
import {
   agentErrorResponse,
   AgentWorkflowError,
} from "@/src/modules/studio/server/claude-agent/agent-errors";
import { getAgentAnalysisRunner } from "@/src/modules/studio/server/claude-agent/analysis-runner";
import { materializeApprovedInputs } from "@/src/modules/studio/server/claude-agent/plan-materializer";
import {
   assertStudioEnvironmentReady,
   environmentNotReadyResponse,
   StudioEnvironmentError,
} from "@/src/modules/studio/server/environment/index";
import { assertRequestMatchesSourceIdentity } from "@/src/modules/studio/server/claude-agent/source-identity";
import { isApprovableOutcome } from "@/src/modules/studio/shared/contracts";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export async function POST(
   request: Request,
   context: { params: Promise<{ analysisId: string }> },
): Promise<Response> {
   void request.headers.get("accept");

   try {
      // [70] Authoritative environment re-check FIRST — approval accepts new
      // work (a build), so nothing (not even the id lookup) runs when the
      // environment is not ready (fail closed 503 + checks).
      await assertStudioEnvironmentReady();
      const { analysisId } = await context.params;
      const agentRunner = await getAgentAnalysisRunner();
      const result = await agentRunner.result(analysisId);
      if (result === null) {
         throw new AgentWorkflowError(
            "analysis-not-found",
            "No analysis matches the requested id.",
         );
      }
      const { snapshot, plan } = result;
      if (snapshot.outcome === null || !isApprovableOutcome(snapshot.outcome)) {
         throw new AgentWorkflowError(
            "analysis-not-approvable",
            "Only a terminal plan-ready analysis can be approved.",
         );
      }
      if (
         plan === null ||
         snapshot.grounded !== true ||
         snapshot.baseConfigPath === null
      ) {
         throw new AgentWorkflowError(
            "analysis-not-approvable",
            "The analysis has no grounded plan or no resolved base build config.",
         );
      }
      // C65-3, authoritative at approval time: the plan's requested source must
      // still EQUAL the base project's verified binding before anything is
      // materialized or built. (The analysis start check alone is not enough —
      // the binding could differ by the time an operator approves.)
      await assertRequestMatchesSourceIdentity(
         { fileKey: plan.requested.fileKey, nodeId: plan.requested.nodeId },
         snapshot.baseConfigPath,
         snapshot.request.baseConfigId,
      );

      const analysisDir = path.join(
         await resolveRunsRootForApprove(),
         ".agent-analyses",
         analysisId,
      );
      await mkdir(analysisDir, { recursive: true });

      const { approvedConfigPath, record } = await materializeApprovedInputs({
         analysisId,
         plan,
         baseConfigPath: snapshot.baseConfigPath,
         analysisDir,
      });

      // The deterministic engine consumes the frozen inputs through the SAME
      // single-slot build runner as every manual build (409 busy propagates).
      const buildRunner = await getBuildRunner();
      const buildSnapshot = await buildRunner.start(
         snapshot.request.baseConfigId,
         approvedConfigPath,
      );
      return Response.json(
         {
            buildRunId: buildSnapshot.runId,
            state: buildSnapshot.state,
            approval: record,
         },
         { status: 202 },
      );
   } catch (error) {
      if (error instanceof StudioEnvironmentError) {
         return environmentNotReadyResponse(error);
      }
      return agentErrorResponse(error);
   }
}

/** The agent runner already validated this env; resolve it once more for the path. */
async function resolveRunsRootForApprove(): Promise<string> {
   const configuredRoot = process.env.STUDIO_DET_RUNS_DIR;
   if (configuredRoot === undefined || configuredRoot.trim() === "") {
      throw new AgentWorkflowError(
         "not-configured",
         "The AI workflow requires STUDIO_DET_RUNS_DIR (analyses journal + persist there).",
      );
   }
   return path.resolve(configuredRoot);
}
