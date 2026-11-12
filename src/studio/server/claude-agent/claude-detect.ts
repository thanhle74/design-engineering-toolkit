/**
 * [65] Claude Code + Figma MCP runtime preflight — server-only.
 *
 * The Owner product decision (issue #65): the machine running DET Studio
 * MUST already have a working authenticated `claude` CLI with a connected,
 * callable Figma MCP configured in that Claude Code environment. Studio has
 * NO provider/model UI, no second credential store, no install/login flow:
 * when preflight fails, the Figma AI workflow is BLOCKED with an honest
 * reason code — the UI renders the Vietnamese instruction, never a fake
 * success, never a demo fallback.
 *
 * Detection stages (each a bounded, shell-less child process in the SAME
 * Claude environment Studio inherits):
 *  1. `claude --version`     → installed + parseable version
 *  2. `claude auth status`   → authenticated session (JSON: loggedIn)
 *  3. `claude mcp list`      → a Figma MCP server registered AND health-
 *     connected. This alone is registration truth, NOT reachability proof —
 *     reachability is only ever proven by a bounded read-only call inside a
 *     real analysis run (the plan's `observed.grounded` flag), exactly as
 *     the issue requires.
 *
 * The spawned argv is the single source of the allowed tool name: Claude Code
 * names MCP tools `mcp__<server>__<tool>` with non-alphanumerics of the
 * server name mapped to `_` (verified live: plugin server `plugin:figma:figma`
 * → tool `mcp__plugin_figma_figma__get_metadata`). Everything here is
 * verified against the INSTALLED CLI's own flags/help + official docs — no
 * invented flags.
 */
import "server-only";

import { spawn } from "node:child_process";

export const STUDIO_CLAUDE_CLI_ENV = "STUDIO_CLAUDE_CLI";

/** Bounded child output cap — these are tiny diagnostics, never payloads. */
const DETECT_TAIL_BYTES = 64 * 1024;
const VERSION_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 15_000;
/** `claude mcp list` health-checks servers (network) — the generous one. */
const MCP_LIST_TIMEOUT_MS = 90_000;

export type ClaudeCodeReasonCode =
  | "ok"
  | "not-installed"
  | "version-unparseable"
  | "not-authenticated"
  | "auth-status-unparseable";

export type FigmaMcpReasonCode =
  | "ok"
  | "mcp-list-unparseable"
  | "mcp-not-listed"
  | "mcp-not-connected";

export interface ClaudeAgentStatus {
  claudeCode: {
    ready: boolean;
    version: string | null;
    reasonCode: ClaudeCodeReasonCode;
  };
  figmaMcp: {
    ready: boolean;
    listed: boolean;
    /** The discovered MCP server name, e.g. `plugin:figma:figma` (verbatim). */
    serverName: string | null;
    reasonCode: FigmaMcpReasonCode;
  };
}

export interface ClaudeAgentPreflight extends ClaudeAgentStatus {
  /** Ready = claude installed+authenticated AND figma MCP listed+connected. */
  ready: boolean;
  /**
   * The allowedTools argv value derived from the discovered server name —
   * the exact read-only Figma MCP metadata tool the analysis agent may call.
   * Null when the server is not ready.
   */
  allowedFigmaTool: string | null;
  /**
   * C65-4: every CONNECTED MCP server name from the same `claude mcp list`
   * (may include non-Figma servers). The runner denies each of them at the
   * toolset level (`--disallowedTools mcp__<server>`) except the Figma one,
   * so no other server's tools are available to the analysis child.
   */
  connectedServerNames: string[];
}

interface BoundedResult {
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  spawnFailed: boolean;
  stdoutTail: string;
  stderrTail: string;
}

/**
 * One bounded, shell-less child run with SIGTERM timeout and output caps —
 * the same discipline as the build runner, applied to detection.
 */
async function runBounded(
  spawnImpl: typeof spawn,
  command: string[],
  cwd: string,
  timeoutMs: number
): Promise<BoundedResult> {
  return new Promise<BoundedResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let child: ReturnType<typeof spawn>;
    const finish = (spawnFailed: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({
        code: null,
        signal: null,
        timedOut,
        spawnFailed,
        stdoutTail: buffersToText(stdoutChunks),
        stderrTail: buffersToText(stderrChunks),
      });
    };
    try {
      child = spawnImpl(command[0], command.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"], cwd });
    } catch {
      finish(true);
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      trimTail(stdoutChunks, DETECT_TAIL_BYTES);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      trimTail(stderrChunks, DETECT_TAIL_BYTES);
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(true);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      settled = true;
      resolve({
        code: typeof code === "number" ? code : null,
        signal: typeof signal === "string" ? signal : null,
        timedOut,
        spawnFailed: false,
        stdoutTail: buffersToText(stdoutChunks),
        stderrTail: buffersToText(stderrChunks),
      });
    });
  });
}

export function resolveClaudeEntry(): string {
  const configured = process.env[STUDIO_CLAUDE_CLI_ENV];
  const raw = configured === undefined || configured.trim() === "" ? "claude" : configured.trim();
  return raw;
}

const VERSION_PATTERN = /(\d+\.\d+\.\d+)/;

/**
 * Resolve `claude --version` output (observed shape: `2.1.322 (Claude Code)`)
 * without trusting anything beyond the semver-looking token.
 */
export function parseClaudeVersion(stdout: string): string | null {
  const match = VERSION_PATTERN.exec(stdout);
  return match === null ? null : match[1];
}

export interface AuthStatusView {
  loggedIn: boolean;
  authMethod: string | null;
}

export function parseAuthStatus(stdout: string): AuthStatusView | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.loggedIn !== "boolean") return null;
  return {
    loggedIn: record.loggedIn,
    authMethod: typeof record.authMethod === "string" ? record.authMethod : null,
  };
}

export interface McpListEntry {
  serverName: string;
  connected: boolean;
}

/**
 * Parse `claude mcp list` lines of the observed shape
 * `plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected` /
 * `slaunchpad: php /path/to/cmd args - ✔ Connected`.
 * The server name is everything before the FIRST `": "` (colon+space) —
 * server names may themselves contain colons; targets (urls/commands) do not
 * contain colon-space before their first space-delimited token boundary.
 */
export function parseMcpList(stdout: string): McpListEntry[] | null {
  const entries: McpListEntry[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    // Skip the CLI's own progress line, if present.
    if (/^checking mcp server health/i.test(line)) continue;
    const sep = line.indexOf(": ");
    if (sep <= 0) return null; // unexpected shape → unparseable list
    const serverName = line.slice(0, sep).trim();
    const rest = line.slice(sep + 2);
    if (serverName === "" || rest === "") return null;
    const connected = /connected\s*$/i.test(rest) && !/not\s+connected/i.test(rest);
    entries.push({ serverName, connected });
  }
  return entries;
}

/** The Figma MCP server entry: name containing `figma`, case-insensitive. */
export function findFigmaServer(entries: McpListEntry[]): McpListEntry | null {
  return entries.find((entry) => entry.serverName.toLowerCase().includes("figma")) ?? null;
}

/** Claude Code MCP tool naming: non-alphanumerics of the server name → `_`. */
export function figmaAllowedToolName(serverName: string): string {
  const sanitized = serverName.replace(/[^A-Za-z0-9_]/g, "_");
  return `mcp__${sanitized}__get_metadata`;
}

/**
 * Run the full preflight. Never throws — every failure is a reason code.
 * `cwd` is the server's own cwd (detection inherits the same environment the
 * analysis agent will run in).
 */
export async function detectClaudeAgentStatus(
  opts: {
    spawnImpl?: typeof spawn;
    cwd?: string;
    /** Test seam ONLY — production uses the documented defaults. */
    timeouts?: { versionMs?: number; authMs?: number; mcpMs?: number };
  } = {}
): Promise<ClaudeAgentPreflight> {
  const spawnImpl = opts.spawnImpl ?? spawn;
  const cwd = opts.cwd ?? process.cwd();
  const entry = resolveClaudeEntry();

  const version = await runBounded(
    spawnImpl,
    [entry, "--version"],
    cwd,
    opts.timeouts?.versionMs ?? VERSION_TIMEOUT_MS
  );
  let claudeCode: ClaudeAgentStatus["claudeCode"];
  if (version.spawnFailed || version.timedOut || version.code !== 0) {
    claudeCode = { ready: false, version: null, reasonCode: "not-installed" };
  } else {
    const parsedVersion = parseClaudeVersion(version.stdoutTail);
    claudeCode =
      parsedVersion === null
        ? { ready: false, version: null, reasonCode: "version-unparseable" }
        : { ready: true, version: parsedVersion, reasonCode: "ok" };
  }

  let authView: AuthStatusView | null = null;
  if (claudeCode.ready) {
    const auth = await runBounded(
      spawnImpl,
      [entry, "auth", "status"],
      cwd,
      opts.timeouts?.authMs ?? AUTH_TIMEOUT_MS
    );
    authView =
      auth.spawnFailed || auth.timedOut || auth.code !== 0 ? null : parseAuthStatus(auth.stdoutTail);
    if (authView === null) {
      claudeCode = { ready: false, version: claudeCode.version, reasonCode: "auth-status-unparseable" };
    } else if (!authView.loggedIn) {
      claudeCode = { ready: false, version: claudeCode.version, reasonCode: "not-authenticated" };
    }
  }

  let figmaMcp: ClaudeAgentStatus["figmaMcp"] = {
    ready: false,
    listed: false,
    serverName: null,
    reasonCode: "mcp-not-listed",
  };
  let allowedFigmaTool: string | null = null;
  // C65-4 deny-list input: names of every CONNECTED server (figma or not).
  let connectedServerNames: string[] = [];
  // MCP listing is meaningful regardless of auth state (registration is env
  // truth); still list it so the UI can pinpoint WHICH part is missing.
  const list = await runBounded(
    spawnImpl,
    [entry, "mcp", "list"],
    cwd,
    opts.timeouts?.mcpMs ?? MCP_LIST_TIMEOUT_MS
  );
  const entries = list.spawnFailed || list.timedOut || list.code !== 0 ? null : parseMcpList(list.stdoutTail);
  if (entries === null) {
    figmaMcp = { ready: false, listed: false, serverName: null, reasonCode: "mcp-list-unparseable" };
  } else {
    connectedServerNames = entries.filter((entry) => entry.connected).map((entry) => entry.serverName);
    const server = findFigmaServer(entries);
    if (server === null) {
      figmaMcp = { ready: false, listed: false, serverName: null, reasonCode: "mcp-not-listed" };
    } else if (!server.connected) {
      figmaMcp = { ready: false, listed: true, serverName: server.serverName, reasonCode: "mcp-not-connected" };
    } else {
      figmaMcp = { ready: true, listed: true, serverName: server.serverName, reasonCode: "ok" };
      allowedFigmaTool = figmaAllowedToolName(server.serverName);
    }
  }

  return {
    claudeCode,
    figmaMcp,
    ready: claudeCode.ready && figmaMcp.ready,
    allowedFigmaTool,
    connectedServerNames,
  };
}

/* ------------------------------- helpers ------------------------------- */

function trimTail(chunks: Buffer[], capBytes: number): void {
  let total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  while (total > capBytes && chunks.length > 1) {
    const removed = chunks.shift()!;
    total -= removed.byteLength;
  }
}

function buffersToText(chunks: Buffer[]): string {
  const text = Buffer.concat(chunks).toString("utf8");
  // Strip control characters but PRESERVE line structure (\n, \r, \t):
  // `claude mcp list` output is parsed line-by-line, and collapsing newlines
  // would fuse the progress line into the server entries (live bug found in
  // the [65] operator E2E: every entry then starts with the health-line
  // prefix and the progress-skip filter dropped the whole output). Tails are
  // never rendered raw by the status surface, so LF/CR here are harmless.
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .slice(-DETECT_TAIL_BYTES);
}
