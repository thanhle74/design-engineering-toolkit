/**
 * [76] Deterministic plan reuse for the build-flow ai-analysis stage.
 *
 * Problem (2026-11-16 E2E loop, issue #76): `runAiAnalysis` spawns a FRESH
 * `claude -p` agent on EVERY build-flow run. Three independent analyses of the
 * SAME pinned source produced materially different plans (objective fidelity
 * 38/43, 29/43, 35/43 — lost second hero, lost newsletter button, duplicated
 * lookbook images, each round differently), so build-flow output is not
 * reproducible run-to-run.
 *
 * Design: a SIDE-CAR reuse index under `<runsRoot>/.agent-analyses/plan-reuse-index.json`
 * maps an analysis-input cache key → the analysis id whose persisted plan may
 * be reused. The journal schema (frozen v1) is untouched; the index is
 * additive metadata. On a matching hit the orchestrator re-reads the plan via
 * the runner's own re-validation path (`result()` re-parses
 * `agent-plan.json` against the zod contract + invariants) — a corrupt or
 * tampered plan fails validation and the flow falls through to a fresh
 * analysis. Nothing is ever trusted from the index alone.
 *
 * Cache key: `baseConfigId|fileKey|nodeId|providerRevisionId`. Reuse is
 * FAIL-CLOSED: with `providerRevisionId === null` (an unpinned source) there
 * is no revision anchor, so reuse is refused and every run analyzes fresh —
 * same doctrine as verify-source's refusal to guess a source.
 *
 * Honesty note: the analysis child reads LIVE Figma metadata, while the pin
 * records the operator-declared revision. If the live file drifts from the
 * pin, a FRESH analysis is equally incoherent (it grounds proposals into the
 * pinned old-revision tree at mapping time). Reuse is therefore not weaker —
 * it is strictly more deterministic, and always coherent with the committed
 * snapshot the rest of the pipeline consumes.
 *
 * Operator override: `STUDIO_AGENT_PLAN_REUSE=off` (or `false`/`0`) forces a
 * fresh analysis on every run.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentPlan } from "@/src/modules/studio/shared/contracts";

export const STUDIO_AGENT_PLAN_REUSE_ENV = "STUDIO_AGENT_PLAN_REUSE";

const REUSE_INDEX_SCHEMA_VERSION = 1 as const;

interface PlanReuseIndexEntry {
   analysisId: string;
   providerRevisionId: string;
   planHash: string;
   recordedAt: string;
}

interface PlanReuseIndex {
   indexSchemaVersion: typeof REUSE_INDEX_SCHEMA_VERSION;
   entries: Record<string, PlanReuseIndexEntry>;
}

export interface PlanReuseKeyParts {
   baseConfigId: string;
   fileKey: string;
   nodeId: string;
   /** null → reuse disabled for this request (no revision anchor). */
   providerRevisionId: string | null;
}

/** Operator kill-switch: `off` / `false` / `0` forces fresh analyses. */
export function planReuseDisabled(): boolean {
   const raw = process.env[STUDIO_AGENT_PLAN_REUSE_ENV];
   return raw === "off" || raw === "false" || raw === "0";
}

/**
 * The cache key for one analysis input — or null when reuse must not apply
 * (unpinned source, or the operator disabled reuse). Fail-closed.
 */
export function planReuseCacheKey(parts: PlanReuseKeyParts): string | null {
   if (planReuseDisabled()) return null;
   if (parts.providerRevisionId === null || parts.providerRevisionId === "") {
      return null;
   }
   return [
      parts.baseConfigId,
      parts.fileKey,
      parts.nodeId,
      parts.providerRevisionId,
   ].join("|");
}

/** Stable content hash of a plan object (canonical JSON stringify). */
export function planContentHash(plan: AgentPlan): string {
   return createHash("sha256")
      .update(JSON.stringify(plan), "utf8")
      .digest("hex");
}

function reuseIndexPath(runsRoot: string): string {
   return path.join(runsRoot, ".agent-analyses", "plan-reuse-index.json");
}

function parseIndex(raw: unknown): PlanReuseIndex {
   const empty: PlanReuseIndex = {
      indexSchemaVersion: REUSE_INDEX_SCHEMA_VERSION,
      entries: {},
   };
   if (typeof raw !== "object" || raw === null) return empty;
   const record = raw as Partial<PlanReuseIndex>;
   if (record.indexSchemaVersion !== REUSE_INDEX_SCHEMA_VERSION) return empty;
   if (typeof record.entries !== "object" || record.entries === null) {
      return empty;
   }
   const entries: Record<string, PlanReuseIndexEntry> = {};
   for (const [key, value] of Object.entries(record.entries)) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Partial<PlanReuseIndexEntry>;
      if (
         typeof entry.analysisId !== "string" ||
         !/^agent-\d+$/.test(entry.analysisId) ||
         typeof entry.providerRevisionId !== "string" ||
         entry.providerRevisionId === "" ||
         typeof entry.planHash !== "string" ||
         entry.planHash.length !== 64 ||
         typeof entry.recordedAt !== "string"
      ) {
         continue;
      }
      entries[key] = {
         analysisId: entry.analysisId,
         providerRevisionId: entry.providerRevisionId,
         planHash: entry.planHash,
         recordedAt: entry.recordedAt,
      };
   }
   return { indexSchemaVersion: REUSE_INDEX_SCHEMA_VERSION, entries };
}

async function readReuseIndex(runsRoot: string): Promise<PlanReuseIndex> {
   let raw: string;
   try {
      raw = await readFile(reuseIndexPath(runsRoot), "utf8");
   } catch {
      return { indexSchemaVersion: REUSE_INDEX_SCHEMA_VERSION, entries: {} };
   }
   try {
      return parseIndex(JSON.parse(raw));
   } catch {
      return { indexSchemaVersion: REUSE_INDEX_SCHEMA_VERSION, entries: {} };
   }
}

async function writeReuseIndex(
   runsRoot: string,
   index: PlanReuseIndex,
): Promise<void> {
   const file = reuseIndexPath(runsRoot);
   await mkdir(path.dirname(file), { recursive: true });
   const tmp = path.join(
      path.dirname(file),
      `.plan-reuse-index.${randomBytes(4).toString("hex")}.tmp`,
   );
   await writeFile(tmp, JSON.stringify(index, null, 2), "utf8");
   await rename(tmp, file);
}

/**
 * Record a freshly produced plan as reusable for its cache key. Only a
 * plan that echoes the request's own source may be recorded (defense in
 * depth on top of the pipeline's own invariant checks).
 */
export async function recordReusablePlan(input: {
   runsRoot: string;
   key: string;
   keyParts: PlanReuseKeyParts;
   analysisId: string;
   plan: AgentPlan;
}): Promise<void> {
   const { keyParts, plan } = input;
   if (
      plan.requested.fileKey !== keyParts.fileKey ||
      plan.requested.nodeId !== keyParts.nodeId
   ) {
      return; // never record a plan that does not echo its own request
   }
   const index = await readReuseIndex(input.runsRoot);
   index.entries[input.key] = {
      analysisId: input.analysisId,
      providerRevisionId: keyParts.providerRevisionId as string,
      planHash: planContentHash(plan),
      recordedAt: new Date().toISOString(),
   };
   await writeReuseIndex(input.runsRoot, index);
}

/**
 * The analysis id recorded for this cache key — or null. The CALLER must
 * still re-read + re-validate the plan through the runner (`result()`):
 * the index only points, it never vouches.
 */
export async function findReusableAnalysisId(input: {
   runsRoot: string;
   key: string;
   providerRevisionId: string;
}): Promise<string | null> {
   const index = await readReuseIndex(input.runsRoot);
   const entry = index.entries[input.key];
   if (entry === undefined) return null;
   if (entry.providerRevisionId !== input.providerRevisionId) return null;
   return entry.analysisId;
}
