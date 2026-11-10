/**
 * [29] Studio — diagnostics panel fed by run.diagnostics.
 *
 * Every carried-over diagnostic renders with its severity, code, message,
 * subject and origin (run/compose/review). An empty diagnostics list renders a
 * truthful "none recorded" line rather than pretending silence means health.
 */
import type { StudioDiagnosticView } from "@/src/shared/contracts";
import { OriginBadge, SeverityBadge } from "./disposition-badges";

const UNKNOWN = "unknown";

function DiagnosticRow({ diagnostic }: { diagnostic: StudioDiagnosticView }) {
  return (
    <li
      data-testid="diagnostic-row"
      data-severity={diagnostic.severity}
      data-origin={diagnostic.origin}
      className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border bg-card px-3 py-2 text-left"
    >
      <SeverityBadge severity={diagnostic.severity} />
      {diagnostic.code && (
        <code className="font-mono text-[11px] text-muted-foreground">
          {diagnostic.code}
        </code>
      )}
      <p className="min-w-0 flex-1 text-sm text-pretty">{diagnostic.message}</p>
      <span className="text-xs text-muted-foreground">
        subject: {diagnostic.subjectType ?? UNKNOWN}
        {diagnostic.subjectId && (
          <code className="ml-1 font-mono text-[11px]" title={diagnostic.subjectId}>
            {diagnostic.subjectId}
          </code>
        )}
      </span>
      <OriginBadge origin={diagnostic.origin} />
    </li>
  );
}

export function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: readonly StudioDiagnosticView[];
}) {
  return (
    <section
      aria-labelledby="studio-diagnostics-heading"
      data-testid="diagnostics-panel"
    >
      <h3 id="studio-diagnostics-heading" className="text-sm font-semibold">
        Diagnostics{" "}
        <span className="font-normal text-muted-foreground">
          ({diagnostics.length} recorded)
        </span>
      </h3>
      {diagnostics.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="diagnostics-empty">
          No diagnostics recorded for this run.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {diagnostics.map((diagnostic, index) => (
            <DiagnosticRow diagnostic={diagnostic} key={`${diagnostic.origin}-${diagnostic.code ?? "no-code"}-${index}`} />
          ))}
        </ul>
      )}
    </section>
  );
}
