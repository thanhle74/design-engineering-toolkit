/**
 * [29] DET Studio — read-only DetRunReader over a configured local DET output
 * root (`STUDIO_DET_RUNS_DIR`).
 *
 * One immediate subdirectory = one run, named by its run id. The reader
 * assembles the frozen StudioRunView read model from the raw engine artifacts
 * present in that directory (`tool-run.json` required; `compose-output.json`,
 * `source-review.json`, `page-structure.json`, `node-ir.json` optional). It
 * never invokes the det CLI, child processes, the Figma API or the network,
 * and never writes. Preview is ALWAYS unavailable: no verified DET Preview
 * Theme output is bound to Studio yet ([28] owns the preview theme), so there
 * is nothing to serve and Studio must not invent a URL.
 *
 * Security (see `artifact-access.ts`): run ids are pattern-validated before any
 * path is built, every candidate file is realpath'd and must stay inside the
 * run directory, manifest-declared file strings must be safe relative paths,
 * extensions are allowlisted, and files are capped at 8 MiB.
 */
import "server-only";

import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  STUDIO_COMPOSE_DISPOSITIONS,
  STUDIO_NODE_KINDS,
  STUDIO_REVIEW_DISPOSITIONS,
  STUDIO_SEMANTIC_CLASSES,
  STUDIO_SEVERITIES,
  assertStudioRunViewInvariants,
  DetRunReaderError,
  StudioRunViewSchema,
  type DetRunReader,
  type DetRunSummary,
  type StudioArtifactDownload,
  type StudioArtifactView,
  type StudioDiagnosticOrigin,
  type StudioDiagnosticView,
  type StudioMappingView,
  type StudioRunView,
  type StudioSectionView,
} from "@/src/shared/contracts";

import {
  MAX_ARTIFACT_BYTES,
  RUN_ID_PATTERN,
  downloadContentType,
  isDownloadableExtension,
  isInsideDir,
  isSafeRelativeArtifactPath,
  safeAttachmentFileName,
} from "./artifact-access";

const TOOL_RUN_FILE = "tool-run.json";
const COMPOSE_FILE = "compose-output.json";
const SOURCE_REVIEW_FILE = "source-review.json";
const PAGE_STRUCTURE_FILE = "page-structure.json";
const NODE_IR_FILE = "node-ir.json";

const PREVIEW_UNAVAILABLE_REASON =
  "No verified DET Preview Theme render is bound to this run. A preview becomes available only when [28]'s isolated Preview Theme output is connected and verified — Studio never renders a mock screenshot as Magento proof.";

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

type JsonRecord = Record<string, unknown>;
type CountsView = { errors: number | null; warnings: number | null; infos: number | null };

/* ------------------------------------------------------------------ */
/* JSON value guards — malformed server data fails as invalid-payload  */
/* with a field-scoped detail; values are never echoed into messages.  */
/* ------------------------------------------------------------------ */

function payloadError(detail: string): DetRunReaderError {
  return new DetRunReaderError(
    "invalid-payload",
    "DET run output does not match the expected payload schema (server data problem, not a client error).",
    detail
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, where: string): JsonRecord {
  if (!isRecord(value)) throw payloadError(`${where}: expected an object.`);
  return value;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw payloadError(`${where}: expected a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalHex64(value: unknown, where: string): string | undefined {
  const raw = optionalString(value);
  if (raw === undefined) return undefined;
  if (!HEX64_PATTERN.test(raw)) throw payloadError(`${where}: expected a 64-char lowercase hex content hash.`);
  return raw;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  const raw = requireString(value, where);
  if (!(allowed as readonly string[]).includes(raw)) {
    throw payloadError(`${where}: ${truncateDetail(raw)} is not one of ${allowed.join(" | ")}.`);
  }
  return raw as T;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], where: string): T | undefined {
  const raw = optionalString(value);
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw payloadError(`${where}: ${truncateDetail(raw)} is not one of ${allowed.join(" | ")}.`);
  }
  return raw as T;
}

function truncateDetail(value: string): string {
  return value.length > 100 ? `"${value.slice(0, 100)}…"` : `"${value}"`;
}

function requireNonNegativeInt(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw payloadError(`${where}: expected a non-negative integer.`);
  }
  return value;
}

/** Truncate + strip control chars before echoing caller input into messages. */
function echoId(value: string): string {
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, "");
  return stripped.length > 100 ? `${stripped.slice(0, 100)}…` : stripped;
}

function parseJsonRecord(bytes: Uint8Array, fileName: string): JsonRecord {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    throw payloadError(`${fileName}: is not valid UTF-8.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw payloadError(`${fileName}: is not valid JSON.`);
  }
  return requireRecord(parsed, fileName);
}

function zodDetail(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("issues" in error) || !Array.isArray(error.issues)) {
    return undefined;
  }
  const issues = error.issues as Array<{ path?: Array<string | number | symbol>; message: string }>;
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path?.join(".") ?? ""}: ${issue.message}`)
    .join("; ");
}

function countsFromToolRun(raw: unknown): CountsView | null {
  if (!isRecord(raw)) return null;
  const errors = raw.errors;
  const warnings = raw.warnings;
  const infos = raw.infos;
  const valid = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (!valid(errors) || !valid(warnings) || !valid(infos)) return null;
  return { errors, warnings, infos };
}

/** Unknown stays unknown: no engine counts and no merged diagnostics → nulls. */
function computedCounts(diagnostics: StudioDiagnosticView[]): CountsView {
  if (diagnostics.length === 0) return { errors: null, warnings: null, infos: null };
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") errors += 1;
    else if (diagnostic.severity === "warning") warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos };
}

/** First artifact-pinned source revision wins (compose → structure → review → IR). */
function sourceFrom(...candidates: unknown[]): { sourceId: string | null; revisionId: string | null; accessedAt: string | null } {
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const sourceId = optionalString(candidate.sourceId) ?? null;
    const revisionId = optionalString(candidate.revisionId) ?? null;
    const accessedAt = optionalString(candidate.accessedAt) ?? null;
    if (sourceId !== null || revisionId !== null) return { sourceId, revisionId, accessedAt };
  }
  return { sourceId: null, revisionId: null, accessedAt: null };
}

function toSectionView(raw: unknown, where: string): StudioSectionView {
  const section = requireRecord(raw, where);
  const sectionId = requireString(section.sectionId, `${where}.sectionId`);
  const order = requireNonNegativeInt(section.order, `${where}.order`);
  const name = requireString(section.name, `${where}.name`);
  const role = optionalString(section.role);
  if (!Array.isArray(section.elements)) throw payloadError(`${where}.elements: expected an array.`);
  if (!Array.isArray(section.sourceEvidence)) throw payloadError(`${where}.sourceEvidence: expected an array.`);
  const sourceLocators = section.sourceEvidence
    .map((evidence) => (isRecord(evidence) ? optionalString(evidence.locator) : undefined))
    .filter((locator): locator is string => locator !== undefined);
  return {
    sectionId,
    order,
    name,
    ...(role === undefined ? {} : { role }),
    elementCount: section.elements.length,
    sourceLocators,
  };
}

function toTargetView(raw: unknown, where: string): {
  capabilityId: string;
  appearanceId: string;
  nativeElement?: string;
  nativeField?: string;
} {
  const target = requireRecord(raw, `${where}.target`);
  const capabilityId = requireString(target.capabilityId, `${where}.target.capabilityId`);
  const appearanceId = requireString(target.appearanceId, `${where}.target.appearanceId`);
  const nativeElement = optionalString(target.nativeElement);
  const nativeField = optionalString(target.nativeField);
  return {
    capabilityId,
    appearanceId,
    ...(nativeElement === undefined ? {} : { nativeElement }),
    ...(nativeField === undefined ? {} : { nativeField }),
  };
}

function toDiagnosticView(raw: unknown, origin: StudioDiagnosticOrigin, where: string): StudioDiagnosticView {
  const diagnostic = requireRecord(raw, where);
  const severity = requireEnum(diagnostic.severity, STUDIO_SEVERITIES, `${where}.severity`);
  const message = requireString(diagnostic.message, `${where}.message`);
  const code = optionalString(diagnostic.code);
  const subject = isRecord(diagnostic.subject) ? diagnostic.subject : null;
  const subjectType = subject === null ? undefined : optionalString(subject.type);
  const subjectId = subject === null ? undefined : optionalString(subject.id);
  return {
    severity,
    message,
    ...(code === undefined ? {} : { code }),
    ...(subjectType === undefined ? {} : { subjectType }),
    ...(subjectId === undefined ? {} : { subjectId }),
    origin,
  };
}

function toMappingView(
  raw: unknown,
  where: string,
  nodeIndex: Map<string, { kind?: StudioMappingView["kind"]; name?: string }>,
  reviewIndex: Map<string, JsonRecord>,
  composeDiagnostics: StudioDiagnosticView[]
): StudioMappingView {
  const entry = requireRecord(raw, where);
  const nodeId = requireString(entry.sourceNodeId, `${where}.sourceNodeId`);
  const composeDisposition = requireEnum(entry.disposition, STUDIO_COMPOSE_DISPOSITIONS, `${where}.disposition`);

  const node = nodeIndex.get(nodeId);
  const reviewEntry = reviewIndex.get(nodeId) ?? null;
  const reviewDisposition =
    reviewEntry === null
      ? undefined
      : optionalEnum(reviewEntry.disposition, STUDIO_REVIEW_DISPOSITIONS, `${where} (source-review entry).disposition`);
  const semanticClass =
    reviewEntry === null
      ? undefined
      : optionalEnum(reviewEntry.semanticClass, STUDIO_SEMANTIC_CLASSES, `${where} (source-review entry).semanticClass`);
  const sectionId = reviewEntry === null ? undefined : optionalString(reviewEntry.sectionId);

  /* reasons: source-review reason first, then this node's gap diagnostics. */
  const reasons: string[] = [];
  const reviewReason = reviewEntry === null ? undefined : optionalString(reviewEntry.reason);
  if (reviewReason !== undefined) reasons.push(reviewReason);
  if (composeDisposition === "gap") {
    for (const diagnostic of composeDiagnostics) {
      if (diagnostic.subjectId === nodeId && !reasons.includes(diagnostic.message)) {
        reasons.push(diagnostic.message);
      }
    }
  }

  const sourceName = optionalString(entry.sourceName) ?? node?.name;
  const sourceLocator = optionalString(entry.sourceLocator);
  const note = optionalString(entry.note);

  return {
    nodeId,
    ...(sourceName === undefined ? {} : { sourceName }),
    ...(sourceLocator === undefined ? {} : { sourceLocator }),
    composeDisposition,
    ...(reviewDisposition === undefined ? {} : { reviewDisposition }),
    ...(node?.kind === undefined ? {} : { kind: node.kind }),
    ...(semanticClass === undefined ? {} : { semanticClass }),
    ...(sectionId === undefined ? {} : { sectionId }),
    ...(isRecord(entry.target) ? { target: toTargetView(entry.target, where) } : { target: null }),
    ...(note === undefined ? {} : { note }),
    reasons,
    needsReview: reviewDisposition === "NEEDS_REVIEW",
  };
}

/* ------------------------------------------------------------------ */
/* DirectoryDetRunReader                                              */
/* ------------------------------------------------------------------ */

export class DirectoryDetRunReader implements DetRunReader {
  private readonly configuredRoot: string;
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
      // silently, symlinked directories are never followed as runs, and a
      // directory without a parseable tool-run.json is not a run.
      if (!dirent.isDirectory()) continue;
      if (!RUN_ID_PATTERN.test(dirent.name)) continue;
      const runDir = path.join(root, dirent.name);
      try {
        const toolRun = await this.readJsonRecordIfPresent(runDir, TOOL_RUN_FILE, "invalid-payload");
        if (toolRun === null) continue;
        summaries.push(this.toSummary(dirent.name, toolRun));
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

  private toSummary(runId: string, toolRun: JsonRecord): DetRunSummary {
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

    const toolRun = await this.readJsonRecordIfPresent(runDir, TOOL_RUN_FILE, "invalid-payload");
    if (toolRun === null) {
      throw new DetRunReaderError("run-not-found", `Run "${echoId(runId)}" has no tool-run.json manifest.`);
    }

    const compose = await this.readJsonRecordIfPresent(runDir, COMPOSE_FILE, "invalid-payload");
    const review = await this.readJsonRecordIfPresent(runDir, SOURCE_REVIEW_FILE, "invalid-payload");
    const pageStructure = await this.readJsonRecordIfPresent(runDir, PAGE_STRUCTURE_FILE, "invalid-payload");
    const nodeIr = await this.readJsonRecordIfPresent(runDir, NODE_IR_FILE, "invalid-payload");

    const assembled = await this.assembleRunView(runId, runDir, {
      toolRun,
      compose,
      review,
      pageStructure,
      nodeIr,
    });

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

  /* --------------------------- assembly ----------------------------- */

  private async assembleRunView(
    runId: string,
    runDir: string,
    artifacts: {
      toolRun: JsonRecord;
      compose: JsonRecord | null;
      review: JsonRecord | null;
      pageStructure: JsonRecord | null;
      nodeIr: JsonRecord | null;
    }
  ): Promise<StudioRunView> {
    const { toolRun, compose, review, pageStructure, nodeIr } = artifacts;

    const command = optionalString(toolRun.command);
    const profileId = optionalString(toolRun.profileId);
    const platformId = optionalString(toolRun.platformId) ?? optionalString(compose?.platformId) ?? null;

    /* sections (page-structure) */
    const sections: StudioSectionView[] = [];
    if (pageStructure !== null && Array.isArray(pageStructure.sections)) {
      pageStructure.sections.forEach((raw, index) => {
        sections.push(toSectionView(raw, `page-structure.json sections[${index}]`));
      });
      sections.sort((a, b) => a.order - b.order || (a.sectionId < b.sectionId ? -1 : 1));
    }

    /* node-ir lookups: nodeId → { kind, name } */
    const nodeIndex = new Map<string, { kind?: StudioMappingView["kind"]; name?: string }>();
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

    /* compose diagnostics first — gap rows join them for reasons */
    const diagnostics: StudioDiagnosticView[] = [];
    const composeDiagnostics: StudioDiagnosticView[] = [];
    if (Array.isArray(toolRun.runDiagnostics)) {
      toolRun.runDiagnostics.forEach((raw, index) => {
        diagnostics.push(toDiagnosticView(raw, "run", `tool-run.json runDiagnostics[${index}]`));
      });
    }
    if (compose !== null && Array.isArray(compose.diagnostics)) {
      compose.diagnostics.forEach((raw, index) => {
        const view = toDiagnosticView(raw, "compose", `compose-output.json diagnostics[${index}]`);
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
        mappings.push(toMappingView(raw, `compose-output.json mapping[${index}]`, nodeIndex, reviewIndex, composeDiagnostics));
      });
    }

    /* artifact manifest + derived downloadability */
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
          downloadable: file !== undefined && (await this.canServeArtifact(runDir, file)),
        });
      }
    }

    return {
      runId,
      mode: "live",
      label: runLabel(runId, command, profileId),
      generatedAt: optionalString(toolRun.generatedAt) ?? null,
      exitCode: typeof toolRun.exitCode === "number" && Number.isInteger(toolRun.exitCode) ? toolRun.exitCode : null,
      toolCommand: command === undefined ? null : `det ${command}`,
      profileId: profileId ?? null,
      platformId,
      source: sourceFrom(compose?.source, pageStructure?.source, review?.source, nodeIr?.source),
      counts: countsFromToolRun(toolRun.counts) ?? computedCounts(diagnostics),
      sections,
      mappings,
      diagnostics,
      artifacts: artifactViews,
      preview: { status: "unavailable", reason: PREVIEW_UNAVAILABLE_REASON },
    };
  }

  /* ---------------------------- artifacts --------------------------- */

  async readArtifact(runId: string, artifactId: string): Promise<StudioArtifactDownload> {
    const root = await this.rootReal();
    const runDir = await this.resolveRunDir(root, runId);

    const toolRun = await this.readJsonRecordIfPresent(runDir, TOOL_RUN_FILE, "invalid-payload");
    if (toolRun === null) {
      throw new DetRunReaderError("run-not-found", `Run "${echoId(runId)}" has no tool-run.json manifest.`);
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

    const bytes = await this.readContainedBytes(runDir, file, "path-refused");
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

  /** Can this manifest-declared file actually be served, safely? (flag only) */
  private async canServeArtifact(runDir: string, file: string): Promise<boolean> {
    if (!isSafeRelativeArtifactPath(file)) return false;
    if (!isDownloadableExtension(file)) return false;
    try {
      const joined = path.join(runDir, file);
      const info = await stat(joined);
      if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) return false;
      const resolved = await realpath(joined);
      return isInsideDir(resolved, runDir);
    } catch {
      return false;
    }
  }

  /* ------------------------- filesystem utils ----------------------- */

  /**
   * Read a fixed-name JSON artifact from inside a run dir. Returns null when
   * absent; throws invalid-payload when present but unparseable; enforces
   * realpath containment + the size cap for every candidate path.
   */
  private async readJsonRecordIfPresent(
    runDir: string,
    fileName: string,
    oversizeCode: "invalid-payload" | "path-refused"
  ): Promise<JsonRecord | null> {
    const bytes = await this.readContainedBytes(runDir, fileName, oversizeCode);
    if (bytes === null) return null;
    return parseJsonRecord(bytes, fileName);
  }

  /**
   * The single contained-read chokepoint: safe relative path, size cap,
   * realpath containment inside `runDir`. Returns null when the path does not
   * exist (the caller decides whether that is an error).
   */
  private async readContainedBytes(
    runDir: string,
    relativePath: string,
    oversizeCode: "invalid-payload" | "path-refused"
  ): Promise<Uint8Array | null> {
    if (!isSafeRelativeArtifactPath(relativePath)) {
      throw new DetRunReaderError(
        "path-refused",
        "The requested path was refused: it is not a safe relative path inside the run directory."
      );
    }
    const joined = path.join(runDir, relativePath);
    const info = await stat(joined).catch(() => null);
    if (info === null || !info.isFile()) return null;
    if (info.size > MAX_ARTIFACT_BYTES) {
      throw new DetRunReaderError(oversizeCode, "The requested file exceeds the 8 MiB artifact size cap.");
    }
    let resolved: string | null = null;
    try {
      resolved = await realpath(joined);
    } catch {
      return null;
    }
    if (!isInsideDir(resolved, runDir)) {
      throw new DetRunReaderError(
        "path-refused",
        "The requested path was refused: it resolves outside the run directory."
      );
    }
    const buffer = await readFile(joined);
    if (buffer.byteLength > MAX_ARTIFACT_BYTES) {
      throw new DetRunReaderError(oversizeCode, "The requested file exceeds the 8 MiB artifact size cap.");
    }
    return new Uint8Array(buffer);
  }
}

function runLabel(runId: string, command: string | undefined, profileId: string | undefined): string {
  return [
    runId,
    command === undefined ? null : `det ${command}`,
    profileId === undefined ? null : `profile ${profileId}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}
