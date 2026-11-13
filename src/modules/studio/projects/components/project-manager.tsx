"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
   DeleteOutlined,
   FolderOutlined,
   LinkOutlined,
   PlusOutlined,
   RocketOutlined,
} from "@ant-design/icons";
import {
   Button,
   Card,
   Collapse,
   Empty,
   Flex,
   Popconfirm,
   Spin,
   Table,
   Tag,
   Typography,
   message,
   type TableColumnsType,
} from "antd";

import type { FigmaPage, ProjectRecord } from "../types";
import { AddPageModal } from "./add-page-modal";
import { CreateProjectModal } from "./create-project-modal";

export function ProjectManager() {
   const router = useRouter();
   const [projects, setProjects] = useState<ProjectRecord[]>([]);
   const [loading, setLoading] = useState(true);

   const [createModalOpen, setCreateModalOpen] = useState(false);
   const [activeProjectForPage, setActiveProjectForPage] =
      useState<ProjectRecord | null>(null);

   async function fetchProjects() {
      try {
         const res = await fetch("/api/projects");
         if (!res.ok) throw new Error("Không thể tải danh sách dự án");
         const data = (await res.json()) as { projects: ProjectRecord[] };
         setProjects(data.projects || []);
      } catch (err) {
         message.error(err instanceof Error ? err.message : "Lỗi kết nối");
      } finally {
         setLoading(false);
      }
   }

   useEffect(() => {
      const timer = window.setTimeout(() => {
         void fetchProjects();
      }, 0);
      return () => window.clearTimeout(timer);
   }, []);

   async function handleDeleteProject(projectId: string) {
      try {
         const res = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}`,
            {
               method: "DELETE",
            },
         );
         if (!res.ok) throw new Error("Xóa dự án thất bại");
         message.success("Đã xóa dự án");
         setProjects((prev) => prev.filter((p) => p.id !== projectId));
      } catch (err) {
         message.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
   }

   async function handleDeletePage(projectId: string, pageId: string) {
      try {
         const res = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
            { method: "DELETE" },
         );
         if (!res.ok) throw new Error("Xóa trang thất bại");
         message.success("Đã xóa trang");
         setProjects((prev) =>
            prev.map((proj) =>
               proj.id === projectId
                  ? {
                       ...proj,
                       pages: proj.pages.filter((pg) => pg.id !== pageId),
                    }
                  : proj,
            ),
         );
      } catch (err) {
         message.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
   }

   function handleNavigateToBuild(figmaUrl: string) {
      router.push(`/build?source=${encodeURIComponent(figmaUrl)}`);
   }

   function handleProjectCreated(newProject: ProjectRecord) {
      setProjects((prev) => [...prev, newProject]);
   }

   function handlePageAdded(projectId: string, newPage: FigmaPage) {
      setProjects((prev) =>
         prev.map((proj) =>
            proj.id === projectId
               ? { ...proj, pages: [...proj.pages, newPage] }
               : proj,
         ),
      );
   }

   const collapseItems = projects.map((proj) => {
      const pageColumns: TableColumnsType<FigmaPage> = [
         {
            title: "Tên trang",
            dataIndex: "name",
            render: (name: string) => (
               <Typography.Text strong>{name}</Typography.Text>
            ),
         },
         {
            title: "Node ID",
            dataIndex: "nodeId",
            render: (nodeId: string) => <Tag color="blue">{nodeId}</Tag>,
         },
         {
            title: "Nguồn Figma",
            dataIndex: "figmaUrl",
            render: (url: string) => (
               <Typography.Paragraph
                  ellipsis={{ rows: 1 }}
                  style={{ maxWidth: 320, margin: 0 }}
               >
                  <LinkOutlined style={{ marginRight: 6 }} />
                  <Typography.Text code>{url}</Typography.Text>
               </Typography.Paragraph>
            ),
         },
         {
            title: "Ghi chú",
            dataIndex: "notes",
            render: (notes: string) => (
               <Typography.Text type="secondary">
                  {notes || "—"}
               </Typography.Text>
            ),
         },
         {
            title: "Thao tác",
            key: "actions",
            render: (_, page) => (
               <Flex gap="small">
                  <Button
                     type="primary"
                     size="small"
                     icon={<RocketOutlined />}
                     onClick={() => handleNavigateToBuild(page.figmaUrl)}
                  >
                     Build trang này
                  </Button>
                  <Popconfirm
                     title="Xác nhận xóa trang này?"
                     okText="Xóa"
                     cancelText="Hủy"
                     onConfirm={() => handleDeletePage(proj.id, page.id)}
                  >
                     <Button size="small" danger icon={<DeleteOutlined />}>
                        Xóa
                     </Button>
                  </Popconfirm>
               </Flex>
            ),
         },
      ];

      return {
         key: proj.id,
         label: (
            <Flex
               align="center"
               justify="space-between"
               wrap="wrap"
               gap="small"
               style={{ width: "100%", paddingRight: 8 }}
            >
               <Flex align="center" gap="small">
                  <FolderOutlined />
                  <Typography.Text strong style={{ fontSize: 16 }}>
                     {proj.name}
                  </Typography.Text>
                  <Typography.Text code type="secondary">
                     {proj.id}
                  </Typography.Text>
                  <Tag color="geekblue">{proj.platformId}</Tag>
                  <Tag color={proj.pages.length > 0 ? "cyan" : "default"}>
                     {proj.pages.length} trang
                  </Tag>
               </Flex>
               <Flex
                  align="center"
                  gap="small"
                  onClick={(e) => e.stopPropagation()}
               >
                  <Button
                     size="small"
                     icon={<PlusOutlined />}
                     onClick={() => setActiveProjectForPage(proj)}
                  >
                     Thêm trang
                  </Button>
                  <Popconfirm
                     title={`Bạn có chắc muốn xóa dự án "${proj.name}"?`}
                     description="Toàn bộ danh sách trang Figma của dự án này sẽ bị xóa."
                     okText="Xóa dự án"
                     cancelText="Hủy"
                     okButtonProps={{ danger: true }}
                     onConfirm={() => handleDeleteProject(proj.id)}
                  >
                     <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                     >
                        Xóa
                     </Button>
                  </Popconfirm>
               </Flex>
            </Flex>
         ),
         children: (
            <Flex vertical gap="middle">
               {proj.description ? (
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                     {proj.description}
                  </Typography.Paragraph>
               ) : null}

               {proj.pages.length === 0 ? (
                  <Empty
                     description="Dự án này chưa có trang Figma nào"
                     image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                     <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => setActiveProjectForPage(proj)}
                     >
                        Thêm trang Figma đầu tiên
                     </Button>
                  </Empty>
               ) : (
                  <Table
                     rowKey="id"
                     dataSource={proj.pages}
                     columns={pageColumns}
                     pagination={false}
                     size="middle"
                  />
               )}
            </Flex>
         ),
      };
   });

   return (
      <Flex vertical gap="middle">
         <Card size="small">
            <Flex
               align="center"
               justify="space-between"
               wrap="wrap"
               gap="middle"
            >
               <Flex vertical gap={2}>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                     Danh sách dự án
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                     Tổ chức các trang Figma (Trang chủ, PLP, PDP, Banner...)
                     theo từng dự án. Nhấn &ldquo;Build trang này&rdquo; để
                     chuyển đổi trực tiếp.
                  </Typography.Text>
               </Flex>
               <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalOpen(true)}
               >
                  Tạo dự án mới
               </Button>
            </Flex>
         </Card>

         {loading ? (
            <Flex justify="center" align="center" style={{ padding: 48 }}>
               <Spin size="large" />
            </Flex>
         ) : projects.length === 0 ? (
            <Empty
               description="Chưa có dự án nào được tạo"
               image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
               <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalOpen(true)}
               >
                  Tạo dự án ngay
               </Button>
            </Empty>
         ) : (
            <Collapse
               defaultActiveKey={projects.map((p) => p.id)}
               items={collapseItems}
            />
         )}

         <CreateProjectModal
            open={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onProjectCreated={handleProjectCreated}
         />

         <AddPageModal
            project={activeProjectForPage}
            open={activeProjectForPage !== null}
            onClose={() => setActiveProjectForPage(null)}
            onPageAdded={handlePageAdded}
         />
      </Flex>
   );
}
