"use client";

/**
 * [29] Studio — disposition/severity badge vocabulary ([61] Ant Design stock
 * light appearance).
 *
 * Canonical engine strings are rendered EXACTLY as the engine emits them.
 * Compose dispositions are the frozen `mapped | gap | decoration-merged |
 * excluded | skipped` vocabulary; `NEEDS_REVIEW` appears only as a review
 * disposition / derived flag badge, never as a compose disposition.
 *
 * Semantic color mapping (antd built-in preset Tag colors only — attention is
 * amber/gold, never destructive red):
 *   mapped            -> success (green)
 *   gap               -> gold (attention, not error)
 *   decoration-merged -> default gray
 *   excluded          -> default gray
 *   skipped           -> default subtle
 *   NEEDS_REVIEW      -> gold + warning icon
 *   info -> blue · warning -> gold · error -> error
 *
 * "Value absent" tags render as plain default Tags so an unknown fact never
 * looks like data.
 */
import { WarningOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import type {
  StudioComposeDisposition,
  StudioNodeKind,
  StudioReviewDisposition,
  StudioSeverity,
} from "@/src/studio/shared/contracts";

export function ComposeDispositionBadge({
  disposition,
}: {
  disposition: StudioComposeDisposition;
}) {
  switch (disposition) {
    case "mapped":
      return <Tag color="success">{disposition}</Tag>;
    case "gap":
      return <Tag color="gold">{disposition}</Tag>;
    case "decoration-merged":
    case "excluded":
      return <Tag>{disposition}</Tag>;
    case "skipped":
      return <Tag>{disposition}</Tag>;
  }
}

export function ReviewDispositionBadge({
  disposition,
}: {
  disposition: StudioReviewDisposition;
}) {
  if (disposition === "NEEDS_REVIEW") {
    return (
      <Tag
        color="gold"
        icon={<WarningOutlined aria-hidden="true" data-icon="inline-start" />}
      >
        {disposition}
      </Tag>
    );
  }
  return <Tag>{disposition}</Tag>;
}

export function KindBadge({ kind }: { kind?: StudioNodeKind }) {
  if (!kind) {
    // "không rõ" — a fact the run does not carry is shown, never invented ([61] Vietnamese).
    return <Tag>không rõ</Tag>;
  }
  return <Tag>{kind}</Tag>;
}

export function SeverityBadge({ severity }: { severity: StudioSeverity }) {
  switch (severity) {
    case "info":
      return <Tag color="blue">{severity}</Tag>;
    case "warning":
      return <Tag color="gold">{severity}</Tag>;
    case "error":
      return <Tag color="error">{severity}</Tag>;
  }
}

export function OriginBadge({
  origin,
}: {
  origin: "run" | "compose" | "review";
}) {
  return <Tag>{origin}</Tag>;
}

/** DEMO/LIVE run-mode badge: a fixture run is always visibly labeled DEMO. */
export function RunModeBadge({ mode }: { mode: "fixture" | "live" }) {
  if (mode === "fixture") {
    return (
      <Tag color="gold" data-testid="studio-demo-badge">
        DEMO
      </Tag>
    );
  }
  return (
    <Tag color="success" data-testid="studio-live-badge">
      LIVE
    </Tag>
  );
}
