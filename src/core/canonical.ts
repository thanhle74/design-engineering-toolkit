// Canonical JSON + hashing per resources/schemas/converter/README.md (deterministic serialization rules).
// Ported verbatim (logic-identical) from the #5 G1 harness (tests/lib/canonical.mjs) as part of
// issue #9: production code must not live in tests/. Parity is proven by the unchanged T-08 checks.
import crypto from "node:crypto";

// Recursively sort object keys (Unicode code-point order) for canonical form.
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = canonicalize((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// Content hash = SHA-256 over canonical JSON of the payload minus generatedAt.
export function contentHash(payload: unknown): string {
  const { generatedAt: _omit, ...rest } = (payload ?? {}) as Record<string, unknown>;
  return crypto.createHash("sha256").update(canonicalStringify(rest)).digest("hex");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Canonical diagnostic order: (code, severity rank, subject.id, message).
const SEV_RANK: Record<string, number> = { info: 0, warning: 1, error: 2 };
export function diagnosticCompare(a: DiagnosticLike, b: DiagnosticLike): number {
  return (
    a.code.localeCompare(b.code) ||
    (SEV_RANK[a.severity] ?? 0) - (SEV_RANK[b.severity] ?? 0) ||
    (a.subject?.id ?? "").localeCompare(b.subject?.id ?? "") ||
    a.message.localeCompare(b.message)
  );
}

export interface DiagnosticLike {
  code: string;
  severity: string;
  message: string;
  subject?: { id?: string };
}

export function sortDiagnostics<T extends DiagnosticLike>(diagnostics: T[]): T[] {
  return [...diagnostics].sort(diagnosticCompare);
}

// --- Determinism across runs (issue #9) -----------------------------------------------------
// Evidence timestamps (retrievedAt/accessedAt) and the run timestamp (generatedAt) are real
// observation times and legitimately vary between runs. stableContentHash removes them before
// hashing so "same inputs/revision -> same hash" remains true; schema validity and evidence
// integrity are still checked on the unmodified payload. Never emit a stripped payload.
const VOLATILE_KEYS = new Set(["generatedAt", "retrievedAt", "accessedAt"]);

export function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!VOLATILE_KEYS.has(k)) out[k] = stripVolatile(v);
    }
    return out;
  }
  return value;
}

export function stableContentHash(payload: unknown): string {
  return crypto.createHash("sha256").update(canonicalStringify(stripVolatile(payload))).digest("hex");
}
