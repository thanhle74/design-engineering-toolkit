/**
 * [29] Studio — one PageStructure section card.
 *
 * Shows the section facts verbatim (id, order, name, role, element count,
 * source locators). An elementCount of 0 renders an explicit PARTIAL marker
 * ("no composed elements") — truthful, not hidden.
 */
import type { StudioMappingView, StudioSectionView } from "@/src/shared/contracts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DesignNodeTable } from "./node-table";

const UNKNOWN = "unknown";

const AMBER_BADGE =
  "border-amber-600/40 bg-amber-500/15 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300";

function RoleBadge({ role }: { role?: string }) {
  if (!role) {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        {UNKNOWN}
      </Badge>
    );
  }
  return <Badge variant="outline">{role}</Badge>;
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
      size="sm"
      data-testid="design-tree-section"
      data-section-id={section.sectionId}
      data-order={section.order}
    >
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="font-mono text-xs text-muted-foreground"
            title="section order"
          >
            #{section.order}
          </span>
          <h3 className="text-sm font-semibold">{section.name}</h3>
          <Badge variant="outline" className="font-mono text-[11px]">
            {section.sectionId}
          </Badge>
          <RoleBadge role={section.role} />
        </div>
        <CardDescription>
          <span data-testid="design-tree-element-count">
            {section.elementCount}{" "}
            {section.elementCount === 1 ? "element" : "elements"}
          </span>
          {" · "}
          <span className="font-mono text-[11px]">
            {section.sourceLocators.length > 0
              ? section.sourceLocators.join(", ")
              : UNKNOWN}
          </span>
        </CardDescription>
        {isPartial && (
          <p
            data-testid="design-tree-partial"
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1.5",
              "dark:border-amber-500/40 dark:bg-amber-500/10"
            )}
          >
            <Badge variant="outline" className={AMBER_BADGE}>PARTIAL</Badge>
            <span className="text-xs text-amber-800 dark:text-amber-300">
              no composed elements
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent>
        {mappings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No node mappings are grouped under this section.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {mappings.length} node mapping{mappings.length === 1 ? "" : "s"} in
              plan
            </p>
            <DesignNodeTable
              mappings={mappings}
              testId={`design-tree-section-nodes-${section.sectionId}`}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
