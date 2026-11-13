"use client";

import { useMemo, useState } from "react";
import {
   ApartmentOutlined,
   CheckSquareOutlined,
   CodeOutlined,
   DownloadOutlined,
   FileZipOutlined,
   SafetyCertificateOutlined,
   ThunderboltOutlined,
} from "@ant-design/icons";
import {
   Button,
   Card,
   Col,
   Flex,
   Row,
   Tabs,
   Tag,
   Typography,
   message,
} from "antd";

import type {
   StudioArtifactView,
   StudioRunView,
} from "@/src/modules/studio/shared/contracts";
import { DesignTree } from "@/src/modules/studio/design-tree";
import {
   MappingReview,
   ProvenanceFooter,
} from "@/src/modules/studio/mapping-review";
import { PreviewPanel } from "@/src/modules/studio/preview";

import { ClientArtifactManifest } from "../components/client-artifact-manifest";
import { BuildBundleSection } from "../components/build-bundle-section";
import { RunHeader } from "../components/run-header";
import { RunOverviewPanel } from "../components/run-overview-panel";

export function RunScreen({ run }: { run: StudioRunView }) {
   const [activeTab, setActiveTab] = useState("overview");

   // Identify quick action artifacts
   const nativeContentArtifact = useMemo(
      () =>
         run.artifacts.find(
            (a) =>
               a.role === "native-content-copy" ||
               a.role === "native-content" ||
               a.file?.endsWith(".html"),
         ),
      [run.artifacts],
   );

   const installerArtifact = useMemo(
      () =>
         run.artifacts.find(
            (a) =>
               a.role === "cms-installer" ||
               a.role === "installer" ||
               a.role === "php-installer" ||
               a.file?.endsWith(".php"),
         ),
      [run.artifacts],
   );

   const manifestArtifact = useMemo(
      () =>
         run.artifacts.find(
            (a) =>
               a.role === "build-manifest" || a.file?.endsWith("manifest.json"),
         ),
      [run.artifacts],
   );

   async function handleQuickDownload(artifact: StudioArtifactView) {
      if (!artifact.downloadable) {
         message.warning("File này chưa được mở cho tải xuống trực tiếp.");
         return;
      }
      try {
         const response = await fetch(
            `/api/runs/${encodeURIComponent(run.runId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`,
         );
         if (!response.ok) {
            message.error("Tải xuống thất bại.");
            return;
         }
         const blob = await response.blob();
         const url = URL.createObjectURL(blob);
         const anchor = document.createElement("a");
         anchor.href = url;
         anchor.download = artifact.artifactId.split("/").pop() ?? "artifact";
         document.body.append(anchor);
         anchor.click();
         anchor.remove();
         URL.revokeObjectURL(url);
         message.success(`Đang tải file ${anchor.download}...`);
      } catch {
         message.error("Lỗi khi tải file.");
      }
   }

   const tabItems = [
      {
         key: "overview",
         label: (
            <span>
               <ThunderboltOutlined style={{ marginRight: 6 }} />
               Tổng quan &amp; Sử dụng
            </span>
         ),
         children: (
            <RunOverviewPanel run={run} onQuickDownload={handleQuickDownload} />
         ),
      },
      {
         key: "artifacts",
         label: (
            <span>
               <DownloadOutlined style={{ marginRight: 6 }} />
               Tệp tải về ({run.artifacts.length})
            </span>
         ),
         children: (
            <ClientArtifactManifest
               runId={run.runId}
               artifacts={run.artifacts}
            />
         ),
      },
      {
         key: "design-tree",
         label: (
            <span>
               <ApartmentOutlined style={{ marginRight: 6 }} />
               Cây thiết kế Figma
            </span>
         ),
         children: <DesignTree run={run} defaultView="tree" />,
      },
      {
         key: "mapping",
         label: (
            <span>
               <CheckSquareOutlined style={{ marginRight: 6 }} />
               Chi tiết ánh xạ
            </span>
         ),
         children: <MappingReview run={run} />,
      },
      {
         key: "technical",
         label: (
            <span>
               <SafetyCertificateOutlined style={{ marginRight: 6 }} />
               Kỹ thuật &amp; Diagnostics
            </span>
         ),
         children: (
            <Flex vertical gap={24}>
               <Row gutter={[24, 24]}>
                  <Col xs={24} lg={12}>
                     <PreviewPanel
                        preview={run.preview}
                        mode={run.mode}
                        label={run.label}
                     />
                  </Col>
                  <Col xs={24} lg={12}>
                     <BuildBundleSection run={run} />
                  </Col>
               </Row>
               <ProvenanceFooter run={run} />
            </Flex>
         ),
      },
   ];

   return (
      <Flex vertical gap={20}>
         <RunHeader label={run.label} mode={run.mode} runId={run.runId} />

         {/* Prominent Quick Action Banner */}
         <Card size="small" style={{ background: "#fafafa" }}>
            <Flex
               align="center"
               justify="space-between"
               wrap="wrap"
               gap="middle"
            >
               <Flex vertical gap={2}>
                  <Flex align="center" gap="small" wrap="wrap">
                     <Typography.Title level={4} style={{ margin: 0 }}>
                        Kết quả chuyển đổi Page Builder
                     </Typography.Title>
                     {run.sections ? (
                        <Tag color="blue">{run.sections.length} phân đoạn</Tag>
                     ) : null}
                     <Tag color="cyan">{run.artifacts.length} tệp đầu ra</Tag>
                     {run.build?.manifestVerified ? (
                        <Tag color="success">Đã xác minh toàn vẹn</Tag>
                     ) : null}
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                     Trang đã được sinh thành công sang mã Magento Page Builder.
                     Bạn có thể sao chép hoặc tải các tệp bên dưới để áp dụng.
                  </Typography.Text>
               </Flex>

               <Flex align="center" gap="small" wrap="wrap">
                  {nativeContentArtifact ? (
                     <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={() =>
                           handleQuickDownload(nativeContentArtifact)
                        }
                     >
                        Tải HTML Page Builder
                     </Button>
                  ) : null}

                  {installerArtifact ? (
                     <Button
                        icon={<CodeOutlined />}
                        onClick={() => handleQuickDownload(installerArtifact)}
                     >
                        Tải PHP Installer
                     </Button>
                  ) : null}

                  {manifestArtifact ? (
                     <Button
                        icon={<FileZipOutlined />}
                        onClick={() => handleQuickDownload(manifestArtifact)}
                     >
                        Tải Gói Manifest
                     </Button>
                  ) : null}
               </Flex>
            </Flex>
         </Card>

         <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            type="card"
         />
      </Flex>
   );
}
