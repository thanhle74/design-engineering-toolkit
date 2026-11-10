/**
 * [29] DET Studio — honest NOT CONNECTED result state (New Conversion module, lane W-A).
 *
 * Renders the validated request summary plus an explicit notice that conversion
 * execution is not connected in this MVP (issue [28] owns the engine bridge).
 * There is intentionally NO spinner, NO progress state and NO success claim —
 * no conversion has run.
 */
import { Unplug } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { TARGET_LABELS } from "../conversion-options";
import type { ConversionRequestSummary } from "../types";

interface NotConnectedResultProps {
  summary: ConversionRequestSummary;
  className?: string;
}

interface SummaryRow {
  label: string;
  value: string;
  /** Unknown facts render as unknown text, never as a plausible-looking value. */
  mono?: boolean;
}

export function NotConnectedResult({ summary, className }: NotConnectedResultProps) {
  const rows: SummaryRow[] = [
    {
      label: "Source file key",
      value: summary.fileKey ?? "Not provided (bare node id)",
      mono: summary.fileKey !== null,
    },
    { label: "Node id", value: summary.nodeId, mono: true },
    { label: "Output target", value: TARGET_LABELS[summary.target] },
    {
      label: "Project profile",
      value: summary.profileName ? summary.profileName : "Not configured",
    },
  ];

  return (
    <section
      data-testid="conversion-result"
      aria-label="Conversion request summary"
      className={cn("rounded-lg border bg-card p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Conversion request summary</h3>
        <Badge variant="outline" className="border-dashed text-xs">
          NOT CONNECTED
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "truncate text-sm",
                row.mono && "font-mono",
                !row.mono && row.value.startsWith("Not ") && "text-muted-foreground"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.inputKind === "bare" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Bare node id: no file key was provided. Paste the full Figma design URL (with
          ?node-id=…) to include the file the engine would read.
        </p>
      ) : null}

      <Alert className="mt-4">
        <Unplug />
        <AlertTitle>Conversion execution is not connected</AlertTitle>
        <AlertDescription>
          Studio cannot run conversions in this MVP: issue [28] owns the engine bridge to the
          det CLI, and it is not connected yet. No conversion was run — this panel only
          summarizes the request you entered.
        </AlertDescription>
      </Alert>
    </section>
  );
}
