import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, CircleAlert, Unplug } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetRunReaderError, type StudioRunView } from "@/src/shared/contracts";
import { getDetRunReader } from "@/src/server/det-run-reader-factory";
import { DesignTree } from "@/src/modules/design-tree";
import {
  MappingReview,
  ProvenanceFooter,
  RunModeBadge,
} from "@/src/modules/mapping-review";
import { PreviewPanel } from "@/src/modules/preview";
import { ClientArtifactManifest } from "./client-artifact-manifest";

interface RunPageProps {
  params: Promise<{ runId: string }>;
}

function ReaderProblemState({
  title,
  message,
  hint,
}: {
  title: string;
  message: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Overview
        </Link>
      </Button>
      <Alert>
        {title === "Run not found" ? (
          <CircleAlert className="size-4" aria-hidden="true" />
        ) : (
          <Unplug className="size-4" aria-hidden="true" />
        )}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          <p className="mt-2 text-muted-foreground">{hint}</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default async function RunPage({ params }: RunPageProps) {
  // Run data is read from local disk per request. fs/env are not tracked as
  // dynamic APIs by Cache Components, so signal request-time explicitly.
  await connection();

  const { runId: rawRunId } = await params;
  const runId = decodeURIComponent(rawRunId);

  let run: StudioRunView;
  try {
    const reader = await getDetRunReader();
    run = await reader.getRun(runId);
  } catch (error) {
    if (error instanceof DetRunReaderError) {
      if (error.code === "run-not-found") {
        return (
          <ReaderProblemState
            title="Run not found"
            message={`No run with id "${runId}" is readable by this Studio instance.`}
            hint="Pick a run from the overview list; run ids come from the configured DET output root (or the DEMO fixture)."
          />
        );
      }
      return (
        <ReaderProblemState
          title={`Reader error (${error.code})`}
          message={error.message}
          hint="Check the STUDIO_DET_RUNS_DIR configuration — or unset it to browse the DEMO fixture."
        />
      );
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="w-fit self-start">
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Overview
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{run.label}</h1>
          <RunModeBadge mode={run.mode} />
        </div>
        <p className="font-mono text-xs text-muted-foreground">{run.runId}</p>
      </div>

      <DesignTree run={run} />

      <MappingReview run={run} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PreviewPanel preview={run.preview} mode={run.mode} label={run.label} />
        <ClientArtifactManifest runId={run.runId} artifacts={run.artifacts} />
      </div>

      <ProvenanceFooter run={run} />
    </div>
  );
}

// Run data is read from local disk per request — fully blocking route.
export const instant = false;
