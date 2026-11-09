import Link from "next/link";
import { connection } from "next/server";
import { FolderOpen, Unplug, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DetRunReaderError, type DetRunSummary } from "@/src/shared/contracts";
import { getDetRunReader } from "@/src/server/det-run-reader-factory";
import { RunModeBadge } from "@/src/modules/mapping-review";
import { ConversionForm, DEMO_PROFILES } from "@/src/modules/conversions";

function unknownCount(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function RunRow({ run }: { run: DetRunSummary }) {
  return (
    <Link
      href={`/runs/${encodeURIComponent(run.runId)}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
    >
      <span className="font-medium">{run.label}</span>
      <RunModeBadge mode={run.mode} />
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          errors {unknownCount(run.counts.errors)} · warnings{" "}
          {unknownCount(run.counts.warnings)} · infos {unknownCount(run.counts.infos)}
        </span>
        <span className="font-mono">{run.runId}</span>
      </span>
    </Link>
  );
}

export default async function OverviewPage() {
  // Runs are read from local disk/env per request. fs/env are not tracked as
  // dynamic APIs by Cache Components, so signal request-time explicitly.
  await connection();

  let runs: readonly DetRunSummary[];
  let readerErrorCode: string | null = null;
  let readerMessage: string | null = null;

  try {
    const reader = await getDetRunReader();
    runs = await reader.listRuns();
  } catch (error) {
    if (error instanceof DetRunReaderError) {
      readerErrorCode = error.code;
      readerMessage = error.message;
      runs = [];
    } else {
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="studio-overview-heading">
        <h1 id="studio-overview-heading" className="text-lg font-semibold">
          DET Studio
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review layer over the deterministic det CLI: inspect a conversion run,
          its mapping dispositions and diagnostics, and download validated
          artifacts. The engine owns all conversion logic — Studio never regenerates it.
        </p>
      </section>

      <ConversionForm profiles={DEMO_PROFILES} />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold">Runs</h2>
          </CardTitle>
          <CardDescription>
            Conversion runs this Studio instance can read. Fixture runs are
            visibly labeled DEMO; live runs come from a configured DET output
            root.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readerErrorCode !== null ? (
            <Alert>
              <Unplug className="size-4" aria-hidden="true" />
              <AlertTitle>Reader not configured ({readerErrorCode})</AlertTitle>
              <AlertDescription>
                {readerMessage} Set the STUDIO_DET_RUNS_DIR environment variable
                to a DET run output root — or leave it unset to browse the DEMO
                fixture.
              </AlertDescription>
            </Alert>
          ) : runs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4" aria-hidden="true" />
              No runs available. Configure STUDIO_DET_RUNS_DIR to point at real
              det output, or unset it for the DEMO fixture.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((run) => (
                <RunRow key={run.runId} run={run} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Single local trusted operator UI — not a public/multi-user deployment.
        Starting a real conversion is intentionally not connected: issue [28]
        owns the engine bridge.
      </p>
      <Badge variant="outline" className="w-fit">
        MVP scope: review · preview · export
      </Badge>
    </div>
  );
}

// Runs are read from local disk per request — this is a fully blocking,
// request-time route (local operator tool; no cached shell to prerender).
export const instant = false;
