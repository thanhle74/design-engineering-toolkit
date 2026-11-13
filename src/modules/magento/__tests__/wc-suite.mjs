// Issue #72 W-C suite: native slider/slide/products section-shape handlers, end-to-end over the
// COMPILED dist modules (the vitest suites cover the source; this cross-validates the built
// bytes the Integrator's dispatcher will import). Three checks:
//   WC-T1 — slider happy path: two projected slides (linked + empty_link variants) compose the
//           VERIFIED-REAL-ROW byte chain verbatim, with honest accounting.
//   WC-T2 — products declarations byte-verbatim (carousel = VERIFIED-REAL-ROW minus the site css
//           class with an EMPTY rule set; grid = vendor-config-verified), inside row(contained).
//   WC-T3 — fail-closed gate + honesty: absent slider capability -> UNSUPPORTED_CAPABILITY + null;
//           no products projection -> silent null; live listing stays a typed GAP (no bindings on
//           the frozen seam, acceptedProps: [] in the registry).
// Fixtures are synthesized from the observed declaration shapes; no machine paths, no timestamps.
import assert from "node:assert";

import { pbStyleKey } from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/elements.js";
import { productsDeclarationHtml } from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/elements-native.js";
import { productsHandler } from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/handlers/products.js";
import { sliderSlideHandler } from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/handlers/slider-slide.js";

// ---- hermetic fixture machinery (plain-JS twin of the vitest suites' context) ------------------

const node = (spec, parentId) => ({
   nodeId: spec.nodeId,
   kind: spec.kind,
   name: spec.name,
   childrenNodeIds: (spec.children ?? []).map((c) => c.nodeId),
   parentNodeId: parentId,
   layout: {
      direction: "column",
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

const flatten = (spec, parentId = null) => [
   node(spec, parentId),
   ...(spec.children ?? []).flatMap((c) => flatten(c, spec.nodeId)),
];

function makeCtx(
   spec,
   {
      roles = {},
      texts = {},
      media = {},
      links = {},
      enabledCaps = {},
      selections = {},
   } = {},
) {
   const nodes = flatten(spec);
   const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
   const locatorOf = (n) => n.sourceEvidence[0]?.locator ?? null;
   const walkSubtree = (rootId, visit) => {
      const visitChildren = (id) => {
         for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
            const child = nodesById.get(childId);
            if (!child) continue;
            visit(child);
            visitChildren(childId);
         }
      };
      visitChildren(rootId);
   };
   const roleByLocator = new Map(Object.entries(roles));
   const ctaSubtreeLocators = new Set();
   const locatorToNode = new Map(
      nodes.filter((n) => locatorOf(n) !== null).map((n) => [locatorOf(n), n]),
   );
   for (const [loc, role] of roleByLocator) {
      if (role !== "cta") continue;
      const rootId = locatorToNode.get(loc)?.nodeId;
      if (!rootId) continue;
      walkSubtree(rootId, (n) => {
         const l = locatorOf(n);
         if (l) ctaSubtreeLocators.add(l);
      });
   }
   const ctx = {
      nodesById,
      locatorOf,
      walkSubtree,
      requireCap: (id, appearanceId) => {
         if (enabledCaps[`${id}#${appearanceId}`] ?? true) return true;
         ctx.diagnostics.push({
            code: "UNSUPPORTED_CAPABILITY",
            severity: "error",
            message: `Capability '${id}#${appearanceId}' absent/disabled; fail closed.`,
            subject: { type: "capability", id },
         });
         return false;
      },
      textByRef: new Map(Object.entries(texts)),
      mediaByRef: new Map(
         Object.entries(media).map(([k, mediaUrl]) => [k, { mediaUrl }]),
      ),
      linkByRef: new Map(Object.entries(links)),
      roleByLocator,
      // [#72 C72-2] recorded product-selection bindings ride the frozen seam.
      selectionByLocator: new Map(Object.entries(selections)),
      excludedLocators: new Set(),
      ctaSubtreeLocators,
      diagnostics: [],
      mapping: [],
      pushDiagnostic: (d) => ctx.diagnostics.push(d),
      pushMapping: (m) => ctx.mapping.push(m),
   };
   return ctx;
}

const section = (name) => ({
   sectionId: "s-suite",
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

const SLIDE_A = "s-aaaa";
const SLIDE_B = "s-bbbb";

function sliderSpec() {
   return {
      nodeId: "s-root",
      kind: "page-section",
      name: "SECTION/Hero/Slider",
      locator: "900:1",
      children: [
         {
            nodeId: SLIDE_A,
            kind: "container",
            name: "Made for Living",
            locator: "900:2",
            children: [
               {
                  nodeId: "s-a-media",
                  kind: "media",
                  name: "Hero 1",
                  locator: "900:3",
               },
               {
                  nodeId: "s-a-heading",
                  kind: "text",
                  name: "The Quiet Grandeur",
                  locator: "900:4",
               },
               {
                  nodeId: "s-a-body",
                  kind: "text",
                  name: "Refined tailoring",
                  locator: "900:5",
               },
               {
                  nodeId: "s-a-cta",
                  kind: "component",
                  name: "Proto / CTA — Arrow",
                  locator: "900:6",
                  children: [
                     {
                        nodeId: "s-a-cta-label",
                        kind: "text",
                        name: "Explore",
                        locator: "900:7",
                     },
                  ],
               },
            ],
         },
         {
            nodeId: SLIDE_B,
            kind: "container",
            name: "Built to Last",
            locator: "910:2",
            children: [
               {
                  nodeId: "s-b-cta",
                  kind: "component",
                  name: "Proto / Button/Primary",
                  locator: "910:5",
               },
            ],
         },
      ],
   };
}

function productsSpec() {
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

const SLIDER_ROLE_CAPS = {
   "900:2": "slide",
   "910:2": "slide",
   "900:4": "heading",
   "900:5": "body",
   "900:6": "cta",
   "910:5": "cta",
};

// [#72 C72-1/C72-2 correction] Bound declaration bytes: the rule payload is the real
// category_ids-mode row 8 structure with the PORTABLE CORE condition classes (JSON text
// backslash pairs encode as `||`); Smile/Elasticsuite classes never appear — the optional
// vendor module swaps them at RUNTIME (ConditionFactoryPlugin), so the vendor name in a
// generic directive would break every core-only checkout.
const CORE_COMBINE = "Magento||CatalogWidget||Model||Rule||Condition||Combine";
const CORE_PRODUCT = "Magento||CatalogWidget||Model||Rule||Condition||Product";
const boundConditionsEncoded = (attribute, value) =>
   `^[\`1\`:^[\`aggregator\`:\`all\`,\`new_child\`:\`\`,\`type\`:\`${CORE_COMBINE}\`,\`value\`:\`1\`^],\`1--1\`:^[\`operator\`:\`==\`,\`type\`:\`${CORE_PRODUCT}\`,\`attribute\`:\`${attribute}\`,\`value\`:\`${value}\`^]^]`;

const CAROUSEL_DECLARATION = (attribute, value) =>
   `<div data-content-type="products" data-appearance="carousel" data-autoplay="false" data-autoplay-speed="4000" data-infinite-loop="false" data-show-arrows="true" data-show-dots="true" data-carousel-mode="default" data-center-padding="90px" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_PageBuilder::catalog/product/widget/content/carousel.phtml" anchor_text="" id_path="" show_pager="0" products_count="8" condition_option="${attribute}" condition_option_value="${value}" type_name="Catalog Products Carousel" conditions_encoded="${boundConditionsEncoded(attribute, value)}" sort_order="date_newest_top"}}</div>`;

const GRID_DECLARATION = (attribute, value) =>
   `<div data-content-type="products" data-appearance="grid" data-element="main">` +
   `{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="Magento_CatalogWidget::product/widget/content/grid.phtml" anchor_text="" id_path="" show_pager="0" products_count="5" condition_option="${attribute}" condition_option_value="${value}" type_name="Catalog Products List" conditions_encoded="${boundConditionsEncoded(attribute, value)}" sort_order="position"}}</div>`;

// ---- checks -------------------------------------------------------------------------------------

export default async function registerWcSuite(checkAsync) {
   checkAsync(
      "WC-T1",
      "slider handler composes two projected slides byte-verbatim over compiled dist (linked + empty_link)",
      async () => {
         const ctx = makeCtx(sliderSpec(), {
            roles: SLIDER_ROLE_CAPS,
            media: { "900:3": "{{media url=wysiwyg/hero-1.jpg}}" },
            texts: {
               "900:4": "The Quiet Grandeur",
               "900:5": "Refined tailoring, knitwear and leather.",
               "900:7": "Explore",
               "910:5": "Mua Ngay",
            },
            links: { "900:6": { linkUrl: "/collections", variant: "primary" } },
         });
         const out = sliderSlideHandler.compose(
            section("SECTION/Hero/Slider"),
            "s-root",
            ctx,
         );
         assert.ok(out !== null, "two projected slides must compose");
         const wrapA = pbStyleKey(`${SLIDE_A}:wrapper`);
         const overlayA = pbStyleKey(`${SLIDE_A}:overlay`);
         const buttonA = pbStyleKey(`${SLIDE_A}:button`);
         const wrapB = pbStyleKey(`${SLIDE_B}:wrapper`);
         const overlayB = pbStyleKey(`${SLIDE_B}:overlay`);
         const buttonB = pbStyleKey(`${SLIDE_B}:button`);
         const slideA =
            `<div data-content-type="slide" data-slide-name="Made for Living" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main">` +
            `<a href="/collections" target="" data-link-type="default" title="" data-element="link">` +
            `<div class="pagebuilder-slide-wrapper" data-background-images="{&quot;desktop_image&quot;:&quot;{{media url=wysiwyg/hero-1.jpg}}&quot;}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-background-lazy-load="false" data-element="wrapper" data-pb-style="${wrapA}">` +
            `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay" data-pb-style="${overlayA}">` +
            `<div class="pagebuilder-poster-content">` +
            `<div data-element="content"><h2>The Quiet Grandeur</h2><p>Refined tailoring, knitwear and leather.</p></div>` +
            `<button type="button" class="pagebuilder-slide-button pagebuilder-button-primary" data-element="button" data-pb-style="${buttonA}">Explore</button>` +
            `</div></div></div></a></div>`;
         const slideB =
            `<div data-content-type="slide" data-slide-name="Built to Last" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main">` +
            `<div data-element="empty_link">` +
            `<div class="pagebuilder-slide-wrapper" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-background-lazy-load="false" data-element="wrapper" data-pb-style="${wrapB}">` +
            `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay" data-pb-style="${overlayB}">` +
            `<div class="pagebuilder-poster-content">` +
            `<div data-element="content"></div>` +
            `<button type="button" class="pagebuilder-slide-button pagebuilder-button-primary" data-element="button" data-pb-style="${buttonB}">Mua Ngay</button>` +
            `</div></div></div></div></div>`;
         const expected =
            `<style>#html-body [data-pb-style=${wrapA}]{background-position:left top;background-size:cover}` +
            `#html-body [data-pb-style=${overlayA}]{background-color:transparent}` +
            `#html-body [data-pb-style=${buttonA}]{opacity:1;visibility:visible}` +
            `#html-body [data-pb-style=${wrapB}]{background-position:left top;background-size:cover}` +
            `#html-body [data-pb-style=${overlayB}]{background-color:transparent}` +
            `#html-body [data-pb-style=${buttonB}]{opacity:1;visibility:visible}</style>` +
            `<div data-content-type="row" data-appearance="contained" data-element="main">` +
            `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
            `<div class="pagebuilder-slider" data-content-type="slider" data-appearance="default" data-autoplay="true" data-autoplay-speed="4000" data-fade="false" data-infinite-loop="true" data-show-arrows="false" data-show-dots="true" data-element="main">${slideA}${slideB}</div>` +
            `</div></div>`;
         assert.equal(out, expected, "slider fragment must be byte-verbatim");
         const gaps = ctx.mapping.filter((m) => m.disposition === "gap");
         assert.equal(gaps.length, 1, "exactly the slide B media gap");
         assert.equal(gaps[0].sourceNodeId, SLIDE_B);
         assert.equal(
            ctx.diagnostics.length,
            2,
            "media-gap + empty_link warnings only",
         );
         return "byte-verbatim row>slider>slide chain, 1 honest gap, 2 honest warnings";
      },
   );

   checkAsync(
      "WC-T2",
      "products declarations byte-verbatim for a BOUND selection (portable core-class rule, real row-8 structure), row-wrapped; unbound composes nothing",
      async () => {
         assert.equal(
            productsDeclarationHtml("carousel", {
               kind: "category_ids",
               value: "41",
            }),
            CAROUSEL_DECLARATION("category_ids", "41"),
         );
         assert.equal(
            productsDeclarationHtml("grid", { kind: "sku", value: "A-1,B-2" }),
            GRID_DECLARATION("sku", "A-1,B-2"),
         );
         // Portability lock: no optional vendor class fragment in any emitted byte.
         for (const decl of [
            CAROUSEL_DECLARATION("category_ids", "41"),
            GRID_DECLARATION("sku", "A-1,B-2"),
         ]) {
            assert.ok(
               !decl.includes("Elasticsuite") && !decl.includes("Smile"),
               "the generic serializer must never emit optional vendor condition classes (C72-1)",
            );
            assert.ok(
               decl.includes(
                  "Magento||CatalogWidget||Model||Rule||Condition||Combine",
               ),
               "the rule references the portable CORE condition classes",
            );
         }
         const ctx = makeCtx(productsSpec(), {
            roles: { "930:3": "products-carousel" },
            selections: { "930:3": { kind: "category_ids", value: "41" } },
         });
         const out = productsHandler.compose(
            section("SECTION/FeaturedProducts"),
            "s-root",
            ctx,
         );
         assert.equal(
            out,
            `<div data-content-type="row" data-appearance="contained" data-element="main"><div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">${CAROUSEL_DECLARATION("category_ids", "41")}</div></div>`,
            "carousel declaration must sit inside row(contained) > inner, byte-verbatim",
         );
         assert.ok(
            ctx.mapping.some(
               (m) =>
                  m.disposition === "gap" &&
                  m.note.includes("never faked as static cards"),
            ),
            "card internals gap-recorded, never faked",
         );
         // (c) unbound: the handler stays silent null (the dispatcher's recorded-products guard
         // owns the accountable typed-gap record + fallback blocking at compose level).
         const unbound = makeCtx(productsSpec(), {
            roles: { "930:3": "products-carousel" },
         });
         assert.equal(
            productsHandler.compose(
               section("SECTION/FeaturedProducts"),
               "s-root",
               unbound,
            ),
            null,
            "unbound products decision composes NOTHING (C72-2 fail closed)",
         );
         assert.equal(unbound.diagnostics.length, 0);
         assert.equal(unbound.mapping.length, 0);
         return "bound carousel+grid declarations verbatim (core classes only), row-wrapped; unbound silent null";
      },
   );

   checkAsync(
      "WC-T3",
      "fail-closed gate + honest silence: absent slider capability, no products projection",
      async () => {
         const gated = makeCtx(sliderSpec(), {
            roles: SLIDER_ROLE_CAPS,
            enabledCaps: { "magento_pagebuilder/slider#default": false },
         });
         const gatedOut = sliderSlideHandler.compose(
            section("SECTION/Hero/Slider"),
            "s-root",
            gated,
         );
         assert.equal(
            gatedOut,
            null,
            "absent slider capability must fail closed",
         );
         assert.ok(
            gated.diagnostics.some(
               (d) =>
                  d.code === "UNSUPPORTED_CAPABILITY" &&
                  d.subject?.id === "magento_pagebuilder/slider",
            ),
            "UNSUPPORTED_CAPABILITY diagnostic recorded by the gate",
         );
         assert.equal(
            gated.mapping.length,
            0,
            "no mapping on the fail-closed path",
         );

         const silent = makeCtx(productsSpec(), {});
         const silentOut = productsHandler.compose(
            section("SECTION/FeaturedProducts"),
            "s-root",
            silent,
         );
         assert.equal(silentOut, null, "no products projection -> silent null");
         assert.equal(silent.diagnostics.length, 0, "non-match stays silent");
         assert.equal(silent.mapping.length, 0, "non-match records nothing");

         const shortSlider = makeCtx(sliderSpec(), {
            roles: { "900:2": "slide" },
         });
         assert.equal(
            sliderSlideHandler.compose(
               section("SECTION/Hero/Slider"),
               "s-root",
               shortSlider,
            ),
            null,
            "fewer than two slides -> silent null",
         );
         assert.equal(shortSlider.diagnostics.length, 0);
         assert.equal(shortSlider.mapping.length, 0);
         return "fail-closed + honest silence enforced on all three negative paths";
      },
   );
}
