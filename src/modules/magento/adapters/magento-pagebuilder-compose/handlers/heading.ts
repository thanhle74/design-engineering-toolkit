// [72] Native heading section-shape handler — the tiny editorial composition unit.
//
// Signature (deterministic, structural only): a section whose visible subtree resolves to
// EXACTLY ONE role-resolved heading text (explicit projection or the SLOT naming-contract
// table — one resolution source, shared through the context) and NO other composable content:
// no other role-resolved text/CTA, no media (kind or manifest), no projected decision roles
// (background/column/grid/slide/products). Any decoration rides through the shared accounting
// table as explicit records, never silently dropped. A section that additionally carries a
// content-lead, body or CTA is NOT this shape (those are band shapes — the legacy text-band or
// the header-band handler composes them).
//
// Emission: row(contained) > inner > the VERIFIED-REAL-ROW native heading declaration
// (`<h2 data-content-type="heading" data-appearance="default" data-element="main">Text</h2>`;
// level 2 is the composer's established heading convention — the same level every folded
// heading run uses — and heading_type stays an Admin-editable form field) with the section's
// fixed height persisting as the row inner min-height via the platform's rehydratable
// style-block mechanism.
//
// The exported composeHeadingElement helper is the single heading composition unit reused by
// the header-band and card-grid handlers; the registered handler below composes the standalone
// single-heading section.
import {
   headingElementHtml,
   rowContainedCloseHtml,
   rowContainedOpenHtml,
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   styleBlockHtml,
} from "../elements-editorial.js";
import { pbStyleKey } from "../elements.js";
import type { ComposerRole, MappingEntry } from "../handler-context.js";
import type { PageStructureSection } from "../../../../core/types.js";
import type { NodeIRNode } from "../../../../core/types.js";
import {
   accountDecoration,
   accountExcluded,
   accountMissingManifest,
   accountStructuralFold,
   accountUnsupported,
   entryBaseOf,
   hasDecisionRole,
   normalizeComposerRole,
   HEADING_APPEARANCE,
   HEADING_ID,
   ROW_APPEARANCE,
   ROW_ID,
   visibleDescendants,
   type HandlerContext,
} from "../shapes/handler-support.js";

export const HANDLER_LABEL = "native-heading";

const OTHER_TEXT_ROLES: ReadonlySet<ComposerRole> = new Set<ComposerRole>([
   "content-lead",
   "body",
   "cta",
   "grid-caption",
   "inline-media",
]);

// Compose ONE role-resolved heading node as the native heading element, recording the mapped
// entry. Returns null when the manifest text is missing (an explicit gap is recorded first —
// never invented content); the caller decides whether the remaining shape still composes.
export function composeHeadingElement(
   ctx: HandlerContext,
   node: NodeIRNode,
   locator: string | null,
   note: string,
): string | null {
   const text = locator ? ctx.textByRef.get(locator) : undefined;
   if (text === undefined) {
      accountMissingManifest(
         ctx,
         node,
         locator,
         "text (heading)",
         "No manifest text entry for the heading field; the heading declaration is left out rather than invented.",
      );
      return null;
   }
   const target: MappingEntry["target"] = {
      capabilityId: HEADING_ID,
      appearanceId: HEADING_APPEARANCE,
      nativeElement: "main",
      nativeField: "heading_text (element content; tag = heading_type)",
   };
   ctx.pushMapping({
      ...entryBaseOf(node, locator),
      disposition: "mapped",
      target,
      note,
   });
   return headingElementHtml(2, text);
}

export const headingSectionHandler = {
   id: "wb-native-heading",
   compose(
      section: PageStructureSection,
      sectionNodeId: string,
      ctx: HandlerContext,
   ): string | null {
      // ---- Silent shape predicate (no records on a shape miss) ---------------------------------
      if (hasDecisionRole(ctx, sectionNodeId)) return null;
      const scope = visibleDescendants(ctx, sectionNodeId);
      const headingNodes: NodeIRNode[] = [];
      for (const node of scope) {
         const loc = ctx.locatorOf(node);
         if (
            loc &&
            (ctx.excludedLocators.has(loc) || ctx.ctaSubtreeLocators.has(loc))
         )
            continue; // pre-excluded subtree; accounted separately below
         if (node.kind === "media") return null;
         if (loc && ctx.mediaByRef.has(loc)) return null;
         const role = normalizeComposerRole(ctx.resolveComposerRole(node));
         if (role === "heading") headingNodes.push(node);
         else if (role !== undefined && OTHER_TEXT_ROLES.has(role)) return null;
      }
      if (headingNodes.length !== 1) return null;

      // ---- Registry gate (the shape matched; refusals are typed diagnostics) -------------------
      const shapeReady =
         ctx.requireCap(ROW_ID, ROW_APPEARANCE) &&
         ctx.requireCap(HEADING_ID, HEADING_APPEARANCE);
      if (!shapeReady) return null;

      // ---- Composition --------------------------------------------------------------------------
      const headingNode = headingNodes[0] as NodeIRNode;
      const headingLocator = ctx.locatorOf(headingNode);
      const headingHtml = composeHeadingElement(
         ctx,
         headingNode,
         headingLocator,
         "Role-resolved display heading composed as the native heading declaration (level 2 = the composer's established heading convention; heading_type stays Admin-editable).",
      );

      // Section-level height: the one layout primitive the legacy shapes carry (row inner
      // min-height, rehydratable style block). Its absence is recorded, never guessed.
      const sectionNode = ctx.nodesById.get(sectionNodeId) as NodeIRNode;
      const heightConstraint = section.layout.constraints.find(
         (c) => c.axis === "height" && c.type === "fixed",
      );
      let rowMinHeight: number | undefined;
      if (heightConstraint) {
         const px = Number(heightConstraint.value);
         if (Number.isFinite(px) && px > 0) rowMinHeight = px;
         else
            ctx.pushDiagnostic({
               code: "NOT_VERIFIED",
               severity: "warning",
               message: `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`,
               subject: { type: "node", id: sectionNodeId },
            });
      } else {
         ctx.pushDiagnostic({
            code: "NOT_VERIFIED",
            severity: "warning",
            message: `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`,
            subject: { type: "node", id: sectionNodeId },
         });
      }
      const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
      const rules: string[] = [];
      if (rowMinHeight !== undefined)
         rules.push(rowInnerMinHeightRule(innerKey, rowMinHeight));

      // ---- Accounting: every visible node lands exactly once -----------------------------------
      // Reverse document order (children before parents): a structural container folds when its
      // WHOLE visible subtree is already accounted (the heading, excluded records, decoration
      // gaps) and nothing under it is unsupported — transparency proven by construction. A
      // container holding any unaccounted node is itself unsupported (recorded, never a silent
      // flatten).
      const accounted = new Set<string>([headingNode.nodeId]);
      const foldBlocked = new Set<string>();
      const sectionLocator = ctx.locatorOf(sectionNode);
      for (const node of [...scope].reverse()) {
         if (accounted.has(node.nodeId)) continue;
         const loc = ctx.locatorOf(node);
         if (loc && ctx.excludedLocators.has(loc)) {
            accountExcluded(
               ctx,
               node,
               loc,
               "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            );
            continue;
         }
         if (loc && ctx.ctaSubtreeLocators.has(loc)) {
            accountExcluded(
               ctx,
               node,
               loc,
               "Inside a projected CTA instance that composes through its manifest label; the rest is the CTA's visual chrome.",
            );
            continue;
         }
         if (
            (loc && ctx.roleByLocator.get(loc) === "decoration") ||
            node.role === "DECOR" ||
            node.kind === "icon"
         ) {
            accounted.add(node.nodeId);
            accountDecoration(ctx, node, loc);
            continue;
         }
         if (node.kind === "container" || node.kind === "component") {
            const descendants = visibleDescendants(ctx, node.nodeId);
            const transparent =
               descendants.length > 0 &&
               descendants.every(
                  (d) => accounted.has(d.nodeId) && !foldBlocked.has(d.nodeId),
               );
            accounted.add(node.nodeId);
            if (transparent) {
               accountStructuralFold(
                  ctx,
                  node,
                  loc,
                  {
                     capabilityId: ROW_ID,
                     appearanceId: ROW_APPEARANCE,
                     nativeElement: "row (contained)",
                     nativeField: "structural container folded",
                  },
                  "Structural container folded into the row; its whole visible subtree composes (the heading) or is explicitly recorded (excluded/decoration); no separate native container.",
               );
            } else {
               foldBlocked.add(node.nodeId);
               accountUnsupported(ctx, node, loc, HANDLER_LABEL);
            }
            continue;
         }
         accounted.add(node.nodeId);
         foldBlocked.add(node.nodeId);
         accountUnsupported(ctx, node, loc, HANDLER_LABEL);
      }

      ctx.pushMapping({
         ...entryBaseOf(sectionNode, sectionLocator ?? null),
         disposition: "mapped",
         target: {
            capabilityId: ROW_ID,
            appearanceId: ROW_APPEARANCE,
            nativeElement: "main",
            nativeField: "row(contained) > heading(default)",
         },
         note: "Single-heading section composed as a contained row carrying the native heading declaration; the section's fixed height persists as the row inner min-height via the platform's rehydratable style-block mechanism; mobile breakpoint not composed.",
      });
      return (
         styleBlockHtml(rules) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(rowMinHeight !== undefined ? innerKey : undefined) +
         (headingHtml ?? "") +
         rowContainedCloseHtml()
      );
   },
};
