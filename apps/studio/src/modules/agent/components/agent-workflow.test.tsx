/**
 * [65] AgentWorkflow client orchestration tests.
 *
 * All fetch calls are stubbed; the component's honesty contract is the
 * subject: the blocked state (no demo fallback, Vietnamese instruction with
 * machine tokens, disabled submit), the ready state (submit → 202 → analysis
 * section with cancel affordance), exactly ONE <p role="alert"> for submit
 * errors, and the recheck affordance. No live claude, no network.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaudeAgentPreflight } from "@/src/server/claude-agent/claude-detect";

import { AgentWorkflow } from "./agent-workflow";

const CONFIGS = [{ configId: "slaunchpad-home-real-derived", label: "Slaunchpad home (real-derived)", designNode: "245:2" }];

const READY: ClaudeAgentPreflight = {
  claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
  figmaMcp: { ready: true, listed: true, serverName: "plugin:figma:figma", reasonCode: "ok" },
  ready: true,
  allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
};

const BLOCKED: ClaudeAgentPreflight = {
  claudeCode: { ready: false, version: null, reasonCode: "not-authenticated" },
  figmaMcp: { ready: true, listed: true, serverName: "plugin:figma:figma", reasonCode: "ok" },
  ready: false,
  allowedFigmaTool: null,
};

const RUNNING_SNAPSHOT = {
  journalSchemaVersion: 1,
  analysisId: "agent-910001",
  state: "running",
  request: { fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2", baseConfigId: "slaunchpad-home-real-derived" },
  pid: 424242,
  baseConfigPath: "/tmp/base/build-config.json",
  allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
  claudeVersion: "2.1.322",
  command: ["claude"],
  exitCode: null,
  signal: null,
  timedOut: false,
  cancelled: false,
  startedAt: "2026-11-11T00:00:00.000Z",
  finishedAt: null,
  stdoutTail: "",
  stderrTail: "",
  spawnError: null,
  outcome: null,
  envelopeSafe: null,
  grounded: null,
};

type FetchHandler = (input: string, init?: RequestInit) => Response;

function stubFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // jsdom: the component touches history on submit success.
  window.history.replaceState(null, "", "/agent");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentWorkflow — blocked state", () => {
  it("renders the Vietnamese block, disables submit, and shows NO demo fallback", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: BLOCKED, runsConfigured: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    await waitFor(() => expect(screen.getByTestId("agent-workflow-blocked")).toBeInTheDocument());

    expect(await screen.findByText("Claude Code:")).toBeInTheDocument();
    expect(screen.getByText("Figma MCP:")).toBeInTheDocument();
    expect(screen.getByText("Chưa sẵn sàng")).toBeInTheDocument();
    // The Vietnamese fix instruction with the machine token `claude` verbatim.
    expect(screen.getByText(/Claude Code chưa đăng nhập/)).toBeInTheDocument();
    // The submit button is disabled with an honest reason next to it.
    expect(screen.getByRole("button", { name: /Phân tích bằng AI/ })).toBeDisabled();
    expect(screen.getByText(/Chưa sẵn sàng — hoàn tất Claude Code \+ Figma MCP ở trên trước/)).toBeInTheDocument();
    expect(screen.getByText(/không có phương án thay thế demo/)).toBeInTheDocument();
    // No alert is open in the pristine blocked state.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for STUDIO_DET_RUNS_DIR when the runs env is missing", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: READY, runsConfigured: false });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    await waitFor(() => expect(screen.getByText(/STUDIO_DET_RUNS_DIR/)).toBeInTheDocument());
    expect(screen.getByTestId("agent-workflow-blocked")).toBeInTheDocument();
  });
});

describe("AgentWorkflow — ready state", () => {
  it("submits the parsed Figma input and shows the running analysis with cancel", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: READY, runsConfigured: true });
      }
      if (url.endsWith("/api/agent/analyses") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { fileKey: string; nodeId: string; baseConfigId: string };
        expect(body).toEqual({
          fileKey: "vNPtfBRpYM3PsExirVqhmt",
          nodeId: "245:2",
          baseConfigId: "slaunchpad-home-real-derived",
        });
        return Response.json({ analysisId: "agent-910001", state: "running" }, { status: 202 });
      }
      if (url.endsWith("/api/agent/analyses/agent-910001")) {
        return Response.json({
          snapshot: RUNNING_SNAPSHOT,
          plan: null,
          approval: { preview: null, previewError: null, approvable: false },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Phân tích bằng AI/ })).not.toBeDisabled());

    await user.type(screen.getByLabelText("Nguồn thiết kế Figma"), "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/home?node-id=245-2");
    await user.click(screen.getByRole("button", { name: /Phân tích bằng AI/ }));

    await waitFor(() => expect(screen.getByText("Phân tích")).toBeInTheDocument());
    expect(screen.getByText("agent-910001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeInTheDocument();
    // URL deep-link reflects the analysis (history.replaceState).
    expect(window.location.search).toContain("analysis=agent-910001");
  });

  it("renders exactly ONE <p role=alert> for a submit error and keeps it form-level", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: READY, runsConfigured: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Phân tích bằng AI/ })).not.toBeDisabled());

    // A source without any node id → parse error before any network call.
    await user.type(screen.getByLabelText("Nguồn thiết kế Figma"), "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/home");
    await user.click(screen.getByRole("button", { name: /Phân tích bằng AI/ }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].tagName).toBe("P");
    expect(alerts[0].id).toBe("agent-submit-error");
    // No antd Alert component and no antd role=alert elsewhere.
    expect(document.querySelectorAll("[role=alert]")).toHaveLength(1);
  });

  it("surfaces a 503 blocked-with-status response by refreshing the status card", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: READY, runsConfigured: true });
      }
      if (url.endsWith("/api/agent/analyses") && init?.method === "POST") {
        return Response.json(
          {
            error: { code: "agent-not-ready", message: "MCP không kết nối được." },
            status: BLOCKED,
          },
          { status: 503 }
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Phân tích bằng AI/ })).not.toBeDisabled());

    await user.type(screen.getByLabelText("Nguồn thiết kế Figma"), "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/home?node-id=245-2");
    await user.click(screen.getByRole("button", { name: /Phân tích bằng AI/ }));

    // The authoritative server-side preflight result replaces the card state.
    await waitFor(() => expect(screen.getByTestId("agent-workflow-blocked")).toBeInTheDocument());
    expect(screen.getByText(/agent-not-ready/)).toBeInTheDocument();
    expect(screen.getByText("Chưa sẵn sàng")).toBeInTheDocument();
  });

  it("the recheck button reloads the status endpoint", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/api/agent/status")) {
        return Response.json({ status: BLOCKED, runsConfigured: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<AgentWorkflow configs={CONFIGS} />);
    // antd's Button click-guard checks innerLoading (class ant-btn-loading);
    // a click on a still-loading button is silently swallowed. Gate on the
    // guard condition itself — CI timing differs from local, and content
    // presence alone proved flaky there.
    await waitFor(() => {
      const recheck = screen.getByText("Kiểm tra lại").closest("button") as HTMLButtonElement;
      expect(recheck.className).not.toContain("ant-btn-loading");
    });
    const recheck = screen.getByText("Kiểm tra lại").closest("button") as HTMLButtonElement;
    const callsAfterLoad = fetchMock.mock.calls.length;
    fireEvent.click(recheck);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterLoad));
  });
});
