"use client";

/**
 * [29] DET Studio — W-C "Preview & Export" lane: honest resolved-preview panel.
 *
 * Presentational only. Data enters as slices of the frozen `StudioRunView`
 * read model (`run.preview`, `run.mode`, `run.label`) — this module never
 * fetches, never imports server code, and never renders a screenshot, mock
 * image or fabricated frame as preview "proof".
 *
 * `preview.status === "unavailable"` is a normal, calm operator state: the
 * reader's reason is rendered verbatim, plus one line stating that a preview
 * appears only when [28]'s verified DET Preview Theme output is bound. It is
 * not a failure to hide.
 *
 * `preview.status === "available"` can only ever carry `verified: true` (the
 * frozen contract makes anything else unrepresentable): Studio then shows the
 * run label, the real URL as a visible link, an open-in-new-tab affordance
 * with `rel="noreferrer"`, and a small verified badge. No iframe — the
 * preview is engine-rendered in an isolated DET Preview Theme, outside Studio.
 *
 * DEMO fixture runs (`mode === "fixture"`) always carry a visible DEMO badge
 * near the preview panel so fixture data can never masquerade as live proof.
 *
 * [61] Ant Design stock light appearance: antd Card, antd links, a calm info
 * Alert for the unavailable state and built-in preset-color Tags. Icons are
 * decorative.
 */
import { ExportOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Card, Flex, Tag, Typography } from "antd";
import type {
   StudioPreviewState,
   StudioRunMode,
} from "@/src/modules/studio/shared/contracts";

export interface PreviewPanelProps {
   /** The `run.preview` slice of the frozen read model. */
   preview: StudioPreviewState;
   /** The `run.mode` slice — fixture runs are visibly labeled DEMO. */
   mode: StudioRunMode;
   /** The `run.label` slice — rendered only for an available preview. */
   label: string;
}

export function PreviewPanel({ preview, mode, label }: PreviewPanelProps) {
   return (
      <Card
         size="small"
         data-testid="preview-panel"
         title={<h2>Xem trước</h2>}
         extra={
            mode === "fixture" ? (
               <Tag
                  color="gold"
                  data-testid="preview-demo-badge"
                  title="Lần chạy DEMO fixture — dữ liệu minh họa, không phải chuyển đổi thật."
               >
                  DEMO
               </Tag>
            ) : undefined
         }
      >
         <Typography.Paragraph type="secondary">
            {preview.status === "available"
               ? "Đọc từ output DET Preview Theme đã xác minh, cách ly của lần chạy này."
               : "Chưa có bản xem trước nào đã xác minh được gắn vào lần chạy này."}
         </Typography.Paragraph>
         {preview.status === "unavailable" ? (
            <PreviewUnavailableReason reason={preview.reason} />
         ) : (
            <PreviewAvailableSource preview={preview} label={label} />
         )}
      </Card>
   );
}

/**
 * Calm informational panel for the normal "no verified preview" state.
 * [61] Vietnamese label ("Không thể xem trước") next to the raw machine code
 * `PREVIEW_UNAVAILABLE` as an inline `Text code` chip — the raw string stays
 * visible in the DOM. The reader-supplied reason is rendered VERBATIM in its
 * own paragraph.
 */
function PreviewUnavailableReason({ reason }: { reason: string }) {
   return (
      <Alert
         type="info"
         showIcon
         title={
            <Flex wrap="wrap" align="center" gap="small">
               Không thể xem trước
               <Typography.Text code>PREVIEW_UNAVAILABLE</Typography.Text>
            </Flex>
         }
         description={
            <>
               <p data-testid="preview-unavailable-reason">{reason}</p>
               <p>
                  <Typography.Text type="secondary">
                     Bản xem trước chỉ xuất hiện khi output DET Preview Theme đã
                     xác minh của [28] được gắn vào lần chạy này. Đây là trạng
                     thái bình thường, không phải lỗi.
                  </Typography.Text>
               </p>
            </>
         }
      />
   );
}

/** Available state: real URL as text + links, verified badge. Never an iframe. */
function PreviewAvailableSource({
   preview,
   label,
}: {
   preview: Extract<StudioPreviewState, { status: "available" }>;
   label: string;
}) {
   return (
      <Flex vertical gap="middle">
         <Flex wrap="wrap" align="center" gap="small">
            <Typography.Text strong>{label}</Typography.Text>
            <Tag
               color="success"
               data-testid="preview-verified-badge"
               icon={<SafetyCertificateOutlined aria-hidden="true" />}
               title="Đã xác minh bởi biên giới engine — Studio không bao giờ tự bịa URL xem trước hay tuyên bố thành công."
            >
               Đã xác minh
            </Tag>
         </Flex>
         <Flex wrap="wrap" align="center" gap="small">
            <Typography.Link
               href={preview.url}
               data-testid="preview-url-link"
               title={preview.url}
            >
               {preview.url}
            </Typography.Link>
            <Typography.Link
               href={preview.url}
               target="_blank"
               rel="noreferrer"
               data-testid="preview-new-tab-link"
            >
               <ExportOutlined aria-hidden="true" />
               Mở tab mới
            </Typography.Link>
         </Flex>
         <Typography.Paragraph type="secondary">
            Bản xem trước do engine render bằng DET Preview Theme cách ly, bên
            ngoài Studio. Studio chỉ hiển thị link đã xác minh — không bao giờ
            giả lập ảnh chụp làm bằng chứng Magento.
         </Typography.Paragraph>
      </Flex>
   );
}
