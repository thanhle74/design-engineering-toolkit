/**
 * [70] Pure view-helper tests for the one-click Build screen — every mapping
 * the Steps/detail rendering relies on, against the frozen contract values.
 * No React, no fetch, no DOM.
 */
import { describe, expect, it } from "vitest";

import type {
   BuildFlowRunSnapshot,
   BuildFlowStageRecord,
   StudioReadinessStatus,
} from "@/src/modules/studio/shared/contracts/build-flow";

import {
   ANALYSIS_ID_PATTERN,
   DEMO_FIGMA_SOURCE,
   failingChecks,
   figmaUrlFromRequest,
   flowBuildRunId,
   isLiveFlowState,
   isTerminalFlowState,
   readinessGate,
   stageLabel,
   stageStatusLabel,
   stageStatusTagColor,
   stageStepStatus,
} from "./build-flow-view";

describe("frozen demo source", () => {
   it("is the verified Slaunchpad home URL with the dashed node id", () => {
      expect(DEMO_FIGMA_SOURCE).toBe(
         "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/slaunchpad-home?node-id=245-2",
      );
   });
});

describe("flow state predicates", () => {
   it("treats exactly completed/failed/cancelled/interrupted as terminal", () => {
      expect(isTerminalFlowState("completed")).toBe(true);
      expect(isTerminalFlowState("failed")).toBe(true);
      expect(isTerminalFlowState("cancelled")).toBe(true);
      expect(isTerminalFlowState("interrupted")).toBe(true);
      expect(isTerminalFlowState("queued")).toBe(false);
      expect(isTerminalFlowState("running")).toBe(false);
   });

   it("treats only queued/running as live", () => {
      expect(isLiveFlowState("queued")).toBe(true);
      expect(isLiveFlowState("running")).toBe(true);
      expect(isLiveFlowState("completed")).toBe(false);
      expect(isLiveFlowState("failed")).toBe(false);
   });
});

describe("stageStepStatus — snapshot status to stock antd Steps status", () => {
   it("maps every frozen status honestly", () => {
      expect(stageStepStatus("pending")).toBe("wait");
      expect(stageStepStatus("skipped")).toBe("wait");
      expect(stageStepStatus("running")).toBe("process");
      expect(stageStepStatus("success")).toBe("finish");
      expect(stageStepStatus("warning")).toBe("finish");
      expect(stageStepStatus("failure")).toBe("error");
      expect(stageStepStatus("cancelled")).toBe("error");
   });

   it("keeps the frozen Vietnamese stage/status labels", () => {
      expect(stageLabel("verify-source")).toBe("Xác thực nguồn");
      expect(stageLabel("results")).toBe("Kết quả");
      expect(stageStatusLabel("warning")).toBe("Có cảnh báo");
      expect(stageStatusLabel("failure")).toBe("Thất bại");
   });

   it("maps stage statuses to stock antd Tag presets", () => {
      expect(stageStatusTagColor("running")).toBe("processing");
      expect(stageStatusTagColor("success")).toBe("success");
      expect(stageStatusTagColor("warning")).toBe("warning");
      expect(stageStatusTagColor("failure")).toBe("error");
      expect(stageStatusTagColor("cancelled")).toBe("warning");
      expect(stageStatusTagColor("pending")).toBe("default");
   });
});

describe("flowBuildRunId", () => {
   it("returns the last non-null buildRunId across the six rows", () => {
      const snapshot = {
         stages: [
            row("verify-source", { buildRunId: null }),
            row("snapshot", { buildRunId: null }),
            row("ai-analysis", { buildRunId: null }),
            row("mapping", { buildRunId: null }),
            row("compose", { buildRunId: "run-1" }),
            row("results", { buildRunId: "run-2" }),
         ],
      } as unknown as BuildFlowRunSnapshot;
      expect(flowBuildRunId(snapshot)).toBe("run-2");
   });

   it("returns null when no row carries a buildRunId", () => {
      const snapshot = {
         stages: [
            row("verify-source", {}),
            row("snapshot", {}),
            row("ai-analysis", {}),
            row("mapping", {}),
            row("compose", {}),
            row("results", {}),
         ],
      };
      expect(flowBuildRunId(snapshot as BuildFlowRunSnapshot)).toBeNull();
   });
});

describe("figmaUrlFromRequest", () => {
   it("back-spells the analysis request into the pinned design URL", () => {
      expect(figmaUrlFromRequest("vNPtfBRpYM3PsExirVqhmt", "245:2")).toBe(
         DEMO_FIGMA_SOURCE,
      );
   });
});

describe("ANALYSIS_ID_PATTERN", () => {
   it("accepts only agent-<digits> deep links", () => {
      expect(ANALYSIS_ID_PATTERN.test("agent-910001")).toBe(true);
      expect(ANALYSIS_ID_PATTERN.test("agent-abc")).toBe(false);
      expect(ANALYSIS_ID_PATTERN.test("../etc/passwd")).toBe(false);
      expect(ANALYSIS_ID_PATTERN.test("")).toBe(false);
   });
});

describe("readinessGate — the four frozen gate states", () => {
   const READY: StudioReadinessStatus = {
      ready: true,
      checks: {
         claudeCode: {
            ready: true,
            version: "2.1.322",
            reasonCode: "ok",
         },
         figmaMcp: {
            ready: true,
            listed: true,
            serverName: "plugin:figma:figma",
            reasonCode: "ok",
         },
         detRunsDir: {
            ready: true,
            reasonCode: "ok",
            envName: "STUDIO_DET_RUNS_DIR",
         },
      },
   };
   const NOT_READY: StudioReadinessStatus = {
      ready: false,
      checks: {
         claudeCode: READY.checks.claudeCode,
         figmaMcp: READY.checks.figmaMcp,
         detRunsDir: {
            ready: false,
            reasonCode: "not-configured",
            envName: "STUDIO_DET_RUNS_DIR",
         },
      },
   };

   it("blocks while checking", () => {
      const gate = readinessGate(null, true, null);
      expect(gate).toMatchObject({ blocked: true, label: "Đang kiểm tra" });
   });

   it("blocks with Chưa kiểm tra when no result exists", () => {
      const gate = readinessGate(null, false, null);
      expect(gate).toMatchObject({ blocked: true, label: "Chưa kiểm tra" });
   });

   it("blocks with Lỗi when the check transport failed", () => {
      const gate = readinessGate(
         null,
         false,
         "Kiểm tra môi trường thất bại (HTTP 500).",
      );
      expect(gate.blocked).toBe(true);
      expect(gate.label).toBe("Lỗi");
      expect(gate.detail).toContain("HTTP 500");
   });

   it("blocks with the failing checks spelled out when not ready", () => {
      const gate = readinessGate(NOT_READY, false, null);
      expect(gate).toMatchObject({ blocked: true, label: "Chưa sẵn sàng" });
      expect(gate.detail).toContain("STUDIO_DET_RUNS_DIR");
      expect(gate.detail).toContain("not-configured");
   });

   it("unblocks when every check is ready", () => {
      const gate = readinessGate(READY, false, null);
      expect(gate).toEqual({ blocked: false, label: "Sẵn sàng", detail: "" });
   });
});

describe("failingChecks", () => {
   it("lists only the failing checks with machine tokens verbatim", () => {
      const reasons = failingChecks({
         claudeCode: {
            ready: false,
            version: null,
            reasonCode: "not-authenticated",
         },
         figmaMcp: {
            ready: true,
            listed: true,
            serverName: "plugin:figma:figma",
            reasonCode: "ok",
         },
         detRunsDir: {
            ready: false,
            reasonCode: "not-a-directory",
            envName: "STUDIO_DET_RUNS_DIR",
         },
      });
      expect(reasons).toHaveLength(2);
      expect(reasons[0]).toContain("Claude Code");
      expect(reasons[0]).toContain("not-authenticated");
      expect(reasons[1]).toContain("STUDIO_DET_RUNS_DIR");
      expect(reasons[1]).toContain("not-a-directory");
   });
});

function row(
   stage: BuildFlowStageRecord["stage"],
   overrides: Partial<BuildFlowStageRecord> = {},
): BuildFlowStageRecord {
   return {
      stage,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      analysisId: null,
      buildRunId: null,
      message: null,
      ...overrides,
   };
}
