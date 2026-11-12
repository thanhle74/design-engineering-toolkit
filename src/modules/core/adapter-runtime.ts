// Out-of-process adapter runtime (TECH-ADR ADR-4/ADR-5): the core discovers adapters by JSON
// descriptor and spawns the declared entry as a subprocess — it never imports adapter code.
// Contract: stdin = one AdapterInput JSON document; stdout = one JSON payload validating
// against the descriptor's outputContract; stderr = diagnostics for humans.
// An absent/crashing adapter yields an explicit run diagnostic — never a guess.
//
// Coordinator F4 fixes: child stdout/stderr are collected under deterministic byte caps
// (overflow = ADAPTER_OUTPUT_OVERFLOW, child killed); raw adapter stderr is NEVER embedded in
// machine-readable diagnostics or persisted receipts (returned separately for the terminal
// only); descriptor entries with interior traversal are rejected, and the resolved entry must
// stay inside the repository root. NOTE (honest trust boundary): permissions.readOnly is a
// DECLARATIVE statement validated by schema — it is not OS sandbox enforcement; adapters run
// with the invoking user's local privileges.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { validateContract } from "./schema-registry.js";

export interface AdapterDescriptor {
   schemaVersion: number;
   id: string;
   platformIds: string[];
   entry: string;
   inputContract?: string;
   outputContract: string;
   permissions: { readOnly: true };
   version?: string;
   description?: string;
}

export interface RunDiagnostic {
   code: string;
   severity: "info" | "warning" | "error";
   message: string;
   subject?: { type: string; id: string };
}

const rd = (
   code: string,
   severity: RunDiagnostic["severity"],
   message: string,
   subject?: RunDiagnostic["subject"],
): RunDiagnostic => ({
   code,
   severity,
   message,
   ...(subject ? { subject } : {}),
});

// Sorted by (code, severity rank, subject.id, message) — same canonical order as converter diagnostics.
const SEV_RANK: Record<string, number> = { info: 0, warning: 1, error: 2 };
export function sortRunDiagnostics(diags: RunDiagnostic[]): RunDiagnostic[] {
   return [...diags].sort(
      (a, b) =>
         a.code.localeCompare(b.code) ||
         (SEV_RANK[a.severity] ?? 0) - (SEV_RANK[b.severity] ?? 0) ||
         (a.subject?.id ?? "").localeCompare(b.subject?.id ?? "") ||
         a.message.localeCompare(b.message),
   );
}

// Entry-path rule: repo-relative, no traversal segments anywhere (leading or interior), and —
// enforced again at spawn time by realpath containment — resolves inside the repository root.
const ENTRY_PATTERN = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._/-]+$/;

export function validateAdapterEntry(
   repoRoot: string,
   entry: string,
): { ok: true; abs: string } | { ok: false; reason: string } {
   if (!ENTRY_PATTERN.test(entry))
      return {
         ok: false,
         reason: `entry '${entry}' must be a repo-relative path without traversal segments`,
      };
   const abs = path.join(repoRoot, entry);
   if (!fs.existsSync(abs))
      return {
         ok: false,
         reason: `entry '${entry}' does not exist — run the build (pnpm run build) before inspecting`,
      };
   try {
      const rootReal = fs.realpathSync(repoRoot);
      const entryReal = fs.realpathSync(abs);
      const rel = path.relative(rootReal, entryReal);
      if (rel.startsWith("..") || path.isAbsolute(rel))
         return {
            ok: false,
            reason: `entry '${entry}' resolves outside the repository root`,
         };
   } catch {
      return {
         ok: false,
         reason: `entry '${entry}' could not be resolved to a real path`,
      };
   }
   return { ok: true, abs };
}

// Discover adapters: src/modules/**/adapters/<id>/descriptor.json ([68] adapter implementations
// are owned by their feature module under src/modules/), each validated against the descriptor
// schema. Discovery skips test/generated trees, walks deterministically and stops descending at
// an adapters/ directory (its children are adapter ids). Invalid descriptors are skipped with an
// error diagnostic — a broken registration must never silently vanish, nor take the whole CLI down.
const ADAPTER_WALK_SKIP = new Set([
   "__tests__",
   "__fixtures__",
   "node_modules",
   "dist",
]);

function collectAdapterDescriptorFiles(repoRoot: string): string[] {
   const modulesRoot = path.join(repoRoot, "src", "modules");
   if (!fs.existsSync(modulesRoot)) return [];
   const adaptersDirs: string[] = [];
   const walk = (dir: string): void => {
      for (const ent of fs
         .readdirSync(dir, { withFileTypes: true })
         .sort((a, b) => a.name.localeCompare(b.name))) {
         if (!ent.isDirectory() || ADAPTER_WALK_SKIP.has(ent.name)) continue;
         const child = path.join(dir, ent.name);
         if (ent.name === "adapters") {
            adaptersDirs.push(child);
            continue; // children of adapters/ are adapter ids, not further module tree
         }
         walk(child);
      }
   };
   walk(modulesRoot);
   const files: string[] = [];
   for (const dir of adaptersDirs) {
      for (const ent of fs
         .readdirSync(dir, { withFileTypes: true })
         .sort((a, b) => a.name.localeCompare(b.name))) {
         if (!ent.isDirectory()) continue;
         const file = path.join(dir, ent.name, "descriptor.json");
         if (fs.existsSync(file)) files.push(file);
      }
   }
   // Order by adapter id (the descriptor's directory name) first — matching the pre-[68]
   // single-root discovery order, which findAdapterForPlatform relies on when two adapters
   // declare the same platform (the probe wins over its composer sibling) — then by path.
   return files.sort(
      (a, b) =>
         path
            .basename(path.dirname(a))
            .localeCompare(path.basename(path.dirname(b))) ||
         a.localeCompare(b),
   );
}

export function loadAdapters(repoRoot: string): {
   adapters: AdapterDescriptor[];
   diagnostics: RunDiagnostic[];
} {
   const adapters: AdapterDescriptor[] = [];
   const diagnostics: RunDiagnostic[] = [];
   const files = collectAdapterDescriptorFiles(repoRoot);
   for (const file of files) {
      const entName = path.basename(path.dirname(file));
      let parsed: unknown;
      try {
         parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
         diagnostics.push(
            rd(
               "ADAPTER_DESCRIPTOR_INVALID",
               "error",
               `Adapter descriptor '${entName}' is not valid JSON: ${(e as Error).message}`,
               { type: "adapter", id: entName },
            ),
         );
         continue;
      }
      const check = validateContract("adapter-descriptor", parsed);
      if (!check.valid) {
         diagnostics.push(
            rd(
               "ADAPTER_DESCRIPTOR_INVALID",
               "error",
               `Adapter descriptor '${entName}' fails the adapter-descriptor contract: ${check.errors[0] ?? "unknown"}`,
               { type: "adapter", id: entName },
            ),
         );
         continue;
      }
      const desc = parsed as AdapterDescriptor;
      const entryCheck = validateAdapterEntry(repoRoot, desc.entry);
      if (!entryCheck.ok) {
         diagnostics.push(
            rd(
               "ADAPTER_ENTRY_OUT_OF_ROOT",
               "error",
               `Adapter '${desc.id}': ${entryCheck.reason}.`,
               { type: "adapter", id: desc.id },
            ),
         );
         continue;
      }
      adapters.push(desc);
   }
   return { adapters, diagnostics };
}

export function findAdapterForPlatform(
   adapters: AdapterDescriptor[],
   platformId: string,
): AdapterDescriptor | null {
   return adapters.find((a) => a.platformIds.includes(platformId)) ?? null;
}

export interface AdapterRunResult {
   ok: boolean;
   payload?: unknown;
   diagnostics: RunDiagnostic[];
   /** Terminal-only adapter stderr tail (bounded). Never embed in machine receipts. */
   stderrTail?: string;
}

export interface AdapterRunOptions {
   timeoutMs?: number;
   maxStdoutBytes?: number;
   maxStderrBytes?: number;
}

const DEFAULT_MAX_STDOUT = 8 * 1024 * 1024; // registries are small; 8 MiB is a hard honesty cap
const DEFAULT_MAX_STDERR = 64 * 1024;

// Spawn the adapter: process.execPath + entry path (no shell), input JSON on stdin, bounded
// time AND bounded output. Deterministic and least-privilege by construction.
export function runAdapter(
   repoRoot: string,
   descriptor: AdapterDescriptor,
   input: unknown,
   options: AdapterRunOptions = {},
): Promise<AdapterRunResult> {
   const timeoutMs = options.timeoutMs ?? 60_000;
   const maxStdout = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT;
   const maxStderr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR;
   const entryCheck = validateAdapterEntry(repoRoot, descriptor.entry);
   if (!entryCheck.ok) {
      return Promise.resolve({
         ok: false,
         diagnostics: [
            rd(
               "ADAPTER_ENTRY_OUT_OF_ROOT",
               "error",
               `Adapter '${descriptor.id}': ${entryCheck.reason}.`,
               { type: "adapter", id: descriptor.id },
            ),
         ],
      });
   }
   const entryAbs = entryCheck.abs;
   const diagnostics: RunDiagnostic[] = [];
   return new Promise((resolve) => {
      let child;
      try {
         child = spawn(process.execPath, [entryAbs], {
            cwd: repoRoot,
            stdio: ["pipe", "pipe", "pipe"],
         });
      } catch (e) {
         resolve({
            ok: false,
            diagnostics: [
               rd(
                  "ADAPTER_SPAWN_FAILED",
                  "error",
                  `Adapter '${descriptor.id}' could not be spawned: ${(e as Error).message}`,
                  { type: "adapter", id: descriptor.id },
               ),
            ],
         });
         return;
      }
      let settled = false;
      const finish = (result: AdapterRunResult) => {
         if (settled) return;
         settled = true;
         clearTimeout(timer);
         resolve(result);
      };
      let timedOut = false;
      const timer = setTimeout(() => {
         timedOut = true;
         child.kill("SIGKILL");
      }, timeoutMs);

      let stdout = "";
      let stdoutBytes = 0;
      let stderr = "";
      let stderrBytes = 0;
      child.stdout.on("data", (chunk: Buffer) => {
         stdoutBytes += chunk.length;
         if (stdoutBytes > maxStdout) {
            child.kill("SIGKILL");
            return;
         }
         stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
         stderrBytes += chunk.length;
         if (stderrBytes > maxStderr) return; // bounded: keep the first maxStderr bytes only
         stderr += chunk.toString("utf8");
      });
      child.on("error", (e: Error) => {
         finish({
            ok: false,
            diagnostics: [
               rd(
                  "ADAPTER_SPAWN_FAILED",
                  "error",
                  `Adapter '${descriptor.id}' failed to start: ${e.message}`,
                  { type: "adapter", id: descriptor.id },
               ),
            ],
         });
      });
      child.on("close", (code) => {
         const stderrTail =
            stderrBytes > 0 ? stderr.trim().slice(-400) : undefined;
         if (stdoutBytes > maxStdout) {
            finish({
               ok: false,
               diagnostics: [
                  rd(
                     "ADAPTER_OUTPUT_OVERFLOW",
                     "error",
                     `Adapter '${descriptor.id}' stdout exceeded the ${maxStdout}-byte bound and was killed; nothing was parsed.`,
                     { type: "adapter", id: descriptor.id },
                  ),
               ],
               stderrTail,
            });
            return;
         }
         if (timedOut) {
            finish({
               ok: false,
               diagnostics: [
                  rd(
                     "ADAPTER_TIMEOUT",
                     "error",
                     `Adapter '${descriptor.id}' exceeded ${timeoutMs}ms and was killed.`,
                     { type: "adapter", id: descriptor.id },
                  ),
               ],
               stderrTail,
            });
            return;
         }
         if (code !== 0) {
            // Raw stderr stays terminal-only: machine receipts carry the fact, not untrusted bytes.
            finish({
               ok: false,
               diagnostics: [
                  rd(
                     "ADAPTER_EXIT_NONZERO",
                     "error",
                     `Adapter '${descriptor.id}' exited with code ${code} (adapter stderr omitted from receipts; see terminal output).`,
                     { type: "adapter", id: descriptor.id },
                  ),
               ],
               stderrTail,
            });
            return;
         }
         let payload: unknown;
         try {
            payload = JSON.parse(stdout);
         } catch {
            finish({
               ok: false,
               diagnostics: [
                  rd(
                     "ADAPTER_OUTPUT_INVALID_JSON",
                     "error",
                     `Adapter '${descriptor.id}' stdout is not a single JSON document (got ${stdoutBytes} bytes).`,
                     { type: "adapter", id: descriptor.id },
                  ),
               ],
               stderrTail,
            });
            return;
         }
         const outputCheck = validateContractSchemaId(
            descriptor.outputContract,
            payload,
         );
         if (!outputCheck.valid) {
            finish({
               ok: false,
               payload,
               diagnostics: [
                  rd(
                     "ADAPTER_OUTPUT_CONTRACT_VIOLATION",
                     "error",
                     `Adapter '${descriptor.id}' stdout fails ${descriptor.outputContract}: ${outputCheck.errors[0] ?? "unknown"}`,
                     { type: "adapter", id: descriptor.id },
                  ),
               ],
               stderrTail,
            });
            return;
         }
         finish({ ok: true, payload, diagnostics });
      });
      child.stdin.on("error", () => {
         /* adapter died before reading stdin; close handler reports the real cause */
      });
      child.stdin.end(JSON.stringify(input));
   });
}

// Validate against a schema by its absolute $id (the descriptor names contracts by $id).
import { getAjv } from "./schema-registry.js";
function validateContractSchemaId(
   schemaId: string,
   payload: unknown,
): { valid: boolean; errors: string[] } {
   const ajv = getAjv();
   const validate = ajv.getSchema(schemaId);
   if (!validate)
      return {
         valid: false,
         errors: [`schema '${schemaId}' is not registered`],
      };
   const ok = validate(payload);
   return {
      valid: ok,
      errors: ok
         ? []
         : (validate.errors ?? []).map(
              (e: { instancePath: string; message?: string }) =>
                 `${e.instancePath || "/"} ${e.message ?? ""}`.trim(),
           ),
   };
}
