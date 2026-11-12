/**
 * [65] Approval materializer — deterministic plan → frozen build inputs.
 *
 * The ONLY bridge from an AI proposal to the deterministic engine, and it is
 * itself deterministic code (never the AI): on operator approval, this module
 * copies the selected base build project (version-pinned snapshot, registry,
 * bindings, content manifest — untouched), replaces ONLY
 * `semantic-projection.json` with the operator-approved plan's assignments,
 * and re-validates the generated doc against a mirror of the core
 * `semantic-projection` contract BEFORE anything is written.
 *
 * Anti-fabrication rules:
 *  - The locator namespace (`design://<sourceId>`) is reused verbatim from
 *    the base project's own pinned projection — never invented.
 *  - Every proposed assignment must reference a locator that EXISTS in the
 *    pinned snapshot tree; proposals that do not are dropped and reported
 *    (never silently — the UI shows the counts).
 *  - `sourceRevisionId` is the PINNED tree revision, never the live MCP
 *    observation (which is unpinned by definition).
 *  - An approval with zero surviving assignments is refused (422 at the
 *    route): nothing is materialized from an empty proposal.
 *  - Content refs / capability hints stay RECOMMENDATIONS in the plan view;
 *    they are never materialized (no invented asset URLs, no unproven
 *    bindings — genuine dispositions remain the engine's alone).
 */
import "server-only";

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { z } from "zod";

import { AGENT_PROJECTION_ROLES, type AgentPlan } from "@/src/studio/shared/contracts";

export class MaterializeError extends Error {
  readonly code: "base-config-invalid" | "base-projection-unavailable" | "no-pinned-assignments" | "workspace-error";
  constructor(code: MaterializeError["code"], message: string) {
    super(message);
    this.name = "MaterializeError";
    this.code = code;
  }
}

/** Mirror of the core `semantic-projection.schema.json` (v1) for pre-write validation. */
const SemanticProjectionDocSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  sourceRevisionId: z.string().min(1),
  notes: z.string().optional(),
  assignments: z
    .array(
      z.object({
        sourceLocator: z.string().regex(/^(design|source):\/\/[A-Za-z0-9][A-Za-z0-9.-]*\/\S+$/),
        role: z.enum(AGENT_PROJECTION_ROLES),
        reason: z.string().min(1),
        note: z.string().optional(),
      })
    )
    .min(1),
});

export type SemanticProjectionDoc = z.infer<typeof SemanticProjectionDocSchema>;

export interface ApprovalPreview {
  totalProposedAssignments: number;
  pinnedAssignments: number;
  droppedNodeIds: string[];
}

export interface ApprovalRecord {
  analysisId: string;
  approvedAt: string;
  derivedFrom: "agent-plan";
  baseConfigPath: string;
  planContentHash: string;
  totalProposedAssignments: number;
  pinnedAssignments: number;
  droppedNodeIds: string[];
  replacedProjectionPath: string;
}

export interface MaterializeResult {
  approvedConfigPath: string;
  record: ApprovalRecord;
}

interface BaseConfigLite {
  schemaVersion: number;
  profileId: string;
  profile: string;
  registry: string;
  bindings: string;
  content: string;
  projection: string;
  designSource: { mode: string; project: string; designFile: string; designNode: string };
}

function parseBaseConfig(raw: unknown, configPath: string): BaseConfigLite {
  if (typeof raw !== "object" || raw === null) {
    throw new MaterializeError("base-config-invalid", `Base build config is not an object: ${configPath}`);
  }
  const parsed = (raw as Record<string, unknown>).schemaVersion;
  if (parsed !== 1) {
    throw new MaterializeError("base-config-invalid", "Base build config schemaVersion must be 1.");
  }
  const record = raw as Record<string, unknown>;
  const str = (key: string): string => {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new MaterializeError("base-config-invalid", `Base build config field "${key}" must be a non-empty string.`);
    }
    return value;
  };
  const designSource = record.designSource;
  if (typeof designSource !== "object" || designSource === null) {
    throw new MaterializeError("base-config-invalid", "Base build config designSource must be an object.");
  }
  const ds = designSource as Record<string, unknown>;
  if (ds.mode !== "snapshot") {
    throw new MaterializeError("base-config-invalid", "Base build config designSource.mode must be \"snapshot\".");
  }
  for (const key of ["project", "designFile", "designNode"] as const) {
    if (typeof ds[key] !== "string" || (ds[key] as string).length === 0) {
      throw new MaterializeError("base-config-invalid", `Base build config designSource.${key} must be a non-empty string.`);
    }
  }
  return {
    schemaVersion: 1,
    profileId: str("profileId"),
    profile: str("profile"),
    registry: str("registry"),
    bindings: str("bindings"),
    content: str("content"),
    projection: str("projection"),
    designSource: {
      mode: "snapshot",
      project: ds.project as string,
      designFile: ds.designFile as string,
      designNode: ds.designNode as string,
    },
  };
}

/** Locator namespace prefix from the base projection's own pinned assignments. */
export function deriveLocatorPrefix(baseProjection: unknown): string {
  if (typeof baseProjection !== "object" || baseProjection === null) {
    throw new MaterializeError("base-projection-unavailable", "Base semantic projection is not an object.");
  }
  const assignments = (baseProjection as Record<string, unknown>).assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new MaterializeError(
      "base-projection-unavailable",
      "Base semantic projection has no assignments to derive the pinned locator namespace from."
    );
  }
  const first = assignments[0] as Record<string, unknown>;
  const locator = first.sourceLocator;
  if (typeof locator !== "string") {
    throw new MaterializeError("base-projection-unavailable", "Base projection assignment has no sourceLocator.");
  }
  const match = /^((?:design|source):\/\/[A-Za-z0-9][A-Za-z0-9.-]*)\//.exec(locator);
  if (match === null) {
    throw new MaterializeError("base-projection-unavailable", "Base projection locator does not match the contract pattern.");
  }
  return match[1];
}

/** Collect every node locator of a pinned snapshot tree (exact strings). */
export function collectTreeLocators(tree: unknown): Set<string> {
  const locators = new Set<string>();
  if (typeof tree !== "object" || tree === null) return locators;
  const nodes = (tree as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) return locators;
  for (const node of nodes) {
    if (typeof node === "object" && node !== null) {
      const locator = (node as Record<string, unknown>).locator;
      if (typeof locator === "string") locators.add(locator);
    }
  }
  return locators;
}

/**
 * Which proposed assignments reference the pinned source (preview shown in
 * the UI BEFORE the operator approves anything).
 */
export function previewPinnedAssignments(plan: AgentPlan, treeLocators: Set<string>, locatorPrefix: string): ApprovalPreview {
  const dropped = new Set<string>();
  let total = 0;
  let pinned = 0;
  for (const section of plan.sections) {
    for (const assignment of section.projection) {
      total += 1;
      if (treeLocators.has(assignment.sourceNodeId)) {
        pinned += 1;
      } else {
        dropped.add(assignment.sourceNodeId);
      }
    }
  }
  void locatorPrefix;
  return { totalProposedAssignments: total, pinnedAssignments: pinned, droppedNodeIds: [...dropped].sort() };
}

function canonicalPlanHash(plan: AgentPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

/**
 * Read-only approval preview for the UI: how many proposed assignments
 * reference the pinned snapshot source, computed the exact way the
 * materializer will decide. Throws MaterializeError when the base project
 * cannot be inspected (the UI then renders approval as unavailable — honest).
 */
export async function previewApproval(plan: AgentPlan, baseConfigPath: string): Promise<ApprovalPreview> {
  const resolved = path.resolve(baseConfigPath);
  const baseDir = path.dirname(resolved);
  let baseConfigRaw: unknown;
  try {
    baseConfigRaw = JSON.parse(await readFile(resolved, "utf8"));
  } catch {
    throw new MaterializeError("base-config-invalid", "Base build config is not readable JSON.");
  }
  const baseConfig = parseBaseConfig(baseConfigRaw, resolved);
  let baseProjectionRaw: unknown;
  try {
    baseProjectionRaw = JSON.parse(await readFile(path.join(baseDir, baseConfig.projection), "utf8"));
  } catch {
    throw new MaterializeError("base-projection-unavailable", "Base semantic projection is not readable JSON.");
  }
  const locatorPrefix = deriveLocatorPrefix(baseProjectionRaw);
  let treeRaw: unknown;
  try {
    treeRaw = JSON.parse(
      await readFile(path.join(baseDir, baseConfig.designSource.project, baseConfig.designSource.designFile), "utf8")
    );
  } catch {
    throw new MaterializeError("base-config-invalid", "Pinned snapshot tree is not readable JSON.");
  }
  return previewPinnedAssignments(plan, collectTreeLocators(treeRaw), locatorPrefix);
}

export interface MaterializeOptions {
  analysisId: string;
  plan: AgentPlan;
  baseConfigPath: string;
  /** `<runsRoot>/.agent-analyses/<analysisId>` — the analysis workspace dir. */
  analysisDir: string;
  now?: Date;
}

/**
 * Copy the base project → `approved/`, replace the projection with the
 * validated derived one, write the approval record. Deterministic given the
 * same plan + base: assignment order follows plan order.
 */
export async function materializeApprovedInputs(opts: MaterializeOptions): Promise<MaterializeResult> {
  const baseConfigPath = path.resolve(opts.baseConfigPath);
  const baseDir = path.dirname(baseConfigPath);
  const approvedDir = path.join(opts.analysisDir, "approved");
  const approvedConfigPath = path.join(approvedDir, path.basename(baseConfigPath));

  // Read the base docs from the ORIGINAL base (never from a stale copy).
  let baseConfigRaw: unknown;
  try {
    baseConfigRaw = JSON.parse(await readFile(baseConfigPath, "utf8"));
  } catch {
    throw new MaterializeError("base-config-invalid", `Base build config is not readable JSON: ${baseConfigPath}`);
  }
  const baseConfig = parseBaseConfig(baseConfigRaw, baseConfigPath);

  let baseProjectionRaw: unknown;
  try {
    baseProjectionRaw = JSON.parse(await readFile(path.join(baseDir, baseConfig.projection), "utf8"));
  } catch {
    throw new MaterializeError("base-projection-unavailable", "Base semantic projection is not readable JSON.");
  }
  const locatorPrefix = deriveLocatorPrefix(baseProjectionRaw);

  let treeRaw: unknown;
  try {
    treeRaw = JSON.parse(
      await readFile(path.join(baseDir, baseConfig.designSource.project, baseConfig.designSource.designFile), "utf8")
    );
  } catch {
    throw new MaterializeError("base-config-invalid", "Pinned snapshot tree is not readable JSON.");
  }
  const treeLocators = collectTreeLocators(treeRaw);
  const treeRevision = typeof (treeRaw as Record<string, unknown>).revisionId === "string"
    ? (treeRaw as Record<string, unknown>).revisionId as string
    : null;
  if (treeRevision === null) {
    throw new MaterializeError("base-config-invalid", "Pinned snapshot tree carries no revisionId.");
  }

  const preview = previewPinnedAssignments(opts.plan, treeLocators, locatorPrefix);
  if (preview.pinnedAssignments === 0) {
    throw new MaterializeError(
      "no-pinned-assignments",
      "No proposed assignment references the pinned snapshot source; nothing to materialize."
    );
  }

  // Deterministic derived projection: plan order, pinned membership, base
  // namespace, pinned revision. Validated BEFORE anything is written.
  const assignments: SemanticProjectionDoc["assignments"] = [];
  for (const section of opts.plan.sections) {
    for (const assignment of section.projection) {
      if (!treeLocators.has(assignment.sourceNodeId)) continue;
      assignments.push({
        sourceLocator: `${locatorPrefix}/${assignment.sourceNodeId}`,
        role: assignment.role,
        reason: assignment.reason,
        note: `agent-proposal section="${section.name}" (analysis ${opts.analysisId})`,
      });
    }
  }
  const derivedProjection: SemanticProjectionDoc = {
    schemaVersion: 1,
    profileId: baseConfig.profileId,
    sourceRevisionId: treeRevision,
    notes:
      `Operator-approved AI proposal (issue [65], analysis ${opts.analysisId}) mapped onto the ` +
      `version-pinned snapshot source; locator namespace and revision reused from the base project. ` +
      `${preview.pinnedAssignments}/${preview.totalProposedAssignments} proposals matched the pinned tree; ` +
      `unmatched proposals were dropped, not silently included. Content refs and capability hints remain ` +
      `review-only recommendations and were NOT materialized.`,
    assignments,
  };
  const projectionCheck = SemanticProjectionDocSchema.safeParse(derivedProjection);
  if (!projectionCheck.success) {
    throw new MaterializeError("workspace-error", "Derived projection failed the semantic-projection contract mirror.");
  }

  // Fresh approved dir: stale results from a previous approval never leak in.
  await rm(approvedDir, { recursive: true, force: true });
  await mkdir(path.dirname(approvedDir), { recursive: true });
  await cp(baseDir, approvedDir, { recursive: true, errorOnExist: false, force: true });

  const projectionRel = path.join(approvedDir, baseConfig.projection);
  const tmp = path.join(approvedDir, `.${randomBytes(4).toString("hex")}.projection.tmp`);
  await writeFile(tmp, JSON.stringify(derivedProjection, null, 2), "utf8");
  await rename(tmp, projectionRel);

  const record: ApprovalRecord = {
    analysisId: opts.analysisId,
    approvedAt: (opts.now ?? new Date()).toISOString(),
    derivedFrom: "agent-plan",
    baseConfigPath,
    planContentHash: canonicalPlanHash(opts.plan),
    totalProposedAssignments: preview.totalProposedAssignments,
    pinnedAssignments: preview.pinnedAssignments,
    droppedNodeIds: preview.droppedNodeIds,
    replacedProjectionPath: baseConfig.projection,
  };
  const recordTmp = path.join(approvedDir, `.${randomBytes(4).toString("hex")}.approval.tmp`);
  await writeFile(recordTmp, JSON.stringify(record, null, 2), "utf8");
  await rename(recordTmp, path.join(approvedDir, "approval.json"));

  const configStat = await stat(approvedConfigPath).catch(() => null);
  if (configStat === null || !configStat.isFile()) {
    throw new MaterializeError("workspace-error", "Approved build config copy is missing after materialization.");
  }

  return { approvedConfigPath, record };
}
