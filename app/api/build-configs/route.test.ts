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

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";
import { STUDIO_BUILD_PROJECTS_DIR_ENV } from "@/src/modules/studio/server/build-catalog";

import { GET } from "./route";

const projectsRoot = mkdtempSync(path.join(os.tmpdir(), "det40-configs-api-"));
const runsRoot = mkdtempSync(path.join(os.tmpdir(), "det40-runs-configs-"));

const savedProjects = process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
const savedRuns = process.env[STUDIO_DET_RUNS_DIR_ENV];

afterAll(async () => {
   await rm(projectsRoot, { recursive: true, force: true });
   await rm(runsRoot, { recursive: true, force: true });
   if (savedProjects === undefined)
      delete process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
   else process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] = savedProjects;
   if (savedRuns === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedRuns;
});

function setEnv(projects: string | undefined, runs: string | undefined): void {
   if (projects === undefined)
      delete process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
   else process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] = projects;
   if (runs === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   else process.env[STUDIO_DET_RUNS_DIR_ENV] = runs;
}

describe("GET /api/build-configs", () => {
   // [58] an unset projects dir now means "repository examples only": the
   // committed catalogue is listed in place while the runner stays honestly
   // not-ready without STUDIO_DET_RUNS_DIR.
   it("lists the repository catalogue with runnerReady=false when no env is set", async () => {
      setEnv(undefined, undefined);
      const response = await GET(
         new Request("http://localhost/api/build-configs"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         entries: Array<{ configId: string; origin?: string }>;
         runnerReady: boolean;
         runnerReason?: string;
      };
      expect(
         body.entries.some(
            (e) =>
               e.configId === "slaunchpad-home-real-derived" &&
               e.origin === "repository",
         ),
      ).toBe(true);
      expect(body.runnerReady).toBe(false);
      expect(body.runnerReason).toContain("STUDIO_DET_RUNS_DIR");
   });

   // NOTE: this case must run BEFORE the successful listing test below — the
   // runner factory caches its instance on first success (single job slot).
   it("stays 200 with runnerReady=false when only the runs dir is unusable", async () => {
      setEnv(projectsRoot, "/definitely/missing/runs-9f3a");
      const response = await GET(
         new Request("http://localhost/api/build-configs"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         runnerReady: boolean;
         runnerReason?: string;
      };
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
         "utf8",
      );
      await mkdir(path.join(projectsRoot, "bad-entry"), { recursive: true });
      await writeFile(
         path.join(projectsRoot, "bad-entry", "build-config.json"),
         "{broken",
         "utf8",
      );

      setEnv(projectsRoot, runsRoot);
      const response = await GET(
         new Request("http://localhost/api/build-configs"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         entries: Array<{
            configId: string;
            profileId: string;
            origin?: string;
         }>;
         invalid: Array<{ configId: string; reason: string }>;
         runnerReady: boolean;
      };
      // the configured entry rides alongside the committed repository catalogue ([58])
      expect(body.entries.map((e) => e.configId)).toEqual([
         "good-entry",
         "slaunchpad-home-real-derived",
      ]);
      const good = body.entries.find((e) => e.configId === "good-entry")!;
      expect(good.profileId).toBe("demo-profile");
      expect(good.origin).toBe("configured");
      expect(body.invalid.map((e) => e.configId)).toEqual(["bad-entry"]);
      expect(body.invalid[0]!.reason).not.toContain(projectsRoot);
      expect(body.runnerReady).toBe(true);
   });
});
