// Knowledge Engine (issue #15) — deterministic structured query (CONTRACTS.md §5).
// Structured exact filters first; provenance on every hit (hits embed the whole record — a query
// layer that cannot fill provenance cannot return the record). KB-3 is default-deny: a query
// touching the project KB without an explicit --project fails closed. Filtering is EXACT: a
// "tested capabilities" query never returns ASSUMED records with a downgrade.
import type { KbDiagnostic, KbName, KbRecord, KbRelationRecord, KbStoreData, StoredRecord } from "./types.js";
import { readStore } from "./store.js";

export type KbQueryKb = KbName | "all";

export interface KbQuerySpec {
  storeDir: string;
  kb: KbQueryKb;
  project?: string; // required when the query touches kb=project
  where?: [string, string][]; // exact structured filters, dot-paths from the allowed set
  text?: string; // deterministic case-insensitive substring over declared searchable fields
  requireProof?: "DETECTED" | "ASSUMED" | "TESTED" | "UNKNOWN"; // EXACT equality
  edgeType?: string;
  relatedTo?: string;
  includeLifecycle?: string[]; // default: ACTIVE only — stale/unverified claims fail closed
}

export interface QueryHit {
  kb: KbName;
  partition?: string;
  file: string;
  line: number;
  record: KbRecord;
}

export interface QueryResult {
  query: KbQuerySpec;
  hits: QueryHit[];
  diagnostics: KbDiagnostic[];
  scanned: number;
}

// Whitelisted exact-filter dimensions (CONTRACTS.md §5 table). Unknown keys are usage errors —
// fail closed, never "probably meant".
export const FILTER_KEYS = new Set([
  "id", "recordType", "namespace", "nativeId", "platform", "platformVersion", "origin", "category",
  "proofLevel", "lifecycle.state", "reviewStatus", "enablement.state", "enablement.source",
  "sourcePackage.kind", "sourcePackage.name", "license.status", "license.regime", "license.derivedArtifactPolicy",
  "availability.state", "uxSemantics.concept", "visibility", "status", "kind", "projectId", "tenantId",
  "edgeType", "authority", "installed",
]);

const KB_RANK: Record<KbName, number> = { platform: 0, ui: 1, project: 2, relations: 3 };

function getPath(record: unknown, dotPath: string): unknown {
  let cur: unknown = record;
  for (const seg of dotPath.split(".")) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function searchableText(record: KbRecord): string {
  const r = record as unknown as Record<string, unknown>;
  const parts: string[] = [record.id, String(r.nativeId ?? ""), String(r.title ?? ""), String(r.semantics ?? ""), String(r.statement ?? ""), String(r.notes ?? "")];
  const ux = r.uxSemantics as { description?: string } | undefined;
  if (ux?.description) parts.push(ux.description);
  const sp = r.sourcePackage as { name?: string } | undefined;
  if (sp?.name) parts.push(sp.name);
  return parts.join("\n").toLowerCase();
}

export function runQuery(spec: KbQuerySpec): QueryResult {
  const diagnostics: KbDiagnostic[] = [];
  const store = readStore(spec.storeDir);
  diagnostics.push(...store.diagnostics);

  const touchesProject = spec.kb === "project" || spec.kb === "all";
  if (touchesProject && !spec.project) {
    diagnostics.push({ code: "PROJECT_SCOPE_REQUIRED", severity: "error", message: "Querying the project KB is default-deny: pass --project <projectId>. An unset project scope is an error, never 'all projects'.", subject: { type: "store", id: spec.storeDir } });
    return { query: spec, hits: [], diagnostics, scanned: 0 };
  }

  for (const [key] of spec.where ?? []) {
    if (!FILTER_KEYS.has(key)) {
      diagnostics.push({ code: "QUERY_FILTER_UNKNOWN", severity: "error", message: `Filter key '${key}' is not in the structured filter set; fail closed rather than guess. Allowed keys: ${[...FILTER_KEYS].sort().join(", ")}.`, subject: { type: "query", id: key } });
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) {
    return { query: spec, hits: [], diagnostics, scanned: 0 };
  }

  const includeLifecycle = spec.includeLifecycle && spec.includeLifecycle.length > 0 ? spec.includeLifecycle : ["ACTIVE"];
  const where = spec.where ?? [];
  const text = spec.text?.toLowerCase() ?? null;
  const hits: QueryHit[] = [];
  let scanned = 0;

  const considerRecord = (hit: QueryHit) => {
    scanned++;
    const record = hit.record;
    // Lifecycle honesty: stale/unverified claims are excluded unless explicitly included.
    const state = record.lifecycle?.state ?? "ACTIVE";
    if (!includeLifecycle.includes(state)) return;
    // KB-3 fail-closed project scope: partition records from another project never surface.
    if (hit.kb === "project") {
      const projectId = (record as { projectId?: string }).projectId;
      if (projectId !== spec.project) {
        diagnostics.push({ code: "CROSS_PROJECT_RECORD_EXCLUDED", severity: "warning", message: `Record '${record.id}' (projectId '${projectId}') sits in partition '${hit.partition}' and was excluded from project '${spec.project}' scope.`, subject: { type: "record", id: record.id } });
        return;
      }
    }
    let pass = true;
    for (const [key, expected] of where) {
      const actual = getPath(record, key);
      if (actual === undefined || String(actual) !== expected) {
        pass = false;
        break;
      }
    }
    if (pass && text && !searchableText(record).includes(text)) pass = false;
    if (pass && spec.requireProof) {
      const proof = (record as unknown as { evidence?: { proofLevel?: string } }).evidence?.proofLevel;
      if (proof !== spec.requireProof) pass = false; // exact: no minimum, no downgrade
    }
    if (pass && spec.edgeType && (record.recordType !== "relation" || record.edgeType !== spec.edgeType)) pass = false;
    const asRel = record as KbRelationRecord;
    if (pass && spec.relatedTo && record.recordType === "relation") {
      if (asRel.from.id !== spec.relatedTo && asRel.to.id !== spec.relatedTo) pass = false;
    } else if (pass && spec.relatedTo && record.recordType !== "relation") {
      pass = false; // --related-to filters the relations partition only
    }
    if (pass) hits.push(hit);
  };

  const kbs: KbName[] = spec.kb === "all" ? ["platform", "ui", "project", "relations"] : [spec.kb];
  for (const kb of kbs) {
    if (kb === "project") {
      // Project scope reads the requested project's partition; other partitions are not scanned.
      const partition = spec.project as string;
      for (const [p, records] of store.data.project) {
        if (p !== partition) continue;
        records.forEach((record, idx) => considerRecord({ kb, partition: p, file: `project/${p}/records.jsonl`, line: idx + 1, record }));
      }
    } else {
      const records: KbRecord[] = kb === "platform" ? store.data.platform : kb === "ui" ? store.data.ui : store.data.relations;
      const file = kb === "platform" ? "platform/records.jsonl" : kb === "ui" ? "ui/records.jsonl" : "relations/records.jsonl";
      records.forEach((record, idx) => considerRecord({ kb, file, line: idx + 1, record }));
    }
  }

  // Deterministic order: (kb, partition, id) — identical query => identical result order.
  hits.sort((a, b) => KB_RANK[a.kb] - KB_RANK[b.kb] || (a.partition ?? "").localeCompare(b.partition ?? "") || a.record.id.localeCompare(b.record.id));
  return { query: spec, hits, diagnostics, scanned };
}

// Re-export StoredRecord type for the CLI summary rendering.
export type { StoredRecord };
