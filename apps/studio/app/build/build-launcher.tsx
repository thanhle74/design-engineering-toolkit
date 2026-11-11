"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretRightOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

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
  /** [58] repository = committed examples/build catalogue, configured = caller dir. */
  origin?: "repository" | "configured";
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

type StageRow = { stage: string; status: string; exitCode: number };

function stateTag(state: BuildJobView["state"], exitCode: number | null) {
  switch (state) {
    case "queued":
    case "running":
      return <Tag color="processing">{state === "queued" ? "queued" : "running…"}</Tag>;
    case "exited":
      return <Tag color={exitCode === 0 ? "success" : "error"}>{`exited ${exitCode ?? "?"}`}</Tag>;
    case "timeout":
      return <Tag color="error">timed out</Tag>;
    case "spawn-failed":
      return <Tag color="error">spawn failed</Tag>;
    case "interrupted":
      return <Tag color="error">interrupted</Tag>;
  }
}

function StageTable({ stages }: { stages: BuildStageLite[] | StudioBuildStageView[] }) {
  const columns: TableColumnsType<StageRow> = [
    {
      title: "Stage",
      dataIndex: "stage",
      render: (_, record: StageRow) => <span className="font-mono">{record.stage}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (_, record: StageRow) =>
        record.status === "failed" ? (
          <Tag color="error">{record.status}</Tag>
        ) : (
          <Tag>{record.status}</Tag>
        ),
    },
    {
      title: "Exit code",
      dataIndex: "exitCode",
      render: (_, record: StageRow) => <span className="font-mono">{record.exitCode}</span>,
    },
  ];
  return (
    <Table<StageRow>
      rowKey="stage"
      columns={columns}
      dataSource={stages}
      pagination={false}
      size="small"
    />
  );
}

function DeclaredPath({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className === undefined ? "flex gap-1" : `flex gap-1 ${className}`}>
      <dt className="shrink-0">
        <Typography.Text type="secondary">{label}</Typography.Text>
      </dt>
      <dd className="font-mono">
        <Typography.Text type="secondary">{value}</Typography.Text>
      </dd>
    </div>
  );
}

function JobPanel({ job }: { job: BuildJobView }) {
  const completed = job.state === "exited" && job.exitCode === 0;
  const failedButBundle =
    job.state === "exited" && job.exitCode !== 0 && job.manifestSummary !== null;
  return (
    <Card
      size="small"
      aria-live="polite"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {stateTag(job.state, job.exitCode)}
          <span className="font-mono text-sm">{job.runId}</span>
          <Typography.Text type="secondary">config {job.configId}</Typography.Text>
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <Typography.Text type="secondary">
          {job.startedAt === null ? "not started" : `started ${job.startedAt}`}
          {job.finishedAt === null ? " · not finished yet" : ` · finished ${job.finishedAt}`}
        </Typography.Text>

        {job.state === "interrupted" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Build interrupted"
            description="The server restarted while this build was running; the journal recorded no completion. Start a new build — no bundle for this run is trusted."
          />
        ) : null}

        {job.state === "timeout" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Build timed out"
            description="The runner sent SIGTERM after the configured timeout. Diagnostics below show what the build reported before termination."
          />
        ) : null}

        {job.state === "spawn-failed" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Runner error — the build never started"
            description={`${job.spawnError ?? "The det CLI could not be spawned."} This is a runner configuration problem, not a build result.`}
          />
        ) : null}

        {completed ? (
          <Alert
            type="success"
            showIcon
            icon={<ToolOutlined aria-hidden="true" />}
            message="Build completed (exit 0)"
            description={
              <>
                The bundle is written and now listed as a live run.{" "}
                <Link className="underline" href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Open the bundle run
                </Link>{" "}
                — artifacts are served only after byte-verification against the build manifest.
                Native Page Builder HTML stays source/download only; no Magento storefront or Admin
                preview is claimed.
              </>
            }
          />
        ) : null}

        {failedButBundle ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message={`Build finished with exit ${job.exitCode} — a stage failed`}
            description={
              <>
                The engine still wrote a truthful partial manifest (see the stage table).{" "}
                <Link className="underline" href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Open the partial bundle run
                </Link>{" "}
                — it stays visibly failed there.
              </>
            }
          />
        ) : null}

        {job.manifestSummary !== null ? (
          <div className="flex flex-col gap-2">
            <StageTable stages={job.manifestSummary.stages} />
            <Typography.Text type="secondary" className="text-xs">
              {job.manifestSummary.gaps.length} manifest gap(s) · {job.manifestSummary.outputCount}{" "}
              declared output(s) · source{" "}
              <span className="font-mono">
                {job.manifestSummary.sourceId}@{job.manifestSummary.revisionId}
              </span>{" "}
              · platform <span className="font-mono">{job.manifestSummary.platformId}</span>. Full
              gap detail and verified downloads live on the run page.
            </Typography.Text>
          </div>
        ) : job.state === "exited" ? (
          <Typography.Text type="secondary" className="text-xs">
            No bundle manifest was written (the build stopped before any stage ran — e.g. an
            invalid config). Nothing is listed as a run for this id.
          </Typography.Text>
        ) : null}

        {job.stderrTail !== "" ? (
          <div>
            <h3 className="mb-1 text-xs font-semibold">stderr tail</h3>
            <pre className="max-h-40 overflow-auto rounded-md border p-2 text-xs">
              {job.stderrTail}
            </pre>
          </div>
        ) : null}
        {job.stdoutTail !== "" && !completed ? (
          <div>
            <h3 className="mb-1 text-xs font-semibold">stdout tail</h3>
            <pre className="max-h-40 overflow-auto rounded-md border p-2 text-xs">
              {job.stdoutTail}
            </pre>
          </div>
        ) : null}
      </div>
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
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message="Runner not ready"
          description={
            <>
              {runnerReason} Start Studio with <span className="font-mono">npm run dev</span> from
              the repository root (it defaults STUDIO_DET_RUNS_DIR to{" "}
              <span className="font-mono">out/studio-runs</span>) or set it explicitly — optionally
              with STUDIO_DET_CLI. See apps/studio/README.md. The catalog below stays read-only
              until then.
            </>
          }
        />
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-sm">
          <Typography.Text type="danger">{error}</Typography.Text>
        </p>
      ) : null}

      {job !== null ? <JobPanel job={job} /> : null}

      {invalid.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message={`${invalid.length} catalog entr${invalid.length === 1 ? "y" : "ies"} failed the listing mirror`}
          description={
            <ul className="mt-1 flex flex-col gap-1">
              {invalid.map((entry) => (
                <li key={entry.configId} className="text-xs">
                  <span className="font-mono">{entry.configId}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Card
        size="small"
        title={<h2 className="text-base font-semibold">Build configs</h2>}
      >
        <Typography.Paragraph type="secondary" className="text-sm">
          Committed repository examples (read-only, cataloged in place) plus caller-configured
          entries from STUDIO_BUILD_PROJECTS_DIR when set. Provenance paths are shown as
          declared in each config (config-relative); the engine resolves and validates them at
          build time.
        </Typography.Paragraph>
        <div className="flex flex-col gap-3">
          {entries.length === 0 ? (
            <Typography.Text type="secondary">
              No build-config entries found. Add one subdirectory per entry with a
              build-config.json under STUDIO_BUILD_PROJECTS_DIR (see apps/studio/README.md and
              examples/build/project.example.json for the shape).
            </Typography.Text>
          ) : (
            entries.map((entry) => (
              <div key={entry.configId} className="flex flex-col gap-2.5 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{entry.label}</span>
                  {entry.origin === "repository" ? (
                    <Tag>repository example</Tag>
                  ) : null}
                  <Tag>{entry.designSource.mode}</Tag>
                  <Tag>
                    {entry.inputSource === "capability-probe" ? "capability probe" : "pinned registry"}
                  </Tag>
                  <Typography.Text type="secondary" className="ml-auto font-mono text-xs">
                    {entry.configId}
                  </Typography.Text>
                </div>
                {entry.description !== undefined ? (
                  <Typography.Text type="secondary">{entry.description}</Typography.Text>
                ) : null}
                <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                  <DeclaredPath label="profile:" value={entry.profileId} />
                  <DeclaredPath label="design node:" value={entry.designSource.designNode} />
                  <DeclaredPath
                    label="design file:"
                    value={entry.designSource.designFile}
                    className="sm:col-span-2"
                  />
                  <DeclaredPath label="profile file:" value={entry.declaredPaths.profile} />
                  {entry.declaredPaths.probeProject !== undefined ? (
                    <DeclaredPath label="probe project:" value={entry.declaredPaths.probeProject} />
                  ) : null}
                  {entry.declaredPaths.registry !== undefined ? (
                    <DeclaredPath label="registry:" value={entry.declaredPaths.registry} />
                  ) : null}
                  <DeclaredPath label="bindings:" value={entry.declaredPaths.bindings} />
                  <DeclaredPath label="content:" value={entry.declaredPaths.content} />
                  {entry.declaredPaths.projection !== undefined ? (
                    <DeclaredPath label="projection:" value={entry.declaredPaths.projection} />
                  ) : null}
                </dl>
                <div>
                  <Button
                    type="primary"
                    htmlType="button"
                    disabled={!runnerReady || busy || starting !== null}
                    loading={starting === entry.configId}
                    icon={<CaretRightOutlined aria-hidden="true" />}
                    onClick={() => void startBuild(entry.configId)}
                  >
                    {starting === entry.configId ? "Starting…" : "Build"}
                  </Button>
                  {!runnerReady ? (
                    <Typography.Text type="secondary" className="ml-2 text-xs">
                      runner not ready
                    </Typography.Text>
                  ) : busy ? (
                    <Typography.Text type="secondary" className="ml-2 text-xs">
                      one build at a time — waiting for the active build
                    </Typography.Text>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
