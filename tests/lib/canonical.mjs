// Canonical JSON + hashing per schemas/converter/README.md (deterministic serialization rules).
import crypto from "node:crypto";

// Recursively sort object keys (Unicode code-point order) for canonical form.
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

// Content hash = SHA-256 over canonical JSON of the payload minus generatedAt.
export function contentHash(payload) {
  const { generatedAt: _omit, ...rest } = payload;
  return crypto.createHash("sha256").update(canonicalStringify(rest)).digest("hex");
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Canonical diagnostic order: (code, severity rank, subject.id, message).
const SEV_RANK = { info: 0, warning: 1, error: 2 };
export function diagnosticCompare(a, b) {
  return (
    a.code.localeCompare(b.code) ||
    (SEV_RANK[a.severity] ?? 0) - (SEV_RANK[b.severity] ?? 0) ||
    (a.subject?.id ?? "").localeCompare(b.subject?.id ?? "") ||
    a.message.localeCompare(b.message)
  );
}

export function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort(diagnosticCompare);
}
