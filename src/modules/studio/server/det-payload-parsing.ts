/**
 * [29]/[40] DET Studio — shared server-side payload parsing guards.
 *
 * Extracted from DirectoryDetRunReader ([29]) so the [40] build-bundle reader
 * JOINS the same guarded parsing instead of cloning it (Coordinator decision,
 * issue #36/#40): every DET artifact field passes the same field-scoped
 * guards, malformed server data fails as invalid-payload, unknown facts stay
 * null, and no caller input is echoed into a message unbounded. Pure functions
 * only — no fs, no env, no network.
 */
import {
   STUDIO_COMPOSE_DISPOSITIONS,
   STUDIO_REVIEW_DISPOSITIONS,
   STUDIO_SEMANTIC_CLASSES,
   STUDIO_SEVERITIES,
   DetRunReaderError,
   type StudioDiagnosticOrigin,
   type StudioDiagnosticView,
   type StudioMappingView,
   type StudioSectionView,
} from "@/src/modules/studio/shared/contracts";

import { isSafeRelativeArtifactPath } from "./artifact-access";

export type JsonRecord = Record<string, unknown>;
export type CountsView = {
   errors: number | null;
   warnings: number | null;
   infos: number | null;
};

/** Fixed conventional artifact file names inside a run directory. */
export const TOOL_RUN_FILE = "tool-run.json";
export const SOURCE_REVIEW_FILE = "source-review.json";
export const PAGE_STRUCTURE_FILE = "page-structure.json";
export const NODE_IR_FILE = "node-ir.json";
export const BUILD_MANIFEST_FILE = "build-manifest.json";

/**
 * The real `det compose` writes the compose payload as `compose-report.json`,
 * declared in the tool-run manifest under role `compose-report`
 * (src/modules/core/cli/commands/compose.ts:
 * `artifact("compose-report", output, { file: "compose-report.json" })`).
 * Recorded drift, NOT silently hidden: that role is present in the engine's
 * type union (`src/modules/core/run-envelope.ts`) but not yet in the closed role enum
 * of `resources/schemas/cli/tool-run.schema.json` — closing it belongs to [28]'s
 * schema/versioning gate, not to Studio. Studio therefore treats roles as
 * open strings and resolves the compose payload manifest-first, falling back
 * to the CLI's fixed conventional filename. It NEVER reads the never-on-disk
 * name `compose-output.json`.
 */
export const COMPOSE_REPORT_ROLE = "compose-report";
export const COMPOSE_REPORT_FALLBACK_FILE = "compose-report.json";

export const PREVIEW_UNAVAILABLE_REASON =
   "No verified DET Preview Theme render is bound to this run. A preview becomes available only when [28]'s isolated Preview Theme output is connected and verified — Studio never renders a mock screenshot as Magento proof.";

export const HEX64_PATTERN = /^[0-9a-f]{64}$/;

/** Index of node-ir nodes by id: kind + display name (enriches mapping rows). */
export type NodeIndex = Map<
   string,
   { kind?: StudioMappingView["kind"]; name?: string }
>;

/* ------------------------------------------------------------------ */
/* JSON value guards — malformed server data fails as invalid-payload  */
/* with a field-scoped detail; values are never echoed into messages.  */
/* ------------------------------------------------------------------ */

export function payloadError(detail: string): DetRunReaderError {
   return new DetRunReaderError(
      "invalid-payload",
      "DET run output does not match the expected payload schema (server data problem, not a client error).",
      detail,
   );
}

export function isRecord(value: unknown): value is JsonRecord {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, where: string): JsonRecord {
   if (!isRecord(value)) throw payloadError(`${where}: expected an object.`);
   return value;
}

export function requireString(value: unknown, where: string): string {
   if (typeof value !== "string" || value.length === 0) {
      throw payloadError(`${where}: expected a non-empty string.`);
   }
   return value;
}

export function optionalString(value: unknown): string | undefined {
   return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalHex64(
   value: unknown,
   where: string,
): string | undefined {
   const raw = optionalString(value);
   if (raw === undefined) return undefined;
   if (!HEX64_PATTERN.test(raw))
      throw payloadError(
         `${where}: expected a 64-char lowercase hex content hash.`,
      );
   return raw;
}

export function requireEnum<T extends string>(
   value: unknown,
   allowed: readonly T[],
   where: string,
): T {
   const raw = requireString(value, where);
   if (!(allowed as readonly string[]).includes(raw)) {
      throw payloadError(
         `${where}: ${truncateDetail(raw)} is not one of ${allowed.join(" | ")}.`,
      );
   }
   return raw as T;
}

export function optionalEnum<T extends string>(
   value: unknown,
   allowed: readonly T[],
   where: string,
): T | undefined {
   const raw = optionalString(value);
   if (raw === undefined) return undefined;
   if (!(allowed as readonly string[]).includes(raw)) {
      throw payloadError(
         `${where}: ${truncateDetail(raw)} is not one of ${allowed.join(" | ")}.`,
      );
   }
   return raw as T;
}

export function truncateDetail(value: string): string {
   return value.length > 100 ? `"${value.slice(0, 100)}…"` : `"${value}"`;
}

export function requireNonNegativeInt(value: unknown, where: string): number {
   if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw payloadError(`${where}: expected a non-negative integer.`);
   }
   return value;
}

/** Truncate + strip control chars before echoing caller input into messages. */
export function echoId(value: string): string {
   const stripped = value.replace(/[\u0000-\u001f\u007f]/g, "");
   return stripped.length > 100 ? `${stripped.slice(0, 100)}…` : stripped;
}

export function parseJsonRecord(
   bytes: Uint8Array,
   fileName: string,
): JsonRecord {
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

export function zodDetail(error: unknown): string | undefined {
   if (
      typeof error !== "object" ||
      error === null ||
      !("issues" in error) ||
      !Array.isArray(error.issues)
   ) {
      return undefined;
   }
   const issues = error.issues as Array<{
      path?: Array<string | number | symbol>;
      message: string;
   }>;
   return issues
      .slice(0, 8)
      .map((issue) => `${issue.path?.join(".") ?? ""}: ${issue.message}`)
      .join("; ");
}

export function countsFromToolRun(raw: unknown): CountsView | null {
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
export function computedCounts(
   diagnostics: StudioDiagnosticView[],
): CountsView {
   if (diagnostics.length === 0)
      return { errors: null, warnings: null, infos: null };
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

/** Deterministic sum across several envelopes' counts; nulls only when all are unknown. */
export function sumCounts(counts: Array<CountsView | null>): CountsView {
   const present = counts.filter((c): c is CountsView => c !== null);
   if (present.length === 0)
      return { errors: null, warnings: null, infos: null };
   return {
      errors: present.reduce((sum, c) => sum + (c.errors ?? 0), 0),
      warnings: present.reduce((sum, c) => sum + (c.warnings ?? 0), 0),
      infos: present.reduce((sum, c) => sum + (c.infos ?? 0), 0),
   };
}

/**
 * Cross-artifact source identity: every joined artifact must pin the SAME
 * design source revision, or the run directory mixes files from different
 * revisions and any assembled view would present a run that never existed.
 * Refusal is invalid-payload with a safe, non-secret message; a missing
 * artifact simply does not participate (truthful partial states stay valid).
 */
export function requireConsistentSource(...candidates: unknown[]): {
   sourceId: string | null;
   revisionId: string | null;
   accessedAt: string | null;
} {
   const present: Array<{
      sourceId: string;
      revisionId: string;
      accessedAt: string | null;
   }> = [];
   for (const candidate of candidates) {
      if (!isRecord(candidate)) continue;
      const sourceId = optionalString(candidate.sourceId);
      const revisionId = optionalString(candidate.revisionId);
      if (sourceId === undefined && revisionId === undefined) continue;
      if (sourceId === undefined || revisionId === undefined) {
         throw new DetRunReaderError(
            "invalid-payload",
            "source identity incomplete: an artifact declares sourceId/revisionId partially; refusing to join records across an ambiguous design source.",
         );
      }
      present.push({
         sourceId,
         revisionId,
         accessedAt: optionalString(candidate.accessedAt) ?? null,
      });
   }
   if (present.length === 0) {
      return { sourceId: null, revisionId: null, accessedAt: null };
   }
   const [first] = present;
   for (const other of present.slice(1)) {
      if (
         other.sourceId !== first.sourceId ||
         other.revisionId !== first.revisionId
      ) {
         throw new DetRunReaderError(
            "invalid-payload",
            `mixed design source revisions: run artifacts do not share one pinned source identity; refusing to join them into a single run view (conflicting identities, truncated): ${truncateDetail(
               present.map((s) => `${s.sourceId}@${s.revisionId}`).join(" | "),
            )}`,
         );
      }
   }
   return {
      sourceId: first.sourceId,
      revisionId: first.revisionId,
      accessedAt: first.accessedAt,
   };
}

/**
 * Resolve which file holds the compose payload: manifest-first — the
 * `compose-report` role entry's declared relative file (safe-path checked) —
 * falling back to the CLI's fixed conventional filename when the manifest
 * carries no such entry. See the constant block above for the recorded
 * role-enum drift.
 */
export function resolveComposeReportFile(toolRun: JsonRecord): string {
   if (Array.isArray(toolRun.artifacts)) {
      for (const raw of toolRun.artifacts) {
         if (!isRecord(raw) || raw.role !== COMPOSE_REPORT_ROLE) continue;
         const file = optionalString(raw.file);
         if (file === undefined) return COMPOSE_REPORT_FALLBACK_FILE;
         if (!isSafeRelativeArtifactPath(file)) {
            throw payloadError(
               "tool-run.json artifacts: the compose-report entry declares an unsafe relative path.",
            );
         }
         return file;
      }
   }
   return COMPOSE_REPORT_FALLBACK_FILE;
}

export function toSectionView(raw: unknown, where: string): StudioSectionView {
   const section = requireRecord(raw, where);
   const sectionId = requireString(section.sectionId, `${where}.sectionId`);
   const order = requireNonNegativeInt(section.order, `${where}.order`);
   const name = requireString(section.name, `${where}.name`);
   const role = optionalString(section.role);
   if (!Array.isArray(section.elements))
      throw payloadError(`${where}.elements: expected an array.`);
   if (!Array.isArray(section.sourceEvidence))
      throw payloadError(`${where}.sourceEvidence: expected an array.`);
   const sourceLocators = section.sourceEvidence
      .map((evidence) =>
         isRecord(evidence) ? optionalString(evidence.locator) : undefined,
      )
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

export function toTargetView(
   raw: unknown,
   where: string,
): {
   capabilityId: string;
   appearanceId: string;
   nativeElement?: string;
   nativeField?: string;
} {
   const target = requireRecord(raw, `${where}.target`);
   const capabilityId = requireString(
      target.capabilityId,
      `${where}.target.capabilityId`,
   );
   const appearanceId = requireString(
      target.appearanceId,
      `${where}.target.appearanceId`,
   );
   const nativeElement = optionalString(target.nativeElement);
   const nativeField = optionalString(target.nativeField);
   return {
      capabilityId,
      appearanceId,
      ...(nativeElement === undefined ? {} : { nativeElement }),
      ...(nativeField === undefined ? {} : { nativeField }),
   };
}

export function toDiagnosticView(
   raw: unknown,
   origin: StudioDiagnosticOrigin,
   where: string,
): StudioDiagnosticView {
   const diagnostic = requireRecord(raw, where);
   const severity = requireEnum(
      diagnostic.severity,
      STUDIO_SEVERITIES,
      `${where}.severity`,
   );
   const message = requireString(diagnostic.message, `${where}.message`);
   const code = optionalString(diagnostic.code);
   const subject = isRecord(diagnostic.subject) ? diagnostic.subject : null;
   const subjectType =
      subject === null ? undefined : optionalString(subject.type);
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

export function toMappingView(
   raw: unknown,
   where: string,
   nodeIndex: NodeIndex,
   reviewIndex: Map<string, JsonRecord>,
   composeDiagnostics: StudioDiagnosticView[],
): StudioMappingView {
   const entry = requireRecord(raw, where);
   const nodeId = requireString(entry.sourceNodeId, `${where}.sourceNodeId`);
   const composeDisposition = requireEnum(
      entry.disposition,
      STUDIO_COMPOSE_DISPOSITIONS,
      `${where}.disposition`,
   );

   const node = nodeIndex.get(nodeId);
   const reviewEntry = reviewIndex.get(nodeId) ?? null;
   const reviewDisposition =
      reviewEntry === null
         ? undefined
         : optionalEnum(
              reviewEntry.disposition,
              STUDIO_REVIEW_DISPOSITIONS,
              `${where} (source-review entry).disposition`,
           );
   const semanticClass =
      reviewEntry === null
         ? undefined
         : optionalEnum(
              reviewEntry.semanticClass,
              STUDIO_SEMANTIC_CLASSES,
              `${where} (source-review entry).semanticClass`,
           );
   const sectionId =
      reviewEntry === null ? undefined : optionalString(reviewEntry.sectionId);

   /* reasons: source-review reason first, then this node's gap diagnostics. */
   const reasons: string[] = [];
   const reviewReason =
      reviewEntry === null ? undefined : optionalString(reviewEntry.reason);
   if (reviewReason !== undefined) reasons.push(reviewReason);
   if (composeDisposition === "gap") {
      for (const diagnostic of composeDiagnostics) {
         if (
            diagnostic.subjectId === nodeId &&
            !reasons.includes(diagnostic.message)
         ) {
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
      ...(isRecord(entry.target)
         ? { target: toTargetView(entry.target, where) }
         : { target: null }),
      ...(note === undefined ? {} : { note }),
      reasons,
      needsReview: reviewDisposition === "NEEDS_REVIEW",
   };
}

export function runLabel(
   runId: string,
   command: string | undefined,
   profileId: string | undefined,
): string {
   return [
      runId,
      command === undefined ? null : `det ${command}`,
      profileId === undefined ? null : `profile ${profileId}`,
   ]
      .filter((part): part is string => part !== null)
      .join(" · ");
}
