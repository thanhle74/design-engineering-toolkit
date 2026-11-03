// Shared command plumbing: profile loading + schema validation + real-filesystem preflight stat.
import fs from "node:fs";
import type { RunDiagnostic } from "../../adapter-runtime.js";
import { validateContract } from "../../schema-registry.js";
import { resolveProjectSource, type ResolvedSource } from "../../preflight.js";
import type { ConverterProfile, Diagnostic } from "../../types.js";
import { readJsonFile } from "../io.js";

export interface ProfileLoad {
  ok: true;
  profile: ConverterProfile;
  converterDiagnostics: Diagnostic[];
  runDiagnostics: RunDiagnostic[];
}

export interface ProfileLoadFailure {
  ok: false;
  converterDiagnostics: Diagnostic[];
  runDiagnostics: RunDiagnostic[];
  exitCode: 1 | 2;
}

export function loadProfile(profilePath: string | null): ProfileLoad | ProfileLoadFailure {
  if (!profilePath) {
    return {
      ok: false,
      converterDiagnostics: [],
      runDiagnostics: [{ code: "INPUT_UNREADABLE", severity: "error", message: "--profile is required (path to a converter-profile JSON file).", subject: { type: "input", id: "profile" } }],
      exitCode: 2,
    };
  }
  const loaded = readJsonFile(profilePath);
  if (!loaded.ok) return { ok: false, converterDiagnostics: [], runDiagnostics: [loaded.diagnostic], exitCode: 2 };
  const data = loaded.data;
  const check = validateContract("converter-profile", data);
  if (!check.valid) {
    const versionValue = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
    const converterDiagnostics: Diagnostic[] =
      typeof versionValue === "number" && versionValue !== 1
        ? [
            {
              code: "SCHEMA_VERSION_UNSUPPORTED",
              severity: "error",
              message: `Profile schemaVersion ${versionValue} is not implemented by this tool (major 1); never best-effort parsed.`,
              subject: { type: "profile", id: (data as { profile?: { id?: string } } | null)?.profile?.id ?? "unknown" },
            },
          ]
        : [];
    return {
      ok: false,
      converterDiagnostics,
      runDiagnostics: [{ code: "PROFILE_SCHEMA_INVALID", severity: "error", message: `Profile fails the converter-profile contract: ${check.errors[0] ?? "unknown"}${check.errors.length > 1 ? ` (+${check.errors.length - 1} more)` : ""}`, subject: { type: "input", id: "profile" } }],
      exitCode: 1,
    };
  }
  return { ok: true, profile: data as ConverterProfile, converterDiagnostics: [], runDiagnostics: [] };
}

// Real-filesystem stat for the preflight (exists + readable). Missing = not found; any other
// access failure = exists but unreadable (fail closed).
export function realStat(p: string): { exists: boolean; readable: boolean } {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return { exists: true, readable: true };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { exists: false, readable: false };
    return { exists: true, readable: false };
  }
}

export function resolveSource(
  profile: ConverterProfile,
  cliProject: string | null,
  env: NodeJS.ProcessEnv
): { source: ResolvedSource | null; diagnostic: Diagnostic | null } {
  // Precedence per TECH-ADR ADR-5: CLI flag > env var > profile file. Never a default path.
  const override = cliProject ?? env.DET_PROJECT_SOURCE ?? undefined;
  return resolveProjectSource(profile, { path: override, stat: realStat });
}

// Blocking = any error-severity diagnostic in either family of diagnostics.
export function isBlocking(converterDiagnostics: Diagnostic[], runDiagnostics: RunDiagnostic[]): boolean {
  return converterDiagnostics.some((x) => x.severity === "error") || runDiagnostics.some((x) => x.severity === "error");
}
