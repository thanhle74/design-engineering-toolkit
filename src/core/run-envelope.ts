// Tool-run envelope assembly (schemas/cli/tool-run.schema.json): the deterministic record of
// one det command — artifacts + hashes + converter diagnostics + process-level run diagnostics.
import { contentHash, sha256Hex, canonicalStringify, sortDiagnostics, stableContentHash, stripVolatile } from "./canonical.js";
import { sortRunDiagnostics, type RunDiagnostic } from "./adapter-runtime.js";
import type { Diagnostic } from "./types.js";

export const TOOL_NAME = "det";

export type CommandName = "validate" | "inspect" | "plan" | "kb";
export type ExitCode = 0 | 1 | 2 | 3;
// Issue #15: kb-store roles are additive minors of the tool-run family (schemas/cli/README.md).
export type ArtifactRole =
  | "registry" | "resolution-report" | "profile-input" | "binding-map" | "structure-input" | "adapter-descriptor"
  | "kb-ingest-manifest" | "kb-records" | "kb-query-result" | "kb-sync-report" | "kb-store-descriptor";

export interface ArtifactRecord {
  role: ArtifactRole;
  file?: string;
  schemaRef: string;
  contentHash: string;
  volatileContentHash?: string;
}

export interface ToolRunEnvelope {
  schemaVersion: 1;
  tool: { name: string; toolVersion: string };
  command: CommandName;
  exitCode: ExitCode;
  generatedAt: string;
  profileId?: string;
  platformId?: string;
  adapter?: { id: string; version?: string; timedOut?: boolean };
  artifacts: ArtifactRecord[];
  converterDiagnostics: Diagnostic[];
  runDiagnostics: RunDiagnostic[];
  counts: { errors: number; warnings: number; infos: number };
  wroteFiles: boolean;
}

export function toolVersion(): string {
  // Resolved from the package manifest at startup (cli/main.ts injects it); kept simple here.
  return TOOL_VERSION;
}

let TOOL_VERSION = "0.0.0";
export function setToolVersion(v: string): void {
  TOOL_VERSION = v;
}

const SCHEMA_REFS: Record<string, string> = {
  registry: "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json",
  "resolution-report": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/resolution-report.schema.json",
  "profile-input": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/converter-profile.schema.json",
  "binding-map": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/component-binding-map.schema.json",
  "structure-input": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/CONTRACTS-harness-shape",
  "adapter-descriptor": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/adapter-descriptor.schema.json",
  // Knowledge Engine family (issue #15)
  "kb-ingest-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ingest-manifest.schema.json",
  "kb-records": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-query-result": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-sync-report": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-store-descriptor": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-store.schema.json",
};

export function artifact(
  role: ArtifactRole,
  payload: unknown,
  opts: { file?: string } = {}
): ArtifactRecord {
  const record: ArtifactRecord = {
    role,
    schemaRef: SCHEMA_REFS[role],
    contentHash: typeof payload === "object" && payload !== null ? contentHash(payload as Record<string, unknown>) : sha256Hex(canonicalStringify(payload)),
    volatileContentHash: stableContentHash(payload),
  };
  if (opts.file) record.file = opts.file;
  return record;
}

export function buildEnvelope(params: {
  command: CommandName;
  exitCode: ExitCode;
  profileId?: string;
  platformId?: string;
  adapter?: { id: string; version?: string; timedOut?: boolean };
  artifacts?: ArtifactRecord[];
  converterDiagnostics?: Diagnostic[];
  runDiagnostics?: RunDiagnostic[];
  wroteFiles?: boolean;
}): ToolRunEnvelope {
  const converterDiagnostics = sortDiagnostics(params.converterDiagnostics ?? []);
  return {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, toolVersion: toolVersion() },
    command: params.command,
    exitCode: params.exitCode,
    generatedAt: new Date().toISOString(),
    ...(params.profileId ? { profileId: params.profileId } : {}),
    ...(params.platformId ? { platformId: params.platformId } : {}),
    ...(params.adapter ? { adapter: params.adapter } : {}),
    artifacts: (params.artifacts ?? []).sort((a, b) => a.role.localeCompare(b.role) || (a.file ?? "").localeCompare(b.file ?? "")),
    converterDiagnostics,
    runDiagnostics: sortRunDiagnostics(params.runDiagnostics ?? []),
    counts: {
      errors: converterDiagnostics.filter((x) => x.severity === "error").length,
      warnings: converterDiagnostics.filter((x) => x.severity === "warning").length,
      infos: converterDiagnostics.filter((x) => x.severity === "info").length,
    },
    wroteFiles: params.wroteFiles ?? false,
  };
}

// Determinism helper for tests: the envelope's stable hash ignores generatedAt and toolVersion.
export function stableEnvelopeHash(envelope: ToolRunEnvelope): string {
  return sha256Hex(canonicalStringify(stripVolatile({ ...envelope, tool: { name: envelope.tool.name } })));
}
