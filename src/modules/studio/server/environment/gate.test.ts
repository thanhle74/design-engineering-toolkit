/**
 * [70] Environment readiness gate tests — gate internals, fully HERMETIC.
 *
 * `checkDetRunsDir` is exercised through real env manipulation + tmp fixtures
 * (set/unset STUDIO_DET_RUNS_DIR, a real directory, a real file, a missing
 * path); the Claude Code / Figma MCP side runs through the gate's
 * `spawnImpl` seam with a scripted spawn — the same discipline as
 * claude-detect.test.ts — so NO real `claude` process ever runs here. The
 * merge/ready aggregation is asserted through `getStudioReadiness` (the real
 * [65] detection pipeline) and through the pure `mergeChecks` combinator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChildProcess, spawn } from "node:child_process";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";

import {
   StudioEnvironmentError,
   assertStudioEnvironmentReady,
   checkDetRunsDir,
   environmentNotReadyResponse,
   getStudioReadiness,
   mergeChecks,
} from "./gate";

const ENV_NAME = STUDIO_DET_RUNS_DIR_ENV; // "STUDIO_DET_RUNS_DIR"

let tmpRoot: string;
const savedEnvValue = process.env[ENV_NAME];

beforeEach(async () => {
   tmpRoot = await mkdtemp(path.join(os.tmpdir(), "det70-gate-"));
   delete process.env[ENV_NAME];
});

afterEach(async () => {
   await rm(tmpRoot, { recursive: true, force: true });
   if (savedEnvValue === undefined) delete process.env[ENV_NAME];
   else process.env[ENV_NAME] = savedEnvValue;
});

/* ------------------------- scripted spawn seam ------------------------- */

interface ScriptedOutput {
   stdout: string;
   code: number;
}

/**
 * spawnImpl that matches the child argv (which subcommand runs) to a scripted
 * result; unmatched argvs spawn a missing binary (ENOENT shape). Mirrors the
 * claude-detect.test.ts fixture so the gate exercises the REAL detection
 * pipeline without any live process.
 */
function scriptedSpawn(script: Record<string, ScriptedOutput>): typeof spawn {
   return ((command: string, args: readonly string[]) => {
      const key =
         args[0] === "--version"
            ? "version"
            : args[0] === "auth"
              ? "auth"
              : args[0] === "mcp"
                ? "mcp"
                : "other";
      const outcome = script[key];
      const child = new EventEmitter() as unknown as ChildProcess & {
         pid: number;
      };
      child.pid = 424242;
      child.stdout = new EventEmitter() as unknown as ChildProcess["stdout"];
      child.stderr = new EventEmitter() as unknown as ChildProcess["stderr"];
      if (outcome === undefined) {
         const err = Object.assign(new Error(`spawn ${command} ENOENT`), {
            code: "ENOENT",
         });
         queueMicrotask(() => child.emit("error", err));
         return child;
      }
      queueMicrotask(() => {
         child.stdout?.emit("data", Buffer.from(outcome.stdout));
         child.emit("close", outcome.code, null);
      });
      return child;
   }) as unknown as typeof spawn;
}

const OK_SCRIPT: Record<string, ScriptedOutput> = {
   version: { stdout: "2.1.322 (Claude Code)\n", code: 0 },
   auth: {
      stdout: '{"loggedIn": true, "authMethod": "oauth_token"}\n',
      code: 0,
   },
   mcp: {
      stdout:
         "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected\n",
      code: 0,
   },
};

/* ---------------------------- detRunsDir ------------------------------- */

describe("checkDetRunsDir (env manipulation + tmp fixtures)", () => {
   it("reports not-configured when the env is unset", async () => {
      delete process.env[ENV_NAME];
      expect(await checkDetRunsDir()).toEqual({
         ready: false,
         reasonCode: "not-configured",
         envName: ENV_NAME,
      });
   });

   it("reports not-configured for a blank/whitespace value", async () => {
      process.env[ENV_NAME] = "   ";
      expect((await checkDetRunsDir()).reasonCode).toBe("not-configured");
      process.env[ENV_NAME] = "";
      expect((await checkDetRunsDir()).reasonCode).toBe("not-configured");
   });

   it("reports not-a-directory for a missing path (no env value leaks)", async () => {
      const missing = path.join(tmpRoot, "definitely-missing-9f3a");
      process.env[ENV_NAME] = missing;
      const check = await checkDetRunsDir();
      expect(check.ready).toBe(false);
      expect(check.reasonCode).toBe("not-a-directory");
      expect(check.envName).toBe(ENV_NAME);
      // The env NAME is the only trace — the VALUE never reaches the result.
      expect(JSON.stringify(check)).not.toContain(missing);
      expect(JSON.stringify(check)).not.toContain("definitely-missing-9f3a");
   });

   it("reports not-a-directory when the env points at a regular file", async () => {
      const filePath = path.join(tmpRoot, "a-file.txt");
      await writeFile(filePath, "x", "utf8");
      process.env[ENV_NAME] = filePath;
      expect((await checkDetRunsDir()).reasonCode).toBe("not-a-directory");
   });

   it("reports ok for an existing directory", async () => {
      const dir = path.join(tmpRoot, "runs");
      await mkdir(dir, { recursive: true });
      process.env[ENV_NAME] = dir;
      expect(await checkDetRunsDir()).toEqual({
         ready: true,
         reasonCode: "ok",
         envName: ENV_NAME,
      });
   });
});

/* ----------------------------- mergeChecks ----------------------------- */

describe("mergeChecks (pure aggregation shape)", () => {
   it("flattens the [65] preflight next to the detRunsDir check verbatim", () => {
      const checks = mergeChecks(
         {
            claudeCode: {
               ready: true,
               version: "2.1.322",
               reasonCode: "ok",
            },
            figmaMcp: {
               ready: false,
               listed: true,
               serverName: "plugin:figma:figma",
               reasonCode: "mcp-not-connected",
            },
            ready: false,
            allowedFigmaTool: null,
            connectedServerNames: [],
         },
         { ready: true, reasonCode: "ok", envName: ENV_NAME },
      );
      expect(checks).toEqual({
         claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
         figmaMcp: {
            ready: false,
            listed: true,
            serverName: "plugin:figma:figma",
            reasonCode: "mcp-not-connected",
         },
         detRunsDir: { ready: true, reasonCode: "ok", envName: ENV_NAME },
      });
      // Extra preflight fields never leak into the frozen contract shape.
      expect(Object.keys(checks).sort()).toEqual([
         "claudeCode",
         "detRunsDir",
         "figmaMcp",
      ]);
   });
});

/* -------------------------- getStudioReadiness ------------------------- */

describe("getStudioReadiness (spawnImpl seam, no live processes)", () => {
   it("aggregates ready=true only when EVERY check passes", async () => {
      const dir = path.join(tmpRoot, "runs");
      await mkdir(dir, { recursive: true });
      process.env[ENV_NAME] = dir;
      const status = await getStudioReadiness({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
      });
      expect(status.ready).toBe(true);
      expect(status.checks.claudeCode).toEqual({
         ready: true,
         version: "2.1.322",
         reasonCode: "ok",
      });
      expect(status.checks.figmaMcp).toEqual({
         ready: true,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "ok",
      });
      expect(status.checks.detRunsDir).toEqual({
         ready: true,
         reasonCode: "ok",
         envName: ENV_NAME,
      });
   });

   it("stays ready:false when only detRunsDir fails (claude+mcp fine)", async () => {
      process.env[ENV_NAME] = path.join(tmpRoot, "missing-runs");
      const status = await getStudioReadiness({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
      });
      expect(status.ready).toBe(false);
      expect(status.checks.claudeCode.ready).toBe(true);
      expect(status.checks.figmaMcp.ready).toBe(true);
      expect(status.checks.detRunsDir).toEqual({
         ready: false,
         reasonCode: "not-a-directory",
         envName: ENV_NAME,
      });
   });

   it("stays ready:false when the claude CLI is missing (dir fine)", async () => {
      const dir = path.join(tmpRoot, "runs");
      await mkdir(dir, { recursive: true });
      process.env[ENV_NAME] = dir;
      const status = await getStudioReadiness({
         spawnImpl: scriptedSpawn({}), // every argv → ENOENT
      });
      expect(status.ready).toBe(false);
      expect(status.checks.claudeCode).toEqual({
         ready: false,
         version: null,
         reasonCode: "not-installed",
      });
      expect(status.checks.figmaMcp.reasonCode).toBe("mcp-list-unparseable");
      expect(status.checks.detRunsDir.ready).toBe(true);
   });

   it("stays ready:false when Figma MCP is listed but not connected", async () => {
      const dir = path.join(tmpRoot, "runs");
      await mkdir(dir, { recursive: true });
      process.env[ENV_NAME] = dir;
      const status = await getStudioReadiness({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            mcp: {
               stdout:
                  "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✘ Failed to connect\n",
               code: 0,
            },
         }),
      });
      expect(status.ready).toBe(false);
      expect(status.checks.figmaMcp).toEqual({
         ready: false,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "mcp-not-connected",
      });
   });
});

/* ----------------------- assert + error envelope ----------------------- */

describe("assertStudioEnvironmentReady", () => {
   it("resolves with the checks when everything is ready", async () => {
      const dir = path.join(tmpRoot, "runs");
      await mkdir(dir, { recursive: true });
      process.env[ENV_NAME] = dir;
      const checks = await assertStudioEnvironmentReady({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
      });
      expect(checks.claudeCode.ready).toBe(true);
      expect(checks.figmaMcp.ready).toBe(true);
      expect(checks.detRunsDir.ready).toBe(true);
   });

   it("throws StudioEnvironmentError carrying the per-check truth (name-only env)", async () => {
      const secretValue = path.join(tmpRoot, "secret-runs-value");
      process.env[ENV_NAME] = secretValue;
      const error = await assertStudioEnvironmentReady({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StudioEnvironmentError);
      const envError = error as StudioEnvironmentError;
      expect(envError.code).toBe("environment-not-ready");
      expect(envError.checks.detRunsDir.reasonCode).toBe("not-a-directory");
      // Operator-facing Vietnamese message; machine tokens verbatim; the env
      // VALUE never appears (the NAME does).
      expect(envError.message).toContain("chưa sẵn sàng");
      expect(envError.message).toContain(ENV_NAME);
      expect(envError.message).not.toContain(secretValue);
      expect(envError.message).not.toContain("secret-runs-value");
   });
});

describe("environmentNotReadyResponse", () => {
   it("maps the error to the canonical 503 envelope with checks", async () => {
      // NOT ready: runs dir missing (claude+mcp themselves fine).
      process.env[ENV_NAME] = path.join(tmpRoot, "missing-runs");
      const error = (await assertStudioEnvironmentReady({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
      }).catch((e: unknown) => e)) as StudioEnvironmentError;
      expect(error).toBeInstanceOf(StudioEnvironmentError);
      const response = environmentNotReadyResponse(error);
      expect(response.status).toBe(503);
      const body = (await response.json()) as {
         error: { code: string; message: string };
         checks: {
            claudeCode: { ready: boolean };
            figmaMcp: { ready: boolean };
            detRunsDir: { ready: boolean; envName: string };
         };
      };
      expect(body.error.code).toBe("environment-not-ready");
      expect(body.error.message).toBe(error.message);
      expect(body.checks.claudeCode.ready).toBe(true);
      expect(body.checks.figmaMcp.ready).toBe(true);
      expect(body.checks.detRunsDir).toMatchObject({
         ready: false,
         envName: ENV_NAME,
      });
   });
});
