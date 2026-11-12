"use client";

/**
 * [70] Compact READ-ONLY summary of the analysis behind a `?analysis=` deep
 * link (the redirect target of /agent). Deliberately NOT the [65] approval
 * screen: since the [70] contract freeze there is NO separate plan approval —
 * Build runs the whole pipeline and a grounded plan is materialized
 * automatically. The card shows only real snapshot facts (state, outcome,
 * grounded) with machine tokens verbatim.
 */
import { Alert, Card, Flex, Typography } from "antd";

import type { AgentAnalysisSnapshot } from "@/src/modules/studio/shared/contracts";
import { figmaUrlFromRequest } from "./build-flow-view";

export interface AnalysisSummaryCardProps {
   analysisId: string;
   /** null while loading or when the id resolves to nothing. */
   snapshot: AgentAnalysisSnapshot | null;
   loading: boolean;
}

export function AnalysisSummaryCard({
   analysisId,
   snapshot,
   loading,
}: AnalysisSummaryCardProps) {
   if (loading) {
      return (
         <Typography.Text type="secondary">
            Đang đọc phân tích{" "}
            <Typography.Text code>{analysisId}</Typography.Text>…
         </Typography.Text>
      );
   }
   if (snapshot === null) {
      return (
         <Alert
            type="warning"
            showIcon
            title={`Không đọc được phân tích ${analysisId}`}
            description="Id này không khớp phân tích nào Studio đọc được. Kiểm tra lại đường dẫn /agent hoặc bấm Build trực tiếp."
         />
      );
   }

   const grounded = snapshot.grounded;
   return (
      <Card size="small" title="Phân tích nguồn (từ /agent)">
         <Flex vertical gap={4}>
            <Typography.Text type="secondary">
               analysisId:{" "}
               <Typography.Text code>{snapshot.analysisId}</Typography.Text>
               {" · trạng thái "}
               <Typography.Text code>{snapshot.state}</Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
               nguồn:{" "}
               <Typography.Text code>
                  {figmaUrlFromRequest(
                     snapshot.request.fileKey,
                     snapshot.request.nodeId,
                  )}
               </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
               outcome:{" "}
               <Typography.Text code>
                  {snapshot.outcome ?? "chưa có"}
               </Typography.Text>
               {" · grounded "}
               <Typography.Text code>
                  {grounded === null ? "chưa có" : String(grounded)}
               </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
               Từ [70], kế hoạch AI không còn bước duyệt riêng: nút Build chạy
               trọn quy trình và kế hoạch grounded được materialize tự động.
            </Typography.Text>
         </Flex>
      </Card>
   );
}
