// Magento Page Builder compose adapter — deterministic native content composer (G3, issue #23).
//
// Contract: stdin = one ComposeInput JSON document (schemas/cli/compose-input.schema.json),
// stdout = one ComposeOutput JSON payload (schemas/cli/compose-output.schema.json).
// The det core never imports this file; it spawns it per the adapter descriptor. The core has
// already validated every embedded payload + all cross-pins; this adapter re-validates
// defensively and fails closed on anything unexpected.
//
// What this slice composes (and what it deliberately does not):
// - The hero shape only: a section whose subtree carries full-width background media + overlaid
//   text + an optional CTA. Native target (evidence: Magento_PageBuilder declarations, verified
//   at the pinned checkout revision before this adapter was written):
//     row (appearance "contained", children policy allow) > banner (appearance "poster", default).
//   The banner is the platform's own background-image-with-text-overlay unit: background media
//   lands in the wrapper's data-background-images, overlaid text in the content WYSIWYG field,
//   the CTA in the button element — each an Admin-editable form field.
// - The emitted markup mirrors the platform's own persisted master format (its master templates
//   stamp data-element="<declared element name>" on every element; the master-format reader
//   populates forms by those names). Attributes not present in the pinned declarations are not
//   emitted. NO arbitrary embeddable-markup content type is produced.
// - Text role mapping (documented table, from the design-source naming contract SLOT/<role>):
//     overline -> content lead <p> (styling semantics not preserved — noted)
//     heading  -> content <h2>
//     body|bodycopy -> content <p>
//     cta|ctalabel  -> button element text
//   Unrecognized roles are reported as gaps, never guessed.
// - Honest gaps: gradient overlay decoration (banner overlay is a single color; no gradient
//   field exists), decorative nodes with no native equivalent, missing manifest entries, a
//   mobile breakpoint that was not composed — each a NOT_VERIFIED warning + a "gap" mapping
//   entry. Nothing is invented around them.
// - Deterministic: fixed attribute order, fixed whitespace, no timestamps inside content; the
//   only volatile field in the payload is source.accessedAt (stripped by the core's stable hash).
// - Proof ceiling: this output is STRUCTURAL composition evidence only.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { validateContract } from "../../src/core/schema-registry.js";
import { sortDiagnostics } from "../../src/core/canonical.js";
import type { Capability, Diagnostic, NodeIRNode, PageStructureSection } from "../../src/core/types.js";

// ---- Input ----------------------------------------------------------------------------------
interface ManifestEntry {
  valueRef: string;
  kind: "text" | "media" | "link";
  text?: string;
  mediaUrl?: string;
  assetLabel?: string;
  linkUrl?: string;
  linkTarget?: string;
  note?: string;
}
interface ComposeInput {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  registry: { source: { revisionId: string }; capabilities: Capability[] };
  bindings: { bindings: { sourceComponentId: string; variantConditions: { prop: string; op?: string; value: string }[] }[] };
  nodeIr: { nodes: NodeIRNode[]; rootNodeId: string };
  pageStructure: { sections: PageStructureSection[]; source: { sourceId: string; revisionId: string; accessedAt: string } };
  content: { entries: ManifestEntry[] };
}

interface MappingEntry {
  sourceNodeId: string;
  sourceName?: string;
  sourceLocator?: string;
  disposition: "mapped" | "gap" | "decoration-merged" | "excluded" | "skipped";
  target?: { capabilityId: string; appearanceId: string; nativeElement?: string; nativeField?: string };
  note?: string;
}

function fail(message: string): never {
  console.error(`magento-pagebuilder-compose adapter: ${message}`);
  process.exit(1);
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (e) {
    fail(`cannot read stdin: ${(e as Error).message}`);
  }
}

let input: ComposeInput;
try {
  input = JSON.parse(readStdin()) as ComposeInput;
} catch (e) {
  fail(`stdin is not valid JSON: ${(e as Error).message}`);
}
const inputCheck = validateContract("compose-input", input);
if (!inputCheck.valid) fail(`stdin fails the compose-input contract: ${inputCheck.errors[0] ?? "unknown"}`);

// ---- Canonical hashing (MUST equal the core's canonicalization, never a second variant) ------
// Canonical JSON = recursively key-sorted; volatile observation timestamps (generatedAt,
// retrievedAt, accessedAt) are stripped before hashing (same rule as src/core/canonical.ts).
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = canonicalize((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "generatedAt" || k === "retrievedAt" || k === "accessedAt") continue;
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return value;
}
function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function stableHash(payload: unknown): string {
  return sha256Hex(JSON.stringify(canonicalize(stripVolatile(payload))));
}
// Canonical, order-independent stable pin hash of a binding map (src/core/resolver.ts
// bindingMapPinHash): bindings sorted by (sourceComponentId, sha of canonical variant key).
function canonicalVariantKey(b: { variantConditions: { prop: string; op?: string; value: string }[] }): string {
  return JSON.stringify([...b.variantConditions].map((c) => ({ prop: c.prop, op: c.op ?? "eq", value: c.value })).sort((x, y) => x.prop.localeCompare(y.prop) || x.value.localeCompare(y.value)));
}
function bindingMapPinHash(bindings: ComposeInput["bindings"]): string {
  const canonical = [...bindings.bindings].sort(
    (a, b) => a.sourceComponentId.localeCompare(b.sourceComponentId) || sha256Hex(canonicalVariantKey(a)).localeCompare(sha256Hex(canonicalVariantKey(b)))
  );
  return stableHash({ ...(bindings as unknown as Record<string, unknown>), bindings: canonical });
}

// ---- Native target identities (verified against the pinned registry before any composition) --
const ROW_ID = "magento_pagebuilder/row";
const ROW_APPEARANCE = "contained";
const BANNER_ID = "magento_pagebuilder/banner";
const BANNER_APPEARANCE = "poster";

const diagnostics: Diagnostic[] = [];
const mapping: MappingEntry[] = [];
const nodeDiag = (code: string, severity: Diagnostic["severity"], message: string, nodeId: string): Diagnostic => ({ code, severity, message, subject: { type: "node", id: nodeId } });

// Registry gate: the target must be present, declared-native and enabled — no appearance guessing.
const capsById = new Map<string, Capability>();
for (const c of input.registry.capabilities) capsById.set(`${c.id}␟${c.appearanceId}`, c);
const requireCap = (id: string, appearanceId: string): boolean => {
  const cap = capsById.get(`${id}␟${appearanceId}`);
  if (!cap) {
    diagnostics.push({ code: "UNSUPPORTED_CAPABILITY", severity: "error", message: `Capability '${id}#${appearanceId}' is absent from the pinned registry; this composer maps only declaration-backed native targets and refuses to guess.`, subject: { type: "capability", id } });
    return false;
  }
  if (cap.category !== "native") {
    diagnostics.push({ code: "UNSUPPORTED_CAPABILITY", severity: "error", message: `Capability '${id}#${appearanceId}' is category '${cap.category}', not native; this slice composes native content only.`, subject: { type: "capability", id } });
    return false;
  }
  if (cap.availability !== "enabled") {
    diagnostics.push({ code: "CAPABILITY_DISABLED", severity: "error", message: `Capability '${id}#${appearanceId}' is '${cap.availability}' in the pinned registry; composing into a non-enabled target is forbidden.`, subject: { type: "capability", id } });
    return false;
  }
  return true;
};
const registryReady = requireCap(ROW_ID, ROW_APPEARANCE) && requireCap(BANNER_ID, BANNER_APPEARANCE);

// ---- Content manifest indexes ---------------------------------------------------------------
const textByRef = new Map<string, string>();
const mediaByRef = new Map<string, { mediaUrl: string; assetLabel?: string }>();
const linkByRef = new Map<string, { linkUrl: string; linkTarget?: string }>();
for (const e of input.content.entries) {
  if (e.kind === "text" && typeof e.text === "string") textByRef.set(e.valueRef, e.text);
  if (e.kind === "media" && typeof e.mediaUrl === "string") mediaByRef.set(e.valueRef, { mediaUrl: e.mediaUrl, ...(e.assetLabel ? { assetLabel: e.assetLabel } : {}) });
  if (e.kind === "link" && typeof e.linkUrl === "string") linkByRef.set(e.valueRef, { linkUrl: e.linkUrl, ...(e.linkTarget ? { linkTarget: e.linkTarget } : {}) });
}

// ---- NodeIR helpers -------------------------------------------------------------------------
const nodesById = new Map<string, NodeIRNode>();
for (const n of input.nodeIr.nodes) nodesById.set(n.nodeId, n);
const locatorOf = (n: NodeIRNode): string | null => n.sourceEvidence?.[0]?.locator ?? null;

// Document-order DESCENDANT walk from a NodeIR node id (the starting node itself is the
// section and is accounted for separately — never double-accounted).
function walkSubtree(rootId: string, visit: (node: NodeIRNode) => void): void {
  const start = nodesById.get(rootId);
  if (!start) return;
  const visitChildren = (id: string): void => {
    for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
      const child = nodesById.get(childId);
      if (!child) continue;
      visit(child);
      visitChildren(childId);
    }
  };
  visitChildren(rootId);
}

// SLOT/<role> naming-contract role (design-source naming spec): the segment after the prefix,
// lowercased and reduced to [a-z0-9]. Absent prefix -> null (reported, never guessed).
function slotRole(node: NodeIRNode): string | null {
  const slash = node.name.indexOf("/");
  if (slash <= 0 || slash === node.name.length - 1) return null;
  return node.name
    .slice(slash + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// ---- Per-section hero composition -------------------------------------------------------------
interface HeroPieces {
  background?: { nodeId: string; mediaUrl: string; assetLabel?: string };
  contentLead?: { nodeId: string; text: string };
  heading?: { nodeId: string; text: string };
  body?: { nodeId: string; text: string };
  cta?: { nodeId: string; text: string; link?: { linkUrl: string; linkTarget?: string } };
  minHeight?: number;
}

const TEXT_ROLE_TABLE: Record<string, "contentLead" | "heading" | "body" | "cta"> = {
  overline: "contentLead",
  heading: "heading",
  body: "body",
  bodycopy: "body",
  cta: "cta",
  ctalabel: "cta",
};

function composeSection(section: PageStructureSection, sectionNodeId: string): string | null {
  const sectionNode = nodesById.get(sectionNodeId);
  if (!sectionNode) {
    diagnostics.push(nodeDiag("EVIDENCE_MISSING", "error", `Planned section '${section.name}' has no NodeIR node; the plan is not derived from this inventory — fail closed.`, sectionNodeId));
    return null;
  }
  const sectionLocator = locatorOf(sectionNode) ?? undefined;

  // Hero-eligibility: background media candidate + at least one text node in the subtree.
  const mediaNodes: NodeIRNode[] = [];
  const textNodes: NodeIRNode[] = [];
  const others: NodeIRNode[] = [];
  walkSubtree(sectionNodeId, (node) => {
    if (node.visible === false) return; // hidden nodes are never composed; the review ledger covers them
    if (node.kind === "media") mediaNodes.push(node);
    else if (node.kind === "text") textNodes.push(node);
    else others.push(node);
  });
  if (mediaNodes.length === 0 || textNodes.length === 0) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' does not carry the hero shape this slice composes (needs background media + overlaid text); skipped — nothing invented.`, sectionNodeId));
    mapping.push({ sourceNodeId: sectionNodeId, ...(sectionNode.name ? { sourceName: sectionNode.name } : {}), ...(sectionLocator ? { sourceLocator: sectionLocator } : {}), disposition: "skipped", note: "Section shape is outside this slice's hero composer (background media + overlaid text)." });
    return null;
  }

  const pieces: HeroPieces = {};

  // Background media: the FIRST media node in document order; extra media nodes are gaps.
  const bgNode = mediaNodes[0];
  const bgLocator = locatorOf(bgNode);
  const bgManifest = bgLocator ? mediaByRef.get(bgLocator) : undefined;
  if (!bgManifest) {
    diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest media entry for background node '${bgNode.name}' (${bgLocator ?? "no locator"}); the banner background is left empty — no asset URL is ever invented.`, bgNode.nodeId));
    mapping.push({ sourceNodeId: bgNode.nodeId, sourceName: bgNode.name, ...(bgLocator ? { sourceLocator: bgLocator } : {}), disposition: "gap", note: "Background media has no manifest entry; banner background left empty." });
  } else {
    pieces.background = { nodeId: bgNode.nodeId, mediaUrl: bgManifest.mediaUrl, ...(bgManifest.assetLabel ? { assetLabel: bgManifest.assetLabel } : {}) };
    mapping.push({ sourceNodeId: bgNode.nodeId, sourceName: bgNode.name, ...(bgLocator ? { sourceLocator: bgLocator } : {}), disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "wrapper", nativeField: "background_image" }, note: `Desktop background image${pieces.background.assetLabel ? ` (${pieces.background.assetLabel})` : ""}; mobile breakpoint not composed.` });
  }
  for (const extra of mediaNodes.slice(1)) {
    const extraLocator = locatorOf(extra);
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Extra media node '${extra.name}' has no native slot in the banner background (one background per banner); not composed.`, extra.nodeId));
    mapping.push({ sourceNodeId: extra.nodeId, sourceName: extra.name, ...(extraLocator ? { sourceLocator: extraLocator } : {}), disposition: "gap", note: "Extra media beyond the banner background; no native slot." });
  }

  // Text nodes: documented SLOT-role table; the CTA link comes from the manifest, keyed by the
  // CTA node's design locator.
  for (const textNode of textNodes) {
    const role = slotRole(textNode);
    const mappedRole = role ? TEXT_ROLE_TABLE[role] : undefined;
    const textLocator = locatorOf(textNode);
    const entryBase = { sourceNodeId: textNode.nodeId, sourceName: textNode.name, ...(textLocator ? { sourceLocator: textLocator } : {}) };
    if (!role || !mappedRole) {
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Text node '${textNode.name}' carries a role outside this slice's documented SLOT-role table; not composed — never guessed.`, textNode.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Text role outside the documented table; not composed." });
      continue;
    }
    const text = textLocator ? textByRef.get(textLocator) : undefined;
    if (text === undefined) {
      diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest text entry for '${textNode.name}' (${textLocator ?? "no locator"}); the ${mappedRole} field is left empty — no text is invented.`, textNode.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: `No manifest text entry for the ${mappedRole} field.` });
      continue;
    }
    if (mappedRole === "cta") {
      const link = textLocator ? linkByRef.get(textLocator) : undefined;
      pieces.cta = { nodeId: textNode.nodeId, text, ...(link ? { link } : {}) };
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "button", nativeField: "button_text" }, note: link ? "CTA text + link target from the manifest." : "CTA text from the manifest; no link entry — banner renders the button without a link wrapper." });
      if (!link) {
        diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest link entry for CTA node '${textNode.name}'; the CTA composes without a link target (banner shows the button unlinked).`, textNode.nodeId));
      }
    } else {
      pieces[mappedRole] = { nodeId: textNode.nodeId, text };
      const as = mappedRole === "heading" ? "<h2>" : "<p>";
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "content", nativeField: "message" }, note: `Text folded into the banner content WYSIWYG field as ${as}; standalone per-field styling is not preserved (single WYSIWYG field).` });
    }
  }

  // Non-text, non-media nodes: decorations recorded as gaps (never silently dropped), structural
  // SLOT containers recorded as folded (their children realized natively above).
  for (const other of others) {
    const otherLocator = locatorOf(other);
    const entryBase = { sourceNodeId: other.nodeId, sourceName: other.name, ...(otherLocator ? { sourceLocator: otherLocator } : {}) };
    if (other.role === "DECOR" || other.kind === "icon") {
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`, other.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Decoration without a native equivalent; explicitly excluded (not silently dropped)." });
    } else if (other.role === "SLOT" && other.kind === "container") {
      const containsCta = (nodesById.get(other.nodeId)?.childrenNodeIds ?? []).some((childId) => {
        const child = nodesById.get(childId);
        const r = child ? slotRole(child) : null;
        return child?.kind === "text" && r !== null && TEXT_ROLE_TABLE[r] === "cta";
      });
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: containsCta ? "button" : "content", nativeField: containsCta ? "button_text" : "message" }, note: containsCta ? "Structural container folded into the banner button area; no separate native container." : "Structural container folded into the banner content WYSIWYG; no separate native container." });
    } else {
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Node '${other.name}' (kind '${other.kind}', role '${other.role ?? "none"}') is outside this slice's composition table; not composed.`, other.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Node outside the composition table; not composed." });
    }
  }

  // Sanity: at least one field must resolve, else the banner is not composable.
  if (!pieces.background && !pieces.heading && !pieces.body && !pieces.cta) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' resolved to zero composable fields; nothing composed.`, sectionNodeId));
    mapping.push({ sourceNodeId: sectionNodeId, ...(sectionNode.name ? { sourceName: sectionNode.name } : {}), ...(sectionLocator ? { sourceLocator: sectionLocator } : {}), disposition: "skipped", note: "Zero composable fields after gap resolution." });
    return null;
  }

  // Section-level height: the ONLY layout primitive carried into the composition (declaration-
  // backed: the poster overlay element declares min_height). Everything else stays a platform
  // default that the Admin form owns.
  const heightConstraint = section.layout.constraints.find((c) => c.axis === "height" && c.type === "fixed");
  if (heightConstraint) {
    const px = Number(heightConstraint.value);
    if (Number.isFinite(px) && px > 0) pieces.minHeight = px;
    else diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section height constraint '${heightConstraint.value}' is not a positive number; min-height not composed.`, sectionNodeId));
  } else {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' carries no fixed height constraint; banner min-height not composed (Admin default applies).`, sectionNodeId));
  }

  // ---- Emit (fixed attribute order; mirrors the platform's own persisted master format) -------
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const escText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const backgroundImagesJson = JSON.stringify(pieces.background ? { desktop_image: pieces.background.mediaUrl } : {}).replace(/"/g, "&quot;");

  const contentFragments: string[] = [];
  if (pieces.contentLead) contentFragments.push(`<p>${escText(pieces.contentLead.text)}</p>`);
  if (pieces.heading) contentFragments.push(`<h2>${escText(pieces.heading.text)}</h2>`);
  if (pieces.body) contentFragments.push(`<p>${escText(pieces.body.text)}</p>`);
  const buttonHtml = pieces.cta
    ? `<button type="button" class="pagebuilder-banner-button" data-element="button" style="opacity: 1; visibility: visible;">${escText(pieces.cta.text)}</button>`
    : "";
  const overlayStyle = pieces.minHeight ? ` style="min-height: ${pieces.minHeight}px;"` : "";
  const showButton = pieces.cta ? "always" : "never";
  const linkAttrs = pieces.cta?.link
    ? ` href="${esc(pieces.cta.link.linkUrl)}"${pieces.cta.link.linkTarget ? ` target="${esc(pieces.cta.link.linkTarget)}"` : ""}`
    : "";

  return (
    `<div data-content-type="row" data-appearance="contained" data-element="main">` +
    `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
    `<div data-content-type="banner" data-appearance="poster" data-show-button="${showButton}" data-show-overlay="never" data-element="main">` +
    (pieces.cta?.link ? `<a${linkAttrs} data-element="link">` : `<div data-element="empty_link">`) +
    `<div class="pagebuilder-banner-wrapper" data-background-images="${backgroundImagesJson}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="wrapper">` +
    `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title=""${overlayStyle} data-element="overlay">` +
    `<div class="pagebuilder-poster-content">` +
    `<div data-element="content">${contentFragments.join("")}</div>` +
    buttonHtml +
    `</div>` +
    `</div>` +
    `</div>` +
    (pieces.cta?.link ? `</a>` : `</div>`) +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

// ---- Compose all sections in plan order -------------------------------------------------------
const locatorToNodeId = new Map<string, string>();
for (const n of input.nodeIr.nodes) {
  const loc = locatorOf(n);
  if (loc) locatorToNodeId.set(loc, n.nodeId);
}
const sectionHtmlParts: string[] = [];
for (const section of [...input.pageStructure.sections].sort((a, b) => a.order - b.order)) {
  const sectionEvidence = section.sourceEvidence?.[0]?.locator;
  const sectionNodeId = sectionEvidence ? locatorToNodeId.get(sectionEvidence) : undefined;
  if (!sectionNodeId) {
    diagnostics.push({ code: "EVIDENCE_MISSING", severity: "error", message: `Planned section '${section.name}' carries no evidence locator resolvable in the NodeIR; the plan is not derived from this inventory — fail closed.`, subject: { type: "section", id: section.sectionId } });
    continue;
  }
  const html = registryReady ? composeSection(section, sectionNodeId) : null;
  if (html) {
    sectionHtmlParts.push(html);
    const sectionNode = nodesById.get(sectionNodeId) as NodeIRNode;
    mapping.push({
      sourceNodeId: sectionNodeId,
      ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
      ...(sectionEvidence ? { sourceLocator: sectionEvidence } : {}),
      disposition: "mapped",
      target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "main", nativeField: "banner (row > banner container)" },
      note: "Section composed as native row(contained) > banner(poster) per the pinned declarations; the row provides the platform's standard top-level container.",
    });
  }
}

const content = sectionHtmlParts.join("");
const payload = {
  schemaVersion: 1,
  platformId: input.platformId,
  source: {
    sourceId: input.pageStructure.source.sourceId,
    revisionId: input.pageStructure.source.revisionId,
    accessedAt: new Date().toISOString(),
  },
  inputs: {
    nodeIrContentHash: stableHash(input.nodeIr),
    pageStructureContentHash: stableHash(input.pageStructure),
    contentManifestContentHash: stableHash(input.content),
    registryRevisionId: input.registry.source.revisionId,
    bindingMapContentHash: bindingMapPinHash(input.bindings),
  },
  content,
  contentHash: `sha256:${sha256Hex(content)}`,
  mapping: [...mapping].sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId)),
  diagnostics: sortDiagnostics(diagnostics),
};

const outCheck = validateContract("compose-output", payload);
if (!outCheck.valid) fail(`constructed compose output fails its contract: ${outCheck.errors[0] ?? "unknown"}`);
process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
