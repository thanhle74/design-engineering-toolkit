/**
 * [65] Analysis runner tests — the full focused matrix from issue #65,
 * driven through the spawnImpl seam (NO live claude process in tests):
 *
 * missing CLI (spawn failure), not authenticated (preflight), timeout
 * (SIGTERM), user cancellation, malicious/unstructured output (envelope
 * invalid / schema failed), non-JSON stdout, missing structured_output,
 * stdout truncation, ungrounded plans, valid bound output (plan persisted +
 * re-validated), single-slot 409, stale-journal interrupted, the exact argv
 * enforcement contract, and a per-run cwd with no project settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { AgentPlanSchema } from "@/src/studio/shared/contracts";
import { VALID_AGENT_PLAN } from "@/src/studio/shared/contracts/agent-plan.test";
import {
  AgentAnalysisRunner,
  AgentBusyError,
  STUDIO_AGENT_TIMEOUT_MS_ENV,
} from "./analysis-runner";

let runsRoot: string;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST = { fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2", baseConfigId: "slaunchpad-home-real-derived" };

const DETECT_SCRIPT: Record<string, { stdout: string; code: number }> = {
  version: { stdout: "2.1.322 (Claude Code)\n", code: 0 },
  auth: { stdout: '{"loggedIn": true, "authMethod": "oauth_token"}\n', code: 0 },
  mcp: { stdout: "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected\n", code: 0 },
};

function envelopeFor(plan: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "test-session",
    num_turns: 3,
    duration_ms: 1234,
    total_cost_usd: 0.5,
    permission_denials: [],
    structured_output: plan,
    ...overrides,
  });
}

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  kill: (signal?: string) => boolean;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as unknown as FakeChild;
  child.pid = 424242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal?: string) => {
    queueMicrotask(() => child.emit("close", null, signal ?? "SIGTERM"));
    return true;
  };
  return child;
}

/**
 * spawnImpl that scripts the three detection commands and hands the analysis
 * spawn (`-p`) to the provided child factory; an entry `throwOnAnalysis`
 * makes the analysis spawn fail synchronously (ENOENT shape).
 */
function analysisSpawn(
  opts: {
    detect?: Record<string, { stdout: string; code: number }>;
    child?: FakeChild;
    throwOnAnalysis?: boolean;
    onAnalysisSpawn?: (command: string[], options: object) => void;
  } = {}
): typeof spawn {
  const detect = opts.detect ?? DETECT_SCRIPT;
  const impl = (command: string, args: readonly string[], options: object) => {
    const key = args[0] === "--version" ? "version" : args[0] === "auth" ? "auth" : args[0] === "mcp" ? "mcp" : "analysis";
    if (key === "analysis") {
      opts.onAnalysisSpawn?.([command, ...args], options);
      if (opts.throwOnAnalysis === true) {
        throw Object.assign(new Error(`spawn ${command} ENOENT`), { code: "ENOENT" });
      }
      return (opts.child ?? makeFakeChild()) as unknown as ChildProcess;
    }
    const outcome = detect[key];
    const child = new EventEmitter() as unknown as ChildProcess & { pid: number };
    child.pid = 424243;
    child.stdout = new EventEmitter() as unknown as ChildProcess["stdout"];
    child.stderr = new EventEmitter() as unknown as ChildProcess["stderr"];
    if (outcome === undefined) {
      queueMicrotask(() => child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })));
      return child as unknown as ChildProcess;
    }
    queueMicrotask(() => {
      child.stdout?.emit("data", Buffer.from(outcome.stdout));
      setTimeout(() => child.emit("close", outcome.code, null), 5);
    });
    return child as unknown as ChildProcess;
  };
  return impl as unknown as typeof spawn;
}

async function openRunner(spawnImpl?: typeof spawn): Promise<AgentAnalysisRunner> {
  return AgentAnalysisRunner.open(runsRoot, { spawnImpl: spawnImpl ?? analysisSpawn() });
}

const TERMINAL_STATES = new Set(["exited", "timeout", "cancelled", "spawn-failed", "interrupted"]);

async function awaitTerminal(runner: AgentAnalysisRunner, id: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let snap = await runner.snapshot(id);
  while (snap !== null && !TERMINAL_STATES.has(snap.state)) {
    if (Date.now() > deadline) throw new Error(`analysis ${id} did not reach a terminal state in time`);
    await sleep(20);
    snap = await runner.snapshot(id);
  }
  if (snap === null) throw new Error("analysis lost its snapshot");
  return snap;
}

beforeEach(async () => {
  runsRoot = await mkdtemp(path.join(os.tmpdir(), "det65-runner-"));
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
  delete process.env[STUDIO_AGENT_TIMEOUT_MS_ENV];
});

describe("happy path — valid bound output", () => {
  it("classifies plan-ready, persists the re-validated plan, journals the job", async () => {
    let capturedArgv: string[] = [];
    const child = makeFakeChild();
    const runner = await openRunner(
      analysisSpawn({
        child,
        onAnalysisSpawn: (command) => {
          capturedArgv = command;
        },
      })
    );
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    expect(snapshot.state).toBe("running");
    child.stdout!.emit("data", Buffer.from(envelopeFor(VALID_AGENT_PLAN)));
    child.emit("close", 0, null);
    const terminal = await awaitTerminal(runner, snapshot.analysisId);
    expect(terminal.state).toBe("exited");
    expect(terminal.outcome).toBe("plan-ready");
    expect(terminal.grounded).toBe(true);
    expect(terminal.envelopeSafe).toMatchObject({
      isError: false,
      subtype: "success",
      sessionId: "test-session",
      permissionDenialCount: 0,
      hasStructuredOutput: true,
    });

    const result = await runner.result(snapshot.analysisId);
    expect(result?.plan).not.toBeNull();
    // The persisted plan re-validates against the contract on read.
    expect(AgentPlanSchema.safeParse(result?.plan).success).toBe(true);
    expect(result?.plan?.requested).toEqual({ fileKey: REQUEST.fileKey, nodeId: REQUEST.nodeId });

    // Journal + analysis dir exist; the plan file lives in the dot-dir.
    const journal = JSON.parse(
      await readFile(path.join(runsRoot, ".agent-jobs", `${snapshot.analysisId}.json`), "utf8")
    );
    expect(journal.state).toBe("exited");
    expect(journal.outcome).toBe("plan-ready");
    expect(existsSync(path.join(runsRoot, ".agent-analyses", snapshot.analysisId, "agent-plan.json"))).toBe(true);
    expect(existsSync(path.join(runsRoot, ".agent-analyses", snapshot.analysisId, "cwd"))).toBe(true);

    // The exact verified argv enforcement contract.
    expect(capturedArgv[0]).toBe("claude");
    expect(capturedArgv[1]).toBe("-p");
    expect(capturedArgv).toContain("--output-format");
    expect(capturedArgv[capturedArgv.indexOf("--output-format") + 1]).toBe("json");
    expect(capturedArgv).toContain("--json-schema");
    expect(capturedArgv).toContain("--permission-prompts");
    expect(capturedArgv[capturedArgv.indexOf("--permission-prompts") + 1]).toBe("none");
    expect(capturedArgv).toContain("--allowedTools");
    expect(capturedArgv[capturedArgv.indexOf("--allowedTools") + 1]).toBe("mcp__plugin_figma_figma__get_metadata");
    const disallowed = capturedArgv[capturedArgv.indexOf("--disallowedTools") + 1];
    for (const tool of ["Bash", "Write", "Edit", "WebFetch", "WebSearch"]) {
      expect(disallowed).toContain(tool);
    }
    expect(capturedArgv).toContain("--max-budget-usd");
    expect(capturedArgv).toContain("--no-session-persistence");
    expect(capturedArgv).toContain("--append-system-prompt");
    const taskPrompt = capturedArgv[capturedArgv.indexOf("-p") + 1];
    expect(taskPrompt).toContain(REQUEST.fileKey);
    expect(taskPrompt).toContain(REQUEST.nodeId);
    // The schema flag carries the draft-07 derivation of the zod contract.
    expect(capturedArgv[capturedArgv.indexOf("--json-schema") + 1]).toContain("draft-07");
  });
});

describe("ungrounded / invalid / hostile outputs", () => {
  async function runWithStdout(stdout: string): Promise<{ state: string; outcome: string | null; grounded: boolean | null }> {
    const child = makeFakeChild();
    const runner = await openRunner(analysisSpawn({ child }));
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    if (stdout.length > 0) child.stdout!.emit("data", Buffer.from(stdout));
    child.emit("close", 0, null);
    const terminal = await awaitTerminal(runner, snapshot.analysisId);
    return { state: terminal.state, outcome: terminal.outcome, grounded: terminal.grounded };
  }

  it("plan-ungrounded: schema-valid plan that never observed the node", async () => {
    const ungroundedPlan = {
      ...VALID_AGENT_PLAN,
      observed: { grounded: false, rootName: null, childCount: null, revisionId: null },
      sections: [],
      limitations: ["tool denied"],
    };
    const r = await runWithStdout(envelopeFor(ungroundedPlan));
    expect(r.outcome).toBe("plan-ungrounded");
    expect(r.grounded).toBe(false);
  });

  it("schema-failed: structured_output that breaks the contract", async () => {
    const r = await runWithStdout(envelopeFor({ hacked: "no requested echo, no schema" }));
    expect(r.outcome).toBe("schema-failed");
    expect(r.grounded).toBeNull();
  });

  it("schema-failed: contract-valid shape but a locator echo mismatch (injection guard)", async () => {
    const spoofed = { ...VALID_AGENT_PLAN, requested: { fileKey: "other-file", nodeId: "1:1" } };
    const r = await runWithStdout(envelopeFor(spoofed));
    expect(r.outcome).toBe("schema-failed");
  });

  it("output-missing: success envelope without structured_output", async () => {
    const r = await runWithStdout(envelopeFor(undefined, { structured_output: null }));
    expect(r.outcome).toBe("output-missing");
  });

  it("claude-error: is_error envelope is never parsed as a plan", async () => {
    const r = await runWithStdout(envelopeFor(VALID_AGENT_PLAN, { is_error: true, subtype: "error_during_execution" }));
    expect(r.outcome).toBe("claude-error");
  });

  it("envelope-invalid: non-JSON stdout", async () => {
    const r = await runWithStdout("not json at all");
    expect(r.outcome).toBe("envelope-invalid");
  });

  it("stdout-truncated: over-cap stdout is never parsed", async () => {
    const child = makeFakeChild();
    const runner = await openRunner(analysisSpawn({ child }));
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    const chunk = Buffer.alloc(512 * 1024, 0x61);
    child.stdout!.emit("data", chunk);
    child.stdout!.emit("data", chunk);
    child.stdout!.emit("data", envelopeFor(VALID_AGENT_PLAN));
    child.emit("close", 0, null);
    const terminal = await awaitTerminal(runner, snapshot.analysisId);
    expect(terminal.outcome).toBe("stdout-truncated");
    // Tails stay bounded even when the stream overflowed.
    expect(terminal.stdoutTail.length).toBeLessThanOrEqual(16 * 1024);
  });
});

describe("process failure classes", () => {
  it("timeout: SIGTERM at the env-configured deadline", async () => {
    process.env[STUDIO_AGENT_TIMEOUT_MS_ENV] = "1000";
    const child = makeFakeChild();
    // A kill that behaves like a real SIGTERM (close null + signal).
    child.kill = (signal?: string) => {
      queueMicrotask(() => child.emit("close", null, signal ?? "SIGTERM"));
      return true;
    };
    const runner = await openRunner(analysisSpawn({ child }));
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    const terminal = await awaitTerminal(runner, snapshot.analysisId, 3000);
    expect(terminal.state).toBe("timeout");
    expect(terminal.timedOut).toBe(true);
  });

  it("cancel: user cancellation SIGTERMs the live child and records cancelled", async () => {
    const child = makeFakeChild();
    const runner = await openRunner(analysisSpawn({ child }));
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    const cancelled = runner.cancel(snapshot.analysisId);
    expect(cancelled?.cancelled).toBe(true);
    const terminal = await awaitTerminal(runner, snapshot.analysisId);
    expect(terminal.state).toBe("cancelled");
    expect(terminal.outcome).toBeNull();
    // Cancelling again is a no-op null (nothing live matches).
    expect(runner.cancel(snapshot.analysisId)).toBeNull();
  });

  it("spawn-failed: synchronous spawn error is a runner error, never a fake analysis", async () => {
    const runner = await openRunner(analysisSpawn({ throwOnAnalysis: true }));
    await expect(runner.start(REQUEST, "/tmp/base/build-config.json")).rejects.toMatchObject({
      name: "AgentWorkflowError",
      code: "not-configured",
    });
  });

  it("busy: a live analysis holds the single slot (409 carrier)", async () => {
    const child = makeFakeChild();
    const runner = await openRunner(analysisSpawn({ child }));
    const first = await runner.start(REQUEST, "/tmp/base/build-config.json");
    await expect(runner.start(REQUEST, "/tmp/base/build-config.json")).rejects.toBeInstanceOf(AgentBusyError);
    child.emit("close", 0, null);
    await awaitTerminal(runner, first.analysisId);
  });

  it("preflight-not-ready: an unauthenticated environment blocks the start", async () => {
    const runner = await openRunner(
      analysisSpawn({
        detect: {
          ...DETECT_SCRIPT,
          auth: { stdout: '{"loggedIn": false}\n', code: 0 },
        },
      })
    );
    await expect(runner.start(REQUEST, "/tmp/base/build-config.json")).rejects.toMatchObject({
      name: "AgentWorkflowError",
      code: "agent-not-ready",
    });
  });

  it("interrupted: a stale running journal with a dead pid reads interrupted", async () => {
    // A guaranteed-dead pid: start + await exit of a trivial process.
    const dead = spawn("true");
    await new Promise<void>((resolve) => dead.on("close", () => resolve()));
    const id = "agent-1000000000000";
    const journalDir = path.join(runsRoot, ".agent-jobs");
    await mkdir(journalDir, { recursive: true });
    await writeFile(
      path.join(journalDir, `${id}.json`),
      JSON.stringify({
        journalSchemaVersion: 1,
        analysisId: id,
        state: "running",
        request: REQUEST,
        pid: dead.pid,
        baseConfigPath: null,
        allowedFigmaTool: "",
        claudeVersion: null,
        command: [],
        exitCode: null,
        signal: null,
        timedOut: false,
        cancelled: false,
        startedAt: null,
        finishedAt: null,
        stdoutTail: "",
        stderrTail: "",
        spawnError: null,
        outcome: null,
        envelopeSafe: null,
        grounded: null,
      }),
      "utf8"
    );
    const runner = await openRunner(analysisSpawn({}));
    const snap = await runner.snapshot(id);
    expect(snap?.state).toBe("interrupted");
  });
});

describe("result read-back guards", () => {
  it("a corrupted persisted plan reads back null (never trusted)", async () => {
    const child = makeFakeChild();
    const runner = await openRunner(analysisSpawn({ child }));
    const snapshot = await runner.start(REQUEST, "/tmp/base/build-config.json");
    child.stdout!.emit("data", Buffer.from(envelopeFor(VALID_AGENT_PLAN)));
    child.emit("close", 0, null);
    await awaitTerminal(runner, snapshot.analysisId);
    const planPath = path.join(runsRoot, ".agent-analyses", snapshot.analysisId, "agent-plan.json");
    await writeFile(planPath, '{"requested": {"fileKey": "spoof"', "utf8");
    const result = await runner.result(snapshot.analysisId);
    expect(result?.plan).toBeNull();
    expect(result?.snapshot.outcome).toBe("plan-ready"); // journal truth unchanged
  });

  it("unknown analysis id → null, pattern-violating id → null", async () => {
    const runner = await openRunner(analysisSpawn({}));
    expect(await runner.snapshot("../escape")).toBeNull();
    expect(await runner.result("agent-does-not-exist")).toBeNull();
    const dir = await stat(path.join(runsRoot)).catch(() => null);
    expect(dir).not.toBeNull();
  });
});
