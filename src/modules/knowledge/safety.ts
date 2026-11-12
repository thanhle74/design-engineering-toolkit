// Knowledge Engine (issue #15) — the shared per-record SAFETY GATE and the schema/licensed
// helpers every consumer (ingest refusal, store validation, QUERY trust gate) runs on each
// record. One code path: schema shape (ajv) + licensed free-text caps + secret-pattern scan.
// Violations carry KINDS and field PATHS only — never field values (no content echo).
import { validateContract } from "../core/schema-registry.js";
import { scanForSecrets, scanForOversizedStrings } from "./path-gateway.js";
import type { KbRecord, KbUiComponentRecord } from "./types.js";

// Pick the contract a record validates against; unknown record types are refused.
// 'module' (issue #19 M4) is an installed-module inventory record and validates as KB-1
// (kb-capability carries the recordType enum extension).
export function schemaNameForRecord(recordType: string): string | null {
   if (
      recordType === "capability" ||
      recordType === "data-provider" ||
      recordType === "module"
   )
      return "kb-capability";
   if (recordType === "ui-component") return "kb-ui-component";
   if (recordType === "relation") return "kb-relations";
   if (
      [
         "requirement",
         "ux-intent",
         "composition",
         "decision",
         "approval",
         "risk",
         "open-question",
         "constraint",
         "source-document",
      ].includes(recordType)
   )
      return "kb-project-record";
   return null;
}

export function validateRecordShape(record: KbRecord): {
   valid: boolean;
   errors: string[];
} {
   const name = schemaNameForRecord(record.recordType);
   if (!name)
      return {
         valid: false,
         errors: [`unknown recordType '${record.recordType}'`],
      };
   return validateContract(name, record);
}

// Deterministic free-text cap for licensed-package records (metadata-only by structure; this
// guards the free-text channel a schema cannot close, CONTRACTS.md §8.3).
export const LICENSED_TEXT_LIMIT = 500;

export function licensedRecordViolations(
   record: KbUiComponentRecord,
): string[] {
   const licensed =
      record.license?.regime === "commercial" ||
      record.license?.derivedArtifactPolicy === "metadata-only";
   if (!licensed) return [];
   return scanForOversizedStrings(record, LICENSED_TEXT_LIMIT);
}

export function recordSafetyViolations(record: KbRecord): string[] {
   const violations: string[] = [];
   const shape = validateRecordShape(record);
   if (!shape.valid) violations.push(`schema: ${shape.errors[0] ?? "unknown"}`);
   if (record.recordType === "ui-component") {
      for (const field of licensedRecordViolations(
         record as KbUiComponentRecord,
      ))
         violations.push(`licensed-oversize: ${field}`);
   }
   for (const field of scanForSecrets(record))
      violations.push(`secret-pattern: ${field}`);
   return violations;
}
