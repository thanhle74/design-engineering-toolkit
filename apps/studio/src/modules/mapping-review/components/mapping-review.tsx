/**
 * [29] Studio — mapping review module root (presentational; receives the run).
 *
 * Composes the review table, the diagnostics panel and the mandatory
 * provenance footer. An empty run (no mappings, no diagnostics) renders a
 * truthful EMPTY state — the provenance footer still renders so a fixture run
 * can never masquerade as live output.
 */
import type { StudioRunView } from "@/src/shared/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { SearchX } from "lucide-react";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { MappingReviewTable } from "./mapping-review-table";
import { ProvenanceFooter } from "./provenance-footer";

export function MappingReview({ run }: { run: StudioRunView }) {
  const isEmpty = run.mappings.length === 0 && run.diagnostics.length === 0;
  return (
    <section
      aria-labelledby="studio-mapping-review-heading"
      data-testid="mapping-review"
    >
      <h2 id="studio-mapping-review-heading" className="text-base font-semibold">
        Mapping review
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {run.mappings.length} mapping{run.mappings.length === 1 ? "" : "s"} ·{" "}
          {run.diagnostics.length} diagnostic
          {run.diagnostics.length === 1 ? "" : "s"}
        </span>
      </h2>
      {isEmpty ? (
        <Alert className="mt-3" data-testid="mapping-review-empty">
          <SearchX aria-hidden="true" />
          <AlertTitle>No node mappings or diagnostics</AlertTitle>
          <AlertDescription>
            This run carries no compose mappings and no diagnostics. Nothing was
            hidden — the source produced nothing to review yet.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mt-3">
            <MappingReviewTable mappings={run.mappings} />
          </div>
          <Separator className="my-4" />
          <DiagnosticsPanel diagnostics={run.diagnostics} />
        </>
      )}
      <Separator className="my-4" />
      <ProvenanceFooter run={run} />
    </section>
  );
}
