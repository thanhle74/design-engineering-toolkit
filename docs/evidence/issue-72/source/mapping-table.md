# [72] 12-section mapping table — before/after dispositions (diagnostic, not a fidelity demand)

Source: pinned Slaunchpad Homepage Figma `245:2`, revision `2417494580183108397` (committed #18 live-read evidence; offline-reproducible project `resources/examples/build/slaunchpad-home-real-derived/`).

- **BEFORE** = offline `det build` on the committed real-derived project at base `186a191` (bundle captured `/tmp/det72-before-bundle`, compose-report: 34 mapping entries, 12 mapped / 12 gap / 10 skipped; content-types emitted: `row, banner, column-group, column-line, column, image`; 3288 bytes).
- **AFTER** = offline `det build` on the #72 extended project (extended recorded projection + content entries from observed node names only; new generalized handlers registered). Filled at integration.

Per-issue body: the matrix is a **diagnostic/regression report** — a proved and honest GAP is acceptable; silently mapping to the wrong component is NOT. No 12/12 target, no styling claims.

| # | Section (node id) | Observed semantics (W-A evidence) | Intended native tree | BEFORE | AFTER | Admin round-trip |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hero/Primary (s-df13cd3ab58d) | full-bleed media + overlaid text/CTA (projected) | row > banner(poster) + buttons | MAPPED (banner) | unchanged by design (legacy shape first) | — |
| 2 | BrandStatement (s-812c04890b36) | loose text band, no media | row > text(default) [+buttons] | SKIPPED (no projection/manifest) | — | — |
| 3 | Hero/Secondary (s-3ca9401bcf2c) | hero variant, loose text roles | row > banner(poster) | SKIPPED | — | — |
| 4 | FeaturedCollections (s-63f4f98ec020) | header band + 3 parallel tiles | row > heading + card columns x3 | SKIPPED | — | — |
| 5 | FeaturedProducts (s-9e92039d0743) | header band + 4 product cards in row container | row > band + products(grid) declaration (listing = GAP) | SKIPPED | — | — |
| 6 | CampaignEditorial (s-322a0d65ee53) | two named media slot frames | row > column-group > column-line > column x2 (media side-by-side composes stacked + fidelity gap) | SKIPPED (projection missing) | — | — |
| 7 | Lookbook (s-fe254aac1209) | 3 looks + 12 hotspot icons (third-party lookbook domain) | header band composable; hotspots = GAP (registered lookbook widgets ≠ native PB; no verified runtime) | SKIPPED | — | — |
| 8 | EditorialMosaic (s-08e578513c2d) | 4 named slots × 2 stacked media (column-grid domain) | row > column-group > column-line(s) per #28 | SKIPPED (projection missing) | — | — |
| 9 | Craftsmanship (s-1f0a2498ae66) | two projected columns (media + content) | row > column-group > column-line > column(full-height) x2 | MAPPED (8/8) | unchanged (legacy first) | — |
| 10 | ThePeople (s-bef01391dbd2) | 4 interleaved slots + captions; one RIGHTS-UNVERIFIED media | card columns x4 (media gaps honest) | SKIPPED | — | — |
| 11 | ProductSpotlight (s-a0cca2d0b670) | hero variant with TWO CTAs | banner poster carries exactly ONE button element → second CTA = honest GAP | SKIPPED | — | — |
| 12 | Newsletter (s-09383274911f) | text band + form | text band composable; FORM = GAP (no native PB form content type in registry) | SKIPPED | — | — |

Columns TBD at integration: AFTER disposition per section (from the extended-project compose-report), Admin round-trip result per composed family (`PASS` / specific `GAP`), plus the per-family proof receipts.

## Registry-decision facts binding this table (verified)

- Carousel intent (`slide` role) is NOT auto-derivable from NodeIR geometry — no slide projections exist in the recorded decision; slider handler therefore composes nothing on this source (honest absence, capability still delivered + tested).
- `products` persists as declaration div + `{{widget …ProductsList…}}` directive (real cms_page rows 2/7/8); editable default state needs NO product data; live listing = typed GAP until a verified provider binding exists (binding map has no provider field).
- Banner/slide posters carry exactly ONE button element (vendor template + real rows) — ProductSpotlight's second CTA cannot compose (GAP, never flattened into a pseudo-button).
- `pagebuilderimageattribute/image` is a distinct registry id from `magento_pagebuilder/image` (34 native entries incl. it).
- Rights gate: ThePeople media `n-bd6a3b5c909f` "PLACEHOLDER — RIGHTS UNVERIFIED" — legal blocker, not structural.
