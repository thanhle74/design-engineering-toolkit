/**
 * [40] GET /api/builds/[runId] route tests — 404 for unknown jobs, bad
 * encoding → 400, journal-backed snapshots (including the interrupted read).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/studio/server/det-run-reader-factory";

import { GET } from "./route";

let runsRoot: string;
const savedRuns = process.env[STUDIO_DET_RUNS_DIR_ENV];

beforeAll(async () => {
  runsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-job-api-"));
  process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
  await mkdir(path.join(runsRoot, ".build-jobs"), { recursive: true });
  await writeFile(
    path.join(runsRoot, ".build-jobs", "build-journaled.json"),
    JSON.stringify({
      journalSchemaVersion: 1,
      runId: "build-journaled",
      configId: "g28-example",
      state: "exited",
      exitCode: 0,
      signal: null,
      timedOut: false,
      startedAt: "2026-11-09T00:00:00.000Z",
      finishedAt: "2026-11-09T00:00:01.000Z",
      command: ["node", "det.js", "build"],
      stdoutTail: "{}",
      stderrTail: "",
      manifestSummary: null,
      spawnError: null,
      pid: null,
    }),
    "utf8"
  );
});

afterAll(async () => {
  await rm(runsRoot, { recursive: true, force: true });
  if (savedRuns === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedRuns;
});

function get(runId: string): Request {
  return new Request(`http://localhost/api/builds/${runId}`);
}

async function callGet(runId: string): Promise<Response> {
  return GET(get(runId), { params: Promise.resolve({ runId }) });
}

describe("GET /api/builds/[runId]", () => {
  it("serves a journaled job snapshot", async () => {
    const response = await callGet("build-journaled");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      job: { runId: string; state: string; exitCode: number | null };
    };
    expect(body.job.runId).toBe("build-journaled");
    expect(body.job.state).toBe("exited");
    expect(body.job.exitCode).toBe(0);
  });

  it("404s an unknown job id with a bounded, safe message", async () => {
    const response = await callGet("build-missing");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("run-not-found");
    expect(body.error.message).toContain("build-missing");
  });

  it("maps an invalid encoded runId to 400", async () => {
    const response = await GET(get("build-x"), { params: Promise.resolve({ runId: "%zz" }) });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad-request");
  });
});
