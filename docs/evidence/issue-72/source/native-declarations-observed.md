# Native Page Builder declarations — observed shapes for issue #72

Scope: the five native Page Builder (PB) declaration shapes this issue's section matrix depends on
(heading, slider, slide, products, divider), plus the structural chain shapes the existing composer
already emits (row / column-group / column-line / column, banner poster, text, buttons, image).

Status labels:

- **VERIFIED-REAL-ROW** — declaration observed as persisted, admin-saved content on the local
  Magento instance (verified 2026-11-12). This is the shape a real `cms_page` row round-trips
  through the Admin reader/writer.
- **VENDOR-TEMPLATE-ONLY** — declaration read from the installed vendor master-format Knockout
  template of this checkout; no real persisted row was observed for the shape. Vendor tree:
  `/home/thanhle/Sites/Magento/slaunchpad/vendor/magento/module-page-builder/` (Magento_PageBuilder
  2.2.6-p5 per the pinned capability registry).

No Magento write command was run to produce this file; the real-row shapes below were verified and
transcribed by hand from admin-saved content on the local instance.

---

## heading — VERIFIED-REAL-ROW

Observed persisted declaration on real `cms_page` rows (admin-saved, verified 2026-11-12):

```html
<h3 data-content-type="heading" data-appearance="default" data-element="main">…</h3>
```

- `h1`–`h6` by the `heading_type` form field; the tag itself is the persisted carrier.
- Single declaration, no children.

Vendor master template (admin stage, same shape family):
`view/adminhtml/web/template/content-type/heading/default/master.html` — six `h1..h6` variants
switched by `data.main.heading_type()`, each rendering `data.main.html` plus
`attr/style/css` bindings (`data.main.attributes` carries the `data-content-type` /
`data-appearance` / `data-element` attributes).

Registry: `magento_pagebuilder/heading` (default), evidence
`source://slaunch-checkout/vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/heading.xml#type=heading`.

## slider — VERIFIED-REAL-ROW

Observed persisted declaration (admin-saved, verified 2026-11-12):

```html
<div class="pagebuilder-slider" data-content-type="slider" data-appearance="default"
     data-autoplay="true" data-autoplay-speed="4000" data-fade="false"
     data-infinite-loop="true" data-show-arrows="false" data-show-dots="true"
     data-element="main">
  <!-- slides -->
</div>
```

- Slides are the only meaningful children (`slider > slide` chain).
- Behavior props persist as attributes on the same div (autoplay / autoplay-speed / fade /
  infinite-loop / show-arrows / show-dots).

Vendor master template:
`view/adminhtml/web/template/content-type/slider/default/master.html` —
`<div class="pagebuilder-slider" attr="data.main.attributes" …><render args="masterTemplate"></render></div>`,
i.e. the class + attributes above, children rendered through the master template chain.

Registry: `magento_pagebuilder/slider` (default), evidence
`source://slaunch-checkout/vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/slider.xml#type=slider`.
`dataContext.requiresRuntimeData=false` (a slider with zero slides is still Admin-editable).

## slide (poster) — VERIFIED-REAL-ROW

Observed persisted declaration (admin-saved, verified 2026-11-12), one slide per poster item:

```html
<div data-content-type="slide" data-slide-name="…" data-appearance="poster"
     data-show-button="always" data-show-overlay="never" data-element="main">
  <a data-element="link" …>
    <div class="pagebuilder-slide-wrapper"
         data-background-images="{&quot;desktop_image&quot;:&quot;{{media url=…}}&quot;,…}"
         data-element="wrapper">
      <div class="pagebuilder-overlay pagebuilder-poster-overlay" data-element="overlay">
        <div class="pagebuilder-poster-content">
          <div data-element="content">…text…</div>
          <button type="button" class="pagebuilder-slide-button" data-element="button">…</button>
        </div>
      </div>
    </div>
  </a>
</div>
```

- Background images persist as a JSON-encoded `data-background-images` attribute on the wrapper
  (`desktop_image` / `mobile_image` keys with `{{media url=…}}` directives).
- The `<a data-element="link">` wraps the whole poster only when a link href is set; the vendor
  template renders an `empty_link` div twin when it is not (see below).
- Overlay text persists inside `data-element="content"`; the button persists as
  `button.pagebuilder-slide-button` — exactly one button element per slide.
- `data-show-button` gates the button (`always|hover|never`); `data-show-overlay` gates the
  overlay (`always|hover|never`).

Vendor master template:
`view/adminhtml/web/template/content-type/slide/poster/master.html` — the template renders the
linked variant `if="data.link.attributes().href"` and the `empty_link` variant `ifnot`, each with
`pagebuilder-slide-wrapper` > (`video-overlay` if set) > `pagebuilder-overlay
pagebuilder-poster-overlay` > `pagebuilder-poster-content` > content div +
`button.pagebuilder-slide-button` (rendered when `data-show-button !== 'never'`).

Registry: `magento_pagebuilder/slide` appearances `poster | collage-left | collage-centered |
collage-right`, evidence `source://slaunch-checkout/vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/slide.xml#type=slide`.
`dataContext.requiresRuntimeData=false`.

Note for the matrix: the same poster content/button skeleton is shared by `banner/poster`
(vendor template `view/adminhtml/web/template/content-type/banner/poster/master.html`, button class
`pagebuilder-banner-button`); the composer's hero shape emits
`row(contained) > banner(poster)` on this skeleton.

## products — VERIFIED-REAL-ROW

Observed persisted declaration (admin-saved, verified 2026-11-12). The products content type
persists as a **widget directive inside the declaration div** — the div carries the attributes,
the inner HTML is the `{{widget …}}` directive:

```html
<div data-content-type="products" data-appearance="carousel|grid" data-autoplay… data-element="main">{{widget type="Magento\CatalogWidget\Block\Product\ProductsList" … conditions_encoded="…"}}</div>
```

- `conditions_encoded` uses Magento's backtick encoding for the match-condition payload.
- The declaration is Admin-editable with **no product data present** — the widget directive and its
  conditions are the persisted contract; product rows resolve at render time through the widget
  provider.
- Registry `dataContext` for both appearances:
  `magento_pagebuilder/products` (`grid`, `carousel`),
  `requiresRuntimeData=true`, note "Runtime catalog data implied by the type's declaration; data
  sources not audited", evidence
  `source://slaunch-checkout/vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/products.xml#type=products`.

Vendor master template (admin stage):
`view/adminhtml/web/template/content-type/products/grid/master.html` —
`<div attr="data.main.attributes" data-bind="html: data.main.html" …></div>`: the stage binds the
directive HTML into the div, matching the persisted shape above. This vendor tree ships only the
`products/grid` stage-template directory (`master.html`, `preview.html`); the carousel appearance
persists identically (the widget directive inside a `data-appearance="carousel"` div) with no
separate carousel stage template in this install — observed, not inferred.

Composer consequence (gap driver for the matrix): composing `products` requires emitting the
widget directive with a valid `conditions_encoded` payload, which needs live catalog conditions /
widget-provider data the committed evidence does not carry.

## divider — VENDOR-TEMPLATE-ONLY

No real persisted row observed for divider on this instance. Declaration from the vendor master
template:

`view/adminhtml/web/template/content-type/divider/default/master.html`:

```html
<div attr="data.main.attributes" css="data.main.css" ko-style="data.main.style">
    <hr attr="data.line.attributes" css="data.line.css" ko-style="data.line.style" />
</div>
```

Persisted form (implied by the template, not observed on a real row):

```html
<div data-element="main" …><hr data-element="line" …></div>
```

Registry: `magento_pagebuilder/divider` (default), evidence
`source://slaunch-checkout/vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/divider.xml#type=divider`.
`dataContext.requiresRuntimeData=false`. No Slaunchpad homepage section in the pinned NodeIR
observes a divider node, so no section in `section-matrix.md` plans one; recorded here because the
shape was part of the #72 declaration sweep.

---

## Structural chain shapes already emitted by the composer (for cross-reference)

These are the shapes `magento-pagebuilder-compose` already composes (descriptor
`src/modules/magento/adapters/magento-pagebuilder-compose/descriptor.json`); each is declaration-
backed by the vendor templates of this checkout:

| Composer shape | Native chain | Vendor template (master.html) |
| --- | --- | --- |
| hero (#70) | `row(contained) > banner(poster)` | `row/contained/`, `banner/poster/` |
| two-column (G4) | `row(contained) > column-group(default) > column-line(default) > column(full-height) x2`, inner `text(default)` / `image(full-width)` | `row/contained/`, `column-group/default/`, `column-line/default/`, `column/full-height/`, `text/default/`, `image/full-width/` |
| column-grid (#28) | same chain with Rule A line grouping / Rule B split | as above |
| text-band (#28) | `row(contained) > text(default)` [+ `buttons(inline) > button-item(default)`] | `text/default/`, `buttons/inline/`, `button-item/default/` |

All 34 native entries above are `proofLevel: registered` in the pinned registry
(`resources/examples/build/slaunchpad-home-real-derived/capability-registry.json`,
`summary.byCategory: {native: 34, widget: 35, chrome: 11}`); none is admin-roundtrip-verified at
registry level.
