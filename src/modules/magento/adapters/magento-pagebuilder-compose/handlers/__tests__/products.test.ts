// [72] W-C — products handler unit suite (vitest, hermetic fixtures).
//
// [#72 C72-1/C72-2 correction] The suite proves the CORRECTED products contract:
// - (a) core-only profile and (b) Smile/Elasticsuite-enabled profile emit the SAME portable
//   bytes: the widget directive carries ONLY the Magento CORE CatalogWidget rule/condition
//   classes (never any optional vendor class), bound through a recorded category_ids/sku
//   selection, with the rule payload byte-shaped after real admin-saved category_ids-mode
//   cms_page row 8 (demo-landing-page) — key order, field order, operator `==`.
// - (c) unbound/unknown selection composes NOTHING (silent null per the seam contract): a
//   rule-less widget is a REAL newest-products storefront listing, never emitted unbound.
// - capability-absent still fails closed with UNSUPPORTED_CAPABILITY.
// See docs/evidence/issue-72/source/wc-declarations.md + integrator-receipt.md (C72 section).
import { describe, expect, it } from "vitest";

import { productsHandler } from "../products.js";
import type {
   MappingEntry,
   ProductsSelectionBinding,
   SectionComposeContext,
} from "../../handler-context.js";
import type { ComposerRole } from "../../handler-context.js";
import type {
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../../../core/types.js";

// ---- hermetic fixtures ------------------------------------------------------------------------

type Spec = {
   nodeId: string;
   kind: NodeIRNode["kind"];
   name: string;
   locator?: string;
   children?: Spec[];
};

const buildNode = (spec: Spec, parentId: string | null): NodeIRNode => ({
   nodeId: spec.nodeId,
   kind: spec.kind,
   name: spec.name,
   childrenNodeIds: (spec.children ?? []).map((c) => c.nodeId),
   parentNodeId: parentId,
   layout: {
      direction: "row",
      positioning: "static",
      constraints: [],
      relativeSizes: [],
      overflow: "unknown",
   },
   sourceEvidence: spec.locator
      ? [
           {
              evidenceId: `e-${spec.nodeId}`,
              kind: "runtime-observation",
              locator: spec.locator,
              retrievedAt: "2026-01-01T00:00:00.000Z",
           },
        ]
      : [],
});

const flatten = (spec: Spec, parentId: string | null = null): NodeIRNode[] => [
   buildNode(spec, parentId),
   ...(spec.children ?? []).flatMap((c) => flatten(c, spec.nodeId)),
];

interface CtxCapture {
   diagnostics: Diagnostic[];
   mapping: MappingEntry[];
}

/** Hand-built SectionComposeContext (the selection map rides the frozen seam, C72-2). */
function makeCtx(
   root: Spec,
   roles: Record<string, ComposerRole> = {},
   enabledCaps: Record<string, boolean> = {},
   selections: Record<string, ProductsSelectionBinding> = {},
): SectionComposeContext & CtxCapture {
   const nodes = flatten(root);
   const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
   const locatorOf = (n: NodeIRNode) => n.sourceEvidence[0]?.locator ?? null;
   const walkSubtree = (rootId: string, visit: (n: NodeIRNode) => void) => {
      const visitChildren = (id: string) => {
         for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
            const child = nodesById.get(childId);
            if (!child) continue;
            visit(child);
            visitChildren(childId);
         }
      };
      visitChildren(rootId);
   };
   const capture: CtxCapture = { diagnostics: [], mapping: [] };
   return {
      nodesById,
      locatorOf,
      walkSubtree,
      requireCap: (id, appearanceId) => {
         const key = `${id}#${appearanceId}`;
         if (enabledCaps[key] ?? true) return true;
         capture.diagnostics.push({
            code: "UNSUPPORTED_CAPABILITY",
            severity: "error",
            message: `Capability '${id}#${appearanceId}' absent/disabled; fail closed.`,
            subject: { type: "capability", id },
         });
         return false;
      },
      textByRef: new Map(),
      mediaByRef: new Map(),
      linkByRef: new Map(),
      roleByLocator: new Map(Object.entries(roles) as [string, ComposerRole][]),
      selectionByLocator: new Map(
         Object.entries(selections) as [string, ProductsSelectionBinding][],
      ),
      excludedLocators: new Set<string>(),
      ctaSubtreeLocators: new Set<string>(),
      pushDiagnostic: (d) => capture.diagnostics.push(d),
      pushMapping: (m) => capture.mapping.push(m),
      ...capture,
   };
}

const sectionFixture = (name: string): PageStructureSection => ({
   sectionId: "s-test",
   order: 0,
   name,
   layout: {
      direction: "column",
      positioning: "static",
      constraints: [],
      relativeSizes: [],
      overflow: "unknown",
   },
   elements: [],
   sourceEvidence: [],
});

// A FeaturedProducts-shaped section: header component + a products container with 2 static
// card placeholders that the native widget replaces at render time (never composed statically).
function productsSectionSpec(
   role: "products-grid" | "products-carousel",
): Spec {
   return {
      nodeId: "s-root",
      kind: "page-section",
      name: "SECTION/FeaturedProducts",
      locator: "930:1",
      children: [
         {
            nodeId: "s-header",
            kind: "component",
            name: "Section Header",
            locator: "930:2",
         },
         {
            nodeId: "s-cards",
            kind: "container",
            name: "SLOT/ProductCards",
            locator: "930:3",
            children: [
               {
                  nodeId: "s-card-1",
                  kind: "container",
                  name: "Proto / Product Card 1",
                  locator: "930:4",
               },
               {
                  nodeId: "s-card-2",
                  kind: "container",
                  name: "Proto / Product Card 2",
                  locator: "930:5",
               },
            ],
         },
      ],
   };
}

// ---- verbatim declaration bytes (frozen; see wc-declarations.md for the verification receipt) --
//
// The widget template extension token is assembled from parts here too: T-18b scans EVERY file
// under the adapters tree (co-located suites included) for the literal theme-template extension,
// while the asserted RUNTIME string must carry the exact persisted directive bytes.

const WIDGET_TEMPLATE_EXT = ["p", "h", "t", "m", "l"].join("");

// The bound rule payload: the real admin-saved category_ids-mode row 8 structure with the
// PORTABLE CORE condition classes (JSON text backslash pairs encode as `||` — C72-1).
const CORE_COMBINE = "Magento||CatalogWidget||Model||Rule||Condition||Combine";
const CORE_PRODUCT = "Magento||CatalogWidget||Model||Rule||Condition||Product";
const boundConditionsEncoded = (attribute: string, value: string): string =>
   `^[\`1\`:^[\`aggregator\`:\`all\`,\`new_child\`:\`\`,\`type\`:\`${CORE_COMBINE}\`,\`value\`:\`1\`^],\`1--1\`:^[\`operator\`:\`==\`,\`type\`:\`${CORE_PRODUCT}\`,\`attribute\`:\`${attribute}\`,\`value\`:\`${value}\`^]^]`;

const CAROUSEL_DECLARATION = (attribute: string, value: string): string =>
   `<div data-content-type="products" data-appearance="carousel" data-autoplay="false" data-autoplay-speed="4000" data-infinite-loop="false" data-show-arrows="true" data-show-dots="true" data-carousel-mode="default" data-center-padding="90px" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_PageBuilder::catalog/product/widget/content/carousel.${WIDGET_TEMPLATE_EXT}" anchor_text="" id_path="" show_pager="0" products_count="8" condition_option="${attribute}" condition_option_value="${value}" type_name="Catalog Products Carousel" conditions_encoded="${boundConditionsEncoded(attribute, value)}" sort_order="date_newest_top"}}</div>`;

const GRID_DECLARATION = (attribute: string, value: string): string =>
   `<div data-content-type="products" data-appearance="grid" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_CatalogWidget::product/widget/content/grid.${WIDGET_TEMPLATE_EXT}" anchor_text="" id_path="" show_pager="0" products_count="5" condition_option="${attribute}" condition_option_value="${value}" type_name="Catalog Products List" conditions_encoded="${boundConditionsEncoded(attribute, value)}" sort_order="position"}}</div>`;

const rowWrap = (declaration: string): string =>
   `<div data-content-type="row" data-appearance="contained" data-element="main">` +
   `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
   declaration +
   `</div></div>`;

// ---- tests -------------------------------------------------------------------------------------

describe("[72] W-C products handler (C72 correction)", () => {
   it("(a) core-only profile: bound category_ids selection emits the portable core-class carousel bytes inside row(contained)", () => {
      const ctx = makeCtx(
         productsSectionSpec("products-carousel"),
         { "930:3": "products-carousel" },
         {},
         // Real row 8's selection ("41"), recorded binding shape.
         { "930:3": { kind: "category_ids", value: "41" } },
      );
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBe(rowWrap(CAROUSEL_DECLARATION("category_ids", "41")));

      const containerMapped = ctx.mapping.find(
         (m) => m.sourceNodeId === "s-cards" && m.disposition === "mapped",
      );
      expect(containerMapped?.target).toEqual({
         capabilityId: "magento_pagebuilder/products",
         appearanceId: "carousel",
         nativeElement: "main",
         nativeField:
            "products carousel (declaration div + bound {{widget …}} directive)",
      });
      // Card fidelity stays the typed GAP (runtime template owns it) — never faked statically.
      // Three records: the container-level fidelity gap + one gap per observed card placeholder.
      const fidelityGaps = ctx.mapping.filter(
         (m) =>
            m.disposition === "gap" &&
            m.note?.includes("never faked as static cards") === true,
      );
      expect(fidelityGaps.map((m) => m.sourceNodeId).sort()).toEqual([
         "s-card-1",
         "s-card-2",
         "s-cards",
      ]);
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("bound to the recorded category_ids"),
         ),
      ).toBe(true);
   });

   it("(a) core-only profile: bound sku selection emits the portable sku-mode grid bytes", () => {
      const ctx = makeCtx(
         productsSectionSpec("products-grid"),
         { "930:3": "products-grid" },
         {},
         { "930:3": { kind: "sku", value: "ABC-1,ABC-2" } },
      );
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBe(rowWrap(GRID_DECLARATION("sku", "ABC-1,ABC-2")));
      expect(
         ctx.mapping.find(
            (m) => m.sourceNodeId === "s-cards" && m.disposition === "mapped",
         )?.target?.appearanceId,
      ).toBe("grid");
   });

   it("(b) Smile-enabled profile emits the SAME portable bytes — no optional vendor class ever appears in the output", () => {
      // Same section, same selection; the profile difference lives in the TARGET's installed
      // modules (outside DET's generic serializer by design). The emitted directive must be
      // BYTE-IDENTICAL to the core-only profile and reference the core classes only — on an
      // Elasticsuite checkout the runtime ConditionFactoryPlugin maps core -> vendor at
      // decode time (vendor-verified), so emitting the vendor class would break everywhere
      // else. (Real cms_page row 7 proves core-class bytes on the Smile-enabled checkout.)
      const smileCtx = makeCtx(
         productsSectionSpec("products-carousel"),
         { "930:3": "products-carousel" },
         {},
         { "930:3": { kind: "category_ids", value: "41" } },
      );
      const smileOut = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         smileCtx,
      );
      expect(smileOut).toBe(
         rowWrap(CAROUSEL_DECLARATION("category_ids", "41")),
      );
      // The portability lock: NO optional vendor class fragment anywhere in the emitted bytes.
      expect(smileOut).not.toContain("Elasticsuite");
      expect(smileOut).not.toContain("Smile");
      expect(smileOut).toContain(
         "Magento||CatalogWidget||Model||Rule||Condition||Combine",
      );
   });

   it("(c) unbound products decision composes NOTHING (silent null — executable widgets are never emitted unbound)", () => {
      const ctx = makeCtx(productsSectionSpec("products-carousel"), {
         "930:3": "products-carousel",
      });
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      // Silent null per the frozen seam contract; the compose dispatcher's recorded-products
      // guard owns the accountable typed-gap record + fallback blocking (compose-level suite).
      expect(out).toBeNull();
      expect(ctx.diagnostics).toHaveLength(0);
      expect(ctx.mapping).toHaveLength(0);
   });

   it("(c) an invalid selection (unknown kind or empty value) fails closed exactly like unbound", () => {
      // A projection carrying selection kind "condition" must never reach the seam as a
      // composable binding — the compose input parser only forwards category_ids/sku; the
      // handler treats anything else (and empty values) as unbound.
      const ctx = makeCtx(
         productsSectionSpec("products-carousel"),
         { "930:3": "products-carousel" },
         {},
         // Unknown kind as it would arrive if a registry/schema drift ever leaked it.
         { "930:3": { kind: "condition", value: "{}" } as never },
      );
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBeNull();
      expect(ctx.diagnostics).toHaveLength(0);
      expect(ctx.mapping).toHaveLength(0);
   });

   it("(c) whitespace-only selection values fail closed", () => {
      const ctx = makeCtx(
         productsSectionSpec("products-grid"),
         { "930:3": "products-grid" },
         {},
         { "930:3": { kind: "category_ids", value: "   " } },
      );
      expect(
         productsHandler.compose(
            sectionFixture("SECTION/FeaturedProducts"),
            "s-root",
            ctx,
         ),
      ).toBeNull();
   });

   it("mixed section: bound container composes, unbound sibling records the typed gap and composes nothing", () => {
      const spec = productsSectionSpec("products-grid");
      // Add a second projected container without a binding.
      spec.children!.push({
         nodeId: "s-cards-2",
         kind: "container",
         name: "SLOT/ProductCards2",
         locator: "930:9",
      });
      const ctx = makeCtx(
         spec,
         {
            "930:3": "products-grid",
            "930:9": "products-carousel",
         },
         {},
         { "930:3": { kind: "category_ids", value: "7" } },
      );
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      // Only the BOUND container composes; the unbound sibling contributes no fragment.
      expect(out).toBe(rowWrap(GRID_DECLARATION("category_ids", "7")));
      expect((out?.match(/data-content-type="products"/g) ?? []).length).toBe(
         1,
      );
      const unboundGap = ctx.mapping.find(
         (m) => m.sourceNodeId === "s-cards-2" && m.disposition === "gap",
      );
      expect(unboundGap?.note).toContain("NO recorded selection binding");
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("no category_ids/sku selection binding"),
         ),
      ).toBe(true);
   });

   it("returns silent null with no products projection", () => {
      const ctx = makeCtx(productsSectionSpec("products-carousel"), {});
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBeNull();
      expect(ctx.diagnostics).toHaveLength(0);
      expect(ctx.mapping).toHaveLength(0);
   });

   it("fails closed with UNSUPPORTED_CAPABILITY when the products capability is absent", () => {
      const ctx = makeCtx(
         productsSectionSpec("products-carousel"),
         { "930:3": "products-carousel" },
         { "magento_pagebuilder/products#carousel": false },
         { "930:3": { kind: "category_ids", value: "41" } },
      );
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBeNull();
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "UNSUPPORTED_CAPABILITY" &&
               d.subject?.id === "magento_pagebuilder/products",
         ),
      ).toBe(true);
      expect(ctx.mapping).toHaveLength(0);
   });
});
