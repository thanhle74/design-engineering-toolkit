# Receipt — [25] G4 Craftsmanship native two-column Page Builder POC

**Status:** structural PASS · local CMS smoke EXECUTED under the Coordinator's LOCAL GO (issue #25 start comment, 2026-11-06): service-layer round-trip + storefront render + edit persistence PASS (`ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS`); literal Admin-UI form click-through PENDING operator (worker holds no admin credentials) · Draft PR, no merge
**Branch:** `thanhle74/g4-craftsmanship-native-two-column-page-builder` (Orca worktree), fast-forwarded to the exact unmerged Hero PR #24 head `5ae2ec6` before any G4 commit (the coordinator start comment named `task/25-g4-craftsmanship-native-columns`; that branch did not exist — this worktree's branch, ff-moved onto `5ae2ec6`, is the same isolation intent, name differs as in G3).
**Gate:** `npm test` → **110/110** checks (was 103; +7 G4 checks). CI-identical (pure `npm test`). Hero baseline #23 must not regress and does not: the G3 suite incl. committed-example parity runs unchanged in the same gate.

## 1. What was built (one section, end-to-end)

Figma-observed craftsmanship section `SECTION/Craftsmanship` (1440×780; **not** a hero) → native, Admin-editable Magento Page Builder master-format HTML, deterministic and offline, through the SAME pipeline (no parallel composer engine):

```
det inspect  → CapabilityRegistry (row/column-group/column-line/column/image/text declarations, proof=registered)
det extract  → NodeIR + PageStructure + SourceReview (9 nodes inventoried, all accounted)
det compose  → ComposeOutput: persisted native content + per-node mapping + honest gap diagnostics
```

The compose adapter (`adapters/magento-pagebuilder-compose/`, v1.1.0) gained a **second bounded section shape**, detected per section and dispatched deterministically: a section whose visible direct children carry exactly one projected `column-primary` and one `column-secondary` composes the two-column chain; everything else falls through to the unchanged G3 hero composer. Roles extend the schema'd semantic projection (family 1.3.0, additive): `column-primary`, `column-secondary`, `inline-media` — the recorded human decision layer, per the G3 correction precedent.

## 2. Source evidence (real checkout + real design tool, read-only)

| Fact | Evidence locator (owner surfaces; never hardcoded in the toolkit) |
|---|---|
| Section subtree observed live: `299:343` `SECTION/Craftsmanship` 1440×780 → `299:344` `SLOT/CraftMedia` 620×620 (x80) + `299:345` `SLOT/CraftContent` 612×620 (x748) → texts `Overline`/`Title`/`Body` (299:346-348) + detail frames `SLOT/DetailStitch` 292×254 (x0,y387) and `SLOT/DetailFabric` 292×253 (x320,y415) | design-tool MCP `get_metadata` + `get_screenshot`, file `vNPtfBRpYM3PsExirVqhmt`, 2026-11-06. NOTE: the live observation supersedes the issue's earlier text — text layers are now NAMED `Overline`/`Title`/`Body` (previously content-named); fixture records the live names. Committed visual target: [`evidence/g4-craftsmanship-design-target.png`](evidence/g4-craftsmanship-design-target.png). Observation is MCP-observed, NOT revision-pinned (`mcp-observed-unpinned-2026-11-06`); no live REST claim. |
| `column-group`: single appearance `default`; parents allow root-container/row/column-group/tab-item — **`column` NOT allowed**; children allow column-line + column | `vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/column_group.xml` (real checkout, read-only) |
| `column`: appearances `full-height` (default), align-top/center/bottom; parents allow column-line/column only; children deny row/column/column-line | `.../content_type/column.xml` |
| `column-line`: structural bridge, no form; `image`: single appearance `full-width` (figure > img `desktop_image`, src converter `{{media url=…}}`); `text`: `default`, HTML inside the div; row-inner `min_height` style | `.../content_type/{column-line,image,text,row}.xml` + master templates `view/adminhtml/web/template/content-type/*/master.html` |
| Canonical persisted column chain (real rows): `row > column-group(grid-size 12) > column-line > column(full-height)`; Admin-saved content carries widths in a generated `<style>` block keyed by `data-pb-style`; a hand-authored **inline-width** variant also exists in real stored content (`style="width:25%"`) | local DB `cms_page` page_id=36 (`home`) and page_id=37 (`careers`), SELECT-only queries, 2026-11-06 |
| Declaration copies used by the fixture probe are verbatim | `tests/fixtures/g3-magento-like/…/content_type/{column_group,column-line,column,image,text}.xml` (copied from the real checkout, same as G3's banner/row) |

## 3. Mapping report (source node → native Page Builder)

Native target: **row(`contained`) > column-group(`default`) > column-line > column(`full-height`) ×2** — the platform's own declaration-mandated chain; every landed field is an Admin-editable form field. Composed content (deterministic, 1933 bytes with the committed placeholder manifest):

```html
<div data-content-type="row" data-appearance="contained" data-element="main"><div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" style="min-height: 780px;" data-element="inner"><div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main"><div class="pagebuilder-column-line" data-content-type="column-line" data-element="main"><div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" style="width:50%"><figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="{{media url=wysiwyg/g4-craftsmanship/craft-media-620x620-placeholder.jpg}}" alt="" title="" data-element="desktop_image"></figure></div><div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" style="width:50%"><div data-content-type="text" data-appearance="default" data-element="main"><p>CRAFTSMANSHIP</p><h2>Materials, considered</h2><p>Fabric, stitch and finish — considered at every step of the making.</p></div><figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="{{media url=wysiwyg/g4-craftsmanship/detail-stitch-292x254-placeholder.jpg}}" alt="" title="" data-element="desktop_image"></figure><figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="{{media url=wysiwyg/g4-craftsmanship/detail-fabric-292x253-placeholder.jpg}}" alt="" title="" data-element="desktop_image"></figure></div></div></div></div></div>
```

| Source node (observed type + name) | Projected role | Native landing | Disposition |
|---|---|---|---|
| `299:343` frame `SECTION/Craftsmanship` | — (section) | row(`contained`) > column-group > column-line > 2× column container (`data-element="main"` chain) | MAPPED |
| `299:344` frame `SLOT/CraftMedia` | column-primary | left column(`full-height`) 50% — the slot's own media fill composes as the column's **native image element** (`desktop_image` src from manifest) | MAPPED |
| `299:345` frame `SLOT/CraftContent` | column-secondary | right column(`full-height`) 50% | MAPPED |
| `299:346` text `Overline` | content-lead | column text WYSIWYG `<p>` (folded; standalone styling not preserved) | MAPPED |
| `299:347` text `Title` | heading | column text WYSIWYG `<h2>` (folded) | MAPPED |
| `299:348` text `Body` | body | column text WYSIWYG `<p>` (folded) | MAPPED |
| `299:349` frame `SLOT/DetailStitch` | inline-media | native image element in the right column (`desktop_image` src from manifest) | MAPPED |
| `299:350` frame `SLOT/DetailFabric` | inline-media | native image element in the right column | MAPPED |

All 8 planned-subtree nodes accounted (8 mapped / 0 gaps with the committed manifest); the page root is the plan itself (not a section), consistent with G3. Missing manifest entries fail honestly: media slots become explicit `gap` entries with **no** `figure` emitted (a src-less image element would be misleading) and text runs left empty — no invented assets (test-asserted, G4-T30e). No `data-content-type="html"`, no Tailwind/React, no invented absolute URLs (test-asserted).

**Explicit fidelity gaps (NOT_VERIFIED warnings, never engineered around):**

1. **Side-by-side detail pair composes stacked.** The two detail images are observed side-by-side (x0/x320, 28px gutter, 28px vertical stagger). Nesting a column-group inside a column is NOT declaration-backed (column-group parents policy denies `column`; column children deny row/column/column-line) — the platform itself cannot express this arrangement inside a column, so the POC composes two stacked native image elements and records the gap. This is the issue's own prescribed fallback; no custom CSS, no generic renderer.
2. **The observed 48px inter-column gutter is not composed** — native columns carry no gutter field; widths simplify 620:612 (plus gutter) to the task-sanctioned 50/50.
3. **Observed media aspect ratios are not enforced** — the native image element has no aspect/crop field; images render at natural aspect to column width. (Also the Hyvä theme module on this checkout additionally declares `width/height/loading/native-dimensions` image attributes; the composed stock shape omits them and the Admin populates defaults on edit.)
4. **Column layout on THIS storefront comes from the Admin-generated style block** (see §5.2): the composed inline-width shape is attested stored content (cms_page 37) but the side-by-side visual materializes through the platform's own Admin-save normalization. Mobile breakpoint not composed (desktop-only, as in G3).

## 4. Verification performed

- `npm test` **110/103+7** (G4-T30a..g): extended-fixture probe (5 new declaration-backed capabilities, registered proof, content-digest revision); raw-faithful extraction (9 nodes, all MAPPED, media slots stay `container` kind — never rewritten to `media`); **two-column compose** (structural invariants: row > column-group(grid 12) > column-line > two 50% full-height columns; one text WYSIWYG folding overline/heading/body in document order; exactly 3 native image figures with manifest directives; row-inner `min-height: 780px`; **declaration-conformance guard: no column-group nested inside a column**); byte-determinism (content + stable report hash across runs); **fidelity guard: the raw source composes NOTHING without the explicit projection** (exit 1, honest skip); sparse-manifest honesty (media entries missing → gaps, no `{{media url=}}`, no `figure`); committed example parity (`examples/converter/compose-output.g4-craftsmanship.example.json`); neutrality over the new fixture surfaces.
- Determinism: same inputs ⇒ byte-identical `native-content.html` + stable report hash (volatile `accessedAt` excluded).
- Hero non-regression: the G3 suite (incl. `compose-output.g3-hero.example.json` parity through the MODIFIED adapter) passes unchanged in the same gate — the hero output is byte-identical.

## 5. Local CMS smoke — EXECUTED under the Coordinator's LOCAL GO (2026-11-06)

Target: the running **Slaunchpad LOCAL** checkout (Magento CE 2.4.8-p5, PB module 2.2.6-p5; storefront served locally via the local vhost and publicly via Cloudflare at `slaunchpad.thanhaloha.io.vn`; all checks pure-local via `--resolve …127.0.0.1`). **Write target = the local database through Magento's own CMS service layer** — one NEW disposable page only:

- **Page:** `det-g4-craftsmanship-smoke` (identifier verified free before import), title `DET Craftsmanship Smoke (Local Only)`, store view `vi` (id 1). **page_id=39.**
- **Mechanism:** one-off guarded script at the checkout root (`det_g4_craftsmanship_smoke_import.php`; actions `import|verify|edit-heading|restore|rollback`) using `Magento\Cms\Api\PageRepositoryInterface` — no direct SQL writes; identifier collision aborts; content guard requires the composed two-column markers (`column-group`, `column-line`, `image`) before import.
- **Content:** the same deterministic pipeline re-composed with a LOCAL gitignored manifest (`out/g4-smoke/`): three real first-party local media assets — `wysiwyg/phong_an.jpg` (1024×1024, primary slot), `wysiwyg/Brown_Modern_Furniture_Facebook_Post.png` (500×343, DetailStitch slot), `wysiwyg/Brown_Minimalist_New_Product_Furniture_Instagram_Post.png` (502×364, DetailFabric slot) — all present in `pub/media` and fetched 200 pure-local after import. No placeholder was ever imported (issue guard honored).

**Results:**

1. **IMPORT + INTEGRITY PASS** — page created via the service layer; read-back `content_sha256=292662392393db05…` equals the composed file's hash byte-for-byte; `stores=[1]`, `is_active=1`.
2. **STOREFRONT RENDER PASS** — `https://slaunchpad.thanhaloha.io.vn/det-g4-craftsmanship-smoke` (HTTP 200): 7/7 scoped structural checks on the main content segment (composed row > column-group(grid 12) > column-line > two inline-50% full-height columns; three image elements with the three local asset directives; text WYSIWYG carrying `CRAFTSMANSHIP` / `Materials, considered` / `Fabric, stitch and finish…`; row inner `min-height: 780px`); live-DOM eval confirms all three images **loaded** (1024×1024 / 500×343 / 502×364 rendered through the site's own lazy-loader, `data-amsrc`), both columns at 625px (50% of the contained row) and the computed row min-height 780px; breadcrumb "Trang chủ › DET Craftsmanship Smoke (Local Only)". Evidence: [`evidence/g4-craftsmanship-storefront-smoke.png`](evidence/g4-craftsmanship-storefront-smoke.png) (same evidence standard as G3: theme-level styling is out of scope by the issue's non-goals; the master-format structure is what this gate proves).
3. **EDIT PERSISTENCE PASS** — heading edited through `PageRepositoryInterface` ("Materials, considered (SMOKE EDIT)") → storefront re-render shows the EDITED heading → content restored to the composed bytes → storefront verified original again. No residual edits.
4. **EXISTING PAGES UNTOUCHED** — `cms_page` count 38 → 39 (only the new page added); Homepage ids 2/36, about-us ids 5/11 and G3's `det-g3-hero-smoke` (id 38) verified present and untouched.
5. **ADMIN UI FORM CLICK-THROUGH: PENDING (precise blocker)** — the worker holds **no admin credentials**; resetting any admin user's password is outside the GO. Remaining step (~2 min, operator/owner): open `DET Craftsmanship Smoke (Local Only)` in Admin, confirm the stage shows Row › Columns with the two columns, the text field, and the three image fields editable; **Save once** (the platform's own save regenerates the canonical style block — see the fidelity note in §3.4), Reload, and confirm the columns render side-by-side on the storefront. **OWNER_ACTION_REQUIRED**, not PASS.

**Verdict: `ADMIN_ROUNDTRIP_SERVICE_LAYER_AND_STOREFRONT_PASS`; `ADMIN_UI_FORM_CLICKTHROUGH_PENDING`** (blocker: credentials).

**Rollback (this disposable page only):** `php det_g4_craftsmanship_smoke_import.php rollback`

## 6. Non-goals honored / known gaps

Not done (per issue non-goals): pixel-perfect CSS, Hyvä theme work, full recursive converter, generic renderer, bulk migration, Admin-UI automation, PR merges (drafts #20/#21/#22/#24 untouched and unmerged). Known gaps recorded as diagnostics, not engineered around: side-by-side pair arrangement + stagger (§3.1), gutter (§3.2), aspect ratios (§3.3), style-block layout mechanism (§3.4), mobile breakpoint, WYSIWYG fold styling semantics. Exact observed times vs the task estimate: the issue asked for ACTUAL vs EXPECTED manual developer time — actual execution of the full slice (analysis → implementation → tests → local smoke → docs) took **one working session (~4.5 h wall clock on 2026-11-06, single worker)**; the coordinator's earlier planning figure is not restated here to avoid fabricating a comparison baseline.

## 7. Integration notes

- Base: the exact unmerged Hero PR #24 head `5ae2ec6` (fast-forward; no merges performed). This PR therefore carries the three G3 commits as ancestry until #24 merges — the coordinator's stated dependency-aware integration order (#20 docs, #24, then #25) applies after review; nothing was cherry-picked or discarded.
- schemas/cli family 1.3.0 (additive): `semantic-projection` role vocabulary extension only; no new schema file; the closed 21-code converter diagnostic registry unchanged (gaps are `NOT_VERIFIED` warnings). Compose adapter descriptor 1.1.0 (two shapes documented).
- Decisions recorded: `ADR-025-001..004` in [DECISIONS.md](DECISIONS.md).
- The fixture checkout gains the five verbatim content-type declaration copies (column_group, column-line, column, image, text) so the probe registers the full two-column chain; the committed G3 example remains byte-par because the probe's revision digest keys on composer.lock, not on declaration files.
