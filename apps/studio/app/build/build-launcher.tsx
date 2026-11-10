"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Hammer, LoaderCircle, Play } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudioBuildStageView } from "@/src/shared/contracts";

/**
 * [40] Build launcher — the client half of Build Control. Starts real builds
 * via POST /api/builds, polls GET /api/builds/<runId>, and renders ONLY what
 * the runner actually reported: exit codes, stage tables from the bundle
 * manifest, capped diagnostics tails, timeout/spawn/interrupt truths. No
 * fabricated progress, no demo data, and completion links to the bundle run
 * where downloads are hash-verified.
 */

export interface BuildLauncherEntry {
  configId: string;
  label: string;
  description?: string;
  profileId: string;
  designSource: { mode: string; project: string; designFile: string; designNode: string };
  inputSource: "capability-probe" | "pinned-registry";
  declaredPaths: {
    profile: string;
    registry?: string;
    probeProject?: string;
    bindings: string;
    content: string;
    projection?: string;
  };
}

interface BuildStageLite {
  stage: string;
  status: string;
  exitCode: number;
}

interface ManifestSummaryLite {
  profileId: string;
  platformId: string;
  sourceId: string;
  revisionId: string;
  stages: BuildStageLite[];
  gaps: Array<{ code: string; message: string; count?: number }>;
  outputCount: number;
}

export interface BuildJobView {
  runId: string;
  configId: string;
  state: "queued" | "running" | "exited" | "timeout" | "spawn-failed" | "interrupted";
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  stdoutTail: string;
  stderrTail: string;
  manifestSummary: ManifestSummaryLite | null;
  spawnError: string | null;
}

interface BuildLauncherProps {
  entries: BuildLauncherEntry[];
  invalid: Array<{ configId: string; reason: string }>;
  runnerReady: boolean;
  runnerReason?: string;
  initialActive: BuildJobView | null;
}

const TERMINAL_STATES = new Set(["exited", "timeout", "spawn-failed", "interrupted"]);
const POLL_MS = 1000;

function stateBadge(state: BuildJobView["state"], exitCode: number | null) {
  switch (state) {
    case "queued":
    case "running":
      return <Badge variant="secondary">{state === "queued" ? "queued" : "running…"}</Badge>;
    case "exited":
      return <Badge variant={exitCode === 0 ? "outline" : "destructive"}>{`exited ${exitCode ?? "?"}`}</Badge>;
    case "timeout":
      return <Badge variant="destructive">timed out</Badge>;
    case "spawn-failed":
      return <Badge variant="destructive">spawn failed</Badge>;
    case "interrupted":
      return <Badge variant="destructive">interrupted</Badge>;
  }
}

function StageTable({ stages }: { stages: BuildStageLite[] | StudioBuildStageView[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Exit code</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map((stage) => (
            <TableRow key={stage.stage}>
              <TableCell className="font-mono">{stage.stage}</TableCell>
              <TableCell>
                <Badge variant={stage.status === "failed" ? "destructive" : "outline"}>{stage.status}</Badge>
              </TableCell>
              <TableCell className="font-mono">{stage.exitCode}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function JobPanel({ job }: { job: BuildJobView }) {
  const completed = job.state === "exited" && job.exitCode === 0;
  const failedButBundle =
    job.state === "exited" && job.exitCode !== 0 && job.manifestSummary !== null;
  return (
    <Card size="sm" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {stateBadge(job.state, job.exitCode)}
          <span className="font-mono text-sm">{job.runId}</span>
          <span className="text-sm font-normal text-muted-foreground">config {job.configId}</span>
        </CardTitle>
        <CardDescription>
          {job.startedAt === null ? "not started" : `started ${job.startedAt}`}
          {job.finishedAt === null ? " · not finished yet" : ` · finished ${job.finishedAt}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {job.state === "interrupted" ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Build interrupted</AlertTitle>
            <AlertDescription>
              The server restarted while this build was running; the journal recorded no
              completion. Start a new build — no bundle for this run is trusted.
            </AlertDescription>
          </Alert>
        ) : null}

        {job.state === "timeout" ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Build timed out</AlertTitle>
            <AlertDescription>
              The runner sent SIGTERM after the configured timeout. Diagnostics below show what the
              build reported before termination.
            </AlertDescription>
          </Alert>
        ) : null}

        {job.state === "spawn-failed" ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Runner error — the build never started</AlertTitle>
            <AlertDescription>
              {job.spawnError ?? "The det CLI could not be spawned."} This is a runner
              configuration problem, not a build result.
            </AlertDescription>
          </Alert>
        ) : null}

        {completed ? (
          <Alert>
            <Hammer className="size-4" aria-hidden="true" />
            <AlertTitle>Build completed (exit 0)</AlertTitle>
            <AlertDescription>
              The bundle is written and now listed as a live run.{" "}
              <Link className="underline" href={`/runs/${encodeURIComponent(job.runId)}`}>
                Open the bundle run
              </Link>{" "}
              — artifacts are served only after byte-verification against the build manifest.
              Native Page Builder HTML stays source/download only; no Magento storefront or Admin
              preview is claimed.
            </AlertDescription>
          </Alert>
        ) : null}

        {failedButBundle ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>{`Build finished with exit ${job.exitCode} — a stage failed`}</AlertTitle>
            <AlertDescription>
              The engine still wrote a truthful partial manifest (see the stage table).{" "}
              <Link className="underline" href={`/runs/${encodeURIComponent(job.runId)}`}>
                Open the partial bundle run
              </Link>{" "}
              — it stays visibly failed there.
            </AlertDescription>
          </Alert>
        ) : null}

        {job.manifestSummary !== null ? (
          <div className="flex flex-col gap-2">
            <StageTable stages={job.manifestSummary.stages} />
            <p className="text-xs text-muted-foreground">
              {job.manifestSummary.gaps.length} manifest gap(s) · {job.manifestSummary.outputCount}{" "}
              declared output(s) · source{" "}
              <span className="font-mono">
                {job.manifestSummary.sourceId}@{job.manifestSummary.revisionId}
              </span>{" "}
              · platform <span className="font-mono">{job.manifestSummary.platformId}</span>. Full
              gap detail and verified downloads live on the run page.
            </p>
          </div>
        ) : job.state === "exited" ? (
          <p className="text-xs text-muted-foreground">
            No bundle manifest was written (the build stopped before any stage ran — e.g. an
            invalid config). Nothing is listed as a run for this id.
          </p>
        ) : null}

        {job.stderrTail !== "" ? (
          <div>
            <h3 className="mb-1 text-xs font-semibold">stderr tail</h3>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
              {job.stderrTail}
            </pre>
          </div>
        ) : null}
        {job.stdoutTail !== "" && !completed ? (
          <div>
            <h3 className="mb-1 text-xs font-semibold">stdout tail</h3>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
              {job.stdoutTail}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BuildLauncher({
  entries,
  invalid,
  runnerReady,
  runnerReason,
  initialActive,
}: BuildLauncherProps) {
  const [job, setJob] = useState<BuildJobView | null>(initialActive);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const poll = (runId: string): void => {
    const tick = async (): Promise<void> => {
      if (stoppedRef.current) return;
      try {
        const response = await fetch(`/api/builds/${encodeURIComponent(runId)}`, { cache: "no-store" });
        if (response.status === 404) {
          setError(`Build job ${runId} is no longer readable (HTTP 404).`);
          return;
        }
        if (!response.ok) {
          setError(`Could not read the build job state (HTTP ${response.status}).`);
          return;
        }
        const body = (await response.json()) as { job: BuildJobView };
        setJob(body.job);
        if (!TERMINAL_STATES.has(body.job.state)) {
          timerRef.current = window.setTimeout(() => void tick(), POLL_MS);
        }
      } catch {
        if (!stoppedRef.current) setError("Could not reach the build API.");
      }
    };
    void tick();
  };

  async function startBuild(configId: string): Promise<void> {
    setError(null);
    setStarting(configId);
    try {
      const response = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId }),
      });
      if (response.status === 202) {
        const body = (await response.json()) as { runId: string };
        poll(body.runId);
        return;
      }
      if (response.status === 409) {
        const body = (await response.json()) as { active: BuildJobView | null };
        setJob(body.active ?? null);
        setError("A build is already running — this runner executes one build at a time. Live state shown below.");
        if (body.active !== null && !TERMINAL_STATES.has(body.active.state)) poll(body.active.runId);
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? `Build start failed (HTTP ${response.status}).`);
    } catch {
      setError("Could not reach the build API.");
    } finally {
      setStarting(null);
    }
  }

  const busy = job !== null && !TERMINAL_STATES.has(job.state);

  return (
    <div className="flex flex-col gap-8">
      {!runnerReady ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Runner not ready</AlertTitle>
          <AlertDescription>
            {runnerReason} Configure the runs dir (and optionally STUDIO_DET_CLI) per the local
            build-control setup in apps/studio/README.md. The catalog below stays read-only until
            then.
          </AlertDescription>
        </Alert>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {job !== null ? <JobPanel job={job} /> : null}

      {invalid.length > 0 ? (
        <Alert>
          <CircleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>{`${invalid.length} catalog entr${invalid.length === 1 ? "y" : "ies"} failed the listing mirror`}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-1">
              {invalid.map((entry) => (
                <li key={entry.configId} className="text-xs">
                  <span className="font-mono">{entry.configId}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Build configs</CardTitle>
          <CardDescription>
            Caller-configured entries from the build projects dir. Provenance paths are shown as
            declared in each config (config-relative); the engine resolves and validates them at
            build time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No build-config entries found in the configured projects dir. Add one subdirectory
              per entry with a build-config.json (see apps/studio/README.md and
              examples/build/project.example.json for the shape).
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.configId} className="flex flex-col gap-2.5 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{entry.label}</span>
                  <Badge variant="outline">{entry.designSource.mode}</Badge>
                  <Badge variant="outline">
                    {entry.inputSource === "capability-probe" ? "capability probe" : "pinned registry"}
                  </Badge>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{entry.configId}</span>
                </div>
                {entry.description !== undefined ? (
                  <p className="text-sm text-muted-foreground">{entry.description}</p>
                ) : null}
                <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="shrink-0">profile:</dt>
                    <dd className="font-mono">{entry.profileId}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="shrink-0">design node:</dt>
                    <dd className="font-mono">{entry.designSource.designNode}</dd>
                  </div>
                  <div className="flex gap-1 sm:col-span-2">
                    <dt className="shrink-0">design file:</dt>
                    <dd className="font-mono">{entry.designSource.designFile}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="shrink-0">profile file:</dt>
                    <dd className="font-mono">{entry.declaredPaths.profile}</dd>
                  </div>
                  {entry.declaredPaths.probeProject !== undefined ? (
                    <div className="flex gap-1">
                      <dt className="shrink-0">probe project:</dt>
                      <dd className="font-mono">{entry.declaredPaths.probeProject}</dd>
                    </div>
                  ) : null}
                  {entry.declaredPaths.registry !== undefined ? (
                    <div className="flex gap-1">
                      <dt className="shrink-0">registry:</dt>
                      <dd className="font-mono">{entry.declaredPaths.registry}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-1">
                    <dt className="shrink-0">bindings:</dt>
                    <dd className="font-mono">{entry.declaredPaths.bindings}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="shrink-0">content:</dt>
                    <dd className="font-mono">{entry.declaredPaths.content}</dd>
                  </div>
                  {entry.declaredPaths.projection !== undefined ? (
                    <div className="flex gap-1">
                      <dt className="shrink-0">projection:</dt>
                      <dd className="font-mono">{entry.declaredPaths.projection}</dd>
                    </div>
                  ) : null}
                </dl>
                <div>
                  <Button
                    disabled={!runnerReady || busy || starting !== null}
                    onClick={() => void startBuild(entry.configId)}
                  >
                    {starting === entry.configId ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="size-4" aria-hidden="true" />
                    )}
                    {starting === entry.configId ? "Starting…" : "Build"}
                  </Button>
                  {!runnerReady ? (
                    <span className="ml-2 text-xs text-muted-foreground">runner not ready</span>
                  ) : busy ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      one build at a time — waiting for the active build
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
