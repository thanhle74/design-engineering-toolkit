# [5] Capability matrix — Magento Page Builder + Secomm_UiWidget + Hyvä (first adapter)

**Status:** source-backed G1 inventory. **Proof ceiling: `REGISTERED`** — everything below was verified by read-only source inspection only ([5] W-B audit, 2026-11-03). No Admin round-trip, CMS write or Figma access happened in this gate, so no entry may claim `STRUCTURALLY_MAPPED` or beyond.
**Audited source:** caller-supplied local checkout `slaunch-checkout` = git `66aff1ebd4cda9152a5e70635766b8030b10ff88` (branch `development`, 2026-10-30). The path is per-run profile configuration — never a toolkit default.
**Machine-readable payload:** [`resources/examples/converter/capability-registry.magento-pagebuilder.example.json`](../../resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json) (61 capabilities, 114 evidence locators, schema-validated by the repo test gate).

## 1. Platform baseline (verified)

| Fact | Value | Evidence |
|---|---|---|
| Edition | Magento Open Source **2.4.8-p5** | `composer.json:51`, `composer.lock:19525` |
| `Magento_PageBuilder` | **enabled** + all PB satellite modules | `app/etc/config.php:244` |
| `Secomm_UiWidget` | exists at `app/code/Secomm/UiWidget`, **enabled** | `app/etc/config.php:431` |
| Hyvä modules | `Hyva_Theme`, `Hyva_CmsTailwindJit`, `Hyva_Email`, `Hyva_BaseLayoutReset`, `Hyva_LumaCheckout`, … all enabled | `app/etc/config.php` |
| Theme | `Secomm/launchpad` (variant `_fashion`), parent `Hyva/default`; UiWidget registered in `hyva-themes.json` | `app/design/frontend/Secomm/launchpad/theme.xml`; `app/etc/hyva-themes.json` |
| Hyvä versions | default theme **1.5.2**, theme-module 1.5.2, hyva-ui **2.8.0**, cms-tailwind-jit **2.0.3** | `composer.lock:3660,4084,28724,3571` |
| Tailwind | **v4 CSS-first confirmed** — `@import "tailwindcss"`, `@source`, `@theme`; no `tailwind.config.js`; sources include UiWidget templates + a safelist dir for DB-resident content | `app/design/frontend/Secomm/launchpad/web/tailwind/tailwind-source.css:20-38`; `web/tailwind/package.json:8-9` (tailwindcss ^4.3.1) |
| Alpine | **v3** (defer plugin); CSP possible via `Hyva\Csp` view model — active build variant is store-config dependent | `vendor/hyva-themes/magento2-theme-module/src/view/base/templates/page/js/plugins/v3/defer.phtml:23,84` |

## 2. Native Page Builder content types — 20 types / 33 appearances (all `REGISTERED`)

Registration: per-module `view/adminhtml/pagebuilder/content_type/*.xml`, read by `Magento\PageBuilder\Model\Config\ContentType\Reader` (`Reader.php:59`); parents/children policies from `Model/Config/ContentType/Converter.php:466-552` (no declared parents ⇒ droppable only into the stage root container, `drag-drop/matrix.js:8-31`).
**Hypothesis check (spec §4):** all 15 hypothesis types exist. The hypothesis missed 5 structural types that are registered content types in their own right: **`slide`, `button-item`, `column-line`, `tab-item`, `column-group`**. Hyvä theme-module and cms-tailwind-jit *amend* existing types (banner/row/column/column_group/slide/tab_item/image + block/html) without adding new ones.

| Type | Appearances (default bold) | Children policy | Nesting | Mobile form | Notable editor fields |
|---|---|---|---|---|---|
| row | **contained**, full-width, full-bleed | allow-all except row | yes | yes | min_height, justify_content, parallax |
| column-group | **default** | column-line, column only | yes | no | grid_size, min_height |
| column-line | **default** | column only | yes | no | — |
| column | **full-height**, align-top/center/bottom | allow-all except row, column, column-line | yes (recursive) | yes | width, min_height |
| tabs | **default** | tab-item only | yes | yes | default_active, navigation_alignment |
| tab-item | **default** | allow-all except row, tabs | yes | yes | tab_name |
| slider | **default** | slide only | yes | yes | autoplay, fade, arrows/dots |
| slide | **poster**, collage-left/centered/right | deny (content via form) | no | yes | 12 fields incl. content, overlay |
| buttons | **inline**, stacked | button-item only | no | no | is_same_width |
| button-item | **default** | deny | no | no | button_text, button_type, border |
| divider | **default** | deny | no | no | line_color/thickness/width |
| heading | **default** | deny | no | no | heading_type (h1–h6) |
| text | **default** | deny | no | no | content — TinyMCE **WYSIWYG** |
| html | **default** | deny | no | no | html — raw **code** editor |
| image | **full-width** | deny | no | no | image, mobile_image, alt |
| video | **default** | deny | no | no | video_source (youtube/vimeo/local) |
| banner | **poster**, collage-left/centered/right | deny | no | yes | message, button, overlay |
| map | **default** | deny | no | no | 10 + 11 location child fields |
| block | **default** | deny | no | no | block_id (CMS block chooser) |
| products | **grid**, carousel | deny | no | no | conditions, sku/category, carousel options |

Totals: 20 types, 33 appearances, 21 type forms + 5 mobile breakpoint forms (banner, row, column, slider, slide, tabs, tab-item). **CE has NO per-device show/hide visibility fields** (grep over `pagebuilder_*_form.xml`: none).

## 3. Storage / master format (converter-critical)

- Master content is **HTML carrying `data-content-type` / `data-appearance` / `data-element`** (e.g. `content_type/text.xml:35-36`; masters under `view/adminhtml/web/template/content-type/` — 29 master.html). The stage reads it back via `js/master-format/read/configurable.js` (parses `data-appearance` :36, per-viewport `data-<viewport>-style` :64). Server render matches `@data-content-type` via `Model/Filter/Template.php:213-214`.
- **Implication: the converter must emit master-format HTML that survives the reader + filter pipeline. Converter JSON must never be stored raw in `cms_page.content`** (ADR-005-006; Admin round-trip proof is G3, not claimed here).
- `products` persists as a `{{widget}}` directive (`products.xml:42`); Secomm widget instances persist as `{{widget type="…SecommUi" component="…" payload="<base64url JSON>"}}` with hard codec caps **16 KiB / depth 6 / 50 items** (`Model/Parameter/Codec.php:20-22`) — payload regeneration must respect these limits or flag loss.
- Hyvä replaces the PB filter plugin to preserve Alpine attributes (`OverrideTemplatePlugin.php:1-60`); registry tamper-resistance plugins validate widget params on save/render (`Plugin/ValidateWidgetParameters.php`) — converters must never emit arbitrary template/class attributes.
- Tailwind: classes emitted into DB-resident content compile only via safelist or cms-tailwind-jit (`tailwind-source.css:31-38`) — a G4 constraint, recorded now.

## 4. `Secomm_UiWidget` — enabled registry verified 21/21 (B1 hypothesis CONFIRMED)

Mechanism: one Magento widget `secomm_ui` (`etc/widget.xml:9`), explicit allowlist registry of **21 component definitions** injected via `etc/di.xml:19-43`; admin editing through schema-driven dynamic fields (`Block/Adminhtml/Widget/ComponentOptions.php:61-72`); templates verified present under `view/frontend/templates/components/` (21 .phtml).

| # | Component | # | Component | # | Component |
|---|---|---|---|---|---|
| 1 | accordion_a | 8 | categories_b | 15 | slider_b (logo marquee) |
| 2 | banner_a | 9 | embed_a | 16 | testimonial_a |
| 3 | banner_b | 10 | generic_content_a | 17 | testimonial_b |
| 4 | banner_c | 11 | generic_content_b | 18 | usp_a |
| 5 | card_a | 12 | modal_a | 19 | usp_b |
| 6 | card_b | 13 | product_highlights_c | 20 | usp_c |
| 7 | categories_a | 14 | shortcuts_a | 21 | slider_a |

**Spec-vs-code delta:** B1 **21/21 exact ID match** (no code widget missing from spec, none invented). B2 **0/11 in code** (no definitions, no `ManualProductProvider`/`ManualCategoryProvider`) — matches the approved Phase-1 boundary. Theme overrides exist for `categories/a` and `accordion/a` templates — visual extraction must read the **theme** variant (G4 concern, recorded now).
Admin-editability is *designed-in* (schema-driven fields) but the actual **save/reopen round-trip is NOT_VERIFIED** — proof stays `REGISTERED`.

## 5. Theme chrome — OUT of CMS-page scope (recorded, excluded by category)

`chrome/header` (logo/search/compare/topmenu/languages/wishlist) · `chrome/cart-drawer` (+ coupon, promo CMS block, third-party checkout) · `chrome/footer-content` (4 chrome-owned CMS blocks) · `chrome/breadcrumbs-back-to-top` · `chrome/navigation-menu` (menu drawer + third-party nav) · `chrome/absolute-footer`.
These are category `chrome` in the machine-readable registry — the resolver excludes them from page mapping; footer CMS blocks are chrome-owned content references, not page capabilities.

## 6. NOT_VERIFIED (explicit — no unsupported promotion)

1. **Admin Edit→Save→Reload round-trip** for any type/widget instance — G3 receipts required; everything stays `REGISTERED`.
2. Google Maps API key configured (store config in DB, out of audit scope).
3. Active Alpine build variant (standard vs CSP) at runtime — store-config dependent.
4. Active theme/DB design-config values (theme files verified in source; DB assignment not).
5. Magewire presence (project docs claim 1.13; **no package in `composer.lock`** — contradiction unresolved by this audit).
6. Stored PB/widget instances in DB (no DB queries permitted in this gate).
7. B2 provider behavior (not implemented — absence proven, behavior N/A).
8. Visual rendering parity of any component (G4 scope).
9. Widget placement rules via the platform's widget-insertion flow (container binding for widget instances not proven from source).

## 7. Round-trip risk register (feeds G3 design, no claims made)

| Risk | Consequence for the converter |
|---|---|
| `{{widget}}` payload regeneration | Must fit 16 KiB/depth-6/50-item codec caps; schema_version hidden param preserved; legacy envelope support expected by solution design |
| Editor escaping pipeline | Emitted master HTML must survive `Model/Filter/Template` + Hyvä override (Alpine attributes) |
| Registry tamper-resistance | Never emit arbitrary template/class attributes; templates resolve only from the registry |
| Tailwind safelist contract | DB-resident classes need safelist or JIT; JIT module only amends block/html types |
| Map/Products dependencies | Runtime-data-gated capabilities — dataContext.requiresRuntimeData = true, resolved against Magento, never design fixtures |
| Theme template overrides | 2 UiWidget storefront templates overridden in child theme — read theme variant for visual truth |
