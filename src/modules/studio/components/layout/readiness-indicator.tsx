"use client";

/**
 * [70] Header readiness cluster — the compact environment-readiness display
 * next to the shell nav. Pure presentation: ALL state comes from the frozen
 * `useStudioReadiness()` hook (the provider in `src/modules/studio/readiness`
 * is the only data source; this file does no fetching).
 *
 * The four display states are exactly the [70] header contract:
 *  - "Đã kết nối"    — status && status.ready
 *  - "Chưa kiểm tra" — status === null && !checking && !error
 *  - "Đang kiểm tra" — checking (wins over a stale error/failed status while
 *    a re-check is in flight)
 *  - "Lỗi"           — error !== null || (status && !status.ready)
 *
 * In the "Lỗi" state the status chip is a click-triggered antd `Popover`
 * (click/focus accessible, never hover-only) listing the three frozen checks
 * with their machine tokens verbatim (reasonCode strings, the detected
 * version/serverName, the `STUDIO_DET_RUNS_DIR` env NAME — never its value)
 * plus one short Vietnamese explanation each; a transport failure shows its
 * message there when no status body exists to row out.
 *
 * [61] stock Ant Design light holds here too: the only component APIs used
 * beyond defaults are `Tag` PRESET status colors (`success`/`processing`/
 * `default`/`error` — documented enum values, not theme tokens or CSS),
 * `Typography.Text` preset `type` colors on the per-check icons, the stock
 * `Button loading` spinner (which also blocks double-submits) and the
 * click-triggered `Popover`. No style props, no ConfigProvider, light only.
 */
import {
   CheckCircleFilled,
   CloseCircleFilled,
   LoadingOutlined,
} from "@ant-design/icons";
import { Button, Flex, Popover, Tag, Typography } from "antd";

import { useStudioReadiness } from "@/src/modules/studio/readiness";
import type { StudioReadinessStatus } from "@/src/modules/studio/shared/contracts/build-flow";

export type StudioReadinessDisplayState =
   "connected" | "unchecked" | "checking" | "error";

export const STUDIO_READINESS_STATE_LABELS_VI: Record<
   StudioReadinessDisplayState,
   string
> = {
   connected: "Đã kết nối",
   unchecked: "Chưa kiểm tra",
   checking: "Đang kiểm tra",
   error: "Lỗi",
};

const STUDIO_READINESS_TAG_COLORS: Record<
   StudioReadinessDisplayState,
   "success" | "processing" | "default" | "error"
> = {
   connected: "success",
   unchecked: "default",
   checking: "processing",
   error: "error",
};

/**
 * Deterministic precedence for the four header states (checked in order —
 * the first matching condition wins; exported for tests).
 */
export function resolveStudioReadinessState(
   status: StudioReadinessStatus | null,
   checking: boolean,
   error: string | null,
): StudioReadinessDisplayState {
   if (checking) return "checking";
   if (status && status.ready) return "connected";
   if (status === null && error === null) return "unchecked";
   return "error";
}

/**
 * Short Vietnamese explanation per KNOWN reason code. Machine tokens
 * (reasonCode strings) always render verbatim next to the explanation; an
 * unknown code keeps its generic fallback instead of inventing a meaning.
 * Codes mirror the [65] preflight vocabulary (claudeCode/figmaMcp) and the
 * frozen `StudioDetRunsDirReasonCode` set — copied here, NOT imported, so
 * the layout lane stays decoupled from the agent lane internals.
 */
const CLAUDE_CODE_REASONS_VI: Record<string, string> = {
   ok: "Claude Code CLI đã sẵn sàng.",
   "not-installed": "Chưa phát hiện Claude Code CLI (lệnh `claude`).",
   "version-unparseable": "Không đọc được phiên bản của Claude Code.",
   "auth-status-unparseable":
      "Không đọc được trạng thái đăng nhập của Claude Code.",
   "not-authenticated": "Claude Code chưa đăng nhập.",
};

const FIGMA_MCP_REASONS_VI: Record<string, string> = {
   ok: "Figma MCP đã kết nối.",
   "mcp-list-unparseable": "Không đọc được danh sách MCP của Claude Code.",
   "mcp-not-listed": "Figma MCP chưa được khai báo trong Claude Code.",
   "mcp-not-connected":
      "Figma MCP đã khai báo nhưng chưa kết nối được qua Claude Code.",
};

const DET_RUNS_DIR_REASONS_VI: Record<string, string> = {
   ok: "Thư mục kết quả đã được cấu hình.",
   "not-configured": "Chưa cấu hình biến môi trường STUDIO_DET_RUNS_DIR.",
   "not-a-directory": "STUDIO_DET_RUNS_DIR không trỏ tới một thư mục hợp lệ.",
};

const UNKNOWN_REASON_FALLBACK_VI =
   "Trạng thái chưa xác định — bấm Kiểm tra để kiểm tra lại.";

interface CheckRowSpec {
   /** Check name — machine vocabulary, never translated. */
   name: string;
   ready: boolean;
   /** The verbatim machine value (version / serverName / reasonCode). */
   machineValue: string;
   explanation: string;
}

export function buildCheckRows(status: StudioReadinessStatus): CheckRowSpec[] {
   const { claudeCode, figmaMcp, detRunsDir } = status.checks;
   return [
      {
         name: "Claude Code",
         ready: claudeCode.ready,
         machineValue: claudeCode.version ?? claudeCode.reasonCode,
         explanation:
            CLAUDE_CODE_REASONS_VI[claudeCode.reasonCode] ??
            UNKNOWN_REASON_FALLBACK_VI,
      },
      {
         name: "Figma MCP",
         ready: figmaMcp.ready,
         machineValue: figmaMcp.serverName ?? figmaMcp.reasonCode,
         explanation:
            FIGMA_MCP_REASONS_VI[figmaMcp.reasonCode] ??
            UNKNOWN_REASON_FALLBACK_VI,
      },
      {
         name: detRunsDir.envName,
         ready: detRunsDir.ready,
         machineValue: detRunsDir.reasonCode,
         explanation:
            DET_RUNS_DIR_REASONS_VI[detRunsDir.reasonCode] ??
            UNKNOWN_REASON_FALLBACK_VI,
      },
   ];
}

function ReadinessCheckRows({ status }: { status: StudioReadinessStatus }) {
   const rows = buildCheckRows(status);
   return (
      <Flex vertical gap="small">
         {rows.map((row) => (
            <Flex
               key={row.name}
               vertical
               gap={2}
               data-testid={`readiness-check-${row.name}`}
            >
               <Flex align="center" gap="small">
                  <Typography.Text
                     type={row.ready ? "success" : "danger"}
                     aria-hidden="true"
                  >
                     {row.ready ? (
                        <CheckCircleFilled aria-hidden="true" />
                     ) : (
                        <CloseCircleFilled aria-hidden="true" />
                     )}
                  </Typography.Text>
                  <Typography.Text strong>{row.name}</Typography.Text>
                  <Typography.Text code>{row.machineValue}</Typography.Text>
               </Flex>
               <Typography.Text type="secondary">
                  {row.explanation}
               </Typography.Text>
            </Flex>
         ))}
      </Flex>
   );
}

export function ReadinessIndicator() {
   const { status, checking, error, recheck } = useStudioReadiness();
   const state = resolveStudioReadinessState(status, checking, error);
   const failed = state === "error";

   const statusChip = (
      <Tag color={STUDIO_READINESS_TAG_COLORS[state]}>
         <Flex align="center" gap={4}>
            {state === "checking" ? (
               <LoadingOutlined aria-hidden="true" spin />
            ) : null}
            {STUDIO_READINESS_STATE_LABELS_VI[state]}
         </Flex>
      </Tag>
   );

   return (
      <Flex align="center" gap="small" aria-label="Trạng thái môi trường">
         {failed ? (
            <Popover
               title="Trạng thái môi trường"
               trigger="click"
               content={
                  <Flex vertical gap="small">
                     {status !== null ? (
                        <ReadinessCheckRows status={status} />
                     ) : null}
                     {error !== null ? (
                        <Typography.Text type="secondary">
                           {error}
                        </Typography.Text>
                     ) : null}
                  </Flex>
               }
            >
               {statusChip}
            </Popover>
         ) : (
            statusChip
         )}
         <Button onClick={recheck} loading={checking}>
            Kiểm tra
         </Button>
      </Flex>
   );
}
