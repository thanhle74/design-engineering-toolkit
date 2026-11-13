"use client";

import { useState } from "react";
import { Form, Input, Modal, Select, message } from "antd";
import type { ProjectRecord } from "../types";

interface CreateProjectModalProps {
   open: boolean;
   onClose: () => void;
   onProjectCreated: (project: ProjectRecord) => void;
}

export function CreateProjectModal({
   open,
   onClose,
   onProjectCreated,
}: CreateProjectModalProps) {
   const [form] = Form.useForm();
   const [loading, setLoading] = useState(false);

   async function handleSubmit(values: {
      name: string;
      id?: string;
      platformId: string;
      description?: string;
   }) {
      setLoading(true);
      try {
         const res = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
         });

         const data = (await res.json()) as {
            project?: ProjectRecord;
            error?: { message: string };
         };

         if (!res.ok || !data.project) {
            throw new Error(data.error?.message || "Tạo dự án thất bại");
         }

         message.success(`Đã tạo dự án "${data.project.name}" thành công!`);
         form.resetFields();
         onProjectCreated(data.project);
         onClose();
      } catch (err) {
         message.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
         setLoading(false);
      }
   }

   return (
      <Modal
         title="Tạo dự án mới"
         open={open}
         onCancel={onClose}
         onOk={() => form.submit()}
         confirmLoading={loading}
         okText="Tạo dự án"
         cancelText="Hủy"
         destroyOnHidden
      >
         <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{ platformId: "magento-page-builder" }}
         >
            <Form.Item
               label="Tên dự án"
               name="name"
               rules={[{ required: true, message: "Vui lòng nhập tên dự án" }]}
            >
               <Input placeholder="Ví dụ: Slaunchpad Fashion, Dự án Khách hàng A" />
            </Form.Item>

            <Form.Item
               label="Mã định danh (Slug / ID)"
               name="id"
               tooltip="Để trống để hệ thống tự tạo từ tên dự án"
            >
               <Input placeholder="Ví dụ: slaunchpad-fashion" />
            </Form.Item>

            <Form.Item
               label="Nền tảng đích"
               name="platformId"
               rules={[{ required: true }]}
            >
               <Select
                  options={[
                     {
                        value: "magento-page-builder",
                        label: "Native Magento Page Builder",
                     },
                     {
                        value: "hyva-phtml",
                        label: "Hyvä Theme PHTML (Scaffold)",
                     },
                  ]}
               />
            </Form.Item>

            <Form.Item label="Mô tả dự án" name="description">
               <Input.TextArea
                  rows={3}
                  placeholder="Mô tả ngắn gọn về cửa hàng, phiên bản Magento hoặc yêu cầu đặc thù"
               />
            </Form.Item>
         </Form>
      </Modal>
   );
}
