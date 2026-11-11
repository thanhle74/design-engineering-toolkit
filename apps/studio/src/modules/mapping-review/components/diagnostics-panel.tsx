"use client";

/**
 * [29] Studio — diagnostics panel fed by run.diagnostics.
 *
 * Every carried-over diagnostic renders with its severity, code, message,
 * subject and origin (run/compose/review) as a styled list — never a table.
 * An empty diagnostics list renders a truthful "none recorded" line rather
 * than pretending silence means health.
 *
 * [61] Ant Design light-only: badges are preset-color Tags; the row surface is
 * antd's neutral tertiary fill so severity colors stay the loudest signal.
 */
import type { StudioDiagnosticView } from "@/src/shared/contracts";
import { Typography } from "antd";
import { OriginBadge, SeverityBadge } from "./disposition-badges";

const UNKNOWN = "unknown";

/** antd light neutral fill (CSS-var first, light-only fallback). */
const ROW_SURFACE = "var(--ant-color-fill-tertiary, #f5f5f5)";

function DiagnosticRow({ diagnostic }: { diagnostic: StudioDiagnosticView }) {
  return (
    <li
      data-testid="diagnostic-row"
      data-severity={diagnostic.severity}
      data-origin={diagnostic.origin}
      className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md px-3 py-2 text-left"
      style={{ background: ROW_SURFACE }}
    >
      <SeverityBadge severity={diagnostic.severity} />
      {diagnostic.code && (
        <code
          className="font-mono text-xs"
          style={{ color: "var(--ant-color-text-tertiary, rgba(0, 0, 0, 0.45))" }}
        >
          {diagnostic.code}
        </code>
      )}
      <p className="min-w-0 flex-1">{diagnostic.message}</p>
      <Typography.Text type="secondary" className="text-xs">
        subject: {diagnostic.subjectType ?? UNKNOWN}
        {diagnostic.subjectId && (
          <code
            className="ml-1 font-mono text-xs"
            title={diagnostic.subjectId}
          >
            {diagnostic.subjectId}
          </code>
        )}
      </Typography.Text>
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
      <h3 className="text-sm font-semibold">
        Diagnostics{" "}
        <Typography.Text type="secondary" className="font-normal">
          ({diagnostics.length} recorded)
        </Typography.Text>
      </h3>
      {diagnostics.length === 0 ? (
        <p className="mt-2 text-xs" data-testid="diagnostics-empty">
          <Typography.Text type="secondary">
            No diagnostics recorded for this run.
          </Typography.Text>
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
