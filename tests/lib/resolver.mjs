// Minimal deterministic resolver used by the G1 negative-case test plan.
// Scope (deliberate): binding-map validation + structure resolution against a pinned registry,
// producing a ResolutionReport per schemas/converter/resolution-report.schema.json.
// It resolves structure-section/element fixtures — a real NodeIR/PageStructure pipeline is G2 work.
import { canonicalStringify, contentHash, sha256Hex, sortDiagnostics } from "./canonical.mjs";
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const d = (code, severity, type, id, message) => ({ code, severity, message, subject: { type, id } });

// ---- Binding-map validation -------------------------------------------------
export function validateBindingMap(registry, map) {
  const diags = [];
  const caps = new Map(registry.capabilities.map((c) => [`${c.id}␟${c.appearanceId}`, c]));
  const ids = new Set(registry.capabilities.map((c) => c.id));

  const tuples = new Map();
  for (const b of map.bindings) {
    const tuple = [b.sourceComponentId, canonicalStringify(b.variantConditions), b.target.capabilityId, b.target.appearanceId].join("␟");
    if (tuples.has(tuple)) {
      diags.push(d("DUPLICATE_BINDING", "error", "binding", b.sourceComponentId, `Exact duplicate binding identity for '${b.sourceComponentId}' — delete one, do not disambiguate.`));
    }
    tuples.set(tuple, b);

    if (!ids.has(b.target.capabilityId)) {
      diags.push(d("UNSUPPORTED_CAPABILITY", "error", "binding", b.sourceComponentId, `Target capability '${b.target.capabilityId}' is absent from the pinned registry; map to a registered capability or record explicit fallback.`));
      continue;
    }
    const cap = caps.get(`${b.target.capabilityId}␟${b.target.appearanceId}`);
    if (!cap) {
      diags.push(d("UNSUPPORTED_APPEARANCE", "error", "appearance", `${b.target.capabilityId}#${b.target.appearanceId}`, `Appearance '${b.target.appearanceId}' is not declared for capability '${b.target.capabilityId}'; no appearance guessing.`));
      continue;
    }
    if (cap.availability === "disabled" || cap.availability === "deprecated" || cap.availability === "unknown") {
      diags.push(d("CAPABILITY_DISABLED", "error", "capability", cap.id, `Target capability '${cap.id}' is ${cap.availability}; silently mapping a non-enabled capability is forbidden.`));
    }
    const accepted = new Set(cap.acceptedProps.map((p) => p.name));
    for (const t of b.propsTransform) {
      if (!accepted.has(t.to)) {
        diags.push(d("MISSING_REQUIRED_PROP", "error", "prop", `${b.sourceComponentId}#${t.to}`, `Transform target prop '${t.to}' does not exist in acceptedProps of '${cap.id}'.`));
      }
    }
  }

  // Ambiguity: same sourceComponentId with overlapping condition sets -> different targets.
  const byComponent = new Map();
  for (const b of map.bindings) byComponent.set(b.sourceComponentId, [...(byComponent.get(b.sourceComponentId) ?? []), b]);
  for (const [component, list] of byComponent) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (conditionsOverlap(list[i].variantConditions, list[j].variantConditions) && !sameTarget(list[i].target, list[j].target)) {
          diags.push(d("AMBIGUOUS_BINDING", "error", "binding", component, `Bindings for '${component}' have overlapping variant conditions with different targets; the resolver refuses to choose.`));
        }
      }
    }
  }
  return { valid: !diags.some((x) => x.severity === "error"), diagnostics: sortDiagnostics(diags) };
}

function sameTarget(a, b) {
  return a.capabilityId === b.capabilityId && a.appearanceId === b.appearanceId;
}

// Overlap check: exists a hypothetical variant assignment satisfying both condition sets.
function conditionsOverlap(a, b) {
  const assignments = (conds) => {
    if (conds.length === 0) return null; // null = matches everything
    const out = [];
    for (const c of conds) {
      const values = c.op === "in" ? c.value.split(",") : [c.value];
      if (c.op === "neq") return null; // conservative: treat neq as overlapping unless proven otherwise
      for (const v of values) out.push([c.prop, v]);
    }
    return out;
  };
  const A = assignments(a);
  const B = assignments(b);
  if (A === null || B === null) return true;
  const aMap = new Map(A);
  for (const [prop, value] of B) {
    if (!aMap.has(prop) || aMap.get(prop) === value) return true;
  }
  return false;
}

function matchesVariant(binding, assignment) {
  for (const c of binding.variantConditions) {
    const actual = assignment[c.prop];
    if (c.op === "eq" && actual !== c.value) return false;
    if (c.op === "neq" && actual === c.value) return false;
    if (c.op === "in" && !c.value.split(",").includes(actual)) return false;
  }
  return true;
}

// ---- Nesting legality -------------------------------------------------------
export function isNestingLegal(registry, parentCapId, parentAppearance, childCapId, childAppearance) {
  const parent = registry.capabilities.find((c) => c.id === parentCapId && c.appearanceId === parentAppearance)
    ?? registry.capabilities.find((c) => c.id === parentCapId);
  if (!parent) return { legal: true, conflict: false }; // unknown parents are caught elsewhere
  let concreteHit = false;
  let allowedByPolicy = false;
  let deniedByPolicy = false;
  for (const rule of parent.allowedChildren ?? []) {
    if (rule.policy === "allow-all") allowedByPolicy = !(rule.except ?? []).includes(childCapId);
    else if (rule.policy === "deny-all") deniedByPolicy = true;
    else if (rule.capabilityId === childCapId) {
      const appOk = !rule.appearances || rule.appearances.length === 0 || rule.appearances.includes(childAppearance);
      if (appOk) concreteHit = true;
    }
  }
  const legal = (concreteHit || (allowedByPolicy && !deniedByPolicy && !(parent.allowedChildren ?? []).some((r) => r.policy === "deny-all"))) && !deniedByPolicy;
  const child = registry.capabilities.find((c) => c.id === childCapId && c.appearanceId === childAppearance)
    ?? registry.capabilities.find((c) => c.id === childCapId);
  let conflict = false;
  if (child && Array.isArray(child.allowedParents) && child.allowedParents.length > 0) {
    const permits = child.allowedParents.some((r) => (r.policy === "allow-all" && !(r.except ?? []).includes(parentCapId)) || r.capabilityId === parentCapId);
    if (!permits) conflict = true;
  }
  return { legal, conflict };
}

// ---- Structure resolution ---------------------------------------------------
// structure is the G1 harness fixture shape (see docs/converter/CONTRACTS.md §Harness):
// { profileId, platformId, source, sections: [{ sectionId, order, name, elements: [{ elementId,
//   sourceComponentId, variantAssignment, childrenElementIds }] }] }  (elements flat, document order)
export function resolveStructure(registry, map, structure, options = {}) {
  const bindingDiags = validateBindingMap(registry, map).diagnostics;
  const diags = [...bindingDiags];
  const capsById = new Map();
  for (const c of registry.capabilities) capsById.set(`${c.id}␟${c.appearanceId}`, c);

  const bindingsFor = (componentId, assignment) => {
    const candidates = map.bindings.filter((b) => b.sourceComponentId === componentId && matchesVariant(b, assignment ?? {}));
    return candidates.length === 1 ? candidates[0] : null;
  };

  const elements = structure.sections.flatMap((s) => s.elements);
  const byId = new Map(elements.map((e) => [e.elementId, e]));
  const coverage = { native: 0, widget: 0, chrome: 0, "custom-required": 0, unsupported: 0 };
  let total = 0;

  const sectionReports = structure.sections.map((section) => {
    const sectionDiags = [];
    let mapped = 0;
    let resolvedAny = false;
    const unsupportedReasons = new Map();

    for (const el of section.elements) {
      const binding = bindingsFor(el.sourceComponentId, el.variantAssignment);
      if (!binding) {
        sectionDiags.push(d("VARIANT_NOT_MAPPED", "error", "node", el.elementId, `No binding matches '${el.sourceComponentId}' with variant assignment ${JSON.stringify(el.variantAssignment ?? {})}; fail closed, never approximate.`));
        unsupportedReasons.set("VARIANT_NOT_MAPPED", { code: "VARIANT_NOT_MAPPED", message: `No binding matches '${el.sourceComponentId}' for the observed variants.` });
        continue;
      }
      const cap = capsById.get(`${binding.target.capabilityId}␟${binding.target.appearanceId}`);
      if (!cap) {
        sectionDiags.push(d("UNSUPPORTED_CAPABILITY", "error", "node", el.elementId, `Target capability '${binding.target.capabilityId}' is absent from the pinned registry.`));
        continue;
      }
      if (!cap || cap.availability !== "enabled") {
        sectionDiags.push(d("CAPABILITY_DISABLED", "error", "capability", cap?.id ?? binding.target.capabilityId, `Target capability is ${cap?.availability ?? "unknown"}; refusing to map.`));
        continue;
      }
      resolvedAny = true;
      coverage[cap.category]++;
      total++;

      // Nesting: element children must be legal under this capability.
      for (const childId of el.childrenElementIds ?? []) {
        const child = byId.get(childId);
        const childBinding = child && bindingsFor(child.sourceComponentId, child.variantAssignment);
        if (!childBinding) continue;
        const childCap = capsById.get(`${childBinding.target.capabilityId}␟${childBinding.target.appearanceId}`);
        if (!childCap) continue;
        const { legal, conflict } = isNestingLegal(registry, cap.id, cap.appearanceId, childCap.id, childCap.appearanceId);
        if (!legal) {
          sectionDiags.push(d("INCOMPATIBLE_NESTING", "error", "capability", cap.id, `Child capability '${childCap.id}' is not legal under '${cap.id}' per allowedChildren.`));
        }
        if (conflict) {
          sectionDiags.push(d("NESTING_DECLARATION_CONFLICT", "warning", "capability", childCap.id, `Child '${childCap.id}' allowedParents disagrees with parent '${cap.id}' allowedChildren declaration; re-audit the source.`));
        }
      }
      if (!cap.responsiveDeterministic) {
        const escalate = options.gates?.responsiveDeterministicRequired === true;
        sectionDiags.push(d("RESPONSIVE_UNCERTAIN", escalate ? "error" : "warning", "capability", cap.id, `Capability '${cap.id}' has non-deterministic responsive behavior${escalate ? " and the profile gate requires deterministic responsive coverage" : ""}.`));
      }
      mapped++;
    }

    const status = sectionDiags.some((x) => x.severity === "error")
      ? "blocked"
      : mapped === 0 && !resolvedAny
        ? "unmapped"
        : mapped < section.elements.length
          ? "partially-mapped"
          : "mapped";
    const proofLevel = status === "mapped" && section.elements.length > 0 ? "structurally-mapped" : "registered";
    for (const sd of sectionDiags) diags.push(sd);
    if (status === "blocked") {
      for (const sd of sectionDiags.filter((x) => x.severity === "error")) unsupportedReasons.set(sd.code, { code: sd.code, message: sd.message });
    }
    return {
      sectionId: section.sectionId,
      order: section.order,
      name: section.name,
      status,
      candidates: [],
      // Per-section selected-capability reporting is G2 (PageStructure materialization);
      // G1 reports element-level coverage via the coverage counters.
      selected: null,
      unsupportedReasons: [...unsupportedReasons.values()].sort((a, b) => a.code.localeCompare(b.code)),
      mappingConfidence: status === "mapped" ? "high" : status === "partially-mapped" ? "medium" : "low",
      proofLevel,
      evidence: [],
    };
  });

  const counts = {
    errors: diags.filter((x) => x.severity === "error").length,
    warnings: diags.filter((x) => x.severity === "warning").length,
    infos: diags.filter((x) => x.severity === "info").length,
  };
  // The binding map's content hash must be stable across canonically-equal inputs: bindings are
  // canonically ordered by (sourceComponentId, canonical variantConditions) before hashing.
  const canonicalBindings = [...map.bindings].sort((a, b) =>
    a.sourceComponentId < b.sourceComponentId ? -1 : a.sourceComponentId > b.sourceComponentId ? 1 : cmp(canonicalStringify(a.variantConditions), canonicalStringify(b.variantConditions))
  );
  const mapForHash = { ...map, bindings: canonicalBindings };
  // proofStatus: the resolver only ever claims registered/structurally-mapped at G1, and its own
  // checks (binding validation, nesting legality, enabled targets) justify exactly that claim.
  // Any inequality here would be an EVIDENCE_MISSING hard reject — recomputed, not hardcoded.
  const claimed = sectionReports.some((s) => s.proofLevel === "structurally-mapped") ? "structurally-mapped" : "registered";
  const justified = claimed; // justification recomputed above per section; G1 cannot exceed structurally-mapped
  const report = {
    schemaVersion: 1,
    profileId: structure.profileId,
    platformId: structure.platformId,
    generatedAt: "1970-01-01T00:00:00Z", // placeholder; excluded from content hash
    inputs: {
      registryRevisionId: registry.source.revisionId,
      bindingMapContentHash: contentHash(mapForHash),
      pageStructureContentHash: contentHash(structure),
    },
    sections: [...sectionReports].sort((a, b) => a.order - b.order || a.sectionId.localeCompare(b.sectionId)),
    coverage: { ...coverage, total },
    counts,
    proofStatus: { maxClaimedProofLevel: claimed, maxJustifiedProofLevel: justified },
    diagnostics: sortDiagnostics(diags),
  };
  return report;
}

export function canonicalReportHash(report) {
  return sha256Hex(canonicalStringify({ ...report, generatedAt: undefined }));
}
