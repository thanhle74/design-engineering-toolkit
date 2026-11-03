// Knowledge Engine (issue #15) — deterministic structured query (CONTRACTS.md §5).
// Structured exact filters first; provenance on every hit (hits embed the whole record — a query
// layer that cannot fill provenance cannot return the record). KB-3 is default-deny: a query
// touching project knowledge without an explicit --project fails closed, and that deny extends
// to PROJECT-SCOPED RELATIONS (projectId on an edge means KB-3 content). Unscoped relation
// queries see only shared (unscoped) edges. Filtering is EXACT: a "tested capabilities" query
// never returns ASSUMED records with a downgrade.
import type { KbDiagnostic, KbName, KbRecord, KbRelationRecord, StoredRecord } from "./types.js";
import { readStore, ReadStoreOptions } from "./store.js";

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
const LIFECYCLE_STATES = new Set(["ACTIVE", "STALE", "INVALIDATED", "ARCHIVED"]);

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
  for (const state of spec.includeLifecycle ?? []) {
    if (!LIFECYCLE_STATES.has(state)) {
      diagnostics.push({ code: "QUERY_LIFECYCLE_UNKNOWN", severity: "error", message: `--include-lifecycle value '${state}' is not a lifecycle state (ACTIVE|STALE|INVALIDATED|ARCHIVED); fail closed rather than guess.`, subject: { type: "query", id: state } });
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) {
    return { query: spec, hits: [], diagnostics, scanned: 0 };
  }

  // Scoped store read: KB-3 partitions are opened only when the query actually touches project
  // knowledge, so another tenant's corruption can never leak into (or break) this query.
  const needsProjectPartitions = spec.kb === "project" || spec.kb === "all";
  const readOptions: ReadStoreOptions = needsProjectPartitions && spec.project ? { projectPartitions: [spec.project] } : { projectPartitions: [] };
  const store = readStore(spec.storeDir, readOptions);
  diagnostics.push(...store.diagnostics);

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
    // KB-3 default-deny extends to project-scoped relations (projectId on an edge = KB-3 data).
    if (record.recordType === "relation") {
      const rel = record as KbRelationRecord;
      // Cross-project exclusion applies within a project scope; the unscoped case (project
      // undefined) is handled after filtering so its diagnostic names the right remedy.
      if (spec.project && rel.projectId && rel.projectId !== spec.project) {
        diagnostics.push({ code: "CROSS_PROJECT_RECORD_EXCLUDED", severity: "warning", message: `Relation '${rel.id}' (projectId '${rel.projectId}') was excluded from project '${spec.project}' scope.`, subject: { type: "record", id: rel.id } });
        return;
      }
    } else if (hit.kb === "project") {
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
    if (pass && spec.edgeType && (record.recordType !== "relation" || (record as KbRelationRecord).edgeType !== spec.edgeType)) pass = false;
    if (pass && spec.relatedTo) {
      if (record.recordType !== "relation") pass = false; // --related-to filters the relations lane only
      else {
        const rel = record as KbRelationRecord;
        if (rel.from.id !== spec.relatedTo && rel.to.id !== spec.relatedTo) pass = false;
      }
    }
    if (pass) hits.push(hit);
  };

  const kbs: KbName[] = spec.kb === "all" ? ["platform", "ui", "project", "relations"] : [spec.kb];
  // Iterate the STORED records (they carry the real file/line locations, surviving any skipped
  // invalid lines) and keep only the KB lanes this query asked for.
  const wanted = new Set<KbName>(kbs);
  for (const stored of store.records) {
    if (!wanted.has(stored.kb)) continue;
    const kb = stored.kb;
    if (kb === "project" && stored.partition !== spec.project) continue; // scoped read already enforces this
    considerRecord({ kb, partition: stored.partition, file: stored.file, line: stored.line, record: stored.record });
  }

  // Project-scoped relations are KB-3 content: without a project scope only shared edges surface.
  if (!spec.project) {
    const scoped = hits.filter((h) => h.record.recordType === "relation" && (h.record as KbRelationRecord).projectId);
    for (const h of scoped) {
      diagnostics.push({ code: "PROJECT_SCOPED_RELATION_EXCLUDED", severity: "warning", message: `Relation '${h.record.id}' is project-scoped (projectId '${(h.record as KbRelationRecord).projectId}') and was excluded; pass --project to query project-scoped edges.`, subject: { type: "record", id: h.record.id } });
    }
    const scopedIds = new Set(scoped.map((h) => h.record.id));
    for (let i = hits.length - 1; i >= 0; i--) {
      if (scopedIds.has(hits[i].record.id)) {
        scanned--; // excluded before filters ran — undo the scan count for honesty
        hits.splice(i, 1);
      }
    }
  }

  // Deterministic order: (kb, partition, id) — identical query => identical result order.
  hits.sort((a, b) => KB_RANK[a.kb] - KB_RANK[b.kb] || (a.partition ?? "").localeCompare(b.partition ?? "") || a.record.id.localeCompare(b.record.id));
  return { query: spec, hits, diagnostics, scanned };
}

// Re-export StoredRecord type for the CLI summary rendering.
export type { StoredRecord };
