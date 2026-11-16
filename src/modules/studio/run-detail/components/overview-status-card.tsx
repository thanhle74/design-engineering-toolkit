"use client";

/**
 * [74] The overall conversion-status card of the run overview (extracted
 * from `run-overview-panel.tsx` along its real seam: deriving the honest
 * overall state from run data and rendering its four-state summary).
 *
 * State is DERIVED, never claimed: full success requires exitCode 0 AND
 * every section composed AND no gap/skipped entries; a zero exit with skips
 * is "Hoàn tất — còn mục chưa ghép"; a non-zero exit is "Chưa hoàn tất";
 * a null exit code stays "Chưa rõ trạng thái" (unknown is never rendered as
 * healthy). Colors come from antd's preset palette values ([61] stock light).
 */
import {
   CheckCircleFilled,
   CloseCircleFilled,
   ExclamationCircleFilled,
   InfoCircleOutlined,
} from "@ant-design/icons";
import { Card, Flex, Typography } from "antd";
import type { CSSProperties, ReactNode } from "react";

import type { StudioRunView } from "@/src/modules/studio/shared/contracts";

export type OverallState = "success" | "partial" | "failed" | "unknown";

export function deriveOverallState(
   run: StudioRunView,
   composedSections: number,
   totalSections: number,
): OverallState {
   if (run.exitCode === null) return "unknown";
   if (run.exitCode !== 0) return "failed";
   let gap = 0;
   let skipped = 0;
   for (const m of run.mappings) {
      if (m.composeDisposition === "gap") gap += 1;
      if (m.composeDisposition === "skipped") skipped += 1;
   }
   if (composedSections < totalSections || gap > 0 || skipped > 0) {
      return "partial";
   }
   return "success";
}

interface OverallStatusVisual {
   icon: ReactNode;
   text: string;
   surface: CSSProperties;
   textColor: string;
}

const STATUS_VISUALS: Record<OverallState, OverallStatusVisual> = {
   success: {
      icon: <CheckCircleFilled style={{ color: "#52c41a", fontSize: 18 }} />,
      text: "Hoàn tất thành công",
      surface: { background: "#f6ffed", border: "1px solid #b7eb8f" },
      textColor: "#389e0d",
   },
   partial: {
      icon: (
         <ExclamationCircleFilled style={{ color: "#faad14", fontSize: 18 }} />
      ),
      text: "Hoàn tất — còn mục chưa ghép",
      surface: { background: "#fffbe6", border: "1px solid #ffe58f" },
      textColor: "#d48806",
   },
   failed: {
      icon: <CloseCircleFilled style={{ color: "#ff4d4f", fontSize: 18 }} />,
      text: "Chưa hoàn tất",
      surface: { background: "#fff1f0", border: "1px solid #ffa39e" },
      textColor: "#cf1322",
   },
   unknown: {
      icon: <InfoCircleOutlined style={{ color: "#8c8c8c", fontSize: 18 }} />,
      text: "Chưa rõ trạng thái",
      surface: { background: "#fafafa", border: "1px solid #d9d9d9" },
      textColor: "#595959",
   },
};

export function OverviewStatusCard({
   run,
   composedSections,
   totalSections,
}: {
   run: StudioRunView;
   composedSections: number;
   totalSections: number;
}) {
   const state = deriveOverallState(run, composedSections, totalSections);
   const visual = STATUS_VISUALS[state];
   let notComposedEntries = 0;
   for (const m of run.mappings) {
      if (
         m.composeDisposition === "gap" ||
         m.composeDisposition === "skipped" ||
         m.composeDisposition === "excluded"
      ) {
         notComposedEntries += 1;
      }
   }
   const subline = [
      `Mã thoát ${run.exitCode ?? "không rõ"}`,
      `Đã ghép ${composedSections}/${totalSections} phân đoạn`,
      notComposedEntries > 0
         ? `${notComposedEntries} mục gap/bỏ qua/loại trừ`
         : null,
   ]
      .filter((part): part is string => part !== null)
      .join(" · ");

   return (
      <Card size="small" variant="borderless" style={visual.surface}>
         <Flex vertical gap={4}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
               Trạng thái chuyển đổi
            </Typography.Text>
            <Flex align="center" gap={6}>
               {visual.icon}
               <Typography.Title
                  level={4}
                  style={{ margin: 0, color: visual.textColor }}
               >
                  {visual.text}
               </Typography.Title>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
               {subline}
            </Typography.Text>
         </Flex>
      </Card>
   );
}
