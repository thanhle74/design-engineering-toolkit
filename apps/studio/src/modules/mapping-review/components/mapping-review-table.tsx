/**
 * [29] Studio — mapping review table (one row per run.mappings entry).
 *
 * Data honesty rules enforced here:
 *  - node ids render verbatim (n-… / s-…);
 *  - optional fields render "unknown", never 0 and never a fabricated value;
 *  - compose dispositions are the exact engine vocabulary;
 *  - `needsReview` is presented only as the DERIVED review highlight + review
 *    badge — it is never shown as a compose disposition;
 *  - every GAP / EXCLUDED / SKIPPED row stays in the table with its reasons.
 */
import type { StudioMappingView } from "@/src/shared/contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ComposeDispositionBadge,
  KindBadge,
  ReviewDispositionBadge,
} from "./disposition-badges";

const UNKNOWN = "unknown";

/** Muted stand-in for a fact the run does not carry. Never a zero. */
function UnknownText() {
  return <span className="text-xs text-muted-foreground">{UNKNOWN}</span>;
}

function TargetCell({ mapping }: { mapping: StudioMappingView }) {
  if (mapping.target) {
    const { capabilityId, appearanceId, nativeElement, nativeField } =
      mapping.target;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs">{capabilityId}</span>
        <span className="text-xs text-muted-foreground">{appearanceId}</span>
        {(nativeElement || nativeField) && (
          <span className="text-xs text-muted-foreground">
            {nativeElement ?? UNKNOWN} · {nativeField ?? UNKNOWN}
          </span>
        )}
      </div>
    );
  }
  if (mapping.composeDisposition === "mapped") {
    // The engine contract requires a target on every mapped row; render the
    // missing fact as unknown instead of inventing or hiding it.
    return <UnknownText />;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function NotesCell({ mapping }: { mapping: StudioMappingView }) {
  const hasNote = Boolean(mapping.note);
  const hasReasons = mapping.reasons.length > 0;
  if (!hasNote && !hasReasons) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {mapping.note && <p className="text-xs text-pretty">{mapping.note}</p>}
      {hasReasons && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {mapping.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MappingRow({ mapping }: { mapping: StudioMappingView }) {
  return (
    <TableRow
      data-testid="mapping-row"
      data-node-id={mapping.nodeId}
      data-needs-review={mapping.needsReview ? "true" : "false"}
      className={cn(
        mapping.needsReview &&
          "bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
      )}
    >
      <TableCell className="align-top">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs" title={mapping.nodeId}>
            {mapping.nodeId}
          </span>
          <span className="text-xs text-muted-foreground">
            {mapping.sourceName ?? UNKNOWN}
          </span>
        </div>
      </TableCell>
      <TableCell className="align-top">
        {mapping.sourceLocator ? (
          <span
            className="block max-w-48 truncate font-mono text-[11px]"
            title={mapping.sourceLocator}
          >
            {mapping.sourceLocator}
          </span>
        ) : (
          <UnknownText />
        )}
      </TableCell>
      <TableCell className="align-top">
        <KindBadge kind={mapping.kind} />
      </TableCell>
      <TableCell className="align-top">
        <span className="font-mono text-[11px] text-muted-foreground">
          {mapping.semanticClass ?? UNKNOWN}
        </span>
      </TableCell>
      <TableCell className="align-top">
        <ComposeDispositionBadge disposition={mapping.composeDisposition} />
      </TableCell>
      <TableCell className="align-top">
        {mapping.reviewDisposition ? (
          <ReviewDispositionBadge disposition={mapping.reviewDisposition} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        <TargetCell mapping={mapping} />
      </TableCell>
      <TableCell className="min-w-72 whitespace-normal align-top">
        <NotesCell mapping={mapping} />
      </TableCell>
    </TableRow>
  );
}

/** The review table proper: exactly one row per mapping, in run order. */
export function MappingReviewTable({
  mappings,
}: {
  mappings: readonly StudioMappingView[];
}) {
  return (
    <div data-testid="mapping-review-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Node</TableHead>
            <TableHead scope="col">Source locator</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Semantic class</TableHead>
            <TableHead scope="col">Compose</TableHead>
            <TableHead scope="col">Review</TableHead>
            <TableHead scope="col">Target</TableHead>
            <TableHead scope="col">Note / reasons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((mapping) => (
            <MappingRow key={mapping.nodeId} mapping={mapping} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
