/**
 * [76] Deterministic plan reuse tests — the side-car reuse index that makes
 * build-flow reproducible run-to-run. No AI, no network, no live MCP: the
 * index is exercised against a temp runs root with the shared VALID_AGENT_PLAN
 * fixture. The reuse contract is FAIL-CLOSED: no revision anchor → no key;
 * a plan that does not echo its request is never recorded; the index points
 * but never vouches (re-validation is the runner's job and is covered there).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { VALID_AGENT_PLAN } from "@/src/modules/studio/shared/contracts/__tests__/agent-plan.test";
import type { AgentPlan } from "@/src/modules/studio/shared/contracts";
import {
   STUDIO_AGENT_PLAN_REUSE_ENV,
   findReusableAnalysisId,
   planContentHash,
   planReuseCacheKey,
   planReuseDisabled,
   recordReusablePlan,
} from "../plan-reuse";

const KEY_PARTS = {
   baseConfigId: "slaunchpad-home-real-derived",
   fileKey: "vNPtfBRpYM3PsExirVqhmt",
   nodeId: "245:2",
   providerRevisionId: "2417494580183108397",
};

let runsRoot: string;
let originalReuseEnv: string | undefined;

beforeEach(async () => {
   runsRoot = await mkdtemp(path.join(os.tmpdir(), "det76-reuse-"));
   originalReuseEnv = process.env[STUDIO_AGENT_PLAN_REUSE_ENV];
   delete process.env[STUDIO_AGENT_PLAN_REUSE_ENV];
});

afterEach(async () => {
   if (originalReuseEnv === undefined) {
      delete process.env[STUDIO_AGENT_PLAN_REUSE_ENV];
   } else {
      process.env[STUDIO_AGENT_PLAN_REUSE_ENV] = originalReuseEnv;
   }
   await rm(runsRoot, { recursive: true, force: true });
});

async function recordDefaultPlan(analysisId = "agent-1000"): Promise<AgentPlan> {
   await recordReusablePlan({
      runsRoot,
      key: planReuseCacheKey(KEY_PARTS)!,
      keyParts: KEY_PARTS,
      analysisId,
      plan: VALID_AGENT_PLAN,
   });
   return VALID_AGENT_PLAN;
}

describe("planReuseDisabled", () => {
   it("is enabled by default and disabled by off/false/0", () => {
      expect(planReuseDisabled()).toBe(false);
      for (const value of ["off", "false", "0"]) {
         process.env[STUDIO_AGENT_PLAN_REUSE_ENV] = value;
         expect(planReuseDisabled()).toBe(true);
      }
      process.env[STUDIO_AGENT_PLAN_REUSE_ENV] = "on";
      expect(planReuseDisabled()).toBe(false);
   });
});

describe("planReuseCacheKey", () => {
   it("builds a stable key from the four input parts", () => {
      expect(planReuseCacheKey(KEY_PARTS)).toBe(
         "slaunchpad-home-real-derived|vNPtfBRpYM3PsExirVqhmt|245:2|2417494580183108397",
      );
   });

   it("returns null for an unpinned source (fail-closed: no revision anchor)", () => {
      expect(
         planReuseCacheKey({ ...KEY_PARTS, providerRevisionId: null }),
      ).toBeNull();
      expect(planReuseCacheKey({ ...KEY_PARTS, providerRevisionId: "" })).toBeNull();
   });

   it("returns null when the operator kill-switch is on", () => {
      process.env[STUDIO_AGENT_PLAN_REUSE_ENV] = "off";
      expect(planReuseCacheKey(KEY_PARTS)).toBeNull();
   });
});

describe("planContentHash", () => {
   it("is stable for the same plan and distinct for different plans", () => {
      expect(planContentHash(VALID_AGENT_PLAN)).toBe(
         planContentHash(VALID_AGENT_PLAN),
      );
      const other: AgentPlan = {
         ...VALID_AGENT_PLAN,
         sections: [],
      };
      expect(planContentHash(other)).not.toBe(planContentHash(VALID_AGENT_PLAN));
      expect(planContentHash(VALID_AGENT_PLAN)).toMatch(/^[0-9a-f]{64}$/);
   });
});

describe("record + find roundtrip", () => {
   it("records a plan that echoes its request and finds it again", async () => {
      await recordDefaultPlan();
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBe("agent-1000");
   });

   it("never records a plan that does not echo its own request", async () => {
      const foreign: AgentPlan = {
         ...VALID_AGENT_PLAN,
         requested: { fileKey: "other-file-key", nodeId: "1:2" },
      };
      await recordReusablePlan({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         keyParts: KEY_PARTS,
         analysisId: "agent-2000",
         plan: foreign,
      });
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBeNull();
   });

   it("refuses the lookup on a revision mismatch", async () => {
      await recordDefaultPlan();
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: "9999999999999999999",
      });
      expect(found).toBeNull();
   });

   it("returns null when no index exists yet", async () => {
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBeNull();
   });

   it("keeps the latest recording per key and writes atomically (no tmp left)", async () => {
      await recordDefaultPlan("agent-3000");
      await recordDefaultPlan("agent-3001");
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBe("agent-3001");
      const dir = path.join(runsRoot, ".agent-analyses");
      const files = await readdir(dir);
      expect(files).toEqual(["plan-reuse-index.json"]);
      const onDisk = JSON.parse(
         await readFile(path.join(dir, "plan-reuse-index.json"), "utf8"),
      );
      expect(onDisk.indexSchemaVersion).toBe(1);
      expect(existsSync(path.join(dir, "plan-reuse-index.json"))).toBe(true);
   });

   it("treats a corrupt index file as empty (never throws, never reuses)", async () => {
      const dir = path.join(runsRoot, ".agent-analyses");
      await recordDefaultPlan();
      await writeFileRaw(path.join(dir, "plan-reuse-index.json"), "{not json");
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBeNull();
      // and the next recording heals the index
      await recordDefaultPlan("agent-4000");
      const healed = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(healed).toBe("agent-4000");
   });

   it("filters malformed entries instead of trusting them", async () => {
      const dir = path.join(runsRoot, ".agent-analyses");
      await mkdirNested(dir);
      await writeFileRaw(
         path.join(dir, "plan-reuse-index.json"),
         JSON.stringify({
            indexSchemaVersion: 1,
            entries: {
               [planReuseCacheKey(KEY_PARTS)!]: {
                  analysisId: "NOT-AN-AGENT-ID",
                  providerRevisionId: KEY_PARTS.providerRevisionId,
                  planHash: "0".repeat(64),
                  recordedAt: "2026-11-16T00:00:00.000Z",
               },
               [`${KEY_PARTS.baseConfigId}|other|key|1`]: {
                  analysisId: "agent-5000",
                  providerRevisionId: "", // empty revision → malformed
                  planHash: "0".repeat(64),
                  recordedAt: "2026-11-16T00:00:00.000Z",
               },
            },
         }),
      );
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBeNull();
   });

   it("ignores a foreign schema version (forward compatibility is fail-closed)", async () => {
      const dir = path.join(runsRoot, ".agent-analyses");
      await mkdirNested(dir);
      await writeFileRaw(
         path.join(dir, "plan-reuse-index.json"),
         JSON.stringify({
            indexSchemaVersion: 99,
            entries: {},
         }),
      );
      const found = await findReusableAnalysisId({
         runsRoot,
         key: planReuseCacheKey(KEY_PARTS)!,
         providerRevisionId: KEY_PARTS.providerRevisionId,
      });
      expect(found).toBeNull();
   });
});

/* ------------------------------ helpers ------------------------------ */

import { mkdir, writeFile } from "node:fs/promises";

async function writeFileRaw(file: string, content: string): Promise<void> {
   await writeFile(file, content, "utf8");
}

async function mkdirNested(dir: string): Promise<void> {
   await mkdir(dir, { recursive: true });
}
