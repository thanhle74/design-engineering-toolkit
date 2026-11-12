// Knowledge Engine (issue #19, M4) — `det kb extract`: the read-only source-extract ORCHESTRATOR.
// A kb-extract-manifest is DATA declaring which out-of-process scans may run. For each declared
// scan this module spawns the single KB source-scanner adapter (the one whose descriptor output
// contract is the kb-source-scan payload — core stays platform-neutral) out-of-process
// (adapter-runtime: stdin JSON in, one kb-source-scan payload on stdout), RE-VALIDATES every
// emitted record against the KB record contracts + the shared record-safety gate, and only then
// merges outputs deterministically. Fail closed everywhere: any error-severity diagnostic — from
// the gateway, the adapter runtime, the payload contract, a record gate or a count/digest check —
// writes NOTHING; the receipt names record ids and violation kinds, never content.
//
// Test seam: `runAdapterRunner` is injectable (tests pass a deterministic double; production uses
// the default out-of-process spawn). The engine never writes to disk itself — it computes the
// file list (out-relative names + bytes) and the CLI owns the actual write through emit, so
// "nothing written on failure" holds by construction.
import fs from "node:fs";
import path from "node:path";
import { canonicalStringify } from "../../core/canonical.js";
import { loadAdapters, runAdapter, sortRunDiagnostics, type RunDiagnostic } from "../../core/adapter-runtime.js";
import { contractId, validateContract, REPO_ROOT } from "../../core/schema-registry.js";
import { BASELINE_DENY_GLOBS, resolveRootAliases } from "./path-gateway.js";
import { LICENSED_TEXT_LIMIT, recordSafetyViolations } from "./safety.js";
import type { KbDiagnostic, KbExtractManifest, KbRecord, KbScanKind, KbSourceScanPayload } from "./types.js";

// The scanner adapter is discovered neutrally by its DECLARED OUTPUT CONTRACT (the kb-source-scan
// payload $id) — never by a hardcoded adapter id or platform name in compiled core (T-18b
// neutrality rule); the descriptor owns the concrete id.
export const KB_SOURCE_SCAN_CONTRACT_ID = contractId("kb-source-scan");

// Out-of-process scan request — the pinned stdin payload for the scanner adapter (schemaVersion 1):
// one `scan` object (identity, resolved absolute root, alias-relative subPath, bounded scalar
// options, deny-globs = structural baseline + manifest + per-scan merged) plus the manifest's
// declared `platform` expectation. Deny-globs are ADDITIVE over the baseline, never a replacement.
export interface KbScanRequest {
  scanId: string;
  kind: KbScanKind;
  // The alias NAME travels with the resolved root: the payload contract requires the scanner to
  // echo rootAlias and to key its digest table '<rootAlias>:<aliasRelativePath>' — it cannot do
  // either from the bare path alone.
  rootAlias: string;
  root: string;
  subPath?: string;
  options?: Record<string, string | number | boolean>;
  denyGlobs: string[];
}

export interface KbScanAdapterInput {
  schemaVersion: 1;
  scan: KbScanRequest;
  platform: { id: string; version?: string };
}

export interface KbScanRunnerResult {
  ok: boolean;
  payload?: unknown;
  diagnostics: KbDiagnostic[];
}

// Injectable runner seam (default = real out-of-process spawn via adapter-runtime).
export type KbScanRunner = (input: KbScanAdapterInput) => Promise<KbScanRunnerResult>;

// Adapter-runtime failure family — these diagnostics map to exit code 3 (adapter runtime
// failure) rather than the generic blocking-diagnostics exit 1.
export const ADAPTER_FAILURE_CODES: ReadonlySet<string> = new Set([
  "ADAPTER_NOT_FOUND",
  "ADAPTER_DESCRIPTOR_INVALID",
  "ADAPTER_ENTRY_OUT_OF_ROOT",
  "ADAPTER_SPAWN_FAILED",
  "ADAPTER_EXIT_NONZERO",
  "ADAPTER_TIMEOUT",
  "ADAPTER_OUTPUT_OVERFLOW",
  "ADAPTER_OUTPUT_INVALID_JSON",
  "ADAPTER_OUTPUT_CONTRACT_VIOLATION",
]);

export function hasAdapterFailure(diagnostics: KbDiagnostic[]): boolean {
  return diagnostics.some((d) => ADAPTER_FAILURE_CODES.has(d.code));
}

// Production runner: discover the scanner adapter by its DECLARED OUTPUT CONTRACT and spawn it
// out-of-process. Never imports adapter code. Descriptor load diagnostics for OTHER adapters are
// not this run's business; when the scanner itself cannot be found, its own registration
// diagnostics surface (matched by subject id).
export const realScanRunner: KbScanRunner = async (input) => {
  const { adapters, diagnostics } = loadAdapters(REPO_ROOT);
  const adapter = adapters.find((a) => a.outputContract === KB_SOURCE_SCAN_CONTRACT_ID);
  if (!adapter) {
    const own = diagnostics.filter((d) => d.subject?.id === "kb-source-scanner");
    return {
      ok: false,
      diagnostics: [
        ...own,
        {
          code: "ADAPTER_NOT_FOUND",
          severity: "error",
          message: `No adapter whose outputContract is the kb-source-scan payload contract is registered under src/modules/**/adapters/ (descriptor + build entry required); nothing was scanned.`,
          subject: { type: "adapter", id: "kb-source-scanner" },
        },
      ],
    };
  }
  const result = await runAdapter(REPO_ROOT, adapter, input);
  return { ok: result.ok, ...(result.payload !== undefined ? { payload: result.payload } : {}), diagnostics: result.diagnostics };
};

export interface ExtractOptions {
  manifestPath: string;
  out?: string | null; // --out dir; absent/null = report-only (nothing written)
  roots: Record<string, string>; // explicit --root alias=path resolutions
  env: NodeJS.ProcessEnv;
  cwd?: string; // working directory for the gitignored .toolkit/local.json lane (default process.cwd())
  dryRun?: boolean;
  // Like ingest, the observation timestamp comes from the caller. The extract report itself
  // carries no NEW timestamps (records keep the adapter-emitted envelopes verbatim), so this
  // stays envelope-parity plumbing, not report content.
  scannedAt: string;
  writeIntent?: boolean; // explicit override; defaults to (out && !dryRun)
  runAdapterRunner?: KbScanRunner; // test seam; default realScanRunner
}

export interface ExtractResult {
  report: unknown; // kb-engine-output extract branch (schema-validated when reportSchemaValid)
  reportSchemaValid: boolean;
  diagnostics: KbDiagnostic[];
  records: { platform: unknown[]; ui: unknown[]; relations: unknown[] };
  files: { name: string; content: string }[]; // empty unless write-intent AND zero error diagnostics
  blocked: boolean;
  adapterFailure: boolean;
  extractId: string;
}

const HEX64 = /^[a-f0-9]{64}$/;
const ZERO_COUNTS = { capabilities: 0, modules: 0, uiComponents: 0, relations: 0 };

function recordId(record: unknown): string {
  const id = (record as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 ? id : "(no id)";
}

// One code path for the per-record safety gate: KB record schema + licensed free-text caps +
// secret-pattern scan (violations carry kinds and field PATHS only — never values), plus the
// digest-pin check against the scan's own digest table.
function gateRecord(record: unknown, digests: Record<string, string>, diagnostics: KbDiagnostic[]): void {
  const id = recordId(record);
  const subject = { type: "record" as const, id };
  for (const violation of recordSafetyViolations(record as unknown as KbRecord)) {
    if (violation.startsWith("schema:")) {
      diagnostics.push({ code: "RECORD_SCHEMA_INVALID", severity: "error", message: `Record '${id}' fails its KB record contract: ${violation.slice("schema: ".length)}`, subject });
    } else if (violation.startsWith("licensed-oversize:")) {
      diagnostics.push({ code: "LICENSED_FIELD_TOO_LARGE", severity: "error", message: `Licensed UI record '${id}' carries an oversized free-text field '${violation.slice("licensed-oversize: ".length)}' (limit ${LICENSED_TEXT_LIMIT} chars); licensed packages are metadata-only.`, subject });
    } else {
      diagnostics.push({ code: "SECRET_PATTERN_DETECTED", severity: "error", message: `Record '${id}' field '${violation.slice("secret-pattern: ".length)}' matches a secret pattern; refused (extract output is metadata, never credentials; value withheld).`, subject });
    }
  }
  const observed = (record as { observed?: { inputDigests?: unknown } | null } | null)?.observed?.inputDigests;
  if (observed && typeof observed === "object" && !Array.isArray(observed)) {
    for (const [key, value] of Object.entries(observed as Record<string, unknown>)) {
      const tabled = digests[key];
      if (typeof tabled !== "string" || !HEX64.test(tabled)) {
        diagnostics.push({ code: "EXTRACT_DIGEST_KEY_UNKNOWN", severity: "error", message: `Record '${id}' pins input digest key '${key}' that the scan's digest table does not carry as a sha256 value; the re-audit pin would dangle.`, subject });
      } else if (value !== tabled) {
        diagnostics.push({ code: "EXTRACT_DIGEST_KEY_UNKNOWN", severity: "error", message: `Record '${id}' pins a digest for key '${key}' that disagrees with the scan's digest table; the pin would not survive a re-audit.`, subject });
      }
    }
  }
}

// Deterministic lane merge: identical ids collapse when the records are canonically identical
// (info diagnostic), conflicting content for one id is a blocking error — the extract never
// chooses. Content is never echoed into diagnostics.
function mergeInto(map: Map<string, { record: unknown; canonical: string }>, records: unknown[], lane: string, diagnostics: KbDiagnostic[]): void {
  for (const record of records) {
    const id = recordId(record);
    const subject = { type: "record" as const, id };
    const canonical = canonicalStringify(record);
    const seen = map.get(id);
    if (!seen) {
      map.set(id, { record, canonical });
      continue;
    }
    if (seen.canonical === canonical) {
      diagnostics.push({ code: "EXTRACT_DUPLICATE_RECORD_COLLAPSED", severity: "info", message: `Identical ${lane} record '${id}' was emitted by more than one scan; collapsed to a single record.`, subject });
      continue;
    }
    diagnostics.push({ code: "EXTRACT_CONFLICTING_RECORD", severity: "error", message: `${lane} record '${id}' was emitted with conflicting content by different scans; the extract refuses to choose and writes nothing (record content withheld).`, subject });
  }
}

const sortById = (records: unknown[]): unknown[] =>
  [...records].sort((a, b) => recordId(a).localeCompare(recordId(b)));

function tryRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export async function runExtract(options: ExtractOptions): Promise<ExtractResult> {
  const diagnostics: KbDiagnostic[] = [];
  const runner = options.runAdapterRunner ?? realScanRunner;
  const early = (extra: KbDiagnostic[], extractId = "(none)"): ExtractResult => {
    const all = [...diagnostics, ...extra];
    const report = {
      extract: { extractId, manifest: options.manifestPath },
      scans: [],
      outputs: { platformRecords: null, uiRecords: null, relations: null, report: null },
      diagnostics: sortRunDiagnostics(all),
    };
    return {
      report,
      reportSchemaValid: false, // scans: [] cannot validate (kb-engine-output requires minItems 1)
      diagnostics: all,
      records: { platform: [], ui: [], relations: [] },
      files: [],
      blocked: true,
      adapterFailure: hasAdapterFailure(all),
      extractId,
    };
  };

  // 1. Read + contract-check the extract manifest.
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(fs.readFileSync(options.manifestPath, "utf8"));
  } catch {
    return early([{ code: "INPUT_UNREADABLE", severity: "error", message: `Cannot read extract manifest '${options.manifestPath}' (unreadable or not valid JSON; raw content is never echoed into diagnostics).`, subject: { type: "manifest", id: options.manifestPath } }]);
  }
  const manifestCheck = validateContract("kb-extract-manifest", manifestRaw);
  if (!manifestCheck.valid) {
    return early([{ code: "MANIFEST_CONTRACT_VIOLATION", severity: "error", message: `Extract manifest fails kb-extract-manifest: ${manifestCheck.errors[0] ?? "unknown"}`, subject: { type: "manifest", id: options.manifestPath } }]);
  }
  const manifest = manifestRaw as KbExtractManifest;

  // 2. Every scan's rootAlias must be DECLARED in the manifest (names only — values resolve per run).
  const declaredScans = manifest.scans.filter((s) => Object.prototype.hasOwnProperty.call(manifest.rootAliases, s.rootAlias));
  for (const scan of manifest.scans) {
    if (!declaredScans.includes(scan)) {
      diagnostics.push({
        code: "ROOT_ALIAS_UNDECLARED",
        severity: "error",
        message: `Scan '${scan.scanId}' names root alias '${scan.rootAlias}', which the manifest does not declare in rootAliases; aliases are declared by name in the plan, never invented per scan.`,
        subject: { type: "scan", id: scan.scanId },
      });
    }
  }

  // 3. Resolve the declared aliases through the SHARED gateway (all kb verbs, three lanes).
  const aliases = [...new Set(declaredScans.map((s) => s.rootAlias))];
  const { roots: resolvedRoots, diagnostics: rootDiags } = resolveRootAliases(aliases, options.roots, options.env, options.cwd);
  diagnostics.push(...rootDiags);

  // 4. Alias-relative subPaths must resolve and stay contained (same containment rule as inputs).
  for (const scan of declaredScans) {
    const rootReal = resolvedRoots[scan.rootAlias];
    if (!rootReal || !scan.subPath) continue;
    const subject = { type: "scan" as const, id: scan.scanId };
    let abs: string;
    try {
      abs = fs.realpathSync(path.resolve(rootReal, scan.subPath));
    } catch {
      diagnostics.push({ code: "INPUT_PATH_NOT_RESOLVED", severity: "error", message: `Scan '${scan.scanId}' subPath '${scan.subPath}' does not resolve under root alias '${scan.rootAlias}' (missing or not a real path).`, subject });
      continue;
    }
    const rel = path.relative(rootReal, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      diagnostics.push({ code: "INPUT_PATH_ESCAPES_ROOT", severity: "error", message: `Scan '${scan.scanId}' subPath '${scan.subPath}' resolves outside its root alias via symlinks; refused.`, subject });
    }
  }

  // 5. Output-target containment: --out may never live inside (or equal) a source root, and no
  //    output path may escape --out (the schema rejects absolute/traversal names; belt and braces).
  const outAbs = options.out ? path.resolve(options.out) : null;
  if (outAbs) {
    const outReal = tryRealpath(outAbs);
    for (const alias of Object.keys(resolvedRoots).sort()) {
      const rel = path.relative(resolvedRoots[alias], outReal);
      if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
        diagnostics.push({
          code: "OUT_PATH_WITHIN_SOURCE_ROOT",
          severity: "error",
          message: `Output directory resolves inside source root alias '${alias}'; the extract never writes into any source tree. Choose an output directory outside every declared root.`,
          subject: { type: "output", id: alias },
        });
      }
    }
    for (const target of [manifest.output.platformRecords, manifest.output.uiRecords, manifest.output.relations, manifest.output.report]) {
      if (typeof target !== "string") continue;
      const joined = path.resolve(outAbs, target);
      const rel = path.relative(outAbs, joined);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        diagnostics.push({ code: "OUTPUT_PATH_ESCAPES_OUTDIR", severity: "error", message: `Output target '${target}' resolves outside the output directory; refused.`, subject: { type: "output", id: target } });
      }
    }
  }

  const blockedBeforeScans = diagnostics.some((d) => d.severity === "error");
  if (blockedBeforeScans) return early([], manifest.extractId);

  // 6. Run the declared scans out-of-process, in manifest plan order, and gate every payload.
  const mergedDenyGlobs = [...BASELINE_DENY_GLOBS, ...(manifest.denyGlobs ?? [])];
  const scanViews: unknown[] = [];
  const platformLane = new Map<string, { record: unknown; canonical: string }>();
  const uiLane = new Map<string, { record: unknown; canonical: string }>();
  const relationsLane = new Map<string, { record: unknown; canonical: string }>();

  for (const scan of manifest.scans) {
    const root = resolvedRoots[scan.rootAlias];

    let payload: KbSourceScanPayload | null = null;
    if (!root) {
      // Unresolved alias: resolveRootAliases already emitted ROOT_ALIAS_NOT_RESOLVED (error) —
      // the scan must not run and the view stays zeroed.
    } else {
      const request: KbScanRequest = {
        scanId: scan.scanId,
        kind: scan.kind,
        rootAlias: scan.rootAlias,
        root,
        ...(scan.subPath ? { subPath: scan.subPath } : {}),
        ...(scan.options ? { options: scan.options } : {}),
        denyGlobs: [...mergedDenyGlobs, ...(scan.denyGlobs ?? [])],
      };
      const input: KbScanAdapterInput = {
        schemaVersion: 1,
        scan: request,
        platform: { id: manifest.platform.id, ...(manifest.platform.version ? { version: manifest.platform.version } : {}) },
      };
      const outcome = await runner(input);
      if (!outcome.ok) {
        // Adapter runtime failure — the run's own diagnostics carry the fact; raw adapter stderr
        // never enters machine receipts.
        diagnostics.push(...outcome.diagnostics);
      } else {
        const payloadCheck = validateContract("kb-source-scan", outcome.payload);
        if (!payloadCheck.valid) {
          diagnostics.push({ code: "EXTRACT_SCAN_PAYLOAD_CONTRACT_VIOLATION", severity: "error", message: `Scan '${scan.scanId}' stdout fails kb-source-scan: ${payloadCheck.errors[0] ?? "unknown"}`, subject: { type: "scan", id: scan.scanId } });
        } else {
          payload = outcome.payload as KbSourceScanPayload;
          if (payload.scanId !== scan.scanId || payload.kind !== scan.kind || payload.rootAlias !== scan.rootAlias) {
            diagnostics.push({ code: "EXTRACT_SCAN_MISMATCH", severity: "error", message: `Scan '${scan.scanId}' answered for scanId '${payload.scanId}' / kind '${payload.kind}' / alias '${payload.rootAlias}' — the payload must describe exactly the requested scan.`, subject: { type: "scan", id: scan.scanId } });
          }
          if (manifest.platform.version && payload.platform.version && manifest.platform.version !== payload.platform.version) {
            diagnostics.push({ code: "PLATFORM_VERSION_MISMATCH", severity: "warning", message: `Scan '${scan.scanId}' observed platform version '${payload.platform.version}' while the manifest declares '${manifest.platform.version}'.`, subject: { type: "scan", id: scan.scanId } });
          }
          // The scanner's own diagnostics join the run: ANY error severity fails the whole run.
          for (const d of payload.diagnostics) {
            diagnostics.push({ code: d.code, severity: d.severity, message: d.message, subject: { type: "scan", id: scan.scanId } });
          }
          if (payload.counts.capabilities !== payload.capabilities.length || payload.counts.uiComponents !== payload.uiComponents.length || payload.counts.relations !== payload.relations.length || payload.counts.modules !== payload.capabilities.filter((r) => (r as { recordType?: unknown })?.recordType === "module").length) {
            diagnostics.push({ code: "EXTRACT_COUNTS_MISMATCH", severity: "error", message: `Scan '${scan.scanId}' counts (capabilities ${payload.counts.capabilities}, modules ${payload.counts.modules}, uiComponents ${payload.counts.uiComponents}, relations ${payload.counts.relations}) disagree with the emitted arrays (lengths ${payload.capabilities.length}/${payload.capabilities.filter((r) => (r as { recordType?: unknown })?.recordType === "module").length}/${payload.uiComponents.length}/${payload.relations.length}); nothing is written from a miscounted scan.`, subject: { type: "scan", id: scan.scanId } });
          }
          // Re-validate EVERY emitted record against the KB record contracts + the shared safety
          // gate + the digest-pin table. The adapter never bypasses the store's write-time gates.
          // Lane assignment is payload-contract-driven and kind-free (no platform literal may live
          // in compiled core): `capabilities` are KB-1 records by the kb-source-scan contract (only
          // platform-inventory scans emit them — every other record shape fails the kb-capability
          // gate here), `uiComponents` are KB-2 records, `relations` are edges. A scan that emits
          // across lanes gets both arrays gated and merged honestly — never silently dropped.
          for (const record of payload.capabilities) gateRecord(record, payload.digests, diagnostics);
          for (const record of payload.uiComponents) gateRecord(record, payload.digests, diagnostics);
          for (const record of payload.relations) gateRecord(record, payload.digests, diagnostics);
          mergeInto(platformLane, payload.capabilities, "platform", diagnostics);
          mergeInto(uiLane, payload.uiComponents, "ui", diagnostics);
          mergeInto(relationsLane, payload.relations, "relation", diagnostics);
        }
      }
    }

    scanViews.push({
      scanId: scan.scanId,
      kind: scan.kind,
      rootAlias: scan.rootAlias,
      fileCount: payload?.scanMetadata.fileCount ?? 0,
      deniedCount: payload?.scanMetadata.deniedCount ?? 0,
      unknownShapes: payload?.scanMetadata.unknownShapes ?? 0,
      digestCount: payload ? Object.keys(payload.digests).length : 0,
      counts: payload?.counts ?? { ...ZERO_COUNTS },
    });
  }

  // 7. Deterministic merge result + fail-closed write decision.
  const records = {
    platform: sortById([...platformLane.values()].map((x) => x.record)),
    ui: sortById([...uiLane.values()].map((x) => x.record)),
    relations: sortById([...relationsLane.values()].map((x) => x.record)),
  };
  const blocked = diagnostics.some((d) => d.severity === "error");
  const writeIntent = options.writeIntent ?? (outAbs !== null && !options.dryRun);
  const mayWrite = outAbs !== null && !options.dryRun && !blocked && writeIntent;

  const outputView = (target: string | null, count: number): { path: string; count: number } | null =>
    mayWrite && typeof target === "string" ? { path: target, count } : null;
  const outputs = {
    platformRecords: outputView(manifest.output.platformRecords, records.platform.length),
    uiRecords: outputView(manifest.output.uiRecords, records.ui.length),
    relations: outputView(manifest.output.relations, records.relations.length),
    report: outputView(manifest.output.report, 1),
  };

  const report = {
    extract: { extractId: manifest.extractId, manifest: options.manifestPath },
    scans: scanViews,
    outputs,
    diagnostics: sortRunDiagnostics(diagnostics),
  };
  const reportCheck = validateContract("kb-engine-output", report);

  // The engine never writes: it computes out-relative file payloads; the CLI's emit owns the disk.
  const files: { name: string; content: string }[] = [];
  if (mayWrite) {
    const recordFile = (target: string | null, list: unknown[]): { name: string; content: string } | null =>
      typeof target === "string" ? { name: target, content: JSON.stringify(list, null, 2) + "\n" } : null;
    const platformFile = recordFile(manifest.output.platformRecords, records.platform);
    const uiFile = recordFile(manifest.output.uiRecords, records.ui);
    const relationsFile = recordFile(manifest.output.relations, records.relations);
    if (platformFile) files.push(platformFile);
    if (uiFile) files.push(uiFile);
    if (relationsFile) files.push(relationsFile);
    if (typeof manifest.output.report === "string") files.push({ name: manifest.output.report, content: JSON.stringify(report, null, 2) + "\n" });
  }

  return {
    report,
    reportSchemaValid: reportCheck.valid,
    diagnostics,
    records,
    files,
    blocked,
    adapterFailure: hasAdapterFailure(diagnostics),
    extractId: manifest.extractId,
  };
}
