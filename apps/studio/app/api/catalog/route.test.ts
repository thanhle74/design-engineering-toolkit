/**
 * [50] /api/catalog route tests — direct handler invocation.
 *
 * The catalogue factory caches process-wide, so every scenario resets the
 * global handle (same pattern as the [40] runner factory tests' ordering
 * note, made explicit here). The off state MUST be proven before any
 * configured call, and the env VALUE never appears in any payload.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/server/det-run-reader-factory";
import { getStudioCatalog, STUDIO_DATA_DIR_ENV } from "@/src/server/catalog/studio-catalog";

import { GET } from "./route";

let root: string;
const savedEnv: Record<string, string | undefined> = {
  [STUDIO_DATA_DIR_ENV]: process.env[STUDIO_DATA_DIR_ENV],
  [STUDIO_DET_RUNS_DIR_ENV]: process.env[STUDIO_DET_RUNS_DIR_ENV],
};
const factoryGlobal = globalThis as { __detStudioCatalog?: unknown };

function resetFactory(): void {
  factoryGlobal.__detStudioCatalog = undefined;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "det50-catalog-api-"));
  resetFactory();
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetFactory();
});

describe("GET /api/catalog", () => {
  it("reports an honest off state (200) when STUDIO_DATA_DIR is unset", async () => {
    delete process.env[STUDIO_DATA_DIR_ENV];
    resetFactory();
    const response = await GET(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mode: string; message: string };
    expect(body.mode).toBe("off");
    expect(body.message).toContain("STUDIO_DATA_DIR");
  });

  it("maps an unusable STUDIO_DATA_DIR to 503 not-configured without leaking the value", async () => {
    const filePath = path.join(root, "api-not-a-dir");
    await writeFile(filePath, "not a directory", "utf8");
    process.env[STUDIO_DATA_DIR_ENV] = filePath;
    resetFactory();
    const response = await GET(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not-configured");
    expect(body.error.message).toContain("STUDIO_DATA_DIR");
    expect(body.error.message).not.toContain(filePath);
    resetFactory();
  });

  it("serves projects, runs and stats once configured (empty catalogue)", async () => {
    process.env[STUDIO_DATA_DIR_ENV] = path.join(root, "api-data");
    delete process.env[STUDIO_DET_RUNS_DIR_ENV]; // no runs root: nothing to index
    resetFactory();
    const response = await GET(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      stats: { projects: number; runs: number; artifacts: number };
      projects: unknown[];
      runs: unknown[];
      lastIndexing: unknown;
    };
    expect(body.mode).toBe("on");
    expect(body.stats).toEqual({
      projects: 0,
      runs: 0,
      artifacts: 0,
      byStatus: { RUNNING: 0, SUCCEEDED: 0, PARTIAL: 0, FAILED: 0, INTERRUPTED: 0 },
    });
    expect(body.projects).toEqual([]);
    expect(body.runs).toEqual([]);
    expect(body.lastIndexing).toBeNull();
  });

  it("answers runId queries with the catalogued run + artifacts, 404 for unknown ids", async () => {
    const catalog = await getStudioCatalog();
    expect(catalog).not.toBeNull();
    catalog!.recordRunnerStart({ runId: "build-api-runner", configId: "c", pid: null, startedAt: "2026-01-06T00:00:00.000Z" });

    const known = await GET(new Request("http://localhost/api/catalog?runId=build-api-runner"));
    expect(known.status).toBe(200);
    const knownBody = (await known.json()) as { run: { id: string; status: string }; artifacts: unknown[] };
    expect(knownBody.run.id).toBe("build-api-runner");
    expect(knownBody.run.status).toBe("RUNNING");
    expect(knownBody.artifacts).toEqual([]);

    const unknown = await GET(new Request("http://localhost/api/catalog?runId=build-never-was"));
    expect(unknown.status).toBe(404);
    const unknownBody = (await unknown.json()) as { error: { code: string } };
    expect(unknownBody.error.code).toBe("run-not-found");
  });
});
