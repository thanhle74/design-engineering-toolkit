// Knowledge Engine (issue #15) — deterministic manifest-driven ingest.
// The manifest is the only way records enter a store (CONTRACTS.md §4.1: scanning outside a plan
// is a contract violation). Ingest REGENERATES the four partitions from its inputs (deterministic
// f(inputs)), injecting the unified record envelope (lifecycle/observed) and pinning input
// digests for sync. Review metadata (reviewStatus/reviewedBy/reviewRef) is carried forward from
// an existing store so re-ingest never destroys review work — everything else comes from the
// fresh observation. Invalid records are refused, never fixed forward.
import fs from "node:fs";
import crypto from "node:crypto";
import { validateContract } from "../schema-registry.js";
import type { KbCapabilityRecord, KbIngestManifest, KbDiagnostic, KbProjectRecord, KbRecord, KbRelationRecord, KbStoreData, KbUiComponentRecord, ManifestInput, StoreDescriptor } from "./types.js";
import { digestKey } from "./types.js";
import { resolveManifestInput, resolveRootAliases, ResolvedInput } from "./path-gateway.js";
import type { CapabilityRegistry } from "../types.js";
import { bridgeRegistryToKb } from "./bridge.js";
import { buildSemanticContext, duplicateRecordCheck, semanticChecks } from "./semantic.js";
import { readDescriptor } from "./store.js";
import { idGrammarError } from "./ids.js";
import { LICENSED_TEXT_LIMIT, recordSafetyViolations, schemaNameForRecord } from "./safety.js";

const sha256File = (abs: string): string => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");

export interface IngestOptions {
  manifestPath: string;
  roots: Record<string, string>; // explicit --root alias=path resolutions
  env: NodeJS.ProcessEnv;
  scannedAt: string;
  toolVersion: string;
  existingStore?: KbStoreData; // review carry-forward + endpoint resolution context
  writeIntent: boolean; // caller intends --out write: partial denial then refuses to write
}

export interface IngestResult {
  data: KbStoreData;
  descriptor: StoreDescriptor;
  diagnostics: KbDiagnostic[];
  summary: {
    manifestId: string;
    platform: number;
    ui: number;
    project: number;
    relations: number;
    projects: string[];
    skippedCapabilities: { capabilityId: string; reason: string }[];
    denied: string[];
  };
  partial: boolean;
}



// JSON array or JSONL — both accepted for record files (explicit, deterministic parse either way).
export function parseRecordFile(raw: string): { records: unknown[]; error?: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? { records: parsed } : { records: [], error: "top-level JSON must be an array" };
    } catch (e) {
      return { records: [], error: `top-level JSON is not a valid array (parse position and content withheld — raw input is never echoed into diagnostics)` };
    }
  }
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const records: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      records.push(JSON.parse(lines[i]));
    } catch (e) {
      return { records: [], error: `line ${i + 1} is not valid JSON (parse position and content withheld — raw lines are never echoed into diagnostics)` };
    }
  }
  return { records };
}



interface ResolvedInputs {
  registry?: ResolvedInput;
  platformRecords?: ResolvedInput;
  uiInventory?: ResolvedInput;
  projectRecords: ResolvedInput[];
  relations?: ResolvedInput;
  diagnostics: KbDiagnostic[];
  deniedKeys: string[];
}

function resolveManifestInputs(manifest: KbIngestManifest, manifestDir: string, roots: Record<string, string>, env: NodeJS.ProcessEnv): ResolvedInputs {
  const diagnostics: KbDiagnostic[] = [];
  const deniedKeys: string[] = [];
  const aliases = new Set<string>();
  const collect = (i: ManifestInput | undefined) => {
    if (i?.rootAlias) aliases.add(i.rootAlias);
  };
  collect(manifest.inputs.capabilityRegistry);
  collect(manifest.inputs.platformRecords);
  collect(manifest.inputs.uiInventory);
  (manifest.inputs.projectRecords ?? []).forEach(collect);
  collect(manifest.inputs.relations);
  const { roots: resolvedRoots, diagnostics: rootDiags } = resolveRootAliases([...aliases], roots, env);
  diagnostics.push(...rootDiags);
  const extra = manifest.denyGlobs ?? [];

  const resolve = (i: ManifestInput): ResolvedInput | undefined => {
    const r = resolveManifestInput(manifestDir, resolvedRoots, i, extra);
    if (!r.ok) {
      diagnostics.push(r.diagnostic);
      if (r.diagnostic.code === "DENIED_PATH_SKIPPED") deniedKeys.push(i.rootAlias ? `${i.rootAlias}:${i.path}` : i.path);
      return undefined;
    }
    return r.resolved;
  };

  return {
    registry: manifest.inputs.capabilityRegistry ? resolve(manifest.inputs.capabilityRegistry) : undefined,
    platformRecords: manifest.inputs.platformRecords ? resolve(manifest.inputs.platformRecords) : undefined,
    uiInventory: manifest.inputs.uiInventory ? resolve(manifest.inputs.uiInventory) : undefined,
    projectRecords: (manifest.inputs.projectRecords ?? []).map(resolve).filter((x): x is ResolvedInput => x !== undefined),
    relations: manifest.inputs.relations ? resolve(manifest.inputs.relations) : undefined,
    diagnostics,
    deniedKeys,
  };
}

// Carry review metadata forward from the existing store — but ONLY when the source digests are
// unchanged (a fresh scan of changed content must not inherit an approval it was never given,
// CONTRACTS.md §4.5: moving ASSUMED→TESTED/reviewing requires re-verification of the new
// evidence). Changed-source records reset to unreviewed with an explicit diagnostic; lifecycle
// STATE always resets to ACTIVE because this IS a fresh observation.
function carryReview<T extends KbRecord>(fresh: T, existing: KbRecord | undefined, diagnostics: KbDiagnostic[]): T {
  if (!existing) return fresh;
  const l = fresh.lifecycle as { state: string; reviewStatus?: string; reviewedBy?: string; reviewRef?: string } | undefined;
  const e = existing.lifecycle as { state?: string; reviewStatus?: string; reviewedBy?: string; reviewRef?: string } | undefined;
  if (!l || !e?.reviewStatus) return fresh;
  const freshDigests = JSON.stringify((fresh.observed as { inputDigests?: unknown } | undefined)?.inputDigests ?? null);
  const oldDigests = JSON.stringify((existing.observed as { inputDigests?: unknown } | undefined)?.inputDigests ?? null);
  if (freshDigests !== oldDigests) {
    diagnostics.push({
      code: "REVIEW_RESET_ON_CHANGED_SOURCE",
      severity: "warning",
      message: `Record '${fresh.id}' was '${e.reviewStatus}' but its pinned sources changed; review metadata is reset and the re-observed record needs re-review before it feeds decisions.`,
      subject: { type: "record", id: fresh.id },
    });
    return fresh;
  }
  return {
    ...fresh,
    lifecycle: { ...l, reviewStatus: e.reviewStatus, ...(e.reviewedBy ? { reviewedBy: e.reviewedBy } : {}), ...(e.reviewRef ? { reviewRef: e.reviewRef } : {}) },
  } as T;
}

function carryRelationReview(rel: KbRelationRecord, existing: KbRecord | undefined, diagnostics: KbDiagnostic[]): KbRelationRecord {
  const e = existing?.lifecycle as { reviewStatus?: string; reviewedBy?: string; reviewRef?: string } | undefined;
  if (!e?.reviewStatus) return rel;
  const freshDigests = JSON.stringify(rel.observed?.inputDigests ?? null);
  const oldDigests = JSON.stringify((existing?.observed as { inputDigests?: unknown } | undefined)?.inputDigests ?? null);
  if (freshDigests !== oldDigests) {
    diagnostics.push({
      code: "REVIEW_RESET_ON_CHANGED_SOURCE",
      severity: "warning",
      message: `Relation '${rel.id}' was '${e.reviewStatus}' but its pinned sources changed; review metadata is reset.`,
      subject: { type: "record", id: rel.id },
    });
    return rel;
  }
  return { ...rel, lifecycle: { state: "ACTIVE", reviewStatus: e.reviewStatus as "unreviewed" | "reviewed" | "approved", ...(e.reviewedBy ? { reviewedBy: e.reviewedBy } : {}), ...(e.reviewRef ? { reviewRef: e.reviewRef } : {}) } };
}

function findExisting(data: KbStoreData | undefined, id: string): KbRecord | undefined {
  if (!data) return undefined;
  const all: KbRecord[] = [...data.platform, ...data.ui, ...data.relations];
  for (const [, list] of data.project) all.push(...list);
  return all.find((r) => r.id === id);
}

function normalizeLifecycle(input: unknown): { state: "ACTIVE"; reviewStatus: "unreviewed" | "reviewed" | "approved"; reviewedBy?: string; reviewRef?: string } {
  const l = (input ?? {}) as { reviewStatus?: string; reviewedBy?: string; reviewRef?: string };
  return {
    state: "ACTIVE", // a fresh observation — STALE/ARCHIVED state is sync's/records' business
    reviewStatus: l.reviewStatus === "reviewed" || l.reviewStatus === "approved" ? l.reviewStatus : "unreviewed",
    ...(l.reviewedBy ? { reviewedBy: l.reviewedBy } : {}),
    ...(l.reviewRef ? { reviewRef: l.reviewRef } : {}),
  };
}

export function runIngest(options: IngestOptions): IngestResult {
  const diagnostics: KbDiagnostic[] = [];
  const manifestRead = (() => {
    try {
      const raw = fs.readFileSync(options.manifestPath, "utf8");
      return { ok: true as const, parsed: JSON.parse(raw) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  })();
  const emptyData: KbStoreData = { platform: [], ui: [], project: new Map(), relations: [] };
  if (!manifestRead.ok) {
    // Unreadable manifest is an INPUT failure the CLI maps to usage error; surface the reason.
    return {
      data: emptyData,
      descriptor: emptyDescriptor("unreadable"),
      diagnostics: [{ code: "INPUT_UNREADABLE", severity: "error", message: `Cannot read ingest manifest '${options.manifestPath}': ${manifestRead.error}`, subject: { type: "manifest", id: options.manifestPath } }],
      summary: { manifestId: "(unreadable)", platform: 0, ui: 0, project: 0, relations: 0, projects: [], skippedCapabilities: [], denied: [] },
      partial: true,
    };
  }
  const manifestCheck = validateContract("kb-ingest-manifest", manifestRead.parsed);
  if (!manifestCheck.valid) {
    return {
      data: emptyData,
      descriptor: emptyDescriptor("invalid"),
      diagnostics: [{ code: "MANIFEST_CONTRACT_VIOLATION", severity: "error", message: `Ingest manifest fails kb-ingest-manifest: ${manifestCheck.errors[0] ?? "unknown"}`, subject: { type: "manifest", id: options.manifestPath } }],
      summary: { manifestId: "(invalid)", platform: 0, ui: 0, project: 0, relations: 0, projects: [], skippedCapabilities: [], denied: [] },
      partial: true,
    };
  }
  const manifest = manifestRead.parsed as KbIngestManifest;
  const manifestDir = ((): string => {
    const p = options.manifestPath;
    const idx = p.lastIndexOf("/");
    return idx === -1 ? "." : p.slice(0, idx);
  })();

  const resolved = resolveManifestInputs(manifest, manifestDir, options.roots, options.env);
  diagnostics.push(...resolved.diagnostics);

  const presentLanes =
    (manifest.inputs.capabilityRegistry ? 1 : 0) +
    (manifest.inputs.platformRecords ? 1 : 0) +
    (manifest.inputs.uiInventory ? 1 : 0) +
    (manifest.inputs.projectRecords?.length ?? 0) +
    (manifest.inputs.relations ? 1 : 0);
  const totalInputs = presentLanes;
  const resolvedCount = (resolved.registry ? 1 : 0) + (resolved.platformRecords ? 1 : 0) + (resolved.uiInventory ? 1 : 0) + resolved.projectRecords.length + (resolved.relations ? 1 : 0);
  if (resolvedCount === 0) {
    diagnostics.push({ code: "INGEST_ALL_INPUTS_DENIED", severity: "error", message: `Every manifest input was denied or unresolved (${totalInputs} inputs); fail closed — nothing was ingested.`, subject: { type: "manifest", id: manifest.manifestId } });
  } else if (resolvedCount < totalInputs) {
    diagnostics.push({ code: "INGEST_PARTIAL_DENIAL", severity: options.writeIntent ? "error" : "warning", message: `${totalInputs - resolvedCount} of ${totalInputs} inputs denied/unresolved; the run is PARTIAL. Regenerating a store from a partial manifest would silently drop records${options.writeIntent ? " — refusing to write" : " (report only)"}.`, subject: { type: "manifest", id: manifest.manifestId } });
  }

  const data: KbStoreData = { platform: [], ui: [], project: new Map(), relations: [] };
  const skippedCapabilities: { capabilityId: string; reason: string }[] = [];

  // --- KB-1: explicit read-only bridge from the #9 CapabilityRegistry ------------------------
  if (resolved.registry) {
    let registryPayload: unknown;
    try {
      registryPayload = JSON.parse(fs.readFileSync(resolved.registry.abs, "utf8"));
    } catch (e) {
      diagnostics.push({ code: "INPUT_INVALID_JSON", severity: "error", message: `Capability registry '${resolved.registry.key}' is not valid JSON: ${(e as Error).message}`, subject: { type: "input", id: resolved.registry.key } });
    }
    if (registryPayload) {
      const regCheck = validateContract("capability-registry", registryPayload);
      if (!regCheck.valid) {
        diagnostics.push({ code: "REGISTRY_CONTRACT_VIOLATION", severity: "error", message: `Input '${resolved.registry.key}' fails the capability-registry contract: ${regCheck.errors[0] ?? "unknown"}`, subject: { type: "input", id: resolved.registry.key } });
      } else {
        const bridge = bridgeRegistryToKb({
          registry: registryPayload as CapabilityRegistry,
          registryPathSpec: digestKey(resolved.registry.input),
          registryDigest: sha256File(resolved.registry.abs),
          platformId: manifest.platform.id,
          platformVersion: manifest.platform.version,
          scannedAt: options.scannedAt,
        });
        diagnostics.push(...bridge.diagnostics);
        skippedCapabilities.push(...bridge.skipped);
        for (const record of bridge.records) {
          data.platform.push(carryReview(record, findExisting(options.existingStore, record.id), diagnostics));
        }
      }
    }
  }

  // --- KB-1 (M4): platform records emitted by a read-only source extract ----------------------
  // Records arrive KB-record-shaped (capability / data-provider / module) from `det kb extract`;
  // ingest re-normalizes the envelope exactly like the other lanes and every record then passes
  // the same write-time gates (id grammar, record safety, graph semantics). Ingest itself never
  // opens the platform tree — the extract outputs are the only input.
  if (resolved.platformRecords) {
    let raw: string;
    try {
      raw = fs.readFileSync(resolved.platformRecords.abs, "utf8");
    } catch (e) {
      diagnostics.push({ code: "INPUT_UNREADABLE", severity: "error", message: `Resolved input '${resolved.platformRecords.key}' could not be read: ${(e as Error).name}.`, subject: { type: "input", id: resolved.platformRecords.key } });
      raw = "";
    }
    const parsed = parseRecordFile(raw);
    if (parsed.error) {
      diagnostics.push({ code: "INPUT_INVALID_JSON", severity: "error", message: `Platform records '${resolved.platformRecords.key}': ${parsed.error}`, subject: { type: "input", id: resolved.platformRecords.key } });
    } else {
      const digest = sha256File(resolved.platformRecords.abs);
      const key = digestKey(resolved.platformRecords.input);
      for (const rec of parsed.records) {
        const base = rec as Partial<KbCapabilityRecord>;
        const candidate = {
          ...(base as KbCapabilityRecord),
          schemaVersion: 1,
          lifecycle: normalizeLifecycle(base.lifecycle) as KbCapabilityRecord["lifecycle"],
          observed: { scannedAt: options.scannedAt, inputDigests: { [key]: digest } },
        };
        const shaped = carryReview(finishRecord(candidate as KbCapabilityRecord) as KbCapabilityRecord, findExisting(options.existingStore, (base as { id?: string }).id ?? ""), diagnostics);
        data.platform.push(shaped);
      }
    }
  }

  // --- KB-2: manifest-driven metadata-only inventory ------------------------------------------
  if (resolved.uiInventory) {
    let raw: string;
    try {
      raw = fs.readFileSync(resolved.uiInventory.abs, "utf8");
    } catch (e) {
      diagnostics.push({ code: "INPUT_UNREADABLE", severity: "error", message: `Resolved input '${resolved.uiInventory.key}' could not be read: ${(e as Error).name}.`, subject: { type: "input", id: resolved.uiInventory.key } });
      raw = "";
    }
    const parsed = parseRecordFile(raw);
    if (parsed.error) {
      diagnostics.push({ code: "INPUT_INVALID_JSON", severity: "error", message: `UI inventory '${resolved.uiInventory.key}': ${parsed.error}`, subject: { type: "input", id: resolved.uiInventory.key } });
    } else {
      const digest = sha256File(resolved.uiInventory.abs);
      const key = digestKey(resolved.uiInventory.input);
      for (const rec of parsed.records) {
        const base = rec as Partial<KbUiComponentRecord>;
        const candidate = {
          ...(base as KbUiComponentRecord),
          schemaVersion: 1,
          recordType: "ui-component" as const,
          lifecycle: normalizeLifecycle(base.lifecycle),
          observed: { scannedAt: options.scannedAt, inputDigests: { [key]: digest } },
        };
        const shaped = carryReview(finishRecord(candidate as KbUiComponentRecord) as KbUiComponentRecord, findExisting(options.existingStore, (base as { id?: string }).id ?? ""), diagnostics);
        data.ui.push(shaped);
      }
    }
  }

  // --- KB-3: sanitized/synthetic project records -----------------------------------------------
  for (const input of resolved.projectRecords) {
    let raw: string;
    try {
      raw = fs.readFileSync(input.abs, "utf8");
    } catch (e) {
      diagnostics.push({ code: "INPUT_UNREADABLE", severity: "error", message: `Resolved input '${input.key}' could not be read: ${(e as Error).name}.`, subject: { type: "input", id: input.key } });
      continue;
    }
    const parsed = parseRecordFile(raw);
    if (parsed.error) {
      diagnostics.push({ code: "INPUT_INVALID_JSON", severity: "error", message: `Project records '${input.key}': ${parsed.error}`, subject: { type: "input", id: input.key } });
      continue;
    }
    const digest = sha256File(input.abs);
    const key = digestKey(input.input);
    for (const rec of parsed.records) {
      const base = rec as Partial<KbProjectRecord>;
      const candidate = {
        ...(base as KbProjectRecord),
        schemaVersion: 1,
        lifecycle: normalizeLifecycle(base.lifecycle) as KbProjectRecord["lifecycle"],
        observed: { scannedAt: options.scannedAt, inputDigests: { [key]: digest } },
      };
      const shaped = finishRecord(candidate as KbProjectRecord) as KbProjectRecord;
      const existing = findExisting(options.existingStore, shaped.id);
      data.project.set(shaped.projectId, [...(data.project.get(shaped.projectId) ?? []), carryReview(shaped, existing, diagnostics)]);
    }
  }

  // --- relations -------------------------------------------------------------------------------
  if (resolved.relations) {
    let raw: string;
    try {
      raw = fs.readFileSync(resolved.relations.abs, "utf8");
    } catch (e) {
      diagnostics.push({ code: "INPUT_UNREADABLE", severity: "error", message: `Resolved input '${resolved.relations.key}' could not be read: ${(e as Error).name}.`, subject: { type: "input", id: resolved.relations.key } });
      raw = "";
    }
    const parsed = parseRecordFile(raw);
    if (parsed.error) {
      diagnostics.push({ code: "INPUT_INVALID_JSON", severity: "error", message: `Relations '${resolved.relations.key}': ${parsed.error}`, subject: { type: "input", id: resolved.relations.key } });
    } else {
      const digest = sha256File(resolved.relations.abs);
      const key = digestKey(resolved.relations.input);
      for (const rec of parsed.records) {
        const base = rec as Partial<KbRelationRecord>;
        const candidate = {
          ...(base as KbRelationRecord),
          schemaVersion: 1,
          recordType: "relation" as const,
          lifecycle: base.lifecycle ? { ...(base.lifecycle as KbRelationRecord["lifecycle"]), state: "ACTIVE" as const } : undefined,
          observed: { scannedAt: options.scannedAt, inputDigests: { [key]: digest } },
        };
        const shaped = finishRecord(candidate as KbRelationRecord) as KbRelationRecord;
        data.relations.push(carryRelationReview(shaped, findExisting(options.existingStore, shaped.id), diagnostics));
      }
    }
  }

  // --- validation gate: schema shape, ID grammar, licensed caps, secrets, semantic rules -------
  const allRecords: KbRecord[] = [...data.platform, ...data.ui, ...data.relations];
  for (const [, list] of data.project) allRecords.push(...list);
  for (const record of allRecords) {
    const grammar = idGrammarError(record.id);
    if (grammar) {
      diagnostics.push({ code: "RECORD_ID_GRAMMAR_INVALID", severity: "error", message: grammar, subject: { type: "record", id: record.id } });
    }
    const violations = recordSafetyViolations(record);
    for (const v of violations) {
      if (v.startsWith("schema:")) {
        diagnostics.push({ code: "RECORD_SCHEMA_INVALID", severity: "error", message: `Record '${record.id}' fails ${schemaNameForRecord(record.recordType)}: ${v.slice("schema: ".length)}`, subject: { type: "record", id: record.id } });
      } else if (v.startsWith("licensed-oversize:")) {
        diagnostics.push({ code: "LICENSED_FIELD_TOO_LARGE", severity: "error", message: `Licensed UI record '${record.id}' carries an oversized free-text field '${v.slice("licensed-oversize: ".length)}' (limit ${LICENSED_TEXT_LIMIT} chars); licensed packages are metadata-only.`, subject: { type: "record", id: record.id } });
      } else {
        diagnostics.push({ code: "SECRET_PATTERN_DETECTED", severity: "error", message: `Record '${record.id}' field '${v.slice("secret-pattern: ".length)}' matches a secret pattern; refused (store metadata, never credentials).`, subject: { type: "record", id: record.id } });
      }
    }
  }
  // Duplicate identity is checked on the FRESH regenerated set (the combined context below
  // legitimately repeats ids between existing and regenerated records).
  diagnostics.push(...duplicateRecordCheck(data));
  // Graph/project rules run over fresh + existing records (relations may reference shared
  // records the manifest does not re-declare). A PARTIAL run defers these checks honestly:
  // a graph over denied/missing partitions cannot be validated, and the write path refuses
  // to persist it anyway.
  const partialRun = resolvedCount < totalInputs;
  if (partialRun) {
    diagnostics.push({ code: "SEMANTIC_CHECKS_DEFERRED", severity: "warning", message: `Partial manifest (${totalInputs - resolvedCount} denied/unresolved inputs): relation graph and project-isolation checks are deferred to the next full ingest.`, subject: { type: "manifest", id: manifest.manifestId } });
  } else {
    const combined = mergeForContext(options.existingStore, data);
    diagnostics.push(...semanticChecks(combined, buildSemanticContext(combined)));
  }

  // KB-3 visibility policy: private material cannot enter the public example store.
  const policy = manifest.visibilityPolicy ?? "example-only";
  if (policy === "example-only") {
    for (const [, list] of data.project) {
      for (const r of list) {
        if (r.visibility !== "example") {
          diagnostics.push({ code: "VISIBILITY_NOT_PUBLIC", severity: "error", message: `KB-3 record '${r.id}' has visibility '${r.visibility}' but this manifest enforces example-only; private/sanitized material cannot enter this store.`, subject: { type: "record", id: r.id } });
        }
      }
    }
  }

  const projects = [...data.project.keys()].sort();
  const descriptor: StoreDescriptor = {
    schemaVersion: 1,
    storeId: manifest.manifestId,
    generator: { tool: "det", toolVersion: options.toolVersion },
    platforms: [{ id: manifest.platform.id, ...(manifest.platform.version ? { version: manifest.platform.version } : {}) }],
    projects,
    counts: { platform: data.platform.length, ui: data.ui.length, project: [...data.project.values()].reduce((n, l) => n + l.length, 0), relations: data.relations.length },
    ...(manifest.notes ? { notes: manifest.notes } : {}),
  };

  const partial = resolvedCount < totalInputs || diagnostics.some((d) => d.code === "INPUT_UNREADABLE");
  return {
    data,
    descriptor,
    diagnostics,
    summary: {
      manifestId: manifest.manifestId,
      platform: data.platform.length,
      ui: data.ui.length,
      project: [...data.project.values()].reduce((n, l) => n + l.length, 0),
      relations: data.relations.length,
      projects,
      skippedCapabilities,
      denied: resolved.deniedKeys,
    },
    partial,
  };
}

function emptyDescriptor(storeId: string): StoreDescriptor {
  return { schemaVersion: 1, storeId, generator: { tool: "det" }, platforms: [], projects: [], counts: { platform: 0, ui: 0, project: 0, relations: 0 } };
}

// Schema-required undefined-optional cleanup: drop `lifecycle: undefined` style keys so
// canonical serialization stays deterministic and additionalProperties:false never sees them.
function finishRecord<T extends KbRecord>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

// Union of existing + freshly regenerated records, for endpoint resolution and semantic rules.
function mergeForContext(existing: KbStoreData | undefined, fresh: KbStoreData): KbStoreData {
  const data: KbStoreData = { platform: [...(existing?.platform ?? [])], ui: [...(existing?.ui ?? [])], project: new Map(existing?.project ?? []), relations: [...(existing?.relations ?? [])] };
  data.platform.push(...fresh.platform);
  data.ui.push(...fresh.ui);
  data.relations.push(...fresh.relations);
  for (const [p, list] of fresh.project) {
    data.project.set(p, [...(data.project.get(p) ?? []), ...list]);
  }
  return data;
}

// Re-export readDescriptor for the CLI's store read path.
export { readDescriptor };
