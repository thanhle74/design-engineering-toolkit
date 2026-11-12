/**
 * [40] /api/builds route tests — direct handler invocation.
 *
 * NOTE ON ORDER: the runner factory caches its instance process-wide on first
 * success, so the unconfigured-503 cases MUST run before any configured case
 * creates the cached runner (see build-runner.ts getBuildRunner). The busy
 * mapping is unit-tested separately (api-error.test.ts) since the route uses
 * the real single-slot runner without the test spawn seam.
 *
 * [70] The environment readiness gate is MOCKED (hermetic — no child
 * processes): default ready so the existing real-build proof keeps running,
 * plus gate-ORDER cases (400 before the gate, 503 environment-not-ready with
 * checks after it).
 */
import {
   afterAll,
   beforeAll,
   beforeEach,
   describe,
   expect,
   it,
   vi,
} from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

const assertReadyMock = vi.fn();
vi.mock(
   "@/src/modules/studio/server/environment/index",
   async (importOriginal) => {
      const actual =
         await importOriginal<
            typeof import("@/src/modules/studio/server/environment/index")
         >();
      return {
         ...actual,
         assertStudioEnvironmentReady: (...args: unknown[]) =>
            assertReadyMock(...args),
      };
   },
);

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";
import { STUDIO_BUILD_PROJECTS_DIR_ENV } from "@/src/modules/studio/server/build-catalog";
import { STUDIO_BUILD_TIMEOUT_MS_ENV } from "@/src/modules/studio/server/build-runner";
import {
   exampleBuildConfigBody,
   requireDetCli,
} from "@/src/modules/studio/server/test-helpers/det-cli";
import { StudioEnvironmentError } from "@/src/modules/studio/server/environment/index";
import { type StudioReadinessChecks } from "@/src/modules/studio/shared/contracts/build-flow";

import { GET, POST } from "./route";
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";

const READY_CHECKS: StudioReadinessChecks = {
   claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
   figmaMcp: {
      ready: true,
      listed: true,
      serverName: "plugin:figma:figma",
      reasonCode: "ok",
   },
   detRunsDir: {
      ready: true,
      reasonCode: "ok",
      envName: "STUDIO_DET_RUNS_DIR",
   },
};

const BROKEN_CHECKS: StudioReadinessChecks = {
   claudeCode: { ready: false, version: null, reasonCode: "not-installed" },
   figmaMcp: {
      ready: false,
      listed: false,
      serverName: null,
      reasonCode: "mcp-not-listed",
   },
   detRunsDir: {
      ready: false,
      reasonCode: "not-configured",
      envName: "STUDIO_DET_RUNS_DIR",
   },
};

let runsRoot: string;
let projectsRoot: string;
const savedEnv: Record<string, string | undefined> = {
   [STUDIO_DET_RUNS_DIR_ENV]: process.env[STUDIO_DET_RUNS_DIR_ENV],
   [STUDIO_BUILD_PROJECTS_DIR_ENV]: process.env[STUDIO_BUILD_PROJECTS_DIR_ENV],
   [STUDIO_BUILD_TIMEOUT_MS_ENV]: process.env[STUDIO_BUILD_TIMEOUT_MS_ENV],
};

beforeAll(async () => {
   runsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-runs-api-"));
   projectsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-projects-api-"));
   delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   delete process.env[STUDIO_BUILD_PROJECTS_DIR_ENV];
});

afterAll(async () => {
   await rm(runsRoot, { recursive: true, force: true });
   await rm(projectsRoot, { recursive: true, force: true });
   for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
   }
});

// [70] Gate default: ready — every pre-existing case keeps its old behavior.
beforeEach(() => {
   assertReadyMock.mockReset();
   assertReadyMock.mockResolvedValue(READY_CHECKS);
});

async function configureEnv(): Promise<void> {
   process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
   process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] = projectsRoot;
   const entryDir = path.join(projectsRoot, "fail-fast");
   await mkdir(entryDir, { recursive: true });
   const config = JSON.parse(exampleBuildConfigBody()) as Record<
      string,
      unknown
   >;
   config.profile = path.join(projectsRoot, "missing-profile.json");
   await writeFile(
      path.join(entryDir, "build-config.json"),
      JSON.stringify(config),
      "utf8",
   );
}

function post(body: unknown): Request {
   return new Request("http://localhost/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
   });
}

describe("GET /api/builds", () => {
   it("maps an unconfigured runs dir to 503 without leaking the env value", async () => {
      process.env[STUDIO_DET_RUNS_DIR_ENV] = "/definitely/missing/runs-9f3a";
      const response = await GET(new Request("http://localhost/api/builds"));
      expect(response.status).toBe(503);
      const body = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(body.error.code).toBe("not-configured");
      expect(body.error.message).not.toContain("/definitely/missing/runs-9f3a");
      delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   });
});

describe("POST /api/builds — [70] environment gate order", () => {
   it("rejects a bad body with 400 BEFORE consulting the gate (even broken)", async () => {
      assertReadyMock.mockImplementation(async () => {
         throw new StudioEnvironmentError(BROKEN_CHECKS);
      });
      const response = await POST(post({}));
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("bad-request");
      // The gate sits AFTER validation: never consulted for a 400.
      expect(assertReadyMock).not.toHaveBeenCalled();
   });

   it("fails closed 503 environment-not-ready with checks BEFORE any business logic", async () => {
      assertReadyMock.mockImplementation(async () => {
         throw new StudioEnvironmentError(BROKEN_CHECKS);
      });
      const response = await POST(post({ configId: "no-such-entry" }));
      expect(response.status).toBe(503);
      const body = (await response.json()) as {
         error: { code: string; message: string };
         checks: StudioReadinessChecks;
      };
      expect(body.error.code).toBe("environment-not-ready");
      // 503 wins over the catalog 404: the gate runs first for a well-formed
      // body — no work is accepted while the environment is broken.
      expect(body.checks).toEqual(BROKEN_CHECKS);
      expect(body.checks.detRunsDir.envName).toBe("STUDIO_DET_RUNS_DIR");
   });

   it("maps a non-environment gate crash to the 500 internal-error envelope", async () => {
      assertReadyMock.mockRejectedValue(new Error("boom"));
      const response = await POST(post({ configId: "no-such-entry" }));
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("internal-error");
   });
});

describe("POST /api/builds", () => {
   // [58] with no env at all the canonical repository catalogue still answers:
   // an unknown id is a catalog-scoped 404, never a fake build start.
   it("resolves through the repository catalogue when no env is set (unknown id → 404)", async () => {
      const response = await POST(post({ configId: "whatever" }));
      expect(response.status).toBe(404);
      const body = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(body.error.code).toBe("run-not-found");
      expect(body.error.message).toMatch(/build-config entry/i);
   });

   it("starts a build through the mocked-ready gate (gate consulted exactly once)", async () => {
      await configureEnv();
      const response = await POST(post({ configId: "no-such-entry" }));
      // Catalog still answers 404 for an unknown id AFTER the ready gate ran.
      expect(response.status).toBe(404);
      expect(assertReadyMock).toHaveBeenCalledTimes(1);
   });

   it("rejects a malformed body with 400", async () => {
      await configureEnv();
      const response = await POST(
         new Request("http://localhost/api/builds", {
            method: "POST",
            body: "{not json",
         }),
      );
      expect(response.status).toBe(400);
      const noId = await POST(post({}));
      expect(noId.status).toBe(400);
   });

   it("404s an unknown configId (run-not-found, catalog-scoped message)", async () => {
      const response = await POST(post({ configId: "no-such-entry" }));
      expect(response.status).toBe(404);
      const body = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(body.error.code).toBe("run-not-found");
      expect(body.error.message).toMatch(/build-config entry/i);
   });

   it(
      "starts a real build and reports its truthful terminal state (exit 2, no bundle)",
      { timeout: 30_000 },
      async () => {
         requireDetCli();
         const response = await POST(post({ configId: "fail-fast" }));
         expect(response.status).toBe(202);
         const { runId, state } = (await response.json()) as {
            runId: string;
            state: string;
         };
         expect(runId).toMatch(/^build-[0-9]+$/);
         expect(["queued", "running"]).toContain(state);

         // poll the runner snapshot — the same source the sibling [runId] route
         // serves — until terminal (fast-failing build: missing profile → exit 2).
         type JobShape = {
            state: string;
            exitCode: number | null;
            manifestSummary: unknown;
            stdoutTail: string;
         };
         const runner = await getBuildRunner();
         const deadline = Date.now() + 30_000;
         let job: JobShape | null = null;
         for (;;) {
            const snap = await runner.snapshot(runId);
            expect(snap).not.toBeNull();
            job = snap as JobShape;
            if (
               ["exited", "timeout", "spawn-failed", "interrupted"].includes(
                  job.state,
               )
            )
               break;
            if (Date.now() > deadline)
               throw new Error("build did not reach a terminal state in time");
            await new Promise((resolve) => setTimeout(resolve, 200));
         }
         expect(job!.state).toBe("exited");
         expect(job!.exitCode).toBe(2);
         expect(job!.manifestSummary).toBeNull();
         expect(job!.stdoutTail.length).toBeGreaterThan(0);

         // the slot is free again once the terminal state is journaled
         const status = await GET(new Request("http://localhost/api/builds"));
         const statusBody = (await status.json()) as {
            active: { runId: string } | null;
         };
         expect(statusBody.active).toBeNull();
      },
   );
});
