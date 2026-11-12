// I/O helpers for det: JSON file reading with explicit run diagnostics, deterministic
// serialization (2-space indent + trailing newline), --out writing (no-write by default),
// and the human-readable summary that presents the JSON (never replaces it).
import fs from "node:fs";
import path from "node:path";
import type { RunDiagnostic } from "../adapter-runtime.js";

// Injectable I/O for commands: stdout, stderr and the process environment (determinism tests
// pass a fake env; the real CLI passes process.stdout/stderr writers).
export interface CommandIO {
   env: NodeJS.ProcessEnv;
   out: (line: string) => void;
   err: (line: string) => void;
}

export function readJsonFile(
   filePath: string,
): { ok: true; data: unknown } | { ok: false; diagnostic: RunDiagnostic } {
   let raw: string;
   try {
      raw = fs.readFileSync(filePath, "utf8");
   } catch (e) {
      return {
         ok: false,
         diagnostic: {
            code: "INPUT_UNREADABLE",
            severity: "error",
            message: `Cannot read input file '${filePath}': ${(e as Error).message}`,
            subject: { type: "input", id: path.basename(filePath) },
         },
      };
   }
   try {
      return { ok: true, data: JSON.parse(raw) };
   } catch (e) {
      return {
         ok: false,
         diagnostic: {
            code: "INPUT_INVALID_JSON",
            severity: "error",
            message: `Input file '${filePath}' is not valid JSON: ${(e as Error).message}`,
            subject: { type: "input", id: path.basename(filePath) },
         },
      };
   }
}

export function serializeJson(payload: unknown): string {
   return JSON.stringify(payload, null, 2) + "\n";
}

export interface WriteResult {
   wroteFiles: boolean;
   written: string[];
   diagnostics: RunDiagnostic[];
}

// Write the named artifacts under outDir. Deterministic bytes in; directories created as needed.
// --dry-run and a missing --out both mean: nothing is ever written.
export function writeOutFiles(
   outDir: string | null,
   files: { name: string; content: string }[],
   dryRun: boolean,
): WriteResult {
   if (dryRun) {
      return {
         wroteFiles: false,
         written: [],
         diagnostics: files.length
            ? [
                 {
                    code: "NO_FILES_WRITTEN_DRY_RUN",
                    severity: "info",
                    message: `Dry run: ${files.length} artifact(s) computed but not written${outDir ? ` (would target '${outDir}')` : ""}.`,
                    subject: { type: "output", id: outDir ?? "(stdout)" },
                 },
              ]
            : [],
      };
   }
   if (!outDir) return { wroteFiles: false, written: [], diagnostics: [] };
   const written: string[] = [];
   const diagnostics: RunDiagnostic[] = [];
   try {
      fs.mkdirSync(outDir, { recursive: true });
   } catch (e) {
      return {
         wroteFiles: false,
         written: [],
         diagnostics: [
            {
               code: "OUTPUT_NOT_WRITABLE",
               severity: "error",
               message: `Cannot create output directory '${outDir}': ${(e as Error).message}`,
               subject: { type: "output", id: outDir },
            },
         ],
      };
   }
   for (const f of files) {
      const target = path.join(outDir, f.name);
      try {
         // Names may carry relative subpaths (e.g. the KB store's project/<id>/records.jsonl);
         // create the parent chain so nested artifact names are first-class, then write.
         fs.mkdirSync(path.dirname(target), { recursive: true });
         fs.writeFileSync(target, f.content, "utf8");
         written.push(f.name);
      } catch (e) {
         diagnostics.push({
            code: "OUTPUT_NOT_WRITABLE",
            severity: "error",
            message: `Cannot write '${target}': ${(e as Error).message}`,
            subject: { type: "output", id: f.name },
         });
      }
   }
   return { wroteFiles: written.length > 0, written, diagnostics };
}

// ---- Human-readable summary (a presentation of the JSON, never a replacement) ----------------
const SEV_LABEL: Record<string, string> = {
   error: "error",
   warning: "warning",
   info: "info",
};

export function renderDiagnosticLine(d: {
   code: string;
   severity: string;
   message: string;
}): string {
   return `  ${SEV_LABEL[d.severity]?.toUpperCase() ?? d.severity.toUpperCase()}  ${d.code}  ${d.message}`;
}

export function renderCounts(counts: {
   errors: number;
   warnings: number;
   infos: number;
}): string {
   return `diagnostics: ${counts.errors} error(s), ${counts.warnings} warning(s), ${counts.infos} info`;
}
