# W-D receipt — deterministic role-hint helper + draft recorded decisions (issue #72)

Lane: W-D (semantic projection/evidence + deterministic mapper helpers). Worktree
`72-det-modular-page-builder-capabilities-p2-over`, branch
`thanhle74/72-det-modular-page-builder-capabilities-p2-over`. Nothing was applied: the
committed example project, compose code, and studio are untouched; the drafts are
evidence only.

## Commit 1 — `f2a2f3e` helper + tests

- `src/modules/figma/semantic/role-hints.ts` — pure, suggestions-only helper.
  `deriveRoleHints(nodes: NodeIRNode[], sections: PageStructureSection[])` returns
  `{ assignments, hints }`; it never mutates anything and never decides. There is no
  barrel/index file in `src/modules/figma` today (adapters are imported by relative
  path, e.g. `core/types.js` from the compose adapter), so the module follows that
  convention and exports directly.
- `src/modules/figma/__tests__/role-hints.test.ts` — vitest (studio gate), 19 tests.

### Detector predicates (verbatim)

1. **header-band** — per section, scan the leading region in document order, collecting
   loose `text` nodes: descend through containers/components that carry NO visible media
   descendant (components must additionally carry >=2 visible text descendants — a
   component with <2 texts is an action/instance, not band copy); skip
   `icon`/`spacer`/`divider`; STOP at the first visible `media` node, the first container
   with a visible media descendant, the first member of a detected peer-card run, or the
   first non-descendable component. The cluster must hold exactly 2..3 texts; the pair
   (first, second) is proposed as content-lead + heading. Naming-contract recognition is
   scoped to the convention prefixes of the design-source naming table
   (PAGE/SITE/SECTION/SLOT/DECOR): `segment after the first slash, lowercased, reduced to
   [a-z0-9]` (compose.ts TEXT_ROLE_TABLE resolution). A name-resolved role marks the
   assignment confidence "observed" (`overline` -> content-lead, `heading` -> heading);
   position-only pairing is "conjecture". A first text whose contract segment resolves to
   a non-content-lead role, or a second text whose segment resolves to a non-heading role,
   suppresses the pair (the contract is never overridden). A first text longer than 32
   characters with no contract segment is not overline-shaped and suppresses the pair.
   Raw layer content containing a slash (`CHAPTER 01 / AW 2026`) is NOT a contract signal.
2. **peer-card-group** — detection scope = the section root's children plus the children
   of every container the section's PageStructure `elements` list names (the composer's
   shape-detection scope), parents deduplicated by node id and visited in that order.
   Within each parent, visible sibling containers/components are grouped by IDENTICAL
   visible descendant kind-sequences (parallel composition). A group of N>=2 where every
   member is content-bearing (visible media descendant, visible text descendant, or a
   convention-prefixed SLOT content frame) emits hint
   `{kind: "card-grid", containers: [member locators], columnCount: N, confidence:
   "observed"}`. Group containers get NO role — card-grid is structural vocabulary. An
   N==2 group of empty-but-SLOT-named frames is suppressed: two identical empty content
   frames are the two-column signature, not a grid; three or more cannot be a two-column
   split.
3. **products decision** — NEVER auto-assigned. A detected card-grid group whose parent
   container, any member, or any member's text descendant resolves a product-ish contract
   segment (`product|products|productcard|productcards|productgrid|productlist`) emits
   hint `{kind: "products-candidate", container: <parent locator>, confidence:
   "conjecture"}` — conjecture ALWAYS; products-grid/products-carousel are recorded
   decisions only.
4. **slide decision** — NEVER emitted, structurally, under any configuration (carousel
   intent is undecidable from NodeIR; peer-repeated groups are structurally identical to
   grids). No `slide` role and no slide hint exists in the output vocabulary; a test
   asserts the invariant.

Determinism: sections in PageStructure order, children in document order, node inventory
order irrelevant (resolution by id); reasons cite locators and counts, never layer names,
so identical structure under different names yields byte-identical output.

### Tests (19, all passing)

- header-band (7): leading component band pair; SLOT-named -> observed confidence;
  4-text overflow suppresses; leading media suppresses; single text suppresses; long
  first text suppresses; contract-named body first text suppresses.
- peer-card-group (6): 3 identical cards -> hint, no roles; non-parallel siblings -> no
  hint; empty SLOT-named pair suppressed vs 3 accepted; product-named group -> conjecture
  candidate (never a role); non-product contract naming -> no candidate; group found
  through the elements scope.
- invariants (2): deterministic order; carousel-looking 5-sibling configuration produces
  card-grid only, never slide/products roles.
- source-grounded (4): the committed #18 live-read artifacts
  (`docs/evidence/issue-18/live-read-verified/node-ir.json` + `page-structure.json`,
  337 nodes / 12 sections) produce exactly 20 assignments (10 pairs, every one
  conjecture — no committed layer name carries the contract vocabulary on this source),
  the five observed card grids with the W-A counts (FeaturedCollections x3
  `436:460/436:472/436:484`, FeaturedProducts x4 `254:72/254:81/254:90/254:99`, Lookbook
  x3 `299:322/299:329/299:336`, EditorialMosaic x4 `284:407/284:410/284:413/284:416`,
  ThePeople x4 `522:547/522:549/522:551/522:553` — interleaved captions notwithstanding,
  trailing `SLOT/EditorialFabricDetail` excluded), exactly ONE products-candidate
  (`254:71`), no products/slide roles, CampaignEditorial's two empty SLOT media frames do
  NOT become a card-grid pair, and the four Section Header bands are detected while
  ThePeople (`522:543`, 4-text overflow) and ProductSpotlight (`257:124`, 4-text cluster)
  are not.

## Commit 2 — drafts + this receipt

- `docs/evidence/issue-72/source/draft-projection.json` — 20 assignments, validated
  against `resources/schemas/cli/semantic-projection.schema.json` (v1.5.0) with the
  repo's Ajv draft-2020 (valid; no duplicate locators). The 11 committed assignments of
  `resources/examples/build/slaunchpad-home-real-derived/semantic-projection.json` are
  kept byte-verbatim (verified by JSON deep-equality against the committed file). Added:
  8 header-band assignments (content-lead + heading per repeated Section Header band —
  FeaturedCollections `I256:96;250:28/29`, FeaturedProducts `I254:62;250:28/29`, Lookbook
  `I299:312;250:28/29`, EditorialMosaic `I256:139;250:28/29`) and 1 `products-grid`
  recorded decision on the FeaturedProducts container `254:71` with the decision (not
  guess) stated in the reason/note. NO `slide` role anywhere (W-A: carousel intent
  undecidable). Role census: background-media 1, content-lead 6, heading 6, body 2,
  column-primary 1, column-secondary 1, inline-media 2, products-grid 1.
- `docs/evidence/issue-72/source/draft-content-entries.json` — 8 additional text entries
  (the two header texts of the four bands), schema-valid against
  `content-manifest.schema.json`; every `text` equals the committed NodeIR node name
  verbatim (R56 lock, machine-checked), `valueRef` copies the committed manifest's
  `design://figma-home-desktop/<locator>` convention. NO media entries added; the 4
  committed placeholder media URLs stay as they are; no asset URL invented. Each note
  states that the name is a generic instance label, not final copy.

## Gates (honest state at commit time)

- `pnpm exec vitest run src/modules/figma/__tests__/role-hints.test.ts` — 19/19 green.
- Full `pnpm run test:studio` — 588/589 pass; the single failure is
  `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/slider-slide.test.ts`
  (W-C's in-flight, untracked file in this shared worktree) — unrelated to W-D (my
  commit adds only new files under `src/modules/figma`; the suite was already red on
  that file before this commit).
- `pnpm run typecheck` — OK (root tsconfig excludes `src/modules/figma`).
- `pnpm run build:core` — currently red from W-C's in-flight files
  (`handlers/products.ts`, `handlers/slider-slide.ts` + their test: type-import errors
  against `handler-context.js`). ZERO errors under `src/modules/figma` (verified by
  grepping the tsc output and by compiling my two files in isolation with the
  `tsconfig.core.json` compilerOptions — exit 0).
- Prettier: `--check` green on both source files (after `--write`); the drafts live
  under `docs/` which `.prettierignore` excludes ("committed data and prose keep their
  hand-maintained shape") and they mirror the committed files' formatting (2-space
  indent, ASCII escapes, no trailing newline).

## Honest limits

1. **Suggestions are not decisions.** The helper proposes; the draft records. The draft
   deliberately does NOT record helper suggestions outside the four named Section Header
   bands (Hero/Secondary, ProductSpotlight, ThePeople, BrandStatement, CampaignEditorial,
   Newsletter pairs remain unrecorded; Hero/Primary + Craftsmanship bands were already
   committed).
2. **All header-band evidence on this source is position-based** (conjecture in the
   helper's terms): no committed layer name carries a convention-prefixed role word. The
   draft records them as operator/AI-reviewable decisions with node-id-cited reasons.
3. **The header-band copies are generic instance labels** (`OVERLINE`, `Section Title`).
   The draft manifest entries carry them name-verbatim only under the R56 naming lock;
   real section copy is an operator gap, stated in every entry note.
4. **products-grid is a recorded decision, not a detection.** Card grid vs carousel is
   undecidable from NodeIR (W-A observation 4); grid is recorded because the container
   declares `direction: row` with the four peers in one band. `products-carousel` is NOT
   recorded, and live listing content stays an explicit gap (registry
   `requiresRuntimeData=true`).
5. **EditorialMosaic's 4 identical columns also match the peer-card predicate** and emit
   a card-grid hint, although the column-grid shape owns that signature; likewise
   Lookbook/ThePeople hints await the peer-group handler decision. Hints are surfaced,
   not acted on, by the draft.
6. **Concurrent-work condition:** W-C's handler lane is mid-flight in this shared
   worktree and currently breaks `build:core` and one studio test; per the frozen
   contract I did not touch those files. The Integrator should re-run the full gates
   after W-C lands.
