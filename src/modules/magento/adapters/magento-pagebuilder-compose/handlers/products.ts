// [72] W-C — native products (grid/carousel) section-shape handler (modular PB composer).
//
// Signature (deterministic, role-evidence-driven — NEVER name/identity branching): a section
// subtree carrying >= 1 visible container explicitly projected `products-grid` or
// `products-carousel` (ctx.roleByLocator). Grid-vs-carousel intent is never inferred from peer
// repetition or container direction — the projection vocabulary (committed in #72's v1.5.0
// additive extension) carries the recorded decision; no projection -> silent null.
//
// Emitted chain: one row(contained) > row inner > products declaration per projected container,
// in document order. Parent evidence: the pinned registry declares NO parents policy
// (allowedChildren: [] on every entry), so the wrapping mirrors the VERIFIED-REAL-ROW parent
// chain (real cms_page rows persist products directly inside row(contained) > inner; products
// itself denies children per products.xml <children default_policy="deny"/>).
//
// HONESTY RULE (frozen contract; registry dataContext.requiresRuntimeData=true): the emitted
// declaration is the EDITABLE editor-default state — no product cards, images, names or prices
// are ever composed. Live product LISTING requires a catalog data provider; the frozen handler
// seam carries no binding input at all (SectionComposeContext exposes no bindings), and the
// component-binding-map schema has no provider field (propsTransform targets acceptedProps, and
// magento_pagebuilder/products declares acceptedProps: []) — so the listing is a typed GAP
// mapping entry per container, never approximated.
//
// This handler is NOT wired into the compose dispatcher by this lane — the Integrator registers
// handlers/registry.ts after review (frozen contract rule 5).
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

const LISTING_GAP_NOTE =
   "Products listing content requires a verified catalog data provider binding; the frozen handler seam carries no binding input (and magento_pagebuilder/products declares acceptedProps: []), so the live listing stays a declared gap — the declaration composes in the editor-default state and no product data is invented.";

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
      if (role === "products-grid" || role === "products-carousel")
         found.push({
            node,
            appearance: role === "products-grid" ? "grid" : "carousel",
         });
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
      const containers = collectProjectedContainers(sectionNodeId, ctx);
      if (containers.length === 0) return null;

      // ---- registry gate, fail closed BEFORE any emission --------------------------------------
      if (!ctx.requireCap(ROW_ID, ROW_APPEARANCE)) return null;
      for (const appearance of ["grid" as const, "carousel" as const].filter(
         (a) => containers.some((c) => c.appearance === a),
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
         note: `Section composed as native row(contained) > products x${containers.length} per the pinned declarations (registry declares no parents policy; the row wrap mirrors the real admin-saved rows' parent chain); the row provides the platform's standard top-level container.`,
      });

      // ---- per-container records + fragments -----------------------------------------------------
      const inProducts = new Set<string>();
      const fragments: string[] = [];
      for (const { node, appearance } of containers) {
         const loc = ctx.locatorOf(node);
         // The container's declaration itself -> the native products content type.
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "mapped",
            target: {
               capabilityId: PRODUCTS_ID,
               appearanceId: appearance,
               nativeElement: "main",
               nativeField: `products ${appearance} (declaration div + {{widget …}} directive)`,
            },
            note: `Projected products container composed as native products(${appearance}); the directive persists the editable editor-default state (empty rule set — no product data).`,
         });
         // Live listing: typed GAP (no verified provider binding exists in the frozen seam).
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "gap",
            note: LISTING_GAP_NOTE,
         });
         ctx.pushDiagnostic(
            diag(
               `Products container '${node.name}' (${
                  loc ?? "no locator"
               }): the ${appearance} declaration composes, but the live product listing requires a verified catalog data provider binding — which products listing shows is a typed gap, never faked.`,
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
               productsDeclarationHtml(appearance) +
               `</div>` +
               `</div>`,
         );
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
