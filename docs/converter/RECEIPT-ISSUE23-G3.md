# Receipt — [23] G3 Native Page Builder Hero vertical slice

**Status:** structural PASS delivered · Admin round-trip NOT RUN (`LOCAL_ADMIN_ROUNDTRIP_NOT_RUN`) · Draft PR, no merge
**Branch:** `thanhle74/g3-first-native-page-builder-hero-vertical-slice` (isolated Orca worktree off `main` @ `185d91c`). Note: the coordinator start comment named `task/23-g3-native-pb-hero-vertical-slice`; this worktree/branch is the actual isolation used — same base, same isolation intent, name differs.
**Gate:** `npm test` → **103/103** checks (was 95; +8 G3 checks). CI-identical (pure `npm test`).

## 1. What was built (one slice, end-to-end)

Figma-observed hero `SECTION/Hero/Primary` (`245:5`, 1440×880, background media + overlaid text + CTA — **not** a two-column layout) → native Magento Page Builder **master-format HTML**, deterministic and offline, through the existing pipeline:

```
det inspect  → CapabilityRegistry (banner/row declarations, proof=registered)
det extract  → NodeIR + PageStructure + SourceReview (11 nodes inventoried, all accounted)
det compose  → ComposeOutput: persisted native content + per-node mapping + honest gap diagnostics
```

`det compose` is the **gated platform-serializer stage** the G2 contract itself names (`extract.ts` `pageStructureToHarness`: "structural containers … are resolved by the later gated platform-serializer stage, not here"). No component instances exist in the observed hero, so the binding resolver is not the mapping unit; `det plan` is deliberately not part of this slice's path (empty binding map, pinned for evidence consistency). The composer is an **adapter** (`adapters/magento-pagebuilder-compose/`), not core code — the core stays platform-neutral and only validates pins, selects the adapter by output contract, spawns it, and re-verifies its echoed input hashes.

## 2. Source evidence (real checkout, read-only)

| Fact | Evidence locator (owner checkout; never hardcoded in the toolkit) |
|---|---|
| Banner type + appearances `collage-left`, `collage-centered`, `collage-right`, `poster` (default) | `vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/banner.xml` |
| Row type + appearances `contained` (default), `full-bleed`, `full-width`; children policy **allow** (→ banner inside row legal) | `.../content_type/row.xml` |
| Every element carries `data-element="<name>"` in persisted content; master-format reader populates Admin forms by those names | `view/adminhtml/web/js/content-type/observable-updater/attributes.js`; `view/adminhtml/web/js/master-format/read/configurable.js` |
| Real stored master format: row(`contained`) > banner(`poster`) with `data-background-images` JSON + `{{media url=…}}` + heading/body in the content WYSIWYG | local DB `cms_page` page_id=5 ("About us"), read-only query, 2026-11-06 |
| Page Builder module present/enabled in the target checkout | composer.lock + app/etc/config.php (probe surface) |

**#19 alignment:** the issue's 20 native content types / 33 appearances receipt was not re-audited; only the banner and row declarations needed by this slice were read at their exact locators. The Banner `poster` appearance was **verified in the declaration before use** (per the issue's warning), not inferred.

## 3. Design-source provenance (honest labels)

- File `vNPtfBRpYM3PsExirVqhmt`, desktop root `245:2` (PAGE/Home/Desktop), target `245:5` (`SECTION/Hero/Primary`), children `254:40` (SLOT/HeroMedia), `254:41` (gradient decor), `254:42` (SLOT/HeroContent → `254:43` overline, `254:44` heading, `254:45` body, `254:46` actions → `254:47` CTA), `254:57` (scroll-indicator decor).
- Observation: connected design-tool MCP read, **2026-11-06, OBSERVED — NOT REVISION-PINNED**. Fixture `revisionId` = `mcp-observed-unpinned-2026-11-06` (states the observation date, never a source revision). No `LIVE_FIGMA_READ_ONLY_VERIFIED` claim is made; #18 REST remains token-blocked and untouched.
- Fixture `tests/fixtures/g3-hero-design-source/design-tree-hero.fixture.json` is bounded to the hero target (sibling sections deliberately absent), node IDs preserved exactly, labels follow the naming spec (display names in the real file may differ slightly — node IDs are the identity). Committed surfaces stay platform-neutral per the T-09/G2-T28 neutrality policy; the real file identity lives here in the receipt.
- Content manifest (`hero-content.fixture.json`): the 4 observed texts + CTA link + one **labeled offline placeholder** media reference (`{{media url=wysiwyg/g3-hero/hero-1440x880-placeholder.jpg}}`) — never a temporary design-tool URL. Operator must supply the real local asset before any CMS write.

## 4. Mapping report (source node → native Page Builder)

Native target: **row(appearance `contained`) > banner(appearance `poster`)** — the platform's own background-image-with-text-overlay unit; every landed field is an Admin-editable banner form field. Composed content (deterministic, 1363 bytes):

```html
<div data-content-type="row" data-appearance="contained" data-element="main"><div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"><div data-content-type="banner" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main"><a href="/collections" data-element="link"><div class="pagebuilder-banner-wrapper" data-background-images="{&quot;desktop_image&quot;:&quot;{{media url=wysiwyg/g3-hero/hero-1440x880-placeholder.jpg}}&quot;}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="wrapper"><div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" style="min-height: 880px;" data-element="overlay"><div class="pagebuilder-poster-content"><div data-element="content"><p>CHAPTER 01 / AW 2026</p><h2>The Quiet Grandeur</h2><p>Refined tailoring, knitwear and leather for the season.</p></div><button type="button" class="pagebuilder-banner-button" data-element="button" style="opacity: 1; visibility: visible;">Explore the Collection</button></div></div></div></a></div></div></div>
```

| Source node | Observed role | Native landing | Disposition |
|---|---|---|---|
| `245:5` SECTION/Hero/Primary | hero section | row(`contained`) > banner(`poster`) container (`data-element="main"`) | MAPPED |
| `254:40` SLOT/HeroMedia | full-width background image | banner `wrapper` → `data-background-images` (desktop_image; **mobile not composed**) | MAPPED |
| `254:41` gradient decor | overlay gradient | **no native field** (banner overlay is a single color) → NOT_VERIFIED warning | GAP |
| `254:42` SLOT/HeroContent | overlaid text group | folded into banner `content` WYSIWYG (`message`) | MAPPED (folded) |
| `254:43` SLOT/Overline | kicker text | content WYSIWYG lead `<p>` — standalone styling semantics **not preserved** (single WYSIWYG field) | MAPPED (noted) |
| `254:44` SLOT/Heading | heading | content WYSIWYG `<h2>` | MAPPED |
| `254:45` SLOT/BodyCopy | body | content WYSIWYG `<p>` | MAPPED |
| `254:46` SLOT/HeroActions | actions group | folded into banner button area | MAPPED (folded) |
| `254:47` SLOT/CTA | CTA label | banner `button` → `button_text` (+ `link` wrapper from manifest; missing entry → button renders unlinked + warning) | MAPPED |
| `254:57` scroll-indicator decor | decorative | **no native equivalent** → NOT_VERIFIED warning | GAP |

All 10 planned nodes are accounted (8 mapped / 2 gaps); nothing silently dropped, nothing invented. No arbitrary embeddable-markup content type is produced (asserted in tests); no inline Tailwind/React/CSS; missing manifest entries produce explicit `EVIDENCE_MISSING` gaps, never defaults.

## 5. Verification performed

- `npm test` **103/103** (G3-T29a..h): registered-proof probe with deterministic content-digest revision (a checkout nested in another repo no longer inherits that repo's HEAD — small correctness fix in the inspect adapter, covered by the projection normalization already used by #9 tests); exact extraction accountability (9 MAPPED / 2 DECORATION_MERGED / 0 NEEDS_REVIEW); byte-identical compose across runs; no-write default and `--dry-run` truth; 4/4 pin negatives fail closed (manifest revision, NodeIR hash, binding-map revision, wrong-contract adapter); sparse-manifest honesty; committed example parity (`examples/converter/compose-output.g3-hero.example.json`); neutrality scans over the new neutral surfaces.
- Determinism: same inputs ⇒ byte-identical `native-content.html` + stable report hash (volatile `accessedAt` excluded).

## 6. `LOCAL_ADMIN_ROUNDTRIP_NOT_RUN` — what the operator runs (exact steps)

The local Magento runtime is mounted, but **no disposable CMS target was explicitly selected by the operator in this session**, and the issue gates local CMS writes on that explicit selection. Therefore this receipt claims **structural PASS only**. When the operator picks a disposable target page (a NEW page — never the live Homepage), the round-trip is:

```bash
# 0) Local override (gitignored) — profiles/g3-hero-vertical-slice.local.json:
#    { "schemaVersion": 1, "profile": { ... same shape as the fixture profile,
#      "projectSources": [{ "sourceId": "g3-hero-fixture-source", "kind": "fixture-tree",
#                           "path": "<local design-source dir>" }] } }
npm run build
node bin/det.js inspect --profile profiles/g3-hero-vertical-slice.local.json --project <magento-checkout> --out out/
node bin/det.js extract --profile profiles/g3-hero-vertical-slice.local.json --project <design-source-dir> \
  --design-file design-tree-hero.fixture.json --design-node 245:2 \
  --registry out/capability-registry.json --bindings tests/fixtures/g3-hero-design-source/g3-component-bindings.fixture.json --out out/
node bin/det.js compose --profile profiles/g3-hero-vertical-slice.local.json --registry out/capability-registry.json \
  --bindings tests/fixtures/g3-hero-design-source/g3-component-bindings.fixture.json \
  --input out/page-structure.json --nodeir out/node-ir.json \
  --content tests/fixtures/g3-hero-design-source/hero-content.fixture.json --out out/
# → out/native-content.html  (replace the labeled placeholder image with a real local media asset first)

# 1) Create a NEW disposable CMS page (Admin: Content → Pages → Add New Page) — never the Homepage.
# 2) In the Page Builder editor: open the HTML/Code view of the content area, paste out/native-content.html,
#    switch back to the visual stage. Expected: the hero renders as one banner block (image + overlaid
#    heading/text + button), editable via the banner form fields (Content, Background Image, Button Text, Link).
# 3) Admin Edit → change heading text → Save → Reload the page → confirm the edit persisted and content/order preserved.
# 4) Storefront: load the disposable page URL and confirm the hero renders.
# Only after steps 1–4: claim ADMIN_ROUNDTRIP_PASS with screenshots; anything less stays NOT_RUN.
```

Read-only DB evidence (existing real PB page) was collected this session; no CMS/DB write of any kind was made.

## 7. Non-goals honored / known gaps

Not done (per issue non-goals): pixel-perfect CSS/Tailwind, Hyvä theme work, full recursive converter, dashboards, bulk migration, security suites. Known gaps recorded as diagnostics, not engineered around: gradient overlay (single-color field only), scroll indicator (no native element), mobile breakpoint (desktop-only composition), overline styling semantics (single WYSIWYG field), per-section shape guard (non-hero sections are skipped with explicit warnings).

## 8. Integration notes

- Baseline `main` @ `185d91c`; PRs #20/#21/#22 are unmerged drafts and were **not** merged, cherry-picked or copied. Their features (lean docs, live Figma adapter, real-source KB records) are deliberately absent here; the G3 registry comes from the real-probe adapter over a fixture checkout, and the KB store on `main` is untouched.
- New schemas are additive minors of `schemas/cli` (1.2.0): `content-manifest`, `compose-input`, `compose-output`; `tool-run` gains the `compose` command + `compose-report` artifact role. The closed 21-code converter diagnostic registry is unchanged (gaps are `NOT_VERIFIED` warnings; the schema's `$comment` version tables updated).
- Decisions recorded: `ADR-023-001..004` in [DECISIONS.md](DECISIONS.md).
