// Magento Page Builder compose adapter — deterministic native content composer (G3, issue #23).
//
// Contract: stdin = one ComposeInput JSON document (resources/schemas/cli/compose-input.schema.json),
// stdout = one ComposeOutput JSON payload (resources/schemas/cli/compose-output.schema.json).
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
//       50/50) and persist via the platform's own rehydratable style-block mechanism: each styled
//       element carries a deterministic data-pb-style key and a leading <style> block holds the
//       exact rules the Admin stage parses back into form fields (the Admin reader overwrites
//       inline style attributes with the absent data-<viewport>-style attribute — inline-only
//       widths produced the owner's NAN/12 column label, issue #25 correction). The section's
//       fixed height persists as the row inner min_height in the same block (declaration-backed).
//       Gaps (gutter, pair staggering, aspect ratios, mobile breakpoint) are NOT_VERIFIED
//       warnings + accountable mapping entries.
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
import { validateContract } from "../../../../core/schema-registry.js";
import { sortDiagnostics } from "../../../../core/canonical.js";
import type {
   Capability,
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../../core/types.js";

// ---- Input ----------------------------------------------------------------------------------
interface ManifestEntry {
   valueRef: string;
   kind: "text" | "media" | "link";
   text?: string;
   mediaUrl?: string;
   assetLabel?: string;
   linkUrl?: string;
   linkTarget?: string;
   buttonVariant?: "primary" | "secondary";
   note?: string;
}
interface ComposeInput {
   schemaVersion: number;
   profileId: string;
   platformId: string;
   registry: { source: { revisionId: string }; capabilities: Capability[] };
   bindings: {
      bindings: {
         sourceComponentId: string;
         variantConditions: { prop: string; op?: string; value: string }[];
      }[];
   };
   projection?: {
      assignments: {
         sourceLocator: string;
         role:
            | "background-media"
            | "content-lead"
            | "heading"
            | "body"
            | "cta"
            | "decoration"
            | "column-primary"
            | "column-secondary"
            | "inline-media"
            | "grid-column"
            | "grid-caption";
         reason: string;
      }[];
   };
   nodeIr: { nodes: NodeIRNode[]; rootNodeId: string };
   pageStructure: {
      sections: PageStructureSection[];
      source: { sourceId: string; revisionId: string; accessedAt: string };
   };
   content: { entries: ManifestEntry[] };
}

interface MappingEntry {
   sourceNodeId: string;
   sourceName?: string;
   sourceLocator?: string;
   disposition: "mapped" | "gap" | "decoration-merged" | "excluded" | "skipped";
   target?: {
      capabilityId: string;
      appearanceId: string;
      nativeElement?: string;
      nativeField?: string;
   };
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
if (!inputCheck.valid)
   fail(
      `stdin fails the compose-input contract: ${inputCheck.errors[0] ?? "unknown"}`,
   );

// ---- Canonical hashing (MUST equal the core's canonicalization, never a second variant) ------
// Canonical JSON = recursively key-sorted; volatile observation timestamps (generatedAt,
// retrievedAt, accessedAt) are stripped before hashing (same rule as src/core/canonical.ts).
function canonicalize(value: unknown): unknown {
   if (Array.isArray(value)) return value.map(canonicalize);
   if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort())
         out[k] = canonicalize((value as Record<string, unknown>)[k]);
      return out;
   }
   return value;
}
function stripVolatile(value: unknown): unknown {
   if (Array.isArray(value)) return value.map(stripVolatile);
   if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
         if (k === "generatedAt" || k === "retrievedAt" || k === "accessedAt")
            continue;
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
function canonicalVariantKey(b: {
   variantConditions: { prop: string; op?: string; value: string }[];
}): string {
   return JSON.stringify(
      [...b.variantConditions]
         .map((c) => ({ prop: c.prop, op: c.op ?? "eq", value: c.value }))
         .sort(
            (x, y) =>
               x.prop.localeCompare(y.prop) || x.value.localeCompare(y.value),
         ),
   );
}
function bindingMapPinHash(bindings: ComposeInput["bindings"]): string {
   const canonical = [...bindings.bindings].sort(
      (a, b) =>
         a.sourceComponentId.localeCompare(b.sourceComponentId) ||
         sha256Hex(canonicalVariantKey(a)).localeCompare(
            sha256Hex(canonicalVariantKey(b)),
         ),
   );
   return stableHash({
      ...(bindings as unknown as Record<string, unknown>),
      bindings: canonical,
   });
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
// Native CTA pair (issue #28): declarations verified on the pinned checkout before use — buttons
// (appearance "inline") allows exactly button-item children; button-item parents allow only
// buttons. The persisted shape mirrors the canonical editor-saved content in the target checkout.
const BUTTONS_ID = "magento_pagebuilder/buttons";
const BUTTONS_APPEARANCE = "inline";
const BUTTON_ITEM_ID = "magento_pagebuilder/button-item";
const BUTTON_ITEM_APPEARANCE = "default";

const diagnostics: Diagnostic[] = [];
const mapping: MappingEntry[] = [];
const nodeDiag = (
   code: string,
   severity: Diagnostic["severity"],
   message: string,
   nodeId: string,
): Diagnostic => ({
   code,
   severity,
   message,
   subject: { type: "node", id: nodeId },
});

// Registry gate: the target must be present, declared-native and enabled — no appearance guessing.
const capsById = new Map<string, Capability>();
for (const c of input.registry.capabilities)
   capsById.set(`${c.id}␟${c.appearanceId}`, c);
const requireCap = (id: string, appearanceId: string): boolean => {
   const cap = capsById.get(`${id}␟${appearanceId}`);
   if (!cap) {
      diagnostics.push({
         code: "UNSUPPORTED_CAPABILITY",
         severity: "error",
         message: `Capability '${id}#${appearanceId}' is absent from the pinned registry; this composer maps only declaration-backed native targets and refuses to guess.`,
         subject: { type: "capability", id },
      });
      return false;
   }
   if (cap.category !== "native") {
      diagnostics.push({
         code: "UNSUPPORTED_CAPABILITY",
         severity: "error",
         message: `Capability '${id}#${appearanceId}' is category '${cap.category}', not native; this slice composes native content only.`,
         subject: { type: "capability", id },
      });
      return false;
   }
   if (cap.availability !== "enabled") {
      diagnostics.push({
         code: "CAPABILITY_DISABLED",
         severity: "error",
         message: `Capability '${id}#${appearanceId}' is '${cap.availability}' in the pinned registry; composing into a non-enabled target is forbidden.`,
         subject: { type: "capability", id },
      });
      return false;
   }
   return true;
};
const registryReady =
   requireCap(ROW_ID, ROW_APPEARANCE) &&
   requireCap(BANNER_ID, BANNER_APPEARANCE);

// ---- Content manifest indexes ---------------------------------------------------------------
const textByRef = new Map<string, string>();
const mediaByRef = new Map<string, { mediaUrl: string; assetLabel?: string }>();
const linkByRef = new Map<
   string,
   { linkUrl: string; linkTarget?: string; variant?: "primary" | "secondary" }
>();
for (const e of input.content.entries) {
   if (e.kind === "text" && typeof e.text === "string")
      textByRef.set(e.valueRef, e.text);
   if (e.kind === "media" && typeof e.mediaUrl === "string")
      mediaByRef.set(e.valueRef, {
         mediaUrl: e.mediaUrl,
         ...(e.assetLabel ? { assetLabel: e.assetLabel } : {}),
      });
   if (e.kind === "link" && typeof e.linkUrl === "string")
      linkByRef.set(e.valueRef, {
         linkUrl: e.linkUrl,
         ...(e.linkTarget ? { linkTarget: e.linkTarget } : {}),
         ...(e.buttonVariant ? { variant: e.buttonVariant } : {}),
      });
}

// ---- Explicit semantic projection (optional; the recorded human decision) --------------------
type ComposerRole =
   | "background-media"
   | "content-lead"
   | "heading"
   | "body"
   | "cta"
   | "decoration"
   | "column-primary"
   | "column-secondary"
   | "inline-media"
   | "grid-column"
   | "grid-caption";
const roleByLocator = new Map<string, ComposerRole>();
for (const a of input.projection?.assignments ?? [])
   roleByLocator.set(a.sourceLocator, a.role);

// ---- NodeIR helpers -------------------------------------------------------------------------
const nodesById = new Map<string, NodeIRNode>();
for (const n of input.nodeIr.nodes) nodesById.set(n.nodeId, n);
const locatorOf = (n: NodeIRNode): string | null =>
   n.sourceEvidence?.[0]?.locator ?? null;
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
// Subtrees of explicitly projected CTA instances compose THROUGH their cta manifest entry (label)
// and the native button element (visual chrome); their descendants are accounted once, as
// "inside the composed CTA element" — recorded, never silently dropped, never double-counted.
const ctaSubtreeLocators = new Set<string>();
for (const [loc, role] of roleByLocator) {
   if (role !== "cta") continue;
   const rootId = nodeIdOfLocator.get(loc);
   if (!rootId) continue;
   walkSubtree(rootId, (n) => {
      const l = locatorOf(n);
      if (l) ctaSubtreeLocators.add(l);
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
   cta?: {
      nodeId: string;
      text: string;
      link?: { linkUrl: string; linkTarget?: string };
   };
   minHeight?: number;
}

const TEXT_ROLE_TABLE: Record<
   string,
   "contentLead" | "heading" | "body" | "cta"
> = {
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
const esc = (s: string): string =>
   s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
const escText = (s: string): string =>
   s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SEP = "\u241f"; // canonical separator (U+241F), same convention as the core docs/evidence/derivation ids

// Deterministic master-format style key (issue #25 NaN correction): the Admin stage rehydrates
// element styles EXCLUSIVELY from the `<style>` block keyed by data-pb-style (stage-builder
// convertToInlineStyles -> data-<viewport>-style -> configurable reader), never from inline
// style attributes (which the reader clobbers: `setAttribute("style", getAttribute("data-…-style"))`
// with a null fallback). Keys are 7-char CSS-ident-safe uppercase tokens ("P" + 6 hex of the
// source node id) — deterministic across runs, unique per node, the same shape the platform's
// own uniqueid keys take in stored content (real cms_page rows).
function pbStyleKey(nodeKeySource: string): string {
   return "P" + sha256Hex(nodeKeySource).slice(0, 6).toUpperCase();
}

// Deterministic auxiliary mapping id for composed structures that have no single source node
// (band/synthesized-complement containers): same 12-hex id space as derived node ids, namespaced
// by the "aux" key prefix so it cannot collide with source-derived ids.
function auxNodeId(nodeKeySource: string): string {
   return `n-${sha256Hex(`aux${SEP}${nodeKeySource}`).slice(0, 12)}`;
}

// ---- Shared element emit helpers (one definition for every section shape) --------------------
// The image/text bytes are exactly the shapes the G3/G4 shapes have always emitted (extracted
// verbatim so both-column and grid composers share one canonical markup); the buttons block is
// the platform's own declaration-backed pair (buttons appearance "inline" > button-item default,
// declarations verified on the pinned checkout before use) whose persisted shape mirrors the
// canonical editor-saved content in the target checkout (real cms_page: buttons container with
// data-same-width, button-item main keyed {display:inline-block}, link keyed {text-align:center},
// button_type css class on the link, virtual link attributes href/target/data-link-type).
interface TextRun {
   role: "content-lead" | "heading" | "body";
   text: string;
}
const imageElementHtml = (mediaUrl: string): string =>
   `<figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="${esc(mediaUrl)}" alt="" title="" data-element="desktop_image"></figure>`;
const textElementHtml = (runs: TextRun[]): string =>
   `<div data-content-type="text" data-appearance="default" data-element="main">${runs.map((run) => (run.role === "heading" ? `<h2>${escText(run.text)}</h2>` : `<p>${escText(run.text)}</p>`)).join("")}</div>`;
// A button composes ONLY with a manifest link entry (no invented targets, no empty-link shell —
// a CTA whose link is missing is an explicit gap, never an unlinked pseudo-button). The variant
// css class maps the manifest buttonVariant to the platform's own button_type classes; the Admin
// button_type field stays fully editable either way.
const buttonVariantClass = (
   variant: "primary" | "secondary" | undefined,
): string =>
   variant === "secondary"
      ? "pagebuilder-button-secondary"
      : "pagebuilder-button-primary";
function buttonsElementHtml(
   buttonsSectionNodeId: string,
   buttons: {
      keySource: string;
      label: string;
      linkUrl: string;
      linkTarget?: string;
      variant: "primary" | "secondary" | undefined;
   }[],
): string {
   const styleRules: string[] = [];
   const items = buttons.map((b) => {
      const mainKey = pbStyleKey(`${b.keySource}:button-item`);
      const linkKey = pbStyleKey(`${b.keySource}:button-link`);
      styleRules.push(
         `#html-body [data-pb-style=${mainKey}]{display:inline-block}`,
      );
      styleRules.push(
         `#html-body [data-pb-style=${linkKey}]{text-align:center}`,
      );
      const target = b.linkTarget
         ? ` target="${esc(b.linkTarget)}"`
         : ` target=""`;
      return `<div data-content-type="button-item" data-appearance="default" data-element="main" data-pb-style="${mainKey}"><a class="${buttonVariantClass(b.variant)}" href="${esc(b.linkUrl)}"${target} data-link-type="default" data-element="link" data-pb-style="${linkKey}"><span data-element="link_text">${escText(b.label)}</span></a></div>`;
   });
   return `<style>${styleRules.join("")}</style><div data-content-type="buttons" data-appearance="inline" data-same-width="false" data-element="main">${items.join("")}</div>`;
}

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
   | {
        kind: "image";
        nodeId: string;
        name: string;
        locator: string | null;
        media: { mediaUrl: string; assetLabel?: string };
        viaProjection: boolean;
        accountedByContainer: boolean;
     }
   | {
        kind: "buttons";
        nodeId: string;
        name: string;
        locator: string | null;
        buttons: {
           nodeId: string;
           name: string;
           locator: string | null;
           label: string;
           linkUrl: string;
           linkTarget?: string;
           variant: "primary" | "secondary" | undefined;
           viaProjection: boolean;
        }[];
     }
   | {
        kind: "text";
        runs: {
           role: "content-lead" | "heading" | "body";
           nodeId: string;
           name: string;
           locator: string | null;
           text: string;
           viaProjection: boolean;
        }[];
     };

function composeTwoColumnSection(
   section: PageStructureSection,
   sectionNodeId: string,
   primaryNode: NodeIRNode,
   secondaryNode: NodeIRNode,
): string | null {
   const sectionNode = nodesById.get(sectionNodeId) as NodeIRNode;
   const sectionLocator = locatorOf(sectionNode) ?? undefined;

   // Shape registry gate: every native target this shape emits must be present, declared-native
   // and enabled — no appearance guessing (the row gate is shared with the hero shape above).
   const shapeReady =
      requireCap(COLUMN_GROUP_ID, COLUMN_GROUP_APPEARANCE) &&
      requireCap(COLUMN_LINE_ID, COLUMN_LINE_APPEARANCE) &&
      requireCap(COLUMN_ID, COLUMN_APPEARANCE) &&
      requireCap(IMAGE_ID, IMAGE_APPEARANCE) &&
      requireCap(TEXT_ID, TEXT_APPEARANCE) &&
      requireCap(BUTTONS_ID, BUTTONS_APPEARANCE) &&
      requireCap(BUTTON_ITEM_ID, BUTTON_ITEM_APPEARANCE);
   if (!shapeReady) return null;

   // Column widths derive from the observed fixed-width constraints (rounded to integer
   // percents, clamped to 1..99); without constraints the platform's own equal-column default
   // applies — recorded, never inferred from source geometry the inventory does not carry.
   const fixedWidthOf = (n: NodeIRNode): number | null => {
      const c = n.layout.constraints.find(
         (x) => x.axis === "width" && x.type === "fixed",
      );
      const px = c ? Number(c.value) : NaN;
      return Number.isFinite(px) && px > 0 ? px : null;
   };
   const w1 = fixedWidthOf(primaryNode);
   const w2 = fixedWidthOf(secondaryNode);
   let primaryPct = 50;
   let secondaryPct = 50;
   if (w1 !== null && w2 !== null) {
      primaryPct = Math.min(
         99,
         Math.max(1, Math.round((w1 / (w1 + w2)) * 100)),
      );
      secondaryPct = 100 - primaryPct;
   } else {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' column slots carry no fixed-width constraints; widths fall back to the platform's own equal-column default (50/50) — recorded, not inferred.`,
            sectionNodeId,
         ),
      );
   }

   // Per-column content. Document-order walk; consecutive role-resolved texts merge into one
   // text WYSIWYG element at their position, consecutive CTAs merge into ONE buttons container;
   // each projected inline-media node becomes one image element. Everything else is accounted
   // explicitly (gap / excluded / decoration).
   const composeColumn = (
      columnNode: NodeIRNode,
      isPrimary: boolean,
   ): string => {
      const items: EmitItem[] = [];
      let pendingText: EmitItem | null = null;
      let pendingButtons: Extract<EmitItem, { kind: "buttons" }> | null = null;
      const flushText = (): void => {
         if (
            pendingText &&
            pendingText.kind === "text" &&
            pendingText.runs.length > 0
         )
            items.push(pendingText);
         pendingText = null;
      };
      const flushButtons = (): void => {
         if (
            pendingButtons &&
            pendingButtons.kind === "buttons" &&
            pendingButtons.buttons.length > 0
         )
            items.push(pendingButtons);
         pendingButtons = null;
      };
      const pushTextRun = (
         run: Extract<EmitItem, { kind: "text" }>["runs"][number],
      ): void => {
         if (pendingText && pendingText.kind === "text")
            pendingText.runs.push(run);
         else {
            flushButtons();
            pendingText = { kind: "text", runs: [run] };
         }
      };

      // The column container's own media entry first (the observed media slot frame IS the media;
      // its image composes as the column's first element, accounted by the container's mapping).
      const colLocator = locatorOf(columnNode);
      const ownMedia = colLocator ? mediaByRef.get(colLocator) : undefined;
      if (ownMedia) {
         flushText();
         flushButtons();
         items.push({
            kind: "image",
            nodeId: columnNode.nodeId,
            name: columnNode.name,
            locator: colLocator,
            media: ownMedia,
            viaProjection: false,
            accountedByContainer: true,
         });
      }

      walkSubtree(columnNode.nodeId, (node) => {
         if (node.visible === false) return;
         const loc = locatorOf(node);
         const entryBase = {
            sourceNodeId: node.nodeId,
            sourceName: node.name,
            ...(loc ? { sourceLocator: loc } : {}),
         };
         if (loc && roleByLocator.get(loc) === "decoration") {
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
            });
            return;
         }
         if (loc && excludedLocators.has(loc)) {
            flushText();
            flushButtons();
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            });
            return;
         }
         if (loc && ctaSubtreeLocators.has(loc)) {
            flushText();
            flushButtons();
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
            });
            return;
         }
         const role = resolveComposerRole(node);
         if (loc !== null && roleByLocator.get(loc) === "inline-media") {
            flushText();
            flushButtons();
            const media = loc ? mediaByRef.get(loc) : undefined;
            if (!media) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest media entry for projected inline-media node '${node.name}' (${loc ?? "no locator"}); no image element is composed — no asset URL is ever invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected inline-media without a manifest media entry; no image element composed.",
               });
               return;
            }
            items.push({
               kind: "image",
               nodeId: node.nodeId,
               name: node.name,
               locator: loc,
               media,
               viaProjection: true,
               accountedByContainer: false,
            });
            return;
         }
         if (role === "content-lead" || role === "heading" || role === "body") {
            const text = loc ? textByRef.get(loc) : undefined;
            if (text === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest text entry for '${node.name}' (${loc ?? "no locator"}); the ${role} field is left empty — no text is invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: `No manifest text entry for the ${role} field.`,
               });
               return;
            }
            pushTextRun({
               role,
               nodeId: node.nodeId,
               name: node.name,
               locator: loc,
               text,
               viaProjection:
                  loc !== null && roleByLocator.get(loc) !== undefined,
            });
            return;
         }
         if (role === "cta") {
            // Native landing (issue #28 extension): the declaration-backed buttons > button-item pair.
            // A button composes ONLY with both a manifest text entry (the label) and a manifest link
            // entry (the target) — anything less is an explicit gap, never an invented or unlinked
            // pseudo-button. The composed CTA instance's own subtree is accounted by the shared
            // ctaSubtreeLocators walk (recorded, never silently dropped, never double-counted).
            flushText();
            const label = loc ? textByRef.get(loc) : undefined;
            const link = loc ? linkByRef.get(loc) : undefined;
            if (label === undefined || link === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `CTA '${node.name}' lacks a manifest ${label === undefined ? "text (label)" : "link (target)"} entry; no button is composed — no label or link target is ever invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected CTA without a manifest label/link entry; no button composed.",
               });
            } else if (pendingButtons && pendingButtons.kind === "buttons") {
               pendingButtons.buttons.push({
                  nodeId: node.nodeId,
                  name: node.name,
                  locator: loc,
                  label,
                  linkUrl: link.linkUrl,
                  ...(link.linkTarget ? { linkTarget: link.linkTarget } : {}),
                  variant: link.variant,
                  viaProjection: true,
               });
            } else {
               flushButtons();
               pendingButtons = {
                  kind: "buttons",
                  nodeId: node.nodeId,
                  name: node.name,
                  locator: loc,
                  buttons: [
                     {
                        nodeId: node.nodeId,
                        name: node.name,
                        locator: loc,
                        label,
                        linkUrl: link.linkUrl,
                        ...(link.linkTarget
                           ? { linkTarget: link.linkTarget }
                           : {}),
                        variant: link.variant,
                        viaProjection: true,
                     },
                  ],
               };
            }
            mapping.push({
               ...entryBase,
               disposition:
                  label !== undefined && link !== undefined ? "mapped" : "gap",
               ...(label !== undefined && link !== undefined
                  ? {
                       target: {
                          capabilityId: BUTTON_ITEM_ID,
                          appearanceId: BUTTON_ITEM_APPEARANCE,
                          nativeElement: "button-item",
                          nativeField: "button_text + link (button_link)",
                       },
                    }
                  : {}),
               note:
                  label !== undefined && link !== undefined
                     ? `Explicitly projected CTA composed as a native button-item inside one buttons container (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}${link.linkTarget ? `, target ${link.linkTarget}` : ""}); the observed per-button visual styling (fill, radius, icon) is the theme's button CSS, not a composed field.`
                     : "Projected CTA without a manifest label/link entry; no button composed.",
            });
            return;
         }
         if (role === "grid-column" || role === "grid-caption") {
            flushText();
            flushButtons();
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Grid role '${role}' on '${node.name}' is only meaningful inside the column-grid shape; not composed here.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: `Projected ${role} outside the column-grid composition table; not composed.`,
            });
            return;
         }
         flushText();
         flushButtons();
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the two-column composition table; not composed.`,
               node.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Node outside the two-column composition table; not composed.",
         });
      });
      flushText();
      flushButtons();

      const html = items
         .map((item) => {
            if (item.kind === "image") {
               if (!item.accountedByContainer) {
                  mapping.push({
                     sourceNodeId: item.nodeId,
                     sourceName: item.name,
                     ...(item.locator ? { sourceLocator: item.locator } : {}),
                     disposition: "mapped",
                     target: {
                        capabilityId: IMAGE_ID,
                        appearanceId: IMAGE_APPEARANCE,
                        nativeElement: "image",
                        nativeField: "desktop_image (src)",
                     },
                     note: `Explicitly projected media slot composed as a native image element${item.media.assetLabel ? ` (${item.media.assetLabel})` : ""}; the observed side-by-side pairing of detail media is not declaration-backed and composes stacked — see the section's fidelity warnings.`,
                  });
               }
               return imageElementHtml(item.media.mediaUrl);
            }
            if (item.kind === "buttons") {
               for (const b of item.buttons) {
                  // The per-CTA mapping entry was already pushed at detection time; this emission-level
                  // record covers the shared buttons container landing.
               }
               mapping.push({
                  sourceNodeId: item.nodeId,
                  sourceName: item.name,
                  ...(item.locator ? { sourceLocator: item.locator } : {}),
                  disposition: "mapped",
                  target: {
                     capabilityId: BUTTONS_ID,
                     appearanceId: BUTTONS_APPEARANCE,
                     nativeElement: "buttons",
                     nativeField: `${item.buttons.length} button-item child(ren)`,
                  },
                  note: `${item.buttons.length} projected CTA(s) composed as one native buttons (inline) container with button-item children; consecutive CTAs merge into one container, document order preserved.`,
               });
               return buttonsElementHtml(
                  item.nodeId,
                  item.buttons.map((b) => ({
                     keySource: b.nodeId,
                     label: b.label,
                     linkUrl: b.linkUrl,
                     ...(b.linkTarget ? { linkTarget: b.linkTarget } : {}),
                     variant: b.variant,
                  })),
               );
            }
            for (const run of item.runs) {
               mapping.push({
                  sourceNodeId: run.nodeId,
                  sourceName: run.name,
                  ...(run.locator ? { sourceLocator: run.locator } : {}),
                  disposition: "mapped",
                  target: {
                     capabilityId: TEXT_ID,
                     appearanceId: TEXT_APPEARANCE,
                     nativeElement: "text",
                     nativeField: "content (WYSIWYG HTML)",
                  },
                  note: `${run.viaProjection ? "Explicitly projected " : ""}text folded into the column text WYSIWYG field as ${run.role === "heading" ? "<h2>" : "<p>"}${item.runs.length > 1 ? " (consecutive texts merged into one field, document order)" : ""}; standalone per-field styling is not preserved (single WYSIWYG field).`,
               });
            }
            return textElementHtml(item.runs);
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
         ...(columnLanded
            ? {
                 target: {
                    capabilityId: COLUMN_ID,
                    appearanceId: COLUMN_APPEARANCE,
                    nativeElement: isPrimary
                       ? "column (primary)"
                       : "column (secondary)",
                    nativeField: ownMedia
                       ? "column children (own media slot -> image desktop_image src)"
                       : "column children",
                 },
              }
            : {}),
         note: columnLanded
            ? `${isPrimary ? "Primary" : "Secondary"} slot composed as the ${isPrimary ? "left" : "right"} native column (full-height)${ownMedia ? "; the slot's own media fill composes as the column's image element" : "; no manifest media entry on the slot frame itself"}.`
            : `${isPrimary ? "Primary" : "Secondary"} slot carries no manifest media entry and no composable descendants; only the empty native column shell is emitted structurally — the slot's media is NOT composed.`,
      });
      if (!columnLanded) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `Projected ${isPrimary ? "column-primary" : "column-secondary"} slot '${columnNode.name}' resolved to zero content elements (no own media entry, no composable descendants); an empty native column shell is emitted — nothing invented.`,
               columnNode.nodeId,
            ),
         );
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
         if (
            loc &&
            (roleByLocator.get(loc) === "inline-media" || mediaByRef.has(loc))
         )
            out.push(n);
      });
      return out;
   };
   for (const [label, columnNode] of [
      ["primary", primaryNode],
      ["secondary", secondaryNode],
   ] as const) {
      const imgs = imagesIn(columnNode);
      if (imgs.length > 1) {
         const ys = [
            ...new Set(
               imgs
                  .map((n) =>
                     n.layout.constraints.find(
                        (c) => c.axis === "y" && c.type === "fixed",
                     ),
                  )
                  .map((c) => (c ? Number(c.value) : NaN))
                  .filter((v) => Number.isFinite(v)),
            ),
         ];
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `${label} column of '${section.name}' carries ${imgs.length} observed media slots; they compose as stacked native image elements — the observed side-by-side arrangement is not declaration-backed (a column-group nested inside a column violates the pinned parents/children policies)${ys.length > 1 ? ", and the observed vertical staggering of the pair is not a native field" : ""}. Recorded as a fidelity gap, never custom CSS.`,
               sectionNodeId,
            ),
         );
      }
   }
   const xOf = (n: NodeIRNode): number | null => {
      const c = n.layout.constraints.find(
         (x) => x.axis === "x" && x.type === "fixed",
      );
      const px = c ? Number(c.value) : NaN;
      return Number.isFinite(px) && px > 0 ? px : null;
   };
   const x1 = xOf(primaryNode);
   const x2 = xOf(secondaryNode);
   if (x1 !== null && x2 !== null && w1 !== null && x2 > x1 + w1) {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `The observed ${x2 - (x1 + w1)}px gutter between the two columns of '${section.name}' is not composed — native columns carry no gutter field (the attested inline widths approximate the observed proportions at ${primaryPct}/${secondaryPct}).`,
            sectionNodeId,
         ),
      );
   }
   if (imagesIn(primaryNode).length + imagesIn(secondaryNode).length > 0) {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Observed media aspect ratios in '${section.name}' are not enforced by the native image element (natural aspect at column width; no native aspect/crop field); the section's fixed height persists only as the row min-height.`,
            sectionNodeId,
         ),
      );
   }

   // Section-level height: the row inner min_height (declaration-backed; same policy as the hero
   // shape's overlay min-height).
   const heightConstraint = section.layout.constraints.find(
      (c) => c.axis === "height" && c.type === "fixed",
   );
   let rowMinHeight: number | undefined;
   if (heightConstraint) {
      const px = Number(heightConstraint.value);
      if (Number.isFinite(px) && px > 0) rowMinHeight = px;
      else
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`,
               sectionNodeId,
            ),
         );
   } else {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`,
            sectionNodeId,
         ),
      );
   }

   // ---- Emit (fixed attribute order; mirrors the platform's own persisted master format) -------
   // Styles persist via the platform's own master-format style-block mechanism (issue #25 NaN
   // correction): every element whose style the composition sets carries a deterministic
   // data-pb-style key, and a leading <style> block holds the exact rehydratable rules the
   // Admin stage parses back into form fields (and the storefront applies). Inline style
   // attributes are NOT emitted — the Admin reader overwrites them with the (absent)
   // data-<viewport>-style attribute, which is what produced the owner's NAN/12 column label.
   // Rule bodies mirror the canonical editor-saved bodies for these element types in the
   // target checkout's stored content (column-line {display:flex;width:100%}; column
   // {justify-content:flex-start;display:flex;flex-direction:column;width:<pct>%;align-self:stretch}).
   const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
   const lineKey = pbStyleKey(`${sectionNodeId}:line`);
   const primaryKey = pbStyleKey(primaryNode.nodeId);
   const secondaryKey = pbStyleKey(secondaryNode.nodeId);
   const styleRules: string[] = [];
   if (rowMinHeight !== undefined)
      styleRules.push(
         `#html-body [data-pb-style=${innerKey}]{min-height:${rowMinHeight}px}`,
      );
   styleRules.push(
      `#html-body [data-pb-style=${lineKey}]{display:flex;width:100%}`,
   );
   styleRules.push(
      `#html-body [data-pb-style=${primaryKey}]{justify-content:flex-start;display:flex;flex-direction:column;width:${primaryPct}%;align-self:stretch}`,
   );
   styleRules.push(
      `#html-body [data-pb-style=${secondaryKey}]{justify-content:flex-start;display:flex;flex-direction:column;width:${secondaryPct}%;align-self:stretch}`,
   );
   const styleBlock = `<style>${styleRules.join("")}</style>`;
   mapping.push({
      sourceNodeId: sectionNodeId,
      ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
      ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
      disposition: "mapped",
      target: {
         capabilityId: ROW_ID,
         appearanceId: ROW_APPEARANCE,
         nativeElement: "main",
         nativeField:
            "row(contained) > column-group(default) > column-line > column(full-height) x2",
      },
      note: `Section composed as the declaration-backed two-column chain; column-line is the mandated bridge; observed slot proportions${w1 !== null && w2 !== null ? ` (${w1}:${w2})` : ""} simplified to ${primaryPct}/${secondaryPct} persisted via the platform's rehydratable style-block mechanism (deterministic data-pb-style keys); mobile breakpoint not composed.`,
   });
   return (
      styleBlock +
      `<div data-content-type="row" data-appearance="contained" data-element="main">` +
      `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner" data-pb-style="${innerKey}">` +
      `<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">` +
      `<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="${lineKey}">` +
      `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${primaryKey}">` +
      primaryHtml +
      `</div>` +
      `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${secondaryKey}">` +
      secondaryHtml +
      `</div>` +
      `</div>` +
      `</div>` +
      `</div>` +
      `</div>`
   );
}

// ---- Issue #28: absolute-geometry + percent helpers (shared by the column-grid shape) --------
// Absolute offsets are the deterministic sum of the observed fixed x/y constraints up the
// inventoried ancestor chain (every constraint in this pipeline's snapshots is fixed); any
// missing/non-numeric link yields null and the affected rule records it, never guesses.
function absOffsetOf(node: NodeIRNode, axis: "x" | "y"): number | null {
   let value = 0;
   let cur: NodeIRNode | undefined = node;
   let guard = 0;
   while (cur && guard++ < 256) {
      const c = cur.layout.constraints.find(
         (x) => x.axis === axis && x.type === "fixed",
      );
      const num = c ? Number(c.value) : NaN;
      if (!Number.isFinite(num)) return null;
      value += num;
      cur = cur.parentNodeId ? nodesById.get(cur.parentNodeId) : undefined;
   }
   return value;
}
function fixedOf(node: NodeIRNode, axis: "width" | "height"): number | null {
   const c = node.layout.constraints.find(
      (x) => x.axis === axis && x.type === "fixed",
   );
   const px = c ? Number(c.value) : NaN;
   return Number.isFinite(px) && px > 0 ? px : null;
}
// Integer percent split (largest remainder, deterministic; tie -> lower index). Sums to exactly 100.
function percentSplit(widths: number[]): number[] {
   const total = widths.reduce((a, b) => a + b, 0);
   if (!(total > 0))
      return widths.map(() => Math.floor(100 / Math.max(1, widths.length)));
   const exact = widths.map((w) => (w / total) * 100);
   const floors = exact.map((p) => Math.floor(p));
   let leftover = 100 - floors.reduce((a, b) => a + b, 0);
   const order = exact
      .map((p, i) => ({ i, frac: p - Math.floor(p) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
   for (const { i } of order) {
      if (leftover <= 0) break;
      floors[i] += 1;
      leftover -= 1;
   }
   return floors;
}

// ---- Issue #28: text-band composition (row > text WYSIWYG [+ buttons]) -----------------------
// A band section carries role-resolved text/CTA content but NO background media and NO projected
// column roles. Guarded eligibility (computed by the dispatcher): any direct-child container that
// carries a manifest media entry, or any visible descendant that is not (a projected CTA, inside
// a projected-CTA subtree, projected decoration, or inside an unprojected instance's subtree)
// BLOCKS the band — an unprojected two-column or media section honestly skips instead of silently
// losing its media or its column structure. Emission: row(contained) > inner(min-height style
// block) > one text (default) WYSIWYG with the role runs in document order > one buttons
// container when CTAs resolve. Everything in scope is accounted exactly like the other shapes.
function composeTextBandSection(
   section: PageStructureSection,
   sectionNodeId: string,
): string | null {
   const sectionNode = nodesById.get(sectionNodeId) as NodeIRNode;
   const sectionLocator = locatorOf(sectionNode) ?? undefined;
   const inScope: NodeIRNode[] = [];
   walkSubtree(sectionNodeId, (node) => {
      if (node.visible !== false) inScope.push(node);
   });
   const roleRuns: {
      role: "content-lead" | "heading" | "body";
      node: NodeIRNode;
   }[] = [];
   const ctaNodes: NodeIRNode[] = [];
   for (const node of inScope) {
      const loc = locatorOf(node);
      if (loc && excludedLocators.has(loc)) continue;
      if (loc && ctaSubtreeLocators.has(loc)) continue;
      const role = resolveComposerRole(node);
      if (role === "content-lead" || role === "heading" || role === "body")
         roleRuns.push({ role, node });
      else if (role === "cta") ctaNodes.push(node);
   }
   if (roleRuns.length === 0 && ctaNodes.length === 0) return null;

   const contentFragments: string[] = [];
   const bandRuns: TextRun[] = [];
   for (const run of roleRuns) {
      const loc = locatorOf(run.node);
      const text = loc ? textByRef.get(loc) : undefined;
      const entryBase = {
         sourceNodeId: run.node.nodeId,
         sourceName: run.node.name,
         ...(loc ? { sourceLocator: loc } : {}),
      };
      if (text === undefined) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `No content-manifest text entry for '${run.node.name}' (${loc ?? "no locator"}); the ${run.role} field is left empty — no text is invented.`,
               run.node.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: `No manifest text entry for the ${run.role} field.`,
         });
         continue;
      }
      bandRuns.push({ role: run.role, text });
      const as = run.role === "heading" ? "<h2>" : "<p>";
      mapping.push({
         ...entryBase,
         disposition: "mapped",
         target: {
            capabilityId: TEXT_ID,
            appearanceId: TEXT_APPEARANCE,
            nativeElement: "text",
            nativeField: "content (WYSIWYG HTML)",
         },
         note: `Explicitly projected text folded into the band text WYSIWYG field as ${as} (document order); standalone per-field styling is not preserved (single WYSIWYG field).`,
      });
   }
   if (bandRuns.length > 0) contentFragments.push(textElementHtml(bandRuns));

   const buttonSpecs: {
      keySource: string;
      label: string;
      linkUrl: string;
      linkTarget?: string;
      variant: "primary" | "secondary" | undefined;
   }[] = [];
   for (const cta of ctaNodes) {
      const loc = locatorOf(cta);
      const label = loc ? textByRef.get(loc) : undefined;
      const link = loc ? linkByRef.get(loc) : undefined;
      const entryBase = {
         sourceNodeId: cta.nodeId,
         sourceName: cta.name,
         ...(loc ? { sourceLocator: loc } : {}),
      };
      if (label === undefined || link === undefined) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `CTA '${cta.name}' lacks a manifest ${label === undefined ? "text (label)" : "link (target)"} entry; no button is composed — no label or link target is ever invented.`,
               cta.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Projected CTA without a manifest label/link entry; no button composed.",
         });
      } else {
         buttonSpecs.push({
            keySource: cta.nodeId,
            label,
            linkUrl: link.linkUrl,
            ...(link.linkTarget ? { linkTarget: link.linkTarget } : {}),
            variant: link.variant,
         });
         mapping.push({
            ...entryBase,
            disposition: "mapped",
            target: {
               capabilityId: BUTTON_ITEM_ID,
               appearanceId: BUTTON_ITEM_APPEARANCE,
               nativeElement: "button-item",
               nativeField: "button_text + link (button_link)",
            },
            note: `Explicitly projected CTA composed as a native button-item inside the band buttons container (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}); the observed per-button visual styling (fill, radius, icon) is the theme's button CSS, not a composed field.`,
         });
      }
   }
   if (buttonSpecs.length > 0)
      contentFragments.push(
         buttonsElementHtml(`${sectionNodeId}:band-buttons`, buttonSpecs),
      );

   // Every other in-scope node gets its explicit, accountable treatment (same policy as hero).
   const accounted = new Set<string>([
      ...roleRuns.map((r) => r.node.nodeId),
      ...ctaNodes.map((c) => c.nodeId),
   ]);
   for (const other of inScope) {
      if (accounted.has(other.nodeId)) continue;
      const otherLocator = locatorOf(other);
      const entryBase = {
         sourceNodeId: other.nodeId,
         sourceName: other.name,
         ...(otherLocator ? { sourceLocator: otherLocator } : {}),
      };
      if (otherLocator && roleByLocator.get(otherLocator) === "decoration") {
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
               other.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
         });
         continue;
      }
      if (otherLocator && excludedLocators.has(otherLocator)) {
         mapping.push({
            ...entryBase,
            disposition: "excluded",
            note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
         });
         continue;
      }
      if (otherLocator && ctaSubtreeLocators.has(otherLocator)) {
         mapping.push({
            ...entryBase,
            disposition: "excluded",
            note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
         });
         continue;
      }
      if (other.role === "DECOR" || other.kind === "icon") {
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
               other.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Decoration without a native equivalent; explicitly excluded (not silently dropped).",
         });
         continue;
      }
      if (other.role === "SLOT" && other.kind === "container") {
         mapping.push({
            ...entryBase,
            disposition: "mapped",
            target: {
               capabilityId: TEXT_ID,
               appearanceId: TEXT_APPEARANCE,
               nativeElement: "text",
               nativeField: "content (WYSIWYG HTML)",
            },
            note: "Structural container folded into the band content; its composable descendants compose in document order; no separate native container.",
         });
         continue;
      }
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Node '${other.name}' (kind '${other.kind}', role '${other.role ?? "none"}') has no native Page Builder equivalent in the band shape; not composed.`,
            other.nodeId,
         ),
      );
      mapping.push({
         ...entryBase,
         disposition: "gap",
         note: "Node outside the band composition table (e.g. a form input — no native Page Builder form field exists); not composed.",
      });
   }

   const heightConstraint = section.layout.constraints.find(
      (c) => c.axis === "height" && c.type === "fixed",
   );
   let rowMinHeight: number | undefined;
   if (heightConstraint) {
      const px = Number(heightConstraint.value);
      if (Number.isFinite(px) && px > 0) rowMinHeight = px;
      else
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`,
               sectionNodeId,
            ),
         );
   } else {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`,
            sectionNodeId,
         ),
      );
   }

   const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
   const styleRules: string[] = [];
   if (rowMinHeight !== undefined)
      styleRules.push(
         `#html-body [data-pb-style=${innerKey}]{min-height:${rowMinHeight}px}`,
      );
   const styleBlock =
      styleRules.length > 0 ? `<style>${styleRules.join("")}</style>` : "";
   mapping.push({
      sourceNodeId: sectionNodeId,
      ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
      ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
      disposition: "mapped",
      target: {
         capabilityId: ROW_ID,
         appearanceId: ROW_APPEARANCE,
         nativeElement: "main",
         nativeField:
            "row(contained) > text(default) WYSIWYG [+ buttons(inline)]",
      },
      note: "Band section composed as a contained row carrying one text WYSIWYG (role runs in document order) and, when CTAs resolve, one native buttons container; the section's fixed height persists as the row inner min-height via the platform's rehydratable style-block mechanism; mobile breakpoint not composed.",
   });
   return (
      styleBlock +
      `<div data-content-type="row" data-appearance="contained" data-element="main">` +
      `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"${rowMinHeight !== undefined ? ` data-pb-style="${innerKey}"` : ""}>` +
      contentFragments.join("") +
      `</div>` +
      `</div>`
   );
}

// ---- Issue #28: column-grid composition ------------------------------------------------------
// The declaration-backed generalization of the G4 two-column chain: row(contained) > [leading
// text band] > column-group(default) > column-line(s) > column(full-height) xN > [trailing text
// band]. Two deterministic rules, decided purely from the explicit projection:
//   Rule B ("split"): exactly ONE projected grid-column in the section — the explicit slot
//     becomes one native column; the section's remaining loose composable content composes, in
//     its own document order, as ONE synthesized complement column (full-width loose text
//     clusters ABOVE the explicit column compose as a leading text band instead).
//   Rule A ("grid"): two or more projected grid-columns group into lines by their observed
//     common parent + vertical overlap bands (absolute y), columns ordered by absolute x; loose
//     role-resolved texts ABOVE the first line compose as a leading text band, everything else
//     loose composes as a trailing text band; grid-caption texts compose inside the column whose
//     absolute x-range geometrically contains them, appended after that column's own content.
// Column widths are the observed fixed widths apportioned to integer percents (largest remainder,
// sum exactly 100; Rule B complement = the observed content width minus the explicit slot).
// Styles persist via the platform's rehydratable style-block mechanism (issue #25 correction
// class): deterministic data-pb-style keys + a leading <style> block; no inline style attributes.
// Fidelity limits (gutters, stacked side-by-side pairs, aspect ratios, overlay styling, mobile
// breakpoint) come back as explicit NOT_VERIFIED warnings + accountable mapping entries.
const GRID_TABLE_LABEL = "column-grid";
interface GridContent {
   html: string;
   landed: boolean;
}
function composeColumnGridSection(
   section: PageStructureSection,
   sectionNodeId: string,
   explicitColumns: NodeIRNode[],
): string | null {
   const sectionNode = nodesById.get(sectionNodeId) as NodeIRNode;
   const sectionLocator = locatorOf(sectionNode) ?? undefined;
   const shapeReady =
      requireCap(ROW_ID, ROW_APPEARANCE) &&
      requireCap(COLUMN_GROUP_ID, COLUMN_GROUP_APPEARANCE) &&
      requireCap(COLUMN_LINE_ID, COLUMN_LINE_APPEARANCE) &&
      requireCap(COLUMN_ID, COLUMN_APPEARANCE) &&
      requireCap(IMAGE_ID, IMAGE_APPEARANCE) &&
      requireCap(TEXT_ID, TEXT_APPEARANCE) &&
      requireCap(BUTTONS_ID, BUTTONS_APPEARANCE) &&
      requireCap(BUTTON_ITEM_ID, BUTTON_ITEM_APPEARANCE);
   if (!shapeReady) return null;

   // Absolute offsets first (needed by caption assignment and line grouping).
   const colYCache = new Map<string, number>();
   for (const col of explicitColumns) {
      const y = absOffsetOf(col, "y");
      if (y !== null) colYCache.set(col.nodeId, y);
   }
   const colYAbs = (col: NodeIRNode): number =>
      colYCache.get(col.nodeId) ?? absOffsetOf(col, "y") ?? 0;
   const colXAbs = (col: NodeIRNode): number => absOffsetOf(col, "x") ?? 0;

   // Caption assignment (explicit grid-caption projections): the column whose absolute x-range
   // geometrically contains the caption (nearest below-or-overlapping vertical position; ties ->
   // leftmost). Unassignable captions are explicit gaps, never guessed into a column.
   const captions: NodeIRNode[] = [];
   walkSubtree(sectionNodeId, (node) => {
      if (node.visible === false) return;
      const loc = locatorOf(node);
      if (loc && roleByLocator.get(loc) === "grid-caption") captions.push(node);
   });
   const captionsByColumn = new Map<string, NodeIRNode[]>();
   for (const caption of captions) {
      const capX = absOffsetOf(caption, "x");
      const capY = absOffsetOf(caption, "y");
      const capW = fixedOf(caption, "width");
      let best: { node: NodeIRNode; distance: number; x: number } | null = null;
      for (const col of explicitColumns) {
         const colX = colXAbs(col);
         const colW = fixedOf(col, "width");
         const colY = colYAbs(col);
         if (capX === null || capY === null || capW === null || colW === null)
            continue;
         if (!(capX + capW > colX && capX < colX + colW)) continue;
         const distance = Math.max(0, capY - colY);
         if (
            best === null ||
            distance < best.distance ||
            (distance === best.distance && colX < best.x)
         )
            best = { node: col, distance, x: colX };
      }
      if (best) {
         const list = captionsByColumn.get(best.node.nodeId) ?? [];
         list.push(caption);
         captionsByColumn.set(best.node.nodeId, list);
      } else {
         const loc = locatorOf(caption);
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Projected grid-caption '${caption.name}' overlaps no projected grid-column's absolute x-range; not composed.`,
               caption.nodeId,
            ),
         );
         mapping.push({
            sourceNodeId: caption.nodeId,
            sourceName: caption.name,
            ...(loc ? { sourceLocator: loc } : {}),
            disposition: "gap",
            note: "Projected grid-caption without a geometrically containing column; not composed.",
         });
      }
   }

   // Column content: the same composition table as the two-column shape (own media -> image,
   // inline-media -> image, text roles -> one WYSIWYG in document order, CTA -> one buttons
   // container), plus appended grid-caption runs.
   const composeGridColumn = (columnNode: NodeIRNode): GridContent => {
      const items: EmitItem[] = [];
      let pendingText: EmitItem | null = null;
      let pendingButtons: Extract<EmitItem, { kind: "buttons" }> | null = null;
      const flushText = (): void => {
         if (
            pendingText &&
            pendingText.kind === "text" &&
            pendingText.runs.length > 0
         )
            items.push(pendingText);
         pendingText = null;
      };
      const flushButtons = (): void => {
         if (
            pendingButtons &&
            pendingButtons.kind === "buttons" &&
            pendingButtons.buttons.length > 0
         )
            items.push(pendingButtons);
         pendingButtons = null;
      };
      const pushTextRun = (
         run: Extract<EmitItem, { kind: "text" }>["runs"][number],
      ): void => {
         if (pendingText && pendingText.kind === "text")
            pendingText.runs.push(run);
         else {
            flushButtons();
            pendingText = { kind: "text", runs: [run] };
         }
      };
      const colLocator = locatorOf(columnNode);
      const ownMedia = colLocator ? mediaByRef.get(colLocator) : undefined;
      if (ownMedia) {
         flushText();
         flushButtons();
         items.push({
            kind: "image",
            nodeId: columnNode.nodeId,
            name: columnNode.name,
            locator: colLocator,
            media: ownMedia,
            viaProjection: false,
            accountedByContainer: true,
         });
      }
      walkSubtree(columnNode.nodeId, (node) => {
         if (node.visible === false) return;
         const loc = locatorOf(node);
         const entryBase = {
            sourceNodeId: node.nodeId,
            sourceName: node.name,
            ...(loc ? { sourceLocator: loc } : {}),
         };
         if (loc && roleByLocator.get(loc) === "decoration") {
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
            });
            return;
         }
         if (loc && excludedLocators.has(loc)) {
            flushText();
            flushButtons();
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            });
            return;
         }
         if (loc && ctaSubtreeLocators.has(loc)) {
            flushText();
            flushButtons();
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
            });
            return;
         }
         const role = resolveComposerRole(node);
         if (loc !== null && roleByLocator.get(loc) === "inline-media") {
            flushText();
            flushButtons();
            const media = loc ? mediaByRef.get(loc) : undefined;
            if (!media) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest media entry for projected inline-media node '${node.name}' (${loc ?? "no locator"}); no image element is composed — no asset URL is ever invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected inline-media without a manifest media entry; no image element composed.",
               });
               return;
            }
            items.push({
               kind: "image",
               nodeId: node.nodeId,
               name: node.name,
               locator: loc,
               media,
               viaProjection: true,
               accountedByContainer: false,
            });
            return;
         }
         if (role === "content-lead" || role === "heading" || role === "body") {
            const text = loc ? textByRef.get(loc) : undefined;
            if (text === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest text entry for '${node.name}' (${loc ?? "no locator"}); the ${role} field is left empty — no text is invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: `No manifest text entry for the ${role} field.`,
               });
               return;
            }
            pushTextRun({
               role,
               nodeId: node.nodeId,
               name: node.name,
               locator: loc,
               text,
               viaProjection:
                  loc !== null && roleByLocator.get(loc) !== undefined,
            });
            return;
         }
         if (role === "cta") {
            flushText();
            const label = loc ? textByRef.get(loc) : undefined;
            const link = loc ? linkByRef.get(loc) : undefined;
            if (label === undefined || link === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `CTA '${node.name}' lacks a manifest ${label === undefined ? "text (label)" : "link (target)"} entry; no button is composed — no label or link target is ever invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected CTA without a manifest label/link entry; no button composed.",
               });
            } else if (pendingButtons && pendingButtons.kind === "buttons") {
               pendingButtons.buttons.push({
                  nodeId: node.nodeId,
                  name: node.name,
                  locator: loc,
                  label,
                  linkUrl: link.linkUrl,
                  ...(link.linkTarget ? { linkTarget: link.linkTarget } : {}),
                  variant: link.variant,
                  viaProjection: true,
               });
            } else {
               flushButtons();
               pendingButtons = {
                  kind: "buttons",
                  nodeId: node.nodeId,
                  name: node.name,
                  locator: loc,
                  buttons: [
                     {
                        nodeId: node.nodeId,
                        name: node.name,
                        locator: loc,
                        label,
                        linkUrl: link.linkUrl,
                        ...(link.linkTarget
                           ? { linkTarget: link.linkTarget }
                           : {}),
                        variant: link.variant,
                        viaProjection: true,
                     },
                  ],
               };
            }
            mapping.push({
               ...entryBase,
               disposition:
                  label !== undefined && link !== undefined ? "mapped" : "gap",
               ...(label !== undefined && link !== undefined
                  ? {
                       target: {
                          capabilityId: BUTTON_ITEM_ID,
                          appearanceId: BUTTON_ITEM_APPEARANCE,
                          nativeElement: "button-item",
                          nativeField: "button_text + link (button_link)",
                       },
                    }
                  : {}),
               note:
                  label !== undefined && link !== undefined
                     ? `Explicitly projected CTA composed as a native button-item inside one buttons container (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}${link.linkTarget ? `, target ${link.linkTarget}` : ""}); the observed per-button visual styling (fill, radius, icon) is the theme's button CSS, not a composed field.`
                     : "Projected CTA without a manifest label/link entry; no button composed.",
            });
            return;
         }
         if (role === "grid-column" || role === "grid-caption") {
            flushText();
            flushButtons();
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Nested grid role '${role}' on '${node.name}' is not declaration-backed (a column-group cannot nest inside a column); not composed.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: `Nested projected ${role} inside a column; the pinned parents/children policies forbid nesting a column-group inside a column, so this composes nothing (recorded, never approximated).`,
            });
            return;
         }
         if (node.kind === "container" || node.kind === "component") {
            // Transparent structural fold inside a projected column: the container itself has no
            // native box (its composable descendants compose in document order); one fold entry.
            flushText();
            flushButtons();
            mapping.push({
               ...entryBase,
               disposition: "mapped",
               target: {
                  capabilityId: COLUMN_ID,
                  appearanceId: COLUMN_APPEARANCE,
                  nativeElement: "column (full-height)",
                  nativeField: "column children (container folded)",
               },
               note: "Structural container folded into its native column; its composable descendants compose in document order; no separate native container.",
            });
            return;
         }
         flushText();
         flushButtons();
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
               node.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: `Node outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
         });
      });
      flushText();
      flushButtons();
      // Appended grid-caption runs (explicit projections; geometric containment decided above).
      const captionList = captionsByColumn.get(columnNode.nodeId) ?? [];
      if (captionList.length > 0) {
         const runs: Extract<EmitItem, { kind: "text" }>["runs"] = [];
         for (const caption of captionList) {
            const loc = locatorOf(caption);
            const text = loc ? textByRef.get(loc) : undefined;
            const entryBase = {
               sourceNodeId: caption.nodeId,
               sourceName: caption.name,
               ...(loc ? { sourceLocator: loc } : {}),
            };
            if (text === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest text entry for grid-caption '${caption.name}' (${loc ?? "no locator"}); the caption is left empty — no text is invented.`,
                     caption.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "No manifest text entry for the grid-caption.",
               });
               continue;
            }
            runs.push({
               role: "body",
               nodeId: caption.nodeId,
               name: caption.name,
               locator: loc,
               text,
               viaProjection: true,
            });
         }
         if (runs.length > 0) items.push({ kind: "text", runs });
      }

      const html = items
         .map((item) => {
            if (item.kind === "image") {
               if (!item.accountedByContainer) {
                  mapping.push({
                     sourceNodeId: item.nodeId,
                     sourceName: item.name,
                     ...(item.locator ? { sourceLocator: item.locator } : {}),
                     disposition: "mapped",
                     target: {
                        capabilityId: IMAGE_ID,
                        appearanceId: IMAGE_APPEARANCE,
                        nativeElement: "image",
                        nativeField: "desktop_image (src)",
                     },
                     note: `Explicitly projected media composed as a native image element${item.media.assetLabel ? ` (${item.media.assetLabel})` : ""}; observed overlays (gradients, arrow affordances) and side-by-side media pairings have no native field and compose stacked — see the section's fidelity warnings.`,
                  });
               }
               return imageElementHtml(item.media.mediaUrl);
            }
            if (item.kind === "buttons") {
               mapping.push({
                  sourceNodeId: item.nodeId,
                  sourceName: item.name,
                  ...(item.locator ? { sourceLocator: item.locator } : {}),
                  disposition: "mapped",
                  target: {
                     capabilityId: BUTTONS_ID,
                     appearanceId: BUTTONS_APPEARANCE,
                     nativeElement: "buttons",
                     nativeField: `${item.buttons.length} button-item child(ren)`,
                  },
                  note: `${item.buttons.length} projected CTA(s) composed as one native buttons (inline) container with button-item children; consecutive CTAs merge into one container, document order preserved.`,
               });
               return buttonsElementHtml(
                  item.nodeId,
                  item.buttons.map((b) => ({
                     keySource: b.nodeId,
                     label: b.label,
                     linkUrl: b.linkUrl,
                     ...(b.linkTarget ? { linkTarget: b.linkTarget } : {}),
                     variant: b.variant,
                  })),
               );
            }
            for (const run of item.runs) {
               mapping.push({
                  sourceNodeId: run.nodeId,
                  sourceName: run.name,
                  ...(run.locator ? { sourceLocator: run.locator } : {}),
                  disposition: "mapped",
                  target: {
                     capabilityId: TEXT_ID,
                     appearanceId: TEXT_APPEARANCE,
                     nativeElement: "text",
                     nativeField: "content (WYSIWYG HTML)",
                  },
                  note: `${run.viaProjection ? "Explicitly projected " : ""}text folded into the column text WYSIWYG field as ${run.role === "heading" ? "<h2>" : "<p>"}${item.runs.length > 1 ? " (consecutive texts merged into one field, document order)" : ""}; standalone per-field styling is not preserved (single WYSIWYG field).`,
               });
            }
            return textElementHtml(item.runs);
         })
         .join("");
      const landed = ownMedia !== undefined || html.length > 0;
      return { html, landed };
   };

   // Column container accounting (one entry per column node).
   const accountColumn = (
      columnNode: NodeIRNode,
      content: GridContent,
      nativeFieldNote: string,
      landedNote: string,
   ): void => {
      const colLocator = locatorOf(columnNode);
      mapping.push({
         sourceNodeId: columnNode.nodeId,
         sourceName: columnNode.name,
         ...(colLocator ? { sourceLocator: colLocator } : {}),
         disposition: content.landed ? "mapped" : "gap",
         ...(content.landed
            ? {
                 target: {
                    capabilityId: COLUMN_ID,
                    appearanceId: COLUMN_APPEARANCE,
                    nativeElement: "column (full-height)",
                    nativeField: nativeFieldNote,
                 },
              }
            : {}),
         note: content.landed
            ? landedNote
            : `Projected grid-column '${columnNode.name}' carries no manifest media entry and no composable descendants; only the empty native column shell is emitted — the slot's media is NOT composed.`,
      });
      if (!content.landed) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `Projected grid-column '${columnNode.name}' resolved to zero content elements (no own media entry, no composable descendants); an empty native column shell is emitted — nothing invented.`,
               columnNode.nodeId,
            ),
         );
      }
   };

   // Section content width: the observed content area (section width minus twice the smallest
   // observed child x offset), falling back to the section width; used only for Rule B complement
   // proportions — recorded, never silently assumed.
   const sectionW = fixedOf(sectionNode, "width") ?? 0;
   let minX: number | null = null;
   walkSubtree(sectionNodeId, (node) => {
      if (node.visible === false) return;
      const x = absOffsetOf(node, "x");
      if (x !== null && (minX === null || x < minX)) minX = x;
   });
   const contentX = minX ?? 0;
   const contentW =
      sectionW - 2 * contentX > 0 ? sectionW - 2 * contentX : sectionW;

   const heightConstraint = section.layout.constraints.find(
      (c) => c.axis === "height" && c.type === "fixed",
   );
   let rowMinHeight: number | undefined;
   if (heightConstraint) {
      const px = Number(heightConstraint.value);
      if (Number.isFinite(px) && px > 0) rowMinHeight = px;
      else
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`,
               sectionNodeId,
            ),
         );
   } else {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`,
            sectionNodeId,
         ),
      );
   }

   const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
   const styleRules: string[] = [];
   if (rowMinHeight !== undefined)
      styleRules.push(
         `#html-body [data-pb-style=${innerKey}]{min-height:${rowMinHeight}px}`,
      );

   // Band emission helper (shared by Rule A/B leading + trailing bands): role-resolved loose
   // texts fold into one WYSIWYG; projected CTAs compose one buttons container after it.
   const composeBand = (
      bandNodes: NodeIRNode[],
      bandLabel: "leading" | "trailing",
   ): string => {
      const runs: Extract<EmitItem, { kind: "text" }>["runs"] = [];
      const buttons: {
         keySource: string;
         label: string;
         linkUrl: string;
         linkTarget?: string;
         variant: "primary" | "secondary" | undefined;
      }[] = [];
      for (const node of bandNodes) {
         const loc = locatorOf(node);
         const role = resolveComposerRole(node);
         const entryBase = {
            sourceNodeId: node.nodeId,
            sourceName: node.name,
            ...(loc ? { sourceLocator: loc } : {}),
         };
         if (role === "content-lead" || role === "heading" || role === "body") {
            const text = loc ? textByRef.get(loc) : undefined;
            if (text === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest text entry for '${node.name}' (${loc ?? "no locator"}); the ${role} field is left empty — no text is invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: `No manifest text entry for the ${role} field.`,
               });
               continue;
            }
            runs.push({
               role,
               nodeId: node.nodeId,
               name: node.name,
               locator: loc,
               text,
               viaProjection: true,
            });
         } else if (role === "cta") {
            const label = loc ? textByRef.get(loc) : undefined;
            const link = loc ? linkByRef.get(loc) : undefined;
            if (label === undefined || link === undefined) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `CTA '${node.name}' lacks a manifest ${label === undefined ? "text (label)" : "link (target)"} entry; no button is composed — no label or link target is ever invented.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected CTA without a manifest label/link entry; no button composed.",
               });
            } else {
               buttons.push({
                  keySource: node.nodeId,
                  label,
                  linkUrl: link.linkUrl,
                  ...(link.linkTarget ? { linkTarget: link.linkTarget } : {}),
                  variant: link.variant,
               });
               mapping.push({
                  ...entryBase,
                  disposition: "mapped",
                  target: {
                     capabilityId: BUTTON_ITEM_ID,
                     appearanceId: BUTTON_ITEM_APPEARANCE,
                     nativeElement: "button-item",
                     nativeField: "button_text + link (button_link)",
                  },
                  note: `Explicitly projected CTA composed as a native button-item inside the ${bandLabel} band buttons container (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}); the observed per-button visual styling (fill, radius, icon) is the theme's button CSS, not a composed field.`,
               });
            }
         }
      }
      let html = "";
      if (runs.length > 0) {
         mapping.push({
            sourceNodeId: auxNodeId(`${sectionNodeId}:${bandLabel}-band`),
            disposition: "mapped",
            target: {
               capabilityId: TEXT_ID,
               appearanceId: TEXT_APPEARANCE,
               nativeElement: "text",
               nativeField: "content (WYSIWYG HTML)",
            },
            note: `${runs.length} role-resolved loose text(s) composed as one ${bandLabel} text WYSIWYG band in document order; the observed standalone styling of the cluster is not preserved (single WYSIWYG field).`,
         });
         html += textElementHtml(runs);
      }
      if (buttons.length > 0) {
         mapping.push({
            sourceNodeId: auxNodeId(
               `${sectionNodeId}:${bandLabel}-band-buttons`,
            ),
            disposition: "mapped",
            target: {
               capabilityId: BUTTONS_ID,
               appearanceId: BUTTONS_APPEARANCE,
               nativeElement: "buttons",
               nativeField: `${buttons.length} button-item child(ren)`,
            },
            note: `${buttons.length} projected CTA(s) composed as one native buttons (inline) container after the ${bandLabel} band text WYSIWYG.`,
         });
         html += buttonsElementHtml(
            `${sectionNodeId}:${bandLabel}-band-buttons`,
            buttons,
         );
      }
      return html;
   };

   // ---- Rule B: exactly one projected grid-column -> explicit column + synthesized complement --
   if (explicitColumns.length === 1) {
      const explicit = explicitColumns[0] as NodeIRNode;
      const explicitW = fixedOf(explicit, "width");
      const complementW =
         explicitW !== null && contentW - explicitW > 0
            ? contentW - explicitW
            : null;
      let explicitPct = 50;
      let complementPct = 50;
      if (explicitW !== null && complementW !== null) {
         const split = percentSplit([explicitW, complementW]);
         explicitPct = split[0] as number;
         complementPct = split[1] as number;
      } else {
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Section '${section.name}' carries no fixed width for the explicit column or its complement is non-positive; widths fall back to the platform's own equal-column default (50/50) — recorded, not inferred.`,
               sectionNodeId,
            ),
         );
      }

      // Loose content walk: visible in-scope nodes outside the explicit column subtree, projected
      // captions and decoration/CTA subtrees. Full-width loose text clusters ABOVE the explicit
      // column's top compose as a leading band; everything else composable feeds the synthesized
      // complement column IN ITS OWN DOCUMENT ORDER (texts merge, CTAs -> buttons, inline-media ->
      // images at their position). Containers/instances fold transparently (their descendants are
      // visited) and get one fold entry each.
      const explicitAbsY = absOffsetOf(explicit, "y") ?? 0;
      const captionLocatorsB = new Set(
         captions
            .map((c) => locatorOf(c))
            .filter((l): l is string => l !== null),
      );
      const inExplicitSubtree = new Set<string>();
      walkSubtree(explicit.nodeId, (n) => inExplicitSubtree.add(n.nodeId));
      const bandNodes: NodeIRNode[] = [];
      type SynthItem =
         | {
              kind: "text";
              role: "content-lead" | "heading" | "body";
              node: NodeIRNode;
           }
         | { kind: "cta"; node: NodeIRNode }
         | { kind: "media"; node: NodeIRNode };
      const synthItems: SynthItem[] = [];
      const visit = (id: string): void => {
         for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
            const node = nodesById.get(childId);
            if (!node || node.visible === false) continue;
            if (inExplicitSubtree.has(node.nodeId)) continue;
            const loc = locatorOf(node);
            const entryBase = {
               sourceNodeId: node.nodeId,
               sourceName: node.name,
               ...(loc ? { sourceLocator: loc } : {}),
            };
            if (loc && roleByLocator.get(loc) === "decoration") {
               diagnostics.push(
                  nodeDiag(
                     "NOT_VERIFIED",
                     "warning",
                     `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
               });
               continue;
            }
            if (loc && excludedLocators.has(loc)) {
               mapping.push({
                  ...entryBase,
                  disposition: "excluded",
                  note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
               });
               continue;
            }
            if (loc && ctaSubtreeLocators.has(loc)) {
               mapping.push({
                  ...entryBase,
                  disposition: "excluded",
                  note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
               });
               continue;
            }
            if (captionLocatorsB.has(loc ?? "")) {
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected grid-caption in a single-column (split) section: captions compose only in multi-column grids; not composed.",
               });
               continue;
            }
            const role = resolveComposerRole(node);
            if (
               role === "content-lead" ||
               role === "heading" ||
               role === "body" ||
               role === "cta"
            ) {
               const nodeW = fixedOf(node, "width") ?? 0;
               const nodeAbsY = absOffsetOf(node, "y") ?? 0;
               if (
                  role !== "cta" &&
                  nodeW >= 0.6 * contentW &&
                  nodeAbsY < explicitAbsY - 24
               ) {
                  bandNodes.push(node);
                  continue;
               }
               synthItems.push(
                  role === "cta"
                     ? { kind: "cta", node }
                     : {
                          kind: "text",
                          role: role as "content-lead" | "heading" | "body",
                          node,
                       },
               );
               continue;
            }
            if (loc && roleByLocator.get(loc) === "inline-media") {
               synthItems.push({ kind: "media", node });
               continue;
            }
            if (role === "grid-column" || role === "grid-caption") continue;
            if (node.kind === "container" || node.kind === "component") {
               // Transparent fold: visit descendants; one fold entry for the container itself.
               mapping.push({
                  ...entryBase,
                  disposition: "mapped",
                  target: {
                     capabilityId: COLUMN_ID,
                     appearanceId: COLUMN_APPEARANCE,
                     nativeElement: "column (full-height)",
                     nativeField:
                        "synthesized complement column (container folded)",
                  },
                  note: "Structural container folded into the synthesized complement column; its composable descendants compose in document order; no separate native container.",
               });
               visit(childId);
               continue;
            }
            if (node.kind === "icon") {
               diagnostics.push(
                  nodeDiag(
                     "NOT_VERIFIED",
                     "warning",
                     `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                     node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Decoration without a native equivalent; explicitly excluded (not silently dropped).",
               });
               continue;
            }
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: `Node outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
            });
         }
      };
      visit(sectionNodeId);

      // Emit the synthesized complement content in collected (document) order.
      let synthHtml = "";
      {
         const runs: Extract<EmitItem, { kind: "text" }>["runs"] = [];
         let pendingButtonsSpecs:
            | {
                 keySource: string;
                 label: string;
                 linkUrl: string;
                 linkTarget?: string;
                 variant: "primary" | "secondary" | undefined;
              }[]
            | null = null;
         const flushRuns = (): void => {
            if (runs.length > 0) {
               mapping.push({
                  sourceNodeId: auxNodeId(`${sectionNodeId}:synth-text`),
                  disposition: "mapped",
                  target: {
                     capabilityId: TEXT_ID,
                     appearanceId: TEXT_APPEARANCE,
                     nativeElement: "text",
                     nativeField: "content (WYSIWYG HTML)",
                  },
                  note: `${runs.length} role-resolved loose text(s) composed as one text WYSIWYG in the synthesized complement column (document order); the source carries no explicit container for this cluster — the column is synthesized from the section's own children (recorded decision), and standalone per-field styling is not preserved.`,
               });
               synthHtml += textElementHtml(runs);
               runs.length = 0;
            }
         };
         const flushButtonsSpecs = (): void => {
            if (pendingButtonsSpecs && pendingButtonsSpecs.length > 0) {
               mapping.push({
                  sourceNodeId: pendingButtonsSpecs[0]!.keySource,
                  disposition: "mapped",
                  target: {
                     capabilityId: BUTTONS_ID,
                     appearanceId: BUTTONS_APPEARANCE,
                     nativeElement: "buttons",
                     nativeField: `${pendingButtonsSpecs.length} button-item child(ren)`,
                  },
                  note: `${pendingButtonsSpecs.length} projected CTA(s) composed as one native buttons (inline) container in the synthesized complement column; consecutive CTAs merge into one container, document order preserved.`,
               });
               synthHtml += buttonsElementHtml(
                  `${sectionNodeId}:synth-buttons`,
                  pendingButtonsSpecs,
               );
               pendingButtonsSpecs = null;
            }
         };
         for (const item of synthItems) {
            const loc = locatorOf(item.node);
            const entryBase = {
               sourceNodeId: item.node.nodeId,
               sourceName: item.node.name,
               ...(loc ? { sourceLocator: loc } : {}),
            };
            if (item.kind === "text") {
               const text = loc ? textByRef.get(loc) : undefined;
               if (text === undefined) {
                  diagnostics.push(
                     nodeDiag(
                        "EVIDENCE_MISSING",
                        "warning",
                        `No content-manifest text entry for '${item.node.name}' (${loc ?? "no locator"}); the ${item.role} field is left empty — no text is invented.`,
                        item.node.nodeId,
                     ),
                  );
                  mapping.push({
                     ...entryBase,
                     disposition: "gap",
                     note: `No manifest text entry for the ${item.role} field.`,
                  });
                  continue;
               }
               flushButtonsSpecs();
               runs.push({
                  role: item.role,
                  nodeId: item.node.nodeId,
                  name: item.node.name,
                  locator: loc,
                  text,
                  viaProjection: true,
               });
               continue;
            }
            if (item.kind === "cta") {
               const label = loc ? textByRef.get(loc) : undefined;
               const link = loc ? linkByRef.get(loc) : undefined;
               if (label === undefined || link === undefined) {
                  diagnostics.push(
                     nodeDiag(
                        "EVIDENCE_MISSING",
                        "warning",
                        `CTA '${item.node.name}' lacks a manifest ${label === undefined ? "text (label)" : "link (target)"} entry; no button is composed — no label or link target is ever invented.`,
                        item.node.nodeId,
                     ),
                  );
                  mapping.push({
                     ...entryBase,
                     disposition: "gap",
                     note: "Projected CTA without a manifest label/link entry; no button composed.",
                  });
                  continue;
               }
               flushRuns();
               if (pendingButtonsSpecs)
                  pendingButtonsSpecs.push({
                     keySource: item.node.nodeId,
                     label,
                     linkUrl: link.linkUrl,
                     ...(link.linkTarget
                        ? { linkTarget: link.linkTarget }
                        : {}),
                     variant: link.variant,
                  });
               else
                  pendingButtonsSpecs = [
                     {
                        keySource: item.node.nodeId,
                        label,
                        linkUrl: link.linkUrl,
                        ...(link.linkTarget
                           ? { linkTarget: link.linkTarget }
                           : {}),
                        variant: link.variant,
                     },
                  ];
               mapping.push({
                  ...entryBase,
                  disposition: "mapped",
                  target: {
                     capabilityId: BUTTON_ITEM_ID,
                     appearanceId: BUTTON_ITEM_APPEARANCE,
                     nativeElement: "button-item",
                     nativeField: "button_text + link (button_link)",
                  },
                  note: `Explicitly projected CTA composed as a native button-item in the synthesized complement column (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}); the observed per-button visual styling (fill, radius, icon) is the theme's button CSS, not a composed field.`,
               });
               continue;
            }
            // media
            flushRuns();
            flushButtonsSpecs();
            const media = loc ? mediaByRef.get(loc) : undefined;
            if (!media) {
               diagnostics.push(
                  nodeDiag(
                     "EVIDENCE_MISSING",
                     "warning",
                     `No content-manifest media entry for projected inline-media node '${item.node.name}' (${loc ?? "no locator"}); no image element is composed — no asset URL is ever invented.`,
                     item.node.nodeId,
                  ),
               );
               mapping.push({
                  ...entryBase,
                  disposition: "gap",
                  note: "Projected inline-media without a manifest media entry; no image element composed.",
               });
               continue;
            }
            mapping.push({
               ...entryBase,
               disposition: "mapped",
               target: {
                  capabilityId: IMAGE_ID,
                  appearanceId: IMAGE_APPEARANCE,
                  nativeElement: "image",
                  nativeField: "desktop_image (src)",
               },
               note: "Explicitly projected media composed as a native image element in the synthesized complement column; observed overlay styling composes stacked — see the section's fidelity warnings.",
            });
            synthHtml += imageElementHtml(media.mediaUrl);
         }
         flushRuns();
         flushButtonsSpecs();
      }
      const synthLanded = synthHtml.length > 0;
      const synthKey = pbStyleKey(`${sectionNodeId}:synth`);
      const explicitKey = pbStyleKey(explicit.nodeId);
      const columnLineKey = pbStyleKey(`${sectionNodeId}:line`);
      styleRules.push(
         `#html-body [data-pb-style=${columnLineKey}]{display:flex;width:100%}`,
      );
      styleRules.push(
         `#html-body [data-pb-style=${explicitKey}]{justify-content:flex-start;display:flex;flex-direction:column;width:${explicitPct}%;align-self:stretch}`,
      );
      styleRules.push(
         `#html-body [data-pb-style=${synthKey}]{justify-content:flex-start;display:flex;flex-direction:column;width:${complementPct}%;align-self:stretch}`,
      );

      const explicitContent = composeGridColumn(explicit);
      accountColumn(
         explicit,
         explicitContent,
         `explicit grid-column slot (${explicitW !== null ? `${explicitW}px` : "width unknown"})`,
         `Explicit slot composed as one native column (full-height) of the split section (${explicitPct}% of the observed ${contentW}px content width).`,
      );

      mapping.push({
         sourceNodeId: auxNodeId(`${sectionNodeId}:synth-column`),
         disposition: synthLanded ? "mapped" : "gap",
         ...(synthLanded
            ? {
                 target: {
                    capabilityId: COLUMN_ID,
                    appearanceId: COLUMN_APPEARANCE,
                    nativeElement: "column (full-height)",
                    nativeField: "synthesized complement column",
                 },
              }
            : {}),
         note: synthLanded
            ? `The section's remaining loose composable content composed as ONE synthesized complement column (${complementW !== null ? `${complementW}px` : "width unknown"} of the observed ${contentW}px content width -> ${complementPct}%); the source carries no explicit container for it — recorded decision, never invented structurally.`
            : "No loose composable content remained for the synthesized complement column; an empty native column shell is emitted.",
      });

      // Column order by absolute x (tie -> explicit first).
      const explicitX = colXAbs(explicit);
      let synthX = explicitX;
      for (const item of synthItems) {
         const x = absOffsetOf(item.node, "x");
         if (x !== null && x < synthX) synthX = x;
      }
      const explicitFirst = explicitX <= synthX;
      const explicitHtml = `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${explicitKey}">${explicitContent.html}</div>`;
      const synthHtmlColumn = `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${synthKey}">${synthHtml}</div>`;
      const lineHtml = explicitFirst
         ? explicitHtml + synthHtmlColumn
         : synthHtmlColumn + explicitHtml;
      const leadingHtml =
         bandNodes.length > 0 ? composeBand(bandNodes, "leading") : "";
      mapping.push({
         sourceNodeId: sectionNodeId,
         ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
         ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
         disposition: "mapped",
         target: {
            capabilityId: ROW_ID,
            appearanceId: ROW_APPEARANCE,
            nativeElement: "main",
            nativeField:
               "row(contained) > column-group(default) > column-line > column(full-height) x2",
         },
         note: `Split section composed as the declaration-backed two-column chain: explicit slot (${explicitW !== null ? `${explicitW}px` : "width unknown"} of the observed ${contentW}px content width -> ${explicitPct}%) + ONE synthesized complement column (${complementPct}%) from the section's remaining loose composable content in document order; observed side placement/any full-bleed media edge are approximated by the contained row (recorded fidelity limits); mobile breakpoint not composed.`,
      });
      const styleBlock = `<style>${styleRules.join("")}</style>`;
      return (
         styleBlock +
         `<div data-content-type="row" data-appearance="contained" data-element="main">` +
         `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"${rowMinHeight !== undefined ? ` data-pb-style="${innerKey}"` : ""}>` +
         leadingHtml +
         `<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">` +
         `<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="${columnLineKey}">` +
         lineHtml +
         `</div>` +
         `</div>` +
         `</div>` +
         `</div>`
      );
   }

   // ---- Rule A: two or more projected grid-columns -> lines by common parent + y-overlap --------
   // Cluster columns into lines: group by parent node, sweep by y (absolute) splitting on
   // non-overlap; columns within a line ordered by absolute x; lines by their first column's y.
   const parentOf = new Map<string, string | null>();
   for (const col of explicitColumns)
      parentOf.set(col.nodeId, col.parentNodeId);
   const groups = new Map<string, NodeIRNode[]>();
   for (const col of explicitColumns) {
      const key = parentOf.get(col.nodeId) ?? "root";
      const list = groups.get(key) ?? [];
      list.push(col);
      groups.set(key, list);
   }
   const lines: { cols: NodeIRNode[] }[] = [];
   for (const [, cols] of [...groups.entries()].sort((a, b) => {
      const fa = a[1][0] as NodeIRNode;
      const fb = b[1][0] as NodeIRNode;
      return colYAbs(fa) - colYAbs(fb) || colXAbs(fa) - colXAbs(fb);
   })) {
      const sorted = [...cols].sort(
         (a, b) => colYAbs(a) - colYAbs(b) || colXAbs(a) - colXAbs(b),
      );
      let current: { cols: NodeIRNode[]; y1: number } | null = null;
      for (const col of sorted) {
         const y = colYAbs(col);
         const y1 = y + (fixedOf(col, "height") ?? 0);
         if (current && y < current.y1) {
            current.cols.push(col);
            current.y1 = Math.max(current.y1, y1);
         } else {
            if (current) lines.push({ cols: current.cols });
            current = { cols: [col], y1 };
         }
      }
      if (current) lines.push({ cols: current.cols });
   }
   for (const line of lines) line.cols.sort((a, b) => colXAbs(a) - colXAbs(b));
   lines.sort(
      (a, b) =>
         colYAbs(a.cols[0] as NodeIRNode) - colYAbs(b.cols[0] as NodeIRNode),
   );
   if (lines.length === 0) return null;

   // Widths per line from the observed fixed widths (largest remainder, sum exactly 100).
   const linePcts = lines.map((line) => {
      const widths = line.cols.map((c) => fixedOf(c, "width") ?? 0);
      const usable = widths.every((w) => w > 0)
         ? widths
         : widths.map((w) => (w > 0 ? w : 1));
      return percentSplit(usable);
   });
   for (const [li, line] of lines.entries()) {
      const lineKey = pbStyleKey(`${sectionNodeId}:line-${li}`);
      styleRules.push(
         `#html-body [data-pb-style=${lineKey}]{display:flex;width:100%}`,
      );
      const pcts = linePcts[li] as number[];
      for (const [ci, col] of line.cols.entries()) {
         const key = pbStyleKey(col.nodeId);
         styleRules.push(
            `#html-body [data-pb-style=${key}]{justify-content:flex-start;display:flex;flex-direction:column;width:${pcts[ci]}%;align-self:stretch}`,
         );
      }
   }

   // Loose content bands (Rule A): role-resolved loose texts/CTAs outside every column subtree;
   // above the first line -> leading band, otherwise -> trailing band; captions attach per column.
   const inColumnSubtree = new Set<string>();
   for (const col of explicitColumns)
      walkSubtree(col.nodeId, (n) => inColumnSubtree.add(n.nodeId));
   const captionLocatorsA = new Set(
      captions.map((c) => locatorOf(c)).filter((l): l is string => l !== null),
   );
   const firstLineTop = colYAbs(
      (lines[0] as { cols: NodeIRNode[] }).cols[0] as NodeIRNode,
   );
   const leadingNodes: NodeIRNode[] = [];
   const trailingNodes: NodeIRNode[] = [];
   const visitA = (id: string): void => {
      for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
         const node = nodesById.get(childId);
         if (!node || node.visible === false) continue;
         if (inColumnSubtree.has(node.nodeId)) continue;
         const loc = locatorOf(node);
         const entryBase = {
            sourceNodeId: node.nodeId,
            sourceName: node.name,
            ...(loc ? { sourceLocator: loc } : {}),
         };
         if (loc && roleByLocator.get(loc) === "decoration") {
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
            });
            continue;
         }
         if (loc && excludedLocators.has(loc)) {
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            });
            continue;
         }
         if (loc && ctaSubtreeLocators.has(loc)) {
            mapping.push({
               ...entryBase,
               disposition: "excluded",
               note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
            });
            continue;
         }
         if (captionLocatorsA.has(loc ?? "")) continue; // attached to a column above
         const role = resolveComposerRole(node);
         if (
            role === "content-lead" ||
            role === "heading" ||
            role === "body" ||
            role === "cta"
         ) {
            const y = absOffsetOf(node, "y");
            (y !== null && y < firstLineTop
               ? leadingNodes
               : trailingNodes
            ).push(node);
            continue;
         }
         if (loc && roleByLocator.get(loc) === "inline-media") {
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Projected inline-media '${node.name}' sits outside every projected grid-column; loose media outside columns is not composed.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: "Projected inline-media outside any projected column; not composed.",
            });
            continue;
         }
         if (role === "grid-column" || role === "grid-caption") continue;
         if (node.kind === "container" || node.kind === "component") {
            // Transparent fold: visit descendants; one fold entry for the container itself.
            mapping.push({
               ...entryBase,
               disposition: "mapped",
               target: {
                  capabilityId: COLUMN_ID,
                  appearanceId: COLUMN_APPEARANCE,
                  nativeElement: "column (full-height)",
                  nativeField: "grid structure (container folded)",
               },
               note: "Structural container folded into the grid structure; its composable descendants compose in the bands/columns; no separate native container.",
            });
            visitA(childId);
            continue;
         }
         if (node.kind === "icon") {
            diagnostics.push(
               nodeDiag(
                  "NOT_VERIFIED",
                  "warning",
                  `Decoration '${node.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
                  node.nodeId,
               ),
            );
            mapping.push({
               ...entryBase,
               disposition: "gap",
               note: "Decoration without a native equivalent; explicitly excluded (not silently dropped).",
            });
            continue;
         }
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
               node.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: `Node outside the ${GRID_TABLE_LABEL} composition table; not composed.`,
         });
      }
   };
   visitA(sectionNodeId);
   const leadingHtml =
      leadingNodes.length > 0 ? composeBand(leadingNodes, "leading") : "";
   const trailingHtml =
      trailingNodes.length > 0 ? composeBand(trailingNodes, "trailing") : "";

   // Column content + container accounting + line markup.
   const lineHtmlParts: string[] = [];
   for (const [li, line] of lines.entries()) {
      const lineKey = pbStyleKey(`${sectionNodeId}:line-${li}`);
      const pcts = linePcts[li] as number[];
      const colsHtml = line.cols
         .map((col, ci) => {
            const content = composeGridColumn(col);
            accountColumn(
               col,
               content,
               `grid column at ${pcts[ci]}% of line ${li + 1} (observed proportion of its line)`,
               `Grid slot composed as one native column (full-height) at ${pcts[ci]}% width of line ${li + 1}.`,
            );
            const key = pbStyleKey(col.nodeId);
            return `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${key}">${content.html}</div>`;
         })
         .join("");
      lineHtmlParts.push(
         `<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="${lineKey}">${colsHtml}</div>`,
      );
   }

   // Aggregated fidelity warning (once per section, from the observed inventory).
   const totalMedia = explicitColumns
      .map((col) => {
         let count = 0;
         const colLocator = locatorOf(col);
         if (colLocator && mediaByRef.has(colLocator)) count += 1;
         walkSubtree(col.nodeId, (n) => {
            if (n.visible === false) return;
            const loc = locatorOf(n);
            if (
               loc &&
               (roleByLocator.get(loc) === "inline-media" ||
                  mediaByRef.has(loc))
            )
               count += 1;
         });
         return count;
      })
      .reduce((a, b) => a + b, 0);
   if (totalMedia > 0) {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Observed media in '${section.name}' (${totalMedia} slot(s)) composes as native image elements at natural aspect to column width — no native aspect/crop field; the section's fixed height persists only as the row min-height. Overlay/decoration styling (gradients, affordances) has no native field. Recorded as fidelity limits, never custom CSS.`,
            sectionNodeId,
         ),
      );
   }

   mapping.push({
      sourceNodeId: sectionNodeId,
      ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
      ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
      disposition: "mapped",
      target: {
         capabilityId: ROW_ID,
         appearanceId: ROW_APPEARANCE,
         nativeElement: "main",
         nativeField: `row(contained) > column-group(default) > column-line x${lines.length} > column(full-height) x${explicitColumns.length}`,
      },
      note: `Grid section composed as the declaration-backed column chain: ${lines.length} line(s), ${explicitColumns.length} projected grid column(s), widths apportioned from observed fixed widths to integer percents (largest remainder, sum 100); observed vertical overlap bands define the lines (nesting a column-group inside a column is NOT declaration-backed); observed gutters/staggering are not native fields — recorded fidelity limits; mobile breakpoint not composed.`,
   });
   const styleBlock = `<style>${styleRules.join("")}</style>`;
   return (
      styleBlock +
      `<div data-content-type="row" data-appearance="contained" data-element="main">` +
      `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"${rowMinHeight !== undefined ? ` data-pb-style="${innerKey}"` : ""}>` +
      leadingHtml +
      `<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">` +
      lineHtmlParts.join("") +
      `</div>` +
      trailingHtml +
      `</div>` +
      `</div>`
   );
}

function composeSection(
   section: PageStructureSection,
   sectionNodeId: string,
): string | null {
   const sectionNode = nodesById.get(sectionNodeId);
   if (!sectionNode) {
      diagnostics.push(
         nodeDiag(
            "EVIDENCE_MISSING",
            "error",
            `Planned section '${section.name}' has no NodeIR node; the plan is not derived from this inventory — fail closed.`,
            sectionNodeId,
         ),
      );
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
      return composeTwoColumnSection(
         section,
         sectionNodeId,
         primaries[0] as NodeIRNode,
         secondaries[0] as NodeIRNode,
      );
   }

   // Issue #28 dispatch (deterministic precedence after the G4 two-column shape): explicit
   // grid-column projections compose the declaration-backed column-grid shape (Rule B split /
   // Rule A grid); hero-eligible sections keep the hero composer; role-resolved text/CTA sections
   // without background media and without blocking containers compose the guarded text-band
   // shape; everything else skips through the hero path's full accountable scan below.
   const gridColumns: NodeIRNode[] = [];
   walkSubtree(sectionNodeId, (node) => {
      if (node.visible === false) return;
      const loc = locatorOf(node);
      if (loc && roleByLocator.get(loc) === "grid-column")
         gridColumns.push(node);
   });
   if (gridColumns.length > 0) {
      return composeColumnGridSection(section, sectionNodeId, gridColumns);
   }
   // Band guard: a direct-child container that carries its own manifest media entry, or that
   // contains structured (non-CTA) role-resolved text, marks a hero/column-shaped section — the
   // band shape must not silently flatten it. Such sections honestly skip instead.
   const textBandBlocked = (): string | null => {
      for (const child of directVisibleChildren) {
         if (child.kind !== "container" && child.kind !== "component") continue;
         const childLoc = locatorOf(child);
         if (childLoc && mediaByRef.has(childLoc))
            return `direct-child container '${child.name}' carries a manifest media entry`;
         let reason: string | null = null;
         walkSubtree(child.nodeId, (n) => {
            if (reason || n.visible === false) return;
            const l = locatorOf(n);
            if (l && (excludedLocators.has(l) || ctaSubtreeLocators.has(l)))
               return;
            const r = resolveComposerRole(n);
            if (
               (r === "content-lead" || r === "heading" || r === "body") &&
               n.nodeId !== child.nodeId
            )
               reason = `structured text content (role '${r}') inside '${child.name}'`;
         });
         if (reason) return reason;
      }
      return null;
   };
   const bandBlocker = textBandBlocked();

   // Deterministic role resolution: explicit projection assignment > SLOT naming-contract table.
   // Only the hero's own text roles fold here; other projected roles (columns, inline-media,
   // decoration) fall to the accountable "other" treatment below — never mis-claimed.
   const HERO_TEXT_ROLES: ComposerRole[] = [
      "content-lead",
      "heading",
      "body",
      "cta",
   ];
   const resolveRole = (
      node: NodeIRNode,
   ):
      | "background-media"
      | "content-lead"
      | "heading"
      | "body"
      | "cta"
      | undefined => {
      const role = resolveComposerRole(node);
      return role !== undefined && HERO_TEXT_ROLES.includes(role)
         ? (role as
              "background-media" | "content-lead" | "heading" | "body" | "cta")
         : undefined;
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
   const bgCandidates = inScope.filter(
      (n) =>
         notExcluded(n) &&
         (n.kind === "media" ||
            (locatorOf(n) !== null &&
               roleByLocator.get(locatorOf(n) as string) ===
                  "background-media")),
   );
   const textCandidates = inScope.filter((n) => {
      if (!notExcluded(n)) return false;
      const role = resolveRole(n);
      return role !== undefined && role !== "background-media";
   });
   if (bgCandidates.length === 0 || textCandidates.length === 0) {
      // Issue #28: guarded text-band attempt before the honest skip (no background media and no
      // blocking container structure — loose role-resolved text/CTA content only).
      if (!bandBlocker) {
         const band = composeTextBandSection(section, sectionNodeId);
         if (band) return band;
      }
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' does not carry the hero shape this slice composes (needs a background-media node and role-resolved overlaid text — via explicit projection or SLOT naming hints); skipped — nothing invented.${bandBlocker ? ` The guarded text-band shape is not applicable: ${bandBlocker}.` : ""}`,
            sectionNodeId,
         ),
      );
      mapping.push({
         sourceNodeId: sectionNodeId,
         ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
         ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
         disposition: "skipped",
         note: "Section shape is outside this slice's composers (background media + role-resolved overlaid text; projected column/grid shapes; loose text/CTA band).",
      });
      return null;
   }

   const pieces: HeroPieces = {};

   // Background media: the explicit projection assignment if present, else the FIRST media node
   // in document order. Extra media nodes are gaps.
   const bgNode =
      inScope.find(
         (n) =>
            locatorOf(n) !== null &&
            roleByLocator.get(locatorOf(n) as string) === "background-media",
      ) ??
      bgCandidates.find((n) => n.kind === "media") ??
      null;
   if (bgNode) {
      const bgLocator = locatorOf(bgNode);
      const bgManifest = bgLocator ? mediaByRef.get(bgLocator) : undefined;
      if (!bgManifest) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `No content-manifest media entry for background node '${bgNode.name}' (${bgLocator ?? "no locator"}); the banner background is left empty — no asset URL is ever invented.`,
               bgNode.nodeId,
            ),
         );
         mapping.push({
            sourceNodeId: bgNode.nodeId,
            sourceName: bgNode.name,
            ...(bgLocator ? { sourceLocator: bgLocator } : {}),
            disposition: "gap",
            note: "Background media has no manifest entry; banner background left empty.",
         });
      } else {
         pieces.background = {
            nodeId: bgNode.nodeId,
            mediaUrl: bgManifest.mediaUrl,
            ...(bgManifest.assetLabel
               ? { assetLabel: bgManifest.assetLabel }
               : {}),
         };
         mapping.push({
            sourceNodeId: bgNode.nodeId,
            sourceName: bgNode.name,
            ...(bgLocator ? { sourceLocator: bgLocator } : {}),
            disposition: "mapped",
            target: {
               capabilityId: BANNER_ID,
               appearanceId: BANNER_APPEARANCE,
               nativeElement: "wrapper",
               nativeField: "background_image",
            },
            note: `Desktop background image${pieces.background.assetLabel ? ` (${pieces.background.assetLabel})` : ""}; mobile breakpoint not composed.`,
         });
      }
   }
   for (const extra of bgCandidates.filter(
      (n) => n !== bgNode && n.kind === "media",
   )) {
      const extraLocator = locatorOf(extra);
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Extra media node '${extra.name}' has no native slot in the banner background (one background per banner); not composed.`,
            extra.nodeId,
         ),
      );
      mapping.push({
         sourceNodeId: extra.nodeId,
         sourceName: extra.name,
         ...(extraLocator ? { sourceLocator: extraLocator } : {}),
         disposition: "gap",
         note: "Extra media beyond the banner background; no native slot.",
      });
   }

   // Role-resolved text nodes: content lead / heading / body fold into the content WYSIWYG;
   // cta becomes the button element (label text; link from the manifest, keyed by the node).
   for (const textNode of textCandidates) {
      const role = resolveRole(textNode);
      const textLocator = locatorOf(textNode);
      const entryBase = {
         sourceNodeId: textNode.nodeId,
         sourceName: textNode.name,
         ...(textLocator ? { sourceLocator: textLocator } : {}),
      };
      const viaProjection =
         textLocator !== null && roleByLocator.get(textLocator) !== undefined;
      const text = textLocator ? textByRef.get(textLocator) : undefined;
      if (text === undefined) {
         diagnostics.push(
            nodeDiag(
               "EVIDENCE_MISSING",
               "warning",
               `No content-manifest text entry for '${textNode.name}' (${textLocator ?? "no locator"}); the ${role} field is left empty — no text is invented.`,
               textNode.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: `No manifest text entry for the ${role} field.`,
         });
         continue;
      }
      if (role === "cta") {
         const link = textLocator ? linkByRef.get(textLocator) : undefined;
         pieces.cta = {
            nodeId: textNode.nodeId,
            text,
            ...(link ? { link } : {}),
         };
         mapping.push({
            ...entryBase,
            disposition: "mapped",
            target: {
               capabilityId: BANNER_ID,
               appearanceId: BANNER_APPEARANCE,
               nativeElement: "button",
               nativeField: "button_text",
            },
            note: `${viaProjection ? "Explicitly projected " : ""}CTA (${textNode.name}) — label text${link ? " + link target" : ""} from the manifest.`,
         });
         if (!link) {
            diagnostics.push(
               nodeDiag(
                  "EVIDENCE_MISSING",
                  "warning",
                  `No content-manifest link entry for CTA node '${textNode.name}'; the CTA composes without a link target (banner shows the button unlinked).`,
                  textNode.nodeId,
               ),
            );
         }
      } else {
         const pieceKey =
            role === "content-lead"
               ? "contentLead"
               : (role as "heading" | "body");
         pieces[pieceKey] = { nodeId: textNode.nodeId, text };
         const as = role === "heading" ? "<h2>" : "<p>";
         mapping.push({
            ...entryBase,
            disposition: "mapped",
            target: {
               capabilityId: BANNER_ID,
               appearanceId: BANNER_APPEARANCE,
               nativeElement: "content",
               nativeField: "message",
            },
            note: `${viaProjection ? "Explicitly projected " : ""}text folded into the banner content WYSIWYG field as ${as}; standalone per-field styling is not preserved (single WYSIWYG field).`,
         });
      }
   }

   // Every other in-scope node: decorated subtrees already excluded above; here decorations,
   // containers and unrecognized kinds get their explicit, accountable treatment.
   const accounted = new Set<string>([
      ...(pieces.background ? [pieces.background.nodeId] : []),
      ...textCandidates.map((t) => t.nodeId),
   ]);
   for (const other of inScope) {
      if (accounted.has(other.nodeId)) continue;
      const otherLocator = locatorOf(other);
      const entryBase = {
         sourceNodeId: other.nodeId,
         sourceName: other.name,
         ...(otherLocator ? { sourceLocator: otherLocator } : {}),
      };
      if (otherLocator && roleByLocator.get(otherLocator) === "decoration") {
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
               other.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Explicitly projected decoration without a native equivalent; excluded (not silently dropped).",
         });
         continue;
      }
      if (otherLocator && excludedLocators.has(otherLocator)) {
         mapping.push({
            ...entryBase,
            disposition: "excluded",
            note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
         });
         continue;
      }
      if (otherLocator && ctaSubtreeLocators.has(otherLocator)) {
         mapping.push({
            ...entryBase,
            disposition: "excluded",
            note: "Inside a projected CTA instance that composed as the native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
         });
         continue;
      }
      if (other.role === "DECOR" || other.kind === "icon") {
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Decoration '${other.name}' has no native Page Builder equivalent in this slice's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
               other.nodeId,
            ),
         );
         mapping.push({
            ...entryBase,
            disposition: "gap",
            note: "Decoration without a native equivalent; explicitly excluded (not silently dropped).",
         });
         continue;
      }
      if (other.role === "SLOT" && other.kind === "container") {
         const containsCta = (
            nodesById.get(other.nodeId)?.childrenNodeIds ?? []
         ).some((childId) => {
            const child = nodesById.get(childId);
            if (!child) return false;
            const childLocator = locatorOf(child);
            return (
               (childLocator !== null &&
                  roleByLocator.get(childLocator) === "cta") ||
               (child.kind === "text" &&
                  (() => {
                     const r = slotRole(child);
                     return r !== null && TEXT_ROLE_TABLE[r] === "cta";
                  })())
            );
         });
         mapping.push({
            ...entryBase,
            disposition: "mapped",
            target: {
               capabilityId: BANNER_ID,
               appearanceId: BANNER_APPEARANCE,
               nativeElement: containsCta ? "button" : "content",
               nativeField: containsCta ? "button_text" : "message",
            },
            note: containsCta
               ? "Structural container folded into the banner button area; no separate native container."
               : "Structural container folded into the banner content WYSIWYG; no separate native container.",
         });
         continue;
      }
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Node '${other.name}' (kind '${other.kind}', role '${other.role ?? "none"}') is outside this slice's composition table; not composed.`,
            other.nodeId,
         ),
      );
      mapping.push({
         ...entryBase,
         disposition: "gap",
         note: "Node outside the composition table; not composed.",
      });
   }

   // Sanity: at least one field must resolve, else the banner is not composable.
   if (!pieces.background && !pieces.heading && !pieces.body && !pieces.cta) {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' resolved to zero composable fields; nothing composed.`,
            sectionNodeId,
         ),
      );
      mapping.push({
         sourceNodeId: sectionNodeId,
         ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
         ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
         disposition: "skipped",
         note: "Zero composable fields after gap resolution.",
      });
      return null;
   }

   // Section-level height: the ONLY layout primitive carried into the composition (declaration-
   // backed: the poster overlay element declares min_height). Everything else stays a platform
   // default that the Admin form owns.
   const heightConstraint = section.layout.constraints.find(
      (c) => c.axis === "height" && c.type === "fixed",
   );
   if (heightConstraint) {
      const px = Number(heightConstraint.value);
      if (Number.isFinite(px) && px > 0) pieces.minHeight = px;
      else
         diagnostics.push(
            nodeDiag(
               "NOT_VERIFIED",
               "warning",
               `Section height constraint '${heightConstraint.value}' is not a positive number; min-height not composed.`,
               sectionNodeId,
            ),
         );
   } else {
      diagnostics.push(
         nodeDiag(
            "NOT_VERIFIED",
            "warning",
            `Section '${section.name}' carries no fixed height constraint; banner min-height not composed (Admin default applies).`,
            sectionNodeId,
         ),
      );
   }

   // ---- Emit (fixed attribute order; mirrors the platform's own persisted master format) -------
   // esc/escText are the shared module-level escapers (one definition for both section shapes).
   const backgroundImagesJson = JSON.stringify(
      pieces.background ? { desktop_image: pieces.background.mediaUrl } : {},
   ).replace(/"/g, "&quot;");

   const contentFragments: string[] = [];
   if (pieces.contentLead)
      contentFragments.push(`<p>${escText(pieces.contentLead.text)}</p>`);
   if (pieces.heading)
      contentFragments.push(`<h2>${escText(pieces.heading.text)}</h2>`);
   if (pieces.body)
      contentFragments.push(`<p>${escText(pieces.body.text)}</p>`);
   const buttonHtml = pieces.cta
      ? `<button type="button" class="pagebuilder-banner-button" data-element="button" style="opacity: 1; visibility: visible;">${escText(pieces.cta.text)}</button>`
      : "";
   // The one layout primitive persists via the platform's own rehydratable style-block mechanism
   // (issue #25 NaN correction class, applied to the banner overlay): the Admin master-format
   // reader overwrites inline style attributes with the (absent) data-<viewport>-style attribute,
   // so an inline-only overlay min-height silently disappears on Admin open/save. The overlay
   // element carries a deterministic data-pb-style key and a leading <style> block holds the
   // exact rehydratable rule the Admin stage parses back into the Min Height form field (and the
   // storefront applies). Rule shape mirrors the canonical editor-saved poster overlay in the
   // target checkout's stored content (real cms_page: `#html-body [data-pb-style=KEY]{…min-height:…}`
   // with no inline style on the overlay element). Nothing else in the hero mapping changes.
   const overlayKey =
      pieces.minHeight !== undefined
         ? pbStyleKey(`${sectionNodeId}:overlay`)
         : undefined;
   const styleBlock =
      overlayKey !== undefined
         ? `<style>#html-body [data-pb-style=${overlayKey}]{min-height:${pieces.minHeight}px}</style>`
         : "";
   const showButton = pieces.cta ? "always" : "never";
   const linkAttrs = pieces.cta?.link
      ? ` href="${esc(pieces.cta.link.linkUrl)}"${pieces.cta.link.linkTarget ? ` target="${esc(pieces.cta.link.linkTarget)}"` : ""}`
      : "";

   mapping.push({
      sourceNodeId: sectionNodeId,
      ...(sectionNode.name ? { sourceName: sectionNode.name } : {}),
      ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
      disposition: "mapped",
      target: {
         capabilityId: BANNER_ID,
         appearanceId: BANNER_APPEARANCE,
         nativeElement: "main",
         nativeField: "banner (row > banner container)",
      },
      note: "Section composed as native row(contained) > banner(poster) per the pinned declarations; the row provides the platform's standard top-level container.",
   });
   return (
      styleBlock +
      `<div data-content-type="row" data-appearance="contained" data-element="main">` +
      `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
      `<div data-content-type="banner" data-appearance="poster" data-show-button="${showButton}" data-show-overlay="never" data-element="main">` +
      (pieces.cta?.link
         ? `<a${linkAttrs} data-element="link">`
         : `<div data-element="empty_link">`) +
      `<div class="pagebuilder-banner-wrapper" data-background-images="${backgroundImagesJson}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="wrapper">` +
      `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay"${overlayKey !== undefined ? ` data-pb-style="${overlayKey}"` : ""}>` +
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
for (const section of [...input.pageStructure.sections].sort(
   (a, b) => a.order - b.order,
)) {
   const sectionEvidence = section.sourceEvidence?.[0]?.locator;
   const sectionNodeId = sectionEvidence
      ? locatorToNodeId.get(sectionEvidence)
      : undefined;
   if (!sectionNodeId) {
      diagnostics.push({
         code: "EVIDENCE_MISSING",
         severity: "error",
         message: `Planned section '${section.name}' carries no evidence locator resolvable in the NodeIR; the plan is not derived from this inventory — fail closed.`,
         subject: { type: "section", id: section.sectionId },
      });
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
      ...(input.projection
         ? { projectionContentHash: stableHash(input.projection) }
         : {}),
      registryRevisionId: input.registry.source.revisionId,
      bindingMapContentHash: bindingMapPinHash(input.bindings),
   },
   content,
   contentHash: `sha256:${sha256Hex(content)}`,
   mapping: [...mapping]
      .map((m) =>
         m.note !== undefined && m.note.length > 500
            ? { ...m, note: `${m.note.slice(0, 497)}…` }
            : m,
      )
      .sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId)),
   diagnostics: sortDiagnostics(diagnostics),
};

const outCheck = validateContract("compose-output", payload);
if (!outCheck.valid)
   fail(
      `constructed compose output fails its contract: ${outCheck.errors[0] ?? "unknown"}`,
   );
process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
