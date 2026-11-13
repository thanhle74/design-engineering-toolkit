# [72] 12-section mapping table — before/after dispositions (diagnostic, not a fidelity demand)

Source: pinned Slaunchpad Homepage Figma `245:2`, revision `2417494580183108397` (committed #18 live-read evidence; offline-reproducible project `resources/examples/build/slaunchpad-home-real-derived/`).

- **BEFORE** = offline `det build` on the committed real-derived project at base `186a191` (bundle captured `/tmp/det72-before-bundle`, compose-report: 34 mapping entries, 12 mapped / 12 gap / 10 skipped; content-types emitted: `row, banner, column-group, column-line, column, image`; 3288 bytes).
- **AFTER** = offline `det build` on the #72 extended project. Pre-correction bundle (`/tmp/det72-after-bundle`, HEAD `8195324`): 23 mapped / 71 gap / 6 skipped; 21 PB markers; 6544 bytes. **C72-corrected rebuild** (`/tmp/det72-after-c72`, this correction): mapping ledger **21 mapped / 21 gap / 7 skipped**; content-types emitted: `row, banner, column-group, column-line, column, image, text`; **19 PB markers, 5659 bytes of persisted master HTML**; content sha256 `9fe531402452b273…f3517ee`. The products declaration is no longer emitted on this source (no recorded selection exists in the source design — see row 5).
- **Admin round-trip** = one real page carrying all six composed sections (`det-qa-72-home`, store 5) — install → Admin edit screen inspection → Admin Save → DB verify → editor reload. One PASS row covers every composed family on that page.

Per-issue body: the matrix is a **diagnostic/regression report** — a proved and honest GAP is acceptable; silently mapping to the wrong component is NOT. No 12/12 target, no styling claims.

| # | Section (node id) | Observed semantics (W-A evidence) | Intended native tree | BEFORE | AFTER | Admin round-trip |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hero/Primary (s-df13cd3ab58d) | full-bleed media + overlaid text/CTA (projected) | row > banner(poster) + buttons | MAPPED (banner) | MAPPED — unchanged by design (legacy projected shape composes first) | PASS (row>banner on proof page) |
| 2 | BrandStatement (s-812c04890b36) | loose text band, no media | row > text(default) [+buttons] | SKIPPED (no projection/manifest) | MAPPED — text-band path composes (row > text, observed-name copy per R56 honesty lock) | PASS (row>text on proof page) |
| 3 | Hero/Secondary (s-3ca9401bcf2c) | hero variant, loose text roles | row > banner(poster) | SKIPPED | SKIPPED — band-projected text + visible media without recorded background-media decision; hero guard declines honestly (no silent banner poster) | — |
| 4 | FeaturedCollections (s-63f4f98ec020) | header band + 3 parallel tiles | row > heading + card columns x3 | SKIPPED | SKIPPED — mixed band + tile media shape; card-grid handler declines (tiles are generic media, not composed cards) | — |
| 5 | FeaturedProducts (s-9e92039d0743) | header band + 4 product cards in row container | row > band + products(grid) declaration (listing = GAP) | SKIPPED | **SKIPPED — typed GAP (C72-2 fail-closed)**: the recorded `products-grid` decision carries NO selection binding, and the `{{widget …ProductsList…}}` directive is a REAL executable storefront listing (an empty rule lists newest products — vendor-verified), so the executable widget composes ONLY from a recorded category_ids/sku selection; unbound decisions skip with an accountable typed-gap record, never emitted unbound, never remapped to a fallback | — (products gated off the corrected proof page; round-trip receipt re-run PASS without it) |
| 6 | CampaignEditorial (s-322a0d65ee53) | two named media slot frames | row > column-group > column-line > column x2 (media side-by-side composes stacked + fidelity gap) | SKIPPED (projection missing) | MAPPED — recorded slot decisions (`299:301`/`299:302`) drive the legacy projected two-column shape | PASS (column-group > column-line > column×2 on proof page) |
| 7 | Lookbook (s-fe254aac1209) | 3 looks + 12 hotspot icons (third-party lookbook domain) | header band composable; hotspots = GAP (registered lookbook widgets ≠ native PB; no verified runtime) | SKIPPED | SKIPPED — whole-section shape still outside composers (hotspot/widget domain) | — |
| 8 | EditorialMosaic (s-08e578513c2d) | 4 named slots × 2 stacked media (column-grid domain) | row > column-group > column-line(s) per #28 | SKIPPED (projection missing) | SKIPPED — needs grid-column projections (no recorded decisions; column-grid legacy shape requires projected columns) | — |
| 9 | Craftsmanship (s-1f0a2498ae66) | two projected columns (media + content) | row > column-group > column-line > column(full-height) x2 | MAPPED (8/8) | MAPPED — unchanged (legacy first; bytes pinned G3) | PASS (second column-group block on proof page) |
| 10 | ThePeople (s-bef01391dbd2) | 4 interleaved slots + captions; one RIGHTS-UNVERIFIED media | card columns x4 (media gaps honest) | SKIPPED | SKIPPED — interleaved captions shape; rights blocker on `n-bd6a3b5c909f` stands regardless | — |
| 11 | ProductSpotlight (s-a0cca2d0b670) | hero variant with TWO CTAs | banner poster carries exactly ONE button element → second CTA = honest GAP | SKIPPED | SKIPPED — one-button poster limit + band-decision hero guard (second CTA never flattened) | — |
| 12 | Newsletter (s-09383274911f) | text band + form | text band composable; FORM = GAP (no native PB form content type in registry) | SKIPPED | MAPPED — text band composes; form remains recorded GAP | PASS (second row>text on proof page) |

**AFTER totals (C72-corrected): 5/12 sections compose** (1, 2, 6, 9, 12), **7 honest skips** (3, 4, 5, 7, 8, 10, 11). Ledger: 21 mapped / 21 gap / 7 skipped; emitted content types: `row`×5, `banner`×1, `column-group`×2, `column-line`×2, `column`×4, `image`×3, `text`×2 = 19 markers, 5659 master bytes. The products handler ships BOUND-only (C72-2): it is byte-tested for real category_ids/sku selections (core-only and Smile-enabled profiles identical, unknown/unverifiable fails closed) but composes nothing on this source because the source design records no product selection — a deliberate typed gap, not silent omission. Slider + heading-family handlers ship tested (unit + contract suites) and likewise compose nothing on this source: no `slide` projections exist (carousel intent not geometry-decidable) and no pure-band sections pass the header-band media-free precondition.

## Admin round-trip receipt

> **C72-corrected round trip (2026-11-13) — the deciding PASS, re-run:** full receipt in the
> C72 section of `docs/evidence/issue-72/integrator-receipt.md`. Corrected build on
> `det-qa-72-home` (page_id 50): create (5659 bytes, sha `9fe53140…`) → DB verify (19 markers,
> store-5 scope only) → **admin stage rehydrates the exact 19-element structure** → real
> browser Save ("You saved the page.") → admin-normalized 7268 bytes with identical 19-marker
> structure → full editor reload rehydrates the identical outline → installer update rerun
> restores canonical bytes → **storefront HTTP 200 full render with no swatch abort** (the
> widget-triggered Hyvä abort cannot apply: C72-2 gates the executable widget out — the GAP
> stands for any widget-bearing page) → cleanup CLEAN (43/43 baseline rows unchanged, temp
> admin + role removed). Refreshed evidence: `browser/admin-editor-outline-{pre-save,
> post-reload}.json`, `browser/frontend-filter-render.json`, `browser/storefront-corrected-http.json`.

### Pre-correction round trip (2026-11-12, superseded by the re-run above)

One isolated store-5 temp page (`det-qa-72-home`, page_id 49) carried all six composed sections:

| Step | Result | Evidence |
| --- | --- | --- |
| Pre-create fingerprint snapshot | 43 cms_page rows + store-5 config recorded | `docs/evidence/issue-72/browser/pre-create-fingerprints.json` |
| Installer create (`PageRepositoryInterface`, store-0 refusal gates intact) | `action=created page_id=49`, sha `3a8bb580…87d187` | proof script output (receipt log) |
| DB verify | `scope_match=true`, 21 PB markers byte-identical to master | `cms-page-proof.php --mode=verify` |
| **Admin edit screen rehydration** | **21 content-type elements in the live Page Builder stage, exact same counts** (row 6, banner 1, text 2, products 1, column-group 2, column-line 2, column 4, image 3); nested outline captured | `browser/admin-editor-outline-pre-save.json` |
| **Admin Save (real browser click)** | persisted; sha re-serialized by the PB model (`b18b00bd…`, 8214 bytes) with **identical 21-marker structure** — expected admin normalization, recorded honestly | `cms-page-proof.php --mode=verify` |
| Editor reload (full page) | same 21 elements rehydrated from the saved content | `browser/admin-editor-outline-post-reload.json` |
| Installer update rerun | `action=updated page_id=49`, canonical bytes restored (6546 / `3a8bb580…`) — create/update idempotency proven | proof script output |
| Storefront pipeline filter (read-only probe) | full render ok in CLI context (8328 bytes, widget resolves); widget-stripped render proves PB structure through the exact storefront template filter | `browser/frontend-filter-render.json`, `scripts/proof/issue72/render-frontend-filter.php` |
| Cleanup | page deleted, temp admin + auto-role deleted, sandbox removed, fingerprint diff CLEAN (43/43, no changed rows) | `/tmp/det72-post-fingerprints.json` vs committed pre-state |

**Storefront HTTP full render = typed environment GAP:** the catalog widget resolves and instantiates (`grid.phtml` in the abort stack trace) but the HTTP render aborts on a **pre-existing Hyvä theme bug** — `product.swatch.item rendered without "option" data` (pre-1.5 swatch renderer override, exception.log `swatch-item.phtml:32`), which kills the WHOLE page render for ANY CMS content carrying a catalog widget. Counter-example: the #70-era page `det-pb-roundtrip-46` renders fully but contains no widget directive. Not a DET composition defect; the deciding acceptance per the issue body is Admin Save→Reload, which PASSED.

## Registry-decision facts binding this table (verified)

- Carousel intent (`slide` role) is NOT auto-derivable from NodeIR geometry — no slide projections exist in the recorded decision; slider handler therefore composes nothing on this source (honest absence, capability still delivered + tested).
- `products` persists as declaration div + `{{widget …ProductsList…}}` directive (real cms_page rows 2/7/8); **C72 correction: the directive is a REAL executable storefront listing (an empty rule lists newest products — vendor-verified), so it composes ONLY from a recorded category_ids/sku selection binding** (semantic-projection schema v1.6.0; the component-binding map still has no provider field and was not extended); the listing fidelity remains a typed GAP regardless.
- Banner/slide posters carry exactly ONE button element (vendor template + real rows) — ProductSpotlight's second CTA cannot compose (GAP, never flattened into a pseudo-button).
- `pagebuilderimageattribute/image` is a distinct registry id from `magento_pagebuilder/image` (34 native entries incl. it).
- Rights gate: ThePeople media `n-bd6a3b5c909f` "PLACEHOLDER — RIGHTS UNVERIFIED" — legal blocker, not structural.
