// Probe preflight: project-source resolution + adapter applicability (converter-profile family).
// Implements the PROJECT_SOURCE_NOT_CONFIGURED / NOT_FOUND / NOT_READABLE / ADAPTER_NOT_APPLICABLE
// preflight semantics from the converter spec §9 — no fabricated audits, no default owner paths.
export const PLACEHOLDER_SENTINEL = "/path/to/";

export function resolveProjectSource(profile, overrides = {}) {
  const profileId = profile?.profile?.id ?? "unknown";
  const fail = (code, message) => ({ source: null, diagnostic: { code, severity: "error", message, subject: { type: "profile", id: profileId } } });
  const sources = profile?.profile?.projectSources ?? [];
  if (sources.length === 0) {
    return fail("PROJECT_SOURCE_NOT_CONFIGURED", "No project source is configured for this run; supply it via CLI flag, environment or a local (gitignored) profile. Nothing will be audited.");
  }
  const src = sources[0];
  const path = overrides.path ?? src.path;
  if (!path || path.includes(PLACEHOLDER_SENTINEL)) {
    return fail("PROJECT_SOURCE_NOT_CONFIGURED", `Project source '${src.sourceId}' is a placeholder or unset; resolve it per-run before auditing.`);
  }
  let stat = null;
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

export function checkAdapterApplicable(profile, supportedPlatformIds) {
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
