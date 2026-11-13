"use client";

import { useMemo, useState } from "react";
import {
   Alert,
   Flex,
   Form,
   Input,
   Modal,
   Tag,
   Typography,
   message,
} from "antd";
import { parseFigmaInput } from "@/src/modules/studio/conversions/figma-input";
import type { FigmaPage, ProjectRecord } from "../types";

interface AddPageModalProps {
   project: ProjectRecord | null;
   open: boolean;
   onClose: () => void;
   onPageAdded: (projectId: string, page: FigmaPage) => void;
}

export function AddPageModal({
   project,
   open,
   onClose,
   onPageAdded,
}: AddPageModalProps) {
   const [form] = Form.useForm();
   const [loading, setLoading] = useState(false);
   const [figmaUrlInput, setFigmaUrlInput] = useState("");

   const parseResult = useMemo(
      () => parseFigmaInput(figmaUrlInput),
      [figmaUrlInput],
   );

   async function handleSubmit(values: {
      name: string;
      figmaUrl: string;
      notes?: string;
   }) {
      if (!project) return;
      if (!parseResult.ok) {
         message.error(parseResult.message);
         return;
      }

      setLoading(true);
      try {
         const res = await fetch(
            `/api/projects/${encodeURIComponent(project.id)}/pages`,
            {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify(values),
            },
         );

         const data = (await res.json()) as {
            page?: FigmaPage;
            error?: { message: string };
         };

         if (!res.ok || !data.page) {
            throw new Error(data.error?.message || "Thêm trang thất bại");
         }

         message.success(`Đã thêm trang "${data.page.name}" vào dự án!`);
         form.resetFields();
         setFigmaUrlInput("");
         onPageAdded(project.id, data.page);
         onClose();
      } catch (err) {
         message.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
         setLoading(false);
      }
   }

   function handleCancel() {
      form.resetFields();
      setFigmaUrlInput("");
      onClose();
   }

   return (
      <Modal
         title={`Thêm trang Figma vào dự án "${project?.name || ""}"`}
         open={open}
         onCancel={handleCancel}
         onOk={() => form.submit()}
         confirmLoading={loading}
         okButtonProps={{ disabled: !parseResult.ok }}
         okText="Thêm trang"
         cancelText="Hủy"
         destroyOnHidden
      >
         <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
               label="Tên trang / Phân đoạn"
               name="name"
               rules={[{ required: true, message: "Vui lòng nhập tên trang" }]}
            >
               <Input placeholder="Ví dụ: Trang chủ (Homepage), Danh mục PLP, Sản phẩm PDP, Banner..." />
            </Form.Item>

            <Form.Item
               label="Link Figma hoặc Node ID"
               name="figmaUrl"
               rules={[
                  {
                     required: true,
                     message: "Vui lòng nhập link Figma hoặc Node ID",
                  },
               ]}
               help="URL Figma kèm node-id (?node-id=245-2) hoặc node id trần (ví dụ: 245:2)"
            >
               <Input
                  placeholder="https://www.figma.com/design/<fileKey>/<file>?node-id=245-2"
                  value={figmaUrlInput}
                  onChange={(e) => setFigmaUrlInput(e.target.value)}
               />
            </Form.Item>

            {figmaUrlInput.trim() !== "" ? (
               parseResult.ok ? (
                  <Alert
                     type="success"
                     showIcon
                     style={{ marginBottom: 16 }}
                     message={
                        <Flex gap="small" align="center" wrap="wrap">
                           <Typography.Text strong>Node ID:</Typography.Text>
                           <Tag color="blue">{parseResult.nodeId}</Tag>
                           {parseResult.fileKey ? (
                              <>
                                 <Typography.Text strong>
                                    File Key:
                                 </Typography.Text>
                                 <Tag color="cyan">{parseResult.fileKey}</Tag>
                              </>
                           ) : (
                              <Tag color="default">Node ID trần</Tag>
                           )}
                        </Flex>
                     }
                  />
               ) : (
                  <Alert
                     type="error"
                     showIcon
                     style={{ marginBottom: 16 }}
                     message="Định dạng chưa hợp lệ"
                     description={parseResult.message}
                  />
               )
            ) : null}

            <Form.Item label="Ghi chú về trang (tùy chọn)" name="notes">
               <Input.TextArea
                  rows={2}
                  placeholder="Ví dụ: Gồm Hero Banner, Two-column features và Product Slider"
               />
            </Form.Item>
         </Form>
      </Modal>
   );
}
