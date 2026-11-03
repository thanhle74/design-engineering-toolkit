// det kb — Knowledge Engine commands (issue #15): manifest-driven deterministic ingest,
// digest-driven sync, exact structured query and store validation over the three logical KBs
// (kb/platform, kb/ui, kb/project/<projectId>, kb/relations). Same run envelope, same exit-code
// contract and same no-write default as the converter commands: nothing is written without
// --out, --dry-run never writes, KB-3 queries are default-deny on project scope, and sync is a
// disk no-op unless a digest actually changed.
import fs from "node:fs";
import { artifact, toolVersion, type ArtifactRole } from "../../run-envelope.js";
import { canonicalize, canonicalStringify, sha256Hex } from "../../canonical.js";
import { runIngest } from "../../kb/ingest.js";
import { runSync } from "../../kb/sync.js";
import { runQuery, type KbQueryKb, type KbQuerySpec } from "../../kb/query.js";
import { runValidate } from "../../kb/validate.js";
import { readDescriptor, readStore, serializeDescriptor, projectFile, STORE_FILES } from "../../kb/store.js";
import type { KbStoreData, StoreDescriptor } from "../../kb/types.js";
import { serializeJson, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { emit } from "./emit.js";

const KB_VERBS = new Set(["ingest", "sync", "query", "validate"]);
const KB_NAMES = new Set(["platform", "ui", "project", "relations", "all"]);
const PROOF_LEVELS = new Set(["DETECTED", "ASSUMED", "TESTED", "UNKNOWN"]);

// Engine artifact payloads validate against the engine-output envelope (records view /
// sync report / query result); the store descriptor validates against kb-store directly.
const SCHEMA_REFS: Record<string, string> = {
  "kb-ingest-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ingest-manifest.schema.json",
  "kb-records": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-query-result": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-sync-report": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
  "kb-store-descriptor": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-store.schema.json",
};

// KB stable hashes strip ALL observation timestamps (scannedAt/capturedAt/recordedAt ride on
// records, unlike converter payloads) — the cross-run determinism proof hash.
const KB_VOLATILE = new Set(["generatedAt", "retrievedAt", "accessedAt", "scannedAt", "capturedAt", "recordedAt"]);
function kbStripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(kbStripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!KB_VOLATILE.has(k)) out[k] = kbStripVolatile(v);
    }
    return out;
  }
  return value;
}

function kbArtifact(role: ArtifactRole, payload: unknown, opts: { file?: string } = {}): ReturnType<typeof artifact> {
  const stable = sha256Hex(canonicalStringify(kbStripVolatile(payload)));
  const record = artifact(role, payload, opts);
  record.volatileContentHash = stable;
  return record;
}

function parseRoots(flags: Record<string, string | boolean | string[]>): Record<string, string> {
  const roots: Record<string, string> = {};
  const raw = flags["root"];
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq <= 0 || !/^[a-z][a-z0-9-]*$/.test(item.slice(0, eq))) continue; // malformed --root is a usage error (checked by caller)
    roots[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return roots;
}

export async function commandKb(flags: Record<string, string | boolean | string[]>, io: CommandIO): Promise<0 | 1 | 2 | 3> {
  const verb = flags["kb-verb"];
  if (typeof verb !== "string" || !KB_VERBS.has(verb)) {
    io.err(`det: 'kb' requires a verb (${[...KB_VERBS].join("|")}). Run 'det kb --help' for usage.`);
    return 2;
  }
  const outDir = requireValue(flags, "out");
  const dryRun = flags["dry-run"] === true;
  const asJson = flags.json === true;

  switch (verb) {
    case "ingest":
      return kbIngest(flags, io, { outDir, dryRun, asJson });
    case "sync":
      return kbSync(flags, io, { outDir, dryRun, asJson });
    case "query":
      return kbQuery(flags, io, { asJson });
    case "validate":
      return kbValidate(flags, io, { asJson });
    default:
      io.err(`det: unknown kb verb '${String(verb)}'`);
      return 2;
  }
}

// ---- det kb ingest ---------------------------------------------------------------------------
async function kbIngest(flags: Record<string, string | boolean | string[]>, io: CommandIO, opts: { outDir: string | null; dryRun: boolean; asJson: boolean }): Promise<0 | 1 | 2 | 3> {
  const manifestPath = requireValue(flags, "manifest");
  if (!manifestPath) {
    io.err("det: kb ingest requires --manifest <file>.");
    return 2;
  }
  if (!fs.existsSync(manifestPath)) {
    io.err(`det: manifest '${manifestPath}' does not exist (unreadable inputs are usage errors).`);
    return 2;
  }
  const writeIntent = opts.outDir !== null && !opts.dryRun;
  const result = runIngest({
    manifestPath,
    roots: parseRoots(flags),
    env: io.env,
    scannedAt: new Date().toISOString(),
    toolVersion: toolVersion(),
    existingStore: writeIntent ? readStore(opts.outDir as string).data : undefined,
    writeIntent,
  });

  const recordsPayload = recordsView(result.data, result.descriptor);
  const artifacts = [kbArtifact("kb-ingest-manifest", safeReadJson(manifestPath)), kbArtifact("kb-records", recordsPayload)];

  const blocking = result.diagnostics.some((d) => d.severity === "error");
  // Refused records are never echoed: --json surfaces the summary + diagnostics only when the
  // ingest is blocking (a rejected record's content must not leak through the receipt either).
  // Fail closed: a partial denial (or any blocking diagnostic) must never regenerate a store —
  // writing would silently drop the records of the denied inputs.
  const files: { name: string; content: string }[] = [];
  if (!blocking) {
    files.push({ name: STORE_FILES.platform, content: jsonl(result.data.platform) });
    files.push({ name: STORE_FILES.ui, content: jsonl(result.data.ui) });
    for (const [projectId, list] of [...result.data.project.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      files.push({ name: projectFile(projectId), content: jsonl(list) });
    }
    files.push({ name: STORE_FILES.relations, content: jsonl(result.data.relations) });
    files.push({ name: STORE_FILES.descriptor, content: serializeDescriptor(result.descriptor) });
  }

  const summaryLines = [
    `manifest: ${result.summary.manifestId} → platform ${result.summary.platform}, ui ${result.summary.ui}, project ${result.summary.project} (${result.summary.projects.join(", ") || "none"}), relations ${result.summary.relations}`,
    ...(result.summary.skippedCapabilities.length ? [`bridge skips: ${result.summary.skippedCapabilities.map((s) => `${s.capabilityId} (${s.reason})`).join("; ")}`] : []),
    ...(result.summary.denied.length ? [`denied inputs: ${result.summary.denied.join(", ")}`] : []),
  ];
  return emit({
    command: "kb",
    exitCode: blocking ? 1 : 0,
    platformId: safePlatformId(manifestPath),
    converterDiagnostics: [],
    runDiagnostics: result.diagnostics,
    artifacts,
    files,
    outDir: opts.outDir,
    dryRun: opts.dryRun,
    asJson: opts.asJson,
    extraOutput: opts.asJson ? { ingest: result.summary, ...(blocking ? {} : { records: recordsPayload }) } : undefined,
    summaryLines,
  }, io);
}

// ---- det kb sync -----------------------------------------------------------------------------
async function kbSync(flags: Record<string, string | boolean | string[]>, io: CommandIO, opts: { outDir: string | null; dryRun: boolean; asJson: boolean }): Promise<0 | 1 | 2 | 3> {
  const storeDir = requireValue(flags, "store");
  const manifestPath = requireValue(flags, "manifest");
  if (!storeDir || !manifestPath) {
    io.err("det: kb sync requires --store <dir> and --manifest <file> (records pin path-specs only the manifest can resolve).");
    return 2;
  }
  if (!fs.existsSync(manifestPath)) {
    io.err(`det: manifest '${manifestPath}' does not exist (unreadable inputs are usage errors).`);
    return 2;
  }
  const result = runSync({ storeDir, manifestPath, roots: parseRoots(flags), env: io.env });
  const changed = result.report.stale > 0;
  const blocking = result.diagnostics.some((d) => d.severity === "error");
  const writeIntent = opts.outDir !== null && !opts.dryRun;

  const artifacts = [kbArtifact("kb-ingest-manifest", safeReadJson(manifestPath)), kbArtifact("kb-sync-report", result.report)];
  const files: { name: string; content: string }[] = [];
  // Sync writes only when something actually went stale; a clean sync is a disk no-op.
  if (!blocking && changed && writeIntent) {
    files.push({ name: STORE_FILES.platform, content: jsonl(result.data.platform) });
    files.push({ name: STORE_FILES.ui, content: jsonl(result.data.ui) });
    for (const [projectId, list] of [...result.data.project.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      files.push({ name: projectFile(projectId), content: jsonl(list) });
    }
    files.push({ name: STORE_FILES.relations, content: jsonl(result.data.relations) });
    const desc = readDescriptor(storeDir);
    if (desc.descriptor) files.push({ name: STORE_FILES.descriptor, content: serializeDescriptor(desc.descriptor) });
  }

  const summaryLines = [
    `sync: ${result.report.checked} digest-pinned record(s) checked — stale ${result.report.stale}, unchanged ${result.report.unchanged}, unpinned ${result.report.noDigests}`,
    ...(result.report.staleIds.length ? [`stale: ${result.report.staleIds.join(", ")}`] : []),
  ];
  return emit({
    command: "kb",
    exitCode: blocking ? 1 : 0,
    converterDiagnostics: [],
    runDiagnostics: result.diagnostics,
    artifacts,
    files,
    outDir: opts.outDir,
    dryRun: opts.dryRun,
    asJson: opts.asJson,
    extraOutput: opts.asJson ? { sync: result.report } : undefined,
    summaryLines,
  }, io);
}

// ---- det kb query ----------------------------------------------------------------------------
function parseWhere(flags: Record<string, string | boolean | string[]>): { pairs: [string, string][]; error?: string } {
  const raw = flags["where"];
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const pairs: [string, string][] = [];
  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq <= 0) return { pairs: [], error: `--where expects key=value, got '${item}'` };
    pairs.push([item.slice(0, eq), item.slice(eq + 1)]);
  }
  return { pairs };
}

async function kbQuery(flags: Record<string, string | boolean | string[]>, io: CommandIO, opts: { asJson: boolean }): Promise<0 | 1 | 2 | 3> {
  const storeDir = requireValue(flags, "store");
  if (!storeDir) {
    io.err("det: kb query requires --store <dir> (paths are explicit; there is no default store).");
    return 2;
  }
  const kbFlag = requireValue(flags, "kb");
  const kbName = (kbFlag ?? "all") as KbQueryKb;
  if (!KB_NAMES.has(kbName)) {
    io.err(`det: --kb must be one of platform|ui|project|relations|all, got '${kbName}'.`);
    return 2;
  }
  const where = parseWhere(flags);
  if (where.error) {
    io.err(`det: ${where.error}`);
    return 2;
  }
  const includeLifecycleRaw = flags["include-lifecycle"];
  const includeLifecycle = Array.isArray(includeLifecycleRaw) ? includeLifecycleRaw : typeof includeLifecycleRaw === "string" ? includeLifecycleRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const requireProof = requireValue(flags, "require-proof");
  if (requireProof && !PROOF_LEVELS.has(requireProof)) {
    io.err("det: --require-proof must be one of DETECTED|ASSUMED|TESTED|UNKNOWN (exact match, no minimum).");
    return 2;
  }
  const spec: KbQuerySpec = {
    storeDir,
    kb: kbName,
    ...(requireValue(flags, "project") ? { project: requireValue(flags, "project") as string } : {}),
    ...(where.pairs.length ? { where: where.pairs } : {}),
    ...(requireValue(flags, "text") ? { text: requireValue(flags, "text") as string } : {}),
    ...(requireProof ? { requireProof: requireProof as NonNullable<KbQuerySpec["requireProof"]> } : {}),
    ...(requireValue(flags, "edge-type") ? { edgeType: requireValue(flags, "edge-type") as string } : {}),
    ...(requireValue(flags, "related-to") ? { relatedTo: requireValue(flags, "related-to") as string } : {}),
    ...(includeLifecycle ? { includeLifecycle } : {}),
  };
  const result = runQuery(spec);
  const blocking = result.diagnostics.some((d) => d.severity === "error");
  const byKb: Record<string, number> = {};
  for (const h of result.hits) byKb[h.kb] = (byKb[h.kb] ?? 0) + 1;
  const summaryLines = [
    `query: ${result.hits.length} hit(s) of ${result.scanned} record(s) scanned — ${Object.entries(byKb).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
    ...result.hits.slice(0, 20).map((h) => `  ${h.kb}${h.partition ? "/" + h.partition : ""}  ${h.record.id}  [${(h.record as unknown as { evidence?: { proofLevel?: string } }).evidence?.proofLevel ?? (h.record.recordType === "relation" ? "relation" : "no-evidence")}] ${(h.record as unknown as { title?: string }).title ?? ""}`),
  ];
  return emit({
    command: "kb",
    exitCode: blocking ? 1 : 0,
    converterDiagnostics: [],
    runDiagnostics: result.diagnostics,
    artifacts: [kbArtifact("kb-query-result", { query: spec, hits: result.hits })],
    files: [],
    outDir: null,
    dryRun: false,
    asJson: opts.asJson,
    extraOutput: opts.asJson ? result : undefined,
    summaryLines,
  }, io);
}

// ---- det kb validate -------------------------------------------------------------------------
async function kbValidate(flags: Record<string, string | boolean | string[]>, io: CommandIO, opts: { asJson: boolean }): Promise<0 | 1 | 2 | 3> {
  const storeDir = requireValue(flags, "store");
  if (!storeDir) {
    io.err("det: kb validate requires --store <dir>.");
    return 2;
  }
  if (!fs.existsSync(storeDir)) {
    io.err(`det: store '${storeDir}' does not exist.`);
    return 2;
  }
  const result = runValidate(storeDir);
  const summaryLines = [
    `store: ${result.counts.records} record(s) — ${result.counts.errors} error(s), ${result.counts.warnings} warning(s)`,
    ...(result.descriptor ? [`descriptor: ${result.descriptor.storeId} · ${JSON.stringify(result.descriptor.counts)}`] : ["descriptor: absent (store.json missing)"]),
  ];
  return emit({
    command: "kb",
    exitCode: result.valid ? 0 : 1,
    converterDiagnostics: [],
    runDiagnostics: result.diagnostics,
    artifacts: result.descriptor ? [kbArtifact("kb-store-descriptor", result.descriptor)] : [],
    files: [],
    outDir: null,
    dryRun: false,
    asJson: opts.asJson,
    extraOutput: opts.asJson ? { validate: { valid: result.valid, counts: result.counts } } : undefined,
    summaryLines,
  }, io);
}

// ---- helpers -----------------------------------------------------------------------------------
function jsonl(records: { id: string }[]): string {
  if (!records.length) return "";
  // Same canonical bytes as the store writer: id-sorted records, sorted-key compact JSON.
  return [...records]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => canonicalStringify(canonicalize(r)))
    .join("\n") + "\n";
}

function recordsView(data: KbStoreData, descriptor: StoreDescriptor): unknown {
  return {
    platform: data.platform,
    ui: data.ui,
    project: Object.fromEntries([...data.project.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    relations: data.relations,
    counts: descriptor.counts,
  };
}

function safeReadJson(path: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return { unreadable: true };
  }
}

function safePlatformId(manifestPath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { platform?: { id?: string } };
    return parsed.platform?.id;
  } catch {
    return undefined;
  }
}
