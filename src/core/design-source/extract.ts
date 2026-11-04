// G2 structural extraction (issue #14): deterministic transformation of a bounded, revision-
// pinned design-source subtree (via a DesignSourcePort) into three platform-neutral artifacts:
//   NodeIR        — the full semantic inventory (every descendant, nothing silently omitted)
//   PageStructure — the editorial-only structural plan (chrome/hidden/merged/unresolved out)
//   SourceReview  — the every-node accountability ledger (class + disposition + reason each)
//
// Rules honored here (docs/converter/CONTRACTS.md §2–§3; the design-node semantics/naming
// spec §3 — referenced without spelling the design-tool brand: core stays brand-neutral):
// - stable locator-keyed hashed ids, revision-independent; collisions are hard errors;
// - adapter-defined source kinds map onto the closed NodeIR enum by a documented table —
//   unmappable kinds stay "unknown" (NOT_VERIFIED warning), never guessed into a near-miss bucket;
// - layout primitives are preserved verbatim from the snapshot; unsupported values stay unknown;
// - classification uses COMBINED evidence (ancestry + kind + layout + naming hint + capability
//   evidence); a name prefix is a strong hint, never sufficient proof alone;
// - capability targets come only from a pinned registry + validated binding map; a source
//   component without a proven target stays custom-required / data-provider-pending / NEEDS_REVIEW.
import { sha256Hex, sortDiagnostics, stableContentHash } from "../canonical.js";
import { findBinding } from "../resolver.js";
import { SnapshotDesignSourcePort, type DesignSourcePort, type NodeRecord } from "./port.js";
import type {
  BindingMap,
  Capability,
  CapabilityRegistry,
  ContentSlotKind,
  Diagnostic,
  LayoutConstraint,
  LayoutRelativeSize,
  NodeIR,
  NodeIRKind,
  NodeIRLayout,
  NodeIRNode,
  NodeIRSlot,
  PageStructure,
  PageStructureElement,
  PageStructureSection,
  PageStructureSlot,
  ReviewDisposition,
  SemanticClass,
  SourceEvidence,
  SourceReview,
  SourceReviewEntry,
} from "../types.js";

const SEP = "␟"; // canonical separator (U+241F), same convention as evidence ids

export interface ExtractInput {
  port: DesignSourcePort;
  /** The caller-selected subtree root locator (explicit user input — never a default). */
  rootLocator: string;
  profileId: string;
  /** generatedAt for the emitted payloads (injected; excluded from all hashes). */
  now: string;
  /** Pre-validated against the profile: schema, semantics and platform identity. */
  registry?: CapabilityRegistry;
  /** Pre-validated against the registry: schema, identity and revision pin. Requires registry. */
  bindings?: BindingMap;
}

export type ExtractOutcome =
  | { ok: true; nodeIr: NodeIR; pageStructure: PageStructure; review: SourceReview }
  | { ok: false; diagnostics: Diagnostic[] };

// Adapter-defined source kind -> closed NodeIR kind. Documented, deterministic, closed at
// "unknown": anything outside this table stays unknown + NOT_VERIFIED (never a near-miss guess).
const KIND_MAP: Record<string, NodeIRKind> = {
  page: "page-section",
  frame: "container",
  group: "container",
  component: "component",
  instance: "component",
  text: "text",
  image: "media",
  media: "media",
  vector: "icon",
  shape: "icon",
  line: "divider",
  divider: "divider",
  spacer: "spacer",
};

export function mapAdapterKind(kind: string): NodeIRKind {
  return KIND_MAP[kind] ?? "unknown";
}

// Stable identity: 'n-' + first 12 hex of SHA-256(sourceId ␟ designLocator ␟ kind). Locator-keyed
// => stable across source revisions (the revision is pinned at payload level, not inside the id).
export function deriveNodeId(sourceId: string, locator: string, kind: NodeIRKind): string {
  return `n-${sha256Hex(`${sourceId}${SEP}${locator}${SEP}${kind}`).slice(0, 12)}`;
}

// Section identity: 's-' + first 12 hex of SHA-256(sourceId ␟ designLocator ␟ order).
export function deriveSectionId(sourceId: string, locator: string, order: number): string {
  return `s-${sha256Hex(`${sourceId}${SEP}${locator}${SEP}${String(order)}`).slice(0, 12)}`;
}

function nodeDiag(code: string, severity: Diagnostic["severity"], message: string, nodeId: string): Diagnostic {
  return { code, severity, message, subject: { type: "node", id: nodeId } };
}

function nodeEvidence(sourceId: string, locator: string, revisionId: string, accessedAt: string): SourceEvidence {
  const designLocator = `design://${sourceId}/${locator}`;
  return {
    evidenceId: `e-${sha256Hex(`document${SEP}${designLocator}${SEP}${revisionId}`).slice(0, 12)}`,
    kind: "document",
    locator: designLocator,
    retrievedAt: accessedAt,
    sourceRevisionId: revisionId,
    method: "design-source-adapter",
  };
}

// Recognized naming-convention prefix — a strong HINT, never sufficient proof alone.
const HINTS = ["PAGE", "SITE", "SECTION", "COMPONENT", "SLOT", "DECOR"];
function nameHint(name: string): string | null {
  const slash = name.indexOf("/");
  if (slash <= 0) return null;
  const prefix = name.slice(0, slash);
  return HINTS.includes(prefix) ? prefix : null;
}

function kebab(value: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out.length > 0 ? out : "slot";
}

const LAYOUT_DIRECTIONS = ["row", "column", "grid", "absolute", "unknown"];
const LAYOUT_POSITIONS = ["static", "relative", "absolute", "sticky", "unknown"];
const LAYOUT_OVERFLOW = ["visible", "hidden", "scroll", "unknown"];
const CONSTRAINT_AXES = ["x", "y", "width", "height"];

// Layout primitives are preserved verbatim from the snapshot's normalized properties; anything
// missing/invalid stays "unknown" (plus one NOT_VERIFIED warning per affected node) — never
// inferred, never defaulted from sibling nodes.
function coerceLayout(record: NodeRecord, diagnostics: Diagnostic[], nodeId: string): NodeIRLayout {
  const raw = (record.properties?.["layout"] ?? null) as Record<string, unknown> | null;
  let invalid = 0;
  const pick = (value: unknown, allowed: string[]): string => {
    if (value === undefined || value === null) return "unknown";
    if (typeof value === "string" && allowed.includes(value)) return value;
    invalid++;
    return "unknown";
  };
  const direction = pick(raw?.["direction"], LAYOUT_DIRECTIONS) as NodeIRLayout["direction"];
  const positioning = pick(raw?.["positioning"], LAYOUT_POSITIONS) as NodeIRLayout["positioning"];
  const overflow = pick(raw?.["overflow"], LAYOUT_OVERFLOW) as NodeIRLayout["overflow"];
  const constraints: LayoutConstraint[] = [];
  if (Array.isArray(raw?.["constraints"])) {
    for (const c of raw["constraints"] as unknown[]) {
      const axis = (c as { axis?: unknown })?.["axis"];
      const type = (c as { type?: unknown })?.["type"];
      const value = (c as { value?: unknown })?.["value"];
      if (typeof axis === "string" && CONSTRAINT_AXES.includes(axis) && typeof type === "string" && type.length > 0 && typeof value === "string" && value.length > 0) {
        constraints.push({ axis: axis as LayoutConstraint["axis"], type, value });
      } else invalid++;
    }
  }
  constraints.sort((a, b) => a.axis.localeCompare(b.axis) || a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  const relativeSizes: LayoutRelativeSize[] = [];
  if (Array.isArray(raw?.["relativeSizes"])) {
    for (const r of raw["relativeSizes"] as unknown[]) {
      const target = (r as { target?: unknown })?.["target"];
      const ratio = (r as { ratio?: unknown })?.["ratio"];
      if (typeof target === "string" && target.length > 0 && typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0) {
        relativeSizes.push({ target, ratio });
      } else invalid++;
    }
  }
  relativeSizes.sort((a, b) => a.target.localeCompare(b.target));
  if (invalid > 0) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `${invalid} declared layout value(s) on '${record.name}' fall outside the layout primitive vocabulary; recorded as unknown — never guessed.`, nodeId));
  }
  return { direction, positioning, constraints, relativeSizes, overflow };
}

interface ChildInfo {
  kind: NodeIRKind;
  hint: string | null;
  visible: boolean;
  name: string;
}

interface SlotDerivation {
  slots: NodeIRSlot[];
  slotChildLocators: Set<string>;
}

// Content slots: visible text/media/icon children become the parent's slots (valueRef = the
// child's design:// locator — raw content is never copied into the IR); DECOR-labelled children
// are decorations, not slots. Adapter-declared dynamicSlots merge in, sorted by slotId.
function deriveSlots(sourceId: string, children: string[], childInfos: Map<string, ChildInfo>, properties: Record<string, unknown> | undefined, evidenceOf: Map<string, SourceEvidence>, diagnostics: Diagnostic[], nodeId: string, nodeName: string): SlotDerivation {
  const slots: NodeIRSlot[] = [];
  const used = new Map<string, number>();
  const slotChildLocators = new Set<string>();
  const push = (slotIdRaw: string, kind: ContentSlotKind, valueRef: string, childLocator?: string) => {
    const base = kebab(slotIdRaw);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const slotId = n === 1 ? base : `${base}-${n}`;
    const slot: NodeIRSlot = { slotId, kind, valueRef, method: "observed" };
    if (childLocator && evidenceOf.has(childLocator)) slot.evidence = evidenceOf.get(childLocator);
    slots.push(slot);
    if (childLocator) slotChildLocators.add(childLocator);
  };
  for (const child of children) {
    const info = childInfos.get(child);
    if (!info || !info.visible || info.hint === "DECOR") continue;
    if (info.kind === "text" || info.kind === "media" || info.kind === "icon") {
      push(info.name, info.kind as ContentSlotKind, `design://${sourceId}/${child}`, child);
    }
  }
  const dynamic = properties?.["dynamicSlots"];
  if (Array.isArray(dynamic)) {
    for (const entry of dynamic as unknown[]) {
      const slotId = (entry as { slotId?: unknown })?.["slotId"];
      const kind = (entry as { kind?: unknown })?.["kind"];
      const valueRef = (entry as { valueRef?: unknown })?.["valueRef"];
      if (typeof slotId === "string" && slotId.length > 0 && typeof valueRef === "string" && /^(design|source):\/\//.test(valueRef)) {
        const k: ContentSlotKind = typeof kind === "string" && ["text", "media", "icon", "component", "dynamic"].includes(kind) ? (kind as ContentSlotKind) : "dynamic";
        push(slotId, k, valueRef);
      } else {
        diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `A declared dynamic slot on '${nodeName}' is malformed (slotId/valueRef) and was dropped — never guessed.`, nodeId));
      }
    }
  }
  slots.sort((a, b) => a.slotId.localeCompare(b.slotId));
  return { slots, slotChildLocators };
}

// --- The extraction ------------------------------------------------------------------------

export function extractStructures(input: ExtractInput): ExtractOutcome {
  const { port, rootLocator, profileId, now, registry, bindings } = input;
  const revision = port.resolveRevision();
  const revisionId = revision.revisionId;
  const accessedAt = revision.accessedAt;
  const diagnostics: Diagnostic[] = [];

  // 0. Graph integrity first: an incomplete or cyclic subtree fails closed — no artifacts at all.
  if (port instanceof SnapshotDesignSourcePort) {
    const graphErrors = port.graphErrors();
    if (graphErrors.length > 0) return { ok: false, diagnostics: sortDiagnostics(graphErrors) };
  }

  // 1. Deterministic DFS inventory in document order (children come from the port contract,
  //    never from transport record internals).
  interface InventoryNode {
    record: NodeRecord;
    locator: string;
    name: string;
    parentLocator: string | null;
    kind: NodeIRKind;
    hint: string | null;
    visible: boolean;
  }
  const inventory: InventoryNode[] = [];
  const byLocator = new Map<string, InventoryNode>();
  const childrenOf = new Map<string, string[]>();
  const visited = new Set<string>();
  const walk = (locator: string, parentLocator: string | null): boolean => {
    if (visited.has(locator)) {
      diagnostics.push({ code: "EVIDENCE_MISSING", severity: "error", message: `Cycle detected at locator '${locator}': the source subtree is not a tree — fail closed.`, subject: { type: "node", id: locator } });
      return false;
    }
    const read = port.readNode(locator);
    if (!read.ok) {
      diagnostics.push({ code: "EVIDENCE_MISSING", severity: "error", message: `Locator '${locator}' is listed as a child but unreadable from the source port — incomplete subtree, fail closed.`, subject: { type: "node", id: locator } });
      return false;
    }
    const children = port.listChildren(locator);
    if (!children.ok) {
      diagnostics.push({ code: "EVIDENCE_MISSING", severity: "error", message: `Children of '${locator}' are unreadable from the source port — incomplete subtree, fail closed.`, subject: { type: "node", id: locator } });
      return false;
    }
    visited.add(locator);
    const record = read.value;
    const node: InventoryNode = {
      record,
      locator,
      name: record.name ?? "",
      parentLocator,
      kind: mapAdapterKind(record.kind),
      hint: nameHint(record.name ?? ""),
      visible: record.visible !== false,
    };
    inventory.push(node);
    byLocator.set(locator, node);
    childrenOf.set(locator, children.value);
    for (const child of children.value) {
      if (!walk(child, locator)) return false;
    }
    return true;
  };
  if (!walk(rootLocator, null)) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }

  // 2. Stable ids + collision guard (hard error, fail closed). Duplicate locators were already
  //    rejected by the snapshot graph check; the guard below catches hash-prefix collisions.
  const idOf = new Map<string, string>();
  const byNodeId = new Map<string, InventoryNode>();
  for (const inv of inventory) {
    const nodeId = deriveNodeId(revision.sourceId, inv.locator, inv.kind);
    const prior = byNodeId.get(nodeId);
    if (prior && prior.locator !== inv.locator) {
      diagnostics.push({ code: "NODE_ID_COLLISION", severity: "error", message: `Nodes '${prior.locator}' and '${inv.locator}' hash to the same node id '${nodeId}'; identity must be unique — fail closed.`, subject: { type: "node", id: nodeId } });
      return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
    }
    idOf.set(inv.locator, nodeId);
    byNodeId.set(nodeId, inv);
  }
  const sourceId = revision.sourceId;
  const evidenceOf = new Map<string, SourceEvidence>();
  for (const inv of inventory) evidenceOf.set(inv.locator, nodeEvidence(sourceId, inv.locator, revisionId, accessedAt));

  // 3. Component reference resolution: instances resolve only to inventoried component
  //    definitions; external library references stay unresolved (NEEDS_REVIEW), never fabricated.
  const componentRefTarget = new Map<string, string | null>(); // instance locator -> def locator | null
  for (const inv of inventory) {
    if (inv.kind !== "component" || inv.record.componentRef === undefined) continue;
    const target = byLocator.get(inv.record.componentRef);
    componentRefTarget.set(inv.locator, target && target.kind === "component" ? target.locator : null);
  }

  // 4. Capability resolution — only from the pinned registry + validated binding map (both are
  //    validated by the caller before extractStructures runs).
  const capsById = new Map<string, Capability>();
  for (const c of registry?.capabilities ?? []) capsById.set(`${c.id}${SEP}${c.appearanceId}`, c);
  interface CapabilityResolution {
    bindingId?: string;
    target?: { capabilityId: string; appearanceId: string };
    requiresRuntimeData?: boolean;
    category: Capability["category"];
    responsive: { scope: string; effect: string }[];
  }
  const resolutionOf = new Map<string, CapabilityResolution>();
  if (registry && bindings) {
    for (const inv of inventory) {
      if (inv.kind !== "component" || inv.record.componentRef === undefined) continue;
      const defLocator = componentRefTarget.get(inv.locator);
      if (!defLocator) continue; // external/invalid refs stay NEEDS_REVIEW
      const defNodeId = idOf.get(defLocator) as string;
      const variants = (inv.record.properties?.["variants"] ?? undefined) as Record<string, string> | undefined;
      const binding = findBinding(bindings, defNodeId, variants);
      if (!binding) continue; // no proven target -> custom-required pending, never approximated
      const cap = capsById.get(`${binding.target.capabilityId}${SEP}${binding.target.appearanceId}`);
      if (!cap) continue; // the caller's validateBindingMap rejects this first; stay honest
      resolutionOf.set(inv.locator, {
        ...(binding.bindingId ? { bindingId: binding.bindingId } : {}),
        target: { capabilityId: binding.target.capabilityId, appearanceId: binding.target.appearanceId },
        requiresRuntimeData: cap.dataContext.requiresRuntimeData === true,
        category: cap.category,
        responsive: (cap.responsiveRules ?? []).map((r) => ({ scope: r.scope, effect: r.effect })).sort((a, b) => a.scope.localeCompare(b.scope)),
      });
    }
  }

  // 5. Content slots per node.
  const slotsOf = new Map<string, SlotDerivation>();
  for (const inv of inventory) {
    const childInfos = new Map<string, ChildInfo>();
    for (const child of childrenOf.get(inv.locator) ?? []) {
      const c = byLocator.get(child);
      if (c) childInfos.set(child, { kind: c.kind, hint: c.hint, visible: c.visible, name: c.name });
    }
    slotsOf.set(inv.locator, deriveSlots(sourceId, childrenOf.get(inv.locator) ?? [], childInfos, inv.record.properties, evidenceOf, diagnostics, idOf.get(inv.locator) as string, inv.name));
  }
  const slotParentOf = new Map<string, string>(); // child locator -> parent locator whose slot it is
  for (const [parentLocator, derivation] of slotsOf) {
    for (const child of derivation.slotChildLocators) slotParentOf.set(child, parentLocator);
  }

  // 6. Classification + disposition: combined evidence (ancestry + kind + naming hint + layout
  //    context + capability resolution), deterministic precedence, subtree branch inheritance.
  type Branch = "editorial" | "chrome" | "ambiguous" | "hidden" | "definition";
  interface Classified {
    semanticClass: SemanticClass;
    disposition: ReviewDisposition;
    reason: string;
    nameHint?: string;
  }
  const classified = new Map<string, Classified>();
  const sectionLocators: string[] = [];
  const classify = (locator: string, branch: Branch, parentIsRoot: boolean): void => {
    const inv = byLocator.get(locator) as InventoryNode;
    const hintSuffix = inv.hint ? ` Naming hint '${inv.hint}/' weighed as evidence, not proof.` : "";
    const isContainerish = inv.kind === "container" || inv.kind === "page-section";
    const isInstance = inv.kind === "component" && inv.record.componentRef !== undefined;
    const isDefinition = inv.kind === "component" && inv.record.componentRef === undefined;
    const isDecorLeaf = inv.hint === "DECOR" || ((inv.kind === "icon" || inv.kind === "spacer" || inv.kind === "divider") && (childrenOf.get(locator) ?? []).length === 0);
    const hintProp = inv.hint ? { nameHint: inv.hint } : {};
    let result: Classified;

    if (inv.visible === false) {
      const semanticClass: SemanticClass = branch === "chrome" ? "SITE_CHROME" : isDefinition || isInstance ? "SHARED_COMPONENT" : isDecorLeaf ? "PRESENTATIONAL" : "EDITORIAL_SECTION";
      result = { semanticClass, disposition: "EXCLUDED_WITH_REASON", reason: `Hidden in the source at the pinned revision — inventoried, excluded from the CMS plan.${hintSuffix}`, ...hintProp };
    } else if (branch === "chrome") {
      result = { semanticClass: "SITE_CHROME", disposition: "EXCLUDED_WITH_REASON", reason: `Inside a site-chrome subtree: theme-owned, retained in audit, excluded from the CMS plan.${hintSuffix}`, ...hintProp };
    } else if (branch === "hidden") {
      result = { semanticClass: isDecorLeaf ? "PRESENTATIONAL" : "EDITORIAL_SECTION", disposition: "EXCLUDED_WITH_REASON", reason: `Inside a hidden subtree — inventoried, excluded from the CMS plan.${hintSuffix}`, ...hintProp };
    } else if (branch === "ambiguous") {
      result = { semanticClass: "UNKNOWN_OR_AMBIGUOUS", disposition: "NEEDS_REVIEW", reason: `Inside an ambiguous top-level subtree: site chrome vs editorial content is undecidable from available evidence — human decision required.${hintSuffix}`, ...hintProp };
    } else if (branch === "definition") {
      result = { semanticClass: "SHARED_COMPONENT", disposition: "REFERENCE_ONLY", reason: `Part of a shared component definition asset (realized through its instances).${hintSuffix}`, ...hintProp };
    } else if (parentIsRoot) {
      // Top-level children decide their whole branch from combined evidence. A naming hint
      // NEVER classifies site chrome alone (Coordinator C1 correction): a SITE/ label classifies
      // chrome only WITH container evidence at top-level position; a SITE/-labelled
      // non-container is ambiguous (hint conflicts with structural evidence) — retained in the
      // review as NEEDS_REVIEW, never silently dropped and never excluded by label alone.
      if (inv.hint === "SITE" && isContainerish) {
        result = { semanticClass: "SITE_CHROME", disposition: "EXCLUDED_WITH_REASON", reason: `Top-level site chrome (naming hint + top-level position + container evidence): theme-owned, excluded from the CMS plan, retained in audit.${hintSuffix}`, ...hintProp };
      } else if (inv.hint === "SITE") {
        result = { semanticClass: "UNKNOWN_OR_AMBIGUOUS", disposition: "NEEDS_REVIEW", reason: `Site-chrome naming hint on a top-level node without container evidence — a label alone never excludes; chrome vs content vs component is undecidable from available evidence, human decision required.${hintSuffix}`, ...hintProp };
      } else if (isContainerish && inv.hint === "SECTION") {
        result = { semanticClass: "EDITORIAL_SECTION", disposition: "MAPPED", reason: `Top-level editorial section (naming hint + container evidence) — planned as a PageStructure section.${hintSuffix}`, ...hintProp };
        sectionLocators.push(locator);
      } else if (isContainerish) {
        result = { semanticClass: "UNKNOWN_OR_AMBIGUOUS", disposition: "NEEDS_REVIEW", reason: `Top-level container without a recognized semantic hint: site chrome vs editorial content is undecidable from available evidence — human decision required.${hintSuffix}`, ...hintProp };
      } else if (isDefinition || isInstance) {
        result = { semanticClass: "SHARED_COMPONENT", disposition: isDefinition ? "REFERENCE_ONLY" : "NEEDS_REVIEW", reason: isDefinition ? `Shared component definition asset — reusable reference, content is realized through its instances.${hintSuffix}` : `Shared component instance outside any planned section.${hintSuffix}`, ...hintProp };
      } else if (isDecorLeaf) {
        result = { semanticClass: "PRESENTATIONAL", disposition: "DECORATION_MERGED", reason: `Top-level presentational leaf merged into page styling; never silently dropped.${hintSuffix}`, ...hintProp };
      } else {
        result = { semanticClass: "UNKNOWN_OR_AMBIGUOUS", disposition: "NEEDS_REVIEW", reason: `Top-level content node without a recognized semantic hint — human decision required.${hintSuffix}`, ...hintProp };
      }
    } else if (inv.kind === "unknown") {
      result = { semanticClass: "UNKNOWN_OR_AMBIGUOUS", disposition: "NEEDS_REVIEW", reason: `Source kind '${inv.record.kind}' is outside the mapped kind table — inventoried as kind 'unknown'; human decision required.${hintSuffix}`, ...hintProp };
    } else if (isInstance && componentRefTarget.get(locator) === null) {
      result = { semanticClass: "SHARED_COMPONENT", disposition: "NEEDS_REVIEW", reason: `Component reference '${inv.record.componentRef}' does not resolve to an inventoried component definition (external library or invalid).${hintSuffix}`, ...hintProp };
    } else if (isInstance) {
      // An instance of a shared component is a SHARED_COMPONENT occurrence, inside a section or
      // not: MAPPED only with a proven target, otherwise custom-required pending (never faked).
      const defName = byLocator.get(componentRefTarget.get(locator) as string)?.name ?? "unknown definition";
      const resolved = resolutionOf.has(locator);
      result = { semanticClass: "SHARED_COMPONENT", disposition: resolved ? "MAPPED" : "NEEDS_REVIEW", reason: resolved ? `Shared component instance of '${defName}', resolved against the pinned registry + binding map.${hintSuffix}` : `Shared component instance of '${defName}' without a proven target capability — custom-required pending.${hintSuffix}`, ...hintProp };
    } else if (isDecorLeaf) {
      result = { semanticClass: "PRESENTATIONAL", disposition: "DECORATION_MERGED", reason: `Presentational leaf merged into its nearest mapped ancestor; never silently dropped.${hintSuffix}`, ...hintProp };
    } else {
      const slotParent = slotParentOf.get(locator);
      const slotId = slotParent ? slotsOf.get(slotParent)?.slots.find((s) => s.valueRef === `design://${sourceId}/${locator}`)?.slotId : undefined;
      result = {
        semanticClass: "EDITORIAL_SECTION",
        disposition: "MAPPED",
        reason: slotId ? `Content slot '${slotId}' of '${byLocator.get(slotParent as string)?.record.name}'.${hintSuffix}` : `Structural content within its section.${hintSuffix}`,
        ...hintProp,
      };
    }
    classified.set(locator, result);

    const nextBranch: Branch = inv.visible === false ? "hidden" : isDefinition && (childrenOf.get(locator) ?? []).length > 0 ? "definition" : parentIsRoot ? (result.semanticClass === "SITE_CHROME" ? "chrome" : result.semanticClass === "UNKNOWN_OR_AMBIGUOUS" ? "ambiguous" : "editorial") : branch;
    for (const child of childrenOf.get(locator) ?? []) classify(child, nextBranch, false);
  };

  // The root itself: the selected page — realized as the plan, not a section.
  const rootInv = byLocator.get(rootLocator) as InventoryNode;
  const rootHidden = rootInv.visible === false;
  classified.set(rootLocator, {
    semanticClass: "EDITORIAL_SECTION",
    disposition: rootHidden ? "EXCLUDED_WITH_REASON" : "MAPPED",
    reason: rootHidden ? "Selected page root is hidden at the pinned revision — nothing is planned." : "Selected page root: realized as the PageStructure plan itself (not a section).",
    ...(rootInv.hint ? { nameHint: rootInv.hint } : {}),
  });
  const rootBranch: Branch = rootHidden ? "hidden" : "editorial";
  for (const child of childrenOf.get(rootLocator) ?? []) classify(child, rootBranch, true);

  // 7. NodeIR assembly (nodes sorted by nodeId; document order preserved in childrenNodeIds).
  const unknownKindNodes = inventory.filter((inv) => inv.kind === "unknown");
  for (const inv of unknownKindNodes) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Source kind '${inv.record.kind}' on '${inv.record.name}' is outside the mapped kind table; inventoried as kind 'unknown' — human review required.`, idOf.get(inv.locator) as string));
  }
  const danglingRefs = inventory.filter((inv) => inv.kind === "component" && inv.record.componentRef !== undefined && componentRefTarget.get(inv.locator) === null);
  for (const inv of danglingRefs) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Component reference '${inv.record.componentRef}' on '${inv.record.name}' does not resolve to an inventoried component definition (external library or invalid).`, idOf.get(inv.locator) as string));
  }
  const nodes: NodeIRNode[] = inventory.map((inv) => {
    const nodeId = idOf.get(inv.locator) as string;
    const defLocator = componentRefTarget.get(inv.locator);
    return {
      nodeId,
      kind: inv.kind,
      name: inv.name,
      ...(inv.hint ? { role: inv.hint } : {}),
      visible: inv.visible,
      childrenNodeIds: (childrenOf.get(inv.locator) ?? []).map((c) => idOf.get(c) as string),
      parentNodeId: inv.parentLocator === null ? null : (idOf.get(inv.parentLocator) as string),
      ...(inv.kind === "component" && inv.record.componentRef !== undefined && defLocator ? { componentRefNodeId: idOf.get(defLocator) as string } : {}),
      layout: coerceLayout(inv.record, diagnostics, nodeId),
      ...(slotsOf.get(inv.locator)?.slots.length ? { contentSlots: slotsOf.get(inv.locator)?.slots } : {}),
      sourceEvidence: [evidenceOf.get(inv.locator) as SourceEvidence],
    };
  });

  const nodeIr: NodeIR = {
    schemaVersion: 1,
    profileId,
    generatedAt: now,
    source: revision,
    rootNodeId: idOf.get(rootLocator) as string,
    nodes: [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    diagnostics: sortDiagnostics(diagnostics),
  };

  // 8. PageStructure: editorial top-level MAPPED sections only, document order. Pins use the
  //    STABLE content hash (observation timestamps removed) so re-extraction of the same source
  //    revision reproduces them byte-identically.
  const nodeIrPin = stableContentHash(nodeIr);
  const sections: PageStructureSection[] = sectionLocators.map((loc, order) => {
    const inv = byLocator.get(loc) as InventoryNode;
    const sectionId = deriveSectionId(sourceId, loc, order);
    const collect = (parentLocator: string): PageStructureElement[] => {
      const out: PageStructureElement[] = [];
      for (const childLocator of childrenOf.get(parentLocator) ?? []) {
        const child = byLocator.get(childLocator) as InventoryNode;
        const cls = classified.get(childLocator) as Classified;
        const structural = child.kind === "container" || child.kind === "component" || (["text", "media", "icon"].includes(child.kind) && (childrenOf.get(childLocator) ?? []).length > 0);
        if (cls.disposition !== "MAPPED" || !structural) continue;
        const resolution = resolutionOf.get(childLocator);
        const defLocator = componentRefTarget.get(childLocator);
        const elementSlots = (slotsOf.get(childLocator)?.slots ?? [])
          .filter((s) => s.kind !== "component")
          .map((s) => ({ slotId: s.slotId, contentType: s.kind as PageStructureSlot["contentType"], valueRef: s.valueRef }));
        const unboundInstance = child.kind === "component" && child.record.componentRef !== undefined && !resolution;
        const element: PageStructureElement = {
          elementId: idOf.get(childLocator) as string,
          ...(child.kind === "component" && defLocator ? { sourceComponentId: idOf.get(defLocator) as string } : {}),
          ...(child.record.properties?.["variants"] ? { variantAssignment: child.record.properties["variants"] as Record<string, string> } : {}),
          ...(resolution?.bindingId ? { bindingId: resolution.bindingId } : {}),
          ...(resolution?.target ? { target: resolution.target } : {}),
          ...(elementSlots.length > 0 ? { contentSlots: elementSlots } : {}),
          ...(resolution?.responsive.length ? { responsiveComposition: resolution.responsive } : {}),
          childrenElementIds: [],
          resolution: resolution
            ? { status: "mapped", mappingConfidence: "high", diagnostics: [] }
            : { status: "unmapped", mappingConfidence: "low", diagnostics: [] },
        };
        if (unboundInstance) element.resolution = { status: "unmapped", mappingConfidence: "low", diagnostics: [] };
        element.childrenElementIds = collect(childLocator).map((e) => e.elementId);
        out.push(element);
      }
      return out;
    };
    const elements = collect(loc);
    return {
      sectionId,
      order,
      name: inv.name,
      ...(inv.hint ? { role: inv.hint } : {}),
      layout: coerceLayout(inv.record, diagnostics, idOf.get(loc) as string),
      elements,
      sourceEvidence: [evidenceOf.get(loc) as SourceEvidence],
    };
  });
  sections.sort((a, b) => a.order - b.order || a.sectionId.localeCompare(b.sectionId));

  const pageStructure: PageStructure = {
    schemaVersion: 1,
    profileId,
    generatedAt: now,
    source: revision,
    inputs: {
      nodeIrContentHash: nodeIrPin,
      ...(registry ? { registryRevisionId: registry.source.revisionId } : {}),
      ...(bindings ? { bindingMapContentHash: bindingMapPinHash(bindings) } : {}),
    },
    sections,
    diagnostics: [],
  };

  // 9. SourceReview: exactly one entry per NodeIR node.
  function sectionIdOf(locator: string): string | undefined {
    let cur: string | null = locator;
    while (cur !== null) {
      const idx = sectionLocators.indexOf(cur);
      if (idx >= 0) return deriveSectionId(sourceId, cur, idx);
      cur = byLocator.get(cur)?.parentLocator ?? null;
    }
    return undefined;
  }
  const entries: SourceReviewEntry[] = inventory.map((inv) => {
    const cls = classified.get(inv.locator) as Classified;
    const nodeId = idOf.get(inv.locator) as string;
    const resolution = resolutionOf.get(inv.locator);
    let disposition = cls.disposition;
    let reason = cls.reason;
    let provisionalTarget: SourceReviewEntry["provisionalTarget"];
    const labelConflict = cls.semanticClass === "UNKNOWN_OR_AMBIGUOUS"; // C1: hint/structure conflict keeps its own actionable reason
    if (disposition === "NEEDS_REVIEW" && isUnboundInstance(inv) && componentRefTarget.get(inv.locator) !== null && !labelConflict) {
      // Resolving instance without a proven target: custom-required pending — never approximated.
      provisionalTarget = { category: resolution ? (resolution.category as NonNullable<SourceReviewEntry["provisionalTarget"]>["category"]) : "custom-required" };
      if (!resolution) reason = "Source component without a proven target capability — custom-required pending; no CMS content may be generated from it without review.";
      else reason = "Source component resolved only provisionally — human review required.";
    } else if (disposition === "NEEDS_REVIEW" && isUnboundInstance(inv)) {
      provisionalTarget = { category: "custom-required" };
    }
    if (disposition === "NEEDS_REVIEW" && resolution) disposition = "MAPPED";
    if (resolution) {
      provisionalTarget = {
        category: resolution.category,
        ...(resolution.requiresRuntimeData ? { requiresRuntimeData: true } : {}),
        capabilityIds: resolution.target ? [resolution.target.capabilityId] : [],
      };
    }
    return {
      nodeId,
      semanticClass: cls.semanticClass,
      disposition,
      reason,
      ...(cls.nameHint ? { nameHint: cls.nameHint } : {}),
      ...(sectionIdOf(inv.locator) ? { sectionId: sectionIdOf(inv.locator) as string } : {}),
      ...(provisionalTarget ? { provisionalTarget } : {}),
      evidence: [evidenceOf.get(inv.locator) as SourceEvidence],
    };
  });
  entries.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  function isUnboundInstance(inv: InventoryNode): boolean {
    return inv.kind === "component" && inv.record.componentRef !== undefined && !resolutionOf.has(inv.locator);
  }

  const byClass: SourceReview["counts"]["byClass"] = { SITE_CHROME: 0, EDITORIAL_SECTION: 0, SHARED_COMPONENT: 0, PRESENTATIONAL: 0, UNKNOWN_OR_AMBIGUOUS: 0 };
  const byDisposition: SourceReview["counts"]["byDisposition"] = { MAPPED: 0, EXCLUDED_WITH_REASON: 0, DECORATION_MERGED: 0, REFERENCE_ONLY: 0, NEEDS_REVIEW: 0 };
  for (const e of entries) {
    byClass[e.semanticClass]++;
    byDisposition[e.disposition]++;
  }
  const unboundCount = entries.filter((e) => e.disposition === "NEEDS_REVIEW" && e.provisionalTarget?.category === "custom-required").length;
  const review: SourceReview = {
    schemaVersion: 1,
    profileId,
    generatedAt: now,
    source: revision,
    inputs: { nodeIrContentHash: nodeIrPin },
    counts: { total: entries.length, byClass, byDisposition },
    entries,
    diagnostics: sortDiagnostics(
      unboundCount > 0
        ? [{ code: "NOT_VERIFIED", severity: "warning", message: `${unboundCount} source component(s) have no proven target capability (custom-required pending); no CMS content may be generated from them without review.`, subject: { type: "profile", id: profileId } }]
        : []
    ),
  };

  return { ok: true, nodeIr, pageStructure, review };
}

function canonicalVariantKey(b: { variantConditions: { prop: string; op?: string; value: string }[] }): string {
  return JSON.stringify([...b.variantConditions].map((c) => ({ prop: c.prop, op: c.op ?? "eq", value: c.value })).sort((x, y) => x.prop.localeCompare(y.prop) || x.value.localeCompare(y.value)));
}

// Canonical, order-independent STABLE pin hash of a binding map (observation timestamps removed).
// Used by the extractor to pin PageStructure.inputs and by det plan to verify that pin — one
// canonicalization, never two.
export function bindingMapPinHash(bindings: BindingMap): string {
  const canonical = [...bindings.bindings].sort(
    (a, b) => a.sourceComponentId.localeCompare(b.sourceComponentId) || sha256Hex(canonicalVariantKey(a)).localeCompare(sha256Hex(canonicalVariantKey(b)))
  );
  return stableContentHash({ ...(bindings as unknown as Record<string, unknown>), bindings: canonical });
}
