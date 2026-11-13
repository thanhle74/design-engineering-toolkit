# W-C declaration deep-dive — slider / slide / products (issue #72)

> **[#72] C72 CORRECTION (2026-11-13).** Coordinator review C72-1/C72-2 superseded three
> statements below (amended in place, originals preserved as quoted context):
> 1. The generic serializer no longer emits the Smile/Elasticsuite condition class (old §3
>    deviation 2: "We emit the observed class (pinned checkout truth)") — it now emits the
>    verified PORTABLE Magento CORE CatalogWidget classes in every profile (C72-1; three-way
>    vendor verification in the correction block of `compose/elements-native.ts`).
> 2. The "editor-default" EMPTY-rule directive is retired (C72-2): vendor-verified, an empty
>    combine attaches no SQL constraints, so an unbound `{{widget …ProductsList…}}` is a REAL
>    executable newest-products storefront listing — never emitted unbound. The directive
>    composes ONLY for a recorded category_ids/sku selection binding, and the rule payload is
>    byte-shaped after real category_ids-mode row 8 (demo-landing-page).
> 3. §6's "binding schema verified absent" described the OLD frozen seam; the correction adds
>    the selection binding to the SEMANTIC PROJECTION contract (schema v1.6.0,
>    `selectionByLocator` on the handler seam) — the component-binding map schema itself is
>    unchanged and still carries no provider concept.

Worker lane W-C's verification receipt behind `compose/elements-native.ts`,
`compose/handlers/slider-slide.ts` and `compose/handlers/products.ts`. Complements W-A's sweep
(`native-declarations-observed.md`): everything below was verified directly against the local
Magento 2.4.8-p5 checkout (`/home/thanhle/Sites/Magento/slaunchpad`) and its database on
2026-11-12. Read-only verification: no Magento write command was run; the DB rows were dumped
SELECT-only (cms_page 2/7/8/35) into scratch files for byte comparison.

Status labels follow W-A's sweep: **VERIFIED-REAL-ROW** (admin-saved persisted bytes read out of
`cms_page.content` via PDO), **VENDOR-CONFIG-VERIFIED** (read from this checkout's vendor
configs/converters/forms — no real row exists), **SITE-SPECIFIC** (observed in real rows but
identified as site-authored styling/content, deliberately not replicated).

---

## 1. slider (default appearance) — VERIFIED-REAL-ROW

Source rows: cms_page 2, 7, 35 (each carries one slider; identical attribute sets).

The brief's shape matches the persisted bytes exactly, minus one SITE-SPECIFIC css class:

```html
<div class="pagebuilder-slider" data-content-type="slider" data-appearance="default"
     data-autoplay="true" data-autoplay-speed="4000" data-fade="false"
     data-infinite-loop="true" data-show-arrows="false" data-show-dots="true"
     data-element="main">
```

Verified beyond the brief:

- Attribute ORDER mirrors the persisted row and the declaration order in
  `vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/slider.xml`
  (element `main`: name, appearance, autoplay, autoplay_speed, fade, is_infinite,
  show_arrows, show_dots). The slider main div carries NO `data-pb-style` key in the real rows.
- The real row's class is `pagebuilder-slider lp-hero-slider`; `lp-hero-slider` is
  SITE-SPECIFIC (Launchpad theme authoring — `app/code/Launchpad/CmsContent` authored markup
  carries the same `lp-*` classes). The vendor master template
  (`view/adminhtml/web/template/content-type/slider/default/master.html`) itself renders
  `class="pagebuilder-slider"` plus css-class bindings; we emit the template's own class only.
- Behavior values (`autoplay="true"`, `infinite-loop="true"`) are the OBSERVED row values, NOT
  the slider form's drag defaults (`autoplay=false`, `is_infinite=false` per
  `view/adminhtml/ui_component/pagebuilder_slider_form.xml`). The frozen contract's rule 3
  (mirror VERIFIED-REAL-ROW shapes) wins over drag-default derivation; the form defaults are
  recorded here so the divergence is a decision, not an oversight. All six attributes remain
  Admin-editable either way.

## 2. slide (poster appearance) — VERIFIED-REAL-ROW

Source rows: cms_page 35 (3 slides) and 2 (1 slide) — full chain transcribed and diffed against
the emitted builder byte-for-byte. The brief's shape matches; verified additions:

- Attribute order per element (from the real rows, matching
  `view/adminhtml/pagebuilder/content_type/slide.xml` poster element declarations):
  - main: `data-content-type, data-slide-name, data-appearance, data-show-button,
    data-show-overlay, data-element` — no class, no style key on the slide div.
  - link: `href, target, data-link-type, title, data-element` — **the link element carries NO
    data-pb-style key in the real rows** (only wrapper/overlay/button are keyed).
  - wrapper: `class, data-background-images, data-background-type, data-video-loop,
    data-video-play-only-visible, data-video-lazy-load, data-video-fallback-src,
    data-background-lazy-load, data-element, data-pb-style`.
  - overlay: `class, data-overlay-color, aria-label, title, data-element, data-pb-style`.
  - button: `type, class, data-element, data-pb-style`.
- `data-background-lazy-load="false"` on the wrapper is **in the real-row bytes but NOT declared
  by slide.xml's wrapper element** (slide.xml declares video_lazy_load →
  `data-video-lazy-load` only; verified `grep background_lazy_load slide.xml` → none). The same
  attribute appears on rows/columns throughout the Launchpad-authored content
  (`app/code/Launchpad/CmsContent/etc/homepage-content.html`). Conclusion: it is a site-authored
  attribute that survives in the persisted rows (these rows' final save pre-dates any reader
  pass that would strip it). We keep it because the frozen contract mirrors VERIFIED-REAL-ROW
  bytes and the brief's shape includes it; flagged here so a future admin round-trip test is not
  surprised if the reader drops it.
- empty_link variant: verified from the vendor template
  `view/adminhtml/web/template/content-type/slide/poster/master.html` — the `ifnot` branch
  renders `<div attr="data.empty_link.attributes" …>` wrapping the identical wrapper/overlay
  chain; `slide.xml` declares `element name="empty_link"` with no attributes/styles, so the
  persisted twin is a bare `<div data-element="empty_link">` (same convention the composer's
  banner shape already emits). The template renders the button in BOTH branches whenever
  `data-show-button !== 'never'` — a no-link slide with a projected CTA keeps its button.
- `data-show-button` values: `always` (button present — all 4 observed slides) / `never` — the
  slide form default (`pagebuilder_slide_form.xml`: show_button default `never`). We derive
  `always` from projected-CTA presence and otherwise emit the form default `never`, which also
  omits the button element (template branch) and its style rule.
- Button class: `pagebuilder-slide-button pagebuilder-button-primary` — both parts are platform:
  the template's own class + the slide form's `button_type` default
  (`pagebuilder-button-primary`). The manifest's buttonVariant maps onto the same
  `pagebuilder-button-{primary,secondary}` classes the composer already uses for buttons.
- Content HTML: the real rows carry `<h2>`/`<p>` inside `data-element="content"`, with
  SITE-SPECIFIC tailwind classes and `<span style="white-space: pre-wrap;">` wrappers on the
  row's own copy. We emit plain escaped `<h2>`/`<p>` fragments (heading → h2, content-lead/body
  → p), the same convention the existing banner composer uses; per-field styling is a declared
  non-goal of the single WYSIWYG content field.
- Style rules: the real rows persist keyed rules per slide in an early `<style>` block —
  wrapper `{background-position:left top;background-size:cover}` (the background form defaults
  `left top` / `cover`, verified in
  `view/adminhtml/ui_component/pagebuilder_base_form_with_background_attributes.xml`), overlay
  `{background-color:transparent}` (empty overlay_color), button
  `{opacity:1;visibility:visible}` (slide.xml button opacity converter, show_button always).
  Our builder emits exactly these three rules per slide, keyed
  `pbStyleKey(${slideNodeId}:{wrapper,overlay,button})`, aggregated in one leading style block
  per section fragment — rule order per slide: wrapper, overlay, button (as observed).
- `data-slide-name`: real rows carry editorial names ("Made for Living"); the slide form field
  has NO default (`pagebuilder_slide_form.xml` slide_name field, plain input). We carry the
  source node's name deterministically (never invented), HTML-escaped.

## 3. products (carousel) — VERIFIED-REAL-ROW (minus site class, minus child rule)

Source rows: cms_page 2 (x4), 7 (x3), 8 (x1), 35 (x3) — **all 11 observed products blocks on
this instance are `data-appearance="carousel"`**; no grid instance exists in any row.

Emitted bytes = the page-2 row verbatim with exactly two documented deviations
(**amended by the C72 correction, see the header note: deviation 2 is superseded — the emitted
directive is now BOUND, carrying a synthesized category_ids/sku rule with portable CORE
condition classes byte-shaped after real row 8**):

1. SITE-SPECIFIC class dropped: the row carries `class="!m-0 !text-left"` (Launchpad tailwind
   authoring). The declaration XML's `css_classes` is empty by default, and the configurable
   reader emits no class attribute for a default insertion — platform-correct default is NO
   class attribute. Verified: `products.xml` grid/carousel `main` elements declare only
   styles + `data-content-type`/`data-appearance` (+ carousel attrs) + html + css_classes.
2. ~~EMPTY rule set in `conditions_encoded` (per the brief)~~ — **SUPERSEDED (C72-2)**: the
   emitted directive is never unbound (an empty combine lists newest products — real, not a
   placeholder). The emitted `conditions_encoded` is the row-8 rule STRUCTURE (combine `1` +
   product condition `1--1`, per-node field order as row 8 persists it) with the attribute
   values from the operator's recorded selection.

Everything else is the row's persisted bytes, including values that are editor choices rather
than form defaults (kept because VERIFIED-REAL-ROW bytes are the contract's preferred evidence):
`data-show-arrows="true"` (carousel form default is false), `products_count="8"` (form default
20), `sort_order="date_newest_top"` (form default `position`, inherited from the base products
form — the carousel form `extends="pagebuilder_products_form"`, verified in
`view/adminhtml/ui_component/pagebuilder_products_carousel_form.xml`).

- The `{{widget …}}` directive's attribute ORDER is the converter's toDom object literal order
  (`type, template, anchor_text, id_path, show_pager, products_count, condition_option,
  condition_option_value, type_name, conditions_encoded, sort_order` last-if-set) — verified in
  `view/adminhtml/web/js/content-type/products/mass-converter/carousel-widget-directive.js`.
- Backtick encoding verified against the converter's `encodeWysiwygCharacters`:
  `{ → ^[`, `} → ^]`, `“ → ` `, `\ → |` (a JSON-escaped `\\` therefore persists as `||`), plus
  `< → &lt;`, `> → &gt;` (not present in our payload). The `conditions_encoded` value is stored
  RAW inside the double-quoted attribute (not HTML-escaped) — confirmed by the real-row bytes.
- The combine class ~~`Smile||ElasticsuiteVirtualCategory||Model||Rule||WidgetCondition||Combine`
  … We emit the observed class (pinned checkout truth)~~ — **SUPERSEDED (C72-1)**: the generic
  serializer now emits `Magento||CatalogWidget||Model||Rule||Condition||Combine` (+ the
  `…Condition||Product` child) in EVERY profile. Portability verified three ways on this very
  checkout: (a) Magento's own `conditions-data-processor.js` hardcodes the CORE classes for
  category_ids/sku modes; (b) the Elasticsuite `ConditionFactoryPlugin` maps CORE → vendor at
  condition-creation runtime (no di preference on the core classes), so core-class directives
  resolve to the vendor-backed engine here and to plain core everywhere else; (c) real row 7
  (`home-en-old`) persists a CORE-class rule on this Elasticsuite-enabled checkout. Emitting the
  vendor class (the pre-correction behavior) would fail on every checkout without the optional
  module.

## 4. products (grid) — VENDOR-CONFIG-VERIFIED (no real row exists)

No grid appearance was observed in any real row on this instance, so the grid bytes are derived
from three independent vendor sources, cross-checked:

1. `view/adminhtml/pagebuilder/content_type/products.xml` — the grid appearance (the DEFAULT)
   declares ONLY `data-content-type` + `data-appearance` attributes on main (plus styles/html/
   css_classes). So the div is `<div data-content-type="products" data-appearance="grid"
   data-element="main">` with no carousel attributes and NO `data-center-padding` (that is a
   carousel-only `static_attribute`, value 90px).
2. `view/adminhtml/web/js/content-type/products/mass-converter/widget-directive.js` toDom
   literals — grid directive: `template="Magento_CatalogWidget::product/widget/content/grid.phtml"`,
   `type_name="Catalog Products List"`, `show_pager="0"`, `anchor_text=""`, `id_path=""`,
   `condition_option_value=""`; `sort_order` included only when set.
   NOTE: the brief speculated the grid template might be
   `Magento_PageBuilder::catalog/product/widget/content/grid.phtml` — WRONG for this checkout:
   the PageBuilder module ships only `carousel.phtml` under
   `view/frontend/templates/catalog/product/widget/content/` (verified by listing; no grid
   template exists there), and the grid converter hardcodes the CatalogWidget path. The grid
   form has no template chooser (`pagebuilder_products_form.xml` — no template field), so the
   converter literal is what a drag-created grid block persists.
3. `view/adminhtml/ui_component/pagebuilder_products_form.xml` defaults — `products_count` 5,
   `sort_order` position. Carousel overrides products_count to 20
   (`pagebuilder_products_carousel_form.xml`).

Result: `products_count="5" sort_order="position"`, `type_name="Catalog Products List"`, the
same BOUND rule payload shape as carousel (C72 correction; see §3 amendment), same directive
attribute order.

## 5. Parent chain for products (and slider) — VERIFIED-REAL-ROW

The pinned registry declares NO parents policy (`allowedChildren: []` on every capability
entry — checked the registry JSON), so parent structure comes from the real rows:

- products sits directly inside `row(contained) > row-inner` in every observed row (page 2:
  traced the enclosing open tags to the byte; page 8: same chain). Siblings (headings/texts)
  share the same row inner. Our handler therefore emits one
  `row(contained) > inner > products` per projected container — the row bytes mirror the
  composer's existing row(contained) emission (issue #70 hero shape).
- products itself denies children: `products.xml` `<children default_policy="deny"/>`.
- slider sits inside `row(contained) > inner` as well (page 35 traced). Same wrapping for the
  slider fragment.

## 6. Live listing — typed GAP (fidelity), BOUND emission (C72 amendment)

The brief's honesty rule requires GAP unless a verified provider binding exists. The C72
correction resolves this in two layers, both vendor-verified:

- **Fidelity stays a typed GAP** (unchanged): no product cards, images, names, prices or
  category ids are ever composed statically — the listing internals delegate to the widget's
  runtime template (`dataContext.requiresRuntimeData=true` in the pinned registry;
  `acceptedProps: []` unchanged). The component-binding map schema still carries no
  provider/conditions concept and was not extended.
- **Emission is BOUND-only (C72-2)**: the executable `{{widget …}}` directive composes only
  from a recorded `selection` binding (`category_ids` or `sku`, non-empty) on the projected
  container — carried by the semantic projection contract (schema v1.6.0) through
  `ctx.selectionByLocator` on the handler seam. An unbound (or invalid-kind/empty-value)
  decision composes NOTHING: the handler stays silent null per the frozen seam contract, and
  the compose dispatcher's recorded-products guard records the accountable typed-gap skip and
  blocks the fallback shapes from claiming the section. Never emitted unbound, never remapped.

  Verified the failure mode that motivated the gate on the vendor source:
  `ProductsList::getBaseCollection` builds the base collection (all visible products,
  entity_id desc, page size) and only then attaches rule conditions — an empty combine (the
  pre-correction "editor-default" emission) attaches NO constraints, i.e. a REAL newest-N
  listing would publish arbitrary live products under a "placeholder" reading.

## 7. Corrections to the brief's stated shapes

Only one: the brief's speculated GRID template path
(`Magento_PageBuilder::catalog/product/widget/content/grid.phtml`) is not what this checkout
emits — corrected to `Magento_CatalogWidget::product/widget/content/grid.phtml` per the grid
converter literal + the missing PageBuilder grid template (verified in §4 above). Every other
byte of the brief's three shapes matched the persisted evidence and is emitted verbatim
(plus the two documented deviations in §3 and the slider class trim in §1).

## 8. Guard accommodation (T-18b)

The contract gate's adapter-source scan (T-18b in `src/modules/core/__tests__/cli-suite.mjs`)
bans the literal theme-template extension token in every file under
`src/modules/{figma,magento,knowledge}/adapters/**` — co-located suites included. The products
template paths are declaration DATA (widget-directive attribute values from the vendor
converters), not embedded theme source, so `elements-native.ts` and its suite assemble the
extension from parts at runtime; the EMITTED bytes (and every asserted expectation) still carry
the exact persisted directive. This is documented here and in the file comments so the
accommodation is auditable.
