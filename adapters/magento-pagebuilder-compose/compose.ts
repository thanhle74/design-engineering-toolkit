// Magento Page Builder compose adapter — deterministic native content composer (G3, issue #23).
//
// Contract: stdin = one ComposeInput JSON document (schemas/cli/compose-input.schema.json),
// stdout = one ComposeOutput JSON payload (schemas/cli/compose-output.schema.json).
// The det core never imports this file; it spawns it per the adapter descriptor. The core has
// already validated every embedded payload + all cross-pins; this adapter re-validates
// defensively and fails closed on anything unexpected.
//
// What this slice composes (and what it deliberately does not):
// - TWO bounded section shapes, each detected per section and composed only through explicit
//   role evidence (projection or SLOT naming hints), never guessed:
//   (1) the G3 hero shape: a section whose subtree carries full-width background media + overlaid
//       text + an optional CTA. Native target (evidence: Magento_PageBuilder declarations, verified
//       at the pinned checkout revision before this adapter was written):
//         row (appearance "contained", children policy allow) > banner (appearance "poster", default).
//       The banner is the platform's own background-image-with-text-overlay unit: background media
//       lands in the wrapper's data-background-images, overlaid text in the content WYSIWYG field,
//       the CTA in the button element — each an Admin-editable form field.
//   (2) the G4 two-column shape (issue #25): a section with exactly one column-primary and one
//       column-secondary projected slot container. Native target (declarations verified on the
//       pinned checkout before this shape was written):
//         row (contained) > column-group (default) > column-line (default) > column (full-height) x2.
//       column-line is the DECLARATION-MANDATED bridge (a column's parents allow only column-line/
//       column; a column-group's parents exclude column). Each column composes role-resolved text
//       (content-lead/heading/body) folded into ONE text (default) WYSIWYG element and projected
//       inline-media nodes as native image (full-width) elements — each an Admin-editable form
//       field. A column-group nested inside a column is NOT declaration-backed (column-group
//       parents policy denies column; column children deny row/column/column-line), so observed
//       side-by-side media pairs inside a column compose as stacked native images with an explicit
//       fidelity gap — never custom CSS, never a generic renderer. Column widths derive from the
//       observed fixed-width constraints (rounded to integer percents, equal -> the platform's own
//       50/50) and persist inline in the attested stored shape of this checkout (real cms_page 37:
//       style="width:25%"); the section's fixed height persists as the row inner min_height
//       (declaration-backed). Gaps (gutter, pair staggering, aspect ratios, mobile breakpoint)
//       are NOT_VERIFIED warnings + accountable mapping entries.
// - The emitted markup mirrors the platform's own persisted master format (its master templates
//   stamp data-element="<declared element name>" on every element; the master-format reader
//   populates forms by those names). Attributes not present in the pinned declarations are not
//   emitted. NO arbitrary embeddable-markup content type is produced.
// - Text role resolution, in deterministic precedence:
//     (1) an explicit, reason-carrying semantic projection assignment (the recorded human
//         decision, for sources whose layer names do not carry the SLOT-role convention);
//     (2) the documented naming-contract table for SLOT/<role> names:
//           overline -> content lead <p>; heading -> content <h2>;
//           body|bodycopy -> content <p>; cta|ctalabel -> button element text.
//   Text layers named by their raw content and button component instances compose ONLY through
//   the explicit projection — without it (and without naming hints) the section is honestly
//   skipped, never guessed. Unrecognized roles are reported as gaps.
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
  projection?: { assignments: { sourceLocator: string; role: "background-media" | "content-lead" | "heading" | "body" | "cta" | "decoration" | "column-primary" | "column-secondary" | "inline-media"; reason: string }[] };
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
// G4 two-column shape targets (declarations verified on the pinned checkout before use).
const COLUMN_GROUP_ID = "magento_pagebuilder/column-group";
const COLUMN_GROUP_APPEARANCE = "default";
const COLUMN_LINE_ID = "magento_pagebuilder/column-line";
const COLUMN_LINE_APPEARANCE = "default";
const COLUMN_ID = "magento_pagebuilder/column";
const COLUMN_APPEARANCE = "full-height";
const IMAGE_ID = "magento_pagebuilder/image";
const IMAGE_APPEARANCE = "full-width";
const TEXT_ID = "magento_pagebuilder/text";
const TEXT_APPEARANCE = "default";

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

// ---- Explicit semantic projection (optional; the recorded human decision) --------------------
type ComposerRole = "background-media" | "content-lead" | "heading" | "body" | "cta" | "decoration" | "column-primary" | "column-secondary" | "inline-media";
const roleByLocator = new Map<string, ComposerRole>();
for (const a of input.projection?.assignments ?? []) roleByLocator.set(a.sourceLocator, a.role);

// ---- NodeIR helpers -------------------------------------------------------------------------
const nodesById = new Map<string, NodeIRNode>();
for (const n of input.nodeIr.nodes) nodesById.set(n.nodeId, n);
const locatorOf = (n: NodeIRNode): string | null => n.sourceEvidence?.[0]?.locator ?? null;
const nodeIdOfLocator = new Map<string, string>();
for (const n of input.nodeIr.nodes) {
  const loc = locatorOf(n);
  if (loc) nodeIdOfLocator.set(loc, n.nodeId);
}
// Subtrees of explicitly projected decoration nodes are excluded from content, with their own
// accountable entries (recorded, never silently dropped).
const excludedLocators = new Set<string>();
for (const [loc, role] of roleByLocator) {
  if (role !== "decoration") continue;
  excludedLocators.add(loc); // the decorated root itself
  const rootId = nodeIdOfLocator.get(loc);
  if (!rootId) continue; // projected locator not in this inventory; nothing further to exclude
  walkSubtree(rootId, (n) => {
    const l = locatorOf(n);
    if (l) excludedLocators.add(l);
  });
}

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

// Deterministic role resolution shared by both section shapes: explicit projection assignment >
// SLOT naming-contract table (text layers only). Subtrees of projected decoration nodes are
// excluded by the caller; text layers named by their raw content compose only through the
// explicit projection.
function resolveComposerRole(node: NodeIRNode): ComposerRole | undefined {
  const loc = locatorOf(node);
  const projected = loc ? roleByLocator.get(loc) : undefined;
  if (projected && projected !== "decoration") return projected;
  if (node.kind !== "text") return undefined;
  const r = slotRole(node);
  return r ? (TEXT_ROLE_TABLE[r] as ComposerRole | undefined) : undefined;
}

// ---- HTML escaping (fixed; attribute values vs text content) --------------------------------
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const escText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- G4 two-column composition (issue #25) ---------------------------------------------------
// Emits row(contained) > column-group(default) > column-line(default) > column(full-height) x2
// — the only declaration-backed two-column chain (a column-group's parents policy excludes
// column; a column's children policy denies row/column/column-line, so column-line is the
// mandated bridge under the group). Per column: the container's own media entry (the observed
// media slot frame carries the media fill directly) and projected inline-media descendants
// become native image (full-width) elements; role-resolved text (content-lead/heading/body)
// folds into ONE text (default) WYSIWYG in document order. Fidelity limits (inter-column
// gutter, side-by-side pair arrangement, stagger, aspect ratios, mobile breakpoint) come back
// as explicit NOT_VERIFIED warnings + accountable mapping entries — never custom CSS.
type EmitItem =
  | { kind: "image"; nodeId: string; name: string; locator: string | null; media: { mediaUrl: string; assetLabel?: string }; viaProjection: boolean; accountedByContainer: boolean }
  | { kind: "text"; runs: { role: "content-lead" | "heading" | "body"; nodeId: string; name: string; locator: string | null; text: string; viaProjection: boolean }[] };

function composeTwoColumnSection(section: PageStructureSection, sectionNodeId: string, primaryNode: NodeIRNode, secondaryNode: NodeIRNode): string | null {
  const sectionNode = nodesById.get(sectionNodeId) as NodeIRNode;
  const sectionLocator = locatorOf(sectionNode) ?? undefined;

  // Shape registry gate: every native target this shape emits must be present, declared-native
  // and enabled — no appearance guessing (the row gate is shared with the hero shape above).
  const shapeReady =
    requireCap(COLUMN_GROUP_ID, COLUMN_GROUP_APPEARANCE) &&
    requireCap(COLUMN_LINE_ID, COLUMN_LINE_APPEARANCE) &&
    requireCap(COLUMN_ID, COLUMN_APPEARANCE) &&
    requireCap(IMAGE_ID, IMAGE_APPEARANCE) &&
    requireCap(TEXT_ID, TEXT_APPEARANCE);
  if (!shapeReady) return null;

  // Column widths derive from the observed fixed-width constraints (rounded to integer
  // percents, clamped to 1..99); without constraints the platform's own equal-column default
  // applies — recorded, never inferred from source geometry the inventory does not carry.
  const fixedWidthOf = (n: NodeIRNode): number | null => {
    const c = n.layout.constraints.find((x) => x.axis === "width" && x.type === "fixed");
    const px = c ? Number(c.value) : NaN;
    return Number.isFinite(px) && px > 0 ? px : null;
  };
  const w1 = fixedWidthOf(primaryNode);
  const w2 = fixedWidthOf(secondaryNode);
  let primaryPct = 50;
  let secondaryPct = 50;
  if (w1 !== null && w2 !== null) {
    primaryPct = Math.min(99, Math.max(1, Math.round((w1 / (w1 + w2)) * 100)));
    secondaryPct = 100 - primaryPct;
  } else {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' column slots carry no fixed-width constraints; widths fall back to the platform's own equal-column default (50/50) — recorded, not inferred.`, sectionNodeId));
  }

  // Per-column content. Document-order walk; consecutive role-resolved texts merge into one
  // text WYSIWYG element at their position; each projected inline-media node becomes one image
  // element. Everything else is accounted explicitly (gap / excluded / decoration).
  const composeColumn = (columnNode: NodeIRNode, isPrimary: boolean): string => {
    const items: EmitItem[] = [];
    let pendingText: EmitItem | null = null;
    const flushText = (): void => {
      if (pendingText && pendingText.kind === "text" && pendingText.runs.length > 0) items.push(pendingText);
      pendingText = null;
    };
    const pushTextRun = (run: Extract<EmitItem, { kind: "text" }>["runs"][number]): void => {
      if (pendingText && pendingText.kind === "text") pendingText.runs.push(run);
      else pendingText = { kind: "text", runs: [run] };
    };

    // The column container's own media entry first (the observed media slot frame IS the media;
    // its image composes as the column's first element, accounted by the container's mapping).
    const colLocator = locatorOf(columnNode);
    const ownMedia = colLocator ? mediaByRef.get(colLocator) : undefined;
    if (ownMedia) {
      flushText();
      items.push({ kind: "image", nodeId: columnNode.nodeId, name: columnNode.name, locator: colLocator, media: ownMedia, viaProjection: false, accountedByContainer: true });
    }

    walkSubtree(columnNode.nodeId, (node) => {
      if (node.visible === false) return;
      const loc = locatorOf(node);
      const entryBase = { sourceNodeId: node.nodeId, sourceName: node.name, ...(loc ? { sourceLocator: loc } : {}) };
      if (loc && roleByLocator.get(loc) === "decoration") {
        diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`, node.nodeId));
        mapping.push({ ...entryBase, disposition: "gap", note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped)." });
        return;
      }
      if (loc && excludedLocators.has(loc)) {
        flushText();
        mapping.push({ ...entryBase, disposition: "excluded", note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped." });
        return;
      }
      const role = resolveComposerRole(node);
      if (loc !== null && roleByLocator.get(loc) === "inline-media") {
        flushText();
        const media = loc ? mediaByRef.get(loc) : undefined;
        if (!media) {
          diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest media entry for projected inline-media node '${node.name}' (${loc ?? "no locator"}); no image element is composed — no asset URL is ever invented.`, node.nodeId));
          mapping.push({ ...entryBase, disposition: "gap", note: "Projected inline-media without a manifest media entry; no image element composed." });
          return;
        }
        items.push({ kind: "image", nodeId: node.nodeId, name: node.name, locator: loc, media, viaProjection: true, accountedByContainer: false });
        return;
      }
      if (role === "content-lead" || role === "heading" || role === "body") {
        const text = loc ? textByRef.get(loc) : undefined;
        if (text === undefined) {
          diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest text entry for '${node.name}' (${loc ?? "no locator"}); the ${role} field is left empty — no text is invented.`, node.nodeId));
          mapping.push({ ...entryBase, disposition: "gap", note: `No manifest text entry for the ${role} field.` });
          return;
        }
        pushTextRun({ role, nodeId: node.nodeId, name: node.name, locator: loc, text, viaProjection: loc !== null && roleByLocator.get(loc) !== undefined });
        return;
      }
      if (role === "cta") {
        flushText();
        diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `CTA '${node.name}' has no native target inside a two-column column in this slice (the banner button belongs to the hero shape); not composed.`, node.nodeId));
        mapping.push({ ...entryBase, disposition: "gap", note: "Projected CTA outside the two-column composition table; not composed." });
        return;
      }
      flushText();
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the two-column composition table; not composed.`, node.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Node outside the two-column composition table; not composed." });
    });
    flushText();

    const html = items
      .map((item) => {
        if (item.kind === "image") {
          if (!item.accountedByContainer) {
            mapping.push({
              sourceNodeId: item.nodeId,
              sourceName: item.name,
              ...(item.locator ? { sourceLocator: item.locator } : {}),
              disposition: "mapped",
              target: { capabilityId: IMAGE_ID, appearanceId: IMAGE_APPEARANCE, nativeElement: "image", nativeField: "desktop_image (src)" },
              note: `Explicitly projected media slot composed as a native image element${item.media.assetLabel ? ` (${item.media.assetLabel})` : ""}; the observed side-by-side pairing of detail media is not declaration-backed and composes stacked — see the section's fidelity warnings.`,
            });
          }
          return `<figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="${esc(item.media.mediaUrl)}" alt="" title="" data-element="desktop_image"></figure>`;
        }
        for (const run of item.runs) {
          mapping.push({
            sourceNodeId: run.nodeId,
            sourceName: run.name,
            ...(run.locator ? { sourceLocator: run.locator } : {}),
            disposition: "mapped",
            target: { capabilityId: TEXT_ID, appearanceId: TEXT_APPEARANCE, nativeElement: "text", nativeField: "content (WYSIWYG HTML)" },
            note: `${run.viaProjection ? "Explicitly projected " : ""}text folded into the column text WYSIWYG field as ${run.role === "heading" ? "<h2>" : "<p>"}${item.runs.length > 1 ? " (consecutive texts merged into one field, document order)" : ""}; standalone per-field styling is not preserved (single WYSIWYG field).`,
          });
        }
        return `<div data-content-type="text" data-appearance="default" data-element="main">${item.runs.map((run) => (run.role === "heading" ? `<h2>${escText(run.text)}</h2>` : `<p>${escText(run.text)}</p>`)).join("")}</div>`;
      })
      .join("");

    // Column container mapping (one entry per node; covers the container's own media when
    // present). When the slot carries neither its own media nor any composable descendant,
    // nothing of the slot landed except the structural shell — an honest gap entry (G3
    // precedent: a content-carrying node with a missing manifest entry is a gap, never a
    // mapped claim) plus the explicit empty-column diagnostic.
    const columnLanded = ownMedia !== undefined || html.length > 0;
    mapping.push({
      sourceNodeId: columnNode.nodeId,
      sourceName: columnNode.name,
      ...(colLocator ? { sourceLocator: colLocator } : {}),
      disposition: columnLanded ? "mapped" : "gap",
      ...(columnLanded ? { target: { capabilityId: COLUMN_ID, appearanceId: COLUMN_APPEARANCE, nativeElement: isPrimary ? "column (primary)" : "column (secondary)", nativeField: ownMedia ? "column children (own media slot -> image desktop_image src)" : "column children" } } : {}),
      note: columnLanded
        ? `${isPrimary ? "Primary" : "Secondary"} slot composed as the ${isPrimary ? "left" : "right"} native column (full-height)${ownMedia ? "; the slot's own media fill composes as the column's image element" : "; no manifest media entry on the slot frame itself"}.`
        : `${isPrimary ? "Primary" : "Secondary"} slot carries no manifest media entry and no composable descendants; only the empty native column shell is emitted structurally — the slot's media is NOT composed.`,
    });
    if (!columnLanded) {
      diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `Projected ${isPrimary ? "column-primary" : "column-secondary"} slot '${columnNode.name}' resolved to zero content elements (no own media entry, no composable descendants); an empty native column shell is emitted — nothing invented.`, columnNode.nodeId));
    }
    return html;
  };

  const primaryHtml = composeColumn(primaryNode, true);
  const secondaryHtml = composeColumn(secondaryNode, false);

  // Fidelity warnings (aggregated, once per section; derived from the observed inventory):
  // (1) multiple images in one column compose stacked — the side-by-side arrangement (and its
  //     staggering) is not declaration-backed natively;
  // (2) the observed inter-column gutter is not composed (no native gutter field);
  // (3) media aspect ratios are not enforced by the native image element.
  const imagesIn = (columnNode: NodeIRNode): NodeIRNode[] => {
    const out: NodeIRNode[] = [];
    const colLocator = locatorOf(columnNode);
    if (colLocator && mediaByRef.has(colLocator)) out.push(columnNode);
    walkSubtree(columnNode.nodeId, (n) => {
      if (n.visible === false) return;
      const loc = locatorOf(n);
      if (loc && (roleByLocator.get(loc) === "inline-media" || mediaByRef.has(loc))) out.push(n);
    });
    return out;
  };
  for (const [label, columnNode] of [["primary", primaryNode], ["secondary", secondaryNode]] as const) {
    const imgs = imagesIn(columnNode);
    if (imgs.length > 1) {
      const ys = [...new Set(imgs.map((n) => n.layout.constraints.find((c) => c.axis === "y" && c.type === "fixed")).map((c) => (c ? Number(c.value) : NaN)).filter((v) => Number.isFinite(v)))];
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `${label} column of '${section.name}' carries ${imgs.length} observed media slots; they compose as stacked native image elements — the observed side-by-side arrangement is not declaration-backed (a column-group nested inside a column violates the pinned parents/children policies)${ys.length > 1 ? ", and the observed vertical staggering of the pair is not a native field" : ""}. Recorded as a fidelity gap, never custom CSS.`, sectionNodeId));
    }
  }
  const xOf = (n: NodeIRNode): number | null => {
    const c = n.layout.constraints.find((x) => x.axis === "x" && x.type === "fixed");
    const px = c ? Number(c.value) : NaN;
    return Number.isFinite(px) && px > 0 ? px : null;
  };
  const x1 = xOf(primaryNode);
  const x2 = xOf(secondaryNode);
  if (x1 !== null && x2 !== null && w1 !== null && x2 > x1 + w1) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `The observed ${x2 - (x1 + w1)}px gutter between the two columns of '${section.name}' is not composed — native columns carry no gutter field (the attested inline widths approximate the observed proportions at ${primaryPct}/${secondaryPct}).`, sectionNodeId));
  }
  if (imagesIn(primaryNode).length + imagesIn(secondaryNode).length > 0) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Observed media aspect ratios in '${section.name}' are not enforced by the native image element (natural aspect at column width; no native aspect/crop field); the section's fixed height persists only as the row min-height.`, sectionNodeId));
  }

  // Section-level height: the row inner min_height (declaration-backed; same policy as the hero
  // shape's overlay min-height).
  const heightConstraint = section.layout.constraints.find((c) => c.axis === "height" && c.type === "fixed");
  let rowMinHeight: number | undefined;
  if (heightConstraint) {
    const px = Number(heightConstraint.value);
    if (Number.isFinite(px) && px > 0) rowMinHeight = px;
    else diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`, sectionNodeId));
  } else {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`, sectionNodeId));
  }

  // ---- Emit (fixed attribute order; mirrors the platform's attested persisted master format) --
  const innerStyle = rowMinHeight !== undefined ? ` style="min-height: ${rowMinHeight}px;"` : "";
  mapping.push({
    sourceNodeId: sectionNodeId,
    ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
    ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
    disposition: "mapped",
    target: { capabilityId: ROW_ID, appearanceId: ROW_APPEARANCE, nativeElement: "main", nativeField: "row(contained) > column-group(default) > column-line > column(full-height) x2" },
    note: `Section composed as the declaration-backed two-column chain; column-line is the mandated bridge; observed slot proportions${w1 !== null && w2 !== null ? ` (${w1}:${w2})` : ""} simplified to ${primaryPct}/${secondaryPct} inline widths (attested stored shape); mobile breakpoint not composed.`,
  });
  return (
    `<div data-content-type="row" data-appearance="contained" data-element="main">` +
    `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src=""${innerStyle} data-element="inner">` +
    `<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">` +
    `<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main">` +
    `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" style="width:${primaryPct}%">` +
    primaryHtml +
    `</div>` +
    `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" style="width:${secondaryPct}%">` +
    secondaryHtml +
    `</div>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

function composeSection(section: PageStructureSection, sectionNodeId: string): string | null {
  const sectionNode = nodesById.get(sectionNodeId);
  if (!sectionNode) {
    diagnostics.push(nodeDiag("EVIDENCE_MISSING", "error", `Planned section '${section.name}' has no NodeIR node; the plan is not derived from this inventory — fail closed.`, sectionNodeId));
    return null;
  }
  const sectionLocator = locatorOf(sectionNode) ?? undefined;

  // Shape dispatch (deterministic): a section whose visible direct children carry exactly one
  // column-primary and one column-secondary projected slot container composes as the G4
  // two-column shape; everything else falls through to the G3 hero composer (unchanged). A
  // non-matching section is honestly skipped exactly once, by the hero path's own scan.
  const directVisibleChildren = (sectionNode.childrenNodeIds ?? [])
    .map((id) => nodesById.get(id))
    .filter((n): n is NodeIRNode => n !== undefined && n.visible !== false);
  const primaries = directVisibleChildren.filter((n) => {
    const loc = locatorOf(n);
    return loc !== null && roleByLocator.get(loc) === "column-primary";
  });
  const secondaries = directVisibleChildren.filter((n) => {
    const loc = locatorOf(n);
    return loc !== null && roleByLocator.get(loc) === "column-secondary";
  });
  if (primaries.length === 1 && secondaries.length === 1) {
    return composeTwoColumnSection(section, sectionNodeId, primaries[0] as NodeIRNode, secondaries[0] as NodeIRNode);
  }

  // Deterministic role resolution: explicit projection assignment > SLOT naming-contract table.
  // Only the hero's own text roles fold here; other projected roles (columns, inline-media,
  // decoration) fall to the accountable "other" treatment below — never mis-claimed.
  const HERO_TEXT_ROLES: ComposerRole[] = ["content-lead", "heading", "body", "cta"];
  const resolveRole = (node: NodeIRNode): "background-media" | "content-lead" | "heading" | "body" | "cta" | undefined => {
    const role = resolveComposerRole(node);
    return role !== undefined && HERO_TEXT_ROLES.includes(role) ? (role as "background-media" | "content-lead" | "heading" | "body" | "cta") : undefined;
  };

  // Eligibility scan (document order; invisible nodes are never composed — the review ledger
  // covers them; excluded-decorated subtrees STAY in scope so every node gets its own entry).
  const inScope: NodeIRNode[] = [];
  walkSubtree(sectionNodeId, (node) => {
    if (node.visible === false) return;
    inScope.push(node);
  });
  const notExcluded = (n: NodeIRNode): boolean => {
    const loc = locatorOf(n);
    return loc === null || !excludedLocators.has(loc);
  };
  const bgCandidates = inScope.filter((n) => notExcluded(n) && (n.kind === "media" || (locatorOf(n) !== null && roleByLocator.get(locatorOf(n) as string) === "background-media")));
  const textCandidates = inScope.filter((n) => {
    if (!notExcluded(n)) return false;
    const role = resolveRole(n);
    return role !== undefined && role !== "background-media";
  });
  if (bgCandidates.length === 0 || textCandidates.length === 0) {
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Section '${section.name}' does not carry the hero shape this slice composes (needs a background-media node and role-resolved overlaid text — via explicit projection or SLOT naming hints); skipped — nothing invented.`, sectionNodeId));
    mapping.push({ sourceNodeId: sectionNodeId, ...(sectionNode.name ? { sourceName: sectionNode.name } : {}), ...(sectionLocator ? { sourceLocator: sectionLocator } : {}), disposition: "skipped", note: "Section shape is outside this slice's hero composer (background media + role-resolved overlaid text)." });
    return null;
  }

  const pieces: HeroPieces = {};

  // Background media: the explicit projection assignment if present, else the FIRST media node
  // in document order. Extra media nodes are gaps.
  const bgNode =
    inScope.find((n) => locatorOf(n) !== null && roleByLocator.get(locatorOf(n) as string) === "background-media") ?? bgCandidates.find((n) => n.kind === "media") ?? null;
  if (bgNode) {
    const bgLocator = locatorOf(bgNode);
    const bgManifest = bgLocator ? mediaByRef.get(bgLocator) : undefined;
    if (!bgManifest) {
      diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest media entry for background node '${bgNode.name}' (${bgLocator ?? "no locator"}); the banner background is left empty — no asset URL is ever invented.`, bgNode.nodeId));
      mapping.push({ sourceNodeId: bgNode.nodeId, sourceName: bgNode.name, ...(bgLocator ? { sourceLocator: bgLocator } : {}), disposition: "gap", note: "Background media has no manifest entry; banner background left empty." });
    } else {
      pieces.background = { nodeId: bgNode.nodeId, mediaUrl: bgManifest.mediaUrl, ...(bgManifest.assetLabel ? { assetLabel: bgManifest.assetLabel } : {}) };
      mapping.push({ sourceNodeId: bgNode.nodeId, sourceName: bgNode.name, ...(bgLocator ? { sourceLocator: bgLocator } : {}), disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "wrapper", nativeField: "background_image" }, note: `Desktop background image${pieces.background.assetLabel ? ` (${pieces.background.assetLabel})` : ""}; mobile breakpoint not composed.` });
    }
  }
  for (const extra of bgCandidates.filter((n) => n !== bgNode && n.kind === "media")) {
    const extraLocator = locatorOf(extra);
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Extra media node '${extra.name}' has no native slot in the banner background (one background per banner); not composed.`, extra.nodeId));
    mapping.push({ sourceNodeId: extra.nodeId, sourceName: extra.name, ...(extraLocator ? { sourceLocator: extraLocator } : {}), disposition: "gap", note: "Extra media beyond the banner background; no native slot." });
  }

  // Role-resolved text nodes: content lead / heading / body fold into the content WYSIWYG;
  // cta becomes the button element (label text; link from the manifest, keyed by the node).
  for (const textNode of textCandidates) {
    const role = resolveRole(textNode);
    const textLocator = locatorOf(textNode);
    const entryBase = { sourceNodeId: textNode.nodeId, sourceName: textNode.name, ...(textLocator ? { sourceLocator: textLocator } : {}) };
    const viaProjection = textLocator !== null && roleByLocator.get(textLocator) !== undefined;
    const text = textLocator ? textByRef.get(textLocator) : undefined;
    if (text === undefined) {
      diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest text entry for '${textNode.name}' (${textLocator ?? "no locator"}); the ${role} field is left empty — no text is invented.`, textNode.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: `No manifest text entry for the ${role} field.` });
      continue;
    }
    if (role === "cta") {
      const link = textLocator ? linkByRef.get(textLocator) : undefined;
      pieces.cta = { nodeId: textNode.nodeId, text, ...(link ? { link } : {}) };
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "button", nativeField: "button_text" }, note: `${viaProjection ? "Explicitly projected " : ""}CTA (${textNode.name}) — label text${link ? " + link target" : ""} from the manifest.` });
      if (!link) {
        diagnostics.push(nodeDiag("EVIDENCE_MISSING", "warning", `No content-manifest link entry for CTA node '${textNode.name}'; the CTA composes without a link target (banner shows the button unlinked).`, textNode.nodeId));
      }
    } else {
      const pieceKey = role === "content-lead" ? "contentLead" : (role as "heading" | "body");
      pieces[pieceKey] = { nodeId: textNode.nodeId, text };
      const as = role === "heading" ? "<h2>" : "<p>";
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "content", nativeField: "message" }, note: `${viaProjection ? "Explicitly projected " : ""}text folded into the banner content WYSIWYG field as ${as}; standalone per-field styling is not preserved (single WYSIWYG field).` });
    }
  }

  // Every other in-scope node: decorated subtrees already excluded above; here decorations,
  // containers and unrecognized kinds get their explicit, accountable treatment.
  const accounted = new Set<string>([...(pieces.background ? [pieces.background.nodeId] : []), ...textCandidates.map((t) => t.nodeId)]);
  for (const other of inScope) {
    if (accounted.has(other.nodeId)) continue;
    const otherLocator = locatorOf(other);
    const entryBase = { sourceNodeId: other.nodeId, sourceName: other.name, ...(otherLocator ? { sourceLocator: otherLocator } : {}) };
    if (otherLocator && roleByLocator.get(otherLocator) === "decoration") {
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`, other.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped)." });
      continue;
    }
    if (otherLocator && excludedLocators.has(otherLocator)) {
      mapping.push({ ...entryBase, disposition: "excluded", note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped." });
      continue;
    }
    if (other.role === "DECOR" || other.kind === "icon") {
      diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`, other.nodeId));
      mapping.push({ ...entryBase, disposition: "gap", note: "Decoration without a native equivalent; explicitly excluded (not silently dropped)." });
      continue;
    }
    if (other.role === "SLOT" && other.kind === "container") {
      const containsCta = (nodesById.get(other.nodeId)?.childrenNodeIds ?? []).some((childId) => {
        const child = nodesById.get(childId);
        if (!child) return false;
        const childLocator = locatorOf(child);
        return (childLocator !== null && roleByLocator.get(childLocator) === "cta") || (child.kind === "text" && (() => { const r = slotRole(child); return r !== null && TEXT_ROLE_TABLE[r] === "cta"; })());
      });
      mapping.push({ ...entryBase, disposition: "mapped", target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: containsCta ? "button" : "content", nativeField: containsCta ? "button_text" : "message" }, note: containsCta ? "Structural container folded into the banner button area; no separate native container." : "Structural container folded into the banner content WYSIWYG; no separate native container." });
      continue;
    }
    diagnostics.push(nodeDiag("NOT_VERIFIED", "warning", `Node '${other.name}' (kind '${other.kind}', role '${other.role ?? "none"}') is outside this slice's composition table; not composed.`, other.nodeId));
    mapping.push({ ...entryBase, disposition: "gap", note: "Node outside the composition table; not composed." });
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
  // esc/escText are the shared module-level escapers (one definition for both section shapes).
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

  mapping.push({
    sourceNodeId: sectionNodeId,
    ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
    ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
    disposition: "mapped",
    target: { capabilityId: BANNER_ID, appearanceId: BANNER_APPEARANCE, nativeElement: "main", nativeField: "banner (row > banner container)" },
    note: "Section composed as native row(contained) > banner(poster) per the pinned declarations; the row provides the platform's standard top-level container.",
  });
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
  // The section-level mapping entry is pushed inside each shape composer (hero/two-column);
  // the loop only collects the emitted fragments.
  if (html) {
    sectionHtmlParts.push(html);
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
    ...(input.projection ? { projectionContentHash: stableHash(input.projection) } : {}),
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
