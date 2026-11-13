"use client";

import {
   ApiOutlined,
   FolderOpenOutlined,
   HistoryOutlined,
   RocketOutlined,
   ToolOutlined,
   WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Flex, Row, Typography } from "antd";

import type { DetRunSummary } from "@/src/modules/studio/shared/contracts";
import { RunModeBadge } from "@/src/modules/studio/mapping-review";
import {
   ConversionForm,
   DEMO_PROFILES,
} from "@/src/modules/studio/conversions";

/**
 * [61] Client view child for the Overview server page: stock antd light
 * presentation (Flex/Typography/Card/Button/Alert only — no custom CSS, no
 * utility classes), terse Vietnamese operator copy ("ít chữ"). Machine tokens
 * (ids, error codes, STUDIO_DET_RUNS_DIR) stay verbatim; raw h1/h2 keep their
 * aria-labelledby targets. The inline heading styles are layout-only.
 */

function unknownCount(value: number | null): string {
   return value === null ? "không rõ" : String(value);
}

function RunRow({ run }: { run: DetRunSummary }) {
   return (
      <Card size="small" style={{ background: "#fafafa" }}>
         <Typography.Link href={`/runs/${encodeURIComponent(run.runId)}`}>
            <Flex wrap="wrap" justify="space-between" align="center" gap={8}>
               <Flex align="center" gap={8} wrap="wrap">
                  <Typography.Text strong>{run.label}</Typography.Text>
                  <RunModeBadge mode={run.mode} />
               </Flex>
               <Flex align="center" gap={8} wrap="wrap">
                  <Typography.Text type="secondary">
                     lỗi {unknownCount(run.counts.errors)} · cảnh báo{" "}
                     {unknownCount(run.counts.warnings)} · thông tin{" "}
                     {unknownCount(run.counts.infos)}
                  </Typography.Text>
                  <Typography.Text type="secondary" code>
                     {run.runId}
                  </Typography.Text>
               </Flex>
            </Flex>
         </Typography.Link>
      </Card>
   );
}

export interface OverviewViewProps {
   runs: readonly DetRunSummary[];
   readerErrorCode: string | null;
   readerMessage: string | null;
}

export function OverviewScreen({
   runs,
   readerErrorCode,
   readerMessage,
}: OverviewViewProps) {
   const latestRun = runs.length > 0 ? runs[0] : null;

   return (
      <Flex vertical gap={24}>
         {/* Page Header / Welcome */}
         <section aria-labelledby="studio-overview-heading">
            <Flex vertical gap={4} align="flex-start">
               <h1 id="studio-overview-heading" style={{ margin: 0 }}>
                  Tổng quan Studio
               </h1>
               <Typography.Paragraph
                  type="secondary"
                  style={{ margin: 0, fontSize: 14 }}
               >
                  Nền tảng chuyển đổi tự động thiết kế Figma sang Magento Page
                  Builder &amp; Hyvä Theme.
               </Typography.Paragraph>
            </Flex>
         </section>

         {/* 3 Quick Action Cards */}
         <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
               <Card size="small" style={{ height: "100%" }}>
                  <Flex
                     vertical
                     justify="space-between"
                     style={{ height: "100%" }}
                     gap={12}
                  >
                     <Flex vertical gap={6}>
                        <Flex align="center" gap={8}>
                           <RocketOutlined
                              style={{ color: "#1677ff", fontSize: 18 }}
                           />
                           <Typography.Title level={5} style={{ margin: 0 }}>
                              Tạo bản dựng mới
                           </Typography.Title>
                        </Flex>
                        <Typography.Text
                           type="secondary"
                           style={{ fontSize: 13 }}
                        >
                           Nhập URL Figma để tự động phân tích, ánh xạ và biên
                           dịch sang Page Builder.
                        </Typography.Text>
                     </Flex>
                     <Button
                        type="primary"
                        href="/build"
                        icon={<ToolOutlined />}
                        block
                     >
                        Tạo bản dựng
                     </Button>
                  </Flex>
               </Card>
            </Col>
            <Col xs={24} md={8}>
               <Card size="small" style={{ height: "100%" }}>
                  <Flex
                     vertical
                     justify="space-between"
                     style={{ height: "100%" }}
                     gap={12}
                  >
                     <Flex vertical gap={6}>
                        <Flex align="center" gap={8}>
                           <FolderOpenOutlined
                              style={{ color: "#52c41a", fontSize: 18 }}
                           />
                           <Typography.Title level={5} style={{ margin: 0 }}>
                              Dự án &amp; Trang Figma
                           </Typography.Title>
                        </Flex>
                        <Typography.Text
                           type="secondary"
                           style={{ fontSize: 13 }}
                        >
                           Quản lý các bộ trang theo từng dự án Magento và khởi
                           chạy build 1 click.
                        </Typography.Text>
                     </Flex>
                     <Button href="/catalog" block>
                        Quản lý dự án
                     </Button>
                  </Flex>
               </Card>
            </Col>
            <Col xs={24} md={8}>
               <Card size="small" style={{ height: "100%" }}>
                  <Flex
                     vertical
                     justify="space-between"
                     style={{ height: "100%" }}
                     gap={12}
                  >
                     <Flex vertical gap={6}>
                        <Flex align="center" gap={8}>
                           <HistoryOutlined
                              style={{ color: "#722ed1", fontSize: 18 }}
                           />
                           <Typography.Title level={5} style={{ margin: 0 }}>
                              Lần chạy gần nhất
                           </Typography.Title>
                        </Flex>
                        <Typography.Text
                           type="secondary"
                           style={{ fontSize: 13 }}
                        >
                           {latestRun
                              ? `Lần chạy: ${latestRun.runId}`
                              : "Chưa ghi nhận lần chạy nào trên hệ thống."}
                        </Typography.Text>
                     </Flex>
                     {latestRun ? (
                        <Button
                           href={`/runs/${encodeURIComponent(latestRun.runId)}`}
                           block
                        >
                           Xem kết quả lần chạy
                        </Button>
                     ) : (
                        <Button href="/build" block>
                           Bắt đầu lần chạy đầu tiên
                        </Button>
                     )}
                  </Flex>
               </Card>
            </Col>
         </Row>

         {/* Recent Runs Card */}
         <Card
            size="small"
            title={
               <Flex align="center" gap={8}>
                  <FolderOpenOutlined aria-hidden="true" />
                  <h2 style={{ margin: 0 }}>Lần chạy gần đây</h2>
               </Flex>
            }
         >
            {readerErrorCode !== null ? (
               <Alert
                  type="warning"
                  showIcon
                  icon={<ApiOutlined aria-hidden="true" />}
                  title={`Chưa cấu hình trình đọc lần chạy (${readerErrorCode})`}
                  description={
                     <>
                        {readerMessage} Đặt biến môi trường{" "}
                        <Typography.Text code>
                           STUDIO_DET_RUNS_DIR
                        </Typography.Text>{" "}
                        trỏ tới thư mục output det, hoặc bỏ trống để xem fixture
                        DEMO.
                     </>
                  }
               />
            ) : runs.length === 0 ? (
               <Flex align="center" gap={8} wrap="wrap">
                  <WarningOutlined aria-hidden="true" />
                  <Typography.Text type="secondary">
                     Chưa có lần chạy nào — đặt{" "}
                     <Typography.Text code>STUDIO_DET_RUNS_DIR</Typography.Text>{" "}
                     trỏ tới output det thật, hoặc bỏ trống để dùng DEMO.
                  </Typography.Text>
               </Flex>
            ) : (
               <Flex vertical gap={8}>
                  {runs.map((run) => (
                     <RunRow key={run.runId} run={run} />
                  ))}
               </Flex>
            )}
         </Card>

         {/* Legacy ConversionForm for compatibility with existing tests */}
         <Card size="small">
            <ConversionForm profiles={DEMO_PROFILES} />
         </Card>
      </Flex>
   );
}
