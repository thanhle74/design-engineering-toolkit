// Semantic validator for capability registries (checks beyond JSON Schema).
// Proof-ladder justification: G1/G2 payloads must never claim admin-roundtrip-verified or
// visually-verified (later-stage receipts only), and 'registered' requires config-declaration
// evidence from the platform's own registration surface at the pinned revision.
// Ported verbatim (logic-identical) from the #5 G1 harness (tests/lib/semantic.mjs), issue #9.
import type { Availability, Capability, CapabilityCategory, CapabilityRegistry, Diagnostic, DiagnosticSubjectType, DiagnosticSeverity, ProofLevel, RegistrySummary } from "./types.js";

export const PROOF_RANK: ProofLevel[] = ["not-verified", "discovered", "registered", "structurally-mapped", "admin-roundtrip-verified", "visually-verified"];

function d(code: string, severity: DiagnosticSeverity, type: DiagnosticSubjectType, id: string, message: string): Diagnostic {
  return { code, severity, message, subject: { type, id } };
}

export function validateRegistry(registry: CapabilityRegistry): { valid: boolean; diagnostics: Diagnostic[] } {
  const diags: Diagnostic[] = [];
  const seen = new Map<string, boolean>();
  for (const cap of registry.capabilities) {
    const key = `${cap.id}␟${cap.appearanceId}`;
    if (seen.has(key)) {
      diags.push(d("EVIDENCE_MISSING", "error", "capability", cap.id, `Duplicate capability identity (${cap.id}, ${cap.appearanceId}) — identity must be unique.`));
    }
    seen.set(key, true);

    // Summary consistency is checked globally below; per-capability proof checks here.
    if (cap.proofLevel === "registered") {
      const ok = cap.evidence.some((e) => e.kind === "config-declaration");
      if (!ok) {
        diags.push(d("EVIDENCE_MISSING", "error", "capability", cap.id, `proofLevel 'registered' claimed without config-declaration evidence from the platform's own registration surface; demote to 'discovered' or add registration-surface evidence.`));
      }
    }
    if (cap.proofLevel === "admin-roundtrip-verified" || cap.proofLevel === "visually-verified") {
      diags.push(d("EVIDENCE_MISSING", "error", "capability", cap.id, `proofLevel '${cap.proofLevel}' requires later-stage (G3/G4) test receipts; it cannot be justified in a G1/G2 payload. Payload rejected.`));
    }
    if (cap.availability === "unknown" && PROOF_RANK.indexOf(cap.proofLevel) > PROOF_RANK.indexOf("discovered")) {
      diags.push(d("EVIDENCE_MISSING", "error", "capability", cap.id, `availability 'unknown' caps proof at 'discovered'; enablement must be observed before 'registered'.`));
    }
    if (cap.category === "unsupported" && !cap.unsupportedReason) {
      diags.push(d("EVIDENCE_MISSING", "error", "capability", cap.id, `category 'unsupported' requires unsupportedReason (fail closed, never silent).`));
    }
  }

  // Summary counts must match the capabilities array.
  const cat: Record<CapabilityCategory, number> = { native: 0, widget: 0, chrome: 0, "custom-required": 0, unsupported: 0 };
  const proof = Object.fromEntries(PROOF_RANK.map((p) => [p, 0])) as Record<ProofLevel, number>;
  const avail: Record<Availability, number> = { enabled: 0, disabled: 0, deprecated: 0, unknown: 0 };
  for (const cap of registry.capabilities) {
    cat[cap.category]++;
    proof[cap.proofLevel]++;
    avail[cap.availability]++;
  }
  const tamper = (name: string, declared: RegistrySummary["byCategory"] | Record<string, number>, actual: Record<string, number>): Diagnostic[] =>
    JSON.stringify(declared) !== JSON.stringify(actual)
      ? [d("EVIDENCE_MISSING", "error", "capability", `summary.${name}`, `summary.${name} does not match the capabilities array: declared ${JSON.stringify(declared)}, actual ${JSON.stringify(actual)}.`)]
      : [];
  diags.push(
    ...tamper("byCategory", registry.summary.byCategory, cat),
    ...tamper("byProofLevel", registry.summary.byProofLevel, proof),
    ...tamper("byAvailability", registry.summary.byAvailability, avail)
  );

  return { valid: !diags.some((x) => x.severity === "error"), diagnostics: diags };
}

export function maxJustifiedProofLevel(report: { sections: { status: string; selected: unknown; proofLevel: ProofLevel }[] }): ProofLevel {
  // Recompute the highest proof level the report's own evidence justifies.
  let justified: ProofLevel = "not-verified";
  const rank = (p: ProofLevel) => PROOF_RANK.indexOf(p);
  for (const section of report.sections) {
    if (section.status === "mapped" && section.selected && section.proofLevel === "structurally-mapped") {
      justified = rank(justified) < rank("structurally-mapped") ? "structurally-mapped" : justified;
    } else if (section.selected && rank(section.proofLevel) > rank(justified)) {
      justified = section.proofLevel === "admin-roundtrip-verified" || section.proofLevel === "visually-verified" ? justified : section.proofLevel;
    }
  }
  // Nothing in G1 can justify beyond structurally-mapped: later-stage receipts are out of scope.
  if (rank(justified) > PROOF_RANK.indexOf("structurally-mapped")) justified = "structurally-mapped";
  return justified;
}

// Re-export the Capability type so adapter code can consume the canonical shape.
export type { Capability };
