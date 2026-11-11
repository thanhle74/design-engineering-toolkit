"use client";

/**
 * [29] Studio — source design tree (presentational; receives the run).
 *
 * Ordered section inventory from run.sections; under each section the node
 * rows whose mapping.sectionId points at it. Mappings without a sectionId are
 * listed under an explicit "Not in plan / unassigned" group — never dropped,
 * never silently attached to a section.
 *
 * [61] Ant Design stock light appearance: the empty state is a calm info
 * Alert, not an error banner; section cards stack in a stock Flex column.
 */
import { SearchOutlined } from "@ant-design/icons";
import { Alert, Flex, Typography } from "antd";
import type { StudioMappingView, StudioRunView, StudioSectionView } from "@/src/studio/shared/contracts";
import { DesignNodeTable } from "./node-table";
import { SectionCard } from "./section-card";

const UNKNOWN_GROUP_ID = "design-tree-unassigned";

function UnassignedGroup({ mappings }: { mappings: readonly StudioMappingView[] }) {
  return (
    <section
      aria-labelledby="studio-unassigned-heading"
      data-testid={UNKNOWN_GROUP_ID}
    >
      <h3>Chưa gán vào mục nào</h3>
      <Typography.Paragraph type="secondary">
        Các mapping mà kế hoạch ghép không gắn vào mục nào. Giữ nguyên hiển thị —
        không bao giờ bị bỏ im lặng.
      </Typography.Paragraph>
      <DesignNodeTable mappings={mappings} testId="design-tree-unassigned-nodes" />
    </section>
  );
}

function EmptySectionsAlert({ unmappedCount }: { unmappedCount: number }) {
  return (
    <Alert
      type="info"
      showIcon
      icon={<SearchOutlined aria-hidden="true" />}
      data-testid="design-tree-empty"
      title="Chưa trích xuất được mục nào"
      description={
        unmappedCount === 0
          ? "Lần chạy này không có mục PageStructure nào và không có node mapping nào. Không có gì bị ẩn — không có nội dung nào được trích xuất để soát."
          : `Chưa trích xuất được mục PageStructure nào, nhưng có ${unmappedCount} node mapping. Chúng được liệt kê trong "Chưa gán vào mục nào" bên dưới — không bao giờ bị bỏ.`
      }
    />
  );
}

export function DesignTree({ run }: { run: StudioRunView }) {
  // Ordered by the engine-supplied `order`; the array order is respected as a
  // stable tiebreak. No renumbering, no invented order.
  const sections: StudioSectionView[] = [...run.sections].sort(
    (a, b) => a.order - b.order
  );
  const mappingsBySection = new Map<string, StudioMappingView[]>();
  const unassigned: StudioMappingView[] = [];
  for (const mapping of run.mappings) {
    if (mapping.sectionId) {
      const bucket = mappingsBySection.get(mapping.sectionId);
      if (bucket) {
        bucket.push(mapping);
      } else {
        mappingsBySection.set(mapping.sectionId, [mapping]);
      }
    } else {
      unassigned.push(mapping);
    }
  }

  const summary = `${sections.length} mục · ${run.mappings.length} mapping`;

  return (
    <section
      aria-labelledby="studio-design-tree-heading"
      data-testid="design-tree"
    >
      <h2>
        Cây thiết kế gốc{" "}
        <Typography.Text type="secondary">{summary}</Typography.Text>
      </h2>
      {sections.length === 0 ? (
        <>
          <EmptySectionsAlert unmappedCount={unassigned.length} />
          {unassigned.length > 0 && <UnassignedGroup mappings={unassigned} />}
        </>
      ) : (
        <>
          <Flex vertical gap="middle">
            {sections.map((section) => (
              <SectionCard
                key={section.sectionId}
                section={section}
                mappings={mappingsBySection.get(section.sectionId) ?? []}
              />
            ))}
          </Flex>
          {unassigned.length > 0 && <UnassignedGroup mappings={unassigned} />}
        </>
      )}
    </section>
  );
}
