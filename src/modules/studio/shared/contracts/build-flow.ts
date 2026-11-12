/**
 * [70] FROZEN cross-lane contract — the one-click Build flow.
 *
 * Integrator-owned file (issue #70 multi-worker contract): worker lanes W-A…
 * W-E code against EXACTLY these names/shapes and never edit this file.
 * Conflicts about this contract are resolved by the Integrator only.
 *
 * Frozen decisions (recorded in the #70 contract-freeze comment):
 *  - ONE flow, no human plan approval: POST /api/build-flow starts the whole
 *    pipeline (verify source → pinned-snapshot reuse → AI analysis →
 *    deterministic mapping handoff → det build → results) and returns 202
 *    immediately; the orchestrator continues in the background with a
 *    restart-safe journal under `<STUDIO_DET_RUNS_DIR>/.build-flow-jobs/`.
 *  - Six truthful stages; where the engine cannot instrument two operations
 *    separately they stay combined — no invented parallelism, no percent
 *    progress, no fake timings.
 *  - The AI plan is NEVER user-approved: the deterministic materializer
 *    (existing `materializeApprovedInputs`) runs automatically on a grounded
 *    plan-ready analysis. Its provenance record stays derivedFrom
 *    "agent-plan"; the flow journal records the handoff as automatic.
 *  - Output targets: `magento-page-builder` is the ONLY enabled target;
 *    `hyva-phtml` is a NOT-IMPLEMENTED selector entry (disabled, honest
 *    "Chưa hỗ trợ") that the server rejects with `unsupported-target`.
 *  - Environment readiness is factual and server-side: every mutating route
 *    re-checks readiness immediately before accepting work and fails closed
 *    with `environment-not-ready` (503). UI state is never authorization.
 *    GET routes, artifact downloads and safe cancels stay ungated.
 *  - det build gains NO new stage name: the PHP installer bundle artifacts are
 *    composition-stage outputs with NEW additive build-manifest roles
 *    (`cms-installer`, `native-content-copy`, `mapping-gap-report`,
 *    `operator-readme`) — the Studio reader treats roles as open strings.
 */
import { z } from "zod";

/* ------------------------------ request ------------------------------- */

/**
 * Closed output-target vocabulary for the [70] Build flow. UI labels:
 * `magento-page-builder` → "Magento Page Builder" (enabled);
 * `hyva-phtml` → "Hyvä PHTML" (disabled + "Chưa hỗ trợ").
 */
export const BUILD_FLOW_OUTPUT_TARGETS = [
   "magento-page-builder",
   "hyva-phtml",
] as const;
export type BuildFlowOutputTarget = (typeof BUILD_FLOW_OUTPUT_TARGETS)[number];

/** The parsed + identity-pinned source a flow actually runs on. */
export interface BuildFlowRequest {
   /** Normalized Figma file key (from the URL or the pinned binding). */
   fileKey: string;
   /** Normalized Figma node id, `number:number` (e.g. `245:2`). */
   nodeId: string;
   /** Pattern-checked build-config catalog id the flow builds from. */
   baseConfigId: string;
   target: BuildFlowOutputTarget;
}

/* ------------------------------- stages -------------------------------- */

/**
 * The six truthful operator-visible stages, in fixed order. Mapping to real
 * engine/agent boundaries:
 *  1 `verify-source` — parse input, resolve the catalog entry, check the
 *    committed source-identity binding (fail closed on any mismatch).
 *  2 `snapshot` — the pinned offline snapshot is REUSED (never a live fetch in
 *    this milestone); the record says so honestly, carrying the pinned
 *    revision when known.
 *  3 `ai-analysis` — the existing local Claude Code + Figma MCP agent runner.
 *  4 `mapping` — deterministic materialization of the grounded plan into the
 *    approved build inputs (NO user approval click).
 *  5 `compose` — the existing deterministic `det build` child (which now also
 *    emits the PHP installer bundle artifacts).
 *  6 `results` — bundle verification summary + artifact links.
 */
export const BUILD_FLOW_STAGES = [
   "verify-source",
   "snapshot",
   "ai-analysis",
   "mapping",
   "compose",
   "results",
] as const;
export type BuildFlowStageName = (typeof BUILD_FLOW_STAGES)[number];

/** Operator-visible stage statuses — Vietnamese labels frozen below. */
export const BUILD_FLOW_STAGE_STATUSES = [
   "pending",
   "running",
   "success",
   "warning",
   "failure",
   "cancelled",
   "skipped",
] as const;
export type BuildFlowStageStatus = (typeof BUILD_FLOW_STAGE_STATUSES)[number];

export const BUILD_FLOW_STAGE_LABELS_VI: Record<BuildFlowStageName, string> = {
   "verify-source": "Xác thực nguồn",
   snapshot: "Đọc thiết kế",
   "ai-analysis": "AI phân tích",
   mapping: "Chuẩn hóa & mapping",
   compose: "Sinh Page Builder",
   results: "Kết quả",
};

export const BUILD_FLOW_STAGE_STATUS_LABELS_VI: Record<
   BuildFlowStageStatus,
   string
> = {
   pending: "Chờ",
   running: "Đang chạy",
   success: "Hoàn tất",
   warning: "Có cảnh báo",
   failure: "Thất bại",
   cancelled: "Đã hủy",
   skipped: "Bỏ qua",
};

/* -------------------------------- run ---------------------------------- */

export const BUILD_FLOW_STATES = [
   "queued",
   "running",
   "completed",
   "failed",
   "cancelled",
   "interrupted",
] as const;
export type BuildFlowState = (typeof BUILD_FLOW_STATES)[number];

/** One stage row of a flow snapshot (fixed six-row order). */
export interface BuildFlowStageRecord {
   stage: BuildFlowStageName;
   status: BuildFlowStageStatus;
   startedAt: string | null;
   finishedAt: string | null;
   /** The agent analysis id driving the `ai-analysis` stage (else null). */
   analysisId: string | null;
   /** The det build run id driving the `compose` stage (else null). */
   buildRunId: string | null;
   /** Bounded, sanitized operator-facing note (Vietnamese; never a secret). */
   message: string | null;
}

/** The one transport/journal shape every build-flow surface exchanges. */
export interface BuildFlowRunSnapshot {
   /** Studio id, `flow-<digits>` — RUN_ID_PATTERN-safe. */
   flowId: string;
   journalSchemaVersion: 1;
   state: BuildFlowState;
   request: BuildFlowRequest;
   /** All six stages, fixed order; later stages sit at `pending`. */
   stages: BuildFlowStageRecord[];
   currentStage: BuildFlowStageName | null;
   /** Terminal/failed reason — null while queued/running/completed cleanly. */
   error: { code: BuildFlowErrorCode; message: string } | null;
   startedAt: string | null;
   finishedAt: string | null;
   /** Orchestrator liveness marker; a stale `running` pid reads `interrupted`. */
   pid: number | null;
}

export const BuildFlowRunSnapshotSchema: z.ZodType<BuildFlowRunSnapshot> =
   z.object({
      flowId: z.string().regex(/^flow-\d+$/),
      journalSchemaVersion: z.literal(1),
      state: z.enum(BUILD_FLOW_STATES),
      request: z.object({
         fileKey: z.string().min(1),
         nodeId: z.string().min(1),
         baseConfigId: z.string().min(1),
         target: z.enum(BUILD_FLOW_OUTPUT_TARGETS),
      }),
      stages: z
         .array(
            z.object({
               stage: z.enum(BUILD_FLOW_STAGES),
               status: z.enum(BUILD_FLOW_STAGE_STATUSES),
               startedAt: z.string().nullable(),
               finishedAt: z.string().nullable(),
               analysisId: z.string().nullable(),
               buildRunId: z.string().nullable(),
               message: z.string().nullable(),
            }),
         )
         .length(BUILD_FLOW_STAGES.length),
      currentStage: z.enum(BUILD_FLOW_STAGES).nullable(),
      error: z
         .object({
            code: z.string().min(1),
            message: z.string().min(1),
         })
         .nullable(),
      startedAt: z.string().nullable(),
      finishedAt: z.string().nullable(),
      pid: z.number().int().nullable(),
   }) as z.ZodType<BuildFlowRunSnapshot>;

/* ------------------------------- errors -------------------------------- */

/** Closed error-code vocabulary across every /api/build-flow response. */
export const BUILD_FLOW_ERROR_CODES = [
   /** 503 — server-side readiness gate failed (never a UI-only block). */
   "environment-not-ready",
   /** 400 — malformed body / unparseable Figma input. */
   "invalid-input",
   /** 422 — hyva-phtml or any not-implemented target. */
   "unsupported-target",
   /** 422 — input does not match any committed source-identity binding. */
   "source-not-pinned",
   /** 409 — one flow at a time; payload carries the active snapshot. */
   "flow-busy",
   /** 404 — unknown flow id. */
   "flow-not-found",
   /** 409 — cancel of an already-terminal flow. */
   "flow-not-cancellable",
   /** 500 — unexpected server error (never hides a real failure). */
   "internal-error",
] as const;
export type BuildFlowErrorCode = (typeof BUILD_FLOW_ERROR_CODES)[number];

/** Canonical HTTP status per error code (single mapping, no per-route drift). */
export const BUILD_FLOW_ERROR_STATUS: Record<BuildFlowErrorCode, number> = {
   "environment-not-ready": 503,
   "invalid-input": 400,
   "unsupported-target": 422,
   "source-not-pinned": 422,
   "flow-busy": 409,
   "flow-not-found": 404,
   "flow-not-cancellable": 409,
   "internal-error": 500,
};

/* -------------------------- environment readiness ----------------------- */

/**
 * Per-check reason codes. `claudeCode`/`figmaMcp` reuse the [65] preflight
 * codes verbatim; `detRunsDir` is the [70] addition (STUDIO_DET_RUNS_DIR).
 */
export type StudioDetRunsDirReasonCode =
   "ok" | "not-configured" | "not-a-directory";

export interface StudioReadinessChecks {
   claudeCode: {
      ready: boolean;
      version: string | null;
      reasonCode: string;
   };
   figmaMcp: {
      ready: boolean;
      listed: boolean;
      serverName: string | null;
      reasonCode: string;
   };
   detRunsDir: {
      ready: boolean;
      reasonCode: StudioDetRunsDirReasonCode;
      /** The env NAME only — never the configured VALUE. */
      envName: "STUDIO_DET_RUNS_DIR";
   };
}

/** GET /api/environment response + the server guard's result type. */
export interface StudioReadinessStatus {
   /** True only when EVERY check above is ready. */
   ready: boolean;
   checks: StudioReadinessChecks;
}

/* --------------------------- frozen API shapes -------------------------- */
/**
 * POST /api/build-flow      body {figmaInput: string; target: string}
 *                           → 202 {flowId, state} | 4xx/5xx {error:{code,message}, ...}
 * GET  /api/build-flow      → 200 {active: BuildFlowRunSnapshot | null}
 * GET  /api/build-flow/:id  → 200 BuildFlowRunSnapshot | 404 {error}
 * POST /api/build-flow/:id/cancel → 200 {snapshot} | 404 | 409 {error}
 * GET  /api/environment     → 200 StudioReadinessStatus (never gated; it IS
 *                             the check — detection failures land in checks).
 *
 * `figmaInput` accepts exactly what `parseFigmaInput` accepts (full design URL
 * with node-id, or bare node id inside the selected verified file). The base
 * config is NOT client-selected: the server binds the parsed source to the ONE
 * catalog entry whose committed source-identity matches — no match fails
 * closed with `source-not-pinned`.
 *
 * Server error envelope (every non-2xx): `{error: {code, message}}` with
 * status from BUILD_FLOW_ERROR_STATUS; `environment-not-ready` adds
 * `{checks}`; `flow-busy` adds `{active}`.
 */

/* -------------------------- installer artifacts ------------------------- */

/**
 * [70] frozen artifact file names of the generated Magento Page Builder
 * install bundle (all listed in build-manifest.json outputs, all
 * downloadable through the existing run artifact routes):
 */
export const BUILD_FLOW_ARTIFACT_FILES = {
   installer: "install-homepage.php",
   pageBuilderContent: "pagebuilder-content.html",
   manifest: "build-manifest.json",
   mappingAndGaps: "mapping-and-gaps.json",
   readme: "README.md",
} as const;

/**
 * NEW ADDITIVE build-manifest output roles (schema minor extension, W-D):
 * the Studio reader keeps roles open strings, so no Studio change is needed.
 * `pagebuilder-content.html` is a byte-exact copy of the composed
 * `native-content.html` under the frozen operator-facing name.
 */
export const BUILD_FLOW_ARTIFACT_ROLES = {
   installer: "cms-installer",
   pageBuilderContent: "native-content-copy",
   mappingAndGaps: "mapping-gap-report",
   readme: "operator-readme",
} as const;
