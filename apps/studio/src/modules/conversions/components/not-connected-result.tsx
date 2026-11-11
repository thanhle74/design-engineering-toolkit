"use client";

/**
 * [29] DET Studio — honest NOT CONNECTED result state (New Conversion module, lane W-A).
 *
 * Renders the validated request summary plus an explicit notice that conversion
 * execution is not connected in this MVP (issue [28] owns the engine bridge).
 * There is intentionally NO spinner, NO progress state and NO success claim —
 * no conversion has run.
 *
 * [61] Ant Design stock light appearance: antd Card + default Tag + a calm
 * info Alert carrying the exact not-connected copy. Human copy is natural
 * Vietnamese ("Chưa hỗ trợ chạy trực tiếp") with the machine reason token
 * `NOT_CONNECTED` kept visible as an inline `Text code` chip; file keys and
 * node ids stay verbatim.
 */
import { Alert, Card, Flex, Tag, Typography } from "antd";

import { TARGET_LABELS } from "../conversion-options";
import type { ConversionRequestSummary } from "../types";

interface NotConnectedResultProps {
  summary: ConversionRequestSummary;
  className?: string;
}

interface SummaryRow {
  label: string;
  value: string;
  /** Id-like facts render as antd inline code; unknown facts stay plain. */
  mono?: boolean;
  /** An absent fact renders secondary — visibly not data. */
  muted?: boolean;
}

export function NotConnectedResult({ summary, className }: NotConnectedResultProps) {
  const rows: SummaryRow[] = [
    {
      label: "File key nguồn",
      value: summary.fileKey ?? "Không có (chỉ node id)",
      mono: summary.fileKey !== null,
      muted: summary.fileKey === null,
    },
    { label: "Node id", value: summary.nodeId, mono: true },
    { label: "Đích xuất", value: TARGET_LABELS[summary.target] },
    {
      label: "Hồ sơ dự án",
      value: summary.profileName ? summary.profileName : "Chưa cấu hình",
      muted: !summary.profileName,
    },
  ];

  return (
    <Card
      size="small"
      data-testid="conversion-result"
      aria-label="Tóm tắt yêu cầu chuyển đổi"
      className={className}
      title={
        <Flex wrap="wrap" align="center" gap="small">
          <h3>Tóm tắt yêu cầu chuyển đổi</h3>
          <Tag>Chưa hỗ trợ chạy trực tiếp</Tag>
          <Typography.Text code>NOT_CONNECTED</Typography.Text>
        </Flex>
      }
    >
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>
              <Typography.Text type="secondary">{row.label}</Typography.Text>
            </dt>
            <dd>
              {row.mono ? (
                <Typography.Text code>{row.value}</Typography.Text>
              ) : row.muted ? (
                <Typography.Text type="secondary">{row.value}</Typography.Text>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {summary.inputKind === "bare" ? (
        <Typography.Paragraph type="secondary">
          Node id trần: chưa có file key nào được cung cấp. Dán URL Figma đầy đủ
          (kèm ?node-id=…) để xác định cả file mà engine sẽ đọc.
        </Typography.Paragraph>
      ) : null}

      <Alert
        type="info"
        showIcon
        title="Studio chưa hỗ trợ chạy chuyển đổi trực tiếp"
        description="Studio chưa thể tự chạy chuyển đổi ở giai đoạn này: cầu nối engine tới det CLI thuộc [28] và chưa được nối. Chưa có chuyển đổi nào được chạy — bảng này chỉ tóm tắt yêu cầu bạn vừa nhập."
      />
    </Card>
  );
}
