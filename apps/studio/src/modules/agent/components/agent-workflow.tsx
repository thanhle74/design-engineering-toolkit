"use client";

/**
 * [65] The Studio AI workflow — client orchestration, honest at every step.
 *
 * Contract points (issue #65):
 *  - The workflow is BLOCKED unless the runtime preflight says Claude Code is
 *    installed + authenticated and the Figma MCP is listed + connected. The
 *    block renders the Vietnamese instruction — never a fake success, never
 *    a demo fallback, never a credential field.
 *  - The submit posts fileKey/nodeId/baseConfigId only; the server re-runs
 *    the authoritative preflight before spawning. While running, the UI
 *    shows the analysis id + a cancel affordance — a text state, not a fake
 *    progress bar (the [61] truthfulness doctrine: no Spin/progress in any
 *    state that is not a real user-triggered action; the recheck Button's
 *    own loading is such an action).
 *  - Terminal outcomes render what the agent ACTUALLY returned: grounded
 *    plans go to review; ungrounded/schema-failed/errored runs render the
 *    honest failure copy with the machine outcome code verbatim. Nothing is
 *    ever reinterpreted as a mapping.
 *  - Exactly one <p role="alert"> in this module (the form-level submit
 *    error) — approval problems render as plain secondary text.
 */
import * as React from "react";
import { Button, Collapse, Flex, Input, Select, Tag, Typography } from "antd";

import type { AgentAnalysisSnapshot, AgentPlan } from "@/src/shared/contracts";
import type { ApprovalPreview } from "@/src/server/claude-agent/plan-materializer";
import type { ClaudeAgentPreflight } from "@/src/server/claude-agent/claude-detect";
import { parseFigmaInput } from "@/src/modules/conversions/figma-input";
import { agentOutcomeCopy, agentStatusCopy } from "../agent-reasons";
import { AgentPlanView } from "./agent-plan-view";

export interface AgentWorkflowProps {
  configs: readonly { configId: string; label: string; designNode: string }[];
  /** Set when the server could not read the build-config catalogue. */
  catalogError?: string | null;
}

interface StatusPayload {
  status: ClaudeAgentPreflight;
  runsConfigured: boolean;
}

interface ApprovalPayload {
  preview: ApprovalPreview | null;
  previewError: string | null;
  approvable: boolean;
}

interface AnalysisPayload {
  snapshot: AgentAnalysisSnapshot;
  plan: AgentPlan | null;
  approval: ApprovalPayload;
}

const POLL_INTERVAL_MS = 2000;

export function AgentWorkflow({ configs, catalogError }: AgentWorkflowProps) {
  const [status, setStatus] = React.useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [sourceInput, setSourceInput] = React.useState("");
  const [baseConfigId, setBaseConfigId] = React.useState<string>(configs[0]?.configId ?? "");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<AnalysisPayload | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [approvalNote, setApprovalNote] = React.useState<string | null>(null);
  const [buildRunId, setBuildRunId] = React.useState<string | null>(null);
  const [cancelNote, setCancelNote] = React.useState<string | null>(null);

  // The initial state is already "loading"; loadStatus itself never flips
  // the flag synchronously (no setState in the effect call stack). Rechecks
  // set the flag in their own event handler before awaiting the fetch.
  const loadStatus = React.useCallback(async () => {
    try {
      const response = await fetch("/api/agent/status", { cache: "no-store" });
      if (response.ok) {
        setStatus((await response.json()) as StatusPayload);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadAnalysis = React.useCallback(async (analysisId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/agent/analyses/${encodeURIComponent(analysisId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as AnalysisPayload;
      setAnalysis(payload);
    } catch {
      /* transient — the poll loop retries */
    }
  }, []);

  // Initial load: status + any deep-linked analysis (?analysis=agent-…).
  // The fetches run in a timer callback — the effect itself only subscribes
  // (same shape as the poll loop below; no setState in the effect body).
  React.useEffect(() => {
    const bootstrap = window.setTimeout(() => {
      void loadStatus();
      const deep = new URLSearchParams(window.location.search).get("analysis");
      if (deep !== null && /^agent-\d+$/.test(deep)) {
        void loadAnalysis(deep);
      }
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, [loadStatus, loadAnalysis]);

  // Poll while the analysis is live.
  const analysisId = analysis?.snapshot.analysisId ?? null;
  const liveState = analysis?.snapshot.state === "running" || analysis?.snapshot.state === "queued";
  React.useEffect(() => {
    if (analysisId === null || !liveState) return;
    const timer = setInterval(() => {
      void loadAnalysis(analysisId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [analysisId, liveState, loadAnalysis]);

  const ready = status !== null && status.status.ready && status.runsConfigured;
  const copy = status !== null ? agentStatusCopy(status.status) : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setCancelNote(null);
    setApprovalNote(null);
    setBuildRunId(null);

    const parsed = parseFigmaInput(sourceInput);
    if (!parsed.ok || parsed.fileKey === null) {
      setSubmitError(parsed.ok ? "Cần một URL có node-id hoặc node id trần." : parsed.message);
      return;
    }
    if (baseConfigId === "") {
      setSubmitError("Chưa chọn dự án gốc (bản build-config nền).");
      return;
    }
    void (async () => {
      setStarting(true);
      try {
        const response = await fetch("/api/agent/analyses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileKey: parsed.fileKey, nodeId: parsed.nodeId, baseConfigId }),
        });
        if (response.status === 202) {
          const payload = (await response.json()) as { analysisId: string };
          const url = new URL(window.location.href);
          url.searchParams.set("analysis", payload.analysisId);
          window.history.replaceState(null, "", url.toString());
          await loadAnalysis(payload.analysisId);
        } else {
          const payload = (await response.json().catch(() => null)) as
            | { error?: { code?: string; message?: string }; status?: ClaudeAgentPreflight }
            | null;
          if (payload !== null && payload.status !== undefined) {
            setStatus({ status: payload.status, runsConfigured: status?.runsConfigured ?? true });
          }
          const code = payload?.error?.code ?? "unknown";
          const message = payload?.error?.message ?? "Không khởi động được phân tích.";
          setSubmitError(`${message} (mã: ${code})`);
        }
      } catch {
        setSubmitError("Không gọi được máy chủ Studio.");
      } finally {
        setStarting(false);
      }
    })();
  }

  function handleCancel() {
    if (analysisId === null) return;
    void (async () => {
      try {
        const response = await fetch(`/api/agent/analyses/${encodeURIComponent(analysisId)}/cancel`, {
          method: "POST",
        });
        if (response.ok || response.status === 409) {
          await loadAnalysis(analysisId);
        } else {
          setCancelNote("Không hủy được phân tích.");
        }
      } catch {
        setCancelNote("Không gọi được máy chủ Studio để hủy.");
      }
    })();
  }

  function handleApprove() {
    if (analysisId === null) return;
    void (async () => {
      setApproving(true);
      setApprovalNote(null);
      try {
        const response = await fetch(`/api/agent/analyses/${encodeURIComponent(analysisId)}/approve`, {
          method: "POST",
        });
        if (response.status === 202) {
          const payload = (await response.json()) as { buildRunId: string };
          setBuildRunId(payload.buildRunId);
        } else {
          const payload = (await response.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null;
          const code = payload?.error?.code ?? "unknown";
          const message = payload?.error?.message ?? "Không duyệt được kế hoạch.";
          setApprovalNote(`${message} (mã: ${code})`);
        }
      } catch {
        setApprovalNote("Không gọi được máy chủ Studio.");
      } finally {
        setApproving(false);
      }
    })();
  }

  return (
    <Flex vertical gap="middle">
      <Typography.Title level={2} style={{ marginBottom: 0 }}>
        Phân tích Figma bằng AI
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Dùng Claude Code cục bộ (đã đăng nhập) với Figma MCP để đọc node bạn chọn — chỉ đọc — và đề xuất kế hoạch
        section/vai trò. Engine <Typography.Text code>det build</Typography.Text> deterministic mới là bên thực hiện
        bản dựng. AI không thể ghi vào Figma hay Magento.
      </Typography.Paragraph>

      <StatusCard
        ready={ready}
        copy={copy}
        status={status}
        statusLoading={statusLoading}
        onRecheck={() => {
          setStatusLoading(true);
          void loadStatus();
        }}
      />

      <section aria-labelledby="agent-analyze-heading">
        <h2 id="agent-analyze-heading">Yêu cầu phân tích</h2>
        <form onSubmit={handleSubmit} noValidate>
          <Flex vertical gap="small">
            <Flex vertical gap="small">
              <label htmlFor="agent-figma-source">Nguồn thiết kế Figma</label>
              <Input
                id="agent-figma-source"
                name="agentFigmaSource"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://www.figma.com/design/<fileKey>/<fileName>?node-id=245-2 — or 245:2"
                value={sourceInput}
                onChange={(event) => {
                  setSourceInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                status={submitError !== null ? "error" : undefined}
                aria-invalid={submitError !== null ? true : undefined}
                aria-describedby={submitError !== null ? "agent-submit-error" : undefined}
              />
            </Flex>
            <Flex vertical gap="small">
              <label htmlFor="agent-base-config">Dự án gốc (bản build-config nền)</label>
              {catalogError !== null && catalogError !== undefined && catalogError !== "" ? (
                <Typography.Text type="secondary">
                  Không đọc được danh mục build-config: {catalogError}
                </Typography.Text>
              ) : null}
              <Select
                id="agent-base-config"
                style={{ width: "100%" }}
                value={baseConfigId === "" ? undefined : baseConfigId}
                onChange={(value) => setBaseConfigId(value)}
                options={configs.map((config) => ({
                  value: config.configId,
                  label: `${config.label} (${config.designNode})`,
                }))}
                placeholder={configs.length > 0 ? undefined : "Chưa có build-config nào"}
              />
            </Flex>
            <Flex wrap="wrap" align="center" gap="small">
              <Button type="primary" htmlType="submit" disabled={!ready} loading={starting}>
                Phân tích bằng AI
              </Button>
              {!ready ? (
                <Typography.Text type="secondary">
                  Chưa sẵn sàng — hoàn tất Claude Code + Figma MCP ở trên trước.
                </Typography.Text>
              ) : null}
            </Flex>
            {submitError !== null ? (
              <p id="agent-submit-error" role="alert">
                <Typography.Text type="danger">{submitError}</Typography.Text>
              </p>
            ) : null}
          </Flex>
        </form>
      </section>

      {cancelNote !== null ? (
        <Typography.Text type="secondary">{cancelNote}</Typography.Text>
      ) : null}

      {analysis !== null ? <AnalysisSection analysis={analysis} onCancel={handleCancel} /> : null}

      {analysis !== null && analysis.plan !== null ? (
        <AgentPlanView
          plan={analysis.plan}
          approvalPreview={analysis.approval.preview}
          approvalPreviewError={analysis.approval.previewError}
          approvable={analysis.approval.approvable}
          approving={approving}
          onApprove={handleApprove}
          buildLink={buildRunId === null ? null : { runId: buildRunId }}
        />
      ) : null}

      {approvalNote !== null ? (
        <Typography.Text type="secondary">Duyệt: {approvalNote}</Typography.Text>
      ) : null}
    </Flex>
  );
}

function StatusCard(props: {
  ready: boolean;
  copy: ReturnType<typeof agentStatusCopy> | null;
  status: StatusPayload | null;
  statusLoading: boolean;
  onRecheck: () => void;
}) {
  const { ready, copy, status, statusLoading, onRecheck } = props;
  return (
    <section aria-labelledby="agent-status-heading">
      <h2 id="agent-status-heading">Trạng thái môi trường</h2>
      {status === null ? (
        <Typography.Text type="secondary">
          Chưa đọc được trạng thái — bấm Kiểm tra lại.
        </Typography.Text>
      ) : (
        <Flex vertical gap={4}>
          <Typography.Text>
            Claude Code: <Tag color={status.status.claudeCode.ready ? "green" : "red"}>{copy?.claudeState}</Tag>
            {status.status.claudeCode.version !== null ? (
              <Typography.Text code>{status.status.claudeCode.version}</Typography.Text>
            ) : null}
          </Typography.Text>
          {copy?.claudeInstruction !== "" ? (
            <Typography.Text type="secondary">{copy?.claudeInstruction}</Typography.Text>
          ) : null}
          <Typography.Text>
            Figma MCP: <Tag color={status.status.figmaMcp.ready ? "green" : "red"}>{copy?.figmaState}</Tag>
            {status.status.figmaMcp.serverName !== null ? (
              <Typography.Text code>{status.status.figmaMcp.serverName}</Typography.Text>
            ) : null}
          </Typography.Text>
          {copy?.figmaInstruction !== "" ? (
            <Typography.Text type="secondary">{copy?.figmaInstruction}</Typography.Text>
          ) : null}
          {!status.runsConfigured ? (
            <Typography.Text type="secondary">
              Cần <Typography.Text code>STUDIO_DET_RUNS_DIR</Typography.Text> để lưu phân tích và chạy bản dựng.
            </Typography.Text>
          ) : null}
        </Flex>
      )}
      <Flex align="center" gap="small" style={{ marginTop: 8 }}>
        <Button onClick={onRecheck} loading={statusLoading}>
          Kiểm tra lại
        </Button>
        <Typography.Text type="secondary">
          Mỗi lần chạy phân tích sẽ kiểm tra lại trạng thái này một cách độc lập.
        </Typography.Text>
      </Flex>
      {ready ? null : (
        <div data-testid="agent-workflow-blocked">
          <Typography.Text strong>
            Quy trình AI đang bị chặn — không có phương án thay thế demo.
          </Typography.Text>
        </div>
      )}
    </section>
  );
}

function AnalysisSection(props: { analysis: AnalysisPayload; onCancel: () => void }) {
  const { analysis, onCancel } = props;
  const snapshot = analysis.snapshot;
  const live = snapshot.state === "running" || snapshot.state === "queued";
  const outcomeCopy = snapshot.outcome !== null ? agentOutcomeCopy(snapshot.outcome) : null;

  return (
    <section aria-labelledby="agent-analysis-heading">
      <h2 id="agent-analysis-heading">Phân tích</h2>
      <Flex vertical gap="small">
        <Typography.Text>
          ID: <Typography.Text code>{snapshot.analysisId}</Typography.Text>
          {" · trạng thái: "}
          <Typography.Text code>{snapshot.state}</Typography.Text>
          {snapshot.claudeVersion !== null ? (
            <>
              {". claude "}
              <Typography.Text code>{snapshot.claudeVersion}</Typography.Text>
            </>
          ) : null}
        </Typography.Text>

        {live ? (
          <Flex gap="small" align="center" wrap="wrap">
            <Typography.Text>Đang phân tích — agent đọc node đã chọn (chỉ đọc).</Typography.Text>
            <Button danger onClick={onCancel}>
              Hủy
            </Button>
          </Flex>
        ) : null}

        {outcomeCopy !== null ? (
          <div>
            <Typography.Text strong>{outcomeCopy.title}</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {outcomeCopy.detail}{" "}
              (mã: <Typography.Text code>{snapshot.outcome}</Typography.Text>)
            </Typography.Paragraph>
          </div>
        ) : null}

        {snapshot.state === "timeout" ? (
          <Typography.Text type="secondary">Vượt thời gian chờ — tiến trình đã bị dừng (SIGTERM).</Typography.Text>
        ) : null}
        {snapshot.state === "cancelled" ? (
          <Typography.Text type="secondary">Đã hủy bởi người dùng.</Typography.Text>
        ) : null}
        {snapshot.state === "spawn-failed" ? (
          <Typography.Text type="secondary">
            Không khởi động được tiến trình claude: {snapshot.spawnError ?? "không rõ"}
          </Typography.Text>
        ) : null}
        {snapshot.state === "interrupted" ? (
          <Typography.Text type="secondary">
            Máy chủ khởi động lại giữa chừng — phân tích này không còn tiến trình sống.
          </Typography.Text>
        ) : null}

        {!live && snapshot.envelopeSafe !== null ? (
          <Collapse
            items={[
              {
                key: "detail",
                label: "Chi tiết kỹ thuật",
                children: (
                  <Flex vertical gap={4}>
                    <Typography.Text type="secondary">
                      subtype: <Typography.Text code>{snapshot.envelopeSafe.subtype ?? "không rõ"}</Typography.Text>
                      {" · is_error: "}
                      <Typography.Text code>{String(snapshot.envelopeSafe.isError)}</Typography.Text>
                      {" · num_turns: "}
                      <Typography.Text code>{snapshot.envelopeSafe.numTurns === null ? "không rõ" : String(snapshot.envelopeSafe.numTurns)}</Typography.Text>
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      session_id: <Typography.Text code>{snapshot.envelopeSafe.sessionId ?? "không rõ"}</Typography.Text>
                      {" · total_cost_usd: "}
                      <Typography.Text code>{snapshot.envelopeSafe.totalCostUsd === null ? "không rõ" : snapshot.envelopeSafe.totalCostUsd.toFixed(4)}</Typography.Text>
                      {" · permission_denials: "}
                      <Typography.Text code>{String(snapshot.envelopeSafe.permissionDenialCount)}</Typography.Text>
                    </Typography.Text>
                    {snapshot.stderrTail.trim() !== "" ? (
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }} code>
                        stderr: {snapshot.stderrTail.trim()}
                      </Typography.Paragraph>
                    ) : null}
                  </Flex>
                ),
              },
            ]}
          />
        ) : null}
      </Flex>
    </section>
  );
}
