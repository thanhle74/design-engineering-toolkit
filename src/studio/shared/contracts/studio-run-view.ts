/**
 * [29] DET Studio — frozen UI-facing read model.
 *
 * Derived from actual DET artifact schemas (do not invent fields here):
 *   - schemas/cli/tool-run.schema.json        (run manifest, artifacts, run diagnostics)
 *   - schemas/cli/compose-output.schema.json  (mapping dispositions, compose diagnostics)
 *   - schemas/converter/source-review.schema.json (review dispositions, semantic classes)
 *   - schemas/converter/page-structure.schema.json (ordered sections)
 *   - schemas/converter/node-ir.schema.json   (node kinds)
 *
 * Canonical compose dispositions are preserved EXACTLY as the engine emits them:
 * `mapped | gap | decoration-merged | excluded | skipped`. `NEEDS_REVIEW` is a
 * source-review disposition and is surfaced only as the DERIVED `needsReview`
 * flag on a mapping row — it is never a new compose disposition.
 *
 * Unknown facts are `null`, never zero: the UI must render "unknown", not 0.
 */
import { z } from "zod";

/** Exact enum from schemas/cli/compose-output.schema.json $defs.mappingEntry.disposition. */
export const STUDIO_COMPOSE_DISPOSITIONS = [
  "mapped",
  "gap",
  "decoration-merged",
  "excluded",
  "skipped",
] as const;
export type StudioComposeDisposition = (typeof STUDIO_COMPOSE_DISPOSITIONS)[number];

/** Exact enum from schemas/converter/source-review.schema.json entry.disposition. */
export const STUDIO_REVIEW_DISPOSITIONS = [
  "MAPPED",
  "EXCLUDED_WITH_REASON",
  "DECORATION_MERGED",
  "REFERENCE_ONLY",
  "NEEDS_REVIEW",
] as const;
export type StudioReviewDisposition = (typeof STUDIO_REVIEW_DISPOSITIONS)[number];

/** Exact severity enum from schemas/converter/common.defs.json diagnostic + tool-run runDiagnostics. */
export const STUDIO_SEVERITIES = ["info", "warning", "error"] as const;
export type StudioSeverity = (typeof STUDIO_SEVERITIES)[number];

/** Whether this StudioRunView was read from a labeled DEMO fixture or a real DET run directory. */
export const STUDIO_RUN_MODES = ["fixture", "live"] as const;
export type StudioRunMode = (typeof STUDIO_RUN_MODES)[number];

/** Exact enum from schemas/converter/node-ir.schema.json node.kind. */
export const STUDIO_NODE_KINDS = [
  "page-section",
  "container",
  "component",
  "text",
  "media",
  "icon",
  "divider",
  "spacer",
  "unknown",
] as const;
export type StudioNodeKind = (typeof STUDIO_NODE_KINDS)[number];

/** Exact enum from schemas/converter/source-review.schema.json entry.semanticClass. */
export const STUDIO_SEMANTIC_CLASSES = [
  "SITE_CHROME",
  "EDITORIAL_SECTION",
  "SHARED_COMPONENT",
  "PRESENTATIONAL",
  "UNKNOWN_OR_AMBIGUOUS",
] as const;
export type StudioSemanticClass = (typeof STUDIO_SEMANTIC_CLASSES)[number];

/** Which DET artifact a diagnostic row was carried over from (Studio-side provenance). */
export const STUDIO_DIAGNOSTIC_ORIGINS = ["run", "compose", "review"] as const;
export type StudioDiagnosticOrigin = (typeof STUDIO_DIAGNOSTIC_ORIGINS)[number];

/**
 * Closed major-1 role enum from schemas/cli/tool-run.schema.json artifacts[].role.
 * `compose-report`, `native-content` and `build-manifest` are the additive
 * roles tool-run schema 1.4.0 already carries (documented by the [36]/[40]
 * receipts); the reader still treats roles as open strings.
 */
export const STUDIO_ARTIFACT_ROLES = [
  "registry",
  "resolution-report",
  "node-ir",
  "page-structure",
  "source-review",
  "profile-input",
  "binding-map",
  "structure-input",
  "adapter-descriptor",
  "kb-ingest-manifest",
  "kb-records",
  "kb-query-result",
  "kb-sync-report",
  "kb-store-descriptor",
  "compose-report",
  "native-content",
  "build-manifest",
] as const;
export type StudioArtifactRole = (typeof STUDIO_ARTIFACT_ROLES)[number];

/** Where a mapping's compose target landed (schemas/cli/compose-output.schema.json mappingEntry.target). */
export const StudioTargetRefSchema = z.object({
  capabilityId: z.string().min(1),
  appearanceId: z.string().min(1),
  nativeElement: z.string().min(1).optional(),
  nativeField: z.string().min(1).optional(),
});
export type StudioTargetRef = z.infer<typeof StudioTargetRefSchema>;

/** One ordered PageStructure section, as the review UI lists it. */
export const StudioSectionViewSchema = z.object({
  /** Stable engine id, pattern `^s-[0-9a-f]{12}$` in engine payloads. */
  sectionId: z.string().min(1),
  order: z.number().int().min(0),
  name: z.string().min(1),
  role: z.string().optional(),
  /** Number of PageStructure elements planned into this section. */
  elementCount: z.number().int().min(0),
  /** design:// source locators of the section's source node(s). */
  sourceLocators: z.array(z.string()),
});
export type StudioSectionView = z.infer<typeof StudioSectionViewSchema>;

/**
 * One row of the mapping review: the compose mappingEntry joined with the
 * source-review entry for the same node when the run carries both.
 */
export const StudioMappingViewSchema = z.object({
  /** Engine node id, pattern `^n-[0-9a-f]{12}$` in engine payloads. */
  nodeId: z.string().min(1),
  sourceName: z.string().optional(),
  sourceLocator: z.string().optional(),
  /** Canonical engine disposition — exactly one of the five, never a UI invention. */
  composeDisposition: z.enum(STUDIO_COMPOSE_DISPOSITIONS),
  /** Review-side disposition when a source-review entry exists for this node. */
  reviewDisposition: z.enum(STUDIO_REVIEW_DISPOSITIONS).optional(),
  kind: z.enum(STUDIO_NODE_KINDS).optional(),
  semanticClass: z.enum(STUDIO_SEMANTIC_CLASSES).optional(),
  sectionId: z.string().optional(),
  /** Present (required by the engine) exactly when composeDisposition is "mapped". */
  target: StudioTargetRefSchema.nullable().optional(),
  note: z.string().optional(),
  /** Review/gap reasons, one sentence each, from source-review reason + gap diagnostics. */
  reasons: z.array(z.string()),
  /**
   * DERIVED review flag — true when the review disposition is NEEDS_REVIEW or an
   * attached diagnostic demands human review. Never persisted as a disposition.
   */
  needsReview: z.boolean(),
});
export type StudioMappingView = z.infer<typeof StudioMappingViewSchema>;

/** One diagnostic row carried over from run/compose/review artifacts. */
export const StudioDiagnosticViewSchema = z.object({
  severity: z.enum(STUDIO_SEVERITIES),
  code: z.string().optional(),
  message: z.string().min(1),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  origin: z.enum(STUDIO_DIAGNOSTIC_ORIGINS),
});
export type StudioDiagnosticView = z.infer<typeof StudioDiagnosticViewSchema>;

/** One entry of the tool-run artifact manifest. `downloadable` is Studio-derived truth. */
export const StudioArtifactViewSchema = z.object({
  /** Stable Studio id for the artifact, e.g. `${role}/${file}`. */
  artifactId: z.string().min(1),
  role: z.string().min(1),
  /** Relative path as written under the run's out dir. NEVER an absolute path. */
  file: z.string().optional(),
  schemaRef: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  volatileContentHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /**
   * [40] build bundles: the build-manifest's per-FILE-BYTE sha256 — the
   * verification hash Studio re-checks before any download. Deliberately
   * distinct from the canonical-payload `contentHash` (documented engine
   * distinction); legacy runs leave it unset.
   */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** True only when the reader can serve a real, validated file for this artifact. */
  downloadable: z.boolean(),
});
export type StudioArtifactView = z.infer<typeof StudioArtifactViewSchema>;

/** Exact stage enum from schemas/cli/build-manifest.schema.json stages[].stage. */
export const STUDIO_BUILD_STAGES = ["capability-probe", "extraction", "composition"] as const;
export type StudioBuildStageName = (typeof STUDIO_BUILD_STAGES)[number];

/** Exact status enum from schemas/cli/build-manifest.schema.json stages[].status. */
export const STUDIO_BUILD_STAGE_STATUSES = ["completed", "reused", "failed", "planned"] as const;
export type StudioBuildStageStatus = (typeof STUDIO_BUILD_STAGE_STATUSES)[number];

/** One row of a build bundle's stage table (build-manifest stages[]). */
export const StudioBuildStageViewSchema = z.object({
  stage: z.enum(STUDIO_BUILD_STAGES),
  status: z.enum(STUDIO_BUILD_STAGE_STATUSES),
  exitCode: z.number().int().min(0).max(3),
  /** Stage output directory relative to the bundle root, as the manifest recorded it. */
  outDir: z.string().optional(),
});
export type StudioBuildStageView = z.infer<typeof StudioBuildStageViewSchema>;

/** One honest build gap (build-manifest gaps[]): a precise boundary, never a claim. */
export const StudioBuildGapViewSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  count: z.number().int().min(1).optional(),
});
export type StudioBuildGapView = z.infer<typeof StudioBuildGapViewSchema>;

/**
 * [40] additive optional `build` block (Coordinator decision, issue #36):
 * present only when the run view was assembled from a `det build` bundle.
 * Existing runs parse unchanged without it. `manifestVerified` is Studio-side
 * truth — whether EVERY manifest-declared output's on-disk bytes and size
 * match the recorded sha256/bytes; when false, downloads of manifest outputs
 * are hard-refused.
 */
export const StudioBuildViewSchema = z.object({
  manifestVerified: z.boolean(),
  /** The manifest's declared config content hash (identity of what was asked). */
  configContentHash: z.string().min(1),
  stages: z.array(StudioBuildStageViewSchema),
  gaps: z.array(StudioBuildGapViewSchema),
});
export type StudioBuildView = z.infer<typeof StudioBuildViewSchema>;

/**
 * Preview honesty contract: an unavailable preview is a normal, rendered state —
 * not an error to hide. `available` may only ever appear with `verified: true`
 * and a real URL supplied by the engine boundary; Studio never invents either.
 */
export const StudioPreviewStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unavailable"),
    reason: z.string().min(1),
  }),
  z.object({
    status: z.literal("available"),
    verified: z.literal(true),
    url: z.string().min(1),
    label: z.string().min(1),
  }),
]);
export type StudioPreviewState = z.infer<typeof StudioPreviewStateSchema>;

/**
 * The one read model every Studio lane consumes. Counts are nullable because an
 * unknown count must stay unknown; provenance (mode + revision + hashes) is
 * mandatory so fixture data can never masquerade as a live conversion.
 */
export const StudioRunViewSchema = z.object({
  runId: z.string().min(1),
  mode: z.enum(STUDIO_RUN_MODES),
  /** Human-facing run label. Fixture runs must say DEMO here. */
  label: z.string().min(1),
  /** ISO 8601 when the engine recorded it; null = unknown. */
  generatedAt: z.string().nullable(),
  exitCode: z.number().int().nullable(),
  toolCommand: z.string().nullable(),
  profileId: z.string().nullable(),
  platformId: z.string().nullable(),
  source: z.object({
    sourceId: z.string().nullable(),
    revisionId: z.string().nullable(),
    accessedAt: z.string().nullable(),
  }),
  counts: z.object({
    errors: z.number().int().nullable(),
    warnings: z.number().int().nullable(),
    infos: z.number().int().nullable(),
  }),
  sections: z.array(StudioSectionViewSchema),
  mappings: z.array(StudioMappingViewSchema),
  diagnostics: z.array(StudioDiagnosticViewSchema),
  artifacts: z.array(StudioArtifactViewSchema),
  preview: StudioPreviewStateSchema,
  /**
   * [40] additive optional build-bundle block — present ONLY for runs
   * assembled from a `det build` bundle; legacy runs parse unchanged.
   */
  build: StudioBuildViewSchema.optional(),
});
export type StudioRunView = z.infer<typeof StudioRunViewSchema>;

/** List-row projection returned by DetRunReader.listRuns(). */
export const DetRunSummarySchema = z.object({
  runId: z.string().min(1),
  mode: z.enum(STUDIO_RUN_MODES),
  label: z.string().min(1),
  generatedAt: z.string().nullable(),
  sourceId: z.string().nullable(),
  revisionId: z.string().nullable(),
  counts: z.object({
    errors: z.number().int().nullable(),
    warnings: z.number().int().nullable(),
    infos: z.number().int().nullable(),
  }),
});
export type DetRunSummary = z.infer<typeof DetRunSummarySchema>;

/**
 * Invariant checks over an assembled read model that zod's field schemas cannot
 * express. The reader (fixture or live) MUST pass these before returning a run:
 *  - every `mapped` mapping carries a target (engine rule)
 *  - every mapping's needsReview agrees with its review disposition
 *  - preview availability is always verified or absent
 */
export function assertStudioRunViewInvariants(run: StudioRunView): void {
  for (const m of run.mappings) {
    if (m.composeDisposition === "mapped" && !(m.target && m.target.capabilityId && m.target.appearanceId)) {
      throw new Error(
        `StudioRunView invariant violated: mapping ${m.nodeId} is "mapped" without a target (capabilityId/appearanceId).`
      );
    }
    const derivedNeedsReview = m.reviewDisposition === "NEEDS_REVIEW";
    if (m.needsReview && !derivedNeedsReview) {
      throw new Error(
        `StudioRunView invariant violated: mapping ${m.nodeId} sets needsReview without reviewDisposition NEEDS_REVIEW.`
      );
    }
  }
  if (run.preview.status === "available" && run.preview.verified !== true) {
    throw new Error("StudioRunView invariant violated: available preview must be verified:true.");
  }
}
