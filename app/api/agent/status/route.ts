/**
 * [65] GET /api/agent/status — Claude Code + Figma MCP runtime preflight.
 *
 * The visible status the Studio AI workflow renders near its action
 * (`Claude Code: Đã kết nối/Chưa sẵn sàng`, `Figma MCP: ...`) plus whether
 * the shared DET runs root is configured. Every call re-runs detection in
 * child processes — the UI's "Kiểm tra lại" is authoritative; a cached UI
 * status is never authorization (the analysis start re-checks again anyway).
 *
 * `figmaMcp.ready` is registration + health-check truth from `claude mcp
 * list`; actual reachability is only ever proven by a bounded read-only call
 * inside a real analysis (the plan's `observed.grounded`).
 */
import { detectClaudeAgentStatus } from "@/src/modules/studio/server/claude-agent/claude-detect";
import { agentErrorResponse } from "@/src/modules/studio/server/claude-agent/agent-errors";

export async function GET(request: Request): Promise<Response> {
   // Request-time marker (Cache Components): fs/env are not tracked dynamic APIs.
   void request.headers.get("accept");

   try {
      const status = await detectClaudeAgentStatus();
      return Response.json({
         status,
         runsConfigured: process.env.STUDIO_DET_RUNS_DIR !== undefined,
      });
   } catch (error) {
      return agentErrorResponse(error);
   }
}
