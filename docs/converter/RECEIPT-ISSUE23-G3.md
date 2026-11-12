# Receipt — [23] G3 Native Page Builder Hero vertical slice

**Status:** structural PASS · local Admin smoke EXECUTED under the Coordinator's LOCAL ADMIN SMOKE GO (2026-11-06): service-layer round-trip + storefront render + edit persistence PASS (`ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS`); literal Admin-UI form click-through PENDING operator (no credentials available to the worker) · Draft PR, no merge
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

## 3. Design-source provenance — RAW-FAITHFUL after the coordinator correction

Coordinator review of PR #24 (`2da9634`) accepted the serializer POC and required one fidelity correction: the first fixture had rewritten observed kinds/labels into semantic ones. This revision re-observed the real subtree (design-tool MCP `get_metadata`, read-only, 2026-11-06) and the fixture is now **raw-faithful**:

- File `vNPtfBRpYM3PsExirVqhmt`, desktop root `245:2` (PAGE/Home/Desktop), target `245:5` `SECTION/Hero/Primary` (frame, 1440×880, at y=120).
- Observed subtree (types/names exactly as observed): `254:40` **frame** `SLOT/HeroMedia` (1440×880, media fill); `254:41` **rounded-rectangle** `Overlay` (1440×880 — the design-tool type is deliberately outside the core kind table → NodeIR `unknown` + `NOT_VERIFIED`); `254:42` frame `SLOT/HeroContent` (120,356,520×376) → `254:43` text `CHAPTER 01 / AW 2026`, `254:44` text `The Quiet Grandeur`, `254:45` text `Refined tailoring, knitwear and leather for the season.` (text layers are named by their content — no SLOT-role names), `254:46` frame `SLOT/HeroActions` (241×116) → `254:47` **instance** `Proto / Button/Primary` (241×100; definition external to the bounded read — `componentRef` records the observed component name and intentionally does not resolve in-document; extraction honestly reports it `NEEDS_REVIEW`/custom-required); `254:57` frame `DECOR/ScrollIndicator` (695,776,50×76) → `254:58` rounded-rectangle `Rectangle`, `254:59` text `SCROLL`.
- Observation is **OBSERVED — NOT REVISION-PINNED**; fixture `revisionId` = `mcp-observed-unpinned-2026-11-06`. No `LIVE_FIGMA_READ_ONLY_VERIFIED` claim; #18 REST remains token-blocked and untouched. Committed surfaces stay platform-neutral per the T-09/G2-T28 policy.
- **Semantic projection** (`hero-projection.fixture.json`, schema `resources/schemas/cli/semantic-projection.schema.json`, family 1.2.0): because the source carries no SLOT-role text names and the CTA is a component instance, composer roles are assigned by this explicit, reason-carrying, revision-pinned document — the recorded, reviewable human decision (7 assignments: background-media `254:40`; content-lead `254:43`; heading `254:44`; body `254:45`; cta `254:47`; decoration `254:41`, `254:57`). The composer uses it via `det compose --projection`; the composed content is byte-identical to the pre-correction output, so only the provenance changed. Without the projection (and without naming hints) the raw source honestly composes NOTHING (test-asserted).
- Content manifest (`hero-content.fixture.json`): the 4 observed texts + CTA link + one **labeled offline placeholder** media reference (`{{media url=wysiwyg/g3-hero/hero-1440x880-placeholder.jpg}}`) — never a temporary design-tool URL. Operator must supply the real local asset before any CMS write.

## 4. Mapping report (source node → native Page Builder)

Native target: **row(appearance `contained`) > banner(appearance `poster`)** — the platform's own background-image-with-text-overlay unit; every landed field is an Admin-editable banner form field. Composed content (deterministic, 1363 bytes):

```html
<div data-content-type="row" data-appearance="contained" data-element="main"><div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"><div data-content-type="banner" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main"><a href="/collections" data-element="link"><div class="pagebuilder-banner-wrapper" data-background-images="{&quot;desktop_image&quot;:&quot;{{media url=wysiwyg/g3-hero/hero-1440x880-placeholder.jpg}}&quot;}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="wrapper"><div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" style="min-height: 880px;" data-element="overlay"><div class="pagebuilder-poster-content"><div data-element="content"><p>CHAPTER 01 / AW 2026</p><h2>The Quiet Grandeur</h2><p>Refined tailoring, knitwear and leather for the season.</p></div><button type="button" class="pagebuilder-banner-button" data-element="button" style="opacity: 1; visibility: visible;">Explore the Collection</button></div></div></div></a></div></div></div>
```

| Source node (observed type + name) | Projected role | Native landing | Disposition |
|---|---|---|---|
| `245:5` frame `SECTION/Hero/Primary` | — (section) | row(`contained`) > banner(`poster`) container (`data-element="main"`) | MAPPED |
| `254:40` frame `SLOT/HeroMedia` | background-media | banner `wrapper` → `data-background-images` (desktop_image; **mobile not composed**) | MAPPED |
| `254:41` rounded-rectangle `Overlay` | decoration | **no native field** (banner overlay is a single color) → NOT_VERIFIED warning | GAP |
| `254:42` frame `SLOT/HeroContent` | — (folded container) | folded into banner `content` WYSIWYG (`message`) | MAPPED (folded) |
| `254:43` text `CHAPTER 01 / AW 2026` | content-lead | content WYSIWYG lead `<p>` — standalone styling semantics **not preserved** (single WYSIWYG field) | MAPPED (noted) |
| `254:44` text `The Quiet Grandeur` | heading | content WYSIWYG `<h2>` | MAPPED |
| `254:45` text `Refined tailoring, …` | body | content WYSIWYG `<p>` | MAPPED |
| `254:46` frame `SLOT/HeroActions` | — (folded container) | folded into banner button area | MAPPED (folded) |
| `254:47` **instance** `Proto / Button/Primary` | cta | banner `button` → `button_text` (+ `link` wrapper from manifest; missing entry → button renders unlinked + warning) | MAPPED |
| `254:57` frame `DECOR/ScrollIndicator` | decoration | **no native equivalent** → NOT_VERIFIED warning | GAP |
| `254:58` rounded-rectangle `Rectangle` | — (in decorated subtree) | excluded with explicit record | EXCLUDED |
| `254:59` text `SCROLL` | — (in decorated subtree) | excluded with explicit record | EXCLUDED |

All 12 planned-subtree nodes are accounted (8 mapped / 2 gaps / 2 excluded-with-record); nothing silently dropped, nothing invented. No arbitrary embeddable-markup content type is produced (asserted in tests); no inline Tailwind/React/CSS; missing manifest entries produce explicit `EVIDENCE_MISSING` gaps, never defaults.

## 5. Verification performed

- `npm test` **103/103** (G3-T29a..h): registered-proof probe with deterministic content-digest revision (a checkout nested in another repo no longer inherits that repo's HEAD — small correctness fix in the inspect adapter); **raw-faithful extraction accountability** (9 MAPPED / 1 DECORATION_MERGED / 3 NEEDS_REVIEW: unmapped `rounded-rectangle` kind ×2, externally-defined button instance — never guessed); **fidelity guard: the raw source composes NOTHING without the explicit projection** (honest skip + empty content, exit 1); byte-identical compose across runs; no-write default and `--dry-run` truth; **5/5 pin negatives** fail closed (manifest revision, NodeIR hash, binding-map revision, projection revision, wrong-contract adapter); sparse-manifest honesty; committed example parity (`resources/examples/converter/compose-output.g3-hero.example.json`); neutrality scans over the new neutral surfaces.
- Determinism: same inputs ⇒ byte-identical `native-content.html` + stable report hash (volatile `accessedAt` excluded).

## 6. Local Admin smoke — EXECUTED under the Coordinator's LOCAL ADMIN SMOKE GO (2026-11-06)

Target explicitly selected by the coordinator: the running **Slaunchpad LOCAL** checkout/DB (Magento CE 2.4.8-p5, nginx on this machine; storefront served locally via the local vhost and publicly via Cloudflare at `slaunchpad.thanhaloha.io.vn`). **Write target = the local database through Magento's own CMS service layer** — one NEW disposable page only:

- **Page:** `det-g3-hero-smoke` (identifier checked free before import), title `DET G3 Hero Smoke (Local Only)`, store view `vi` (id 1, the default view). **page_id=38.**
- **Mechanism:** one-off guarded script at the checkout root (`det_g3_hero_smoke_import.php`; actions `import|verify|edit-heading|restore|rollback`) using `Magento\Cms\Api\PageRepositoryInterface` — no direct SQL, no new module/service; identifier collision aborts; existing pages (incl. Homepage ids 2/36, about-us ids 5/11) verified untouched.
- **Content:** the PR #24 composed master format re-composed through the same deterministic pipeline with a LOCAL content manifest (gitignored `out/`): real first-party media `.renditions/wysiwyg/Hero_1.jpg` (present on disk, already rendered by cms page 5) + CTA `/collections` (verified `url_rewrite` → category 7).

**Results:**

1. **IMPORT + INTEGRITY PASS** — page created via the service layer; read-back `content_sha256=f7a11aaa93c39578…` equals the composed file's hash byte-for-byte; `stores=[1]`, `is_active=1`.
2. **STOREFRONT RENDER PASS (13/13 checks)** — `https://slaunchpad.thanhaloha.io.vn/det-g3-hero-smoke` (200; pure-local check via `--resolve …127.0.0.1`, 88 ms): `row(contained) > banner(poster)` in the DOM; Page Builder's own rendering applied the background image from `data-background-images` (computed style `url(…/media/.renditions/wysiwyg/Hero_1.jpg)`); overlaid overline/heading/body + CTA button/link all render; `min-height: 880px` honored. Evidence: live-DOM eval (Orca embedded browser) + screenshot [`docs/converter/docs/evidence/g3-admin-smoke-storefront-hero.png`](evidence/g3-admin-smoke-storefront-hero.png) (breadcrumb "Trang chủ › DET G3 Hero Smoke (Local Only)" + full hero). Honest note: the hero's visual styling (background-size cover, link styling) is the theme's banner CSS — out of scope by the issue's non-goals; the master-format structure is what this gate proves.
3. **EDIT PERSISTENCE PASS** — heading edited through `PageRepositoryInterface` ("The Quiet Grandeur (SMOKE EDIT)") → `cache:clean full_page` → storefront renders the EDITED heading; content restored to the composed bytes → storefront verified original again. No residual edits.
4. **ADMIN UI FORM CLICK-THROUGH: PENDING (precise blocker)** — the Admin login is live (`/admin`, 200) but this worker holds **no admin credentials**, and resetting any admin user's password is outside the GO — so the literal Admin Content→Pages→Page-Builder-stage interaction was not driven. Remaining step (~2 min, operator/owner): open the page in Admin, confirm the stage shows Row › Banner with editable Content/Background/Button fields, change the heading, Save, Reload, confirm on the storefront.

**Verdict: `ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS`; `ADMIN_UI_FORM_CLICKTHROUGH_PENDING`** (blocker: credentials). The saved markup is element-for-element and attribute-for-attribute the same declared set as the live admin-authored banner on cms page 5 (same `banner.xml` declaration, same `data-element` names the Admin master-format reader populates forms from).

**Rollback (this disposable page only):** `php det_g3_hero_smoke_import.php rollback det-g3-hero-smoke`

## 6b. Correction (2026-11-09): banner overlay min-height persists via the platform's data-pb-style block

**Root cause (coordinator follow-up, G4 receipt §8 FLAG — confirmed here by source + DB comparison):** the composed banner carried the poster-overlay `min-height: 880px` as an **inline** `style` attribute. Magento Page Builder's Admin master-format reader (`view/adminhtml/web/js/master-format/read/configurable.js`) executes, per element and viewport, `setAttribute("style", getAttribute("data-<viewport>-style"))` — it **overwrites** inline style attributes with the `data-<viewport>-style` attribute, which exists only after `stage-builder.js convertToInlineStyles` maps the leading `<style>` block's `#html-body [data-pb-style=KEY]` rules onto keyed elements. An inline-only overlay height therefore silently disappears on Admin open → Save (same defect class as G4's `NAN/12` columns; no NaN symptom here, just the lost height).

**Canonical comparison (read-only DB, this checkout):** the admin-authored banner on cms page 5 persists the overlay keyed — element `data-element="overlay" data-pb-style="UJKMGER"` with rule `#html-body [data-pb-style=UJKMGER]{border-radius:0;min-height:300px;background-color:transparent}` in the leading `<style>` block and **no inline style on the overlay**.

**Fix (adapter 1.0.1, one mechanism, nothing else in the hero mapping changed):** the overlay element now carries a deterministic `data-pb-style` key (`"P" + 6 uppercase hex of sha256("<sectionNodeId>:overlay")`) and a leading `<style>` rule `#html-body [data-pb-style=KEY]{min-height:880px}`; no inline style attribute on the overlay. The CTA button's inline `style="opacity: 1; visibility: visible;"` is the platform banner template's own markup and stays unchanged per the correction's scope.

**Tests:** `npm test` **103/103** — the min-height assertion now asserts the keyed style block (leading `<style>#html-body [data-pb-style=P…]{min-height:880px}</style>`, keyed overlay, no inline overlay style, unique keys); byte-determinism, accountability counts, pin negatives and the committed-example parity all pass against the regenerated example (content hash `sha256:a9f6ed95…`; the only volatile field remains `source.accessedAt`).

**Local smoke (within the prior LOCAL GO; overwrite of the existing page 38 is unsafe — its import script aborts on collisions — so a NEW disposable page):** `det-g3-hero-smoke2` (**page_id=41**, store view `vi`/id 1), via `PageRepositoryInterface` (guarded `det_g3_hero_smoke2_import.php` in the local checkout root; collision aborts; refuses stale inline-shape content). Existing pages incl. Homepage 2/36, G3 page 38, G4 pages 39/40 verified untouched.
1. Import integrity PASS — read-back `content_sha256=374b332f…` == composed bytes (composed content with the real local media `.renditions/wysiwyg/Hero_1.jpg` and CTA `/collections`, verified `url_rewrite` → category 7); stored shape: `style_block=yes overlay_keyed=yes overlay_inline_minheight=no`.
2. Storefront render PASS — `https://slaunchpad.thanhaloha.io.vn/det-g3-hero-smoke2` (200): the keyed rule is served byte-exact (`<style>#html-body [data-pb-style=P655B4F]{min-height:880px}</style>`), the overlay carries `data-pb-style="P655B4F"` and **no** inline style; `row(contained) > banner(poster)`, background media `Hero_1.jpg`, heading/body/CTA + `/collections` link all render; storefront `<body id="html-body">` matches the rule selector, so the min-height applies deterministically. Screenshot: [`docs/converter/docs/evidence/g3-smoke2-storefront-hero-pbstyle.png`](evidence/g3-smoke2-storefront-hero-pbstyle.png) (unstyled-page render per the established evidence standard; theme styling out of scope).
3. Edit→restore PASS — service-layer heading edit persisted, content restored to composed bytes, re-verified.

**Still honestly not claimed:** the literal Admin UI open→Save→Reload round-trip on page 41 (worker holds no admin credentials) — `ADMIN_UI_FORM_CLICKTHROUGH` remains the operator gate. This correction removes the known markup reason the height would be lost on that save. **Rollback (this disposable page only):** `php det_g3_hero_smoke2_import.php rollback det-g3-hero-smoke2`

## 7. Non-goals honored / known gaps

Not done (per issue non-goals): pixel-perfect CSS/Tailwind, Hyvä theme work, full recursive converter, dashboards, bulk migration, security suites. Known gaps recorded as diagnostics, not engineered around: gradient overlay (single-color field only), scroll indicator (no native element), mobile breakpoint (desktop-only composition), overline styling semantics (single WYSIWYG field), per-section shape guard (non-hero sections are skipped with explicit warnings).

## 8. Integration notes

- Baseline `main` @ `185d91c`; PRs #20/#21/#22 are unmerged drafts and were **not** merged, cherry-picked or copied. Their features (lean docs, live Figma adapter, real-source KB records) are deliberately absent here; the G3 registry comes from the real-probe adapter over a fixture checkout, and the KB store on `main` is untouched.
- New schemas are additive minors of `resources/schemas/cli` (1.2.0): `content-manifest`, `semantic-projection`, `compose-input`, `compose-output`; `tool-run` gains the `compose` command + `compose-report` artifact role. The closed 21-code converter diagnostic registry is unchanged (gaps are `NOT_VERIFIED` warnings).
- Decisions recorded: `ADR-023-001..006` in [DECISIONS.md](DECISIONS.md).
- Coordinator correction round (2026-11-06): verdict `SERIALIZER_POC_ACCEPT / FIGMA_SOURCE_FIDELITY_CORRECTION_REQUIRED` on PR #24 @ `2da9634`; resolved by the raw-faithful fixture + explicit projection above, same branch, no scope growth (no generic design-tool engine, no new gates).
- Correction round (2026-11-09): banner overlay min-height moved from an inline style attribute into the platform's own `data-pb-style` style-block mechanism (§6b; G4 receipt §8 FLAG, ADR-023-006). Adapter 1.0.0 → 1.0.1; hero mapping/content otherwise unchanged; `PR #26` was built atop this PR's earlier tip `5ae2ec6` and must reconcile its ancestry in the planned integration sequence (neither PR merged).
