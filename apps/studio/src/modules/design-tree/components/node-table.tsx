/**
 * [29] Studio — design-tree node rows.
 *
 * One compact row per mapping, reused by section groups and the explicit
 * "Not in plan / unassigned" group. Disposition badges are imported from the
 * mapping-review module public interface — the canonical vocabulary is not
 * re-defined here.
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
import {
  ComposeDispositionBadge,
  KindBadge,
  ReviewDispositionBadge,
} from "@/src/modules/mapping-review";

const UNKNOWN = "unknown";

export function DesignNodeTable({
  mappings,
  testId,
}: {
  mappings: readonly StudioMappingView[];
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Node id</TableHead>
            <TableHead scope="col">Source name</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Compose</TableHead>
            <TableHead scope="col">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((mapping) => (
            <TableRow key={mapping.nodeId} data-testid="design-tree-node">
              <TableCell className="align-top">
                <span className="font-mono text-xs" title={mapping.nodeId}>
                  {mapping.nodeId}
                </span>
              </TableCell>
              <TableCell className="align-top">
                <span className="text-xs">
                  {mapping.sourceName ?? UNKNOWN}
                </span>
              </TableCell>
              <TableCell className="align-top">
                <KindBadge kind={mapping.kind} />
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
