// [72] Shared deterministic predicates + accountable-record helpers for the section-shape
// handlers (../handlers/*). Pure structural detection ONLY — never section names, node ids of
// a pinned source, customer paths or source identity (frozen-contract rule 1). Every helper
// that records does so through the context's pushDiagnostic/pushMapping (handlers never print;
// frozen-contract rule 4).
import type { Diagnostic, NodeIRNode } from "../../../../core/types.js";
import type {
   ComposerRole,
   MappingEntry,
   SectionComposeContext,
} from "../handler-context.js";

// ---- Native capability identities (the pinned registry's canonical ids; the same identities
// the legacy composers in ../compose.ts gate and emit) ----------------------------------------
export const ROW_ID = "magento_pagebuilder/row";
export const ROW_APPEARANCE = "contained";
export const HEADING_ID = "magento_pagebuilder/heading";
export const HEADING_APPEARANCE = "default";
export const TEXT_ID = "magento_pagebuilder/text";
export const TEXT_APPEARANCE = "default";
export const IMAGE_ID = "magento_pagebuilder/image";
export const IMAGE_APPEARANCE = "full-width";
export const COLUMN_GROUP_ID = "magento_pagebuilder/column-group";
export const COLUMN_GROUP_APPEARANCE = "default";
export const COLUMN_LINE_ID = "magento_pagebuilder/column-line";
export const COLUMN_LINE_APPEARANCE = "default";
export const COLUMN_ID = "magento_pagebuilder/column";
export const COLUMN_APPEARANCE = "full-height";
export const BUTTONS_ID = "magento_pagebuilder/buttons";
export const BUTTONS_APPEARANCE = "inline";
export const BUTTON_ITEM_ID = "magento_pagebuilder/button-item";
export const BUTTON_ITEM_APPEARANCE = "default";

// The handler-facing context: the frozen seam plus the dispatcher-provided role resolver so
// every handler shares ONE role-resolution source (explicit projection > SLOT naming-contract
// table — no handler-local copy of the table).
export type HandlerContext = SectionComposeContext & {
   resolveComposerRole(node: NodeIRNode): ComposerRole | undefined;
};

// Explicit semantic projection decisions a STRUCTURAL handler must always decline on: the
// recorded human decision (column/grid/slide/products roles) owns those sections, and the
// dispatcher keeps the projected legacy shapes ahead of the structural handlers anyway. Both
// guards agree by construction.
const DECISION_ROLES: ReadonlySet<ComposerRole> = new Set<ComposerRole>([
   "background-media",
   "column-primary",
   "column-secondary",
   "grid-column",
   "slide",
   "products-grid",
   "products-carousel",
]);

export function hasDecisionRole(
   ctx: HandlerContext,
   sectionNodeId: string,
): boolean {
   let found = false;
   ctx.walkSubtree(sectionNodeId, (node) => {
      if (found || node.visible === false) return;
      const loc = ctx.locatorOf(node);
      if (loc && ctx.roleByLocator.get(loc) !== undefined) {
         const role = ctx.roleByLocator.get(loc) as ComposerRole;
         if (DECISION_ROLES.has(role)) found = true;
      }
   });
   return found;
}

// Role values from the dispatcher-provided resolver are the SAME vocabulary as the projection
// schema for every projection-assigned role — EXCEPT one: the legacy SLOT naming table yields
// 'contentLead' (its pre-#72 camelCase value) where the unified ComposerRole vocabulary says
// 'content-lead'. The legacy composers' switch on that raw value is pinned behavior (their
// compose bytes are byte-pinned by the G3/G4/G28 suites), so the table itself is NOT this
// lane's to change; handlers consume the unified vocabulary through this single documented
// seam adapter instead. Every other role value passes through untouched.
export function normalizeComposerRole(
   role: string | undefined,
): ComposerRole | undefined {
   return role === "contentLead"
      ? "content-lead"
      : (role as ComposerRole | undefined);
}

// ---- Node helpers -----------------------------------------------------------------------------

export function visibleChildren(ctx: HandlerContext, id: string): NodeIRNode[] {
   return (ctx.nodesById.get(id)?.childrenNodeIds ?? [])
      .map((childId) => ctx.nodesById.get(childId))
      .filter((n): n is NodeIRNode => n !== undefined && n.visible !== false);
}

// Document-order VISIBLE descendants of a node (the node itself excluded — the caller accounts
// the root separately). Invisible nodes are never composed: the review ledger covers them
// (the same policy as every legacy composer in this adapter).
export function visibleDescendants(
   ctx: HandlerContext,
   rootId: string,
): NodeIRNode[] {
   const out: NodeIRNode[] = [];
   ctx.walkSubtree(rootId, (node) => {
      if (node.visible === false) return;
      out.push(node);
   });
   return out;
}

// Ordered kind sequence of a group's visible descendants — the structural parallelism key.
export function visibleKindSequence(
   ctx: HandlerContext,
   node: NodeIRNode,
): string[] {
   return visibleDescendants(ctx, node.nodeId).map((n) => n.kind);
}

// The observed fixed-width constraint in px, or null (recorded, never guessed — the same rule
// as the legacy two-column/grid composers).
export function fixedWidthOf(node: NodeIRNode): number | null {
   const c = node.layout.constraints.find(
      (x) => x.axis === "width" && x.type === "fixed",
   );
   const px = c ? Number(c.value) : NaN;
   return Number.isFinite(px) && px > 0 ? px : null;
}

// Integer percent apportionment (largest remainder, deterministic; tie -> lower index; sums to
// exactly 100). Mirrors compose.ts's percentSplit until the Integrator consolidates the two —
// compose.ts's copy is pre-#72 and not editable by handler lanes.
export function percentSplitOf(widths: number[]): number[] {
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

export function entryBaseOf(
   node: NodeIRNode,
   locator: string | null,
): Pick<MappingEntry, "sourceNodeId" | "sourceName" | "sourceLocator"> {
   return {
      sourceNodeId: node.nodeId,
      ...(node.name ? { sourceName: node.name } : {}),
      ...(locator ? { sourceLocator: locator } : {}),
   };
}

// ---- Accountable-record helpers (the shared exclusion/decoration/fold/gap table) --------------

export function pushWarning(
   ctx: HandlerContext,
   message: string,
   nodeId: string,
): void {
   const d: Diagnostic = {
      code: "NOT_VERIFIED",
      severity: "warning",
      message,
      subject: { type: "node", id: nodeId },
   };
   ctx.pushDiagnostic(d);
}

export function pushMissingEvidence(
   ctx: HandlerContext,
   message: string,
   nodeId: string,
): void {
   const d: Diagnostic = {
      code: "EVIDENCE_MISSING",
      severity: "warning",
      message,
      subject: { type: "node", id: nodeId },
   };
   ctx.pushDiagnostic(d);
}

export function accountExcluded(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
   note: string,
): void {
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "excluded",
      note,
   });
}

// Decoration (explicitly projected or the DECOR/icon bucket): a typed NOT_VERIFIED warning plus
// a gap entry — never silently dropped, never approximated.
export function accountDecoration(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
): void {
   pushWarning(
      ctx,
      `Decoration '${node.name}' has no native Page Builder equivalent in this shape's composed fields; excluded from content with an explicit record — never silently dropped, never approximated.`,
      node.nodeId,
   );
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "gap",
      note: "Decoration without a native equivalent; explicitly excluded (not silently dropped).",
   });
}

// Structural container folded into the composed structure (no separate native container; its
// composable descendants compose inside the emitted elements).
export function accountStructuralFold(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
   target: MappingEntry["target"],
   note: string,
): void {
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "mapped",
      ...(target ? { target } : {}),
      note,
   });
}

export function accountUnsupported(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
   shapeLabel: string,
): void {
   pushWarning(
      ctx,
      `Node '${node.name}' (kind '${node.kind}', role '${node.role ?? "none"}') is outside the ${shapeLabel} composition table; not composed.`,
      node.nodeId,
   );
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "gap",
      note: `Node outside the ${shapeLabel} composition table; not composed.`,
   });
}

// A missing content-manifest entry: typed EVIDENCE_MISSING warning + gap mapping entry — never
// invented content.
export function accountMissingManifest(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
   what: string,
   note: string,
): void {
   pushMissingEvidence(
      ctx,
      `No content-manifest ${what} entry for '${node.name}' (${locator ?? "no locator"}); left empty — never invented.`,
      node.nodeId,
   );
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "gap",
      note,
   });
}
