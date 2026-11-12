/**
 * [65] /api/agent/status route tests — detection is mocked (NO live claude
 * process in tests); the route's payload shape + env truth are the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const detectMock = vi.fn();
vi.mock("@/src/server/claude-agent/claude-detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/server/claude-agent/claude-detect")>();
  return { ...actual, detectClaudeAgentStatus: (...args: unknown[]) => detectMock(...args) };
});

import { GET } from "./route";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = { ...process.env };
  detectMock.mockReset();
});

afterEach(() => {
  if (savedEnv.STUDIO_DET_RUNS_DIR === undefined) delete process.env.STUDIO_DET_RUNS_DIR;
  else process.env.STUDIO_DET_RUNS_DIR = savedEnv.STUDIO_DET_RUNS_DIR;
  detectMock.mockReset();
});

describe("GET /api/agent/status", () => {
  it("returns the preflight status + runs env truth", async () => {
    delete process.env.STUDIO_DET_RUNS_DIR;
    detectMock.mockResolvedValue({
      claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
      figmaMcp: { ready: true, listed: true, serverName: "plugin:figma:figma", reasonCode: "ok" },
      ready: true,
      allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
    });
    const response = await GET(new Request("http://localhost/api/agent/status"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: { ready: boolean }; runsConfigured: boolean };
    expect(payload.status.ready).toBe(true);
    expect(payload.runsConfigured).toBe(false);
  });

  it("reports a blocked workflow status without becoming an error", async () => {
    delete process.env.STUDIO_DET_RUNS_DIR;
    detectMock.mockResolvedValue({
      claudeCode: { ready: false, version: null, reasonCode: "not-installed" },
      figmaMcp: { ready: false, listed: false, serverName: null, reasonCode: "mcp-not-listed" },
      ready: false,
      allowedFigmaTool: null,
    });
    const response = await GET(new Request("http://localhost/api/agent/status"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: { ready: boolean; claudeCode: { reasonCode: string } } };
    expect(payload.status.ready).toBe(false);
    expect(payload.status.claudeCode.reasonCode).toBe("not-installed");
  });

  it("carries the runs env configuration truth", async () => {
    process.env.STUDIO_DET_RUNS_DIR = "/tmp/det65-status-runs";
    detectMock.mockResolvedValue({
      claudeCode: { ready: false, version: null, reasonCode: "not-installed" },
      figmaMcp: { ready: false, listed: false, serverName: null, reasonCode: "mcp-not-listed" },
      ready: false,
      allowedFigmaTool: null,
    });
    const response = await GET(new Request("http://localhost/api/agent/status"));
    const payload = (await response.json()) as { runsConfigured: boolean };
    expect(payload.runsConfigured).toBe(true);
  });
});
