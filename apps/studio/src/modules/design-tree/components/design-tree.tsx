/**
 * [29] Studio — source design tree (presentational; receives the run).
 *
 * Ordered section inventory from run.sections; under each section the node
 * rows whose mapping.sectionId points at it. Mappings without a sectionId are
 * listed under an explicit "Not in plan / unassigned" group — never dropped,
 * never silently attached to a section.
 */
import type { StudioMappingView, StudioRunView, StudioSectionView } from "@/src/shared/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchX } from "lucide-react";
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
      <h3 id="studio-unassigned-heading" className="text-sm font-semibold">
        Not in plan / unassigned
      </h3>
      <p className="mb-2 mt-1 text-xs text-muted-foreground">
        Mappings the compose plan did not attach to any section. Kept visible —
        never silently dropped.
      </p>
      <DesignNodeTable mappings={mappings} testId="design-tree-unassigned-nodes" />
    </section>
  );
}

function EmptySectionsAlert({ unmappedCount }: { unmappedCount: number }) {
  return (
    <Alert className="mt-3" data-testid="design-tree-empty">
      <SearchX aria-hidden="true" />
      <AlertTitle>No sections extracted</AlertTitle>
      <AlertDescription>
        {unmappedCount === 0
          ? "This run has no PageStructure sections and no node mappings. Nothing is hidden — there is nothing extracted to review."
          : `No PageStructure sections were extracted, but ${unmappedCount} node mapping${
              unmappedCount === 1 ? "" : "s"
            } exist. They are listed under "Not in plan / unassigned" below — never dropped.`}
      </AlertDescription>
    </Alert>
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
      <h2 id="studio-design-tree-heading" className="text-base font-semibold">
        Source design tree
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {summary}
        </span>
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
