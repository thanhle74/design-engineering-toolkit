# Slaunchpad Homepage — 12-section structural evidence matrix (issue #72)

Diagnostic matrix for the pinned Slaunchpad Homepage Figma node `245:2` (source
`figma-home-desktop`, revision `2417494580183108397`), page `PAGE/Home/Desktop` (IR root
`n-5d50c1707d66`). For each of the 12 sections in `page-structure.json` it records the observed
NodeIR subtree, the layout semantics the tree expresses, the content evidence actually carried by
`content-manifest.json`, the candidate native Magento Page Builder (PB) tree restricted to the
pinned native families, the predicted gaps, and whether an existing composer shape already handles
the signature.

**This is a diagnostic, not a fidelity demand.** Nothing here asks the design to change; it records
what the source tree can and cannot express through native PB once the required evidence inputs
exist.

## Inputs

- `docs/evidence/issue-18/live-read-verified/node-ir.json` — 337 nodes
  (kinds: 102 text, 97 container, 83 icon, 40 component, 15 media)
- `docs/evidence/issue-18/live-read-verified/page-structure.json` — the 12 sections
- `docs/evidence/issue-18/live-read-verified/source-review.json` — per-node dispositions
  (actual file counts: 168 MAPPED / 49 DECORATION_MERGED / 92 EXCLUDED_WITH_REASON /
  28 NEEDS_REVIEW = 337; the issue-#70 brief's "62 mapped / 119 gap / 22 excluded / 2 skipped"
  figures do not match this file and were not used)
- `resources/examples/build/slaunchpad-home-real-derived/semantic-projection.json` — explicit role
  projections, bounded to 2 sections (Hero/Primary, Craftsmanship), 11 assignments
- `resources/examples/build/slaunchpad-home-real-derived/content-manifest.json` — 7 entries: 3
  text + 4 media
- `resources/examples/build/slaunchpad-home-real-derived/capability-registry.json` — 80
  capabilities (34 native PB, 35 widget, 11 chrome; all `proofLevel: registered`)
- `docs/evidence/issue-72/source/native-declarations-observed.md` — declaration shapes
- Machine-readable companion: `docs/evidence/issue-72/source/section-subtrees.json`

## Conventions

1. **Tree truth is NodeIR.** `page-structure.json` `elements` list only slot containers (the
   composer's shape-detection keys); the full observed children come from `node-ir.json`
   `childrenNodeIds`. Both are cited per section.
2. **Layout semantics are observed, not guessed.** NodeIR carries `layout.direction`
   (`absolute` / `row` / `column`) and `overflow` but **no geometry** — no x/y/w/h. Overlap cannot
   be observed. Where a container is `absolute`/`row` and holds peer-repeated same-name children,
   carousel-vs-grid intent is stated as an OBSERVATION for the Coordinator to resolve.
3. **Shapes, never names.** Mapping candidates describe structural signatures (background-media
   frame + overlay text + CTA; N distinct named slots; N peer-repeated identical cards; loose
   text-only column) that generic handlers could detect. Section names are never branched on.
4. **Disposition semantics** (mirrors `section-subtrees.json`):
   - `composable` — the signature is handled by an existing composer shape or expressible in
     pinned native families once evidence inputs (role projections, manifest copy/media) are
     supplied. Input-level blockers are still listed.
   - `gap` — the signature requires a handler that does not exist among the four composer shapes
     (peer-repeated card groups, products widget conditions, form input) or carries content no
     native family represents.
5. **Existing shapes** (composer descriptor
   `src/modules/magento/adapters/magento-pagebuilder-compose/descriptor.json`): `hero` (#70:
   background media + overlaid text + CTA → `row(contained) > banner(poster)`), `two-column` (G4:
   column-primary + column-secondary slots → `row > column-group > column-line > column x2`),
   `column-grid` (#28: distinct named grid slots, Rule A lines / Rule B split), `text-band` (#28:
   loose role-resolved text/CTA, guarded against media-carrying or structured containers).
6. **Native families allowed**: row (contained/full-width/full-bleed), column-group/column-line/
   column, banner (poster/collage*), slider + slide (poster/collage*), image, heading, text,
   buttons/button-item, products (grid/carousel), divider, html, map, tabs/tab-item, video, block.

## Summary

| # | Section | Children | Vis. desc. | Semantics (observed) | Shape match | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Hero/Primary `s-df13cd3ab58d` | 4 | 16 | hero-with-background | hero | composable |
| 1 | BrandStatement `s-812c04890b36` | 2 | 3 | stacked-text band | text-band | composable |
| 2 | Hero/Secondary `s-3ca9401bcf2c` | 5 | 10 | hero-with-background (loose text) | hero | composable |
| 3 | FeaturedCollections `s-63f4f98ec020` | 2 | 45 | peer-cards x3 + header + trailing media slot | none | gap |
| 4 | FeaturedProducts `s-9e92039d0743` | 2 | 51 | peer-cards x4 in a row container | none | gap |
| 5 | CampaignEditorial `s-322a0d65ee53` | 5 | 10 | two media columns + overlay text/CTA | two-column | composable |
| 6 | Lookbook `s-fe254aac1209` | 2 | 32 | peer-looks x3 with hotspot markers | none | gap |
| 7 | EditorialMosaic `s-08e578513c2d` | 2 | 23 | grid-of-4 named columns x 2 stacked media | column-grid | composable |
| 8 | Craftsmanship `s-1f0a2498ae66` | 2 | 8 | two-column (media | content) | two-column | composable |
| 9 | ThePeople `s-bef01391dbd2` | 14 | 15 | 4 media slots interleaved with captions | none | gap |
| 10 | ProductSpotlight `s-a0cca2d0b670` | 4 | 19 | hero-with-background + 2 CTAs | hero | composable |
| 11 | Newsletter `s-09383274911f` | 4 | 12 | stacked-text band + form | text-band (text only) | gap |

---

## 0. SECTION/Hero/Primary — `s-df13cd3ab58d`

**(b) Observed subtree** — IR node `n-d6420d8409b4` (locator `245:5`, direction `absolute`),
4 direct children, 16 visible descendants; page-structure elements: `n-8fe6bad893e2`,
`n-8cbe9fda6d83` (slot containers only). Dispositions: 10 MAPPED / 5 DECORATION_MERGED /
1 NEEDS_REVIEW.

- `n-8fe6bad893e2` container **SLOT/HeroMedia** (`254:40`) — empty media slot frame
- `n-4f7536ff4932` icon **Overlay** (`254:41`) — decoration
- `n-8cbe9fda6d83` container **SLOT/HeroContent** (`254:42`) — 4 children:
  text `n-fafe83890504` "CHAPTER 01 / AW 2026" (`254:43`), text `n-e1d7daf26b02` "The Quiet
  Grandeur" (`254:44`), text `n-2939001f1d25` "Refined tailoring, knitwear and leather for the
  season." (`254:45`), container `n-1e764dddf28c` SLOT/HeroActions (`254:46`) holding component
  `n-d0f613010b51` Proto / Button/Primary (`254:47`; internal text `n-069615e32dda` "Label")
- `n-19c686552981` container **DECOR/ScrollIndicator** (`254:57`) — icon + text "SCROLL"
  (`254:59`)

**(c) Source locator** `design://figma-home-desktop/245:5`.

**(d) Layout semantics**: hero-with-background — full-width media slot behind an overlaid content
column (overline → display heading → body → action button), plus a scroll indicator decoration.

**(e) Content evidence**: manifest carries all three texts — `254:43` ("CHAPTER 01 / AW 2026"),
`254:44` ("The Quiet Grandeur"), `254:45` ("Refined tailoring, … season.") — and one media entry
`254:40` labeled offline placeholder `{{media url=wysiwyg/slaunchpad-home-real-derived/hero-bg-placeholder.jpg}}`
(no asset bytes committed). Missing: CTA label (`I254:47;251:77`) and CTA link; scroll-indicator
copy is decoration, not content. Roles projected for this section only:
background-media `254:40`, content-lead `254:43`, heading `254:44`, body `254:45`.

**(f) Intended native tree**: `row(contained) > banner(poster)` — SLOT/HeroMedia as banner
background image; the three texts as poster overlay content; the CTA as the banner's single
slide-button. (Existing hero shape's exact chain.)

**(g) Predicted gaps**: hero media has no committed asset bytes (placeholder-labeled; operator
asset required before any CMS write); CTA label/link absent from the manifest — the poster button
cannot compose unlinked; `DECOR/ScrollIndicator` (`n-19c686552981`) has no native target and
decoration-merges.

**(h) Existing shape**: **hero** — handled end-to-end by the #70 hero composer shape.

## 1. SECTION/BrandStatement — `s-812c04890b36`

**(b)** IR node `n-f08fdf072e3e` (`245:6`, direction `column`), 2 direct children, 3 visible
descendants; page-structure elements: none. Dispositions: 3 MAPPED.

- text `n-0b9486f7540d` **THE HOUSE** (`254:60`)
- text `n-74ae79d9e56c` "Luxury is what remains when everything unnecessary has been removed."
  (`254:61`)

**(c)** `design://figma-home-desktop/245:6`.

**(d)** Stacked-text band: two loose text layers in a column, no media, no columns, no CTA.

**(e)** Manifest carries **nothing** for this section — both texts exist only as layer names
(naming contract), no valueRefs.

**(f)** `row(contained) > text(default)` — both texts folded into one WYSIWYG band (text-band
chain; optionally `heading` for the eyebrow if a role projects it as one).

**(g)** No role projections exist for this section (the committed projection is bounded to
Hero/Primary + Craftsmanship), and no manifest copy — the text-band detector is role-driven and
will honestly skip until both inputs exist.

**(h)** **text-band** — existing #28 shape signature.

## 2. SECTION/Hero/Secondary — `s-3ca9401bcf2c`

**(b)** IR node `n-7255f8eed0ee` (`394:386`, direction `absolute`), 5 direct children, 10 visible
descendants; page-structure elements: `n-cf1f5f71570d`. Dispositions: 6 MAPPED /
2 NEEDS_REVIEW / 2 DECORATION_MERGED.

- `n-cf1f5f71570d` container **SLOT/SecondaryHeroMedia** (`394:387`) — empty media slot frame
- text `n-f324d04bddba` "CHAPTER 02 / THE COLLECTION" (`394:388`)
- text `n-89386341e221` "The Modern Silhouette" (`394:389`)
- text `n-f5957607a0ef` "An exploration of modern form and effortless style." (`394:390`)
- component `n-f2831f913814` **Proto / CTA — Arrow (Desktop)** (`394:391`) — text
  `n-c72c71d7302a` "CTA Label" + icon/arrow-right

**(c)** `design://figma-home-desktop/394:386`.

**(d)** hero-with-background, loose-text variant: same signature as section 0 (media slot +
overline/heading/body + CTA) except the three texts are direct section children (no SLOT content
wrapper) and the CTA is an arrow-link instance rather than a button instance. Detection would rely
on projected roles + geometric overlay containment, not container nesting.

**(e)** Manifest carries **nothing** for this section (no text valueRefs for `394:388/389/390`, no
media for `394:387`, no CTA label/link). No role projections.

**(f)** `row(contained) > banner(poster)` — media slot as banner background; the three loose texts
folded into poster overlay content; CTA composed as the banner button (or `buttons(inline) >
button-item(default)` inside the overlay content).

**(g)** All copy and CTA data missing from the manifest; media slot empty; role projections
absent; the loose-text (non-nested) layout means the hero detector's overlay containment must be
geometric — a check the flat NodeIR itself cannot perform (geometry is not carried).

**(h)** **hero** — signature match; composes once inputs exist.

## 3. SECTION/FeaturedCollections — `s-63f4f98ec020`

**(b)** IR node `n-09e39d9b5ae8` (`245:9`, direction `column`), 2 direct children, 45 visible
descendants; page-structure elements: `n-263fd5b8ac94`. Dispositions: 29 MAPPED /
5 NEEDS_REVIEW / 11 DECORATION_MERGED.

- component `n-91fb85066e67` **Section Header** (`256:96`) — Left: OVERLINE + Section Title;
  Link/Arrow "VIEW ALL"
- `n-263fd5b8ac94` container **SLOT/CollectionTiles** (`256:105`, direction `absolute`,
  0.8889 parent-width) with 4 children — **PEER GROUP: 3 x Proto / Collection Tile**
  (`n-67b36a50633d` `436:460`, `n-8384ef484928` `436:472`, `n-1e50d32d955c` `436:484`; each =
  Image > media Img + Gradient icon + Label(tile name + "24 PIECES") + Arrow) plus trailing
  `n-5da41eaba48f` **SLOT/EditorialFabricDetail** (`453:394`) — empty media slot frame

**(c)** `design://figma-home-desktop/245:9`.

**(d)** header + peer-cards-of-3 + trailing media slot. OBSERVATION (carousel vs static grid):
the tiles sit as peer-repeated identical instances inside an absolute-direction container; NodeIR
carries no geometry, so overlap cannot be observed — the slider-vs-grid decision is the
Coordinator's.

**(e)** Manifest carries **nothing** for this section. Tile media (`n-15669bb8d778`
`I436:460;436:396`, `n-772579615da5`, `n-70e15bec186e`), tile copy (Women / Men / Accessories /
"24 PIECES"), header copy (OVERLINE / Section Title / VIEW ALL) all exist only as layer names; the
trailing slot frame has no projection and no media entry.

**(f)** Two candidates, pending the Coordinator's carousel-vs-grid call —
candidate A (carousel reading): `row(contained) > slider(default) > slide(poster) x3` — tile image
as slide background (`data-background-images`), tile label/count in slide content, tile link on
the slide (`data-element="link"`); trailing media slot composes as a fourth slide or is excluded.
Candidate B (static grid reading): `row(contained) > heading(default)` +
`column-group(default) > column-line(default) > column(full-height) x3`, each column >
`image(full-width)` + text; trailing slot as a fourth column or excluded.

**(g)** Peer-repeated card groups match none of the four composer shapes (they key on distinct
named slots); carousel-vs-grid intent undecidable from NodeIR; zero manifest copy/media; "VIEW
ALL" has no link target, so the header's `buttons(inline) > button-item` cannot compose unlinked.

**(h)** **none** — closest is column-grid, but its Rule A/Rule B slot semantics assume distinct
named slots, not repeated instances; a peer-group handler is needed either way.

## 4. SECTION/FeaturedProducts — `s-9e92039d0743`

**(b)** IR node `n-9caec5a9c33f` (`245:7`, direction `column`), 2 direct children, 51 visible
descendants; page-structure elements: `n-8c476f5e021f`. Dispositions: 35 MAPPED /
10 NEEDS_REVIEW / 6 DECORATION_MERGED.

- component `n-ce1e3a12d0f0` **Section Header** (`254:62`) — same OVERLINE / Section Title /
  VIEW ALL structure as section 3
- `n-8c476f5e021f` container **SLOT/ProductCards** (`254:71`, direction `row`, 0.8889
  parent-width) — **PEER GROUP: 4 x Proto / Product Card** (`n-e93ce88d4dbf` `254:72`,
  `n-a307c9df3067` `254:81`, `n-1d62d0912764` `254:90`, `n-2947ec0e39e5` `254:99`; each =
  Image > media Img + Wishlist > heart-toggle icon, Body > Product Name / Category / "$0,000")

**(c)** `design://figma-home-desktop/245:7`.

**(d)** header + product-cards-of-4 in a row container — the only peer-card group whose container
declares `direction: row`. Card grid vs carousel OBSERVATION: 4 identical peer cards; native
`products` has both `grid` and `carousel` appearances; intent undecidable from NodeIR alone.

**(e)** Manifest carries **nothing**: the four card copies are placeholder layer names (Product
Name / Category / "$0,000" repeated x4), the four media nodes (`n-724c55a56cb7`,
`n-48d52538c969`, `n-2f05e34fdeed`, `n-1456238d5833` — all `I…;348:313`, the same shared
component media slot) have no entries, no product identifiers exist anywhere in the evidence.

**(f)** `row(contained) > heading(default)` + `products(grid)` — the products type persists as a
`{{widget type="Magento\CatalogWidget\Block\Product\ProductsList" … conditions_encoded="…"}}`
directive inside its declaration div (see `native-declarations-observed.md`), replacing the four
static cards with the widget's own runtime template. Static fallback (candidate):
`column-group > column-line > column x4` with `image(full-width)` + text per card — composable
from native families, but it loses product-listing semantics (no live catalog tie-in).

**(g)** products requires runtime catalog data + a valid widget condition payload
(registry `dataContext.requiresRuntimeData=true` for both appearances; `conditions_encoded` needs
live conditions/provider data absent from the evidence); zero product data in the manifest;
card-internal wishlist heart and price text are not expressible through the widget (fidelity
delegated to the widget's template; observed card internals decoration-merge).

**(h)** **none** — a products-widget handler is new; the static column fallback would reuse
column machinery but as a deliberate semantics trade.

## 5. SECTION/CampaignEditorial — `s-322a0d65ee53`

**(b)** IR node `n-d55b3385999e` (`299:300`, direction `absolute`), 5 direct children, 10 visible
descendants; page-structure elements: `n-68e74e3ed742`, `n-f6aa9399b404`. Dispositions:
6 MAPPED / 2 NEEDS_REVIEW / 2 DECORATION_MERGED.

- `n-68e74e3ed742` container **SLOT/CampaignMedia/Primary** (`299:301`) — empty media slot frame
- `n-f6aa9399b404` container **SLOT/CampaignMedia/Secondary** (`299:302`) — empty media slot frame
- text `n-a83d90dbcac5` **Overline** (`299:304`), text `n-56f74800eb54` **Title** (`299:305`) —
  loose section children
- component `n-853f3ab5046c` **Proto / CTA — Arrow (Desktop)** (`354:386`)

**(c)** `design://figma-home-desktop/299:300`.

**(d)** two-media-column split with overlay text + CTA: two distinct NAMED media slots (Primary /
Secondary) plus loose text and a CTA instance — structurally the two-slot signature, with an
overlay-vs-split fidelity tension (the design overlays text across the media pair; a column chain
stacks text inside a column).

**(e)** Manifest carries **nothing**: no media for `299:301/299:302`, no copy for
`299:304/299:305`, no CTA label/link. No role projections (column-primary/column-secondary exist
only for Craftsmanship).

**(f)** `row(contained) > column-group(default) > column-line(default) > column(full-height) x2` —
SLOT/CampaignMedia/Primary as column-primary, SLOT/CampaignMedia/Secondary as column-secondary,
each `image(full-width)`; Overline/Title folded into a `text(default)`; CTA as
`buttons(inline) > button-item(default)`. Expected declared gap: overlay text composes stacked,
not overlaid (two-column shape does not emit overlay positioning).

**(g)** Zero manifest inputs for this section; role projections absent; overlay-vs-split fidelity
gap must be declared rather than silently accepted.

**(h)** **two-column** — the exact two-projected-slot signature the G4 shape consumes.

## 6. SECTION/Lookbook — `s-fe254aac1209`

**(b)** IR node `n-4604a314e990` (`299:311`, direction `absolute`), 2 direct children, 32 visible
descendants; page-structure elements: `n-c89e2fc95ac3`. Dispositions: 16 MAPPED /
2 NEEDS_REVIEW / 14 DECORATION_MERGED.

- component `n-e0ee24c9880d` **Section Header** (`299:312`)
- `n-c89e2fc95ac3` container **SLOT/LookbookCards** (`299:321`, direction `absolute`) —
  **PEER GROUP: 3 x SLOT/LookbookLook** (`n-187a96303843` `299:322`, `n-6b1a3795ef47`
  `299:329`, `n-b14dd19aa328` `299:336`); each look = media slot frame
  (`n-07ee4a2984c4` `299:323`, `n-aeab0ba79953` `299:330`, `n-aaaa0ca13539` `299:337`)
  holding 4 icons — 2 Hotspot + 2 Hotspot Halo per look (12 hotspot icons total:
  `n-68d413ca0d41`/`n-e39694ef5aa4`/`n-3377bd02ef59`/`n-f37d82e88c17` in /01;
  `n-0f19e24b88ec`/`n-ed226c4255d4`/`n-c87b24fabdfd`/`n-284e49c724f4` in /02;
  `n-325a6f066b47`/`n-6f1d35c52412`/`n-ecf3b47c3eec`/`n-0e34c8a64d05` in /03) — plus a Caption
  text (`n-11838e9677a3` `299:328`, `n-f18f7c3e5cd3` `299:335`, `n-c6910d490258` `299:342`)

**(c)** `design://figma-home-desktop/299:311`.

**(d)** header + peer-looks-of-3 with interactive hotspot markers. OBSERVATION (carousel vs
static): 3 peer-repeated look groups in an absolute container — same undecidability as section 3.

**(e)** Manifest carries **nothing**: all three media slot frames empty, all captions only layer
names, header copy + VIEW ALL link absent. (Registry does carry lookbook widgets
`mageplaza_lookbook/widget/*`, `secomm_communitylookbookproduct/*`, but the intended tree here is
restricted to native families per scope.)

**(f)** Candidate A (carousel reading): `row(contained) > slider(default) > slide(poster) x3` —
look media as slide background, Caption in slide content, slide link for navigation. Candidate B
(static): `column-group > column-line > column x3` with `image(full-width)` + caption text.
Hotspots: **no native family represents interactive image markers**; they can only decoration-merge
(function lost) — a widget-based mapping (lookbook widgets exist in the registry) is a Coordinator
decision outside the native-only tree above.

**(g)** Peer-group handler missing; hotspot semantics unrepresentable in native families; carousel
vs static undecidable; zero manifest inputs; 14 nodes disposition DECORATION_MERGED (hotspots +
arrow internals) — the largest decoration load of any section.

**(h)** **none** — new handler required for the peer group; hotspots remain a content-level gap in
every variant.

## 7. SECTION/EditorialMosaic — `s-08e578513c2d`

**(b)** IR node `n-8fec2ddef48c` (`245:10`, direction `column`), 2 direct children, 23 visible
descendants; page-structure elements: `n-eae639ffd2e6`. Dispositions: 19 MAPPED /
2 NEEDS_REVIEW / 2 DECORATION_MERGED.

- component `n-87ea2e7ecabb` **Section Header** (`256:139`)
- `n-eae639ffd2e6` container **SLOT/MosaicGrid** (`284:406`) — **PEER GROUP: 4 x
  SLOT/MosaicColumn/NN** — four DISTINCT named slots (`n-0a2a7ac31212` `284:407`,
  `n-f6c51f48d892` `284:410`, `n-62e358862fd9` `284:413`, `n-eecb3f577a42` `284:416`), each
  holding **2 x media "Editorial Tile"** (8 media nodes: `n-4ba02c61f612`/`n-873a4616b196`
  `284:408/409`, `n-ae90ea0a418c`/`n-e695fc10e366` `284:411/412`, `n-fa8aba8ba0e5`/
  `n-ffade5183e70` `284:414/415`, `n-811e7366bea6`/`n-da0135704f05` `284:417/418`)

**(c)** `design://figma-home-desktop/245:10`.

**(d)** grid-of-4 named columns, 2 stacked media tiles per column — the column-grid Rule A
signature (2+ distinct named slots under one parent, grouped into lines). Whether all four columns
share one line or split 2+2 needs width/overlap evidence the flat NodeIR does not carry; column
count is unambiguous, line grouping is not.

**(e)** Manifest carries **nothing**: all 8 Editorial Tile media nodes lack entries; header copy +
VIEW ALL absent.

**(f)** `row(contained) > column-group(default) > column-line(default) > column(full-height) x4` —
one `image(full-width)` per Editorial Tile, stacked two per column; Section Header composes as a
leading `row(contained) > text(default)` band above the grid row (column-grid shape's loose-text
band handling).

**(g)** 8 media entries missing from the manifest; header copy + link missing; Rule A line
grouping (4-in-one-line vs 2+2) needs width/overlap evidence not present in NodeIR — width
apportionment must come from slot evidence.

**(h)** **column-grid** — the #28 Rule A grid signature with distinct named slots.

## 8. SECTION/Craftsmanship — `s-1f0a2498ae66`

**(b)** IR node `n-d855a3667d4a` (`299:343`, direction `absolute`), 2 direct children, 8 visible
descendants; page-structure elements match IR children exactly:
`n-f7fdb3800b45`, `n-40b044ec302f`. Dispositions: 8 MAPPED (no decoration, no
needs-review — the cleanest section).

- `n-f7fdb3800b45` container **SLOT/CraftMedia** (`299:344`) — empty media slot frame
- `n-40b044ec302f` container **SLOT/CraftContent** (`299:345`) — text **Overline**
  (`n-18601b1c6170`, `299:346`), text **Title** (`n-163864cf1358`, `299:347`), text **Body**
  (`n-a141b1429fa2`, `299:348`), plus media slot frames **SLOT/DetailStitch** (`n-3c41ed25fdd0`,
  `299:349`) and **SLOT/DetailFabric** (`n-14c929658e1b`, `299:350`)

**(c)** `design://figma-home-desktop/299:343`.

**(d)** two-column: media column | content column (overline/title/body + two inline detail media
slots in the content column). The only section with a full role projection set:
column-primary `299:344`, column-secondary `299:345`, content-lead `299:346`, heading `299:347`,
body `299:348`, inline-media `299:349` + `299:350`.

**(e)** Manifest carries the **three media** entries (all labeled offline placeholders:
`{{media url=wysiwyg/slaunchpad-home-real-derived/craft-media-placeholder.jpg}}`,
`detail-stitch-placeholder.jpg`, `detail-fabric-placeholder.jpg`) and **none of the text** —
Overline/Title/Body copy is not carried (explicit known gap recorded in the projection notes).

**(f)** `row(contained) > column-group(default) > column-line(default) > column(full-height) x2` —
SLOT/CraftMedia as column-primary (`image(full-width)`); SLOT/CraftContent as column-secondary:
`text(default)` folding overline/title/body, then `image(full-width)` x2 for DetailStitch and
DetailFabric. Exactly the G4 two-column chain already proven by #70's composer output.

**(g)** Text copy for `299:346/347/348` missing from the manifest (composition would emit with
explicit copy gaps, never invented); media placeholders need operator assets before any CMS write.

**(h)** **two-column** — the G4 shape's original target section.

## 9. SECTION/ThePeople — `s-bef01391dbd2`

**(b)** IR node `n-c5a2d284b49a` (`522:542`, direction `absolute`), **14 direct children** (the
widest flat section), 15 visible descendants; page-structure elements: the 4 slot frames only.
Dispositions: 15 MAPPED.

- texts `n-448916c4fcde` THE PEOPLE (`522:543`), `n-1afab465a359` "Worn in Their Own Way"
  (`522:544`), `n-3f84e84b0eb8` "Personal perspectives on modern dressing." (`522:545`),
  `n-fc105d9f1feb` "04 LOOKS" (`522:546`)
- **PEER GROUP: 4 x SLOT/PeopleLook** media slot frames (`n-f29c9d88ca11` `522:547`,
  `n-757b6d413c8b` `522:549`, `n-81d2b44d9c1c` `551`, `n-080f9b340992` `553`) **interleaved as
  siblings** with caption texts `n-5e1c45f378d5` "LOOK 01 — WOMEN'S TAILORING" (`522:548`),
  `n-e560cfd0da5f` (`522:550`), `n-fb8cab4ccd0b` (`522:552`), `n-3aaef987817a` (`522:554`)
- text `n-1a50af8c3a4d` "EXPLORE THE LOOKS →" (`522:555`)
- text `n-bd6a3b5c909f` **"PLACEHOLDER — RIGHTS UNVERIFIED"** (`522:556`)

**(c)** `design://figma-home-desktop/522:542`.

**(d)** 4 media slots interleaved with caption texts (slot+caption pairs at section level — the
captions are NOT contained by their look slots). Grid or carousel OBSERVATION: 4 peer-repeated
slot frames; intent undecidable from NodeIR.

**(e)** Manifest carries **nothing**: all four media slot frames empty, every text exists only as
a layer name, and one text is an explicit unresolved-rights placeholder
(`n-bd6a3b5c909f`, `522:556`).

**(f)** Candidate (grid reading): `row(contained) > heading(default)` +
`column-group > column-line > column x4`, each column > `image(full-width)` + caption text, plus
`buttons(inline) > button-item` for EXPLORE THE LOOKS (link required). Candidate (carousel
reading): `row(contained) > slider(default) > slide(poster) x4`. The slot+caption sibling pairing
itself needs a pairing rule (caption attaches to the preceding slot frame) that no existing shape
implements.

**(g)** Peer-group + sibling-caption-pairing handler missing; all media/copy absent from the
manifest; `n-bd6a3b5c909f` "PLACEHOLDER — RIGHTS UNVERIFIED" must be resolved (asset rights) or
excluded before any composition — an unresolved rights placeholder cannot be emitted; EXPLORE THE
LOOKS link target missing.

**(h)** **none** — new handler; also the only section carrying a rights gate.

## 10. SECTION/ProductSpotlight — `s-a0cca2d0b670`

**(b)** IR node `n-a871434262b9` (`245:12`, direction `absolute`), 4 direct children, 19 visible
descendants; page-structure elements: `n-7febca8cae89`, `n-d496a05ea77a`. Dispositions:
12 MAPPED / 5 DECORATION_MERGED / 2 NEEDS_REVIEW.

- `n-7febca8cae89` container **SLOT/SpotlightMedia** (`257:122`) — empty media slot frame
- `n-bc1a311b08c9` icon **Fade** (`257:123`) — decoration
- text `n-3f43b90dc479` **N°1** (`257:124`) — editorial index marker
- `n-d496a05ea77a` container **SLOT/SpotlightContent** (`257:125`) — text SIGNATURE OUTERWEAR
  (`n-ed7e3a9dc5f1`, `257:126`), text "The Signature Trench" (`n-8cc6d27cdd2d`, `257:127`), text
  "Relaxed tailoring in warm neutrals — the defining layer of the season." (`n-0f5e279541ac`,
  `257:129`), container SLOT/SpotlightActions (`n-6156f075634b`, `257:130`) holding **two button
  components**: `n-1f3401244093` Proto / Button/Primary Light (`257:131`) + `n-9d65ac65a88e`
  Proto / Button/Ghost Light (`257:136`)

**(c)** `design://figma-home-desktop/245:12`.

**(d)** hero-with-background variant: media slot + overlaid content column (eyebrow/heading/body)
+ **two** CTAs + an index marker ("N°1") — structurally the hero signature but with double CTA
load.

**(e)** Manifest carries **nothing** for this section: media slot `257:122` empty, the three texts
only layer names, both CTA labels/links absent. No role projections.

**(f)** `row(contained) > banner(poster)` — SLOT/SpotlightMedia as banner background; Spotlight
texts as poster overlay content; primary CTA as the banner's single slide-button. The secondary
CTA exceeds the poster skeleton (banner/slide carry exactly one button element — see
`native-declarations-observed.md`); it would need to ride inside the overlay content HTML or be a
declared gap.

**(g)** Two CTA instances vs the banner poster's one button slot; "N°1" marker and Fade icon are
presentation-only (decoration-merge loses the index marker unless folded into overlay content);
zero manifest inputs; no role projections.

**(h)** **hero** — signature match with the double-CTA fidelity gap declared.

## 11. SECTION/Newsletter — `s-09383274911f`

**(b)** IR node `n-76db1dc93c55` (`245:14`, direction `column`), 4 direct children, 12 visible
descendants; page-structure elements: `n-2bedcf5216a2`. Dispositions: 8 MAPPED /
2 NEEDS_REVIEW / 2 DECORATION_MERGED.

- text `n-3df7fe7d0c07` **THE CIRCULAR** (`257:181`)
- text `n-cbc964e1413f` "Letters from the House" (`257:182`)
- text `n-73eb53da11cd` "New arrivals, styling notes and private previews — one letter a month."
  (`257:183`)
- `n-2bedcf5216a2` container **SLOT/NewsletterForm** (`257:184`) — component
  `n-60ca83bf11ac` Proto / Input — Email (`354:419`; internal text `n-a0d59baf211a`
  "Email address") + component `n-96ed4e9ffade` Proto / Button/Primary (`257:187`)

**(c)** `design://figma-home-desktop/245:14`.

**(d)** stacked-text band + form: three loose texts and a form slot (email input + submit
button).

**(e)** Manifest carries **nothing**: all three texts only layer names, button label/link absent,
no form placeholder value.

**(f)** Text part: `row(contained) > text(default)` (text-band). Form part: **no honest native
composition** — the pinned native families include no input/form type. `html` would embed
arbitrary HTML against the composer's stated policy; `block` could host a newsletter block but
requires an existing CMS block entity, which the evidence does not contain. Any form mapping is a
Coordinator decision between those two, each with a named prerequisite.

**(g)** No native form family; block/html prerequisites absent; all copy missing from the
manifest.

**(h)** **text-band** for the text part only; the form region is shape-`none` — recorded as gap.

---

## Cross-cutting findings

1. **One repeated header component drives five sections.** The same `Section Header` component
   (OVERLINE + Section Title + VIEW ALL arrow-link) appears in sections 3, 4, 6, 7 — always with
   generic instance labels and never with a link target in the manifest. A single
   header-band handler (`text`/`heading` + optional `buttons(inline) > button-item`) would cover
   all four occurrences; the VIEW ALL link is a content gap in every one.
2. **The manifest carries 7 of 100+ content slots.** Exactly 3 text valueRefs (all Hero/Primary)
   and 4 media entries (Hero/Primary + Craftsmanship) exist; every other section's copy and media
   exists only as design layer names. Composition therefore needs a content-sourcing pass before
   any section beyond the two already projected can compose truthfully.
3. **Peer-repeated card groups are the missing shape.** Three sections (3, 4, 6) + one variant
   (9) hold N identical peer instances (3 tiles / 4 cards / 3 looks / 4 slot+caption pairs).
   None of the four composer shapes keys on repetition; all key on distinct named slots. One
   peer-group handler with a carousel-vs-grid policy input would cover all four signatures.
4. **Carousel intent is never decidable from NodeIR.** All carousel-looking containers are
   `absolute`/`row` with peer-repeated children; NodeIR carries no geometry, so overlap — the
   usual carousel signal — is unobservable here. The slider-vs-grid decision needs an explicit
   policy or external signal per section, not tree inference.
5. **Two declaration-level constraints bind the intended trees**: `products` persists as a widget
   directive requiring runtime `conditions_encoded` data (registry
   `requiresRuntimeData=true`), and banner/slide posters carry exactly one button element each.
6. **Rights gate**: `n-bd6a3b5c909f` "PLACEHOLDER — RIGHTS UNVERIFIED" (section 9) is the only
   node whose blocker is legal, not structural.
7. **Hero/Secondary (`394:386`) is structurally Hero/Primary minus the content-slot wrapper** —
   the loose-text hero variant. Its detector needs role projections + geometric overlay
   containment; NodeIR's lack of geometry makes the latter a projection-level concern.

## Count summary

- **Existing shape match**: 7 of 12 fully (hero x3: sections 0, 2, 10; two-column x2: 5, 8;
  column-grid x1: 7; text-band x1: 1), plus section 11 text-band-partial (text only, form gapped).
- **New handlers needed**: 5 sections carry gaps requiring new machinery — peer-group/card
  handlers (sections 3, 6, 9), a products-widget handler (section 4), a form/block decision
  (section 11).
- **Composable as diagnosed**: 7; **gap as diagnosed**: 5 (sections 3, 4, 6, 9, 11).
- **Content-level gaps inside otherwise composable trees**: hotspot markers (section 6, 12 icons),
  email input (section 11), double-CTA (section 10), rights placeholder (section 9).
