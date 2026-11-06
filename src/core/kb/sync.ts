// Knowledge Engine (issue #15) — digest-driven incremental sync (CONTRACTS.md §4.3/§4.4).
// Sync re-computes the digests a record pinned at ingest time (observed.inputDigests) and marks
// dependents STALE when a source changed or became unavailable — it never silently re-derives or
// upgrades a record (only a fresh ingest re-observes). Unchanged digests are never re-parsed.
import fs from "node:fs";
import crypto from "node:crypto";
import { validateContract } from "../schema-registry.js";
import type { KbDiagnostic, KbIngestManifest, KbRecord, KbStoreData, ManifestInput } from "./types.js";
import { digestKey } from "./types.js";
import { resolveManifestInput, resolveRootAliases } from "./path-gateway.js";
import { readStore } from "./store.js";

const sha256File = (abs: string): string => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");

export interface SyncOptions {
  storeDir: string;
  manifestPath: string;
  roots: Record<string, string>;
  env: NodeJS.ProcessEnv;
}

export interface SyncReport {
  checked: number;
  stale: number;
  unchanged: number;
  noDigests: number;
  staleIds: string[];
}

export interface SyncResult {
  data: KbStoreData; // updated records (same object identity for untouched records)
  report: SyncReport;
  diagnostics: KbDiagnostic[];
  manifest: KbIngestManifest;
}

export function runSync(options: SyncOptions): SyncResult {
  const diagnostics: KbDiagnostic[] = [];
  const store = readStore(options.storeDir);
  diagnostics.push(...store.diagnostics);

  let manifest: KbIngestManifest;
  try {
    const parsed = JSON.parse(fs.readFileSync(options.manifestPath, "utf8"));
    const check = validateContract("kb-ingest-manifest", parsed);
    if (!check.valid) {
      return {
        data: store.data,
        report: { checked: 0, stale: 0, unchanged: 0, noDigests: 0, staleIds: [] },
        diagnostics: [...diagnostics, { code: "MANIFEST_CONTRACT_VIOLATION", severity: "error", message: `Ingest manifest fails kb-ingest-manifest: ${check.errors[0] ?? "unknown"}`, subject: { type: "manifest", id: options.manifestPath } }],
        manifest: { schemaVersion: 1, manifestId: "invalid", platform: { id: "unknown" }, inputs: { capabilityRegistry: { path: "" }, uiInventory: { path: "" }, projectRecords: [{ path: "" }], relations: { path: "" } } },
      };
    }
    manifest = parsed as KbIngestManifest;
  } catch {
    return {
      data: store.data,
      report: { checked: 0, stale: 0, unchanged: 0, noDigests: 0, staleIds: [] },
      diagnostics: [...diagnostics, { code: "INPUT_UNREADABLE", severity: "error", message: `Cannot read ingest manifest '${options.manifestPath}' (unreadable or not valid JSON; raw content is never echoed into diagnostics).`, subject: { type: "manifest", id: options.manifestPath } }],
      manifest: { schemaVersion: 1, manifestId: "invalid", platform: { id: "unknown" }, inputs: { capabilityRegistry: { path: "" }, uiInventory: { path: "" }, projectRecords: [{ path: "" }], relations: { path: "" } } },
    };
  }

  const manifestDir = options.manifestPath.slice(0, Math.max(options.manifestPath.lastIndexOf("/"), 0)) || ".";
  const aliases = new Set<string>();
  const collect = (i: ManifestInput | undefined) => {
    if (i?.rootAlias) aliases.add(i.rootAlias);
  };
  collect(manifest.inputs.capabilityRegistry);
  collect(manifest.inputs.platformRecords);
  collect(manifest.inputs.uiInventory);
  (manifest.inputs.projectRecords ?? []).forEach(collect);
  collect(manifest.inputs.relations);
  const { roots: resolvedRoots, diagnostics: rootDiags } = resolveRootAliases([...aliases], options.roots, options.env);
  diagnostics.push(...rootDiags);

  // Digest map keyed exactly as ingest pinned it (digestKey convention).
  const digestMap = new Map<string, { abs: string; digest?: string; error?: string }>();
  const consider = (i: ManifestInput, extraGlobs: string[]) => {
    const resolved = resolveManifestInput(manifestDir, resolvedRoots, i, extraGlobs);
    const key = digestKey(i);
    if (!resolved.ok) {
      digestMap.set(key, { abs: "", error: resolved.diagnostic.code });
      return;
    }
    try {
      digestMap.set(key, { abs: resolved.resolved.abs, digest: sha256File(resolved.resolved.abs) });
    } catch (e) {
      digestMap.set(key, { abs: resolved.resolved.abs, error: `unreadable: ${(e as Error).message}` });
    }
  };
  const extra = manifest.denyGlobs ?? [];
  if (manifest.inputs.capabilityRegistry) consider(manifest.inputs.capabilityRegistry, extra);
  if (manifest.inputs.platformRecords) consider(manifest.inputs.platformRecords, extra);
  if (manifest.inputs.uiInventory) consider(manifest.inputs.uiInventory, extra);
  (manifest.inputs.projectRecords ?? []).forEach((i) => consider(i, extra));
  if (manifest.inputs.relations) consider(manifest.inputs.relations, extra);

  const report: SyncReport = { checked: 0, stale: 0, unchanged: 0, noDigests: 0, staleIds: [] };
  const staleCopy = <T extends KbRecord>(record: T): T => {
    const lifecycle = (record as { lifecycle?: { state?: string; reviewStatus?: string } }).lifecycle;
    report.stale++;
    report.staleIds.push(record.id);
    return { ...record, lifecycle: { ...(lifecycle ?? {}), state: "STALE" as const } } as T;
  };

  const syncRecords = (records: KbRecord[]): KbRecord[] =>
    records.map((record) => {
      const digests = (record as { observed?: { inputDigests?: Record<string, string> } }).observed?.inputDigests;
      if (!digests || Object.keys(digests).length === 0) {
        report.noDigests++;
        return record;
      }
      report.checked++;
      let stale = false;
      for (const [key, pinned] of Object.entries(digests)) {
        const entry = digestMap.get(key);
        if (!entry) {
          diagnostics.push({ code: "SOURCE_SPEC_UNRESOLVED", severity: "error", message: `Record '${record.id}' pins digest for '${key}', which the manifest no longer resolves; the record cannot be re-verified and is marked STALE.`, subject: { type: "record", id: record.id } });
          stale = true;
          continue;
        }
        if (entry.error) {
          diagnostics.push({ code: "SOURCE_UNAVAILABLE", severity: "error", message: `Source '${key}' of record '${record.id}' is unavailable (${entry.error}); marked STALE until re-verified.`, subject: { type: "record", id: record.id } });
          stale = true;
          continue;
        }
        if (entry.digest !== pinned) {
          diagnostics.push({ code: "SOURCE_DIGEST_CHANGED", severity: "warning", message: `Source '${key}' changed since record '${record.id}' was observed; marked STALE — re-audit before it feeds decisions.`, subject: { type: "record", id: record.id } });
          stale = true;
        }
      }
      if (!stale) {
        report.unchanged++;
        return record; // never silently upgraded; STALE records stay STALE here
      }
      return staleCopy(record);
    });

  const data: KbStoreData = {
    platform: syncRecords(store.data.platform) as typeof store.data.platform,
    ui: syncRecords(store.data.ui) as typeof store.data.ui,
    project: new Map([...store.data.project.entries()].map(([p, list]) => [p, syncRecords(list) as typeof list])),
    relations: syncRecords(store.data.relations) as typeof store.data.relations,
  };
  return { data, report, diagnostics, manifest };
}
