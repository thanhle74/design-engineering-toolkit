# [72] W-C receipt — native slider/slide/products widget support

Lane W-C (native slider/grid/list/products widget support), branch
`thanhle74/72-det-modular-page-builder-capabilities-p2-over`, committed 2026-11-12.

## Files (all NEW, exclusively W-C's per the frozen contract)

| File | Purpose |
| --- | --- |
| `src/modules/magento/adapters/magento-pagebuilder-compose/elements-native.ts` | Pure emit builders: slider div, poster-slide chain (linked + empty_link), slide style rules, products declarations (grid/carousel). All verified bytes live here. |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/slider-slide.ts` | `SectionShapeHandler` — signature: >= 2 visible containers projected role `slide`; emits `row(contained) > inner > slider(default) > slide(poster) xN` in document order. |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/products.ts` | `SectionShapeHandler` — signature: >= 1 visible container projected `products-grid`/`products-carousel`; emits one `row(contained) > inner > products` per projected container. |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/slider-slide.test.ts` | vitest — verbatim-byte happy path, missing-media gap, short-signature silence, fail-closed gate (4 tests). |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/products.test.ts` | vitest — carousel/grid verbatim bytes + row wrap, listing GAP, no-projection silence, fail-closed gate (4 tests). |
| `src/modules/magento/__tests__/wc-suite.mjs` | Contract-gate suite over the COMPILED dist modules (3 checks: slider verbatim, products verbatim + GAP, fail-closed/silence negatives). |
| `docs/evidence/issue-72/source/wc-declarations.md` | Declaration deep-dive: what was verified from the real rows + vendor tree beyond the brief's shapes, every deviation documented. |
| `docs/evidence/issue-72/wc-receipt.md` | This receipt. |

NOT wired into the dispatcher: `compose.ts` and `handlers/registry.ts` are the Integrator's
(frozen contract rule 5). Both handlers are registered nowhere by this lane; the existing four
shapes and the 195-check contract baseline are untouched.

## Handler signatures

- `sliderSlideHandler.compose(section, sectionNodeId, ctx)` — id `magento-pagebuilder/slider-slide`.
  Silent `null` unless >= 2 visible `slide`-projected containers (document order). Then
  `requireCap(row#contained, slider#default, slide#poster)` FIRST — failure = the gate's
  `UNSUPPORTED_CAPABILITY`/`CAPABILITY_DISABLED` diagnostics + `null` (fail closed, no mapping).
  Per slide: container → mapped (`magento_pagebuilder/slide#poster`); media resolved container
  locator → explicit `background-media` role → first media descendant (which one wins is recorded
  in the mapping note; missing → per-slide NOT_VERIFIED gap, background emitted as `{}`, never
  invented); projected heading/body/content-lead fold into the poster content field as h2/p
  (missing manifest text → gap); first labeled projected CTA becomes the skeleton's single
  button (extra CTAs → declared gaps — poster carries exactly one button element; no link →
  vendor `empty_link` variant + warning). Style keys `pbStyleKey(${slideNodeId}:wrapper|overlay|button)`
  with the real rows' three rehydratable rules in a leading `<style>` block.
- `productsHandler.compose(section, sectionNodeId, ctx)` — id `magento-pagebuilder/products`.
  Silent `null` with no projection. Then `requireCap(row#contained)` + `requireCap(products#grid`
  and/or `#carousel` as needed) FIRST. Per projected container: mapped entry (declaration) +
  typed GAP entry (live listing — no provider binding exists anywhere: binding-map schema has no
  provider field, registry `acceptedProps: []`, the frozen seam exposes no bindings) + NOT_VERIFIED
  diagnostic; observed card internals → gap entries (widget replaces them at render time, never
  faked); non-products section children → gap entries.

## Verified vs corrected declaration facts

Full detail + vendor paths in `docs/evidence/issue-72/source/wc-declarations.md`. Summary:

- **Verified from real admin-saved rows (SELECT-only DB read of cms_page 2/7/8/35):** slider
  attribute set/order; the complete poster-slide chain including attribute order per element,
  the link element having NO style key, the `data-background-lazy-load` nuance (in-row but
  undeclared in slide.xml — kept per contract rule 3, documented), the three keyed style rules,
  and the carousel products declaration + widget directive.
- **Corrected from the brief:** the grid products template is
  `Magento_CatalogWidget::product/widget/content/grid.phtml` (the converter's toDom literal;
  PageBuilder ships only the carousel template on this checkout) — the brief's speculated
  `Magento_PageBuilder::…/grid.phtml` does not exist here. No grid byte exists in any real row
  (all 11 observed products blocks are carousel), so grid bytes are VENDOR-CONFIG-VERIFIED
  (products.xml + grid converter + products form defaults), labeled as such.
- **Deliberate deviations, all documented:** the row's site css classes dropped
  (`lp-hero-slider`, `!m-0 !text-left`); conditions_encoded emitted as the observed combine
  shape with an EMPTY rule set (no category ids — editor-default state per the brief; the
  observed rows' child rules are editor data); carousel slider/behavior values follow the
  observed rows rather than the forms' drag defaults where they differ (evidence-first per
  contract rule 3).
- **Honesty:** live products listing is a typed GAP in every case (no provider binding exists —
  verified against the binding-map schema, the pinned registry, and the frozen seam). No product
  data anywhere. No `html`/freeform escape hatch used.

## Gates (honest state at commit time)

| Gate | Result |
| --- | --- |
| `pnpm exec prettier --check` on all 6 W-C files | PASS (clean) |
| W-C vitest suites (8 tests) | PASS 8/8 |
| `pnpm run test:studio` | 600/601 — the single failure is `handlers/__tests__/heading.test.ts`, W-B's in-flight lane file (its `wrap` disposition expectation), not a W-C surface. All W-C tests green. |
| `src/modules/magento/__tests__/wc-suite.mjs` over compiled dist | 3/3 PASS (validated against dist emitted from the W-C sources; see caveat below) |
| `pnpm run build:core` / `typecheck` | RED — but every remaining error is in OTHER lanes' in-flight files: `handlers/__tests__/handler-test-support.ts` (2 import errors vs `shapes/handler-support.js`, W-B's shared test helper). No error points at any W-C file (verified by exclusion-filtered tsc runs at every step). |
| `pnpm test` (contract gate) | 197/198 with the W-C dist emitted: all 195 pre-existing checks that were green at the pin stay green; the 1 failure is T-18b tripping on **W-D's committed** `src/modules/figma/__tests__/role-hints.test.ts` (two literal `Slaunch…` tokens, compiled into the shared `dist/`), a lane-owned neutrality violation W-D/Integrator must reconcile. W-C's own surfaces pass the same scan (including the T-18b theme-extension ban — accommodated in `elements-native.ts` + its suite by assembling the vendor converter's template literal from parts, documented in wc-declarations.md §8). |

Caveat recorded for the Integrator: because `build:core` is red from W-B's in-flight helper, the
`dist/` output the wc-suite and contract runner consumed was produced by compiling the W-C
modules in isolation into the existing Commit-A dist tree
(`tsc elements-native.ts handlers/slider-slide.ts handlers/products.ts --outDir dist …`).
Once W-B's helper compiles, a plain `pnpm run build:core` reproduces the same bytes plus the
rest of the tree. The T-18b `role-hints.test.js` finding is NOT dist-staleness: the banned
literals are in W-D's committed source and will resurface on any successful rebuild until W-D
removes them.

## Honest gaps

- **Live products listing** — typed GAP per container (provider binding verified absent; see
  wc-declarations.md §6). The declaration is fully Admin-editable; which products show is a
  data-provider concern the toolkit does not fake.
- **Products grid bytes** are VENDOR-CONFIG-VERIFIED, not real-row-verified (no grid row exists
  on this instance). Carousel bytes are VERIFIED-REAL-ROW.
- **`data-background-lazy-load="false"`** on the slide wrapper is emitted because the real rows
  carry it, but the attribute is not declared in slide.xml — an admin round-trip on a future
  install may drop it (documented, wc-declarations.md §2).
- **Slide content styling** collapses to plain h2/p inside the single WYSIWYG content field
  (per-field typography from the design is not representable in the poster content field).
- **Peered carousel intent** is carried exclusively by the explicit `slide` /
  `products-grid` / `products-carousel` projections; the handler never guesses from geometry or
  peer repetition (sections 3/6/9 of the matrix stay uncomposed until projected).
