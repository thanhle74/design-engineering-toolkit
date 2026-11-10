/**
 * [40] DET Studio — build-bundle reader for `det build --config` output.
 *
 * A build bundle is one run directory whose ROOT carries `build-manifest.json`
 * (schema `schemas/cli/build-manifest.schema.json`, kind `det-build-manifest`)
 * and NO root `tool-run.json`: the per-stage tool-run envelopes live inside
 * the stage directories. DirectoryDetRunReader dispatches bundle-shaped dirs
 * here ([40] discovery seam) — the DetRunReader contract, the factory env and
 * the frozen StudioRunView all stay untouched except the Coordinator-approved
 * additive optional `build` block.
 *
 * Honesty and verification rules (issue #40 / Coordinator decisions):
 *  - The root manifest is the TRUST ANCHOR. It is never treated as a
 *    self-hashed output; it is downloadable as-is (contained + allowlisted).
 *  - Before ANY declared output is downloadable, its on-disk bytes and size
 *    are re-checked against the manifest's per-FILE-BYTE sha256/bytes. A
 *    mismatch is a hard refusal (DetRunReaderError "invalid-payload") — the
 *    bytes never leave the server.
 *  - `manifestVerified` is Studio-side truth over EVERY declared output; a
 *    failed/missing/tampered output fails the whole bundle's verification
 *    flag while the stage table stays truthfully as the engine recorded it.
 *  - Stage provenance, gaps and the compose mapping/dispositions all come
 *    from the actual engine artifacts — shared assembly (assemble-run-view),
 *    never a parallel parser. Preview stays unavailable: native Page Builder
 *    HTML is source/download only, never a Magento storefront/Admin preview.
 *  - Offline only: no network, no schema dereferencing (schemaRef strings are
 *    the local schema family names; Studio never fetches them).
 */
import "server-only";

import { createHash } from "node:crypto";

import {
  DetRunReaderError,
  STUDIO_BUILD_STAGES,
  STUDIO_BUILD_STAGE_STATUSES,
  type DetRunSummary,
  type StudioArtifactDownload,
  type StudioArtifactView,
  type StudioBuildGapView,
  type StudioBuildStageView,
  type StudioDiagnosticView,
  type StudioRunView,
} from "@/src/shared/contracts";

import {
  downloadContentType,
  isDownloadableExtension,
  isSafeRelativeArtifactPath,
  safeAttachmentFileName,
} from "./artifact-access";
import { assembleStudioRunView, validateAssembledRunView } from "./assemble-run-view";
import { canServeContainedFile, readContainedBytes, readJsonRecordIfPresent } from "./contained-read";
import {
  BUILD_MANIFEST_FILE,
  COMPOSE_REPORT_FALLBACK_FILE,
  COMPOSE_REPORT_ROLE,
  NODE_IR_FILE,
  PAGE_STRUCTURE_FILE,
  SOURCE_REVIEW_FILE,
  TOOL_RUN_FILE,
  countsFromToolRun,
  echoId,
  optionalString,
  payloadError,
  requireConsistentSource,
  requireRecord,
  requireString,
  runLabel,
  sumCounts,
  toDiagnosticView,
  type CountsView,
  type JsonRecord,
} from "./det-payload-parsing";

const HEX64 = /^[0-9a-f]{64}$/;
const CONFIG_HASH = /^sha256:[0-9a-f]{64}$/;

/**
 * Local schema-family names for bundle files that no stage envelope declares
 * (stage envelopes, the manifest itself). These are identity strings for the
 * schema the engine validates the file against — Studio never fetches them
 * ([35] schema-registry boundary). Stage-declared artifacts resolve their
 * schemaRef manifest-first from the stage envelope instead.
 */
const BUNDLE_ROLE_SCHEMA_FALLBACK: Record<string, string> = {
  "tool-run-envelope": "schemas/cli/tool-run.schema.json",
  "build-manifest": "schemas/cli/build-manifest.schema.json",
  registry: "schemas/converter/capability-registry.schema.json",
  "node-ir": "schemas/converter/node-ir.schema.json",
  "page-structure": "schemas/converter/page-structure.schema.json",
  "source-review": "schemas/converter/source-review.schema.json",
  "compose-report": "schemas/cli/compose-output.schema.json",
  "native-content": "schemas/cli/compose-output.schema.json#native-content",
};

export interface GuardedBuildManifest {
  profileId: string;
  platformId: string;
  sourceId: string;
  revisionId: string;
  configContentHash: string;
  stages: StudioBuildStageView[];
  gaps: StudioBuildGapView[];
  /** outputs[] keyed by bundle-relative path. */
  outputs: Map<string, { role: string; sha256: string; bytes: number }>;
  outputOrder: string[];
}

export interface BundleOutputVerification {
  ok: boolean;
  reason?: string;
}

/**
 * [40]/[50] Verify EVERY manifest-declared output: contained read, byte-size
 * match, per-FILE-BYTE sha256 match. Over-cap files cannot be verified within
 * the reader's 8 MiB bound and honestly fail verification (and downloads).
 * Shared by the bundle reader's download gating AND the [50] catalogue
 * indexer, so the DB can never record metadata the reader would refuse.
 */
export async function verifyBundleOutputs(
  runDir: string,
  guarded: GuardedBuildManifest
): Promise<Map<string, BundleOutputVerification>> {
  const verification = new Map<string, BundleOutputVerification>();
  for (const filePath of guarded.outputOrder) {
    const output = guarded.outputs.get(filePath)!;
    try {
      const bytes = await readContainedBytes(runDir, filePath, "invalid-payload");
      if (bytes === null) {
        verification.set(filePath, { ok: false, reason: "declared output is missing from the bundle" });
        continue;
      }
      const diskSha256 = createHash("sha256").update(bytes).digest("hex");
      if (diskSha256 !== output.sha256 || bytes.byteLength !== output.bytes) {
        verification.set(filePath, { ok: false, reason: "on-disk bytes do not match the manifest sha256/bytes" });
        continue;
      }
      verification.set(filePath, { ok: true });
    } catch (error) {
      verification.set(filePath, {
        ok: false,
        reason: error instanceof DetRunReaderError ? error.message : "verification read failed",
      });
    }
  }
  return verification;
}

/**
 * Field-scoped guard over a parsed build-manifest.json document. Shared by
 * the reader AND the runner's journal summary so a job can never summarize a
 * manifest the run page would refuse to render.
 */
export function guardBuildManifest(manifest: JsonRecord): GuardedBuildManifest {
  const kind = requireString(manifest.kind, "build-manifest.json kind");
  if (kind !== "det-build-manifest") {
    throw payloadError(`build-manifest.json kind: ${JSON.stringify(kind.slice(0, 60))} is not "det-build-manifest".`);
  }
  const profileId = requireString(manifest.profileId, "build-manifest.json profileId");
  const platformId = requireString(manifest.platformId, "build-manifest.json platformId");
  const source = requireRecord(manifest.source, "build-manifest.json source");
  const sourceId = requireString(source.sourceId, "build-manifest.json source.sourceId");
  const revisionId = requireString(source.revisionId, "build-manifest.json source.revisionId");
  const config = requireRecord(manifest.config, "build-manifest.json config");
  const configContentHash = requireString(config.contentHash, "build-manifest.json config.contentHash");
  if (!CONFIG_HASH.test(configContentHash)) {
    throw payloadError("build-manifest.json config.contentHash: expected sha256:<64 hex>.");
  }

  if (!Array.isArray(manifest.stages)) throw payloadError("build-manifest.json stages: expected an array.");
  const stages: StudioBuildStageView[] = manifest.stages.map((raw, index) => {
    const stage = requireRecord(raw, `build-manifest.json stages[${index}]`);
    const name = requireString(stage.stage, `build-manifest.json stages[${index}].stage`);
    if (!(STUDIO_BUILD_STAGES as readonly string[]).includes(name)) {
      throw payloadError(`build-manifest.json stages[${index}].stage: unknown stage "${name.slice(0, 60)}".`);
    }
    const status = requireString(stage.status, `build-manifest.json stages[${index}].status`);
    if (!(STUDIO_BUILD_STAGE_STATUSES as readonly string[]).includes(status)) {
      throw payloadError(`build-manifest.json stages[${index}].status: unknown status "${status.slice(0, 60)}".`);
    }
    const exitCode = stage.exitCode;
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode) || exitCode < 0 || exitCode > 3) {
      throw payloadError(`build-manifest.json stages[${index}].exitCode: expected an integer 0..3.`);
    }
    const outDir = optionalString(stage.outDir);
    if (outDir !== undefined && !isSafeRelativeArtifactPath(outDir)) {
      throw payloadError(`build-manifest.json stages[${index}].outDir: expected a safe bundle-relative path.`);
    }
    return {
      stage: name as StudioBuildStageView["stage"],
      status: status as StudioBuildStageView["status"],
      exitCode,
      ...(outDir === undefined ? {} : { outDir }),
    };
  });

  if (!Array.isArray(manifest.outputs)) throw payloadError("build-manifest.json outputs: expected an array.");
  const outputs = new Map<string, { role: string; sha256: string; bytes: number }>();
  const outputOrder: string[] = [];
  manifest.outputs.forEach((raw, index) => {
    const entry = requireRecord(raw, `build-manifest.json outputs[${index}]`);
    const filePath = requireString(entry.path, `build-manifest.json outputs[${index}].path`);
    if (!isSafeRelativeArtifactPath(filePath)) {
      throw payloadError(`build-manifest.json outputs[${index}].path: expected a safe bundle-relative path.`);
    }
    const role = requireString(entry.role, `build-manifest.json outputs[${index}].role`);
    const sha256 = requireString(entry.sha256, `build-manifest.json outputs[${index}].sha256`);
    if (!HEX64.test(sha256)) {
      throw payloadError(`build-manifest.json outputs[${index}].sha256: expected 64-char lowercase hex.`);
    }
    const bytes = entry.bytes;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 1) {
      throw payloadError(`build-manifest.json outputs[${index}].bytes: expected a positive integer.`);
    }
    if (outputs.has(filePath)) {
      throw payloadError(`build-manifest.json outputs[${index}].path: duplicate output path.`);
    }
    outputs.set(filePath, { role, sha256, bytes });
    outputOrder.push(filePath);
  });

  if (!Array.isArray(manifest.gaps)) throw payloadError("build-manifest.json gaps: expected an array.");
  const gaps: StudioBuildGapView[] = manifest.gaps.map((raw, index) => {
    const gap = requireRecord(raw, `build-manifest.json gaps[${index}]`);
    const code = requireString(gap.code, `build-manifest.json gaps[${index}].code`);
    const message = requireString(gap.message, `build-manifest.json gaps[${index}].message`);
    const count = gap.count;
    let countView: number | undefined;
    if (count !== undefined) {
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        throw payloadError(`build-manifest.json gaps[${index}].count: expected an integer >= 1.`);
      }
      countView = count;
    }
    return { code, message, ...(countView === undefined ? {} : { count: countView }) };
  });

  return { profileId, platformId, sourceId, revisionId, configContentHash, stages, gaps, outputs, outputOrder };
}

/** Overall engine exit code derived from the persisted stage table (engine semantics). [50] shared with the catalogue indexer. */
export function deriveBundleExitCode(stages: StudioBuildStageView[]): number {
  const failed = stages.filter((s) => s.status === "failed");
  if (failed.length === 0) return 0;
  return failed[failed.length - 1].exitCode;
}

export class BuildBundleReader {
  /**
   * Bundle list-row summary, or null when the directory carries no root
   * build manifest (caller falls back to the legacy path). A PRESENT but
   * malformed manifest throws invalid-payload so listRuns can skip the
   * corrupt candidate exactly as it skips corrupt legacy runs.
   */
  async listSummary(runId: string, runDir: string): Promise<DetRunSummary | null> {
    const manifest = await this.parseManifest(runDir);
    if (manifest === null) return null;
    const guarded = guardBuildManifest(manifest);
    return {
      runId,
      mode: "live",
      label: runLabel(runId, "build", guarded.profileId),
      // The build manifest deliberately records no timestamp — unknown stays unknown.
      generatedAt: null,
      sourceId: guarded.sourceId,
      revisionId: guarded.revisionId,
      counts: { errors: null, warnings: null, infos: null },
    };
  }

  /** Full read model for a bundle run (dispatched by DirectoryDetRunReader). */
  async getRun(runDir: string, runId: string): Promise<StudioRunView> {
    const manifest = await this.parseManifest(runDir);
    if (manifest === null) {
      throw new DetRunReaderError("run-not-found", `Run "${echoId(runId)}" has no readable build-manifest.json.`);
    }
    const guarded = guardBuildManifest(manifest);

    // Verification pass over EVERY declared output (also backs the download flags).
    const verification = await verifyBundleOutputs(runDir, guarded);
    const manifestVerified = guarded.outputOrder.every((p) => verification.get(p)?.ok === true);

    const { runOriginDiagnostics, stageCounts, schemaRefByRole } = await this.readStageEnvelopes(
      runDir,
      guarded
    );

    const compose = await this.readBundleJson(runDir, this.byRole(guarded, COMPOSE_REPORT_ROLE), this.stageFallback(guarded, "composition", COMPOSE_REPORT_FALLBACK_FILE));
    const review = await this.readBundleJson(runDir, this.byRole(guarded, "source-review"), this.stageFallback(guarded, "extraction", SOURCE_REVIEW_FILE));
    const pageStructure = await this.readBundleJson(runDir, this.byRole(guarded, "page-structure"), this.stageFallback(guarded, "extraction", PAGE_STRUCTURE_FILE));
    const nodeIr = await this.readBundleJson(runDir, this.byRole(guarded, "node-ir"), this.stageFallback(guarded, "extraction", NODE_IR_FILE));

    const composeFile = this.byRole(guarded, COMPOSE_REPORT_ROLE) ?? this.stageFallback(guarded, "composition", COMPOSE_REPORT_FALLBACK_FILE) ?? null;
    const assembled = await assembleStudioRunView({
      runId,
      toolRun: null,
      compose,
      composeFile,
      review,
      pageStructure,
      nodeIr,
      runOriginDiagnostics,
      buildBundle: {
        command: "build",
        profileId: guarded.profileId,
        platformId: guarded.platformId,
        generatedAt: null,
        exitCode: deriveBundleExitCode(guarded.stages),
        source: requireConsistentSource(
          { sourceId: guarded.sourceId, revisionId: guarded.revisionId },
          pageStructure?.source,
          review?.source,
          nodeIr?.source,
          compose?.source
        ),
        counts: sumCounts(stageCounts),
      },
      buildBlock: {
        manifestVerified,
        configContentHash: guarded.configContentHash,
        stages: guarded.stages,
        gaps: guarded.gaps,
      },
      listArtifactViews: async () => {
        const views: StudioArtifactView[] = guarded.outputOrder.map((filePath) => {
          const output = guarded.outputs.get(filePath)!;
          return {
            artifactId: filePath,
            role: output.role,
            file: filePath,
            schemaRef: schemaRefByRole.get(output.role) ?? BUNDLE_ROLE_SCHEMA_FALLBACK[output.role] ?? `build-manifest role ${output.role}`,
            sha256: output.sha256,
            downloadable: verification.get(filePath)?.ok === true,
          };
        });
        // The manifest itself is the trust anchor — downloadable as-is, never self-hashed.
        views.push({
          artifactId: BUILD_MANIFEST_FILE,
          role: "build-manifest",
          file: BUILD_MANIFEST_FILE,
          schemaRef: BUNDLE_ROLE_SCHEMA_FALLBACK["build-manifest"],
          downloadable: await canServeContainedFile(runDir, BUILD_MANIFEST_FILE),
        });
        return views;
      },
    });
    return validateAssembledRunView(runId, assembled);
  }

  /** Serve one verified bundle artifact (dispatched by DirectoryDetRunReader). */
  async readArtifact(runDir: string, runId: string, artifactId: string): Promise<StudioArtifactDownload> {
    const manifest = await this.parseManifest(runDir);
    if (manifest === null) {
      throw new DetRunReaderError("run-not-found", `Run "${echoId(runId)}" has no readable build-manifest.json.`);
    }
    const guarded = guardBuildManifest(manifest);

    // The trust anchor itself: contained + extension-allowlisted, never self-hashed.
    if (artifactId === BUILD_MANIFEST_FILE) {
      const bytes = await readContainedBytes(runDir, BUILD_MANIFEST_FILE, "artifact-not-downloadable");
      if (bytes === null) {
        throw new DetRunReaderError("artifact-not-downloadable", "The build manifest file is not readable.");
      }
      return {
        artifactId,
        fileName: safeAttachmentFileName(BUILD_MANIFEST_FILE),
        contentType: downloadContentType(BUILD_MANIFEST_FILE) ?? "application/json",
        bytes,
      };
    }

    const output = guarded.outputs.get(artifactId);
    if (output === undefined) {
      throw new DetRunReaderError(
        "artifact-not-found",
        `Bundle "${echoId(runId)}" declares no output with path "${echoId(artifactId)}".`
      );
    }
    if (!isSafeRelativeArtifactPath(artifactId)) {
      throw new DetRunReaderError("path-refused", "The artifact path was refused: it is not a safe bundle-relative path.");
    }
    if (!isDownloadableExtension(artifactId)) {
      throw new DetRunReaderError("artifact-not-downloadable", "That artifact's extension is not on the download allowlist.");
    }

    const bytes = await readContainedBytes(runDir, artifactId, "artifact-not-downloadable");
    if (bytes === null) {
      throw new DetRunReaderError(
        "artifact-not-downloadable",
        "The manifest-declared output is not present in the bundle."
      );
    }

    // HARD REFUSAL: on-disk bytes/size must match the manifest's recorded
    // per-FILE-BYTE sha256/bytes before a single byte leaves the server.
    const diskSha256 = createHash("sha256").update(bytes).digest("hex");
    if (diskSha256 !== output.sha256 || bytes.byteLength !== output.bytes) {
      throw new DetRunReaderError(
        "invalid-payload",
        `Download refused: the on-disk bytes of "${echoId(artifactId)}" do not match the build manifest's recorded sha256/bytes. The bundle is tampered or stale — rebuild it; nothing is served while verification fails.`
      );
    }

    return {
      artifactId,
      fileName: safeAttachmentFileName(artifactId),
      contentType: downloadContentType(artifactId) ?? "application/octet-stream",
      bytes,
    };
  }

  /* ------------------------------ internals ------------------------------ */

  private async parseManifest(runDir: string): Promise<JsonRecord | null> {
    return readJsonRecordIfPresent(runDir, BUILD_MANIFEST_FILE, "invalid-payload");
  }

  private byRole(guarded: GuardedBuildManifest, role: string): string | undefined {
    return guarded.outputOrder.find((p) => guarded.outputs.get(p)?.role === role);
  }

  private stageFallback(guarded: GuardedBuildManifest, stage: StudioBuildStageView["stage"], fileName: string): string | undefined {
    const outDir = guarded.stages.find((s) => s.stage === stage)?.outDir;
    return outDir === undefined ? undefined : `${outDir}/${fileName}`;
  }

  private readBundleJson(runDir: string, manifestPath: string | undefined, fallbackPath: string | undefined): Promise<JsonRecord | null> {
    const candidate = manifestPath ?? fallbackPath;
    if (candidate === undefined) return Promise.resolve(null);
    return readJsonRecordIfPresent(runDir, candidate, "invalid-payload");
  }

  /**
   * Read every stage's tool-run envelope (manifest-first by stage outDir):
   * contributes run-origin diagnostics, summed counts, and the role→schemaRef
   * map from each envelope's own artifacts[] entries. A stage envelope is
   * optional (a pre-stage failure may leave none).
   */
  private async readStageEnvelopes(
    runDir: string,
    guarded: GuardedBuildManifest
  ): Promise<{
    runOriginDiagnostics: StudioDiagnosticView[];
    stageCounts: Array<CountsView | null>;
    schemaRefByRole: Map<string, string>;
  }> {
    const runOriginDiagnostics: StudioDiagnosticView[] = [];
    const stageCounts: Array<CountsView | null> = [];
    const schemaRefByRole = new Map<string, string>();

    for (const stage of guarded.stages) {
      if (stage.outDir === undefined) continue;
      const envelopePath = `${stage.outDir}/${TOOL_RUN_FILE}`;
      const envelope = await readJsonRecordIfPresent(runDir, envelopePath, "invalid-payload");
      if (envelope === null) continue;
      stageCounts.push(countsFromToolRun(envelope.counts));
      if (Array.isArray(envelope.runDiagnostics)) {
        envelope.runDiagnostics.forEach((raw, index) => {
          runOriginDiagnostics.push(toDiagnosticView(raw, "run", `${envelopePath} runDiagnostics[${index}]`));
        });
      }
      if (Array.isArray(envelope.artifacts)) {
        envelope.artifacts.forEach((raw, index) => {
          const entry = requireRecord(raw, `${envelopePath} artifacts[${index}]`);
          const role = requireString(entry.role, `${envelopePath} artifacts[${index}].role`);
          const schemaRef = requireString(entry.schemaRef, `${envelopePath} artifacts[${index}].schemaRef`);
          if (!schemaRefByRole.has(role)) schemaRefByRole.set(role, schemaRef);
        });
      }
    }
    return { runOriginDiagnostics, stageCounts, schemaRefByRole };
  }
}
