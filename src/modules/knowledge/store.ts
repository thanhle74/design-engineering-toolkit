// Knowledge Engine (issue #15) — the JSONL store: three logical KBs over one physical format.
// Layout: <store>/platform/records.jsonl, ui/records.jsonl, project/<projectId>/records.jsonl,
// relations/records.jsonl (+ store.json descriptor). Records are canonical JSON (sorted keys,
// compact) one per line, sorted by id — deterministic bytes for git-versioned storage.
import fs from "node:fs";
import path from "node:path";
import { canonicalStringify, sha256Hex } from "../../core/canonical.js";
import { validateContract } from "../../core/schema-registry.js";
import type {
   KbDiagnostic,
   KbProjectRecord,
   KbRecord,
   KbStoreData,
   StoreDescriptor,
   StoredRecord,
} from "./types.js";
import { isProjectRecord, isRelationRecord } from "./types.js";

export const STORE_FILES = {
   platform: "platform/records.jsonl",
   ui: "ui/records.jsonl",
   relations: "relations/records.jsonl",
   descriptor: "store.json",
} as const;

export function projectFile(projectId: string): string {
   return `project/${projectId}/records.jsonl`;
}

function sortById<T extends KbRecord>(records: T[]): T[] {
   return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

// Deterministic bytes: canonical JSON per line (sorted keys), records sorted by id, trailing
// newline. An empty partition serializes as an empty file (explicit zero state).
export function serializeRecords(records: KbRecord[]): string {
   return sortById(records)
      .map((r) => canonicalStringify(r))
      .join("\n");
}

export function serializeRecordsFile(records: KbRecord[]): string {
   const body = serializeRecords(records);
   return body.length ? body + "\n" : "";
}

export function serializeDescriptor(descriptor: StoreDescriptor): string {
   return JSON.stringify(descriptor, null, 2) + "\n";
}

export function descriptorHash(descriptor: StoreDescriptor): string {
   return sha256Hex(canonicalStringify(descriptor));
}

export interface ReadStoreResult {
   data: KbStoreData;
   records: StoredRecord[];
   diagnostics: KbDiagnostic[];
}

export interface ReadStoreOptions {
   /** When set, ONLY these KB-3 project partitions are read — other tenants' partitions (and
    * their corruption diagnostics) stay invisible to scoped consumers like `det kb query`. */
   projectPartitions?: string[];
}

// Read a store directory. Per-line parse failures are collected as diagnostics (never silently
// skipped) so a corrupted partition is always visible — scoped to the partitions the caller asked
// for. Parse-error details are withheld: raw line content must never echo into diagnostics.
export function readStore(
   storeDir: string,
   options: ReadStoreOptions = {},
): ReadStoreResult {
   const diagnostics: KbDiagnostic[] = [];
   const records: StoredRecord[] = [];
   const readPartition = (
      relFile: string,
      kb: StoredRecord["kb"],
      partition?: string,
   ) => {
      const abs = path.join(storeDir, relFile);
      if (!fs.existsSync(abs)) return;
      const raw = fs.readFileSync(abs, "utf8");
      const lines = raw.split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      lines.forEach((line, idx) => {
         if (line.trim() === "") {
            diagnostics.push({
               code: "STORE_LINE_INVALID",
               severity: "error",
               message: `${relFile}:${idx + 1} is blank; records.jsonl must carry one JSON record per line (content withheld).`,
               subject: { type: "store", id: relFile },
            });
            return;
         }
         let parsed: unknown;
         try {
            parsed = JSON.parse(line);
         } catch {
            diagnostics.push({
               code: "STORE_LINE_INVALID",
               severity: "error",
               message: `${relFile}:${idx + 1} is not valid JSON (parse position and content withheld — raw lines are never echoed into diagnostics).`,
               subject: { type: "store", id: relFile },
            });
            return;
         }
         records.push({
            kb,
            partition,
            file: relFile,
            line: idx + 1,
            record: parsed as KbRecord,
         });
      });
   };
   readPartition(STORE_FILES.platform, "platform");
   readPartition(STORE_FILES.ui, "ui");
   readPartition(STORE_FILES.relations, "relations");
   // KB-3 partitions: every directory under project/ that carries records.jsonl, filtered by the
   // caller's scope when it declares one.
   const only = options.projectPartitions
      ? new Set(options.projectPartitions)
      : null;
   const projectDir = path.join(storeDir, "project");
   if (fs.existsSync(projectDir)) {
      for (const ent of fs
         .readdirSync(projectDir, { withFileTypes: true })
         .sort((a, b) => a.name.localeCompare(b.name))) {
         if (ent.isDirectory() && (!only || only.has(ent.name)))
            readPartition(
               `project/${ent.name}/records.jsonl`,
               "project",
               ent.name,
            );
      }
   }
   const data: KbStoreData = {
      platform: [],
      ui: [],
      project: new Map(),
      relations: [],
   };
   for (const r of records) {
      if (r.kb === "platform")
         data.platform.push(r.record as (typeof data.platform)[number]);
      else if (r.kb === "ui")
         data.ui.push(r.record as (typeof data.ui)[number]);
      else if (r.kb === "relations")
         data.relations.push(r.record as (typeof data.relations)[number]);
      else if (r.kb === "project" && r.partition) {
         const list = data.project.get(r.partition) ?? [];
         list.push(r.record as KbProjectRecord);
         data.project.set(r.partition, list);
      }
   }
   return { data, records, diagnostics };
}

export function readDescriptor(storeDir: string): {
   descriptor?: StoreDescriptor;
   diagnostic?: KbDiagnostic;
} {
   const abs = path.join(storeDir, STORE_FILES.descriptor);
   if (!fs.existsSync(abs)) return {};
   let parsed: unknown;
   try {
      parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
   } catch (e) {
      return {
         diagnostic: {
            code: "STORE_DESCRIPTOR_INVALID",
            severity: "error",
            message: `store.json is not valid JSON: ${(e as Error).message}`,
            subject: { type: "store", id: STORE_FILES.descriptor },
         },
      };
   }
   const check = validateContract("kb-store", parsed);
   if (!check.valid) {
      return {
         diagnostic: {
            code: "STORE_DESCRIPTOR_INVALID",
            severity: "error",
            message: `store.json fails the kb-store contract: ${check.errors[0] ?? "unknown"}`,
            subject: { type: "store", id: STORE_FILES.descriptor },
         },
      };
   }
   return { descriptor: parsed as StoreDescriptor };
}

// All store write operations funnel through here (single writer, deterministic bytes).
export function writeStore(
   storeDir: string,
   data: KbStoreData,
   descriptor: StoreDescriptor,
): { written: string[]; diagnostics: KbDiagnostic[] } {
   const written: string[] = [];
   const diagnostics: KbDiagnostic[] = [];
   const writeOne = (relFile: string, content: string) => {
      const abs = path.join(storeDir, relFile);
      try {
         fs.mkdirSync(path.dirname(abs), { recursive: true });
         fs.writeFileSync(abs, content, "utf8");
         written.push(relFile);
      } catch (e) {
         diagnostics.push({
            code: "STORE_NOT_WRITABLE",
            severity: "error",
            message: `Cannot write '${abs}': ${(e as Error).message}`,
            subject: { type: "store", id: relFile },
         });
      }
   };
   writeOne(STORE_FILES.platform, serializeRecordsFile(data.platform));
   writeOne(STORE_FILES.ui, serializeRecordsFile(data.ui));
   for (const [projectId, records] of [...data.project.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
   )) {
      writeOne(projectFile(projectId), serializeRecordsFile(records));
   }
   writeOne(STORE_FILES.relations, serializeRecordsFile(data.relations));
   writeOne(STORE_FILES.descriptor, serializeDescriptor(descriptor));
   return { written, diagnostics };
}

// Union of record ids a store knows about (relation endpoint resolution context).
export function storeRecordIds(data: KbStoreData): Set<string> {
   const ids = new Set<string>();
   for (const r of data.platform) ids.add(r.id);
   for (const r of data.ui) ids.add(r.id);
   for (const [, list] of data.project) for (const r of list) ids.add(r.id);
   for (const r of data.relations) ids.add(r.id);
   return ids;
}

export function recordKb(r: KbRecord): StoredRecord["kb"] {
   if (isRelationRecord(r)) return "relations";
   if (isProjectRecord(r)) return "project";
   if (r.recordType === "ui-component") return "ui";
   return "platform";
}
