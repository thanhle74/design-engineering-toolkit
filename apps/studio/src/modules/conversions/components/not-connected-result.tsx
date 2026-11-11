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
 * info Alert carrying the exact not-connected copy.
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
}

export function NotConnectedResult({ summary, className }: NotConnectedResultProps) {
  const rows: SummaryRow[] = [
    {
      label: "Source file key",
      value: summary.fileKey ?? "Not provided (bare node id)",
      mono: summary.fileKey !== null,
    },
    { label: "Node id", value: summary.nodeId, mono: true },
    { label: "Output target", value: TARGET_LABELS[summary.target] },
    {
      label: "Project profile",
      value: summary.profileName ? summary.profileName : "Not configured",
    },
  ];

  return (
    <Card
      size="small"
      data-testid="conversion-result"
      aria-label="Conversion request summary"
      className={className}
      title={
        <Flex wrap="wrap" align="center" gap="small">
          <h3>Conversion request summary</h3>
          <Tag>NOT CONNECTED</Tag>
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
              ) : row.value.startsWith("Not ") ? (
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
          Bare node id: no file key was provided. Paste the full Figma design URL (with
          ?node-id=…) to include the file the engine would read.
        </Typography.Paragraph>
      ) : null}

      <Alert
        type="info"
        showIcon
        title="Conversion execution is not connected"
        description="Studio cannot run conversions in this MVP: issue [28] owns the engine bridge to the det CLI, and it is not connected yet. No conversion was run — this panel only summarizes the request you entered."
      />
    </Card>
  );
}
