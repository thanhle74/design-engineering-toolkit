/**
 * [65] POST /api/agent/analyses — start ONE Claude Code Figma analysis.
 *
 * Body: {fileKey, nodeId, baseConfigId}. All three are validated here
 * (patterns mirroring the conversion module's Figma input contract; the base
 * config id must resolve through the pattern-checked build-config catalog —
 * request input never names a server path). The authoritative preflight
 * re-check runs inside the runner immediately before the spawn: Claude Code
 * installed + authenticated + Figma MCP connected, else 503 agent-not-ready
 * WITH the concrete preflight status (the workflow stays blocked honestly —
 * no fake success, no demo fallback, no credential capture).
 *
 * 202 {analysisId, state} on accept; 409 analysis-busy with the active
 * analysis; the child is the installed `claude` CLI in non-interactive mode,
 * restricted by the verified flag stack (see analysis-runner).
 */
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";
import {
   FILE_KEY_PATTERN,
   NODE_ID_PATTERN,
} from "@/src/modules/studio/conversions/figma-input";
import {
   getAgentAnalysisRunner,
   AgentBusyError,
} from "@/src/modules/studio/server/claude-agent/analysis-runner";
import {
   agentErrorResponse,
   AgentWorkflowError,
} from "@/src/modules/studio/server/claude-agent/agent-errors";
import { detectClaudeAgentStatus } from "@/src/modules/studio/server/claude-agent/claude-detect";
import { assertRequestMatchesSourceIdentity } from "@/src/modules/studio/server/claude-agent/source-identity";

interface AnalysisStartBody {
   fileKey?: unknown;
   nodeId?: unknown;
   baseConfigId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");

   let body: AnalysisStartBody;
   try {
      body = (await request.json()) as AnalysisStartBody;
   } catch {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message:
                  'Request body must be JSON: {"fileKey": string, "nodeId": string, "baseConfigId": string}.',
            },
         },
         { status: 400 },
      );
   }
   const { fileKey, nodeId, baseConfigId } = body ?? {};
   if (typeof fileKey !== "string" || !FILE_KEY_PATTERN.test(fileKey)) {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message:
                  "fileKey is required and must match the Figma file key pattern.",
            },
         },
         { status: 400 },
      );
   }
   if (typeof nodeId !== "string" || !NODE_ID_PATTERN.test(nodeId)) {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message:
                  'nodeId is required and must match "123:456" (or "123-456", normalized to ":").',
            },
         },
         { status: 400 },
      );
   }
   if (typeof baseConfigId !== "string" || baseConfigId.length === 0) {
      return Response.json(
         {
            error: {
               code: "bad-request",
               message:
                  "baseConfigId is required and must be a non-empty string.",
            },
         },
         { status: 400 },
      );
   }

   try {
      // URL-spelled node ids (`123-456`) normalize to the API form (`123:456`) —
      // the form every later surface (prompt echo, plan echo, pinned tree
      // membership) uses.
      const normalizedNodeId = nodeId.replace("-", ":");
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
      const baseConfigPath = await catalog.resolveConfigPath(baseConfigId);
      // C65-3: the requested Figma source must EQUAL the selected base's
      // verified binding (committed source-identity.json) — checked BEFORE any
      // preflight or paid child. A different file (even with overlapping node
      // ids) or an arbitrary root never reaches the agent; another Figma file
      // would need its own pinned snapshot project (out of scope for [65]).
      await assertRequestMatchesSourceIdentity(
         { fileKey, nodeId: normalizedNodeId },
         baseConfigPath,
         baseConfigId,
      );
      // The AUTHORITATIVE preflight re-check happens inside runner.start()
      // immediately before the spawn — a cached UI status is never authorization.
      const runner = await getAgentAnalysisRunner();
      const snapshot = await runner.start(
         { fileKey, nodeId: normalizedNodeId, baseConfigId },
         baseConfigPath,
      );
      return Response.json(
         { analysisId: snapshot.analysisId, state: snapshot.state },
         { status: 202 },
      );
   } catch (error) {
      if (error instanceof AgentBusyError) {
         return Response.json(
            {
               error: { code: "analysis-busy", message: error.message },
               active: error.active,
            },
            { status: 409 },
         );
      }
      if (
         error instanceof AgentWorkflowError &&
         error.code === "agent-not-ready"
      ) {
         // Re-run detection for the response payload (cheap, already the
         // authoritative preflight from the failed start is equivalent).
         const status = await detectClaudeAgentStatus().catch(() => null);
         return Response.json(
            {
               error: { code: "agent-not-ready", message: error.message },
               status,
            },
            { status: 503 },
         );
      }
      return agentErrorResponse(error);
   }
}
