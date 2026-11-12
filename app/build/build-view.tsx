"use client";

import { ApiOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Flex, Typography } from "antd";

import {
   BuildLauncher,
   type BuildJobView,
   type BuildLauncherEntry,
} from "./build-launcher";

/**
 * [61] Client view child for the Build Control server page: stock antd light
 * heading, catalog/runner alerts and the launcher. Terse Vietnamese operator
 * copy ("ít chữ"); machine tokens (npm run dev, STUDIO_BUILD_PROJECTS_DIR,
 * STUDIO_DET_RUNS_DIR, resources/examples/build, docs/studio/README.md, error codes)
 * stay verbatim inside the stock `Typography.Text code` look. No custom CSS
 * or utility classes; raw h1 keeps its aria-labelledby target and the inline
 * heading style is layout-only.
 */

interface BuildViewProps {
   catalogErrorCode: string | null;
   catalogErrorMessage: string | null;
   catalogEntries: BuildLauncherEntry[] | null;
   catalogInvalid: Array<{ configId: string; reason: string }>;
   runnerReady: boolean;
   runnerReason?: string;
   initialActive: BuildJobView | null;
}

export function BuildView({
   catalogErrorCode,
   catalogErrorMessage,
   catalogEntries,
   catalogInvalid,
   runnerReady,
   runnerReason,
   initialActive,
}: BuildViewProps) {
   return (
      <Flex vertical gap={32}>
         <section aria-labelledby="build-control-heading">
            <Flex align="center" gap={8}>
               <ToolOutlined aria-hidden="true" />
               {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
               <h1 id="build-control-heading" style={{ margin: 0 }}>
                  Bản dựng
               </h1>
            </Flex>
         </section>

         {catalogErrorCode !== null ? (
            <Alert
               type="warning"
               showIcon
               icon={<ApiOutlined aria-hidden="true" />}
               message={`Chưa cấu hình danh mục bản dựng (${catalogErrorCode})`}
               description={
                  <>
                     <p>{catalogErrorMessage}</p>
                     <Typography.Paragraph type="secondary">
                        Chạy <Typography.Text code>npm run dev</Typography.Text>{" "}
                        từ gốc repo (các ví dụ có sẵn trong{" "}
                        <Typography.Text code>
                           resources/examples/build
                        </Typography.Text>{" "}
                        được nạp tại chỗ), hoặc đặt{" "}
                        <Typography.Text code>
                           STUDIO_BUILD_PROJECTS_DIR
                        </Typography.Text>{" "}
                        trỏ tới thư mục các mục cấu hình (một thư mục con mỗi
                        mục, chứa{" "}
                        <Typography.Text code>
                           build-config.json
                        </Typography.Text>
                        ) và{" "}
                        <Typography.Text code>
                           STUDIO_DET_RUNS_DIR
                        </Typography.Text>{" "}
                        trỏ tới output root. Xem{" "}
                        <Typography.Text code>
                           docs/studio/README.md
                        </Typography.Text>
                        . Trang này cố ý không hiển thị dữ liệu demo.
                     </Typography.Paragraph>
                  </>
               }
            />
         ) : catalogEntries !== null ? (
            <BuildLauncher
               entries={catalogEntries}
               invalid={catalogInvalid}
               runnerReady={runnerReady}
               runnerReason={runnerReason}
               initialActive={initialActive}
            />
         ) : (
            <Alert
               type="error"
               showIcon
               icon={<WarningOutlined aria-hidden="true" />}
               message="Không đọc được danh mục bản dựng"
               description="Không thể đọc danh mục trên server này."
            />
         )}
      </Flex>
   );
}
