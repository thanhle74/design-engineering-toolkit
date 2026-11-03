// Out-of-process adapter runtime (TECH-ADR ADR-4/ADR-5): the core discovers adapters by JSON
// descriptor and spawns the declared entry as a subprocess — it never imports adapter code.
// Contract: stdin = one AdapterInput JSON document; stdout = one JSON payload validating
// against the descriptor's outputContract; stderr = diagnostics for humans.
// An absent/crashing adapter yields an explicit run diagnostic — never a guess.
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

const rd = (code: string, severity: RunDiagnostic["severity"], message: string, subject?: RunDiagnostic["subject"]): RunDiagnostic => ({
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
      a.message.localeCompare(b.message)
  );
}

// Discover adapters: adapters/<id>/descriptor.json, each validated against the descriptor schema.
// Invalid descriptors are skipped with an error diagnostic — a broken registration must never
// silently vanish, nor take the whole CLI down.
export function loadAdapters(repoRoot: string): { adapters: AdapterDescriptor[]; diagnostics: RunDiagnostic[] } {
  const adapters: AdapterDescriptor[] = [];
  const diagnostics: RunDiagnostic[] = [];
  const dir = path.join(repoRoot, "adapters");
  if (!fs.existsSync(dir)) return { adapters, diagnostics };
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const file = path.join(dir, ent.name, "descriptor.json");
    if (!fs.existsSync(file)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      diagnostics.push(rd("ADAPTER_DESCRIPTOR_INVALID", "error", `Adapter descriptor '${ent.name}' is not valid JSON: ${(e as Error).message}`, { type: "adapter", id: ent.name }));
      continue;
    }
    const check = validateContract("adapter-descriptor", parsed);
    if (!check.valid) {
      diagnostics.push(rd("ADAPTER_DESCRIPTOR_INVALID", "error", `Adapter descriptor '${ent.name}' fails the adapter-descriptor contract: ${check.errors[0] ?? "unknown"}`, { type: "adapter", id: ent.name }));
      continue;
    }
    const desc = parsed as AdapterDescriptor;
    if (!fs.existsSync(path.join(repoRoot, desc.entry))) {
      diagnostics.push(rd("ADAPTER_ENTRY_MISSING", "error", `Adapter '${desc.id}' entry '${desc.entry}' does not exist — run the build (npm run build) before inspecting.`, { type: "adapter", id: desc.id }));
      continue;
    }
    adapters.push(desc);
  }
  return { adapters, diagnostics };
}

export function findAdapterForPlatform(adapters: AdapterDescriptor[], platformId: string): AdapterDescriptor | null {
  return adapters.find((a) => a.platformIds.includes(platformId)) ?? null;
}

export interface AdapterRunResult {
  ok: boolean;
  payload?: unknown;
  diagnostics: RunDiagnostic[];
}

// Spawn the adapter: process.execPath + entry path (no shell), input JSON on stdin, bounded time.
// Deterministic and least-privilege by construction; stderr is captured (bounded) for messages only.
export function runAdapter(
  repoRoot: string,
  descriptor: AdapterDescriptor,
  input: unknown,
  options: { timeoutMs?: number } = {}
): Promise<AdapterRunResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const entryAbs = path.join(repoRoot, descriptor.entry);
  const diagnostics: RunDiagnostic[] = [];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, [entryAbs], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      resolve({ ok: false, diagnostics: [rd("ADAPTER_SPAWN_FAILED", "error", `Adapter '${descriptor.id}' could not be spawned: ${(e as Error).message}`, { type: "adapter", id: descriptor.id })] });
      return;
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, diagnostics: [rd("ADAPTER_SPAWN_FAILED", "error", `Adapter '${descriptor.id}' failed to start: ${e.message}`, { type: "adapter", id: descriptor.id })] });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stderrTail = stderr.trim().slice(-400);
      if (timedOut) {
        resolve({ ok: false, diagnostics: [rd("ADAPTER_TIMEOUT", "error", `Adapter '${descriptor.id}' exceeded ${timeoutMs}ms and was killed.`, { type: "adapter", id: descriptor.id })] });
        return;
      }
      if (code !== 0) {
        resolve({ ok: false, diagnostics: [rd("ADAPTER_EXIT_NONZERO", "error", `Adapter '${descriptor.id}' exited with code ${code}.${stderrTail ? " stderr: " + stderrTail : ""}`, { type: "adapter", id: descriptor.id })] });
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(stdout);
      } catch {
        resolve({ ok: false, diagnostics: [rd("ADAPTER_OUTPUT_INVALID_JSON", "error", `Adapter '${descriptor.id}' stdout is not a single JSON document (got ${stdout.length} bytes).`, { type: "adapter", id: descriptor.id })] });
        return;
      }
      const outputCheck = validateContractSchemaId(descriptor.outputContract, payload);
      if (!outputCheck.valid) {
        resolve({
          ok: false,
          payload,
          diagnostics: [rd("ADAPTER_OUTPUT_CONTRACT_VIOLATION", "error", `Adapter '${descriptor.id}' stdout fails ${descriptor.outputContract}: ${outputCheck.errors[0] ?? "unknown"}`, { type: "adapter", id: descriptor.id })],
        });
        return;
      }
      resolve({ ok: true, payload, diagnostics });
    });
    child.stdin.on("error", () => {
      /* adapter died before reading stdin; close handler reports the real cause */
    });
    child.stdin.end(JSON.stringify(input));
  });
}

// Validate against a schema by its absolute $id (the descriptor names contracts by $id).
import { getAjv } from "./schema-registry.js";
function validateContractSchemaId(schemaId: string, payload: unknown): { valid: boolean; errors: string[] } {
  const ajv = getAjv();
  const validate = ajv.getSchema(schemaId);
  if (!validate) return { valid: false, errors: [`schema '${schemaId}' is not registered`] };
  const ok = validate(payload);
  return { valid: ok, errors: ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()) };
}
