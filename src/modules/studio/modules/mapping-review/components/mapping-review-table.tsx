"use client";

/**
 * [29] Studio — mapping review table (one row per run.mappings entry).
 *
 * [61] Ant Design stock light appearance: Table via the `columns` prop (no
 * dot-notation subcomponents), default light theme, no custom row styling.
 * The derived `needsReview` fact is carried ONLY as the row's
 * `data-needs-review` attribute plus the gold NEEDS_REVIEW review badge —
 * no row highlight class is applied.
 *
 * Data honesty rules enforced here:
 *  - node ids render verbatim (n-… / s-…);
 *  - optional fields render "unknown", never 0 and never a fabricated value;
 *  - compose dispositions are the exact engine vocabulary;
 *  - `needsReview` is presented only as the DERIVED review flag + review
 *    badge — it is never shown as a compose disposition;
 *  - every GAP / EXCLUDED / SKIPPED row stays in the table with its reasons.
 */
import type { HTMLAttributes } from "react";
import { Flex, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import {
  ComposeDispositionBadge,
  KindBadge,
  ReviewDispositionBadge,
} from "./disposition-badges";

/** Muted stand-in for a fact the run does not carry. Never a zero ([61] Vietnamese). */
const UNKNOWN = "không rõ";

/**
 * antd `onRow` prop bags accept arbitrary DOM attributes, but React's
 * `HTMLAttributes` type has no `data-*` index signature — a narrow cast keeps
 * the test-visible row attributes honest without loosening antd's own typing.
 */
function rowProps(
  props: Record<string, string>
): HTMLAttributes<HTMLTableRowElement> {
  return props as unknown as HTMLAttributes<HTMLTableRowElement>;
}

/** Muted stand-in for a fact the run does not carry. Never a zero. */
function UnknownText() {
  return (
    <Typography.Text type="secondary">{UNKNOWN}</Typography.Text>
  );
}

function TargetCell({ mapping }: { mapping: StudioMappingView }) {
  if (mapping.target) {
    const { capabilityId, appearanceId, nativeElement, nativeField } =
      mapping.target;
    return (
      <Flex vertical gap="small">
        <Typography.Text code>{capabilityId}</Typography.Text>
        <Typography.Text type="secondary">
          {appearanceId}
        </Typography.Text>
        {(nativeElement || nativeField) && (
          <Typography.Text type="secondary">
            {nativeElement ?? UNKNOWN} · {nativeField ?? UNKNOWN}
          </Typography.Text>
        )}
      </Flex>
    );
  }
  if (mapping.composeDisposition === "mapped") {
    // The engine contract requires a target on every mapped row; render the
    // missing fact as unknown instead of inventing or hiding it.
    return <UnknownText />;
  }
  return <Typography.Text type="secondary">—</Typography.Text>;
}

function NotesCell({ mapping }: { mapping: StudioMappingView }) {
  const hasNote = Boolean(mapping.note);
  const hasReasons = mapping.reasons.length > 0;
  if (!hasNote && !hasReasons) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <Flex vertical gap="small">
      {mapping.note && <p>{mapping.note}</p>}
      {hasReasons && (
        <ul>
          {mapping.reasons.map((reason, index) => (
            <li key={index}>
              <Typography.Text type="secondary">
                {reason}
              </Typography.Text>
            </li>
          ))}
        </ul>
      )}
    </Flex>
  );
}

const columns: ColumnsType<StudioMappingView> = [
  {
    title: "Node",
    render: (_, mapping) => (
      <Flex vertical gap="small">
        <Typography.Text code title={mapping.nodeId}>
          {mapping.nodeId}
        </Typography.Text>
        <Typography.Text type="secondary">
          {mapping.sourceName ?? UNKNOWN}
        </Typography.Text>
      </Flex>
    ),
  },
  {
    title: "Vị trí trong nguồn",
    render: (_, mapping) =>
      mapping.sourceLocator ? (
        <Typography.Text code ellipsis title={mapping.sourceLocator}>
          {mapping.sourceLocator}
        </Typography.Text>
      ) : (
        <UnknownText />
      ),
  },
  {
    title: "Loại",
    render: (_, mapping) => <KindBadge kind={mapping.kind} />,
  },
  {
    title: "Lớp ngữ nghĩa",
    render: (_, mapping) => (
      <Typography.Text code type="secondary">
        {mapping.semanticClass ?? UNKNOWN}
      </Typography.Text>
    ),
  },
  {
    title: "Compose",
    render: (_, mapping) => (
      <ComposeDispositionBadge disposition={mapping.composeDisposition} />
    ),
  },
  {
    title: "Review",
    render: (_, mapping) =>
      mapping.reviewDisposition ? (
        <ReviewDispositionBadge disposition={mapping.reviewDisposition} />
      ) : (
        <Typography.Text type="secondary">—</Typography.Text>
      ),
  },
  {
    title: "Đích",
    render: (_, mapping) => <TargetCell mapping={mapping} />,
  },
  {
    title: "Ghi chú / lý do",
    render: (_, mapping) => <NotesCell mapping={mapping} />,
  },
];

/** The review table proper: exactly one row per mapping, in run order. */
export function MappingReviewTable({
  mappings,
}: {
  mappings: readonly StudioMappingView[];
}) {
  return (
    <div data-testid="mapping-review-table">
      <Table<StudioMappingView>
        rowKey="nodeId"
        size="small"
        columns={columns}
        dataSource={[...mappings]}
        pagination={false}
        onRow={(mapping) =>
          rowProps({
            "data-testid": "mapping-row",
            "data-node-id": mapping.nodeId,
            "data-needs-review": mapping.needsReview ? "true" : "false",
          })
        }
      />
    </div>
  );
}
