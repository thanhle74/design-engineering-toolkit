/**
 * [70] Pure view helpers of the one-click Build screen — no React, no fetch,
 * no antd imports. Every human label comes from the frozen contract
 * (`shared/contracts/build-flow.ts`); this module only maps REAL snapshot
 * facts to view values. No progress percent, no elapsed times, no synthesized
 * success claims anywhere — statuses come only from `BuildFlowRunSnapshot`.
 */
import {
   BUILD_FLOW_STAGE_LABELS_VI,
   BUILD_FLOW_STAGE_STATUS_LABELS_VI,
   type BuildFlowRunSnapshot,
   type BuildFlowStageName,
   type BuildFlowStageStatus,
   type BuildFlowState,
   type StudioReadinessChecks,
   type StudioReadinessStatus,
} from "@/src/modules/studio/shared/contracts/build-flow";

/**
 * The frozen verified demo source — the ONE committed source-identity binding
 * (`resources/examples/build/slaunchpad-home-real-derived`, node 245:2,
 * providerRevisionId 2417494580183108397). Prefilled, not forced: the server
 * still binds whatever the operator pastes and fails closed on no match.
 */
export const DEMO_FIGMA_SOURCE =
   "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/slaunchpad-home?node-id=245-2";

export const DEMO_SOURCE_HINT =
   "Nguồn Homepage Slaunchpad đã xác minh — node 245:2, revision pin 2417494580183108397";

/** Frozen: poll `GET /api/build-flow/:id` every 2 seconds. */
export const POLL_INTERVAL_MS = 2000;

/** `?analysis=` deep-link ids use the same `agent-<digits>` shape /agent sets. */
export const ANALYSIS_ID_PATTERN = /^agent-\d+$/;

const TERMINAL_FLOW_STATES: ReadonlySet<BuildFlowState> = new Set([
   "completed",
   "failed",
   "cancelled",
   "interrupted",
]);

export function isTerminalFlowState(state: BuildFlowState): boolean {
   return TERMINAL_FLOW_STATES.has(state);
}

export function isLiveFlowState(state: BuildFlowState): boolean {
   return state === "queued" || state === "running";
}

/**
 * Snapshot stage status → stock antd `Steps` item status. `warning` renders
 * `finish` plus a stock warning `Tag` in the step title (Steps itself has no
 * warning status); `skipped` honestly stays `wait` (not done, not an error).
 */
export function stageStepStatus(
   status: BuildFlowStageStatus,
): "wait" | "process" | "finish" | "error" {
   switch (status) {
      case "pending":
      case "skipped":
         return "wait";
      case "running":
         return "process";
      case "success":
      case "warning":
         return "finish";
      case "failure":
      case "cancelled":
         return "error";
   }
}

/** Stock antd Tag status presets for a stage-status chip. */
export function stageStatusTagColor(
   status: BuildFlowStageStatus,
): "default" | "processing" | "success" | "warning" | "error" {
   switch (status) {
      case "pending":
      case "skipped":
         return "default";
      case "running":
         return "processing";
      case "success":
         return "success";
      case "warning":
      case "cancelled":
         return "warning";
      case "failure":
         return "error";
   }
}

export function stageLabel(stage: BuildFlowStageName): string {
   return BUILD_FLOW_STAGE_LABELS_VI[stage];
}

export function stageStatusLabel(status: BuildFlowStageStatus): string {
   return BUILD_FLOW_STAGE_STATUS_LABELS_VI[status];
}

/**
 * The build-run id a completed flow links to: the last non-null
 * `buildRunId` across the six rows (contract: `compose` drives the det build;
 * a later `results` row may carry the same id). Never invented.
 */
export function flowBuildRunId(snapshot: BuildFlowRunSnapshot): string | null {
   let found: string | null = null;
   for (const row of snapshot.stages) {
      if (row.buildRunId !== null) found = row.buildRunId;
   }
   return found;
}

/**
 * `?analysis=` prefill — the analysis request back-spelled as a design URL
 * (file key verbatim, node id with dashes, pinned project name). Pure string
 * construction; the parser re-validates whatever lands in the input.
 */
export function figmaUrlFromRequest(fileKey: string, nodeId: string): string {
   return `https://www.figma.com/design/${fileKey}/slaunchpad-home?node-id=${nodeId.replace(":", "-")}`;
}

export interface ReadinessGate {
   blocked: boolean;
   /** Terse Vietnamese gate label shown next to the Build button. */
   label: string;
   /** Longer tooltip text explaining WHY the button is blocked. */
   detail: string;
}

/**
 * The four readiness gate states, from the frozen hook contract
 * (`useStudioReadiness`): checking → "Đang kiểm tra"; no result yet →
 * "Chưa kiểm tra" (transport failure → "Lỗi"); checked but not ready →
 * "Chưa sẵn sàng" with the failing checks spelled out. UI state is never
 * authorization — the server re-checks every mutation itself.
 */
export function readinessGate(
   status: StudioReadinessStatus | null,
   checking: boolean,
   error: string | null,
): ReadinessGate {
   if (checking) {
      return {
         blocked: true,
         label: "Đang kiểm tra",
         detail:
            "Đang kiểm tra môi trường (Claude Code, Figma MCP, STUDIO_DET_RUNS_DIR). Nút Build mở lại khi kiểm tra xong.",
      };
   }
   if (status === null) {
      return {
         blocked: true,
         label: error !== null ? "Lỗi" : "Chưa kiểm tra",
         detail:
            error ??
            "Chưa có kết quả kiểm tra môi trường nào — bấm Kiểm tra lại.",
      };
   }
   if (!status.ready) {
      return {
         blocked: true,
         label: "Chưa sẵn sàng",
         detail: failingChecks(status.checks).join(" · "),
      };
   }
   return { blocked: false, label: "Sẵn sàng", detail: "" };
}

/** Per-check Vietnamese reasons; machine tokens (reasonCode, envName) verbatim. */
export function failingChecks(checks: StudioReadinessChecks): string[] {
   const reasons: string[] = [];
   if (!checks.claudeCode.ready) {
      reasons.push(
         `Claude Code chưa sẵn sàng (mã: ${checks.claudeCode.reasonCode})`,
      );
   }
   if (!checks.figmaMcp.ready) {
      reasons.push(
         `Figma MCP chưa kết nối (mã: ${checks.figmaMcp.reasonCode})`,
      );
   }
   if (!checks.detRunsDir.ready) {
      reasons.push(
         `${checks.detRunsDir.envName} chưa dùng được (mã: ${checks.detRunsDir.reasonCode})`,
      );
   }
   return reasons;
}
