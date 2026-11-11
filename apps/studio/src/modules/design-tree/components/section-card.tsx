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

/** "không rõ" — a fact the run does not carry is shown, never invented ([61] Vietnamese). */
const UNKNOWN = "không rõ";

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
          <Typography.Text type="secondary" title="thứ tự mục">
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
          {section.elementCount} phần tử
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
            không có phần tử nào được ghép
          </Typography.Text>
        </p>
      )}
      {mappings.length === 0 ? (
        <Typography.Paragraph type="secondary">
          Không có node mapping nào được gắn vào mục này.
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {mappings.length} node mapping trong plan
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
