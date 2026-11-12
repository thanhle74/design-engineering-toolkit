// Knowledge Engine (issue #15) — store validation: schema shape for every record, JSONL
// integrity, descriptor honesty, KB-3 project/tenant consistency, relation graph integrity and
// the licensed/secret content guards. Re-derives descriptor counts and flags drift (the
// descriptor must never lie about the partitions next to it).

import { canonicalStringify } from "../core/canonical.js";
import type {
   KbDiagnostic,
   KbRecord,
   KbStoreData,
   KbUiComponentRecord,
   StoreDescriptor,
} from "./types.js";
import { isProjectRecord } from "./types.js";
import {
   buildSemanticContext,
   duplicateRecordCheck,
   semanticChecks,
} from "./semantic.js";
import { readDescriptor, readStore } from "./store.js";
import { recordSafetyViolations } from "./safety.js";

export interface ValidateResult {
   data: KbStoreData;
   descriptor?: StoreDescriptor;
   diagnostics: KbDiagnostic[];
   valid: boolean;
   counts: { records: number; errors: number; warnings: number };
}

export function runValidate(storeDir: string): ValidateResult {
   const diagnostics: KbDiagnostic[] = [];
   const store = readStore(storeDir);
   diagnostics.push(...store.diagnostics);
   const data = store.data;

   // Descriptor honesty (advisory identity, hard drift rule).
   const desc = readDescriptor(storeDir);
   if (desc.diagnostic) diagnostics.push(desc.diagnostic);
   const descriptor = desc.descriptor;
   if (descriptor) {
      const actualProjects = [...data.project.keys()].sort();
      if (
         JSON.stringify(actualProjects) !==
         JSON.stringify([...descriptor.projects].sort())
      ) {
         diagnostics.push({
            code: "STORE_COUNTS_DRIFT",
            severity: "error",
            message: `store.json projects ${JSON.stringify(descriptor.projects)} do not match partitions ${JSON.stringify(actualProjects)}; regenerate the descriptor (det kb ingest) — it must never lie.`,
            subject: { type: "store", id: "store.json" },
         });
      }
      const actualCounts = {
         platform: data.platform.length,
         ui: data.ui.length,
         project: [...data.project.values()].reduce((n, l) => n + l.length, 0),
         relations: data.relations.length,
      };
      if (
         canonicalStringify(actualCounts) !==
         canonicalStringify(descriptor.counts)
      ) {
         diagnostics.push({
            code: "STORE_COUNTS_DRIFT",
            severity: "error",
            message: `store.json counts ${JSON.stringify(descriptor.counts)} do not match partitions ${JSON.stringify(actualCounts)}; regenerate the descriptor (det kb ingest).`,
            subject: { type: "store", id: "store.json" },
         });
      }
   }

   // Every record: schema shape + secret/licensed guards.
   const all: KbRecord[] = [...data.platform, ...data.ui, ...data.relations];
   for (const [, list] of data.project) all.push(...list);
   for (const record of all) {
      // One shared gate for all consumers (ingest refuses on it; query trusts only its output).
      const violations = recordSafetyViolations(record);
      for (const v of violations) {
         if (v.startsWith("schema:")) {
            diagnostics.push({
               code: "RECORD_SCHEMA_INVALID",
               severity: "error",
               message: `Record '${record.id}' fails its record schema: ${v.slice("schema: ".length)}`,
               subject: { type: "record", id: record.id },
            });
         } else if (v.startsWith("licensed-oversize:")) {
            diagnostics.push({
               code: "LICENSED_FIELD_TOO_LARGE",
               severity: "error",
               message: `Licensed UI record '${record.id}' carries an oversized free-text field '${v.slice("licensed-oversize: ".length)}'; licensed packages are metadata-only.`,
               subject: { type: "record", id: record.id },
            });
         } else {
            diagnostics.push({
               code: "SECRET_PATTERN_DETECTED",
               severity: "error",
               message: `Record '${record.id}' field '${v.slice("secret-pattern: ".length)}' matches a secret pattern; the store carries metadata, never credentials.`,
               subject: { type: "record", id: record.id },
            });
         }
      }
      if (isProjectRecord(record)) {
         if (record.visibility === "private") {
            diagnostics.push({
               code: "VISIBILITY_NOT_PUBLIC",
               severity: "error",
               message: `KB-3 record '${record.id}' is visibility 'private' inside this store; private tenant material cannot be committed.`,
               subject: { type: "record", id: record.id },
            });
         }
      }
   }

   // Record identity + relation graph + project isolation rules (shared with ingest).
   diagnostics.push(...duplicateRecordCheck(data));
   diagnostics.push(...semanticChecks(data, buildSemanticContext(data)));

   const errors = diagnostics.filter((d) => d.severity === "error").length;
   const warnings = diagnostics.filter((d) => d.severity === "warning").length;
   return {
      data,
      descriptor,
      diagnostics,
      valid: errors === 0,
      counts: { records: all.length, errors, warnings },
   };
}
