/**
 * [65] POST /api/agent/analyses/[analysisId]/approve route tests — the full
 * approval bridge with the REAL deterministic engine.
 *
 * Failure contracts (503 / 404 / 409) run against seeded journals; the happy
 * path is the interop proof required by issue #65: a seeded terminal
 * plan-ready journal + the persisted VALID_AGENT_PLAN is materialized by the
 * deterministic materializer against a copy of the REAL committed base
 * project, and the EXISTING `det build` runs through the real single-slot
 * build runner. Assertions pin engine truth, never AI claims: exit 0, the
 * pinned source revision, and honest composition gaps
 * (COMPOSITION_SKIPS_PRESENT) in the manifest the run page renders — the
 * engine never claims 12/12 because an AI proposed sections.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/studio/server/det-run-reader-factory";
import { REPO_ROOT, requireDetCli } from "@/src/studio/server/test-helpers/det-cli";
import { VALID_AGENT_PLAN } from "@/src/studio/shared/contracts/agent-plan.test";
import { getBuildRunner } from "@/src/studio/server/build-runner";

import { POST } from "./route";

const REAL_DERIVED_DIR = path.join(REPO_ROOT, "examples", "build", "slaunchpad-home-real-derived");

let runsRoot: string;
let baseConfigPath: string;
const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];

function resetRunnerGlobals(): void {
  const g = globalThis as { __detStudioAgentRunner?: unknown; __detStudioBuildRunner?: unknown };
  g.__detStudioAgentRunner = undefined;
  g.__detStudioBuildRunner = undefined;
}

const REQUEST = { fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2", baseConfigId: "slaunchpad-home-real-derived" };

async function seedAnalysis(
  analysisId: string,
  opts: { outcome: string | null; grounded: boolean | null; plan?: unknown; request?: typeof REQUEST }
): Promise<void> {
  const journalDir = path.join(runsRoot, ".agent-jobs");
  const analysisDir = path.join(runsRoot, ".agent-analyses", analysisId);
  await mkdir(journalDir, { recursive: true });
  await mkdir(analysisDir, { recursive: true });
  await writeFile(
    path.join(journalDir, `${analysisId}.json`),
    JSON.stringify({
      journalSchemaVersion: 1,
      analysisId,
      state: "exited",
      request: opts.request ?? REQUEST,
      pid: null,
      baseConfigPath,
      allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
      claudeVersion: "2.1.322",
      command: ["claude"],
      exitCode: 0,
      signal: null,
      timedOut: false,
      cancelled: false,
      startedAt: "2026-11-11T00:00:00.000Z",
      finishedAt: "2026-11-11T00:00:30.000Z",
      stdoutTail: "",
      stderrTail: "",
      spawnError: null,
      outcome: opts.outcome,
      envelopeSafe: { isError: false, subtype: "success", sessionId: "seed", numTurns: 2, durationMs: 1000, costUsd: 0.1, permissionDenialCount: 0, hasStructuredOutput: opts.plan !== undefined },
      grounded: opts.grounded,
    }),
    "utf8"
  );
  if (opts.plan !== undefined) {
    await writeFile(path.join(analysisDir, "agent-plan.json"), JSON.stringify(opts.plan), "utf8");
  }
}

function post(analysisId: string): Promise<Response> {
  return POST(new Request(`http://localhost/api/agent/analyses/${analysisId}/approve`, { method: "POST" }), {
    params: Promise.resolve({ analysisId }),
  });
}

beforeEach(async () => {
  resetRunnerGlobals();
  runsRoot = await mkdtemp(path.join(os.tmpdir(), "det65-approve-"));
  process.env[STUDIO_DET_RUNS_DIR_ENV] = runsRoot;
  const baseDir = path.join(runsRoot, "base-project");
  await cp(REAL_DERIVED_DIR, baseDir, { recursive: true });
  baseConfigPath = path.join(baseDir, "build-config.json");
});

afterEach(async () => {
  resetRunnerGlobals();
  await rm(runsRoot, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
  else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
});

describe("POST /api/agent/analyses/[analysisId]/approve", () => {
  it("503s when the runs root is not configured", async () => {
    delete process.env[STUDIO_DET_RUNS_DIR_ENV];
    const response = await post("agent-700000");
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not-configured");
  });

  it("404s an unknown analysis id", async () => {
    const response = await post("agent-700001");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("analysis-not-found");
  });

  it("409s a non-approvable outcome (plan-ungrounded)", async () => {
    await seedAnalysis("agent-700002", { outcome: "plan-ungrounded", grounded: false, plan: VALID_AGENT_PLAN });
    const response = await post("agent-700002");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("analysis-not-approvable");
  });

  it("409s when the journal says plan-ready but the plan cannot load", async () => {
    await seedAnalysis("agent-700003", { outcome: "plan-ready", grounded: false });
    const response = await post("agent-700003");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("analysis-not-approvable");
  });

  it("409s when NO proposal survives the pinned-source check", async () => {
    const plan = structuredClone(VALID_AGENT_PLAN);
    plan.sections[0].projection = [{ sourceNodeId: "777:1", role: "heading", reason: "nothing pinned" }];
    await seedAnalysis("agent-700004", { outcome: "plan-ready", grounded: true, plan });
    const response = await post("agent-700004");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no-pinned-assignments");
  });

  it(
    "materializes the approved inputs and runs the REAL det build to engine truth",
    { timeout: 60_000 },
    async () => {
      requireDetCli();
      await seedAnalysis("agent-700005", { outcome: "plan-ready", grounded: true, plan: VALID_AGENT_PLAN });
      const response = await post("agent-700005");
      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        buildRunId: string;
        state: string;
        approval: { pinnedAssignments: number; totalProposedAssignments: number; droppedNodeIds: string[]; derivedFrom: string };
      };
      expect(body.buildRunId).toMatch(/^build-[0-9]+$/);
      expect(["queued", "running"]).toContain(body.state);
      // Approval record: 2 pinned assignments, nothing dropped.
      expect(body.approval).toMatchObject({
        derivedFrom: "agent-plan",
        totalProposedAssignments: 2,
        pinnedAssignments: 2,
        droppedNodeIds: [],
      });

      // Poll the REAL build runner until terminal — the same single-slot
      // runner and snapshot the ordinary /runs view serves.
      const runner = await getBuildRunner();
      const deadline = Date.now() + 55_000;
      type JobShape = { state: string; exitCode: number | null; manifestSummary: { gaps: Array<{ code: string }>; revisionId: string } | null };
      let job: JobShape | null = null;
      for (;;) {
        const snap = (await runner.snapshot(body.buildRunId)) as JobShape | null;
        expect(snap).not.toBeNull();
        if (snap === null) throw new Error("build snapshot lost");
        job = snap;
        if (["exited", "timeout", "spawn-failed", "interrupted"].includes(job.state)) break;
        if (Date.now() > deadline) throw new Error("build did not reach a terminal state in time");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(job!.state).toBe("exited");
      expect(job!.exitCode).toBe(0);

      // Engine truth, read from the bundle on disk: pinned revision + honest
      // partial coverage. The composer composes what its table supports and
      // REPORTS the rest — it never claims 12/12 because an AI proposed it.
      const manifest = JSON.parse(
        await readFile(path.join(runsRoot, body.buildRunId, "build-manifest.json"), "utf8")
      ) as { source: { revisionId: string }; gaps: Array<{ code: string; count?: number }> };
      expect(manifest.source.revisionId).toBe("2417494580183108397");
      const codes = manifest.gaps.map((gap) => gap.code);
      expect(codes).toContain("COMPOSITION_SKIPS_PRESENT");
      expect(codes).not.toContain("COMPOSITION_COMPLETE");
      const summary = job!.manifestSummary!;
      expect(summary.revisionId).toBe("2417494580183108397");
      expect(summary.gaps.map((gap) => gap.code)).toContain("COMPOSITION_SKIPS_PRESENT");

      // The approved copy exists under the analysis dot-dir with the approval
      // record; the base project itself is untouched.
      const record = JSON.parse(
        await readFile(
          path.join(runsRoot, ".agent-analyses", "agent-700005", "approved", "approval.json"),
          "utf8"
        )
      ) as { analysisId: string; pinnedAssignments: number };
      expect(record).toMatchObject({ analysisId: "agent-700005", pinnedAssignments: 2 });
      const baseProjection = await readFile(path.join(runsRoot, "base-project", "semantic-projection.json"), "utf8");
      expect(baseProjection).toContain('"sourceLocator": "design://figma-home-desktop/254:43"'); // base manual assignment intact
    }
  );

  it("C65-3: refuses approval of a plan requested from a DIFFERENT Figma file (422, nothing built)", async () => {
    // The echo-guard passes because the JOURNAL request and the plan agree —
    // they just both name a different file than the base's verified binding.
    const foreignRequest = { fileKey: "OtherFileKey1", nodeId: "245:2", baseConfigId: "slaunchpad-home-real-derived" };
    const foreignPlan = { ...VALID_AGENT_PLAN, requested: { fileKey: "OtherFileKey1", nodeId: "245:2" } };
    await seedAnalysis("agent-700006", { outcome: "plan-ready", grounded: true, plan: foreignPlan, request: foreignRequest });
    const response = await post("agent-700006");
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("base-source-mismatch");
    expect(body.error.message).toContain("không khớp");
    // Nothing was materialized or built: no approved workspace, no build run.
    await expect(
      readFile(path.join(runsRoot, ".agent-analyses", "agent-700006", "approved", "approval.json"), "utf8")
    ).rejects.toThrow();
    const buildDirExists = await readFile(path.join(runsRoot, "build-1794450000000", "build-manifest.json"), "utf8").then(
      () => true,
      () => false
    );
    expect(buildDirExists).toBe(false);
  });

  it("C65-3: refuses approval when the base copy has no source-identity binding (422)", async () => {
    const { unlink } = await import("node:fs/promises");
    // The seeded base project copy usually carries the committed binding;
    // strip it to prove the fail-closed path for an unbound base.
    await unlink(path.join(runsRoot, "base-project", "source-identity.json"));
    await seedAnalysis("agent-700007", { outcome: "plan-ready", grounded: true, plan: VALID_AGENT_PLAN });
    const response = await post("agent-700007");
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("base-source-mismatch");
    expect(body.error.message).toContain("chưa gắn nguồn Figma đã xác minh");
  });
});
