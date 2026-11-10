// Tool-run envelope assembly (schemas/cli/tool-run.schema.json): the deterministic record of
// one det command — artifacts + hashes + converter diagnostics + process-level run diagnostics.
import { contentHash, sha256Hex, canonicalStringify, sortDiagnostics, stableContentHash, stripVolatile } from "./canonical.js";
import { contractId } from "./schema-registry.js";
import { sortRunDiagnostics, type RunDiagnostic } from "./adapter-runtime.js";
import type { Diagnostic } from "./types.js";

export const TOOL_NAME = "det";

export type CommandName = "validate" | "inspect" | "plan" | "extract" | "kb" | "compose" | "build";
export type ExitCode = 0 | 1 | 2 | 3;
// Issue #15: kb-store roles are additive minors of the tool-run family (schemas/cli/README.md).
// Issue #23: compose-report is the additive G3 role (native content composition output).
export type ArtifactRole =
  | "registry" | "resolution-report" | "node-ir" | "page-structure" | "source-review" | "profile-input" | "binding-map" | "structure-input" | "adapter-descriptor"
  | "kb-ingest-manifest" | "kb-records" | "kb-query-result" | "kb-sync-report" | "kb-store-descriptor"
  | "compose-report"
  // Issue #28 C2: the composed platform content document (hashed over its exact emitted bytes,
  // not a canonical JSON payload) and the build bundle inventory (issue #28 C1).
  | "native-content" | "build-manifest";

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

// Artifact role -> contract alias in schemas/registry.json (issue #41): the registry and the
// schema files' own $id are the single source of schema identity; this map only assigns roles
// to contracts and never restates a URL. `structure-input` is the documented exception below.
const ROLE_CONTRACT: Record<Exclude<ArtifactRole, "structure-input">, string> = {
  registry: "capability-registry",
  "resolution-report": "resolution-report",
  "profile-input": "converter-profile",
  "binding-map": "component-binding-map",
  "adapter-descriptor": "adapter-descriptor",
  "node-ir": "node-ir",
  "page-structure": "page-structure",
  "source-review": "source-review",
  // Knowledge Engine family (issue #15): records/query/sync views share one engine-output contract.
  "kb-ingest-manifest": "kb-ingest-manifest",
  "kb-records": "kb-engine-output",
  "kb-query-result": "kb-engine-output",
  "kb-sync-report": "kb-engine-output",
  "kb-store-descriptor": "kb-store",
  // Native content composition family (issue #23)
  "compose-report": "compose-output",
  // One-shot build family (issue #28 C1/C2)
  "native-content": "compose-output",
  "build-manifest": "build-manifest",
};

// Issue #28 C2: native-content artifacts pin the compose-output family with the documented
// '#native-content' fragment suffix — the serialized schemaRef since G3 and part of the
// observable manifest format, kept byte-for-byte. The fragment is a manifest convention, not
// a $defs pointer the schema declares, so it is composed here rather than invented in schema.
const NATIVE_CONTENT_REF_SUFFIX = "#native-content";

// G1 harness structure pseudo-ref (docs/converter/CONTRACTS.md §4): a docs contract, not a
// materialized schema file — the one identifier outside schemas/registry.json, kept
// byte-for-byte for envelope compatibility. The role is legacy (not emitted since the G2
// materialization) and its staged retirement is follow-up work per issue #14.
const STRUCTURE_INPUT_HARNESS_REF =
  "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/CONTRACTS-harness-shape";

const schemaRefs = new Map<string, string>();

// schemaRef for one artifact role, resolved through schemas/registry.json + the schema file's
// own $id (memoized). Throws loudly on an unknown role or a broken registry entry.
export function schemaRefFor(role: ArtifactRole): string {
  const cached = schemaRefs.get(role);
  if (cached !== undefined) return cached;
  const ref =
    role === "structure-input"
      ? STRUCTURE_INPUT_HARNESS_REF
      : role === "native-content"
        ? `${contractId(ROLE_CONTRACT[role])}${NATIVE_CONTENT_REF_SUFFIX}`
        : contractId(ROLE_CONTRACT[role]);
  schemaRefs.set(role, ref);
  return ref;
}

export function artifact(
  role: ArtifactRole,
  payload: unknown,
  opts: { file?: string; rawContent?: string } = {}
): ArtifactRecord {
  // Raw byte artifacts (the composed native content document): the hashes cover the EXACT
  // emitted bytes — deliberately a different, documented notion from the canonical payload
  // contentHash (issue #28 C2: the drift found in review; the schema states both notions).
  if (opts.rawContent !== undefined) {
    const record: ArtifactRecord = {
      role,
      schemaRef: schemaRefFor(role),
      contentHash: sha256Hex(opts.rawContent),
      volatileContentHash: sha256Hex(opts.rawContent),
    };
    if (opts.file) record.file = opts.file;
    return record;
  }
  const record: ArtifactRecord = {
    role,
    schemaRef: schemaRefFor(role),
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
