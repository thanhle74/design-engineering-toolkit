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
import {
  ExportOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Alert, Card, Flex, Tag, Typography } from "antd";
import type { StudioPreviewState, StudioRunMode } from "@/src/shared/contracts";

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
      title={<h2>Preview</h2>}
      extra={
        mode === "fixture" ? (
          <Tag
            color="gold"
            data-testid="preview-demo-badge"
            title="DEMO fixture run — illustrative data, not a live conversion."
          >
            DEMO
          </Tag>
        ) : undefined
      }
    >
      <Typography.Paragraph type="secondary">
        {preview.status === "available"
          ? "Resolved from the run's verified, isolated DET Preview Theme output."
          : "No verified preview is bound to this run."}
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
 * The reader-supplied reason is rendered VERBATIM in its own paragraph.
 */
function PreviewUnavailableReason({ reason }: { reason: string }) {
  return (
    <Alert
      type="info"
      showIcon
      title={
        <Flex wrap="wrap" align="center" gap="small">
          Preview unavailable
          <Tag>PREVIEW_UNAVAILABLE</Tag>
        </Flex>
      }
      description={
        <>
          <p data-testid="preview-unavailable-reason">{reason}</p>
          <p>
            <Typography.Text type="secondary">
              A preview appears only when [28]&rsquo;s verified DET Preview
              Theme output is bound to this run. This is a normal state, not a
              failure.
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
          title="Verified by the engine boundary — Studio never invents a preview URL or success."
        >
          Verified
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
          Open in new tab
        </Typography.Link>
      </Flex>
      <Typography.Paragraph type="secondary">
        The preview is rendered by the engine&rsquo;s isolated DET Preview
        Theme, outside Studio. Studio shows the verified link only — never a
        mock screenshot as Magento proof.
      </Typography.Paragraph>
    </Flex>
  );
}
