# [#72] Integrator receipt — modular Page Builder capabilities P2 (overnight run)

Branch: `thanhle74/72-det-modular-page-builder-capabilities-p2-over` · Base: `186a191` (#70 merge)
Status: **complete, awaiting Coordinator review — NOT merged (per protected rules).**

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

All gates re-run at the exact head SHA (recorded below) — see the final-gate section of this receipt's commit. Baselines held: `pnpm test` (195), `pnpm run test:studio` (558; one pre-existing flake observed once in an earlier baseline run, green on rerun), typecheck, lint, build, touched-file Prettier, foreign-cwd det CLI, generated `php -l`, installer dry-run + create/update/verify/cleanup.

## Honest limitations

- The extended project's band labels are observed Figma instance names ("OVERLINE", "Section Title") — the R56 honesty lock; they are NOT final copy.
- products capability = editable default state only (declaration + widget directive); live listing requires a provider binding that does not exist in the binding-map schema (typed GAP).
- Slider composes nothing on this source by design (carousel intent not geometry-decidable).
- Known pre-existing environment leftovers, not addressed by this issue (not mine to remove without mandate): #70-era temp admins `qa_r6aha8`, `qa_r6aha8_noacl`, `uixreview_*` still active; nginx ~16KB POST 500 unfixed (our 6.5KB content is under it); `magento-spec` MCP `db_query` broken (PDO used instead).
- Admin Save re-serializes composed bytes (6546 → 8214, identical marker structure): expected PB-model normalization, recorded rather than hidden.

## Protected rules — honored

No Figma writes; only the authorized isolated store-5 temp page was created/updated/deleted; store 0 never touched (refusal gates exercised in the installer); no production writes; no self-merge (this PR stays Draft); no licensed Hyvä source distribution; the committed store-0 demo installer never executed; no credentials/tokens/customer data committed (temp admin password existed only in this session's shell).

🤖 Integrator work performed with [Claude Code](https://claude.com/claude-code)
