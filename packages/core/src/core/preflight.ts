// Probe preflight: project-source resolution + adapter applicability (converter-profile family).
// Implements the PROJECT_SOURCE_NOT_CONFIGURED / NOT_FOUND / NOT_READABLE / ADAPTER_NOT_APPLICABLE
// preflight semantics from the converter spec §9 — no fabricated audits, no default owner paths.
// Ported verbatim (logic-identical) from the #5 G1 harness (tests/lib/preflight.mjs), issue #9.
import type { ConverterProfile, Diagnostic } from "./types.js";

export const PLACEHOLDER_SENTINEL = "/path/to/";

export interface StatResult {
  exists: boolean;
  readable: boolean;
}

export interface ResolvedSource {
  sourceId: string;
  kind: string;
  path: string;
}

export interface PreflightOverrides {
  path?: string;
  stat?: (path: string) => StatResult;
}

export interface ResolveProjectSourceResult {
  source: ResolvedSource | null;
  diagnostic: Diagnostic | null;
}

export function resolveProjectSource(profile: ConverterProfile, overrides: PreflightOverrides = {}): ResolveProjectSourceResult {
  const profileId = profile?.profile?.id ?? "unknown";
  const fail = (code: string, message: string): ResolveProjectSourceResult => ({
    source: null,
    diagnostic: { code, severity: "error", message, subject: { type: "profile", id: profileId } },
  });
  const sources = profile?.profile?.projectSources ?? [];
  if (sources.length === 0) {
    return fail("PROJECT_SOURCE_NOT_CONFIGURED", "No project source is configured for this run; supply it via CLI flag, environment or a local (gitignored) profile. Nothing will be audited.");
  }
  const src = sources[0];
  const path = overrides.path ?? src.path;
  if (!path || path.includes(PLACEHOLDER_SENTINEL)) {
    return fail("PROJECT_SOURCE_NOT_CONFIGURED", `Project source '${src.sourceId}' is a placeholder or unset; resolve it per-run before auditing.`);
  }
  let stat: StatResult | null = null;
  try {
    stat = overrides.stat ? overrides.stat(path) : null;
  } catch {
    stat = null;
  }
  if (!stat || !stat.exists) {
    return fail("PROJECT_SOURCE_NOT_FOUND", `Configured project source '${src.sourceId}' does not exist at the supplied path.`);
  }
  if (!stat.readable) {
    return fail("PROJECT_SOURCE_NOT_READABLE", `Project source '${src.sourceId}' exists but required files are unreadable or incomplete.`);
  }
  return { source: { sourceId: src.sourceId, kind: src.kind, path }, diagnostic: null };
}

export function checkAdapterApplicable(profile: ConverterProfile, supportedPlatformIds: string[]): Diagnostic | null {
  const platformId = profile?.profile?.platformId;
  if (!supportedPlatformIds.includes(platformId)) {
    return {
      code: "ADAPTER_NOT_APPLICABLE",
      severity: "error",
      message: `Platform '${platformId}' is outside this probe's supported set (${supportedPlatformIds.join(", ")}).`,
      subject: { type: "profile", id: profile?.profile?.id ?? "unknown" },
    };
  }
  return null;
}
