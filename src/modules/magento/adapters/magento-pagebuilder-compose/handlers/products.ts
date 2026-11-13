// [72] W-C — native products (grid/carousel) section-shape handler (modular PB composer).
//
// Signature (deterministic, role-evidence-driven — NEVER name/identity branching): a section
// subtree carrying >= 1 visible container explicitly projected `products-grid` or
// `products-carousel` (ctx.roleByLocator). Grid-vs-carousel intent is never inferred from peer
// repetition or container direction — the projection vocabulary (committed in #72's v1.5.0
// additive extension) carries the recorded decision; no projection -> silent null.
//
// Emitted chain (ONLY for a BOUND selection — [72] C72-2 correction): one row(contained) > row
// inner > products declaration per projected container carrying a recorded selection binding
// (ctx.selectionByLocator), in document order. Parent evidence: the pinned registry declares
// NO parents policy (allowedChildren: [] on every entry), so the wrapping mirrors the
// VERIFIED-REAL-ROW parent chain (real cms_page rows persist products directly inside
// row(contained) > inner; products itself denies children per products.xml
// <children default_policy="deny"/>).
//
// C72-2 GATE (fail closed): the `{{widget …ProductsList…}}` directive is a REAL executable
// storefront listing, not an inert placeholder — vendor-verified on the 2.4.8-p5 source
// checkout, an empty rule combine attaches NO SQL constraints and the base collection lists
// the newest products (Magento/CatalogWidget/Block/Product/ProductsList::getBaseCollection +
// getConditions). A products decision WITHOUT a recorded selection binding therefore composes
// NOTHING: the handler records the typed gap (so the intent is accountable, never silently
// dropped) and returns null; the dispatcher's recorded-products guard (compose.ts) then keeps
// the fallback shapes (text-band/hero) from claiming the section, so the section SKIPS
// honestly instead of mapping to the wrong component. Only category_ids/sku bindings are
// accepted (vendor-verified native modes; `condition` mode is refused — a free-form rule
// payload is the C72-1 portability hazard).
//
// FIDELITY RULE (unchanged; registry dataContext.requiresRuntimeData=true): no product cards,
// images, names or prices are ever composed — the card/listing internals delegate to the
// native widget's runtime template and stay typed GAP mapping entries, never approximated.
import type {
   NodeIRNode,
   PageStructureSection,
} from "../../../../core/types.js";
import type { Diagnostic } from "../../../../core/types.js";
import type {
   MappingEntry,
   SectionComposeContext,
   SectionShapeHandler,
} from "../handler-context.js";
import {
   productsDeclarationHtml,
   type ProductsAppearance,
} from "../elements-native.js";

const ROW_ID = "magento_pagebuilder/row";
const ROW_APPEARANCE = "contained";
const PRODUCTS_ID = "magento_pagebuilder/products";

const UNBOUND_GAP_NOTE =
   "Products composes nothing without a recorded selection binding: the native catalog widget directive is a REAL executable storefront listing (an empty rule lists newest products — vendor-verified on 2.4.8-p5 ProductsList::getBaseCollection), so an unbound decision is deferred as a typed gap until the operator records category_ids or sku selection. Never emitted unbound.";

const CARD_FIDELITY_GAP_NOTE =
   "Inside the bound products container; the native widget's runtime template replaces the static card content at render time — never faked as static cards.";

const locatorEntryBase = (
   node: NodeIRNode,
   ctx: SectionComposeContext,
): Pick<MappingEntry, "sourceNodeId" | "sourceName" | "sourceLocator"> => {
   const loc = ctx.locatorOf(node);
   return {
      sourceNodeId: node.nodeId,
      ...(node.name ? { sourceName: node.name } : {}),
      ...(loc ? { sourceLocator: loc } : {}),
   };
};

const diag = (message: string, nodeId: string): Diagnostic => ({
   code: "NOT_VERIFIED",
   severity: "warning",
   message,
   subject: { type: "node", id: nodeId },
});

interface ProjectedProducts {
   node: NodeIRNode;
   appearance: ProductsAppearance;
   locator: string | null;
   selection: { kind: "category_ids" | "sku"; value: string } | null;
}

/** Document-order products-projected visible containers inside the section subtree. */
const collectProjectedContainers = (
   sectionNodeId: string,
   ctx: SectionComposeContext,
): ProjectedProducts[] => {
   const found: ProjectedProducts[] = [];
   ctx.walkSubtree(sectionNodeId, (node) => {
      if (node.visible === false) return;
      const loc = ctx.locatorOf(node);
      if (loc === null) return;
      const role = ctx.roleByLocator.get(loc);
      if (role === "products-grid" || role === "products-carousel") {
         const recorded = ctx.selectionByLocator.get(loc) ?? null;
         found.push({
            node,
            appearance: role === "products-grid" ? "grid" : "carousel",
            locator: loc,
            // Fail closed on anything but the two verified native binding kinds (C72-2).
            selection:
               recorded !== null &&
               (recorded.kind === "category_ids" || recorded.kind === "sku") &&
               recorded.value.trim().length > 0
                  ? { kind: recorded.kind, value: recorded.value.trim() }
                  : null,
         });
      }
   });
   return found;
};

export const productsHandler: SectionShapeHandler = {
   id: "magento-pagebuilder/products",

   compose(
      _section: PageStructureSection,
      sectionNodeId: string,
      ctx: SectionComposeContext,
   ): string | null {
      // ---- signature (silent null when it does not match) --------------------------------------
      // A products-projected section where NO container carries a valid recorded selection
      // stays SILENT null (the seam contract): the dispatcher's recorded-products guard owns
      // the accountable typed-gap record and keeps the fallback shapes away. Never compose an
      // unbound executable widget (C72-2).
      const containers = collectProjectedContainers(sectionNodeId, ctx);
      if (containers.length === 0) return null;
      const bound = containers.filter((c) => c.selection !== null);
      if (bound.length === 0) return null;

      // ---- registry gate, fail closed BEFORE any emission --------------------------------------
      if (!ctx.requireCap(ROW_ID, ROW_APPEARANCE)) return null;
      for (const appearance of ["grid" as const, "carousel" as const].filter(
         (a) => bound.some((c) => c.appearance === a),
      )) {
         if (!ctx.requireCap(PRODUCTS_ID, appearance)) return null;
      }

      const sectionNode = ctx.nodesById.get(sectionNodeId);
      const sectionLocator = sectionNode ? ctx.locatorOf(sectionNode) : null;

      // ---- accountable records ------------------------------------------------------------------
      ctx.pushMapping({
         sourceNodeId: sectionNodeId,
         ...(sectionNode?.name ? { sourceName: sectionNode.name } : {}),
         ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
         disposition: "mapped",
         target: {
            capabilityId: ROW_ID,
            appearanceId: ROW_APPEARANCE,
            nativeElement: "main",
            nativeField: "row (row > products container chain)",
         },
         note: `Section composed as native row(contained) > products x${bound.length} per the pinned declarations (registry declares no parents policy; the row wrap mirrors the real admin-saved rows' parent chain); the row provides the platform's standard top-level container.`,
      });

      // ---- per-container records + fragments -----------------------------------------------------
      const inProducts = new Set<string>();
      const fragments: string[] = [];
      for (const { node, appearance, locator, selection } of bound) {
         const loc = ctx.locatorOf(node);
         // The container's declaration itself -> the native products content type (BOUND).
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "mapped",
            target: {
               capabilityId: PRODUCTS_ID,
               appearanceId: appearance,
               nativeElement: "main",
               nativeField: `products ${appearance} (declaration div + bound {{widget …}} directive)`,
            },
            note: `Projected products container composed as native products(${appearance}) bound to the recorded ${selection!.kind} selection ("${selection!.value}"): the directive carries condition_option/condition_option_value and the synthesized core-class rule, byte-shaped after real admin-saved category_ids-mode cms_page row 8 (demo-landing-page). Card/listing fidelity delegates to the widget's runtime template (typed gap below), never composed statically.`,
         });
         // Card-fidelity: typed GAP (runtime template owns it) — the listing itself is BOUND.
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "gap",
            note: CARD_FIDELITY_GAP_NOTE,
         });
         ctx.pushDiagnostic(
            diag(
               `Products container '${node.name}' (${
                  locator ?? "no locator"
               }): the ${appearance} directive composes bound to the recorded ${
                  selection!.kind
               } selection; the storefront listing follows the widget's native rule engine (category/sku filter, visibility and anchor expansion are native behavior), and static card fidelity stays a typed gap delegated to the runtime template.`,
               node.nodeId,
            ),
         );
         // The container's observed card internals: replaced by the widget's runtime template.
         let descendantCount = 0;
         ctx.walkSubtree(node.nodeId, (inner) => {
            if (inner.visible === false) return;
            descendantCount += 1;
            const innerLoc = ctx.locatorOf(inner);
            if (innerLoc !== null && ctx.excludedLocators.has(innerLoc)) {
               ctx.pushMapping({
                  ...locatorEntryBase(inner, ctx),
                  disposition: "excluded",
                  note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
               });
               return;
            }
            if (innerLoc !== null && ctx.ctaSubtreeLocators.has(innerLoc)) {
               ctx.pushMapping({
                  ...locatorEntryBase(inner, ctx),
                  disposition: "excluded",
                  note: "Inside a projected CTA instance; nothing in the products declaration consumes it here.",
               });
               return;
            }
            ctx.pushMapping({
               ...locatorEntryBase(inner, ctx),
               disposition: "gap",
               note: "Inside the projected products container; the native widget's runtime template replaces the static card content at render time — never faked as static cards.",
            });
         });
         if (descendantCount > 0) {
            ctx.pushDiagnostic(
               diag(
                  `Products container '${node.name}' carries ${descendantCount} observed card-internals node(s); their fidelity delegates to the native products widget's runtime template (registry dataContext.requiresRuntimeData=true) and is not composed statically.`,
                  node.nodeId,
               ),
            );
         }
         inProducts.add(node.nodeId);
         ctx.walkSubtree(node.nodeId, (inner) => inProducts.add(inner.nodeId));

         // One row(contained) per projected container, in document order — the real rows' chain.
         fragments.push(
            `<div data-content-type="row" data-appearance="contained" data-element="main">` +
               `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
               productsDeclarationHtml(appearance, selection!) +
               `</div>` +
               `</div>`,
         );
      }

      // ---- unbound containers in a composing (mixed) section: accountable typed gap ---------------
      // The section composes (at least one bound container), so records are allowed here. An
      // unbound sibling container composes NOTHING — recorded, never silently dropped (C72-2).
      for (const { node, locator, appearance } of containers.filter(
         (c) => c.selection === null,
      )) {
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "gap",
            note: `Projected products ${appearance} container has NO recorded selection binding; ${UNBOUND_GAP_NOTE}`,
         });
         ctx.pushDiagnostic(
            diag(
               `Products container '${node.name}' (${
                  locator ?? "no locator"
               }): recorded ${appearance} decision has no category_ids/sku selection binding — not composed (an unbound widget directive would publish an unfiltered storefront listing); record a selection binding to enable it.`,
               node.nodeId,
            ),
         );
         inProducts.add(node.nodeId);
         ctx.walkSubtree(node.nodeId, (inner) => inProducts.add(inner.nodeId));
      }

      // ---- non-products nodes: honest gap accounting ----------------------------------------------
      const outsideNames: string[] = [];
      ctx.walkSubtree(sectionNodeId, (node) => {
         if (node.visible === false) return;
         if (inProducts.has(node.nodeId)) return;
         const loc = ctx.locatorOf(node);
         const base = locatorEntryBase(node, ctx);
         if (loc !== null && ctx.excludedLocators.has(loc)) {
            ctx.pushMapping({
               ...base,
               disposition: "excluded",
               note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            });
            return;
         }
         if (loc !== null && ctx.ctaSubtreeLocators.has(loc)) {
            ctx.pushMapping({
               ...base,
               disposition: "excluded",
               note: "Inside a projected CTA instance outside the products container; nothing in the products chain consumes it here.",
            });
            return;
         }
         outsideNames.push(`'${node.name}'`);
         ctx.pushMapping({
            ...base,
            disposition: "gap",
            note: "Outside the projected products container(s); the products handler composes the native declarations only.",
         });
      });
      if (outsideNames.length > 0) {
         const sectionLabel = sectionNode?.name ?? sectionNodeId;
         ctx.pushDiagnostic(
            diag(
               `Section '${sectionLabel}' carries nodes outside the projected products container(s) (${outsideNames.join(
                  ", ",
               )}); not composed — recorded, never silently dropped.`,
               sectionNodeId,
            ),
         );
      }

      return fragments.join("");
   },
};
