"use client";

/**
 * [29] Studio — source design tree (presentational; receives the run).
 *
 * Ordered section inventory from run.sections; under each section the node
 * rows whose mapping.sectionId points at it. Mappings without a sectionId are
 * listed under an explicit "Not in plan / unassigned" group — never dropped,
 * never silently attached to a section.
 *
 * [61] Ant Design light-only: the empty state is a calm info Alert, not an
 * error banner.
 */
import { SearchOutlined } from "@ant-design/icons";
import { Alert, Typography } from "antd";
import type { StudioMappingView, StudioRunView, StudioSectionView } from "@/src/shared/contracts";
import { DesignNodeTable } from "./node-table";
import { SectionCard } from "./section-card";

const UNKNOWN_GROUP_ID = "design-tree-unassigned";

function UnassignedGroup({ mappings }: { mappings: readonly StudioMappingView[] }) {
  return (
    <section
      aria-labelledby="studio-unassigned-heading"
      data-testid={UNKNOWN_GROUP_ID}
      className="mt-4"
    >
      <h3 className="text-sm font-semibold">Not in plan / unassigned</h3>
      <Typography.Paragraph type="secondary" className="mb-2 mt-1 text-xs">
        Mappings the compose plan did not attach to any section. Kept visible —
        never silently dropped.
      </Typography.Paragraph>
      <DesignNodeTable mappings={mappings} testId="design-tree-unassigned-nodes" />
    </section>
  );
}

function EmptySectionsAlert({ unmappedCount }: { unmappedCount: number }) {
  return (
    <Alert
      className="mt-3"
      type="info"
      showIcon
      icon={<SearchOutlined aria-hidden="true" />}
      data-testid="design-tree-empty"
      title="No sections extracted"
      description={
        unmappedCount === 0
          ? "This run has no PageStructure sections and no node mappings. Nothing is hidden — there is nothing extracted to review."
          : `No PageStructure sections were extracted, but ${unmappedCount} node mapping${
              unmappedCount === 1 ? "" : "s"
            } exist. They are listed under "Not in plan / unassigned" below — never dropped.`
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

  const summary = `${sections.length} section${
    sections.length === 1 ? "" : "s"
  } · ${run.mappings.length} mapping${run.mappings.length === 1 ? "" : "s"}`;

  return (
    <section
      aria-labelledby="studio-design-tree-heading"
      data-testid="design-tree"
    >
      <h2 className="text-base font-semibold">
        Source design tree
        <Typography.Text type="secondary" className="ml-2 text-sm font-normal">
          {summary}
        </Typography.Text>
      </h2>
      {sections.length === 0 ? (
        <>
          <EmptySectionsAlert unmappedCount={unassigned.length} />
          {unassigned.length > 0 && <UnassignedGroup mappings={unassigned} />}
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-4">
            {sections.map((section) => (
              <SectionCard
                key={section.sectionId}
                section={section}
                mappings={mappingsBySection.get(section.sectionId) ?? []}
              />
            ))}
          </div>
          {unassigned.length > 0 && <UnassignedGroup mappings={unassigned} />}
        </>
      )}
    </section>
  );
}
