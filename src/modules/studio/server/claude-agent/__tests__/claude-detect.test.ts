/**
 * [65] Claude Code + Figma MCP preflight tests.
 *
 * Detection is scripted through the spawnImpl seam — every failure class the
 * issue requires (missing CLI, unparseable version, not authenticated, MCP
 * not listed, MCP listed-but-not-connected, unparseable list, timeout) is a
 * deterministic fixture here; NO live claude process runs in tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

/** The kill signal type straight from ChildProcess — no version-sensitive alias. */
type KillSignal = Parameters<ChildProcess["kill"]>[0];

vi.mock("server-only", () => ({}));

import {
   detectClaudeAgentStatus,
   figmaAllowedToolName,
   findFigmaServer,
   parseAuthStatus,
   parseClaudeVersion,
   parseMcpList,
} from "../claude-detect";

let cwd: string;

beforeEach(async () => {
   cwd = await mkdtemp(path.join(os.tmpdir(), "det65-detect-"));
});

afterEach(async () => {
   await rm(cwd, { recursive: true, force: true });
});

describe("parsers", () => {
   it("parses the observed claude --version output", () => {
      expect(parseClaudeVersion("2.1.322 (Claude Code)\n")).toBe("2.1.322");
      expect(parseClaudeVersion("not a version")).toBeNull();
   });

   it("parses the observed claude auth status JSON", () => {
      const parsed = parseAuthStatus(
         '{"loggedIn": true, "authMethod": "oauth_token", "apiProvider": "firstParty"}\n',
      );
      expect(parsed).toEqual({ loggedIn: true, authMethod: "oauth_token" });
      expect(parseAuthStatus('{"loggedIn": false}')).toEqual({
         loggedIn: false,
         authMethod: null,
      });
      expect(parseAuthStatus("not json")).toBeNull();
      expect(parseAuthStatus('{"user": "x"}')).toBeNull();
   });

   it("parses the observed claude mcp list lines", () => {
      const entries = parseMcpList(
         [
            "Checking MCP server health…",
            "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected",
            "slaunchpad: php /home/example/n98-magerun2.phar mcp:server:start - ✔ Connected",
            "broken: https://example.invalid/mcp (HTTP) - ✘ Failed to connect",
         ].join("\n"),
      );
      expect(entries).not.toBeNull();
      expect(entries!.map((e) => e.serverName)).toEqual([
         "plugin:figma:figma",
         "slaunchpad",
         "broken",
      ]);
      expect(entries![0].connected).toBe(true);
      expect(entries![2].connected).toBe(false);
      expect(findFigmaServer(entries!)?.serverName).toBe("plugin:figma:figma");
   });

   it("rejects an unparseable mcp list", () => {
      expect(parseMcpList("garbage output")).toBeNull();
      expect(parseMcpList("")).toEqual([]);
   });

   it("derives the MCP tool name with Claude Code's naming rule", () => {
      expect(figmaAllowedToolName("plugin:figma:figma")).toBe(
         "mcp__plugin_figma_figma__get_metadata",
      );
      expect(figmaAllowedToolName("figma")).toBe("mcp__figma__get_metadata");
   });
});

interface ScriptedOutput {
   stdout: string;
   code: number;
   delayMs?: number;
}

/**
 * spawnImpl that matches the child argv (which subcommand runs) to a scripted
 * result; unmatched argvs spawn a missing binary (ENOENT-equivalent via a
 * thrown error, exactly how a missing `claude` reaches the runner).
 */
function scriptedSpawn(script: Record<string, ScriptedOutput>): typeof spawn {
   return ((command: string, args: readonly string[], options: object) => {
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
         // Synchronous spawn failure path (ENOENT shape).
         const err = Object.assign(new Error(`spawn ${command} ENOENT`), {
            code: "ENOENT",
         });
         queueMicrotask(() => child.emit("error", err));
         return child;
      }
      queueMicrotask(() => {
         child.stdout?.emit("data", Buffer.from(outcome.stdout));
         setTimeout(
            () => child.emit("close", outcome.code, null),
            outcome.delayMs ?? 5,
         );
      });
      void options;
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

describe("detectClaudeAgentStatus", () => {
   it("reports ready + the derived allowed tool in the all-good environment", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn(OK_SCRIPT),
         cwd,
      });
      expect(status.ready).toBe(true);
      expect(status.claudeCode).toMatchObject({
         ready: true,
         version: "2.1.322",
         reasonCode: "ok",
      });
      expect(status.figmaMcp).toMatchObject({
         ready: true,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "ok",
      });
      expect(status.allowedFigmaTool).toBe(
         "mcp__plugin_figma_figma__get_metadata",
      );
   });

   it("blocks on a missing CLI (spawn failure)", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({}),
         cwd,
      });
      expect(status.ready).toBe(false);
      expect(status.claudeCode).toMatchObject({
         ready: false,
         version: null,
         reasonCode: "not-installed",
      });
   });

   it("blocks on an unparseable version", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            version: { stdout: "weird", code: 0 },
         }),
         cwd,
      });
      expect(status.claudeCode.reasonCode).toBe("version-unparseable");
   });

   it("blocks on an unauthenticated session", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            auth: { stdout: '{"loggedIn": false}\n', code: 0 },
         }),
         cwd,
      });
      expect(status.claudeCode).toMatchObject({
         ready: false,
         reasonCode: "not-authenticated",
      });
      expect(status.ready).toBe(false);
   });

   it("blocks on an unparseable auth status", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            auth: { stdout: "login required\n", code: 1 },
         }),
         cwd,
      });
      expect(status.claudeCode.reasonCode).toBe("auth-status-unparseable");
   });

   it("blocks when no Figma MCP is listed", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            mcp: { stdout: "slaunchpad: php /path - ✔ Connected\n", code: 0 },
         }),
         cwd,
      });
      expect(status.figmaMcp).toMatchObject({
         ready: false,
         listed: false,
         reasonCode: "mcp-not-listed",
      });
      expect(status.allowedFigmaTool).toBeNull();
      expect(status.ready).toBe(false);
   });

   it("blocks when the Figma MCP is listed but not connected", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            mcp: {
               stdout:
                  "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✘ Failed to connect\n",
               code: 0,
            },
         }),
         cwd,
      });
      expect(status.figmaMcp).toMatchObject({
         ready: false,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "mcp-not-connected",
      });
   });

   it("blocks on an unparseable mcp list", async () => {
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            mcp: { stdout: "??? ??? ???\n", code: 0 },
         }),
         cwd,
      });
      expect(status.figmaMcp.reasonCode).toBe("mcp-list-unparseable");
   });

   it("blocks on an mcp list that times out", async () => {
      // Fake child with pid + kill — the detector's timer must SIGTERM it and
      // the close(null, SIGTERM) must classify as a timeout, never a hang.
      const child = new EventEmitter() as unknown as ChildProcess & {
         pid: number;
         kill: (signal?: KillSignal) => boolean;
      };
      child.pid = 424242;
      child.stdout = new EventEmitter() as unknown as ChildProcess["stdout"];
      child.stderr = new EventEmitter() as unknown as ChildProcess["stderr"];
      child.kill = (signal?: KillSignal) => {
         queueMicrotask(() => child.emit("close", null, signal ?? "SIGTERM"));
         return true;
      };
      const spawnImpl = ((command: string, args: readonly string[]) => {
         if (args[0] !== "mcp")
            return scriptedSpawn(OK_SCRIPT)(command, args, {});
         // Never closes on its own — only kill() does.
         return child as unknown as ChildProcess;
      }) as unknown as typeof spawn;
      const status = await detectClaudeAgentStatus({
         spawnImpl,
         cwd,
         timeouts: { mcpMs: 60 },
      });
      expect(status.figmaMcp.reasonCode).toBe("mcp-list-unparseable");
      expect(status.ready).toBe(false);
   });

   it("parses the LIVE mcp list shape through the real runBounded pipeline", async () => {
      // Regression: runBounded's control-char sanitizer used to strip \n as
      // well, fusing the "Checking MCP server health…" progress line into the
      // server entries — the progress-skip filter then dropped EVERYTHING and
      // a fully connected environment reported mcp-not-listed (found live in
      // the [65] operator E2E). The fixture is the byte-exact live shape,
      // multiline, WITH the progress line, THROUGH runBounded (scripted spawn).
      const status = await detectClaudeAgentStatus({
         spawnImpl: scriptedSpawn({
            ...OK_SCRIPT,
            mcp: {
               stdout:
                  "Checking MCP server health…\n\n" +
                  "plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected\n" +
                  "slaunchpad: php /home/example/n98-magerun2.phar mcp:server:start - ✔ Connected\n" +
                  "magento-spec: php /home/example/n98-magerun2.phar mcp:server:start --skip-core-commands - ✔ Connected\n",
               code: 0,
            },
         }),
         cwd,
      });
      expect(status.figmaMcp).toMatchObject({
         ready: true,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "ok",
      });
      expect(status.allowedFigmaTool).toBe(
         "mcp__plugin_figma_figma__get_metadata",
      );
      expect(status.ready).toBe(true);
      // C65-4: every CONNECTED server name is surfaced so the runner can deny
      // each non-Figma server at the toolset level. Only connected entries —
      // a failed server has no tools to deny.
      expect(status.connectedServerNames.sort()).toEqual([
         "magento-spec",
         "plugin:figma:figma",
         "slaunchpad",
      ]);
   });
});
