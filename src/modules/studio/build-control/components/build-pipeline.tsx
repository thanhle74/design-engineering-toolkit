"use client";

/**
 * [70] The pipeline view of a live/terminal build flow: stock antd `Steps`
 * (vertical) with the six frozen stages on the left, the selected-stage
 * detail on the right (stacks under the `md` breakpoint via the antd Grid),
 * then the honest terminal panels. Everything rendered is read from the real
 * `BuildFlowRunSnapshot` — timestamps verbatim, machine ids verbatim, no
 * percent, no elapsed arithmetic, no success the snapshot did not report.
 */
import { useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import {
   Alert,
   Button,
   Card,
   Flex,
   List,
   Row,
   Col,
   Steps,
   Tag,
   Typography,
} from "antd";

import {
   BUILD_FLOW_ARTIFACT_FILES,
   type BuildFlowRunSnapshot,
   type BuildFlowStageName,
   type BuildFlowStageRecord,
} from "@/src/modules/studio/shared/contracts/build-flow";

import {
   flowBuildRunId,
   isTerminalFlowState,
   isLiveFlowState,
   stageLabel,
   stageStatusLabel,
   stageStatusTagColor,
   stageStepStatus,
} from "./build-flow-view";

const RUNS_LINK_BASE = "/runs/";

function stageTitle(row: BuildFlowStageRecord) {
   return (
      <Flex align="center" gap={6} wrap="wrap">
         <span>{stageLabel(row.stage)}</span>
         {row.status === "warning" ? (
            <Tag color="warning">{stageStatusLabel("warning")}</Tag>
         ) : null}
      </Flex>
   );
}

function stageTimes(row: BuildFlowStageRecord) {
   if (row.startedAt === null && row.finishedAt === null) return null;
   return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
         {row.startedAt === null ? "chưa bắt đầu" : `bắt đầu ${row.startedAt}`}
         {row.finishedAt === null ? "" : ` · kết thúc ${row.finishedAt}`}
      </Typography.Text>
   );
}

function SelectedStageDetail({ row }: { row: BuildFlowStageRecord }) {
   return (
      <Flex vertical gap={8}>
         <Flex align="center" gap={8} wrap="wrap">
            <Typography.Text strong>{stageLabel(row.stage)}</Typography.Text>
            <Tag color={stageStatusTagColor(row.status)}>
               {stageStatusLabel(row.status)}
            </Tag>
         </Flex>
         <Typography.Text type="secondary">
            {row.startedAt === null
               ? "chưa bắt đầu"
               : `bắt đầu ${row.startedAt}`}
            {row.finishedAt === null
               ? " · chưa kết thúc"
               : ` · kết thúc ${row.finishedAt}`}
         </Typography.Text>
         {row.message !== null ? (
            <Typography.Text>{row.message}</Typography.Text>
         ) : null}
         {row.analysisId !== null ? (
            <Typography.Text type="secondary">
               analysisId:{" "}
               <Typography.Text code>{row.analysisId}</Typography.Text>
            </Typography.Text>
         ) : null}
         {row.buildRunId !== null ? (
            <Typography.Text type="secondary">
               buildRunId:{" "}
               <Typography.Text code>{row.buildRunId}</Typography.Text> —{" "}
               <Typography.Link
                  href={`${RUNS_LINK_BASE}${encodeURIComponent(row.buildRunId)}`}
               >
                  trang lần chạy
               </Typography.Link>
            </Typography.Text>
         ) : null}
      </Flex>
   );
}

function ResultsPanel({ snapshot }: { snapshot: BuildFlowRunSnapshot }) {
   const buildRunId = flowBuildRunId(snapshot);
   const artifactNames = Object.values(BUILD_FLOW_ARTIFACT_FILES);
   return (
      <Alert
         type="success"
         showIcon
         title="Luồng Build hoàn tất"
         description={
            <Flex vertical gap={8}>
               {buildRunId !== null ? (
                  <>
                     <Button
                        type="primary"
                        href={`${RUNS_LINK_BASE}${encodeURIComponent(buildRunId)}`}
                     >
                        Xem kết quả
                     </Button>
                     <Typography.Text type="secondary">
                        run id:{" "}
                        <Typography.Text code>{buildRunId}</Typography.Text>
                     </Typography.Text>
                  </>
               ) : (
                  <Typography.Text type="secondary">
                     Luồng báo hoàn tất nhưng nhật ký không ghi nhận buildRunId
                     nào — không có trang lần chạy để mở.
                  </Typography.Text>
               )}
               <Typography.Text>
                  Artifact của gói cài đặt Page Builder:
               </Typography.Text>
               <List
                  size="small"
                  dataSource={artifactNames}
                  renderItem={(name) => (
                     <List.Item style={{ padding: "2px 0" }}>
                        <Typography.Text code>{name}</Typography.Text>
                     </List.Item>
                  )}
               />
               <Typography.Text type="secondary">
                  Tải xuống nằm ở trang lần chạy — artifact chỉ được phục vụ sau
                  khi xác minh khớp build-manifest.json.
               </Typography.Text>
            </Flex>
         }
      />
   );
}

export interface BuildPipelineProps {
   snapshot: BuildFlowRunSnapshot;
   cancelPending: boolean;
   cancelNote: string | null;
   onCancel: () => void;
   onRerun: () => void;
}

export function BuildPipeline({
   snapshot,
   cancelPending,
   cancelNote,
   onCancel,
   onRerun,
}: BuildPipelineProps) {
   // Sticky selection: null follows the flow's current stage; an explicit
   // click pins the selection across polls.
   const [selected, setSelected] = useState<BuildFlowStageName | null>(null);
   const selectedStage =
      selected !== null && snapshot.stages.some((row) => row.stage === selected)
         ? selected
         : (snapshot.currentStage ?? snapshot.stages[0].stage);
   const selectedRow =
      snapshot.stages.find((row) => row.stage === selectedStage) ??
      snapshot.stages[0];

   const live = isLiveFlowState(snapshot.state);
   const terminal = isTerminalFlowState(snapshot.state);
   // antd Steps' `current`: highlights the running stage AND makes its click
   // a no-op (rc-steps only fires onChange for a DIFFERENT index) — which is
   // exactly the selection semantics wanted here. -1 = no active stage.
   const currentStageIndex = snapshot.currentStage
      ? snapshot.stages.findIndex((row) => row.stage === snapshot.currentStage)
      : -1;

   return (
      <section aria-labelledby="build-pipeline-heading">
         {/* layout only: neutralize UA heading margins */}
         <h2 id="build-pipeline-heading" style={{ margin: 0 }}>
            Quy trình Build
         </h2>
         <Flex vertical gap={16}>
            <Flex align="center" gap={8} wrap="wrap">
               <Typography.Text type="secondary">
                  luồng{" "}
                  <Typography.Text code>{snapshot.flowId}</Typography.Text>
                  {" · trạng thái "}
                  <Typography.Text code>{snapshot.state}</Typography.Text>
               </Typography.Text>
               {live ? (
                  <Button danger onClick={onCancel} loading={cancelPending}>
                     Hủy
                  </Button>
               ) : null}
               {terminal ? (
                  <Button
                     icon={<ReloadOutlined aria-hidden="true" />}
                     onClick={onRerun}
                  >
                     Chạy lại
                  </Button>
               ) : null}
               {cancelNote !== null ? (
                  <Typography.Text type="secondary">
                     {cancelNote}
                  </Typography.Text>
               ) : null}
            </Flex>

            <Row gutter={[24, 24]}>
               <Col xs={24} md={12}>
                  <Steps
                     orientation="vertical"
                     size="small"
                     current={currentStageIndex}
                     items={snapshot.stages.map((row) => ({
                        key: row.stage,
                        title: stageTitle(row),
                        content: stageTimes(row),
                        status: stageStepStatus(row.status),
                     }))}
                     onChange={(index) =>
                        setSelected(snapshot.stages[index]?.stage ?? null)
                     }
                  />
               </Col>
               <Col xs={24} md={12}>
                  <Card size="small">
                     <div data-testid="build-stage-detail">
                        <SelectedStageDetail row={selectedRow} />
                     </div>
                  </Card>
               </Col>
            </Row>

            {snapshot.state === "completed" ? (
               <ResultsPanel snapshot={snapshot} />
            ) : null}
            {snapshot.state === "failed" && snapshot.error !== null ? (
               <Alert
                  type="error"
                  showIcon
                  title={`Luồng Build thất bại — mã lỗi: ${snapshot.error.code}`}
                  description={
                     <Flex vertical gap={4}>
                        <Typography.Text>
                           {snapshot.error.message}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                           Sửa nguồn hoặc môi trường rồi bấm Chạy lại. Chi tiết
                           kỹ thuật (nếu có run id) nằm ở trang lần chạy.
                        </Typography.Text>
                     </Flex>
                  }
               />
            ) : null}
            {snapshot.state === "cancelled" ? (
               <Alert
                  type="warning"
                  showIcon
                  title="Luồng Build đã bị hủy"
                  description="Người dùng đã hủy luồng; nhật ký giữ nguyên trạng thái thật lúc hủy."
               />
            ) : null}
            {snapshot.state === "interrupted" ? (
               <Alert
                  type="error"
                  showIcon
                  title="Luồng Build bị gián đoạn"
                  description="Máy chủ khởi động lại giữa chừng — luồng này không còn tiến trình sống. Bấm Chạy lại để tạo luồng mới; không tin kết quả nào của luồng này."
               />
            ) : null}
         </Flex>
      </section>
   );
}
