/**
 * [29] W-D — GET /api/runs route test (direct handler invocation).
 *
 * Fixture mode (env unset) must serve the labeled DEMO summary; a broken
 * STUDIO_DET_RUNS_DIR must surface as 503 not-configured with no env value
 * and no absolute server path in the body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/server/det-run-reader-factory";

import { GET } from "./route";

const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];

beforeEach(() => {
  delete process.env[STUDIO_DET_RUNS_DIR_ENV];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
});

describe("GET /api/runs", () => {
  it("returns the DEMO fixture summary when unconfigured", async () => {
    const response = await GET(new Request("http://localhost/api/runs"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { runs: Array<{ runId: string; mode: string }> };
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ runId: "demo-run-245-2", mode: "fixture" });
  });

  it("maps not-configured to 503 without leaking the env value", async () => {
    process.env[STUDIO_DET_RUNS_DIR_ENV] = "/definitely/missing/det-root-9f3a";
    const response = await GET(new Request("http://localhost/api/runs"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not-configured");
    expect(body.error.message).not.toContain(process.env[STUDIO_DET_RUNS_DIR_ENV]);
    expect(body.error.message).not.toMatch(/\//);
  });
});
