"use client";

/**
 * [74] Run overview — usage-oriented tab of the run detail screen.
 *
 * [74] Honesty pass (issue scope E): every count and status on this panel is
 * DERIVED from the run's own data (`run.sections` elementCount +
 * `run.mappings` composeDisposition via `summarizeRunSections`). The #72
 * extended reality is 5 of 12 sections composed with 7 skipped entries — the
 * panel now says exactly that instead of a blanket "Đã ghép thành công" per
 * row or an unconditional "Hoàn tất thành công". GAP / SKIPPED / EXCLUDED
 * stay visible as counters and per-section badges; PREVIEW_UNAVAILABLE and
 * errors are not masked (they live on the Technical tab and in the HTML
 * missing-state Alert here); no fake previews are rendered.
 *
 * Static content (install guide) and the derived overall-status card live in
 * their own components (`install-guide-tabs`, `overview-status-card`); this
 * file keeps the data-driven layout. Layout, spacing and the friendly
 * Vietnamese copy style are preserved; only truthfulness of text/counts/
 * statuses changed. [61] Ant Design stock light (preset color values only),
 * no theme overrides.
 */
import { useEffect, useState } from "react";
import {
   CheckCircleFilled,
   CheckOutlined,
   CodeOutlined,
   CopyOutlined,
   DownloadOutlined,
   InfoCircleOutlined,
   LayoutOutlined,
   QuestionCircleOutlined,
   SafetyCertificateFilled,
} from "@ant-design/icons";
import {
   Alert,
   Button,
   Card,
   Col,
   Flex,
   Row,
   Skeleton,
   Table,
   Tag,
   Typography,
   message,
} from "antd";
import type { TableColumnsType } from "antd";

import type {
   StudioArtifactView,
   StudioRunView,
} from "@/src/modules/studio/shared/contracts";
import {
   dispositionSummaryText,
   summarizeRunSections,
   type SectionComposeRow,
} from "../section-summary";
import { InstallGuideTabs } from "./install-guide-tabs";
import { OverviewStatusCard } from "./overview-status-card";

interface RunOverviewPanelProps {
   run: StudioRunView;
   onQuickDownload: (artifact: StudioArtifactView) => void;
}

export function RunOverviewPanel({
   run,
   onQuickDownload,
}: RunOverviewPanelProps) {
   const [htmlCode, setHtmlCode] = useState<string | null>(null);
   const [htmlLoading, setHtmlLoading] = useState(false);
   const [copied, setCopied] = useState(false);

   // Find the primary Page Builder HTML artifact
   const htmlArtifact =
      run.artifacts.find(
         (a) =>
            a.role === "native-content-copy" ||
            a.role === "native-content" ||
            a.file?.endsWith(".html"),
      ) ?? null;

   const installerArtifact =
      run.artifacts.find(
         (a) =>
            a.role === "cms-installer" ||
            a.role === "installer" ||
            a.file?.endsWith(".php"),
      ) ?? null;

   useEffect(() => {
      let isMounted = true;
      if (!htmlArtifact) return;

      window.setTimeout(() => {
         if (isMounted) setHtmlLoading(true);
      }, 0);

      fetch(
         `/api/runs/${encodeURIComponent(run.runId)}/artifacts/${encodeURIComponent(htmlArtifact.artifactId)}`,
      )
         .then(async (res) => {
            if (!res.ok) throw new Error("Không thể tải nội dung HTML");
            return res.text();
         })
         .then((text) => {
            if (isMounted) setHtmlCode(text);
         })
         .catch(() => {
            if (isMounted) setHtmlCode(null);
         })
         .finally(() => {
            if (isMounted) setHtmlLoading(false);
         });

      return () => {
         isMounted = false;
      };
   }, [run.runId, htmlArtifact]);

   async function handleCopyHtml() {
      if (!htmlCode) {
         message.warning("Đang tải mã HTML, vui lòng thử lại sau giây lát.");
         return;
      }
      try {
         await navigator.clipboard.writeText(htmlCode);
         setCopied(true);
         message.success("Đã sao chép mã Page Builder HTML vào bộ nhớ tạm!");
         setTimeout(() => setCopied(false), 2500);
      } catch {
         message.error(
            "Không thể tự động sao chép. Vui lòng chọn và sao chép thủ công.",
         );
      }
   }

   // [74] Honest counts, derived from the run itself.
   const summary = summarizeRunSections(run);
   const downloadableCount = run.artifacts.filter((a) => a.downloadable).length;

   const sectionColumns: TableColumnsType<SectionComposeRow> = [
      {
         title: "#",
         dataIndex: "order",
         width: 60,
         render: (val: number) => (
            <Typography.Text type="secondary">{val + 1}</Typography.Text>
         ),
      },
      {
         title: "Tên phân đoạn (Section)",
         dataIndex: "name",
         render: (val: string) => (
            <Typography.Text strong code>
               {val}
            </Typography.Text>
         ),
      },
      {
         title: "Vai trò",
         dataIndex: "role",
         width: 140,
         render: (val: string | null) => (
            <Tag color="blue">{val ?? "không rõ"}</Tag>
         ),
      },
      {
         title: "Phần tử con",
         dataIndex: "elementCount",
         width: 140,
         render: (val: number) => (
            <Typography.Text>
               {val > 0 ? `${val} phần tử` : "Khung chứa (0 phần tử)"}
            </Typography.Text>
         ),
      },
      {
         title: "Trạng thái",
         key: "status",
         width: 220,
         render: (_, row) => (
            <Flex vertical gap={2}>
               <Flex align="center" gap={4}>
                  {row.composed ? (
                     <>
                        <CheckCircleFilled style={{ color: "#52c41a" }} />
                        <Typography.Text type="success">
                           Đã ghép
                        </Typography.Text>
                     </>
                  ) : (
                     <Tag color="gold" style={{ margin: 0 }}>
                        CHƯA GHÉP
                     </Tag>
                  )}
               </Flex>
               {row.hasMappings ? (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                     {dispositionSummaryText(row.dispositions).join(" · ")}
                  </Typography.Text>
               ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                     không có mapping nào ghi vào mục này
                  </Typography.Text>
               )}
            </Flex>
         ),
      },
   ];

   const sectionData: SectionComposeRow[] = summary.rows;

   return (
      <Flex vertical gap={24}>
         {/* 1. Metric Overview Cards */}
         <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
               <OverviewStatusCard
                  run={run}
                  composedSections={summary.composedSections}
                  totalSections={summary.totalSections}
               />
            </Col>
            <Col xs={24} sm={12} lg={6}>
               <Card size="small">
                  <Flex vertical gap={4}>
                     <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        Phân đoạn giao diện
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <LayoutOutlined
                           style={{ fontSize: 18, color: "#1677ff" }}
                        />
                        <Typography.Title level={4} style={{ margin: 0 }}>
                           {summary.totalSections} Phân đoạn
                        </Typography.Title>
                     </Flex>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Nhận diện từ Figma · đã ghép {summary.composedSections}/
                        {summary.totalSections}
                     </Typography.Text>
                  </Flex>
               </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
               <Card size="small">
                  <Flex vertical gap={4}>
                     <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        Nền tảng đích
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <CodeOutlined
                           style={{ fontSize: 18, color: "#722ed1" }}
                        />
                        <Typography.Title level={4} style={{ margin: 0 }}>
                           Page Builder
                        </Typography.Title>
                     </Flex>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Chuẩn Magento &amp; Hyvä Theme
                     </Typography.Text>
                  </Flex>
               </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
               <Card size="small">
                  <Flex vertical gap={4}>
                     <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        Tệp xuất &amp; Toàn vẹn
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <SafetyCertificateFilled
                           style={{ fontSize: 18, color: "#13c2c2" }}
                        />
                        <Typography.Title level={4} style={{ margin: 0 }}>
                           {downloadableCount}/{run.artifacts.length} Tệp tải
                           được
                        </Typography.Title>
                     </Flex>
                     <Typography.Text
                        type={
                           run.build && !run.build.manifestVerified
                              ? "danger"
                              : "secondary"
                        }
                        style={{ fontSize: 12 }}
                     >
                        {run.build
                           ? run.build.manifestVerified
                              ? "Khớp SHA-256 toàn bộ tệp manifest"
                              : "Xác minh toàn vẹn THẤT BẠI"
                           : "Chưa có gói build — chưa xác minh SHA-256"}
                     </Typography.Text>
                  </Flex>
               </Card>
            </Col>
         </Row>

         {/* 2. Usage Guide (Two Methods) — static content, extracted */}
         <Card
            size="small"
            title={
               <Flex align="center" gap={8}>
                  <QuestionCircleOutlined style={{ color: "#1677ff" }} />
                  <span style={{ fontWeight: 600 }}>
                     Hướng dẫn đưa vào Magento (2 phương thức)
                  </span>
               </Flex>
            }
         >
            <InstallGuideTabs />
         </Card>

         {/* 3. HTML Code Viewer & 1-Click Copy */}
         <Card
            size="small"
            title={
               <Flex align="center" gap={8} wrap="wrap">
                  <CodeOutlined style={{ color: "#52c41a" }} />
                  <span style={{ fontWeight: 600 }}>
                     Mã nguồn Magento Page Builder đã tạo
                  </span>
                  {htmlCode ? (
                     <Tag color="green">
                        {htmlCode.length.toLocaleString()} ký tự
                     </Tag>
                  ) : null}
               </Flex>
            }
            extra={
               <Flex align="center" gap="small" wrap="wrap">
                  <Button
                     type="primary"
                     style={{
                        backgroundColor: "#52c41a",
                        borderColor: "#52c41a",
                     }}
                     icon={<DownloadOutlined />}
                     href={`/api/runs/${run.runId}/download-bundle`}
                     download={`det-bundle-${run.runId}.zip`}
                  >
                     Tải trọn bộ Gói cài đặt (ZIP)
                  </Button>
                  {htmlArtifact ? (
                     <Button
                        icon={<DownloadOutlined />}
                        onClick={() => onQuickDownload(htmlArtifact)}
                     >
                        Tải file .html
                     </Button>
                  ) : null}
                  <Button
                     type="primary"
                     icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                     onClick={handleCopyHtml}
                     disabled={htmlLoading || !htmlCode}
                  >
                     {copied ? "Đã sao chép!" : "Sao chép toàn bộ HTML"}
                  </Button>
               </Flex>
            }
         >
            {htmlLoading ? (
               <Skeleton active paragraph={{ rows: 6 }} />
            ) : htmlCode ? (
               <Flex vertical gap={8}>
                  <div
                     style={{
                        background: "#fafafa",
                        border: "1px solid #d9d9d9",
                        borderRadius: 6,
                        padding: 12,
                        maxHeight: 280,
                        overflowY: "auto",
                        fontFamily: "monospace",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        lineHeight: 1.5,
                     }}
                  >
                     {htmlCode}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                     Mã HTML trên chứa toàn bộ các khối nội dung, hàng (rows),
                     cột (columns), hình ảnh và thuộc tính Page Builder chuẩn
                     của Magento.
                  </Typography.Text>
               </Flex>
            ) : (
               <Alert
                  type="info"
                  showIcon
                  title="Không tìm thấy file HTML đầu ra"
                  description="Lần chạy này không tạo ra file pagebuilder-content.html hoặc file chưa sẵn sàng trên máy chủ."
               />
            )}
         </Card>

         {/* 4. Detected Sections Breakdown — honest per-section status */}
         <Card
            size="small"
            title={
               <Flex align="center" gap={8}>
                  <LayoutOutlined style={{ color: "#1677ff" }} />
                  <span style={{ fontWeight: 600 }}>
                     Các phân đoạn giao diện (đã ghép {summary.composedSections}
                     /{summary.totalSections})
                  </span>
               </Flex>
            }
         >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
               Hệ thống đã nhận diện {summary.totalSections} phân đoạn trong
               thiết kế Figma; {summary.composedSections}/
               {summary.totalSections} phân đoạn có phần tử được ghép vào
               Magento Page Builder. Các khoảng trống (gap), mục bị bỏ qua
               (skipped) và loại trừ (excluded) vẫn được liệt kê đầy đủ bên
               dưới.
            </Typography.Paragraph>
            <Table<SectionComposeRow>
               rowKey="order"
               columns={sectionColumns}
               dataSource={sectionData}
               pagination={false}
               size="small"
            />
         </Card>

         {/* 5. Storefront & Developer Notice */}
         <Card size="small">
            <Flex vertical gap={8}>
               <Flex align="center" gap={6}>
                  <InfoCircleOutlined style={{ color: "#1677ff" }} />
                  <Typography.Text strong>
                     Lưu ý về bản xem trước Storefront &amp; Tùy chọn cài đặt
                     CLI
                  </Typography.Text>
               </Flex>
               <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                  Do hệ thống hoạt động ở chế độ an toàn ngoại tuyến (không ghi
                  đè trực tiếp lên cơ sở dữ liệu Magento khi chưa được người
                  dùng phê duyệt), bạn có thể xem trước giao diện thực tế ngay
                  trên website của bạn sau khi dán mã vào Page Builder.
               </Typography.Paragraph>
               {installerArtifact ? (
                  <Flex
                     align="center"
                     gap="small"
                     wrap="wrap"
                     style={{ marginTop: 4 }}
                  >
                     <Typography.Text type="secondary">
                        Nếu bạn là lập trình viên Magento muốn import tự động
                        bằng PHP CLI:
                     </Typography.Text>
                     <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => onQuickDownload(installerArtifact)}
                     >
                        Tải file {installerArtifact.artifactId}
                     </Button>
                  </Flex>
               ) : null}
            </Flex>
         </Card>
      </Flex>
   );
}
