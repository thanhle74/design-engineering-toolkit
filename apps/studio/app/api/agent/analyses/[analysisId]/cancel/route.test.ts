/**
 * [65] POST /api/agent/analyses/[analysisId]/cancel route tests.
 *
 * 404 (real runner, empty root) and 409 (seeded terminal journal) run the
 * real global; the 200 running→cancelled contract is exercised through a
 * runner injected into the same globalThis slot — real cancellation
 * semantics (SIGTERM to the live child) are proven in analysis-runner.test.ts,
 * never with a live claude here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/server/det-run-reader-factory";
import type { AgentAnalysisSnapshot } from "@/src/shared/contracts";

import { POST } from "./route";

let runsRoot: string | undefined;
const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];

function resetRunnerGlobals(): void {
  (globalThis as { __detStudioAgentRunner?: unknown }).__detStudioAgentRunner = undefined;
}

const REQUEST = { fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2", baseConfigId: "slaunchpad-home-real-derived" };

function seedJournal(analysisId: string, state: string): Promise<void> {
  if (runsRoot === undefined) throw new Error("runsRoot not initialised");
  const journalDir = path.join(runsRoot, ".agent-jobs");
  return mkdir(journalDir, { recursive: true }).then(() =>
    writeFile(
      path.join(journalDir, `${analysisId}.json`),
      JSON.stringify({
        journalSchemaVersion: 1,
        analysisId,
        state,
        request: REQUEST,
        pid: null,
        baseConfigPath: null,
        allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
        claudeVersion: "2.1.322",
        command: ["claude"],
        exitCode: state === "exited" ? 0 : null,
        signal: null,
        timedOut: false,
        cancelled: false,
        startedAt: "2026-11-11T00:00:00.000Z",
        finishedAt: state === "exited" ? "2026-11-11T00:00:30.000Z" : null,
        stdoutTail: "",
        stderrTail: "",
        spawnError: null,
        outcome: state === "exited" ? "plan-ready" : null,
        envelopeSafe: null,
        grounded: state === "exited" ? true : null,
      }),
      "utf8"
    )
  );
}

/** Minimal runner double honoring the route's snapshot()/cancel() contract. */
function fakeRunner(snapshots: Map<string, AgentAnalysisSnapshot>, cancelled: Set<string>) {
  return {
    snapshot: async (id: string) => snapshots.get(id) ?? null,
    cancel: (id: string) => {
      const snap = snapshots.get(id);
      if (snap === undefined || !["running", "queued"].includes(snap.state)) return null;
      const next = { ...snap, state: "cancelled", cancelled: true } as AgentAnalysisSnapshot;
      snapshots.set(id, next);
      cancelled.add(id);
      return next;
    },
  };
}

function post(analysisId: string): Promise<Response> {
  return POST(new Request(`http://localhost/api/agent/analyses/${analysisId}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ analysisId }),
  });
}

beforeEach(() => {
  resetRunnerGlobals();
});

afterEach(async () => {
  resetRunnerGlobals();
  if (runsRoot !== undefined) await rm(runsRoot, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
});

describe("POST /api/agent/analyses/[analysisId]/cancel", () => {
  it("404s an unknown analysis id", async () => {
    runsRoot = await mkdtemp(path.join(os.tmpdir(), "det65-cancel-"));
    process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
    const response = await post("agent-404000");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("analysis-not-found");
  });

  it("409s a terminal analysis (already exited)", async () => {
    runsRoot = await mkdtemp(path.join(os.tmpdir(), "det65-cancel-"));
    process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
    await seedJournal("agent-600001", "exited");
    const response = await post("agent-600001");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("analysis-not-cancellable");
  });

  it("cancels a running analysis and returns its cancelled snapshot", async () => {
    const running = {
      journalSchemaVersion: 1,
      analysisId: "agent-600002",
      state: "running",
      request: REQUEST,
      pid: 424242,
      baseConfigPath: null,
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
    } as AgentAnalysisSnapshot;
    const snapshots = new Map([[running.analysisId, running]]);
    (globalThis as { __detStudioAgentRunner?: unknown }).__detStudioAgentRunner =
      Promise.resolve(fakeRunner(snapshots, new Set()));
    const response = await post("agent-600002");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { snapshot: { state: string; cancelled: boolean } };
    expect(body.snapshot).toMatchObject({ state: "cancelled", cancelled: true });
  });
});
