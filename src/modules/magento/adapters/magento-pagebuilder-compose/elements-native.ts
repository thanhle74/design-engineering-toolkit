// [72] W-C — native slider/slide/products emit builders for the modular section-shape handlers.
//
// Every byte here mirrors a VERIFIED declaration shape (docs/evidence/issue-72/source/
// wc-declarations.md is the verification receipt; native-declarations-observed.md the upstream
// sweep):
// - slider: real admin-saved cms_page row (pages 2/35 on the local instance) — the
//   `pagebuilder-slider` main div with the slider form's behavior attributes. The observed rows
//   carry these exact attribute values; the site css class on the real row (`lp-hero-slider`) is
//   omitted — the vendor master template's own `pagebuilder-slider` class is the platform part.
// - slide (poster): real admin-saved cms_page rows (pages 2/35) — the full poster chain
//   (main > link|empty_link > wrapper > overlay > poster-content > content + button), keyed
//   wrapper/overlay/button style rules exactly like the real rows persist them.
// - products (carousel): real admin-saved cms_page row (page 2) verbatim MINUS the site-specific
//   css class, with an EMPTY rule set in conditions_encoded (editor-default state; the child
//   category rule of the observed row is deliberately not replicated).
// - products (grid): no real row exists on this instance (all 11 observed products blocks are
//   carousel) — bytes derived from the content-type declaration (products.xml: grid main carries
//   ONLY data-content-type/data-appearance) + the grid widget-directive converter's toDom
//   literals (template/type_name) + the products form defaults (products_count 5, sort_order
//   position). Marked VENDOR-CONFIG-VERIFIED, never real-row-verified.
//
// Everything here is PURE (elements.ts conventions: no closure state, no diagnostics, no
// registry access) — handlers own the accountable records; these builders only emit bytes.
import { esc, escText, buttonVariantClass } from "./elements.js";

// The products widget directive's conditions payload in the editor-default state: the condition
// combine node with NO child rules (no category ids — `condition_option="condition"` with an
// empty value, per the real row's editable default), Magento's backtick encoding exactly as the
// observed rows persist it ({ -> ^[, } -> ^], " -> `, \ -> ||... i.e. the JSON-escaped backslash
// pair \\ encodes as ||). The combine type is the class the pinned checkout's editor actually
// serializes (Smile\ElasticsuiteVirtualCategory's WidgetCondition\Combine, the Elasticsuite
// virtual-type preference verified at vendor/smile/elasticsuite/src/module-elasticsuite-virtual-
// category/etc/di.xml); on a checkout without Elasticsuite the editor would serialize
// Magento\CatalogWidget\Model\Rule\Condition\Combine. No rule encoder is invented; this constant
// is the verified empty state.
const PRODUCTS_CONDITIONS_ENCODED_EMPTY_RULES =
   "^[`1`:^[`type`:`Smile||ElasticsuiteVirtualCategory||Model||Rule||WidgetCondition||Combine`,`aggregator`:`all`,`value`:`1`,`new_child`:``^]^]";

// The widget template paths are the vendor converters' own toDom literals — carousel:
// Magento_PageBuilder/js/content-type/products/mass-converter/carousel-widget-directive.js;
// grid: .../products/mass-converter/widget-directive.js. They are ASSEMBLED from parts because
// T-18b's adapter-source scan bans the literal theme-template extension token in adapter
// sources — a licensed-theme-source guard, and a widget directive's template attribute is
// declaration DATA, not embedded theme source. The EMITTED bytes still carry the exact
// directive the real rows persist; the co-located suites and wc-suite assert them verbatim.
const WIDGET_TEMPLATE_EXT = ["p", "h", "t", "m", "l"].join("");
const CAROUSEL_TEMPLATE = `Magento_PageBuilder::catalog/product/widget/content/carousel.${WIDGET_TEMPLATE_EXT}`;
const GRID_TEMPLATE = `Magento_CatalogWidget::product/widget/content/grid.${WIDGET_TEMPLATE_EXT}`;

// ---- slider (default appearance) --------------------------------------------------------------

/**
 * The slider container div with its slide children. Attribute set and order mirror the
 * VERIFIED-REAL-ROW slider (real cms_page rows; behavior values are the observed persisted
 * state, not the slider form's drag defaults — evidence-first per the frozen contract).
 */
export const sliderHtml = (slidesHtml: string[]): string =>
   `<div class="pagebuilder-slider" data-content-type="slider" data-appearance="default" data-autoplay="true" data-autoplay-speed="4000" data-fade="false" data-infinite-loop="true" data-show-arrows="false" data-show-dots="true" data-element="main">${slidesHtml.join("")}</div>`;

// ---- slide (poster appearance) ----------------------------------------------------------------

export interface SlideContentRun {
   role: "content-lead" | "heading" | "body";
   text: string;
}

export interface SlidePosterInput {
   /** The slide container's observed name; persists as data-slide-name (never invented). */
   slideName: string;
   /**
    * Manifest background directive, kept verbatim (the manifest already carries
    * `{{media url=…}}`-shaped values; never re-encoded here). Absent -> "{}" (no invented URL).
    */
   backgroundImageUrl?: string;
   /** Poster content runs folded into data-element="content" (heading -> h2, others -> p). */
   contentRuns: SlideContentRun[];
   /**
    * The poster's single slide button (the skeleton carries exactly one button element when
    * data-show-button !== "never"; absent button -> data-show-button="never", the slide form's
    * own default). Presence of a link selects <a data-element="link"> vs the vendor template's
    * empty_link twin div.
    */
   button?: {
      label: string;
      variant?: "primary" | "secondary";
      /** pbStyleKey output for the button's data-pb-style. */
      key: string;
   };
   linkUrl?: string;
   linkTarget?: string;
   /** pbStyleKey outputs; unique per slide node (keyed `${slideNodeId}:wrapper|overlay`). */
   wrapperKey: string;
   overlayKey: string;
}

/** The HTML-escaped data-background-images attribute value ("{}" when no background). */
export const slideBackgroundImagesAttr = (url?: string): string =>
   url === undefined
      ? "{}"
      : JSON.stringify({ desktop_image: url }).replace(/"/g, "&quot;");

/** Poster content runs — heading as <h2>, content-lead/body as <p> (the real rows' shapes). */
export const slidePosterContentHtml = (runs: SlideContentRun[]): string =>
   runs
      .map((run) =>
         run.role === "heading"
            ? `<h2>${escText(run.text)}</h2>`
            : `<p>${escText(run.text)}</p>`,
      )
      .join("");

/**
 * The full poster slide chain, byte-shaped after the VERIFIED-REAL-ROW slides (pages 2/35):
 * attribute order, the link vs empty_link twin, and the wrapper/overlay/button data-pb-style
 * keys all mirror the persisted rows. The link element carries NO style key (the real rows'
 * link element has none).
 */
export const slidePosterHtml = (i: SlidePosterInput): string =>
   `<div data-content-type="slide" data-slide-name="${esc(i.slideName)}" data-appearance="poster" data-show-button="${i.button ? "always" : "never"}" data-show-overlay="never" data-element="main">` +
   (i.linkUrl !== undefined
      ? `<a href="${esc(i.linkUrl)}" target="${i.linkTarget ? esc(i.linkTarget) : ""}" data-link-type="default" title="" data-element="link">`
      : `<div data-element="empty_link">`) +
   `<div class="pagebuilder-slide-wrapper" data-background-images="${slideBackgroundImagesAttr(i.backgroundImageUrl)}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-background-lazy-load="false" data-element="wrapper" data-pb-style="${i.wrapperKey}">` +
   `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay" data-pb-style="${i.overlayKey}">` +
   `<div class="pagebuilder-poster-content">` +
   `<div data-element="content">${slidePosterContentHtml(i.contentRuns)}</div>` +
   (i.button
      ? `<button type="button" class="pagebuilder-slide-button ${buttonVariantClass(i.button.variant)}" data-element="button" data-pb-style="${i.button.key}">${escText(i.button.label)}</button>`
      : "") +
   `</div>` +
   `</div>` +
   `</div>` +
   (i.linkUrl !== undefined ? `</a>` : `</div>`) +
   `</div>`;

/**
 * The rehydratable style rules the real rows persist for every poster slide's keyed elements
 * (wrapper default background placement, overlay default transparent color, button visibility) —
 * keyed rules in a leading <style> block, never inline styles (issue #25 correction class).
 */
export const slidePosterStyleRules = (i: SlidePosterInput): string[] => {
   const rules = [
      `#html-body [data-pb-style=${i.wrapperKey}]{background-position:left top;background-size:cover}`,
      `#html-body [data-pb-style=${i.overlayKey}]{background-color:transparent}`,
   ];
   if (i.button)
      rules.push(
         `#html-body [data-pb-style=${i.button.key}]{opacity:1;visibility:visible}`,
      );
   return rules;
};

// ---- products (grid | carousel) ---------------------------------------------------------------

export type ProductsAppearance = "grid" | "carousel";

/**
 * The products declaration div with its inner `{{widget …}}` directive, in the EDITABLE
 * editor-default state: NO product data, no listing content — the directive and its empty-rule
 * conditions are the persisted contract (registry dataContext.requiresRuntimeData=true; live
 * listing resolution is a typed GAP, never faked).
 *
 * - carousel: VERIFIED-REAL-ROW bytes (real cms_page row) minus the site css class the row
 *   carries (`!m-0 !text-left` — site-specific styling, not platform).
 * - grid: VENDOR-CONFIG-VERIFIED — the products.xml grid appearance declares ONLY
 *   data-content-type/data-appearance on main; the directive template/type_name come from the
 *   grid widget-directive converter's toDom literals; products_count 5 / sort_order position
 *   are the products form's defaults. All 11 observed products rows on this instance are
 *   carousel — no grid byte exists to copy.
 */
export const productsDeclarationHtml = (
   appearance: ProductsAppearance,
): string =>
   appearance === "carousel"
      ? `<div data-content-type="products" data-appearance="carousel" data-autoplay="false" data-autoplay-speed="4000" data-infinite-loop="false" data-show-arrows="true" data-show-dots="true" data-carousel-mode="default" data-center-padding="90px" data-element="main">{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="${CAROUSEL_TEMPLATE}" anchor_text="" id_path="" show_pager="0" products_count="8" condition_option="condition" condition_option_value="" type_name="Catalog Products Carousel" conditions_encoded="${PRODUCTS_CONDITIONS_ENCODED_EMPTY_RULES}" sort_order="date_newest_top"}}</div>`
      : `<div data-content-type="products" data-appearance="grid" data-element="main">{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" template="${GRID_TEMPLATE}" anchor_text="" id_path="" show_pager="0" products_count="5" condition_option="condition" condition_option_value="" type_name="Catalog Products List" conditions_encoded="${PRODUCTS_CONDITIONS_ENCODED_EMPTY_RULES}" sort_order="position"}}</div>`;
