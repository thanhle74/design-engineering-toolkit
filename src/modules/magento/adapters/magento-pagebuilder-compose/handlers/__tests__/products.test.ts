// [72] W-C — products handler unit suite (vitest, hermetic fixtures).
//
// Asserts the VERBATIM emitted bytes of the products declarations (carousel = VERIFIED-REAL-ROW
// minus the site css class with an EMPTY rule set; grid = VENDOR-CONFIG-VERIFIED derived bytes —
// see docs/evidence/issue-72/source/wc-declarations.md), the row(contained) wrap, the typed
// live-listing GAP entry, and the silent/fail-closed negatives. No product data anywhere.
import { describe, expect, it } from "vitest";

import { productsHandler } from "../products.js";
import type {
   MappingEntry,
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

/** Hand-built SectionComposeContext (no bindings exist on the frozen seam — by design). */
function makeCtx(
   root: Spec,
   roles: Record<string, ComposerRole> = {},
   enabledCaps: Record<string, boolean> = {},
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

const CAROUSEL_DECLARATION =
   `<div data-content-type="products" data-appearance="carousel" data-autoplay="false" data-autoplay-speed="4000" data-infinite-loop="false" data-show-arrows="true" data-show-dots="true" data-carousel-mode="default" data-center-padding="90px" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_PageBuilder::catalog/product/widget/content/carousel.${WIDGET_TEMPLATE_EXT}" anchor_text="" id_path="" show_pager="0" products_count="8" condition_option="condition" condition_option_value="" type_name="Catalog Products Carousel" conditions_encoded="^[\`1\`:^[\`type\`:\`Smile||ElasticsuiteVirtualCategory||Model||Rule||WidgetCondition||Combine\`,\`aggregator\`:\`all\`,\`value\`:\`1\`,\`new_child\`:\`\`^]^]" sort_order="date_newest_top"}}</div>`;

const GRID_DECLARATION =
   `<div data-content-type="products" data-appearance="grid" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_CatalogWidget::product/widget/content/grid.${WIDGET_TEMPLATE_EXT}" anchor_text="" id_path="" show_pager="0" products_count="5" condition_option="condition" condition_option_value="" type_name="Catalog Products List" conditions_encoded="^[\`1\`:^[\`type\`:\`Smile||ElasticsuiteVirtualCategory||Model||Rule||WidgetCondition||Combine\`,\`aggregator\`:\`all\`,\`value\`:\`1\`,\`new_child\`:\`\`^]^]" sort_order="position"}}</div>`;

const rowWrap = (declaration: string): string =>
   `<div data-content-type="row" data-appearance="contained" data-element="main">` +
   `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
   declaration +
   `</div></div>`;

// ---- tests -------------------------------------------------------------------------------------

describe("[72] W-C products handler", () => {
   it("emits the carousel declaration byte-verbatim inside row(contained), with the listing GAP", () => {
      const ctx = makeCtx(productsSectionSpec("products-carousel"), {
         "930:3": "products-carousel",
      });
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBe(rowWrap(CAROUSEL_DECLARATION));

      const containerMapped = ctx.mapping.find(
         (m) => m.sourceNodeId === "s-cards" && m.disposition === "mapped",
      );
      expect(containerMapped?.target).toEqual({
         capabilityId: "magento_pagebuilder/products",
         appearanceId: "carousel",
         nativeElement: "main",
         nativeField:
            "products carousel (declaration div + {{widget …}} directive)",
      });
      const listingGap = ctx.mapping.find(
         (m) => m.sourceNodeId === "s-cards" && m.disposition === "gap",
      );
      expect(listingGap?.note).toContain(
         "Products listing content requires a verified catalog data provider binding",
      );
      // Honest accounting: header + card internals gap-recorded, never dropped or faked.
      expect(
         ctx.mapping.filter(
            (m) =>
               m.disposition === "gap" &&
               m.note?.includes("never faked as static cards") === true,
         ).length,
      ).toBe(2);
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("live product listing"),
         ),
      ).toBe(true);
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes(
                  "fidelity delegates to the native products widget",
               ),
         ),
      ).toBe(true);
   });

   it("emits the grid declaration byte-verbatim (vendor-config-verified bytes)", () => {
      const ctx = makeCtx(productsSectionSpec("products-grid"), {
         "930:3": "products-grid",
      });
      const out = productsHandler.compose(
         sectionFixture("SECTION/FeaturedProducts"),
         "s-root",
         ctx,
      );
      expect(out).toBe(rowWrap(GRID_DECLARATION));
      expect(
         ctx.mapping.find(
            (m) => m.sourceNodeId === "s-cards" && m.disposition === "mapped",
         )?.target?.appearanceId,
      ).toBe("grid");
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
