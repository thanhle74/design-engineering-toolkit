/**
 * [65] Plan materializer tests — the deterministic AI-proposal → frozen
 * build-inputs bridge. Uses the REAL committed base project
 * (`examples/build/slaunchpad-home-real-derived`, pinned tree + base
 * projection from #56) copied into tmp — no AI, no network, no live MCP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { VALID_AGENT_PLAN } from "@/src/modules/studio/shared/contracts/agent-plan.test";
import { REPO_ROOT } from "../test-helpers/det-cli";
import {
  collectTreeLocators,
  deriveLocatorPrefix,
  materializeApprovedInputs,
  previewApproval,
  previewPinnedAssignments,
  MaterializeError,
} from "./plan-materializer";

const REAL_DERIVED_DIR = path.join(REPO_ROOT, "examples", "build", "slaunchpad-home-real-derived");

let workRoot: string;
let baseDir: string;
let baseConfigPath: string;

beforeEach(async () => {
  workRoot = await mkdtemp(path.join(os.tmpdir(), "det65-mat-"));
  baseDir = path.join(workRoot, "base-project");
  await cp(REAL_DERIVED_DIR, baseDir, { recursive: true });
  baseConfigPath = path.join(baseDir, "build-config.json");
});

afterEach(async () => {
  await rm(workRoot, { recursive: true, force: true });
});

describe("deriveLocatorPrefix", () => {
  it("derives the pinned namespace from the base projection's own assignments", async () => {
    const baseProjection = JSON.parse(
      await readFile(path.join(baseDir, "semantic-projection.json"), "utf8")
    );
    expect(deriveLocatorPrefix(baseProjection)).toBe("design://figma-home-desktop");
  });

  it("fails closed when the base projection is empty or malformed", () => {
    expect(() => deriveLocatorPrefix({ assignments: [] })).toThrow(MaterializeError);
    expect(() => deriveLocatorPrefix(null)).toThrow(MaterializeError);
  });
});

describe("collectTreeLocators", () => {
  it("collects exact locator strings from the pinned tree", async () => {
    const tree = JSON.parse(
      await readFile(path.join(baseDir, "snapshot-project", "figma-home-desktop.245-2.tree.json"), "utf8")
    );
    const locators = collectTreeLocators(tree);
    expect(locators.size).toBeGreaterThan(100);
    expect(locators.has("254:40")).toBe(true); // hero media slot, pinned in the base projection
  });
});

describe("previewPinnedAssignments + previewApproval", () => {
  it("counts pinned matches and honest drops against the real tree", async () => {
    const tree = JSON.parse(
      await readFile(path.join(baseDir, "snapshot-project", "figma-home-desktop.245-2.tree.json"), "utf8")
    );
    const locators = collectTreeLocators(tree);
    // VALID_AGENT_PLAN proposes 254:40 (pinned) + 254:44 (pinned).
    const preview = previewPinnedAssignments(VALID_AGENT_PLAN, locators, "design://figma-home-desktop");
    expect(preview.totalProposedAssignments).toBe(2);
    expect(preview.pinnedAssignments).toBe(2);
    expect(preview.droppedNodeIds).toEqual([]);
  });

  it("drops node ids that exist only in the live proposal, not the pinned tree", async () => {
    const plan = structuredClone(VALID_AGENT_PLAN);
    plan.sections[0].projection.push({
      sourceNodeId: "999:999",
      role: "heading",
      reason: "invented-or-newer node",
    });
    const preview = await previewApproval(plan, baseConfigPath);
    expect(preview.pinnedAssignments).toBe(2);
    expect(preview.totalProposedAssignments).toBe(3);
    expect(preview.droppedNodeIds).toEqual(["999:999"]);
  });
});

describe("materializeApprovedInputs", () => {
  it("copies the base project, replaces ONLY the projection, writes the approval record", async () => {
    const analysisDir = path.join(workRoot, "analysis");
    const result = await materializeApprovedInputs({
      analysisId: "agent-1000",
      plan: VALID_AGENT_PLAN,
      baseConfigPath,
      analysisDir,
    });

    expect(result.approvedConfigPath).toBe(path.join(analysisDir, "approved", "build-config.json"));
    expect(existsSync(result.approvedConfigPath)).toBe(true);

    // The approved copy carries the base's pinned docs untouched…
    const copiedTree = JSON.parse(
      await readFile(
        path.join(analysisDir, "approved", "snapshot-project", "figma-home-desktop.245-2.tree.json"),
        "utf8"
      )
    );
    expect(copiedTree.revisionId).toBe("2417494580183108397");
    const copiedContent = JSON.parse(
      await readFile(path.join(analysisDir, "approved", "content-manifest.json"), "utf8")
    );
    expect(copiedContent.sourceRevisionId).toBe("2417494580183108397"); // PINNED, not the unpinned MCP observation

    // …and a derived projection with exactly the pinned-matched assignments.
    const derived = JSON.parse(await readFile(path.join(analysisDir, "approved", "semantic-projection.json"), "utf8"));
    expect(derived.schemaVersion).toBe(1);
    expect(derived.profileId).toBe("slaunchpad-fashion");
    expect(derived.sourceRevisionId).toBe("2417494580183108397");
    expect(derived.assignments).toHaveLength(2);
    expect(derived.assignments[0].sourceLocator).toBe("design://figma-home-desktop/254:40");
    expect(derived.assignments[0].role).toBe("background-media");
    expect(derived.assignments[0].note).toContain("agent-1000");

    const record = JSON.parse(await readFile(path.join(analysisDir, "approved", "approval.json"), "utf8"));
    expect(record).toMatchObject({
      analysisId: "agent-1000",
      derivedFrom: "agent-plan",
      totalProposedAssignments: 2,
      pinnedAssignments: 2,
      droppedNodeIds: [],
      replacedProjectionPath: "semantic-projection.json",
    });
    expect(record.planContentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("drops unmatched proposals from the derived projection and reports them", async () => {
    const plan = structuredClone(VALID_AGENT_PLAN);
    plan.sections[0].projection.push({ sourceNodeId: "888:888", role: "body", reason: "unmatched" });
    const analysisDir = path.join(workRoot, "analysis");
    const result = await materializeApprovedInputs({
      analysisId: "agent-1001",
      plan,
      baseConfigPath,
      analysisDir,
    });
    expect(existsSync(result.approvedConfigPath)).toBe(true);
    const record = JSON.parse(await readFile(path.join(analysisDir, "approved", "approval.json"), "utf8"));
    expect(record.pinnedAssignments).toBe(2);
    expect(record.totalProposedAssignments).toBe(3);
    expect(record.droppedNodeIds).toEqual(["888:888"]);
    const derived = JSON.parse(await readFile(path.join(analysisDir, "approved", "semantic-projection.json"), "utf8"));
    expect(derived.assignments).toHaveLength(2);
  });

  it("refuses to materialize when NO proposal matches the pinned source (409 carrier)", async () => {
    const plan = structuredClone(VALID_AGENT_PLAN);
    plan.sections[0].projection = [{ sourceNodeId: "777:1", role: "heading", reason: "nothing pinned" }];
    await expect(
      materializeApprovedInputs({
        analysisId: "agent-1002",
        plan,
        baseConfigPath,
        analysisDir: path.join(workRoot, "analysis"),
      })
    ).rejects.toMatchObject({ name: "MaterializeError", code: "no-pinned-assignments" });
  });

  it("fails closed on an unreadable base config", async () => {
    await expect(
      materializeApprovedInputs({
        analysisId: "agent-1003",
        plan: VALID_AGENT_PLAN,
        baseConfigPath: path.join(workRoot, "missing", "build-config.json"),
        analysisDir: path.join(workRoot, "analysis"),
      })
    ).rejects.toMatchObject({ name: "MaterializeError", code: "base-config-invalid" });
  });

  it("is deterministic for the same plan + base (same assignments, same order)", async () => {
    const a = await materializeApprovedInputs({
      analysisId: "agent-2000",
      plan: VALID_AGENT_PLAN,
      baseConfigPath,
      analysisDir: path.join(workRoot, "a"),
    });
    const b = await materializeApprovedInputs({
      analysisId: "agent-2001",
      plan: VALID_AGENT_PLAN,
      baseConfigPath,
      analysisDir: path.join(workRoot, "b"),
    });
    const projA = await readFile(path.join(path.dirname(a.approvedConfigPath), "semantic-projection.json"), "utf8");
    const projB = await readFile(path.join(path.dirname(b.approvedConfigPath), "semantic-projection.json"), "utf8");
    // Only the analysis-id provenance notes differ (by design).
    expect(projA.replaceAll("agent-2000", "X")).toBe(projB.replaceAll("agent-2001", "X"));
    expect(a.record.planContentHash).toBe(b.record.planContentHash);
  });
});
