# [#72] Integrator receipt — modular Page Builder capabilities P2 (overnight run)

Branch: `thanhle74/72-det-modular-page-builder-capabilities-p2-over` · Base: `186a191` (#70 merge)
Status: **complete + C72 correction applied, awaiting Coordinator re-review — NOT merged (per protected rules).**

## What was delivered (priorities 1–2: architecture + no one-off branches)

1. **Frozen modular seam** (`70269bd`): `elements.ts` extracted pure verbatim from `compose.ts` (sha256/esc/pbStyleKey/aux ids + element builders); `handler-context.ts` defines `SectionShapeHandler { id, compose(section, sectionNodeId, ctx) }` + `SectionComposeContext` (nodesById, locatorOf, walkSubtree, requireCap, textByRef/mediaByRef/linkByRef, roleByLocator, excludedLocators, ctaSubtreeLocators, pushDiagnostic, pushMapping, resolveComposerRole). Null return = silent shape-miss. No shared-file edits by workers; dispatcher order: legacy two-column → legacy column-grid → registered handlers → guarded text-band → hero.
2. **Projection vocabulary v1.5.0** (`e0535be`): `slide` / `products-grid` / `products-carousel` roles added across schema (`semantic-projection.schema.json`), studio agent-plan contract, and agent prompt. Carousel intent is deliberately NOT geometry-derivable — `slide` exists only via recorded decisions (test-asserted invariant in W-D).
3. **W-B structural handlers** (native heading, header-band, card-grid): deterministic signature-only composition, registry-gated, vendor-verified byte shapes, co-located contract tests + compiled `wb-suite`. Header-band requires media-free band + trailing CTA; card-grid declines mixed sections and any subtree with projected decision roles (precedence correction integrated: hook sits AFTER legacy projected shapes so Craftsmanship/CampaignEditorial two-column bytes are untouched — G3/G28 pinned bytes verified unchanged).
4. **W-C slider/products handlers** (`481adb3`, `9d62499`): slider-slide needs ≥2 recorded `slide` projections; products emits `row(contained) > inner > products declaration + {{widget type="Magento\CatalogWidget\Block\Product\ProductsList" template="Magento_CatalogWidget::product/widget/content/grid.phtml" …}}` — the converter-toDom literal, verified against real cms_page rows 2/7/8 (W-C corrected the earlier `Magento_PageBuilder::…grid.phtml` guess: that template does not exist on this checkout).
5. **W-D deterministic role-hint helper** (`f2a2f3e`, `ba978bd`): `deriveRoleHints(nodes, sections)` with header-band / peer-card-group / products-candidate detectors — products candidates are ALWAYS conjecture; slide never emitted structurally.
6. **Integration wiring + extended offline build project** (`47070d7`): registry array `SECTION_SHAPE_HANDLERS` wired into the dispatcher; recorded-decision hero guard (band-projected text without recorded background-media ⇒ NOT hero-eligible; mixed band+media sections skip honestly via the text-band blocker — no wrong-type banner fallbacks); committed `resources/examples/build/slaunchpad-home-72-extended/` (offline-only derived variant: canonical 11 assignments + 8 header-band + 1 products-grid + 2+2+2+3 slot/band decisions + 8 observed-name text entries; `cmsInstall` targets store 5 `det_preview` only; **no `source-identity.json`** so the one-click binding stays unique to the canonical project). Studio tests updated for the two-project catalogue (`[EXTENDED_ID, CANONICAL_ID]`).

## What was proven (priority 3: evidence-led breadth; priority 5: Slaunchpad proof)

- BEFORE→AFTER matrix: `docs/evidence/issue-72/source/mapping-table.md` — 6/12 sections compose (hero banner, BrandStatement text-band, FeaturedProducts products declaration, CampaignEditorial + Craftsmanship two-columns, Newsletter text-band), 6 honest skips, **zero wrong-type fallbacks** (the first integration build had hero stealing band-projected mixed sections as banner posters — fixed by the recorded-decision guard and re-verified byte-identical for G3/G28).
- Handlers that ship tested but compose nothing here (documented absence, not omission): slider (no slide projections possible from geometry), heading/header-band/card-grid (no pure-band sections pass the preconditions).
- **Admin round-trip (the deciding PASS)** — full receipt in `mapping-table.md`: installer create (store-0 refusal gates intact) → admin edit screen rehydrates the exact 21-marker structure → real browser Save → DB shows admin-normalized bytes with identical structure → full editor reload rehydrates again → installer update rerun idempotent → cleanup restored the 43-page pre-state fingerprint-exactly (no other rows touched). Temp admin + its auto-created role deleted. Evidence: `browser/pre-create-fingerprints.json`, `browser/admin-editor-outline-{pre-save,post-reload}.json`, `browser/frontend-filter-render.json`.
- Storefront HTTP render = **typed environment GAP**, not a tool defect: the catalog widget resolves (`grid.phtml` in the abort stack) but a **pre-existing Hyvä theme bug** (pre-1.5 swatch renderer override, `swatch-item.phtml:32` RuntimeException) aborts ANY CMS page carrying a catalog widget. Counter-example: #70 page `det-pb-roundtrip-46` (no widget) renders fully. The exact storefront template filter provably renders the PB structure (widget-stripped probe) and the widget directive resolves in CLI-context filtering (8328 bytes).

## Gates

All gates re-run at the exact final head **`a212418`**:

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm test` | **201/201 checks passed** (baseline 195 + #72 suites) |
| `pnpm run test:studio` | **610/610 tests, 58 files** (baseline 558 + #72 additions) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | exit 0 |
| `pnpm run build` | exit 0 (core + app) |
| touched-file Prettier | all matched files pass (PHP proof script out of Prettier scope, no PHP parser) |
| foreign-cwd det CLI build (cwd=/tmp) | exit 0, generated installer `php -l` clean, master content byte-identical to the DB-created row (sha `3a8bb580…`) |
| generated installer `--dry-run` | PASS (store-5 plan, sha matches) |
| installer create/update/verify/cleanup | recorded in the round-trip receipt above |

## C72 correction (Coordinator CORRECTION_REQUIRED on Draft PR #73 @ `8195324`)

One bounded autonomous correction on the same PR, addressing both review findings. All gates
below were re-run on the exact committed tree of this correction (the PR's corrected head;
the PR description and the issue-72 comment carry the exact SHA).

### C72-1 (BLOCKER) — portable core-class rule serialization

Finding: the generic products serializer hardcoded the Slaunchpad-specific
`Smile||ElasticsuiteVirtualCategory||Model||Rule||WidgetCondition||Combine` class into
`conditions_encoded`, which would fail on every checkout without the optional vendor module.

Resolution — the verified portable Magento CORE default (`Magento\CatalogWidget\Model\Rule\Condition\Combine`
+ `…\Condition\Product`), verified three ways against this checkout's own 2.4.8-p5 source:

1. Magento's PageBuilder form processor (`conditions-data-processor.js`) HARDCODES the core
   classes when synthesizing the category_ids/sku-mode rule — core emits core classes even
   with vendor modules installed.
2. Smile does NOT di-preference the core classes; its `ConditionFactoryPlugin::beforeCreate`
   maps core → vendor twins at condition-creation RUNTIME. Core-class directives therefore
   resolve to the vendor-backed rule engine on Elasticsuite checkouts and to plain core
   everywhere else.
3. Real admin-saved cms_page row 7 (`home-en-old`) persists a CORE-class rule on this very
   Elasticsuite-enabled checkout — living proof the portable bytes round-trip.

No runtime inference from "this is Slaunchpad", node IDs, section names or paths exists
anywhere in the serializer; the rule/condition types are compile-time constants of the CORE
platform, derived from verified vendor metadata through the registry contract (registry
unchanged — `acceptedProps: []`, `requiresRuntimeData: true`). Unknown/unverifiable providers
need no runtime detection at all: the emitted bytes are the portable subset valid on every
profile, so the fail-closed surface is exactly the invalid-binding gate below.

### C72-2 — editor-default state retired; bound-only emission

Finding: the "harmless editor-default placeholder" claim was false — vendor-verified, an empty
rule combine attaches no SQL constraints (`ProductsList::getBaseCollection` builds the base
collection first), so the unbound `{{widget …ProductsList…}}` directive is a REAL executable
newest-products storefront listing.

Resolution — fail-closed bound-only emission: products composes ONLY from a recorded
`selection` binding (`category_ids` | `sku`, non-empty — the admin form's two verified native
modes; free-form `condition` mode deliberately refused as the C72-1 hazard class):

- semantic-projection schema **v1.6.0** (additive): optional `selection {kind, value}` on
  assignments; the products role description now states the executable-widget contract.
- handler seam: `ctx.selectionByLocator` (frozen-seam additive field; registered-suites
  fixtures updated).
- handler: bound containers emit the declaration byte-shaped after real category_ids-mode row
  8 (demo-landing-page) with the C72-1 core classes; ALL-unbound sections stay SILENT null
  (seam contract) while the new compose-dispatcher **recorded-products guard** records the
  accountable typed-gap skip (NOT_VERIFIED, C72-2 language) and blocks text-band/hero
  fallbacks from claiming the section.
- storefront claim fixed: the storefront row is no longer claimed as full PASS — the Hyvä
  swatch abort GAP stands, and products now carries a typed SKIP on this source.

### Correction test matrix (the three required profiles)

| Profile | Test | Result |
| --- | --- | --- |
| (a) Magento core-only | `products.test.ts` (a): bound category_ids/sku emission byte-exact vs real row-8 shape; portability lock | PASS |
| (b) Smile-enabled | `products.test.ts` (b): same bytes, `Elasticsuite`/`Smile` never appear in output, core Combine present | PASS |
| (c) unknown/unverifiable | `products.test.ts` (c): invalid kind, whitespace value, unbound — all silent null; dispatcher guard records the typed gap and blocks fallbacks | PASS |

Plus the cross-validation suites: co-located `wc-suite.mjs` (compiled dist, bound-only
contract + portability lock) and the negative-path suites — all green at the corrected head.

### Re-run of the isolated Magento Admin round trip (corrected serializer)

Full re-run on the isolated store-5 QA page (`det-qa-72-home`, page_id 50), same protocol and
guards as the original (store-0 refusal gates intact; `--yes` consent; fingerprint diff before
and after). **PASS on every step:**

| Step | Result |
| --- | --- |
| Pre-create fingerprint snapshot | 43 baseline pages unchanged; delta = only the QA page itself (post-create check) |
| Installer create | `action=created page_id=50`, 5659 bytes, sha `9fe53140…f3517ee` |
| DB verify | `scope_match=true` (store 5 only), 19 markers byte-identical to the corrected master (`row` 5, `banner` 1, `text` 2, `column-group` 2, `column-line` 2, `column` 4, `image` 3) |
| **Admin edit-screen rehydration** | **19 content-type elements in the live Page Builder stage, exact same counts** — outline captured at `browser/admin-editor-outline-pre-save.json` |
| **Admin Save (real browser click)** | "You saved the page."; admin re-serialized to 7268 bytes / sha `5f4d623e…` with **identical 19-marker structure** (expected PB-model normalization, recorded honestly) |
| Editor reload (full page) | same 19 elements rehydrated; outline identical to pre-save (JSON-compared) — `browser/admin-editor-outline-post-reload.json` |
| Installer update rerun | `action=updated page_id=50`, canonical bytes restored (`9fe53140…`, 5659) — create/update idempotency proven |
| Storefront pipeline filter (read-only probe) | clean render, 5797 bytes, no error — `browser/frontend-filter-render.json` |
| Storefront HTTP full render | **HTTP 200**, full page (358 KB), exact corrected 19-marker structure, title "DET QA 72 Homepage", **no swatch abort** — with the executable widget gated out (C72-2), the widget-triggered Hyvä swatch abort no longer applies to THIS page; it remains a documented environment GAP for any page carrying a catalog widget — `browser/storefront-corrected-http.json` |
| Cleanup | page deleted (`cleanup` no-op on rerun confirms), temp admin `det_qa72_tmp` + role assignments deleted via the User model service layer (no raw SQL writes), final fingerprint diff **CLEAN** (43/43 baseline rows unchanged, store-5 config unchanged) |

### Extended build consequence (honest accounting)

The extended project records a `products-grid` decision but the source design provides no
selection to bind — the corrected gate therefore defers the executable widget as a typed gap:
the offline rebuild composes **5/12 sections, 19 markers, 5659 master bytes** (was 6/12, 21
markers, 6544 bytes pre-correction); ledger 21 mapped / 21 gap / 7 skipped; the
FeaturedProducts skip record carries the C72-2 language. This is the honest fail-closed state
the review contract permits ("gate/defer the executable products output with a typed gap").


## Honest limitations

- The extended project's band labels are observed Figma instance names ("OVERLINE", "Section Title") — the R56 honesty lock; they are NOT final copy.
- products capability = BOUND-only executable emission (C72 correction): the declaration + widget directive composes only from a recorded category_ids/sku selection; on this source no selection exists, so products stays a typed SKIP; listing fidelity remains a runtime-template GAP regardless.
- Slider composes nothing on this source by design (carousel intent not geometry-decidable).
- Known pre-existing environment leftovers, not addressed by this issue (not mine to remove without mandate): #70-era temp admins `qa_r6aha8`, `qa_r6aha8_noacl`, `uixreview_*` still active; nginx ~16KB POST 500 unfixed (our 6.5KB content is under it); `magento-spec` MCP `db_query` broken (PDO used instead).
- Admin Save re-serializes composed bytes (6546 → 8214, identical marker structure): expected PB-model normalization, recorded rather than hidden.

## Protected rules — honored

No Figma writes; only the authorized isolated store-5 temp page was created/updated/deleted; store 0 never touched (refusal gates exercised in the installer); no production writes; no self-merge (this PR stays Draft); no licensed Hyvä source distribution; the committed store-0 demo installer never executed; no credentials/tokens/customer data committed (temp admin password existed only in this session's shell).

🤖 Integrator work performed with [Claude Code](https://claude.com/claude-code)
