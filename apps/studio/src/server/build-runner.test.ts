/**
 * [40] Build runner tests.
 *
 * The happy paths drive the REAL shipped CLI (`node bin/det.js build`) so the
 * single-slot runner is proven end-to-end against actual engine output, per
 * issue #40 ("trigger actual offline build through Studio local runner").
 * Busy/timeout/spawn-failure cases use a controlled fake child via the
 * runner's test seam — no shell strings, ever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DirectoryDetRunReader } from "./directory-det-run-reader";
import {
  BuildBusyError,
  BuildRunner,
  STUDIO_BUILD_TIMEOUT_MS_ENV,
  getBuildRunner,
  type BuildJobSnapshot,
} from "./build-runner";
import { exampleBuildConfigBody, requireDetCli } from "./test-helpers/det-cli";

const TERMINAL = new Set(["exited", "timeout", "spawn-failed", "interrupted"]);

let runsRoot: string;
let projectsRoot: string;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Create a catalog entry (real repo fixture paths) + runner over a fresh runs root. */
async function setupRunner(options: { config?: Record<string, unknown>; spawnImpl?: typeof spawn } = {}): Promise<{
  runner: BuildRunner;
  configPath: string;
}> {
  const entryDir = path.join(projectsRoot, "g28-example");
  await writeJson(
    path.join(entryDir, "build-config.json"),
    options.config ?? JSON.parse(exampleBuildConfigBody())
  );
  const runner = await BuildRunner.open(runsRoot, { spawnImpl: options.spawnImpl });
  return { runner, configPath: path.join(entryDir, "build-config.json") };
}

async function awaitTerminal(
  runner: BuildRunner,
  runId: string,
  timeoutMs = 30_000
): Promise<BuildJobSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let snap = await runner.snapshot(runId);
  while (snap !== null && !TERMINAL.has(snap.state)) {
    if (Date.now() > deadline) throw new Error(`build ${runId} did not reach a terminal state in time`);
    await sleep(150);
    snap = await runner.snapshot(runId);
  }
  if (snap === null) throw new Error(`build ${runId} lost its snapshot`);
  return snap;
}

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: null;
  stderr: null;
  kill: (signal?: string) => boolean;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as unknown as FakeChild;
  child.pid = 424242;
  child.stdout = null;
  child.stderr = null;
  child.kill = () => true;
  // No-op error listener: tests may emit "error" before the runner attaches
  // its own handler; EventEmitter would otherwise throw on the emit.
  (child as unknown as EventEmitter).on("error", () => {});
  return child;
}

beforeEach(async () => {
  runsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-runs-"));
  projectsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-projects-"));
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
  await rm(projectsRoot, { recursive: true, force: true });
  delete process.env[STUDIO_BUILD_TIMEOUT_MS_ENV];
});

describe("runner configuration", () => {
  it("reports not-configured for unset/invalid runs roots", async () => {
    await expect(BuildRunner.open("")).rejects.toMatchObject({ code: "not-configured" });
    await expect(BuildRunner.open(path.join(runsRoot, "missing"))).rejects.toMatchObject({
      code: "not-configured",
    });
    await writeFile(path.join(runsRoot, "file"), "x", "utf8");
    await expect(BuildRunner.open(path.join(runsRoot, "file"))).rejects.toMatchObject({
      code: "not-configured",
    });
  });

  it("getBuildRunner names the env var (never its value) when unconfigured", async () => {
    const saved = process.env.STUDIO_DET_RUNS_DIR;
    delete process.env.STUDIO_DET_RUNS_DIR;
    try {
      await expect(getBuildRunner()).rejects.toThrow(/STUDIO_DET_RUNS_DIR/);
      process.env.STUDIO_DET_RUNS_DIR = "/definitely/missing/root-9f3a";
      await expect(getBuildRunner()).rejects.toThrow(/STUDIO_DET_RUNS_DIR/);
      const error = await getBuildRunner().catch((e) => e);
      expect(error.message).not.toContain("/definitely/missing/root-9f3a");
    } finally {
      if (saved === undefined) delete process.env.STUDIO_DET_RUNS_DIR;
      else process.env.STUDIO_DET_RUNS_DIR = saved;
    }
  });
});

describe("real end-to-end build through the runner", () => {
  it(
    "runs the accepted example build to a completed, verifiable bundle",
    { timeout: 30_000 },
    async () => {
      requireDetCli();
      const { runner, configPath } = await setupRunner();
    const started = await runner.start("g28-example", configPath);
    expect(["queued", "running"]).toContain(started.state);

    const final = await awaitTerminal(runner, started.runId);
    expect(final.state).toBe("exited");
    expect(final.exitCode).toBe(0);
    expect(final.timedOut).toBe(false);
    expect(final.manifestSummary).not.toBeNull();
    expect(final.manifestSummary!.stages).toHaveLength(3);
    expect(final.manifestSummary!.stages.every((s) => s.status === "completed")).toBe(true);
    expect(final.manifestSummary!.outputCount).toBeGreaterThan(0);

    // journal persisted where the listing structurally cannot see it
    expect(existsSync(path.join(runsRoot, ".build-jobs", `${started.runId}.json`))).toBe(true);

    // the finished bundle is a verified live run through the normal reader
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const ids = (await reader.listRuns()).map((r) => r.runId);
    expect(ids).toContain(started.runId);
    const run = await reader.getRun(started.runId);
    expect(run.build!.manifestVerified).toBe(true);
    const download = await reader.readArtifact(started.runId, "build-manifest.json");
    expect(download.bytes.byteLength).toBeGreaterThan(0);

    // slot is free again
    expect(runner.activeSnapshot()).toBeNull();
    expect(await runner.snapshot(`definitely-not-${started.runId}`)).toBeNull();
  });

  it(
    "surfaces a missing-profile config as exit 2 with diagnostics and no bundle",
    { timeout: 30_000 },
    async () => {
    requireDetCli();
    const bogus = JSON.parse(exampleBuildConfigBody());
    bogus.profile = path.join(projectsRoot, "does-not-exist", "profile.json");
    const { runner, configPath } = await setupRunner({ config: bogus });

    const started = await runner.start("g28-example", configPath);
    const final = await awaitTerminal(runner, started.runId);
    expect(final.state).toBe("exited");
    expect(final.exitCode).toBe(2);
    expect(final.manifestSummary).toBeNull();
    expect(final.stdoutTail.length).toBeGreaterThan(0); // usage/schema diagnostics are real

    // no bundle was written, so nothing appears in the run listing
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const ids = (await reader.listRuns()).map((r) => r.runId);
    expect(ids).not.toContain(started.runId);
  });
});

describe("single-slot concurrency, timeout and spawn truth", () => {
  it("answers 409-style busy while the first build holds the slot", async () => {
    let childRef: FakeChild | null = null;
    const spawnImpl: typeof spawn = (() => {
      const child = makeFakeChild();
      childRef = child;
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn;

    const { runner, configPath } = await setupRunner({ spawnImpl });
    const first = await runner.start("g28-example", configPath);
    expect(first.state).toBe("running");
    expect(first.pid).toBe(424242);

    const busy = await runner.start("g28-example", configPath).catch((error) => error);
    expect(busy).toBeInstanceOf(BuildBusyError);
    expect((busy as BuildBusyError).active.runId).toBe(first.runId);

    childRef!.emit("close", 0, null);
    const final = await awaitTerminal(runner, first.runId);
    expect(final.state).toBe("exited");
    expect(final.exitCode).toBe(0);
    // the slot frees asynchronously after the journal reflects the terminal state
    const slotDeadline = Date.now() + 5_000;
    while (runner.activeSnapshot() !== null && Date.now() < slotDeadline) await sleep(50);
    expect(runner.activeSnapshot()).toBeNull();
  });

  it("records an honest timeout state when the child ignores SIGTERM in time", async () => {
    process.env[STUDIO_BUILD_TIMEOUT_MS_ENV] = "1000";
    const spawnImpl: typeof spawn = (() => {
      const child = makeFakeChild();
      child.kill = (signal?: string) => {
        // the child "dies" on SIGTERM — emit the close the runner waits for
        queueMicrotask(() => child.emit("close", null, signal ?? "SIGTERM"));
        return true;
      };
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn;

    const { runner, configPath } = await setupRunner({ spawnImpl });
    const started = await runner.start("g28-example", configPath);
    const final = await awaitTerminal(runner, started.runId);
    expect(final.state).toBe("timeout");
    expect(final.timedOut).toBe(true);
    expect(final.signal).toBe("SIGTERM");
    expect(final.exitCode).toBeNull();
  });

  it("records a spawn failure instead of ever faking a build", async () => {
    let childRef: FakeChild | null = null;
    const spawnImpl: typeof spawn = (() => {
      const child = makeFakeChild();
      childRef = child;
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn;

    const { runner, configPath } = await setupRunner({ spawnImpl });
    // start() has resolved → the runner's error/close handlers are attached;
    // emit deterministically (no timing guess that can outrun CI's fs).
    const started = await runner.start("g28-example", configPath);
    childRef!.emit("error", Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT" }));
    const final = await awaitTerminal(runner, started.runId);
    expect(final.state).toBe("spawn-failed");
    expect(final.spawnError).toMatch(/could not be spawned/);
    expect(final.exitCode).toBeNull();
    expect(final.manifestSummary).toBeNull();
  });

  it("reads a stale running journal as interrupted when its pid is gone", async () => {
    // a pid that is definitely dead: run `true` to completion
    const dead = spawn(process.execPath, ["-e", ""]);
    await new Promise<void>((resolve) => dead.on("close", () => resolve()));
    expect(dead.pid).not.toBeNull();

    await mkdir(path.join(runsRoot, ".build-jobs"), { recursive: true });
    await writeJson(path.join(runsRoot, ".build-jobs", "build-stale.json"), {
      journalSchemaVersion: 1,
      runId: "build-stale",
      configId: "g28-example",
      state: "running",
      exitCode: null,
      signal: null,
      timedOut: false,
      startedAt: "2026-11-09T00:00:00.000Z",
      finishedAt: null,
      command: ["node", "det.js"],
      stdoutTail: "",
      stderrTail: "",
      manifestSummary: null,
      spawnError: null,
      pid: dead.pid,
    });

    const runner = await BuildRunner.open(runsRoot);
    const snap = await runner.snapshot("build-stale");
    expect(snap).not.toBeNull();
    expect(snap!.state).toBe("interrupted");
  });
});
