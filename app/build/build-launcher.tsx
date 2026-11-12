"use client";

import { useEffect, useRef, useState } from "react";
import { CaretRightOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Flex,
  List,
  Table,
  Tag,
  Typography,
} from "antd";
import type { DescriptionsProps, TableColumnsType } from "antd";

import type { StudioBuildStageView } from "@/src/modules/studio/shared/contracts";

/**
 * [40] Build launcher — the client half of Build Control. Starts real builds
 * via POST /api/builds, polls GET /api/builds/<runId>, and renders ONLY what
 * the runner actually reported: exit codes, stage tables from the bundle
 * manifest, capped diagnostics tails, timeout/spawn/interrupt truths. No
 * fabricated progress, no demo data, and completion links to the bundle run
 * where downloads are hash-verified.
 *
 * [61] Stock antd light presentation only: Flex/Typography/Card/Collapse/
 * Descriptions/List/Table primitives, built-in Tag color presets and the
 * stock `Text code` inline-code look for mono tokens. Terse Vietnamese copy
 * ("ít chữ"): machine tokens (config ids, run ids, exit codes, stage names/
 * statuses, timestamps) stay verbatim; declared provenance paths collapse
 * into one default-collapsed "Chi tiết kỹ thuật" item per config. No custom
 * CSS, no utility classes. The remaining inline styles are pure layout
 * (documented inline).
 */

export interface BuildLauncherEntry {
  configId: string;
  label: string;
  description?: string;
  profileId: string;
  designSource: { mode: string; project: string; designFile: string; designNode: string };
  inputSource: "capability-probe" | "pinned-registry";
  /** [58] repository = committed resources/examples/build catalogue, configured = caller dir. */
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

/** Vietnamese display labels; the machine `state` enum stays in logic only. */
function stateTag(state: BuildJobView["state"], exitCode: number | null) {
  switch (state) {
    case "queued":
      return <Tag color="processing">trong hàng đợi</Tag>;
    case "running":
      return <Tag color="processing">đang chạy…</Tag>;
    case "exited":
      return (
        <Tag color={exitCode === 0 ? "success" : "error"}>{`đã kết thúc (exit ${exitCode ?? "?"})`}</Tag>
      );
    case "timeout":
      return <Tag color="error">hết thời gian chờ</Tag>;
    case "spawn-failed":
      return <Tag color="error">không khởi chạy được</Tag>;
    case "interrupted":
      return <Tag color="error">bị gián đoạn</Tag>;
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
      title: "Giai đoạn",
      dataIndex: "stage",
      render: (_, record: StageRow) => <Typography.Text code>{record.stage}</Typography.Text>,
    },
    {
      title: "Trạng thái",
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
          {job.startedAt === null ? "chưa bắt đầu" : `bắt đầu ${job.startedAt}`}
          {job.finishedAt === null ? " · chưa kết thúc" : ` · kết thúc ${job.finishedAt}`}
        </Typography.Text>

        {job.state === "interrupted" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Bản dựng bị gián đoạn"
            description="Server khởi động lại khi bản dựng đang chạy; nhật ký không ghi nhận hoàn tất. Hãy tạo bản dựng mới — không tin bundle nào của lần chạy này."
          />
        ) : null}

        {job.state === "timeout" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Bản dựng hết thời gian chờ"
            description="Runner gửi SIGTERM sau thời hạn cấu hình. Log bên dưới cho thấy những gì bản dựng báo cáo trước khi bị dừng."
          />
        ) : null}

        {job.state === "spawn-failed" ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Lỗi runner — bản dựng chưa khởi chạy được"
            description={`${job.spawnError ?? "Không khởi chạy được det CLI."} Đây là lỗi cấu hình runner, không phải kết quả bản dựng.`}
          />
        ) : null}

        {completed ? (
          <Alert
            type="success"
            showIcon
            icon={<ToolOutlined aria-hidden="true" />}
            message="Bản dựng hoàn tất (exit 0)"
            description={
              <>
                Bundle đã được ghi và liệt kê như một lần chạy thật.{" "}
                <Typography.Link href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Xem kết quả
                </Typography.Link>{" "}
                — artifacts chỉ được phục vụ sau khi xác minh byte khớp build manifest; HTML Page
                Builder native chỉ ở dạng nguồn/tải về.
              </>
            }
          />
        ) : null}

        {failedButBundle ? (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message={`Bản dựng kết thúc với exit ${job.exitCode} — có giai đoạn thất bại`}
            description={
              <>
                Engine vẫn ghi manifest thật (xem bảng giai đoạn).{" "}
                <Typography.Link href={`/runs/${encodeURIComponent(job.runId)}`}>
                  Xem lần chạy một phần
                </Typography.Link>{" "}
                — nó vẫn hiển thị là thất bại ở đó.
              </>
            }
          />
        ) : null}

        {job.manifestSummary !== null ? (
          <Flex vertical gap={8}>
            <StageTable stages={job.manifestSummary.stages} />
            <Typography.Text type="secondary">
              {job.manifestSummary.gaps.length} khoảng trống manifest ·{" "}
              {job.manifestSummary.outputCount} output đã khai báo · nguồn{" "}
              <Typography.Text code>
                {job.manifestSummary.sourceId}@{job.manifestSummary.revisionId}
              </Typography.Text>{" "}
              · nền tảng <Typography.Text code>{job.manifestSummary.platformId}</Typography.Text>.
              Chi tiết khoảng trống và tải xuống đã xác minh nằm ở trang lần chạy.
            </Typography.Text>
          </Flex>
        ) : job.state === "exited" ? (
          <Typography.Text type="secondary">
            Không ghi được bundle manifest (bản dựng dừng trước khi giai đoạn nào chạy — ví dụ cấu
            hình không hợp lệ). Không có lần chạy nào được liệt kê cho id này.
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
          setError(`Không còn đọc được bản dựng ${runId} (HTTP 404).`);
          return;
        }
        if (!response.ok) {
          setError(`Không đọc được trạng thái bản dựng (HTTP ${response.status}).`);
          return;
        }
        const body = (await response.json()) as { job: BuildJobView };
        setJob(body.job);
        if (!TERMINAL_STATES.has(body.job.state)) {
          timerRef.current = window.setTimeout(() => void tick(), POLL_MS);
        }
      } catch {
        if (!stoppedRef.current) setError("Không kết nối được API bản dựng.");
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
        setError(
          "Đã có bản dựng đang chạy — mỗi lần chỉ chạy một. Hiển thị trạng thái thật bên dưới."
        );
        if (body.active !== null && !TERMINAL_STATES.has(body.active.state)) poll(body.active.runId);
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? `Khởi chạy bản dựng thất bại (HTTP ${response.status}).`);
    } catch {
      setError("Không kết nối được API bản dựng.");
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
          message="Runner chưa sẵn sàng"
          description={
            <>
              {runnerReason} Chạy <Typography.Text code>npm run dev</Typography.Text> từ gốc repo
              (mặc định <Typography.Text code>STUDIO_DET_RUNS_DIR</Typography.Text> thành{" "}
              <Typography.Text code>out/studio-runs</Typography.Text>) hoặc đặt biến này — có thể
              kèm <Typography.Text code>STUDIO_DET_CLI</Typography.Text>. Xem{" "}
              <Typography.Text code>docs/studio/README.md</Typography.Text>. Danh mục bên dưới vẫn
              chỉ đọc cho tới khi sẵn sàng.
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
          message={`${invalid.length} mục catalog không hợp lệ khi mirror listing`}
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
          <h2 style={{ margin: 0 }}>Cấu hình bản dựng</h2>
        }
      >
        <Flex vertical gap={12}>
          {entries.length === 0 ? (
            <Typography.Text type="secondary">
              Chưa có mục cấu hình bản dựng nào. Thêm một thư mục con mỗi mục chứa{" "}
              <Typography.Text code>build-config.json</Typography.Text> dưới{" "}
              <Typography.Text code>STUDIO_BUILD_PROJECTS_DIR</Typography.Text> (xem{" "}
              <Typography.Text code>docs/studio/README.md</Typography.Text> và{" "}
              <Typography.Text code>resources/examples/build/project.example.json</Typography.Text>).
            </Typography.Text>
          ) : (
            entries.map((entry) => (
              <Card key={entry.configId} size="small">
                <Flex vertical gap={12}>
                  <Flex wrap="wrap" justify="space-between" align="center" gap={8}>
                    <Flex align="center" gap={8} wrap="wrap">
                      <Typography.Text strong>{entry.label}</Typography.Text>
                      {entry.origin === "repository" ? <Tag>ví dụ có sẵn</Tag> : null}
                      <Tag>{entry.designSource.mode}</Tag>
                      <Tag>{entry.inputSource}</Tag>
                    </Flex>
                    <Typography.Text type="secondary" code>
                      {entry.configId}
                    </Typography.Text>
                  </Flex>
                  {entry.description !== undefined ? (
                    <Typography.Text type="secondary">{entry.description}</Typography.Text>
                  ) : null}
                  <Collapse
                    size="small"
                    items={[
                      {
                        key: "declared-paths",
                        label: "Chi tiết kỹ thuật",
                        children: (
                          <Descriptions column={1} size="small" items={declaredDescriptions(entry)} />
                        ),
                      },
                    ]}
                  />
                  <Flex align="center" gap={8}>
                    <Button
                      type="primary"
                      htmlType="button"
                      disabled={!runnerReady || busy || starting !== null}
                      loading={starting === entry.configId}
                      icon={<CaretRightOutlined aria-hidden="true" />}
                      onClick={() => void startBuild(entry.configId)}
                    >
                      {starting === entry.configId ? "Đang khởi chạy…" : "Build"}
                    </Button>
                    {!runnerReady ? (
                      <Typography.Text type="secondary">runner chưa sẵn sàng</Typography.Text>
                    ) : busy ? (
                      <Typography.Text type="secondary">
                        mỗi lần chỉ chạy một — đang chờ bản dựng hiện tại
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
