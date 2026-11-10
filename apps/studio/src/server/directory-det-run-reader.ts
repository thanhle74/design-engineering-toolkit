/**
 * [29]/[40] DET Studio — read-only DetRunReader over a configured local DET
 * output root (`STUDIO_DET_RUNS_DIR`).
 *
 * One immediate subdirectory = one run, named by its run id. Since [40], a
 * run directory comes in TWO shapes, dispatched by its root files:
 *  - legacy `[29]` command runs: root `tool-run.json` required — assembled as
 *    before from the artifacts that command wrote (partial runs assemble
 *    truthfully with what is present).
 *  - `[40]` build bundles: root `build-manifest.json` (written by
 *    `det build --config`, schema `schemas/cli/build-manifest.schema.json`)
 *    delegates to BuildBundleReader, which joins the stage artifacts and
 *    verifies every declared output's on-disk bytes against the manifest's
 *    per-FILE-BYTE sha256 before anything is downloadable.
 *
 * The reader never invokes the det CLI, child processes, the Figma API or the
 * network, and never writes. Preview is ALWAYS unavailable: no verified DET
 * Preview Theme output is bound to Studio yet ([28] owns the preview theme),
 * so there is nothing to serve and Studio must not invent a URL.
 *
 * Security (see `artifact-access.ts`): run ids are pattern-validated before any
 * path is built, every candidate file is realpath'd and must stay inside the
 * run directory, manifest-declared file strings must be safe relative paths,
 * extensions are allowlisted, and files are capped at 8 MiB.
 */
import "server-only";

import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  DetRunReaderError,
  type DetRunReader,
  type DetRunSummary,
  type StudioArtifactDownload,
  type StudioRunView,
} from "@/src/shared/contracts";

import {
  RUN_ID_PATTERN,
  downloadContentType,
  isDownloadableExtension,
  isInsideDir,
  isSafeRelativeArtifactPath,
  safeAttachmentFileName,
} from "./artifact-access";
import {
  assembleStudioRunView,
  makeEnvelopeArtifactViews,
  validateAssembledRunView,
} from "./assemble-run-view";
import { BuildBundleReader } from "./build-bundle-reader";
import { readContainedBytes, readJsonRecordIfPresent } from "./contained-read";
import {
  BUILD_MANIFEST_FILE,
  NODE_IR_FILE,
  PAGE_STRUCTURE_FILE,
  SOURCE_REVIEW_FILE,
  TOOL_RUN_FILE,
  countsFromToolRun,
  echoId,
  optionalString,
  requireRecord,
  requireString,
  resolveComposeReportFile,
  runLabel,
  type JsonRecord,
} from "./det-payload-parsing";

export class DirectoryDetRunReader implements DetRunReader {
  private readonly configuredRoot: string;
  private readonly bundleReader = new BuildBundleReader();
  private rootRealPromise: Promise<string> | null = null;

  constructor(configuredRoot: string) {
    if (typeof configuredRoot !== "string" || configuredRoot.trim() === "") {
      throw new DetRunReaderError(
        "not-configured",
        "STUDIO_DET_RUNS_DIR is set but empty; it must point at a DET output root directory."
      );
    }
    this.configuredRoot = configuredRoot;
  }

  /** Validate + realpath the configured root exactly once, then cache it. */
  static async open(configuredRoot: string): Promise<DirectoryDetRunReader> {
    const reader = new DirectoryDetRunReader(configuredRoot);
    await reader.rootReal();
    return reader;
  }

  private rootReal(): Promise<string> {
    if (this.rootRealPromise === null) {
      this.rootRealPromise = (async () => {
        let resolved: string;
        try {
          resolved = await realpath(this.configuredRoot);
        } catch {
          throw new DetRunReaderError(
            "not-configured",
            "STUDIO_DET_RUNS_DIR is set but does not point to a readable directory."
          );
        }
        const info = await stat(resolved).catch(() => null);
        if (info === null || !info.isDirectory()) {
          throw new DetRunReaderError("not-configured", "STUDIO_DET_RUNS_DIR is set but is not a directory.");
        }
        return resolved;
      })();
    }
    return this.rootRealPromise;
  }

  /* ----------------------------- listing ---------------------------- */

  async listRuns(): Promise<readonly DetRunSummary[]> {
    const root = await this.rootReal();
    const dirents = await readdir(root, { withFileTypes: true }).catch(() => {
      throw new DetRunReaderError("not-configured", "STUDIO_DET_RUNS_DIR is set but cannot be listed.");
    });

    const summaries: DetRunSummary[] = [];
    for (const dirent of dirents) {
      // Only real subdirectories count: hidden/invalid names are rejected
      // silently (the runner's dot-prefixed `.build-jobs/` journal never
      // passes RUN_ID_PATTERN), symlinked directories are never followed as
      // runs, and a directory without a parseable root manifest is not a run.
      if (!dirent.isDirectory()) continue;
      if (!RUN_ID_PATTERN.test(dirent.name)) continue;
      const runDir = path.join(root, dirent.name);
      try {
        const summary =
          (await this.bundleReader.listSummary(dirent.name, runDir)) ??
          (await this.legacySummary(dirent.name, runDir));
        if (summary !== null) summaries.push(summary);
      } catch (error) {
        if (error instanceof DetRunReaderError) continue; // corrupt/unsafe candidate → silently not a run
        throw error;
      }
    }

    // Newest first; runs without a parseable timestamp last, then by id.
    summaries.sort((a, b) => {
      const timeA = Date.parse(a.generatedAt ?? "");
      const timeB = Date.parse(b.generatedAt ?? "");
      const valueA = Number.isNaN(timeA) ? Number.NEGATIVE_INFINITY : timeA;
      const valueB = Number.isNaN(timeB) ? Number.NEGATIVE_INFINITY : timeB;
      if (valueA !== valueB) return valueB - valueA;
      return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
    });
    return summaries;
  }

  /** Legacy summary: requires a parseable root `tool-run.json`. */
  private async legacySummary(runId: string, runDir: string): Promise<DetRunSummary | null> {
    const toolRun = await this.readJson(runDir, TOOL_RUN_FILE);
    if (toolRun === null) return null;
    const command = optionalString(toolRun.command);
    const profileId = optionalString(toolRun.profileId);
    return {
      runId,
      mode: "live",
      label: runLabel(runId, command, profileId),
      generatedAt: optionalString(toolRun.generatedAt) ?? null,
      // The ToolRun envelope carries no source revision; the list keeps the
      // source honestly unknown and getRun() fills it from the artifacts.
      sourceId: null,
      revisionId: null,
      counts: countsFromToolRun(toolRun.counts) ?? { errors: null, warnings: null, infos: null },
    };
  }

  /* ------------------------------ run ------------------------------- */

  async getRun(runId: string): Promise<StudioRunView> {
    const root = await this.rootReal();
    const runDir = await this.resolveRunDir(root, runId);

    // [40] dispatch: a root build-manifest.json makes this dir a build bundle
    // (the engine never writes a root tool-run.json for bundles).
    const bundleManifest = await this.readJson(runDir, BUILD_MANIFEST_FILE);
    if (bundleManifest !== null) {
      return this.bundleReader.getRun(runDir, runId);
    }

    const toolRun = await this.readJson(runDir, TOOL_RUN_FILE);
    if (toolRun === null) {
      throw new DetRunReaderError(
        "run-not-found",
        `Run "${echoId(runId)}" has neither a build-manifest.json nor a tool-run.json root manifest.`
      );
    }

    const composeFile = resolveComposeReportFile(toolRun);
    const compose = await this.readJson(runDir, composeFile);
    const review = await this.readJson(runDir, SOURCE_REVIEW_FILE);
    const pageStructure = await this.readJson(runDir, PAGE_STRUCTURE_FILE);
    const nodeIr = await this.readJson(runDir, NODE_IR_FILE);

    const assembled = await assembleStudioRunView({
      runId,
      toolRun,
      compose,
      composeFile,
      review,
      pageStructure,
      nodeIr,
      listArtifactViews: makeEnvelopeArtifactViews(runDir, toolRun),
    });
    return validateAssembledRunView(runId, assembled);
  }

  private async resolveRunDir(root: string, runId: string): Promise<string> {
    if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
      throw new DetRunReaderError("run-not-found", `No run directory matching the requested id "${echoId(runId)}".`);
    }
    const joined = path.join(root, runId);
    const info = await stat(joined).catch(() => null);
    if (info === null || !info.isDirectory()) {
      throw new DetRunReaderError("run-not-found", `No run with id "${echoId(runId)}" in the configured DET output root.`);
    }
    let resolved: string;
    try {
      resolved = await realpath(joined);
    } catch {
      throw new DetRunReaderError("run-not-found", `Run "${echoId(runId)}" is not readable.`);
    }
    if (!isInsideDir(resolved, root)) {
      throw new DetRunReaderError(
        "path-refused",
        "The requested run directory resolves outside the configured DET output root."
      );
    }
    return resolved;
  }

  /* ---------------------------- artifacts --------------------------- */

  async readArtifact(runId: string, artifactId: string): Promise<StudioArtifactDownload> {
    const root = await this.rootReal();
    const runDir = await this.resolveRunDir(root, runId);

    // [40] dispatch: bundle runs verify against the build manifest inventory.
    const bundleManifest = await this.readJson(runDir, BUILD_MANIFEST_FILE);
    if (bundleManifest !== null) {
      return this.bundleReader.readArtifact(runDir, runId, artifactId);
    }

    const toolRun = await this.readJson(runDir, TOOL_RUN_FILE);
    if (toolRun === null) {
      throw new DetRunReaderError(
        "run-not-found",
        `Run "${echoId(runId)}" has neither a build-manifest.json nor a tool-run.json root manifest.`
      );
    }

    const manifest = Array.isArray(toolRun.artifacts) ? toolRun.artifacts : [];
    let match: JsonRecord | null = null;
    for (const [index, raw] of manifest.entries()) {
      const where = `tool-run.json artifacts[${index}]`;
      const entry = requireRecord(raw, where);
      const role = requireString(entry.role, `${where}.role`);
      const file = optionalString(entry.file);
      const entryId = file === undefined ? role : `${role}/${file}`;
      if (entryId === artifactId) {
        match = entry;
        break;
      }
    }
    if (match === null) {
      throw new DetRunReaderError(
        "artifact-not-found",
        `Run "${echoId(runId)}" declares no artifact with id "${echoId(artifactId)}".`
      );
    }

    const file = optionalString(match.file);
    if (file === undefined) {
      throw new DetRunReaderError(
        "artifact-not-downloadable",
        "That artifact manifest entry declares no file; there is nothing to download."
      );
    }
    if (!isSafeRelativeArtifactPath(file)) {
      throw new DetRunReaderError(
        "path-refused",
        "The artifact path was refused: it is not a safe relative path inside the run directory."
      );
    }
    if (!isDownloadableExtension(file)) {
      throw new DetRunReaderError(
        "artifact-not-downloadable",
        "That artifact's extension is not on the download allowlist."
      );
    }

    const bytes = await readContainedBytes(runDir, file, "path-refused");
    if (bytes === null) {
      throw new DetRunReaderError(
        "artifact-not-downloadable",
        "The declared artifact file is not present in the run directory."
      );
    }

    return {
      artifactId,
      fileName: safeAttachmentFileName(file),
      contentType: downloadContentType(file) ?? "application/octet-stream",
      bytes,
    };
  }

  /* ------------------------- filesystem utils ----------------------- */

  /** Contained JSON read helper (shared chokepoint in contained-read.ts). */
  private readJson(runDir: string, fileName: string): Promise<JsonRecord | null> {
    return readJsonRecordIfPresent(runDir, fileName, "invalid-payload");
  }
}
