"use client";

/**
 * [29] Studio — one PageStructure section card.
 *
 * Shows the section facts verbatim (id, order, name, role, element count,
 * source locators). An elementCount of 0 renders an explicit PARTIAL marker
 * ("no composed elements") — truthful, not hidden. The section name MUST stay
 * inside the <h3> (callers and tests query the heading inside the card).
 *
 * [61] Ant Design light-only Card. PARTIAL keeps amber semantics through the
 * antd `gold` Tag plus the same attention background the review rows use —
 * attention, never destructive red. The `#fffbe6` value mirrors the light-only
 * `.mapping-row-needs-review` rule carried in globals.css.
 */
import { Card, Tag, Typography } from "antd";
import type { StudioMappingView, StudioSectionView } from "@/src/shared/contracts";
import { DesignNodeTable } from "./node-table";

const UNKNOWN = "unknown";

/** Attention amber shared with the needs-review row highlight (light-only). */
const PARTIAL_SURFACE = "var(--ant-color-warning-bg, #fffbe6)";

function RoleBadge({ role }: { role?: string }) {
  if (!role) {
    return (
      <Tag
        style={{
          borderStyle: "dashed",
          color: "var(--ant-color-text-tertiary, rgba(0, 0, 0, 0.45))",
        }}
      >
        {UNKNOWN}
      </Tag>
    );
  }
  return <Tag>{role}</Tag>;
}

export function SectionCard({
  section,
  mappings,
}: {
  section: StudioSectionView;
  mappings: readonly StudioMappingView[];
}) {
  const isPartial = section.elementCount === 0;
  return (
    <Card
      size="small"
      data-testid="design-tree-section"
      data-section-id={section.sectionId}
      data-order={section.order}
      title={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="font-mono text-xs"
            style={{ color: "var(--ant-color-text-tertiary, rgba(0, 0, 0, 0.45))" }}
            title="section order"
          >
            #{section.order}
          </span>
          <h3 className="text-sm font-semibold">{section.name}</h3>
          <Tag className="font-mono">{section.sectionId}</Tag>
          <RoleBadge role={section.role} />
        </div>
      }
    >
      <Typography.Text type="secondary" className="mb-2 block text-xs">
        <span data-testid="design-tree-element-count">
          {section.elementCount}{" "}
          {section.elementCount === 1 ? "element" : "elements"}
        </span>
        {" · "}
        <span className="font-mono">
          {section.sourceLocators.length > 0
            ? section.sourceLocators.join(", ")
            : UNKNOWN}
        </span>
      </Typography.Text>
      {isPartial && (
        <p
          data-testid="design-tree-partial"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5"
          style={{ background: PARTIAL_SURFACE }}
        >
          <Tag color="gold" className="mb-0">
            PARTIAL
          </Tag>
          <span
            className="text-xs"
            style={{ color: "var(--ant-color-warning, #d48806)" }}
          >
            no composed elements
          </span>
        </p>
      )}
      {mappings.length === 0 ? (
        <Typography.Paragraph type="secondary" className="text-xs">
          No node mappings are grouped under this section.
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary" className="mb-2 text-xs">
            {mappings.length} node mapping{mappings.length === 1 ? "" : "s"} in
            plan
          </Typography.Paragraph>
          <DesignNodeTable
            mappings={mappings}
            testId={`design-tree-section-nodes-${section.sectionId}`}
          />
        </>
      )}
    </Card>
  );
}
