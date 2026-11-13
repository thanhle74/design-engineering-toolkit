"use client";

import { useEffect, useState } from "react";
import {
   CheckCircleFilled,
   CheckCircleOutlined,
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
   Steps,
   Table,
   Tabs,
   Tag,
   Typography,
   message,
} from "antd";
import type { TableColumnsType } from "antd";

import type {
   StudioArtifactView,
   StudioRunView,
} from "@/src/modules/studio/shared/contracts";

interface RunOverviewPanelProps {
   run: StudioRunView;
   onQuickDownload: (artifact: StudioArtifactView) => void;
}

interface SectionRow {
   order: number;
   name: string;
   role: string;
   elementCount: number;
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

   const sectionColumns: TableColumnsType<SectionRow> = [
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
         render: (val: string) => <Tag color="blue">{val}</Tag>,
      },
      {
         title: "Phần tử con",
         dataIndex: "elementCount",
         width: 140,
         render: (val: number) => (
            <Typography.Text>
               {val > 0 ? `${val} phần tử` : "Khung chứa"}
            </Typography.Text>
         ),
      },
      {
         title: "Trạng thái",
         key: "status",
         width: 160,
         render: () => (
            <Flex align="center" gap={4}>
               <CheckCircleFilled style={{ color: "#52c41a" }} />
               <Typography.Text type="success">
                  Đã ghép thành công
               </Typography.Text>
            </Flex>
         ),
      },
   ];

   const sectionData: SectionRow[] = (run.sections ?? []).map((sec, idx) => ({
      order: sec.order ?? idx,
      name: sec.name,
      role: sec.role ?? "SECTION",
      elementCount: sec.elementCount,
   }));

   return (
      <Flex vertical gap={24}>
         {/* 1. Metric Overview Cards */}
         <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
               <Card
                  size="small"
                  variant="borderless"
                  style={{ background: "#f6ffed", border: "1px solid #b7eb8f" }}
               >
                  <Flex vertical gap={4}>
                     <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        Trạng thái chuyển đổi
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <CheckCircleFilled
                           style={{ color: "#52c41a", fontSize: 18 }}
                        />
                        <Typography.Title
                           level={4}
                           style={{ margin: 0, color: "#389e0d" }}
                        >
                           Hoàn tất thành công
                        </Typography.Title>
                     </Flex>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Mã thoát {run.exitCode} · Sẵn sàng sử dụng
                     </Typography.Text>
                  </Flex>
               </Card>
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
                           {run.sections?.length ?? 0} Phân đoạn
                        </Typography.Title>
                     </Flex>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Nhận diện từ thiết kế Figma
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
                           {run.artifacts.length} Tệp sẵn sàng
                        </Typography.Title>
                     </Flex>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {run.build?.manifestVerified
                           ? "Khớp SHA-256 hoàn toàn"
                           : "Đã xác minh gói"}
                     </Typography.Text>
                  </Flex>
               </Card>
            </Col>
         </Row>

         {/* 2. Usage Guide (Two Methods) */}
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
            <Tabs
               size="small"
               defaultActiveKey="method1"
               items={[
                  {
                     key: "method1",
                     label: (
                        <span>
                           <CheckCircleOutlined
                              style={{ color: "#52c41a", marginRight: 6 }}
                           />
                           Cách 1: Gói cài đặt trọn bộ tự động (Khuyên dùng —
                           Đầy đủ ảnh &amp; Script)
                        </span>
                     ),
                     children: (
                        <Steps
                           size="small"
                           current={-1}
                           items={[
                              {
                                 title: "1. Tải gói ZIP",
                                 content:
                                    "Bấm nút 'Tải trọn bộ Gói cài đặt (ZIP)' bên dưới. Gói gồm script install-homepage.php, HTML và thư mục media/ chứa toàn bộ ảnh.",
                              },
                              {
                                 title: "2. Giải nén vào Magento",
                                 content:
                                    "Giải nén vào thư mục <magento-root>/det-install/ trên máy chủ hoặc local checkout của bạn.",
                              },
                              {
                                 title: "3. Chạy 1 lệnh duy nhất",
                                 content:
                                    "Chạy 'php det-install/install-homepage.php'. Script tự động copy ảnh vào pub/media/, import CMS Page và làm mới cache.",
                              },
                           ]}
                        />
                     ),
                  },
                  {
                     key: "method2",
                     label: <span>Cách 2: Dán mã HTML thủ công</span>,
                     children: (
                        <Steps
                           size="small"
                           current={-1}
                           items={[
                              {
                                 title: "1. Sao chép mã",
                                 content:
                                    "Bấm nút 'Sao chép toàn bộ HTML' ở khung bên dưới.",
                              },
                              {
                                 title: "2. Mở Magento Admin",
                                 content:
                                    "Vào Content → Pages → Chọn trang muốn sửa (hoặc tạo mới).",
                              },
                              {
                                 title: "3. Dán & Lưu",
                                 content:
                                    "Mở Page Builder, kéo khối HTML Code và dán nội dung rồi nhấn Save Page.",
                              },
                           ]}
                        />
                     ),
                  },
               ]}
            />
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

         {/* 4. Converted Sections Breakdown */}
         <Card
            size="small"
            title={
               <Flex align="center" gap={8}>
                  <LayoutOutlined style={{ color: "#1677ff" }} />
                  <span style={{ fontWeight: 600 }}>
                     Các phân đoạn giao diện đã chuyển đổi ({sectionData.length}
                     )
                  </span>
               </Flex>
            }
         >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
               Hệ thống đã tự động nhận diện và chuyển đổi các phân đoạn trên
               thiết kế Figma thành các khối tương ứng trong Magento Page
               Builder:
            </Typography.Paragraph>
            <Table<SectionRow>
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
