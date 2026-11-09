/**
 * [40] GET /api/build-configs route tests — catalog listing, invalid entries,
 * runner readiness riding along, and the not-configured mapping.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/server/det-run-reader-factory";
import { STUDIO_BUILD_PROJECTS_DIR_ENV } from "@/src/server/build-catalog";

import { GET } from "./route";

const projectsRoot = mkdtempSync(path.join(os.tmpdir(), "det40-configs-api-"));
const runsRoot = mkdtempSync(path.join(os.tmpdir(), "det40-runs-configs-"));

const savedProjects = process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
const savedRuns = process.env[STUDIO_DET_RUNS_DIR_ENV];

afterAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(runsRoot, { recursive: true, force: true });
  if (savedProjects === undefined) delete process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
  else process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] = savedProjects;
  if (savedRuns === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedRuns;
});

function setEnv(projects: string | undefined, runs: string | undefined): void {
  if (projects === undefined) delete process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
  else process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] = projects;
  if (runs === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = runs;
}

describe("GET /api/build-configs", () => {
  it("maps an unset projects dir to 503 not-configured (env name, not value)", async () => {
    setEnv(undefined, undefined);
    const response = await GET(new Request("http://localhost/api/build-configs"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not-configured");
    expect(body.error.message).toContain("STUDIO_BUILD_PROJECTS_DIR");
  });

  // NOTE: this case must run BEFORE the successful listing test below — the
  // runner factory caches its instance on first success (single job slot).
  it("stays 200 with runnerReady=false when only the runs dir is unusable", async () => {
    setEnv(projectsRoot, "/definitely/missing/runs-9f3a");
    const response = await GET(new Request("http://localhost/api/build-configs"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { runnerReady: boolean; runnerReason?: string };
    expect(body.runnerReady).toBe(false);
    expect(body.runnerReason).toContain("STUDIO_DET_RUNS_DIR");
    expect(body.runnerReason).not.toContain("/definitely/missing/runs-9f3a");
  });

  it("lists entries with runner readiness; invalid entries ride along", async () => {
    await mkdir(path.join(projectsRoot, "good-entry"), { recursive: true });
    await writeFile(
      path.join(projectsRoot, "good-entry", "build-config.json"),
      JSON.stringify({
        schemaVersion: 1,
        profileId: "demo-profile",
        profile: "profile.json",
        designSource: {
          mode: "snapshot",
          project: ".",
          designFile: "tree.json",
          designNode: "245:2",
        },
        capabilityProbe: { project: "." },
        bindings: "bindings.json",
        content: "content.json",
      }),
      "utf8"
    );
    await mkdir(path.join(projectsRoot, "bad-entry"), { recursive: true });
    await writeFile(path.join(projectsRoot, "bad-entry", "build-config.json"), "{broken", "utf8");

    setEnv(projectsRoot, runsRoot);
    const response = await GET(new Request("http://localhost/api/build-configs"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ configId: string; profileId: string }>;
      invalid: Array<{ configId: string; reason: string }>;
      runnerReady: boolean;
    };
    expect(body.entries.map((e) => e.configId)).toEqual(["good-entry"]);
    expect(body.entries[0]!.profileId).toBe("demo-profile");
    expect(body.invalid.map((e) => e.configId)).toEqual(["bad-entry"]);
    expect(body.invalid[0]!.reason).not.toContain(projectsRoot);
    expect(body.runnerReady).toBe(true);
  });
});
