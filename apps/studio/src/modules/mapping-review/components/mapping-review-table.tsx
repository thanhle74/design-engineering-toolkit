"use client";

/**
 * [29] Studio — mapping review table (one row per run.mappings entry).
 *
 * [61] Ant Design Table (`columns` prop — no dot-notation subcomponents),
 * light-only theme. Row highlight for derived `needsReview` comes from the
 * `.mapping-row-needs-review` rule carried in globals.css (attention amber,
 * never destructive red).
 *
 * Data honesty rules enforced here:
 *  - node ids render verbatim (n-… / s-…);
 *  - optional fields render "unknown", never 0 and never a fabricated value;
 *  - compose dispositions are the exact engine vocabulary;
 *  - `needsReview` is presented only as the DERIVED review highlight + review
 *    badge — it is never shown as a compose disposition;
 *  - every GAP / EXCLUDED / SKIPPED row stays in the table with its reasons.
 */
import type { HTMLAttributes } from "react";
import { Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { StudioMappingView } from "@/src/shared/contracts";
import {
  ComposeDispositionBadge,
  KindBadge,
  ReviewDispositionBadge,
} from "./disposition-badges";

const UNKNOWN = "unknown";

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
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs">{capabilityId}</span>
        <Typography.Text type="secondary" className="text-xs">
          {appearanceId}
        </Typography.Text>
        {(nativeElement || nativeField) && (
          <Typography.Text type="secondary" className="text-xs">
            {nativeElement ?? UNKNOWN} · {nativeField ?? UNKNOWN}
          </Typography.Text>
        )}
      </div>
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
    <div className="flex flex-col gap-1">
      {mapping.note && <p>{mapping.note}</p>}
      {hasReasons && (
        <ul className="list-disc space-y-0.5 pl-4">
          {mapping.reasons.map((reason, index) => (
            <li key={index}>
              <Typography.Text type="secondary" className="text-xs">
                {reason}
              </Typography.Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const columns: ColumnsType<StudioMappingView> = [
  {
    title: "Node",
    render: (_, mapping) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs" title={mapping.nodeId}>
          {mapping.nodeId}
        </span>
        <Typography.Text type="secondary" className="text-xs">
          {mapping.sourceName ?? UNKNOWN}
        </Typography.Text>
      </div>
    ),
  },
  {
    title: "Source locator",
    render: (_, mapping) =>
      mapping.sourceLocator ? (
        <span
          className="block max-w-48 truncate font-mono text-xs"
          title={mapping.sourceLocator}
        >
          {mapping.sourceLocator}
        </span>
      ) : (
        <UnknownText />
      ),
  },
  {
    title: "Kind",
    render: (_, mapping) => <KindBadge kind={mapping.kind} />,
  },
  {
    title: "Semantic class",
    render: (_, mapping) => (
      <Typography.Text
        type="secondary"
        className="font-mono text-xs"
      >
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
    title: "Target",
    render: (_, mapping) => <TargetCell mapping={mapping} />,
  },
  {
    title: "Note / reasons",
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
        rowClassName={(mapping) =>
          mapping.needsReview ? "mapping-row-needs-review" : ""
        }
      />
    </div>
  );
}
