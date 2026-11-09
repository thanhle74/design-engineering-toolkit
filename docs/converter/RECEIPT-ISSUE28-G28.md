# Receipt — [28] DET Preview Theme + Figma Homepage 245:2 end-to-end

**Status:** end-to-end EXECUTED through the existing pipeline; coordinator review CORRECTION_REQUIRED (C1/C2/C3) → **corrections implemented on this same branch** (one-shot `det build --config` orchestrator + versioned build bundle/manifest + committed guarded preview runbook; see §10) — full-root extraction (253 nodes, all 12 sections planned) → full-page native Page Builder composition (12/12 sections, 0 skipped) → one independent DET Preview Theme → isolated local preview store view rendering the composed homepage; service-layer edit round-trip PASS (`ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS` on the preview page); literal Admin-UI form click-through **PENDING** (worker holds no admin credentials — `OWNER_ACTION_REQUIRED`, same gate as #23/#25) · Draft PR, no merge
**Branch:** `thanhle74/28-det-preview-theme-figma-homepage-245-2-end-to` (the Orca worktree branch; the coordinator start comment named `task/28-det-preview-theme-figma-homepage`, which did not exist — same base `main` @ `9495f43`, same isolation intent, name differs as in #23/#25).
**Gate:** `npm test` → **123/123** checks (110 baseline + 7 G28 + 6 build-suite checks incl. full-root extraction accountability, per-shape composition invariants, determinism, pin negatives, committed-example parity, neutrality). G3/G4 suites keep guarding their byte-identical baselines in the same run.

## 1. What was built (one integrated run, no new engine, no parallel converters)

The complete observed desktop Homepage root `245:2` (file `vNPtfBRpYM3PsExirVqhmt`, page `Home page — Luxury`) converted through the SAME pipeline as #14/#23/#25 — extended narrowly, never bypassed:

```
read-only design-tool MCP observation (metadata + instance subtrees + design contexts + screenshots)
  → raw-faithful tree document (committed fixture, 253 nodes)
  → det extract  → NodeIR + PageStructure (12 sections) + SourceReview (every-node ledger)
  → det compose  → native Page Builder master format, deterministic, all 12 sections (adapter 1.2.0)
  → DET Preview Theme (one independent reusable Hyvä child theme)
  → isolated local preview store view + disposable CMS page (service layer, byte integrity)
  → scoped storefront QA (live-DOM checks + full-page/per-section screenshots)
```

## 2. Source evidence (read-only design tool + real checkout, 2026-11-09)

| Fact | Evidence |
|---|---|
| Root `245:2` `PAGE/Home/Desktop` 1440×9891; 15 top-level frames = 3 SITE chrome + 12 SECTION frames; instance subtrees expanded (component instances carry observed `I<instance>;<node>` override children) | connected design-tool MCP `get_metadata` (root scan + per-instance), `get_design_context` (text/fill evidence), `get_screenshot` (full-page target). **OBSERVED, NOT REVISION-PINNED** (`mcp-observed-unpinned-2026-11-09`); no REST claim; no Figma writes. Transport limitation recorded (§6.6). |
| All media fills fetched as the design's original source images into the local preview (31 assets) | temporary design-tool asset URLs downloaded once via curl into `pub/media/wysiwyg/det-home-preview/` (+ local worktree copies); **URLs never persisted anywhere**; committed manifest uses labeled offline placeholders only |
| Native content-type declarations used: `banner`, `row`, `column-group`, `column-line`, `column`, `image`, `text`, **`buttons` + `button-item`** | `vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/*.xml` (real checkout, read-only; verbatim copies in the fixture checkout); buttons canonical persisted shape verified against editor-saved content (`cms_page` 5) before use |
| Registered capability probe: 18 declaration-backed capabilities (banner ×4, row ×3, column chain ×5, buttons ×2, image, text, heading, divider…) — proof capped at `registered` | `det inspect` over the fixture checkout; deterministic content-digest revision `content:9ee428e468bbaf7e` (declaration copies do not change it — the committed G3/G4 examples stay byte-par) |
| Hyvä base theme + PB storefront support installed; active chain `Secomm/launchpad` (parent `Hyva/default`) on `websites/1` | `vendor/hyva-themes/magento2-default-theme` (theme_id 4; `Magento_PageBuilder` templates + `web/css/styles.css` prebuilt), `theme` + `design_config_grid_flat` tables (read-only) |

## 3. The one DET Preview Theme (`examples/preview-theme/det-preview/`)

One independent, reusable Hyvä child theme — **not** a theme per conversion, **not** a client theme (product policy, Owner correction 2026-11-09). It extends the licensed `Hyva/default` base installed in the operator's checkout; **no Hyvä source is bundled in this repo**. Files: `theme.xml`, `registration.php`, one head-CSS include, a layout adding the `det-preview` body class (CSS namespace) + an optional `det-announcement` CMS block slot (renders nothing when absent), and one scoped plain-CSS stylesheet (`web/css/det-preview.css`, ~150 lines, no build chain): `det-*` preview-content hooks + presentational approximations (type scale, gutter approximation, button/banner styling) for the composer's **native** structures. Structural fields, widths and `data-pb-style` rules stay native — the stylesheet never replaces them. Portable developer-handoff rules in its README.

## 4. Mapping ledger (source node → native Page Builder), section by section

Full-root accountability: **253 inventoried nodes** — 52 SITE-chrome excluded with reason (theme-owned, retained in audit), 151 mapped editorial, 28 externally-defined component instances honestly `NEEDS_REVIEW` (custom-required pending; they compose through their explicit projected roles), 21 unknown-kind layers (`rounded-rectangle` etc.) `NEEDS_REVIEW`, 1 top-level DECOR merged. Composition mapping: **160 mapped / 9 excluded-with-record / 19 honest gaps / 0 skipped.**

| # | Section (observed id) | Composed native shape | Mapped/Gap/Excluded | Notes |
|---|---|---|---|---|
| 1 | SECTION/Hero/Primary `245:5` | row > **banner(poster)** (G3 shape) | 8/2/2 | overlay gradient + scroll indicator = decoration gaps; CTA via banner button (`/collections`, G3-verified route) |
| 2 | SECTION/BrandStatement `245:6` | row > **text band** (new shape) | 2/0/0 | overline + statement fold into one WYSIWYG (single-field styling limit) |
| 3 | SECTION/Hero/Secondary `394:386` | row > column-group > column-line > **column ×2 (73/27)** (grid Rule B) | 7/1/2 | explicit media column right; synthesized complement (texts + CTA button-item) left; CTA icon chrome excluded |
| 4 | SECTION/FeaturedCollections `245:9` | grid Rule B: **column ×2 (50/50)** | 17/5/2 | explicit Women tile column; synthesized right column stacks Men + Accessories + fabric-detail images (observed mosaic arrangement approximated — recorded); gradients/arrows = decoration gaps |
| 5 | SECTION/FeaturedProducts `245:7` | grid Rule A: **column ×4 (25% each)** | 17/4/1 | card instances expand (image + name/category/price); **product copy is the design's placeholder content, MOCK-flagged in the manifest** — never live catalog data |
| 6 | SECTION/CampaignEditorial `299:300` | grid Rule B: **column ×2 (67/33)** | 7/1/1 | texts + CTA + secondary media synthesize the left column; observed offset placement composes stacked (recorded) |
| 7 | SECTION/Lookbook `299:311` | grid Rule A: **column ×3 (25/50/25)** | 9/0/1 | look media + captions compose inside their columns; header = leading band + button; hotspot overlays = transport-limited gap (§6.6) |
| 8 | SECTION/EditorialMosaic `245:10` | grid Rule A: **column ×4 (23/28/22/27)**, 2 images each | 15/0/2 | tiles are unknown-kind layers projected to their observed media role (recorded decisions) |
| 9 | SECTION/Craftsmanship `299:343` | **two-column (50/50)** (G4 shape, unchanged) | 8/0/0 | byte-identical to the G4 committed example's shape |
| 10 | SECTION/ThePeople `522:542` | grid Rule A: **column ×4 in 1 line (30/21/13/36)** | 10/0/2 | the asymmetric mosaic maps to one 4-column line (native constraint set; recorded approximation); loose captions attach per column by geometric containment; CTA + rights-placeholder note = trailing band |
| 11 | SECTION/ProductSpotlight `245:12` | grid Rule B: **column ×2 (58/42)** | 8/2/1 | texts + **two button-items (primary + secondary variant)** in the synthesized column; Fade gradient = decoration gap; "Add to Bag" label is presentation-only MOCK (no commerce behavior) |
| 12 | SECTION/Newsletter `245:14` | text band + buttons | 4/2/0 | **email input = explicit gap** (no native PB form field; subscribe forms are theme/system UI); "Subscribe" composes as a presentation-only button (MOCK link) |

SITE/AnnouncementBar, SITE/Header, SITE/Footer → excluded from CMS with reason; rendered by the preview theme's inherited Hyvä base chrome + the `det-announcement` CMS block (chrome fidelity deltas in §6.5). Nothing silently omitted anywhere.

**Per-node fidelity gaps (19, all `NOT_VERIFIED` + accountable, never engineered around):** tile gradients ×3, tile arrow affordances ×3, wishlist hearts ×4 (+ their heart-icon subtrees excluded), hero overlay gradient + scroll indicator, spotlight Fade, spotlight/hero CTA icon chrome (excluded), newsletter input + placeholder text, header link icons. **Structural approximations recorded in section notes:** synthesized complement columns (Rule B), one-line mosaic (ThePeople), stacked side-by-side pairs (collections/craftsmanship/campaign), gutters via scoped preview CSS (visual only), single-WYSIWYG fold styling semantics, mobile breakpoint not composed (desktop-only, as in #23/#25).

## 5. Local isolated preview (Slaunchpad LOCAL; scoped + reversible)

**Isolation design:** the active store views `vi` (1) / `en` (4), the live Homepage (ids 2/36), all existing pages (38–41 incl. #23/#25 smoke pages) and every customer theme are untouched — verified after every step. The preview lives entirely in:

- **Store view** `det_preview` (**id 5**, website 1 / group 1) — created via the operator's n98 CLI; website/active corrected through the store model (the Admin's own persistence path).
- **Theme** `DET/preview` (**theme_id 7**, parent asserted `Hyva/default`) assigned **scoped** `design/theme/theme_id=7 @ stores/5` — the platform's own design-configuration mechanism (same as the Admin form).
- **Homepage** scoped `web/default/cms_home_page=det-home-preview @ stores/5`.
- **Hyvä demo-content + demo-store-notice flags scoped OFF @ stores/5** (vi/en already carry scoped 0; the new view inherited defaults) — the composed page is the homepage's sole content.
- **CMS page** `det-home-preview` (**page_id 42**, stores [5], is_active 1) imported via `Magento\Cms\Api\PageRepositoryInterface` by the guarded one-off script (identifier collision aborts; content-marker guard; read-back sha256 equals the composed file byte-for-byte).
- **CMS block** `det-announcement` (id 32, stores [5]) — MOCK editorial strip text from the design, flagged.
- All 31 real media assets present in `pub/media/wysiwyg/det-home-preview/` and served HTTP 200.
- The guarded scripts are **committed in the PR** as the reusable form (`examples/local-preview/det-preview-setup.php`, `det-preview-import.php`, runbook `examples/local-preview/README.md` — coordinator correction C3); the checkout-root files are the [28] one-off originals.

**Storefront evidence (pure-local render of `https://slaunchpad.thanhaloha.io.vn/?___store=det_preview`):**
- Scoped DOM checks: `body.det-preview cms-det-home-preview` + theme CSS served + 12 rows / 1 banner / 25 columns / 9 column-lines / 9 buttons containers / 10 button-items / 25 text WYSIWYGs / 30 image elements — all 30 images **loaded** (live-DOM `naturalWidth`), banner background applied from `data-background-images`, poster overlay `min-height: 880px` **computed** through the keyed style block (the #25 correction mechanism verified end-to-end on a full page), Merriweather/Open Sans applied via the scoped stylesheet.
- Full-page rendered capture (1440×11399) + per-section crops + design-target side-by-side: [`evidence/g28-side-by-side-design-vs-preview.jpg`](evidence/g28-side-by-side-design-vs-preview.jpg), [`g28-preview-full-page.jpg`](evidence/g28-preview-full-page.jpg), [`g28-design-target-full-page.jpg`](evidence/g28-design-target-full-page.jpg), [`g28-preview-chrome-hero.jpg`](evidence/g28-preview-chrome-hero.jpg), [`g28-preview-products.jpg`](evidence/g28-preview-products.jpg), [`g28-preview-people.jpg`](evidence/g28-preview-people.jpg), [`g28-preview-spotlight.jpg`](evidence/g28-preview-spotlight.jpg). (Known capture note: the Orca embedded browser's stitched full-page capture repeats the jarallax-fixed hero background per band — the authoritative captures are the headless-Chrome ones committed here; the underlying live DOM was verified independently.)
- **Edit round-trip PASS** — service-layer heading edit persisted (`14e8126e…` → `3ba2aeba…`), then restored to the composed bytes (`14e8126e…`) and re-verified on the page.
- **Existing records untouched** — `cms_page` count 41 → 42 (only the new page); vi/en configs unchanged; default store renders zero det markers.

**Verdict: `ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS`; `ADMIN_UI_FORM_CLICKTHROUGH_PENDING`** (blocker: credentials, as in #23/#25). Remaining operator step (~3 min): open `DET Home Preview (Local Only)` (CMS id 42) in Admin on store view `det_preview`, confirm the stage shows the 12 sections editable (banner fields, column widths, text/image/button fields), edit one heading → Save → Reload → confirm on `?___store=det_preview`.

**Rollback (this preview only; never existing records):**
```bash
php det_g28_home_import.php rollback          # deletes page 42 (identifier-guarded)
php det_g28_preview_setup.php rollback        # deletes scoped config + block 32 (content-guarded) + store view 5
# theme files: rm -rf app/design/frontend/DET && bin/magento setup:upgrade && bin/magento cache:flush
# assets: rm -rf pub/media/wysiwyg/det-home-preview
```

## 6. Known gaps / honest limits

1. **Admin UI click-through pending** (credentials) — service-layer + storefront + style-block rehydration all verified; the literal Admin form interaction is the owner's ~3-minute gate.
2. **Desktop breakpoint only** — every section notes it; mobile composition is a later bounded scope.
3. **Single-WYSIWYG fold semantics** — overline/heading/body fold into one editable text field in document order (G3 precedent); per-field typography is scoped-preview-CSS approximation, not per-field data.
4. **Structural approximations** (§4 notes): Rule B synthesized complement columns; ThePeople's asymmetric mosaic as one 4-column line; stacked side-by-side pairs; gutters approximated visually by the preview CSS gap (native columns carry no gutter field).
5. **Chrome fidelity deltas** — the preview theme inherits the Hyvä base header/footer (minimal: logo + search/account/cart, no storefront nav configured at base level); the design's nav links, SLAUNCH logo and icon set are theme-owned (developer handoff), recorded here rather than coded into a client theme. The announcement strip renders via the scoped CMS block.
6. **Transport limitation (explicit)** — the design tool's `button`-type nodes (interactive hotspot overlays, e.g. Lookbook hotspots ~16 nodes) are **not exposed by the metadata transport**; they are visible in the design-context pass and recorded here as unrepresentable gaps (they would need theme/PHTML UI, out of CMS scope). The committed tree is honest about this boundary; `get_design_context` screenshot evidence covers the affected sections.
7. **MOCK content flags** — product card names/categories/prices are the design's own placeholder copy; commerce-action labels ("Add to Bag", "Subscribe") are presentation-only; links without a derivable route are explicit `#` MOCK targets; the rights-placeholder note ("PLACEHOLDER — RIGHTS UNVERIFIED") is carried verbatim. No commerce BE exists or is implied anywhere.
8. **Google-Fonts import** in the preview CSS is a preview convenience; production ports self-host fonts.

## 7. Reusable run (another developer / another run) — ONE command

The coordinator correction C1 replaces the manual three-command flow with a validated one-shot orchestrator over the SAME shipped commands:

```bash
npm ci && npm run build
node bin/det.js build --config examples/build/project.example.json --out out/build-sample
# bundle: out/build-sample/{01-capability-probe,02-extraction,03-composition}/ + build-manifest.json
```

- The config (`examples/build/project.example.json` — the shipped offline sample project) is the caller's declarative input; paths resolve relative to the config file itself, so a real project config is portable. **No engine defaults exist** — a config without the caller's own paths fails its contract; a `live` design-source mode is not representable and fails closed (`BUILD_LIVE_SOURCE_UNSUPPORTED` / schema const), never approximated.
- The bundle's **`build-manifest.json`** (`schemas/cli/build-manifest.schema.json`, correction C2) is the explicit versioned inventory: per-FILE-BYTE sha256 over every generated artifact (native content, reports, NodeIR/PageStructure/SourceReview, tool-run envelopes) and every consumed input, exact stage provenance, and the honest gap list — including `PREVIEW_INSTALL_OPERATOR_GATED` / `PREVIEW_ASSETS_NOT_GENERATED`: the offline build never installs a theme or imports CMS content, and says so.
- `--dry-run` validates the config and byte-hashes the declared inputs while running NO stage (the chained stages consume on-disk stage outputs — a truthful dry run executes nothing and states it).
- Packaging: no npm publish, no GUI/cloud — `npm link` at a toolkit checkout (or `npm pack` tarball) exposes the `det` bin; `npm ci && npm run build` prepares `dist/`.
- **Preview installation** is the explicitly operator-gated runbook committed under [`examples/local-preview/README.md`](../../examples/local-preview/README.md) with the guarded, content-protected scripts (correction C3): theme install → isolated store view → scoped setup/import → verify → rollback, never touching a client theme or live Homepage.
- The **semantic projection** (130 recorded decisions) remains the stable reviewable cache of approved semantic decisions; the content manifest is the swappable content layer. A future revision-pinned live-source adapter replaces only the transport, per the #18/#21 seam — config/projection/manifest/ledger flow unchanged.

## 7b. Verification added by the corrections (build suite, T32a–f)

`tests/build-suite.mjs`: one-shot offline build over the committed sample (three stages completed, bundle + on-disk manifest validation, **every output byte-hash verified against the actual files**, composed native content byte-equal to the committed example); compose envelope now carries the `native-content` artifact hashed over exact file bytes + the tool-run schema role/command enums in parity (C2 drift closed); fail-closed set (live-source config, missing `--config`, probe+registry ambiguity, stdout-only build); truthful dry run (zero writes, inputs inventoried); failed-stage propagation (bad caller root → failed stage recorded, no composition claimed, manifest still truthful); neutrality over the new committed surfaces.


## 10. Coordinator correction round (2026-11-09) — C1/C2/C3 implemented on this branch

Coordinator independent review of PR #34 @ `cd634ab`: direction approved; three bounded corrections, all implemented here (no new engine, no second compiler, no #29/SQLite scope, no merge):

| | Correction | Implementation |
|---|---|---|
| C1 | One-shot standalone `det build --config` | `det build` (new CLI verb, `src/core/cli/commands/build.ts`): thin validated orchestrator over the shipped `inspect → extract → compose` — same contracts, same adapters, no new engine; schema'd config (`schemas/cli/build-config.schema.json`) with config-relative paths and **no defaults**; **offline snapshot only** (live mode not representable → `BUILD_LIVE_SOURCE_UNSUPPORTED`, fails closed); no hardcoded 245:2/Slaunchpad anywhere in the engine; documented `npm link`/tarball packaging; example config `examples/build/` runs the committed sample fully offline (suite-proven, no Claude/MCP). |
| C2 | Portable build bundle/manifest | `tool-run` schema 1.4.0 additive: `compose-report` role (run-envelope drift **closed**), `native-content` role (compose now emits the artifact hashed over its **exact file bytes** — documented as a distinct notion from the canonical payload `contentHash`), `build` command; new `build-manifest.schema.json` + the build command's `build-manifest.json`: explicit versioned bundle inventory — every generated artifact + consumed input with per-file-byte sha256, stage provenance, honest gaps (`COMPOSITION_GAPS_PRESENT` with counts, `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED`); the caller-supplied content-manifest is NOT conflated with the artifact manifest; downstream verification is suite-tested (every recorded hash re-verified against on-disk bytes). |
| C3 | Preview reproducibility / source autonomy | The guarded local-preview scripts are **committed** (`examples/local-preview/det-preview-setup.php`, `det-preview-import.php`, runbook `README.md`) — the same proven [28] scripts, CONFIG-block parameterized per checkout, all guards intact (collision aborts, content-guarded rollback, scoped writes only); `det build`'s manifest **explicitly gates** preview installation as `OPERATOR_GATED` instead of claiming a portable end-to-end preview; the [28] fixture flow stays as the regression suite; no fake revision pins/assets/mappings — unsupported roles remain GAP/NEEDS_REVIEW from the actual IR. |

**Owner verification gate (unchanged, operator-gated):** literal Admin UI click-through on CMS 42 (edit → Save → Reload → storefront on `det_preview`) — code work does not block on it.
