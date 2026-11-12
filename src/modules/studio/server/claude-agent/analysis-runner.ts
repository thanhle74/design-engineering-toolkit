/**
 * [65] DET Studio — local Claude Code analysis runner (server-only).
 *
 * Spawns the INSTALLED Claude Code CLI in controlled non-interactive mode
 * (`claude -p`) with the flag stack verified against CLI 2.1.322 + official
 * docs:
 *
 *   --output-format json --json-schema <draft-7 plan schema>
 *   --permission-prompts none        → anything that would prompt is denied
 *   --allowedTools  <mcp__<figma>__get_metadata>  → the ONLY pre-approved tool
 *   --disallowedTools <built-ins>,mcp__<other-servers> → belt-and-braces deny
 *   --tools ""                       → the ENTIRE built-in tool set is
 *                                      removed from the session (C65-4,
 *                                      verified live on 2.1.322: plugin MCP
 *                                      tools remain available; the Read
 *                                      probe reported the tool as absent)
 *   --max-budget-usd <cap>           → hard spend ceiling
 *   --no-session-persistence         → no resumable transcript left behind
 *   --append-system-prompt <read-only guardrails>
 *
 * (--restricted is deliberately NOT used: verified live, it removes plugin
 * MCP tools from the session entirely, which would break the Figma MCP
 * requirement. C65-4 enforcement is REAL toolset restriction, not prompt
 * text: `--tools ""` empties the built-in set, and every connected NON-Figma
 * MCP server from the same preflight `claude mcp list` is denied by name
 * (`mcp__<server>`), verified live to remove those tools from the session's
 * toolset. The child also runs with `shell: false` in a fresh per-run
 * directory with no project settings.)
 *
 * Honesty contract, mirroring the build runner: one in-process slot (409 on
 * busy), SIGTERM timeout, bounded stdout/stderr tails, spawn errors are
 * runner errors (never a fake analysis), the child's raw output is NEVER
 * trusted as truth — the structured plan is parsed from the envelope,
 * re-validated against the zod contract, echo-checked against the request,
 * and only then persisted under `<runsRoot>/.agent-analyses/<id>/`. A
 * pending journal under `<runsRoot>/.agent-jobs/<id>.json` survives
 * restarts; a stale `running` journal with a dead pid reads `interrupted`.
 * Cancellation is an explicit user action (SIGTERM → `cancelled`), and the
 * raw provider envelope is never persisted — only the safe subset.
 */
import "server-only";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AgentPlanSchema,
  assertAgentPlanInvariants,
  type AgentAnalysisRequest,
  type AgentAnalysisSnapshot,
  type AgentOutcome,
  type AgentPlan,
  type AgentRunState,
  type ClaudeEnvelopeSafeView,
} from "@/src/modules/studio/shared/contracts";

import { agentPlanJsonSchemaString } from "@/src/modules/studio/shared/contracts/agent-plan";

import { RUN_ID_PATTERN } from "../artifact-access";
import { AgentWorkflowError } from "./agent-errors";
import { detectClaudeAgentStatus, resolveClaudeEntry } from "./claude-detect";
import { buildAgentSystemPrompt, buildAgentTaskPrompt } from "./agent-prompt";

export const STUDIO_AGENT_TIMEOUT_MS_ENV = "STUDIO_AGENT_TIMEOUT_MS";
export const STUDIO_AGENT_MAX_BUDGET_USD_ENV = "STUDIO_AGENT_MAX_BUDGET_USD";

/**
 * C65-4: 15 minutes. The live 12-section analysis over remote MCP took
 * ~407s; the previous 300s default honestly timed out that exact known
 * case. `STUDIO_AGENT_TIMEOUT_MS` overrides (min 1000).
 */
export const DEFAULT_AGENT_TIMEOUT_MS = 900_000;
const DEFAULT_TIMEOUT_MS = DEFAULT_AGENT_TIMEOUT_MS;
const MIN_TIMEOUT_MS = 1_000;
const DEFAULT_BUDGET_USD = "2";
const STDOUT_TAIL_BYTES = 8 * 1024;
const STDERR_TAIL_BYTES = 8 * 1024;
/**
 * C65-2: the COMPLETE stdout retention cap for envelope parsing (json format
 * = one document). This buffer is NEVER trimmed for parsing — the earlier
 * single-buffer design trimmed the parse stream to the 8 KiB diagnostic
 * tail, so any valid envelope arriving in multiple chunks (>8 KiB total) was
 * parsed from a head-truncated buffer and misclassified `envelope-invalid`
 * (a single-chunk delivery happened to pass — the live 40 KB+ plan ran on
 * luck of chunking, exactly the Coordinator's C65-2 finding).
 */
const STDOUT_PARSE_CAP_BYTES = 1024 * 1024;
const JOURNAL_DIR = ".agent-jobs";
const ANALYSIS_DIR = ".agent-analyses";
/**
 * Belt-and-braces deny list on top of `--tools ""` (which already removes
 * the built-in set) — and, at spawn time, extended with `mcp__<server>`
 * entries for every connected NON-Figma MCP server found by preflight.
 */
const DISALLOWED_TOOLS = "Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch";

export const ANALYSIS_ID_PATTERN = /^agent-\d+$/;

export interface AgentAnalysisResult {
  snapshot: AgentAnalysisSnapshot;
  /** Present only for plan-ready / plan-ungrounded outcomes. */
  plan: AgentPlan | null;
}

/** Thrown when an analysis is requested while the single slot is busy (→ 409). */
export class AgentBusyError extends Error {
  readonly active: AgentAnalysisSnapshot;
  constructor(active: AgentAnalysisSnapshot) {
    super("An analysis is already running; the agent runner executes one analysis at a time.");
    this.name = "AgentBusyError";
    this.active = active;
  }
}

interface JournalRecord extends AgentAnalysisSnapshot {
  journalSchemaVersion: 1;
}

interface ActiveJob {
  snapshot: AgentAnalysisSnapshot;
  child: ReturnType<typeof spawn> | null;
  timer: NodeJS.Timeout | null;
  terminalHandled: boolean;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseTimeoutMs(): number {
  const raw = process.env[STUDIO_AGENT_TIMEOUT_MS_ENV];
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= MIN_TIMEOUT_MS ? parsed : DEFAULT_TIMEOUT_MS;
}

function parseBudgetUsd(): string {
  const raw = process.env[STUDIO_AGENT_MAX_BUDGET_USD_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_BUDGET_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : DEFAULT_BUDGET_USD;
}

function sanitizeSpawnError(error: NodeJS.ErrnoException): string {
  // Only the errno code surfaces — never the full message (it can embed paths).
  return `claude CLI could not be spawned (${error.code ?? "unknown error"}).`;
}

export class AgentAnalysisRunner {
  private readonly runsRoot: string;
  private readonly spawnImpl: typeof spawn;
  private active: ActiveJob | null = null;
  /** Strict journal-write ordering — same C2 discipline as the build runner. */
  private journalQueue: Promise<unknown> = Promise.resolve();

  private constructor(runsRoot: string, spawnImpl: typeof spawn) {
    this.runsRoot = runsRoot;
    this.spawnImpl = spawnImpl;
  }

  static async open(
    configuredRunsRoot: string,
    opts: { spawnImpl?: typeof spawn } = {}
  ): Promise<AgentAnalysisRunner> {
    if (typeof configuredRunsRoot !== "string" || configuredRunsRoot.trim() === "") {
      throw new AgentWorkflowError(
        "not-configured",
        "The AI workflow requires STUDIO_DET_RUNS_DIR to point at a DET output root directory."
      );
    }
    let resolved: string;
    try {
      resolved = await realpath(configuredRunsRoot);
    } catch {
      throw new AgentWorkflowError(
        "not-configured",
        "The AI workflow requires STUDIO_DET_RUNS_DIR to point at a readable directory."
      );
    }
    const info = await stat(resolved).catch(() => null);
    if (info === null || !info.isDirectory()) {
      throw new AgentWorkflowError(
        "not-configured",
        "The AI workflow requires STUDIO_DET_RUNS_DIR to point at a directory."
      );
    }
    return new AgentAnalysisRunner(resolved, opts.spawnImpl ?? spawn);
  }

  /* ------------------------------ journal ----------------------------- */

  private journalPath(analysisId: string): string {
    return path.join(this.runsRoot, JOURNAL_DIR, `${analysisId}.json`);
  }

  private analysisDir(analysisId: string): string {
    return path.join(this.runsRoot, ANALYSIS_DIR, analysisId);
  }

  private async writeJournal(snapshot: AgentAnalysisSnapshot): Promise<void> {
    const journalDir = path.join(this.runsRoot, JOURNAL_DIR);
    await mkdir(journalDir, { recursive: true });
    const record: JournalRecord = { journalSchemaVersion: 1, ...snapshot };
    const tmp = path.join(journalDir, `.${snapshot.analysisId}.${randomBytes(4).toString("hex")}.tmp`);
    await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
    await rename(tmp, this.journalPath(snapshot.analysisId));
  }

  private queueJournal(snapshot: AgentAnalysisSnapshot): Promise<void> {
    const next = this.journalQueue.then(() => this.writeJournal(snapshot));
    this.journalQueue = next.catch(() => undefined);
    return next;
  }

  private async readJournal(analysisId: string): Promise<AgentAnalysisSnapshot | null> {
    if (typeof analysisId !== "string" || !ANALYSIS_ID_PATTERN.test(analysisId)) return null;
    let raw: string;
    try {
      raw = await readFile(this.journalPath(analysisId), "utf8");
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    return reviveJournal(parsed as Partial<JournalRecord>);
  }

  /* ------------------------------ status ------------------------------ */

  activeSnapshot(): AgentAnalysisSnapshot | null {
    return this.active === null ? null : { ...this.active.snapshot };
  }

  async snapshot(analysisId: string): Promise<AgentAnalysisSnapshot | null> {
    const live = this.activeSnapshot();
    if (live !== null && live.analysisId === analysisId) return live;
    const journal = await this.readJournal(analysisId);
    if (journal === null) return null;
    if (journal.state === "running" && journal.pid !== null && !pidAlive(journal.pid)) {
      return { ...journal, state: "interrupted" };
    }
    return journal;
  }

  /** The persisted, re-validated plan for a terminal analysis (or null). */
  async result(analysisId: string): Promise<AgentAnalysisResult | null> {
    const snap = await this.snapshot(analysisId);
    if (snap === null) return null;
    const plan = await this.readPlan(analysisId, snap.request);
    return { snapshot: snap, plan };
  }

  private async readPlan(analysisId: string, request: AgentAnalysisRequest): Promise<AgentPlan | null> {
    let raw: string;
    try {
      raw = await readFile(path.join(this.analysisDir(analysisId), "agent-plan.json"), "utf8");
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsedPlan = AgentPlanSchema.safeParse(parsed);
    if (!parsedPlan.success) return null;
    try {
      assertAgentPlanInvariants(parsedPlan.data, request);
    } catch {
      return null;
    }
    return parsedPlan.data;
  }

  /* ------------------------------ cancel ------------------------------ */

  /**
   * User cancellation: SIGTERM the live child. The close handler records the
   * `cancelled` state (unless a timeout already won the race). Returns the
   * live snapshot, or null when no live analysis matches the id.
   */
  cancel(analysisId: string): AgentAnalysisSnapshot | null {
    const active = this.active;
    if (active === null || active.snapshot.analysisId !== analysisId) return null;
    active.snapshot.cancelled = true;
    active.child?.kill("SIGTERM");
    return { ...active.snapshot };
  }

  /* ------------------------------- start ------------------------------ */

  /**
   * Start one analysis. Throws AgentBusyError when the single slot is taken
   * and AgentWorkflowError("not-configured") when preflight fails — the
   * authoritative recheck happens HERE, immediately before the spawn (a
   * cached UI status is never authorization).
   *
   * C65-1: the slot is reserved SYNCHRONOUSLY, before the first await — the
   * earlier shape checked `active` synchronously but only assigned it after
   * the (awaited) preflight, so two overlapping starts both passed the check
   * and both paid for a child. With the synchronous reservation, the second
   * start sees the placeholder and gets an honest 409; the placeholder
   * snapshot is filled in as preflight resolves, and EVERY failure path
   * releases the reservation.
   */
  async start(request: AgentAnalysisRequest, baseConfigPath: string): Promise<AgentAnalysisSnapshot> {
    const busy = this.activeSnapshot();
    if (busy !== null) throw new AgentBusyError(busy);

    // Synchronous reservation — nothing is awaited between the busy check
    // and this assignment.
    const snapshot: AgentAnalysisSnapshot = {
      analysisId: `agent-${Date.now()}`,
      state: "queued",
      request,
      baseConfigPath,
      allowedFigmaTool: "",
      claudeVersion: null,
      command: [],
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      pid: null,
      stdoutTail: "",
      stderrTail: "",
      spawnError: null,
      outcome: null,
      envelopeSafe: null,
      grounded: null,
    };
    const activeJob: ActiveJob = { snapshot, child: null, timer: null, terminalHandled: false };
    this.active = activeJob;

    try {
      const preflight = await detectClaudeAgentStatus({ spawnImpl: this.spawnImpl });
      if (!preflight.ready || preflight.allowedFigmaTool === null) {
        throw new AgentWorkflowError(
          "agent-not-ready",
          "Claude Code + Figma MCP preflight failed; the AI workflow stays blocked."
        );
      }
      snapshot.allowedFigmaTool = preflight.allowedFigmaTool;
      snapshot.claudeVersion = preflight.claudeCode.version;
      await this.finalizeAnalysisId(snapshot);
      // A cancellation that landed while the start was still at preflight
      // (the placeholder is visible to cancel() as soon as the slot is
      // reserved) must abort the start — never spawn a child the operator
      // already asked to stop. Journal the honest terminal state, release,
      // and refuse.
      if (snapshot.cancelled) {
        snapshot.state = "cancelled";
        snapshot.finishedAt = new Date().toISOString();
        await this.queueJournal(snapshot).catch(() => {});
        throw new AgentWorkflowError(
          "analysis-cancelled",
          "The analysis was cancelled while it was starting; nothing was spawned."
        );
      }
      // C65-4: deny every connected NON-Figma MCP server by name so its
      // tools are absent from the child's toolset (verified live on 2.1.322
      // that a server-level `mcp__<name>` deny removes the whole server).
      const figmaToolPrefix = preflight.allowedFigmaTool.split("__").slice(0, 2).join("__");
      const otherServerDenies = preflight.connectedServerNames
        .map((serverName) => `mcp__${serverName.replace(/[^A-Za-z0-9_]/g, "_")}`)
        .filter((denyEntry) => denyEntry !== figmaToolPrefix);
      const disallowedTools = [DISALLOWED_TOOLS, ...otherServerDenies].join(",");

      const taskPrompt = buildAgentTaskPrompt({ fileKey: request.fileKey, nodeId: request.nodeId });
      const systemPrompt = buildAgentSystemPrompt(snapshot.allowedFigmaTool);
      snapshot.command = [
        resolveClaudeEntry(),
        "-p",
        taskPrompt,
        "--output-format",
        "json",
        "--json-schema",
        agentPlanJsonSchemaString(),
        "--permission-prompts",
        "none",
        "--allowedTools",
        snapshot.allowedFigmaTool,
        "--disallowedTools",
        disallowedTools,
        // C65-4: remove the ENTIRE built-in tool set from the session.
        // Plugin MCP tools are unaffected (live-verified: with `--tools ""`
        // the Figma get_metadata call still succeeded while the Read probe
        // reported "The Read tool does not exist in this session"). Placed
        // after the prompt so the variadic flag cannot swallow it.
        "--tools",
        "",
        "--max-budget-usd",
        parseBudgetUsd(),
        "--no-session-persistence",
        "--append-system-prompt",
        systemPrompt,
      ];
      // The child runs in a fresh per-run directory: no project settings, no
      // hooks, no repo files in tool reach; user-level MCP/plugins/auth load
      // exactly as `claude mcp list` reported them.
      const runDir = path.join(this.analysisDir(snapshot.analysisId), "cwd");
      await mkdir(runDir, { recursive: true });
      // Pre-spawn journal write: if the journal is unwritable, refuse to
      // start (truthful) instead of running an unjournaled analysis.
      await this.queueJournal(snapshot);

      let child: ReturnType<typeof spawn>;
      try {
        child = this.spawnImpl(snapshot.command[0], snapshot.command.slice(1), {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: runDir,
        });
      } catch (error) {
        snapshot.state = "spawn-failed";
        snapshot.spawnError = sanitizeSpawnError(error as NodeJS.ErrnoException);
        snapshot.finishedAt = new Date().toISOString();
        await this.queueJournal(snapshot).catch(() => {});
        throw new AgentWorkflowError("not-configured", snapshot.spawnError ?? "claude CLI could not be spawned.");
      }
      activeJob.child = child;

      // C2: attach ALL listeners now — before any await below.
      // C65-2: TWO independent buffers. `parseChunks` keeps the COMPLETE
      // stream up to STDOUT_PARSE_CAP_BYTES and is never trimmed — it is the
      // only input to envelope classification. `stdoutTailChunks` is the
      // bounded 8 KiB diagnostic tail for the journal, trimmed exactly as
      // before.
      const parseChunks: Buffer[] = [];
      const stdoutTailChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutTruncated = false;
      let stdoutBytes = 0;
      child.stdout?.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += bytes.byteLength;
        if (stdoutBytes <= STDOUT_PARSE_CAP_BYTES) {
          parseChunks.push(bytes);
        } else {
          stdoutTruncated = true;
        }
        stdoutTailChunks.push(bytes);
        trimTail(stdoutTailChunks, STDOUT_TAIL_BYTES);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
        trimTail(stderrChunks, STDERR_TAIL_BYTES);
      });

      const timeoutMs = parseTimeoutMs();
      activeJob.timer = setTimeout(() => {
        snapshot.timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      const finishTerminal = (): void => {
        if (activeJob.terminalHandled) return;
        activeJob.terminalHandled = true;
        if (activeJob.timer !== null) clearTimeout(activeJob.timer);
        snapshot.finishedAt = new Date().toISOString();
        snapshot.stdoutTail = buffersToText(stdoutTailChunks);
        snapshot.stderrTail = buffersToText(stderrChunks);
        void (async () => {
          try {
            // Terminal classification BEFORE the terminal state is declared:
            // once `state` reads terminal, the plan file (if any) is already
            // on disk — a poller can never see "exited" without its plan.
            let classified: EnvelopeClassification | null = null;
            const processState =
              snapshot.timedOut
                ? "timeout"
                : snapshot.cancelled
                  ? "cancelled"
                  : snapshot.exitCode === null && snapshot.signal === null
                    ? "spawn-failed"
                    : "exited";
            if (processState === "exited") {
              // C65-2: classify from the COMPLETE parse buffer, never the
              // trimmed diagnostic tail.
              classified = classifyEnvelope(
                Buffer.concat(parseChunks).toString("utf8"),
                stdoutTruncated,
                snapshot.request
              );
              if (classified.plan !== null) {
                await this.persistPlan(snapshot.analysisId, classified.plan);
              }
            }
            snapshot.outcome = classified?.outcome ?? null;
            snapshot.envelopeSafe = classified?.envelopeSafe ?? null;
            snapshot.grounded = classified?.grounded ?? null;
            snapshot.state = processState;
          } finally {
            await this.queueJournal(snapshot).catch(() => {});
          }
        })()
          .catch(() => {})
          .finally(() => {
            if (this.active === activeJob) this.active = null;
          });
      };

      child.on("error", (error: NodeJS.ErrnoException) => {
        if (activeJob.terminalHandled) return;
        snapshot.state = "spawn-failed";
        snapshot.spawnError = sanitizeSpawnError(error);
        snapshot.exitCode = null;
        snapshot.signal = null;
        finishTerminal();
      });

      child.on("close", (code, signal) => {
        if (activeJob.terminalHandled) return;
        snapshot.exitCode = typeof code === "number" ? code : null;
        snapshot.signal = typeof signal === "string" ? signal : null;
        finishTerminal();
      });

      snapshot.pid = child.pid ?? null;
      snapshot.state = "running";
      await this.queueJournal(snapshot).catch(() => {});

      return { ...snapshot };
    } catch (error) {
      // C1: release the reservation on every failed initialization path —
      // never out from under a live child (its terminal event owns release).
      if (activeJob.child === null && this.active === activeJob) {
        this.active = null;
      }
      throw error;
    }
  }

  private async persistPlan(analysisId: string, plan: AgentPlan): Promise<void> {
    const dir = this.analysisDir(analysisId);
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.agent-plan.${randomBytes(4).toString("hex")}.tmp`);
    await writeFile(tmp, JSON.stringify(plan, null, 2), "utf8");
    await rename(tmp, path.join(dir, "agent-plan.json"));
  }

  /** Collision-bumped id, finalized while the slot is held (nothing written yet). */
  private async finalizeAnalysisId(snapshot: AgentAnalysisSnapshot): Promise<void> {
    const provisional = Number.parseInt(snapshot.analysisId.slice("agent-".length), 10);
    let ms = Number.isFinite(provisional) ? provisional : Date.now();
    for (;;) {
      const analysisId = `agent-${ms}`;
      if (!ANALYSIS_ID_PATTERN.test(analysisId) || !RUN_ID_PATTERN.test(analysisId)) {
        ms += 1;
        continue;
      }
      const journal = await stat(this.journalPath(analysisId)).catch(() => null);
      const dir = await stat(this.analysisDir(analysisId)).catch(() => null);
      if (journal === null && dir === null) {
        snapshot.analysisId = analysisId;
        return;
      }
      ms += 1;
    }
  }
}

/* --------------------------- classification ---------------------------- */

interface EnvelopeClassification {
  outcome: AgentOutcome;
  envelopeSafe: ClaudeEnvelopeSafeView | null;
  grounded: boolean | null;
  plan: AgentPlan | null;
}

/**
 * Parse + classify the raw `claude --output-format json` stdout. The raw
 * envelope never leaves this function: only the safe subset view, the
 * validated plan and the derived outcome do.
 */
export function classifyEnvelope(
  rawStdout: string,
  stdoutTruncated: boolean,
  request: AgentAnalysisRequest
): EnvelopeClassification {
  if (stdoutTruncated) {
    return { outcome: "stdout-truncated", envelopeSafe: null, grounded: null, plan: null };
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(rawStdout);
  } catch {
    return { outcome: "envelope-invalid", envelopeSafe: null, grounded: null, plan: null };
  }
  if (typeof envelope !== "object" || envelope === null) {
    return { outcome: "envelope-invalid", envelopeSafe: null, grounded: null, plan: null };
  }
  const record = envelope as Record<string, unknown>;
  const envelopeSafe: ClaudeEnvelopeSafeView = {
    subtype: typeof record.subtype === "string" ? record.subtype : null,
    isError: record.is_error === true,
    sessionId: typeof record.session_id === "string" ? record.session_id : null,
    numTurns: typeof record.num_turns === "number" ? record.num_turns : null,
    durationMs: typeof record.duration_ms === "number" ? record.duration_ms : null,
    totalCostUsd: typeof record.total_cost_usd === "number" ? record.total_cost_usd : null,
    permissionDenialCount: Array.isArray(record.permission_denials) ? record.permission_denials.length : 0,
    hasStructuredOutput: record.structured_output !== undefined && record.structured_output !== null,
  };
  if (envelopeSafe.isError || (envelopeSafe.subtype !== null && envelopeSafe.subtype.startsWith("error"))) {
    return { outcome: "claude-error", envelopeSafe, grounded: null, plan: null };
  }
  if (!envelopeSafe.hasStructuredOutput) {
    return { outcome: "output-missing", envelopeSafe, grounded: null, plan: null };
  }
  const parsedPlan = AgentPlanSchema.safeParse(record.structured_output);
  if (!parsedPlan.success) {
    return { outcome: "schema-failed", envelopeSafe, grounded: null, plan: null };
  }
  try {
    assertAgentPlanInvariants(parsedPlan.data, request);
  } catch {
    return { outcome: "schema-failed", envelopeSafe, grounded: null, plan: null };
  }
  if (!parsedPlan.data.observed.grounded) {
    return { outcome: "plan-ungrounded", envelopeSafe, grounded: false, plan: parsedPlan.data };
  }
  return { outcome: "plan-ready", envelopeSafe, grounded: true, plan: parsedPlan.data };
}

/* ------------------------------- helpers ------------------------------- */

function reviveJournal(record: Partial<JournalRecord>): AgentAnalysisSnapshot | null {
  if (typeof record.analysisId !== "string" || !ANALYSIS_ID_PATTERN.test(record.analysisId)) return null;
  const request = (record.request ?? {}) as Partial<AgentAnalysisRequest>;
  return {
    analysisId: record.analysisId,
    state: (typeof record.state === "string" ? record.state : "interrupted") as AgentRunState,
    request: {
      fileKey: typeof request.fileKey === "string" ? request.fileKey : "",
      nodeId: typeof request.nodeId === "string" ? request.nodeId : "",
      baseConfigId: typeof request.baseConfigId === "string" ? request.baseConfigId : "",
    },
    baseConfigPath: typeof record.baseConfigPath === "string" ? record.baseConfigPath : null,
    allowedFigmaTool: typeof record.allowedFigmaTool === "string" ? record.allowedFigmaTool : "",
    claudeVersion: typeof record.claudeVersion === "string" ? record.claudeVersion : null,
    command: Array.isArray(record.command) ? record.command.filter((c): c is string => typeof c === "string") : [],
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    signal: typeof record.signal === "string" ? record.signal : null,
    timedOut: record.timedOut === true,
    cancelled: record.cancelled === true,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    finishedAt: typeof record.finishedAt === "string" ? record.finishedAt : null,
    pid: typeof record.pid === "number" ? record.pid : null,
    stdoutTail: typeof record.stdoutTail === "string" ? record.stdoutTail : "",
    stderrTail: typeof record.stderrTail === "string" ? record.stderrTail : "",
    spawnError: typeof record.spawnError === "string" ? record.spawnError : null,
    outcome: (typeof record.outcome === "string" ? record.outcome : null) as AgentOutcome | null,
    envelopeSafe: (record.envelopeSafe ?? null) as ClaudeEnvelopeSafeView | null,
    grounded: typeof record.grounded === "boolean" ? record.grounded : null,
  };
}

function trimTail(chunks: Buffer[], capBytes: number): void {
  let total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  while (total > capBytes && chunks.length > 1) {
    const removed = chunks.shift()!;
    total -= removed.byteLength;
  }
}

function buffersToText(chunks: Buffer[]): string {
  const text = Buffer.concat(chunks).toString("utf8");
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(-STDERR_TAIL_BYTES);
}

/* ------------------------------- factory ------------------------------- */

const globalForRunner = globalThis as { __detStudioAgentRunner?: Promise<AgentAnalysisRunner> };

/** The ONE process-wide analysis runner (single slot stays honest across reloads). */
export async function getAgentAnalysisRunner(): Promise<AgentAnalysisRunner> {
  if (globalForRunner.__detStudioAgentRunner === undefined) {
    globalForRunner.__detStudioAgentRunner = (async () => {
      const configuredRoot = process.env.STUDIO_DET_RUNS_DIR;
      if (configuredRoot === undefined) {
        throw new AgentWorkflowError(
          "not-configured",
          "The AI workflow requires STUDIO_DET_RUNS_DIR (analyses journal + persist there)."
        );
      }
      return AgentAnalysisRunner.open(configuredRoot);
    })().catch((error) => {
      globalForRunner.__detStudioAgentRunner = undefined;
      throw error;
    });
  }
  return globalForRunner.__detStudioAgentRunner;
}
