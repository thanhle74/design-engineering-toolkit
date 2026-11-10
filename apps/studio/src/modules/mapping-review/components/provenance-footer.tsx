/**
 * [29] Studio — provenance footer.
 *
 * Provenance is mandatory: a fixture run is always visibly labeled DEMO, and
 * unknown facts (null source id/revision/timestamps/counts) render "unknown",
 * never 0, so fixture data can never masquerade as a live conversion.
 */
import type { ReactNode } from "react";
import type { StudioRunView } from "@/src/shared/contracts";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RunModeBadge } from "./disposition-badges";

const UNKNOWN = "unknown";

function unknownIfNull(value: string | null): string {
  return value === null ? UNKNOWN : value;
}

function countOrNull(value: number | null): string {
  return value === null ? UNKNOWN : String(value);
}

function ProvenanceField({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xs" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export function ProvenanceFooter({ run }: { run: StudioRunView }) {
  return (
    <Card size="sm" data-testid="provenance-footer" className="bg-muted/30">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>Provenance</span>
          <RunModeBadge mode={run.mode} />
        </CardTitle>
        <CardDescription>{run.label}</CardDescription>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-1 sm:grid-cols-3 lg:grid-cols-4">
        <ProvenanceField label="Run" testId="provenance-run">
          <span className="font-mono">{run.runId}</span>
        </ProvenanceField>
        <ProvenanceField label="Source ID" testId="provenance-source">
          <span className="font-mono">{unknownIfNull(run.source.sourceId)}</span>
        </ProvenanceField>
        <ProvenanceField label="Revision" testId="provenance-revision">
          <span className="font-mono">{unknownIfNull(run.source.revisionId)}</span>
        </ProvenanceField>
        <ProvenanceField label="Accessed at" testId="provenance-accessed">
          <span className="font-mono">{unknownIfNull(run.source.accessedAt)}</span>
        </ProvenanceField>
        <ProvenanceField label="Profile" testId="provenance-profile">
          <span className="font-mono">{unknownIfNull(run.profileId)}</span>
        </ProvenanceField>
        <ProvenanceField label="Platform" testId="provenance-platform">
          <span className="font-mono">{unknownIfNull(run.platformId)}</span>
        </ProvenanceField>
        <ProvenanceField label="Exit code" testId="provenance-exit-code">
          {run.exitCode === null ? UNKNOWN : String(run.exitCode)}
        </ProvenanceField>
        <ProvenanceField label="Diagnostic counts" testId="provenance-counts">
          errors: {countOrNull(run.counts.errors)} · warnings:{" "}
          {countOrNull(run.counts.warnings)} · infos:{" "}
          {countOrNull(run.counts.infos)}
        </ProvenanceField>
        {run.toolCommand && (
          <ProvenanceField label="Tool command" testId="provenance-command">
            <span className="block break-all font-mono">{run.toolCommand}</span>
          </ProvenanceField>
        )}
        {run.generatedAt && (
          <ProvenanceField label="Generated at" testId="provenance-generated">
            <span className="font-mono">{run.generatedAt}</span>
          </ProvenanceField>
        )}
      </dl>
    </Card>
  );
}
