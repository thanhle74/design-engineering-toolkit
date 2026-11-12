/**
 * [29]/[40] DET Studio — shared StudioRunView assembly from parsed artifacts.
 *
 * Extracted from DirectoryDetRunReader ([29]) per the Coordinator decision
 * (issues #36/#40): the [40] build-bundle reader SHARES the joined-artifact
 * assembly (sections, node-ir index, source-review index, diagnostics merge,
 * compose mapping rows, cross-artifact source identity) instead of cloning
 * the large reader. Legacy directory runs pass their root `tool-run.json`
 * envelope; build bundles pass explicit manifest provenance (`buildBundle`)
 * plus the additive `build` block. Preview is ALWAYS unavailable in both
 * shapes — Studio never invents a verified render.
 */
import {
  STUDIO_NODE_KINDS,
  DetRunReaderError,
  StudioRunViewSchema,
  assertStudioRunViewInvariants,
  type StudioArtifactView,
  type StudioBuildView,
  type StudioDiagnosticView,
  type StudioMappingView,
  type StudioRunView,
  type StudioSectionView,
} from "@/src/studio/shared/contracts";

import { canServeContainedFile } from "./contained-read";
import {
  COMPOSE_REPORT_FALLBACK_FILE,
  PREVIEW_UNAVAILABLE_REASON,
  countsFromToolRun,
  computedCounts,
  echoId,
  optionalEnum,
  optionalHex64,
  optionalString,
  requireConsistentSource,
  requireRecord,
  requireString,
  runLabel,
  toDiagnosticView,
  toMappingView,
  toSectionView,
  zodDetail,
  type CountsView,
  type JsonRecord,
  type NodeIndex,
} from "./det-payload-parsing";

/** Provenance a build-bundle reader supplies from its root build-manifest.json. */
export interface BuildBundleProvenance {
  command: string;
  profileId: string | null;
  platformId: string | null;
  generatedAt: string | null;
  exitCode: number | null;
  source: { sourceId: string | null; revisionId: string | null; accessedAt: string | null } | null;
  counts: CountsView | null;
}

export interface AssembleRunViewParams {
  runId: string;
  /** Root tool-run envelope (legacy runs); null for build bundles. */
  toolRun: JsonRecord | null;
  compose: JsonRecord | null;
  composeFile: string | null;
  review: JsonRecord | null;
  pageStructure: JsonRecord | null;
  nodeIr: JsonRecord | null;
  /** Stage-envelope "run" diagnostics for bundles; derived from toolRun when absent. */
  runOriginDiagnostics?: StudioDiagnosticView[];
  buildBundle?: BuildBundleProvenance;
  buildBlock?: StudioBuildView;
  /** Reader-specific verified artifact inventory (envelope-driven or manifest-driven). */
  listArtifactViews: () => Promise<StudioArtifactView[]>;
}

export async function assembleStudioRunView(params: AssembleRunViewParams): Promise<StudioRunView> {
  const { runId, toolRun, compose, composeFile, review, pageStructure, nodeIr } = params;

  const legacy = toolRun !== null;
  const provenance = params.buildBundle;

  const command = legacy ? optionalString(toolRun.command) : undefined;
  const profileId = legacy ? (optionalString(toolRun.profileId) ?? null) : (provenance?.profileId ?? null);
  const platformId =
    legacy === true
      ? (optionalString(toolRun.platformId) ?? optionalString(compose?.platformId) ?? null)
      : (provenance?.platformId ?? null);
  const generatedAt = legacy ? (optionalString(toolRun.generatedAt) ?? null) : (provenance?.generatedAt ?? null);
  const exitCode = legacy
    ? typeof toolRun.exitCode === "number" && Number.isInteger(toolRun.exitCode)
      ? toolRun.exitCode
      : null
    : (provenance?.exitCode ?? null);
  const toolCommand = command === undefined ? (provenance ? `det ${provenance.command}` : null) : `det ${command}`;

  /* sections (page-structure) */
  const sections: StudioSectionView[] = [];
  if (pageStructure !== null && Array.isArray(pageStructure.sections)) {
    pageStructure.sections.forEach((raw, index) => {
      sections.push(toSectionView(raw, `page-structure.json sections[${index}]`));
    });
    sections.sort((a, b) => a.order - b.order || (a.sectionId < b.sectionId ? -1 : 1));
  }

  /* node-ir lookups: nodeId → { kind, name } */
  const nodeIndex: NodeIndex = new Map();
  if (nodeIr !== null && Array.isArray(nodeIr.nodes)) {
    nodeIr.nodes.forEach((raw, index) => {
      const node = requireRecord(raw, `node-ir.json nodes[${index}]`);
      const nodeId = requireString(node.nodeId, `node-ir.json nodes[${index}].nodeId`);
      nodeIndex.set(nodeId, {
        kind: optionalEnum(node.kind, STUDIO_NODE_KINDS, `node-ir.json nodes[${index}].kind`),
        name: optionalString(node.name),
      });
    });
  }

  /* source-review entries indexed by nodeId */
  const reviewIndex = new Map<string, JsonRecord>();
  if (review !== null && Array.isArray(review.entries)) {
    review.entries.forEach((raw, index) => {
      const entry = requireRecord(raw, `source-review.json entries[${index}]`);
      const nodeId = requireString(entry.nodeId, `source-review.json entries[${index}].nodeId`);
      reviewIndex.set(nodeId, entry);
    });
  }

  /* diagnostics: run-origin rows first — gap rows join them for reasons */
  const diagnostics: StudioDiagnosticView[] = [];
  const composeDiagnostics: StudioDiagnosticView[] = [];
  const runOrigin =
    params.runOriginDiagnostics ??
    (legacy && Array.isArray(toolRun.runDiagnostics)
      ? toolRun.runDiagnostics.map((raw, index) => toDiagnosticView(raw, "run", `tool-run.json runDiagnostics[${index}]`))
      : []);
  diagnostics.push(...runOrigin);
  if (compose !== null && Array.isArray(compose.diagnostics)) {
    compose.diagnostics.forEach((raw, index) => {
      const view = toDiagnosticView(
        raw,
        "compose",
        `${composeFile ?? COMPOSE_REPORT_FALLBACK_FILE} diagnostics[${index}]`
      );
      composeDiagnostics.push(view);
      diagnostics.push(view);
    });
  }
  if (review !== null && Array.isArray(review.diagnostics)) {
    review.diagnostics.forEach((raw, index) => {
      diagnostics.push(toDiagnosticView(raw, "review", `source-review.json diagnostics[${index}]`));
    });
  }

  /* mappings: one row per compose mapping entry */
  const mappings: StudioMappingView[] = [];
  if (compose !== null && Array.isArray(compose.mapping)) {
    compose.mapping.forEach((raw, index) => {
      mappings.push(
        toMappingView(
          raw,
          `${composeFile ?? COMPOSE_REPORT_FALLBACK_FILE} mapping[${index}]`,
          nodeIndex,
          reviewIndex,
          composeDiagnostics
        )
      );
    });
  }

  /* artifact manifest + derived downloadability (reader-specific inventory) */
  const artifacts = await params.listArtifactViews();

  /* source identity: legacy joins the extraction artifacts; bundles pin the manifest source. */
  const source =
    provenance?.source ??
    requireConsistentSource(compose?.source, pageStructure?.source, review?.source, nodeIr?.source);

  const counts: CountsView = legacy
    ? (countsFromToolRun(toolRun.counts) ?? computedCounts(diagnostics))
    : (provenance?.counts ?? computedCounts(diagnostics));

  return {
    runId,
    mode: "live",
    label: legacy
      ? runLabel(runId, command, profileId === null ? undefined : profileId)
      : runLabel(runId, provenance?.command, provenance?.profileId ?? undefined),
    generatedAt,
    exitCode,
    toolCommand,
    profileId,
    platformId,
    source,
    counts,
    sections,
    mappings,
    diagnostics,
    artifacts,
    preview: { status: "unavailable", reason: PREVIEW_UNAVAILABLE_REASON },
    ...(params.buildBlock === undefined ? {} : { build: params.buildBlock }),
  };
}

/**
 * Shared finishing gate: zod + invariants; both readers must pass before a
 * run view is returned to any UI lane.
 */
export function validateAssembledRunView(runId: string, assembled: StudioRunView): StudioRunView {
  let parsed: StudioRunView;
  try {
    parsed = StudioRunViewSchema.parse(assembled);
  } catch (error) {
    throw new DetRunReaderError(
      "invalid-payload",
      `Run "${echoId(runId)}" does not satisfy the frozen StudioRunView contract.`,
      zodDetail(error)
    );
  }
  try {
    assertStudioRunViewInvariants(parsed);
  } catch (error) {
    throw new DetRunReaderError(
      "invalid-payload",
      `Run "${echoId(runId)}" violates a StudioRunView invariant.`,
      error instanceof Error ? error.message : undefined
    );
  }
  return parsed;
}

/**
 * Legacy ([29]) envelope-driven artifact inventory: entries come from the
 * root tool-run envelope, downloadability is a contained-file check bound to
 * the run directory. Bundle runs build their inventory manifest-first instead
 * (build-bundle-reader.ts).
 */
export function makeEnvelopeArtifactViews(
  runDir: string,
  toolRun: JsonRecord
): () => Promise<StudioArtifactView[]> {
  return async () => {
    const artifactViews: StudioArtifactView[] = [];
    if (Array.isArray(toolRun.artifacts)) {
      for (const [index, raw] of toolRun.artifacts.entries()) {
        const where = `tool-run.json artifacts[${index}]`;
        const entry = requireRecord(raw, where);
        const role = requireString(entry.role, `${where}.role`);
        const schemaRef = requireString(entry.schemaRef, `${where}.schemaRef`);
        const file = optionalString(entry.file);
        const contentHash = optionalHex64(entry.contentHash, `${where}.contentHash`);
        const volatileContentHash = optionalHex64(entry.volatileContentHash, `${where}.volatileContentHash`);
        artifactViews.push({
          artifactId: file === undefined ? role : `${role}/${file}`,
          role,
          ...(file === undefined ? {} : { file }),
          schemaRef,
          ...(contentHash === undefined ? {} : { contentHash }),
          ...(volatileContentHash === undefined ? {} : { volatileContentHash }),
          downloadable: file !== undefined && (await canServeContainedFile(runDir, file)),
        });
      }
    }
    return artifactViews;
  };
}
