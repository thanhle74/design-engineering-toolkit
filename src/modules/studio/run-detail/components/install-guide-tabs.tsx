"use client";

/**
 * [74] Static install-guide tabs for the run overview (extracted verbatim
 * from `run-overview-panel.tsx` — the one purely static content block: the
 * two Magento ingestion methods with their 3-step flows). No props, no
 * state, no data — moving it out keeps the overview panel focused on
 * run-derived facts.
 *
 * [61] Ant Design stock light Tabs/Steps, light-only invariant preserved.
 */
import { CheckCircleOutlined } from "@ant-design/icons";
import { Steps, Tabs } from "antd";

export function InstallGuideTabs() {
   return (
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
                     Cách 1: Gói cài đặt trọn bộ tự động (Khuyên dùng — Đầy đủ
                     ảnh &amp; Script)
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
   );
}
