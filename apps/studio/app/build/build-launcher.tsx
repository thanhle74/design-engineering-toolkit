"use client";

import { useEffect, useRef, useState } from "react";
import { CaretRightOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Flex, List, Table, Tag, Typography } from "antd";
import type { DescriptionsProps, TableColumnsType } from "antd";

import type { StudioBuildStageView } from "@/src/shared/contracts";

/**
 * [40] Build launcher — the client half of Build Control. Starts real builds
 * via POST /api/builds, polls GET /api/builds/<runId>, and renders ONLY what
 * the runner actually reported: exit codes, stage tables from the bundle
 * manifest, capped diagnostics tails, timeout/spawn/interrupt truths. No
 * fabricated progress, no demo data, and completion links to the bundle run
 * where downloads are hash-verified.
 *
 * [61] Stock antd light presentation only: Flex/Typography/Card/Descriptions/
 * List/Table primitives, built-in Tag color presets and the stock `Text code`
 * inline-code look for mono tokens. No custom CSS, no utility classes. The two
 * remaining inline styles are pure layout (documented inline).
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

/** Declared provenance paths of one build config, as stock antd label/value pairs. */
function declaredDescriptions(entry: BuildLauncherEntry): DescriptionsProps["items"] {
  const mono = (value: string) => <Typography.Text code>{value}</Typography.Text>;
  const items: NonNullable<DescriptionsProps["items"]> = [
    { key: "profile", label: "profile", children: mono(entry.profileId) },
    { key: "design-node", label: "design node", children: mono(entry.designSource.designNode) },
    { key: "design-file", label: "design file", children: mono(entry.designSource.designFile) },
    { key: "profile-file", label: "profile file", children: mono(entry.declaredPaths.profile) },
  ];
  if (entry.declaredPaths.probeProject !== undefined) {
    items.push({ key: "probe-project", label: "probe project", children: mono(entry.declaredPaths.probeProject) });
  }
  if (entry.declaredPaths.registry !== undefined) {
    items.push({ key: "registry", label: "registry", children: mono(entry.declaredPaths.registry) });
  }
  items.push(
    { key: "bindings", label: "bindings", children: mono(entry.declaredPaths.bindings) },
    { key: "content", label: "content", children: mono(entry.declaredPaths.content) }
  );
  if (entry.declaredPaths.projection !== undefined) {
    items.push({ key: "projection", label: "projection", children: mono(entry.declaredPaths.projection) });
  }
  return items;
}

function StageTable({ stages }: { stages: BuildStageLite[] | StudioBuildStageView[] }) {
  const columns: TableColumnsType<StageRow> = [
    {
      title: "Stage",
      dataIndex: "stage",
      render: (_, record: StageRow) => <Typography.Text code>{record.stage}</Typography.Text>,
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
      render: (_, record: StageRow) => <Typography.Text code>{record.exitCode}</Typography.Text>,
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

function JobPanel({ job }: { job: BuildJobView }) {
  const completed = job.state === "exited" && job.exitCode === 0;
  const failedButBundle =
    job.state === "exited" && job.exitCode !== 0 && job.manifestSummary !== null;
  return (
    <Card
      size="small"
      aria-live="polite"
      title={
        <Flex wrap="wrap" align="center" gap={8}>
          {stateTag(job.state, job.exitCode)}
          <Typography.Text code>{job.runId}</Typography.Text>
          <Typography.Text type="secondary">config {job.configId}</Typography.Text>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
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
                <Typography.Link href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Open the bundle run
                </Typography.Link>{" "}
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
                <Typography.Link href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Open the partial bundle run
                </Typography.Link>{" "}
                — it stays visibly failed there.
              </>
            }
          />
        ) : null}

        {job.manifestSummary !== null ? (
          <Flex vertical gap={8}>
            <StageTable stages={job.manifestSummary.stages} />
            <Typography.Text type="secondary">
              {job.manifestSummary.gaps.length} manifest gap(s) · {job.manifestSummary.outputCount}{" "}
              declared output(s) · source{" "}
              <Typography.Text code>
                {job.manifestSummary.sourceId}@{job.manifestSummary.revisionId}
              </Typography.Text>{" "}
              · platform <Typography.Text code>{job.manifestSummary.platformId}</Typography.Text>.
              Full gap detail and verified downloads live on the run page.
            </Typography.Text>
          </Flex>
        ) : job.state === "exited" ? (
          <Typography.Text type="secondary">
            No bundle manifest was written (the build stopped before any stage ran — e.g. an
            invalid config). Nothing is listed as a run for this id.
          </Typography.Text>
        ) : null}

        {job.stderrTail !== "" ? (
          <Flex vertical gap={4}>
            {/* layout only: neutralize UA heading margins */}
            <h3 style={{ margin: 0 }}>stderr tail</h3>
            {/* layout only: contain the log tail with a capped scroll area */}
            <pre style={{ margin: 0, overflow: "auto", maxHeight: 160 }}>{job.stderrTail}</pre>
          </Flex>
        ) : null}
        {job.stdoutTail !== "" && !completed ? (
          <Flex vertical gap={4}>
            {/* layout only: neutralize UA heading margins */}
            <h3 style={{ margin: 0 }}>stdout tail</h3>
            {/* layout only: contain the log tail with a capped scroll area */}
            <pre style={{ margin: 0, overflow: "auto", maxHeight: 160 }}>{job.stdoutTail}</pre>
          </Flex>
        ) : null}
      </Flex>
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
    <Flex vertical gap={32}>
      {!runnerReady ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message="Runner not ready"
          description={
            <>
              {runnerReason} Start Studio with <Typography.Text code>npm run dev</Typography.Text>{" "}
              from the repository root (it defaults STUDIO_DET_RUNS_DIR to{" "}
              <Typography.Text code>out/studio-runs</Typography.Text>) or set it explicitly —
              optionally with STUDIO_DET_CLI. See apps/studio/README.md. The catalog below stays
              read-only until then.
            </>
          }
        />
      ) : null}

      {error !== null ? (
        <p role="alert">
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
            <List
              size="small"
              dataSource={invalid}
              renderItem={(entry) => (
                <List.Item>
                  <Typography.Text code>{entry.configId}</Typography.Text> — {entry.reason}
                </List.Item>
              )}
            />
          }
        />
      ) : null}

      <Card
        size="small"
        title={
          // layout only: neutralize UA heading margins
          <h2 style={{ margin: 0 }}>Build configs</h2>
        }
      >
        <Typography.Paragraph type="secondary">
          Committed repository examples (read-only, cataloged in place) plus caller-configured
          entries from STUDIO_BUILD_PROJECTS_DIR when set. Provenance paths are shown as
          declared in each config (config-relative); the engine resolves and validates them at
          build time.
        </Typography.Paragraph>
        <Flex vertical gap={12}>
          {entries.length === 0 ? (
            <Typography.Text type="secondary">
              No build-config entries found. Add one subdirectory per entry with a
              build-config.json under STUDIO_BUILD_PROJECTS_DIR (see apps/studio/README.md and
              examples/build/project.example.json for the shape).
            </Typography.Text>
          ) : (
            entries.map((entry) => (
              <Card key={entry.configId} size="small">
                <Flex vertical gap={12}>
                  <Flex wrap="wrap" justify="space-between" align="center" gap={8}>
                    <Flex align="center" gap={8} wrap="wrap">
                      <Typography.Text strong>{entry.label}</Typography.Text>
                      {entry.origin === "repository" ? <Tag>repository example</Tag> : null}
                      <Tag>{entry.designSource.mode}</Tag>
                      <Tag>
                        {entry.inputSource === "capability-probe" ? "capability probe" : "pinned registry"}
                      </Tag>
                    </Flex>
                    <Typography.Text type="secondary" code>
                      {entry.configId}
                    </Typography.Text>
                  </Flex>
                  {entry.description !== undefined ? (
                    <Typography.Text type="secondary">{entry.description}</Typography.Text>
                  ) : null}
                  <Descriptions column={1} size="small" items={declaredDescriptions(entry)} />
                  <Flex align="center" gap={8}>
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
                      <Typography.Text type="secondary">runner not ready</Typography.Text>
                    ) : busy ? (
                      <Typography.Text type="secondary">
                        one build at a time — waiting for the active build
                      </Typography.Text>
                    ) : null}
                  </Flex>
                </Flex>
              </Card>
            ))
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
