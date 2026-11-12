// Knowledge Engine (issue #15) — semantic checks beyond JSON Schema, shared by ingest and
// validate: no-false-equivalence edge rules (CONTRACTS.md §3.1), graph integrity (§3.2),
// KB-3 tenant/project consistency (§8.2), and lifecycle vocabulary honesty.
import type { KbDiagnostic, KbRecord, KbStoreData } from "./types.js";
import { isProjectRecord, isRelationRecord } from "./types.js";

const err = (
   code: string,
   message: string,
   subject: { type: string; id: string },
): KbDiagnostic => ({ code, severity: "error", message, subject });

// UI-side correspondence edges only ever connect KB-2 composition units; the developer-owned
// class is everything that is not Page Builder native (mapsTo/adaptedFrom within the class,
// neighborOf across the class boundary — never the reverse).
const UI_CORRESPONDENCE_EDGES = new Set(["mapsTo", "adaptedFrom"]);
const SAME_CLASS_ONLY_EDGES = new Set([
   "mapsTo",
   "adaptedFrom",
   "equivalentOf",
   "replaces",
]);
// Cross-class correspondence must be neighborOf (or replaces-free soft edges); these edge types
// are FORBIDDEN between a Page Builder-native record and a developer-owned record.
const CROSS_CLASS_FORBIDDEN = new Set([
   "mapsTo",
   "adaptedFrom",
   "equivalentOf",
   "replaces",
]);
// Cycle-checked edge types (hard prerequisite / lineage semantics).
const CYCLE_EDGE_TYPES = new Set(["requires", "providedBy", "supersedes"]);

export function sourcePackageKind(
   record: KbRecord | undefined,
): string | undefined {
   if (record && record.recordType === "ui-component") {
      const sp = record.sourcePackage as { kind?: string } | undefined;
      return sp?.kind;
   }
   return undefined;
}

function isCmsNativeClass(record: KbRecord | undefined): boolean {
   return sourcePackageKind(record) === "page-builder-native";
}

export interface SemanticContext {
   byId: Map<string, KbRecord>;
}

export function buildSemanticContext(data: KbStoreData): SemanticContext {
   const byId = new Map<string, KbRecord>();
   for (const r of data.platform) byId.set(r.id, r);
   for (const r of data.ui) byId.set(r.id, r);
   for (const [, list] of data.project) for (const r of list) byId.set(r.id, r);
   for (const r of data.relations) byId.set(r.id, r);
   return { byId };
}

// Duplicate record identity across one record set (the store-wide check; ingest runs this on the
// FRESH regenerated set, since the combined ingest+existing context legitimately repeats ids).
export function duplicateRecordCheck(data: KbStoreData): KbDiagnostic[] {
   const diags: KbDiagnostic[] = [];
   const seen = new Map<string, string>();
   const visit = (r: KbRecord) => {
      if (seen.has(r.id))
         diags.push(
            err(
               "DUPLICATE_RECORD_ID",
               `Record id '${r.id}' occurs more than once (first at ${seen.get(r.id)}); identity must be unique across the store.`,
               { type: "record", id: r.id },
            ),
         );
      else seen.set(r.id, r.id);
   };
   for (const r of data.platform) visit(r);
   for (const r of data.ui) visit(r);
   for (const [, list] of data.project) for (const r of list) visit(r);
   for (const r of data.relations) visit(r);
   return diags;
}

// Graph + project-isolation rules (duplicate identity is a separate check so ingest can run it
// on the fresh regenerated set while resolving endpoints against fresh + existing).
export function semanticChecks(
   data: KbStoreData,
   ctx: SemanticContext,
): KbDiagnostic[] {
   const diags: KbDiagnostic[] = [];

   // KB-3: id scope must equal projectId (external IDs never canonical, §1.2).
   for (const [partition, list] of data.project) {
      for (const r of list) {
         const scope = r.id.split(":")[1];
         if (scope && scope !== r.projectId) {
            diags.push(
               err(
                  "PROJECT_SCOPE_MISMATCH",
                  `KB-3 record '${r.id}' carries projectId '${r.projectId}' but its id scope is '${scope}'; the id scope must equal the projectId.`,
                  { type: "record", id: r.id },
               ),
            );
         }
         if (partition !== r.projectId) {
            diags.push(
               err(
                  "PARTITION_PROJECT_MISMATCH",
                  `KB-3 record '${r.id}' (projectId '${r.projectId}') sits in partition '${partition}'; records live in their own project's partition.`,
                  { type: "store", id: partition },
               ),
            );
         }
      }
   }

   // Relation graph rules.
   for (const rel of data.relations) {
      const endpoints: { role: string; ep: { kb: string; id: string } }[] = [
         { role: "from", ep: rel.from },
         { role: "to", ep: rel.to },
      ];
      // Endpoint resolution (dangling edges are write-time errors, §3.2).
      for (const { role, ep } of endpoints) {
         if (ep.kb === "evidence") continue; // artifact locators are checkable pointers, not store records
         if (!ctx.byId.has(ep.id)) {
            diags.push(
               err(
                  "DANGLING_RELATION_ENDPOINT",
                  `Relation '${rel.id}' (${rel.edgeType}) has a dangling ${role} endpoint '${ep.id}' that does not resolve in this store.`,
                  { type: "relation", id: rel.id },
               ),
            );
         }
      }
      const fromRec = ctx.byId.get(rel.from.id);
      const toRec = ctx.byId.get(rel.to.id);
      const kbs = [rel.from.kb, rel.to.kb];

      if (
         UI_CORRESPONDENCE_EDGES.has(rel.edgeType) &&
         (rel.from.kb !== "KB2" || rel.to.kb !== "KB2")
      ) {
         diags.push(
            err(
               "EDGE_ENDPOINT_KB_INVALID",
               `Relation '${rel.id}' uses '${rel.edgeType}', a KB-2 UI-side correspondence edge, but its endpoints are (${kbs.join(" -> ")}); '${rel.edgeType}' requires both endpoints to be KB-2 composition units.`,
               { type: "relation", id: rel.id },
            ),
         );
      }
      if (
         SAME_CLASS_ONLY_EDGES.has(rel.edgeType) &&
         rel.from.kb !== rel.to.kb
      ) {
         diags.push(
            err(
               "EDGE_ENDPOINT_KB_INVALID",
               `Relation '${rel.id}' uses '${rel.edgeType}' across different KBs (${kbs.join(" -> ")}); same-class edges stay within one KB.`,
               { type: "relation", id: rel.id },
            ),
         );
      }
      // No false equivalence across the capability-class boundary (§3.1).
      if (
         CROSS_CLASS_FORBIDDEN.has(rel.edgeType) &&
         fromRec &&
         toRec &&
         isCmsNativeClass(fromRec) !== isCmsNativeClass(toRec)
      ) {
         diags.push(
            err(
               "CLASS_BOUNDARY_EDGE_FORBIDDEN",
               `Relation '${rel.id}' connects a Page Builder-native record with a developer-owned record via '${rel.edgeType}'; cross-class references are 'neighborOf', never '${rel.edgeType}' (editability is a different capability class).`,
               { type: "relation", id: rel.id },
            ),
         );
      }

      // Project scope on KB-3-touching edges (§8.2).
      const touchesKb3 = kbs.includes("KB3");
      if (touchesKb3 && !rel.projectId) {
         diags.push(
            err(
               "RELATION_PROJECT_SCOPE_INVALID",
               `Relation '${rel.id}' touches KB-3 endpoints but carries no projectId; cross-project links are unrepresentable and KB-3 edges must be project-scoped.`,
               { type: "relation", id: rel.id },
            ),
         );
      }
      if (!touchesKb3 && rel.projectId) {
         diags.push(
            err(
               "RELATION_PROJECT_SCOPE_INVALID",
               `Relation '${rel.id}' connects shared KB-1/KB-2 records but carries projectId '${rel.projectId}'; shared-infrastructure edges are not client data.`,
               { type: "relation", id: rel.id },
            ),
         );
      }
      if (rel.projectId) {
         for (const { role, ep } of endpoints) {
            if (ep.kb !== "KB3") continue;
            const rec = ctx.byId.get(ep.id);
            if (
               rec !== undefined &&
               isProjectRecord(rec) &&
               rec.projectId !== rel.projectId
            ) {
               diags.push(
                  err(
                     "CROSS_PROJECT_EDGE",
                     `Relation '${rel.id}' declares projectId '${rel.projectId}' but its ${role} endpoint '${ep.id}' belongs to project '${rec.projectId}'.`,
                     { type: "relation", id: rel.id },
                  ),
               );
            }
            if (ep.id.split(":")[1] && ep.id.split(":")[1] !== rel.projectId) {
               diags.push(
                  err(
                     "CROSS_PROJECT_EDGE",
                     `Relation '${rel.id}' declares projectId '${rel.projectId}' but its ${role} endpoint id '${ep.id}' is scoped to '${ep.id.split(":")[1]}'.`,
                     { type: "relation", id: rel.id },
                  ),
               );
            }
         }
      }
   }

   // Cycles in requires/providedBy/supersedes (§3.2).
   const graph = new Map<string, string[]>();
   for (const rel of data.relations) {
      if (!CYCLE_EDGE_TYPES.has(rel.edgeType)) continue;
      const list = graph.get(rel.from.id) ?? [];
      list.push(rel.to.id);
      graph.set(rel.from.id, list);
   }
   const BLACK = new Set<string>();
   const GRAY = new Set<string>();
   const visitCycle = (node: string, trail: string[]): boolean => {
      if (GRAY.has(node)) {
         diags.push(
            err(
               "RELATION_CYCLE",
               `Cycle detected in requires/providedBy/supersedes edges: ${[...trail, node].join(" -> ")}.`,
               { type: "relation", id: node },
            ),
         );
         return true;
      }
      if (BLACK.has(node)) return false;
      GRAY.add(node);
      for (const next of graph.get(node) ?? []) {
         if (visitCycle(next, [...trail, node])) return true;
      }
      GRAY.delete(node);
      BLACK.add(node);
      return false;
   };
   for (const node of [...graph.keys()].sort()) visitCycle(node, []);

   return diags;
}
