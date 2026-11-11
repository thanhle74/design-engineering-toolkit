"use client";

/**
 * [29] Studio — one PageStructure section card.
 *
 * Shows the section facts verbatim (id, order, name, role, element count,
 * source locators). An elementCount of 0 renders an explicit PARTIAL marker
 * ("no composed elements") — truthful, not hidden. The section name MUST stay
 * inside the <h3> (callers and tests query the heading inside the card).
 *
 * [61] Ant Design stock light Card. PARTIAL is the antd built-in `gold` Tag
 * plus secondary text — attention, never destructive red. No custom colors
 * or surfaces are applied.
 */
import { Card, Flex, Tag, Typography } from "antd";
import type { StudioMappingView, StudioSectionView } from "@/src/shared/contracts";
import { DesignNodeTable } from "./node-table";

const UNKNOWN = "unknown";

function RoleBadge({ role }: { role?: string }) {
  if (!role) {
    return <Tag>{UNKNOWN}</Tag>;
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
        <Flex wrap="wrap" align="center" gap="small">
          <Typography.Text type="secondary" title="section order">
            #{section.order}
          </Typography.Text>
          <h3>{section.name}</h3>
          <Tag>{section.sectionId}</Tag>
          <RoleBadge role={section.role} />
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        <span data-testid="design-tree-element-count">
          {section.elementCount}{" "}
          {section.elementCount === 1 ? "element" : "elements"}
        </span>
        {" · "}
        <Typography.Text code>
          {section.sourceLocators.length > 0
            ? section.sourceLocators.join(", ")
            : UNKNOWN}
        </Typography.Text>
      </Typography.Paragraph>
      {isPartial && (
        <p data-testid="design-tree-partial">
          <Tag color="gold">PARTIAL</Tag>
          <Typography.Text type="secondary">
            no composed elements
          </Typography.Text>
        </p>
      )}
      {mappings.length === 0 ? (
        <Typography.Paragraph type="secondary">
          No node mappings are grouped under this section.
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
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
