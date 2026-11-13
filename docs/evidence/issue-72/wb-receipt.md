# [72] W-B receipt — native layout & editorial composer patterns (heading / header-band / card-grid)

Worker: **W-B** · Worktree branch `thanhle74/72-det-modular-page-builder-capabilities-p2-over` · Date 2026-11-13

## Scope delivered (4 steps, each committed separately)

| Step | Commit | Content |
| --- | --- | --- |
| 1 — dispatcher seam | `314c545` | `SectionComposeContext` built once indexes exist in `compose.ts`; registered handlers invoked from `compose/handlers/registry.ts` AFTER the legacy two-column/column-grid dispatch checks and BEFORE the guarded text-band attempt + hero eligibility scan; null = silent shape-miss; empty registry byte-identical (verified 195/195 at commit time). |
| 2 — editorial elements | `29a755c` | `compose/elements-editorial.ts`: pure builders (native heading element + structural chain openers + style-block rules), bytes byte-identical to the legacy composers' shapes. |
| 3 — handlers + unit contracts | `2df4ea8` | `compose/shapes/handler-support.ts` (shared deterministic predicates + accountable-record table), `compose/handlers/{heading,header-band,card-grid}.ts`, co-located vitest suites in `compose/handlers/__tests__/`. |
| 4 — registration + compiled-adapter suite | `1038176` | `SECTION_SHAPE_HANDLERS = [headingSectionHandler, headerBandHandler, cardGridHandler]`; `normalizeComposerRole` seam adapter (see "Integration finding"); `src/modules/magento/__tests__/wb-suite.mjs` (3 end-to-end checks over the compiled dist adapter). |

Files touched (all inside this lane's exclusive paths): `compose.ts` (step 1 integration only), `compose/elements-editorial.ts`, `compose/shapes/handler-support.ts`, `compose/handlers/{heading,header-band,card-grid,registry}.ts`, `compose/handlers/__tests__/{handler-test-support,heading.test,header-band.test,card-grid.test}.ts`, `src/modules/magento/__tests__/wb-suite.mjs`, this receipt.

## Handler signatures (verbatim, from the frozen seam in `compose/handler-context.ts`)

```ts
export interface SectionShapeHandler {
  id: string;
  compose(
    section: PageStructureSection,
    sectionNodeId: string,
    ctx: HandlerContext,
  ): string | null; // null = SILENT shape-miss (no diagnostics, no mapping)
}
```

Registered handlers (id → export):
- `wb-native-heading` → `headingSectionHandler` (`handlers/heading.ts`)
- `wb-header-band` → `headerBandHandler` (`handlers/header-band.ts`)
- `wb-card-grid` → `cardGridHandler` (`handlers/card-grid.ts`)

Shared helper: `composeHeadingElement(ctx, node, locator, note): string | null` (records a mapped entry or, on a missing manifest text, an `EVIDENCE_MISSING` gap + null — never invented content).
Seam adapter added in step 4: `normalizeComposerRole(role: string | undefined): ComposerRole | undefined` (handler-support.ts).
Shared predicates: `hasDecisionRole`, `visibleChildren`, `visibleDescendants`, `visibleKindSequence`, `fixedWidthOf`, `percentSplitOf` (largest remainder, sums to exactly 100), plus the accountable-record table `accountExcluded` / `accountDecoration` / `accountStructuralFold` / `accountUnsupported` / `accountMissingManifest`.

Every handler follows the same discipline: **silent shape predicate → silent manifest resolution → registry `requireCap` gate (typed `UNSUPPORTED_CAPABILITY`, null return, empty mapping) → composition with honest per-node accounting.**

## Structural signatures (deterministic, shapes never names)

- **heading**: no projected decision role; no media (kind or manifest); exactly ONE role-resolved heading in the visible subtree and no other role-resolved text (content-lead/body/cta/grid-caption/inline-media disqualify — those are band shapes). Emission: `row(contained) > inner [+ min-height] > native heading`; section height persists as the row inner min-height; structural containers fold by transparency (reverse document order: a container folds only when its WHOLE visible subtree is already accounted and nothing under it is unsupported).
- **header-band**: no decision role; no media; NO body role (body-bearing loose text stays with the legacy text-band — BrandStatement untouched); role content is exactly one band: >= 1 content-lead + exactly ONE heading + >= 1 CTA. A lead+heading pair without a trailing CTA declines (legacy text-band territory, pinned bytes). Emission: overline `<p>` run(s) in ONE text WYSIWYG → native heading → native buttons pair ONLY for CTAs with manifest label AND link (a CTA without a link is an explicit gap — never an unlinked pseudo-button); buttons/button-item caps required only when a composable CTA exists. Accounting: reverse document order with transparency folding; unsupported containers mark fold-blocked so ancestors never fold over them.
- **card-grid**: no decision role anywhere in the subtree (agrees with the projected legacy shapes ahead of the handler loop); N >= 2 kind-sequence-parallel card groups where "the groups are the section's ENTIRE visible content" — either every visible direct child is a group, or exactly one intermediate container (no own manifest media) whose visible children are all the groups AND every other direct child is pure chrome (no media/text kind or manifest media anywhere in its subtree). A group = container/component with a shared identical visible kind sequence that carries content (sequence includes media/text, or every group has its own manifest media slot — the slot-frame pattern). This tightening keeps mixed sections (band beside tiles, trailing captions/CTAs) with dedicated shapes or an honest skip — never a silent flatten. Emission: `row(contained) > column-group(default) > ONE column-line(default) > column(full-height) xN` — ONE line for any N per the pinned column-line children policy (vendor `content_type/column-line.xml` allows `column` children with NO count cap; documented N-policy). Widths: observed fixed widths → largest-remainder integer percents; otherwise equal apportionment + recorded `NOT_VERIFIED` (never inferred silently). Per column, document order: own media slot fill / media → `image(full-width)`; contiguous text runs → ONE text WYSIWYG per run; FIRST role-resolved heading → native heading, later headings and raw card copy fold as WYSIWYG `<h2>`/`<p>` runs (locator + manifest carry it — never a naming guess); CTAs with label+link → button-items (consecutive CTAs merge into ONE buttons container). `heading`/`buttons` caps required only when the silent scan found such content.

## Emitted byte shapes (verbatim from the committed builders)

```html
<!-- native heading (VERIFIED-REAL-ROW; real admin-saved cms_page rows 2/7/8/35) -->
<h2 data-content-type="heading" data-appearance="default" data-element="main">The Quiet Grandeur</h2>

<!-- row (contained) chain -->
<div data-content-type="row" data-appearance="contained" data-element="main">
<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner" data-pb-style="KEY">

<!-- column chain (declaration-backed; the only legal parents/children intersection) -->
<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">
<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="KEY">
<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="KEY">
```

Text/image/buttons bytes are the canonical legacy shapes extracted verbatim in `compose/elements.ts` (`<p>`/`<h2>` runs inside one text WYSIWYG; `figure` image; buttons(inline) > button-item(default) with keyed `{display:inline-block}` / `{text-align:center}` rules). Styles persist exclusively via the rehydratable style-block mechanism (`<style>#html-body [data-pb-style=KEY]{...}</style>`; never inline style attributes): `{min-height:Npx}` on the row inner, `{display:flex;width:100%}` on the column-line, `{justify-content:flex-start;display:flex;flex-direction:column;width:N%;align-self:stretch}` per column.

## Integration finding (step 4): the legacy SLOT table's vocabulary drift

The dispatcher's legacy `TEXT_ROLE_TABLE` yields `"contentLead"` (pre-#72 camelCase) for SLOT/Overline where the unified `ComposerRole` vocabulary says `"content-lead"`; the legacy hero/text-band paths switch on that raw value and their compose bytes are byte-pinned (G3/G4/G28), so the table is not a handler lane's to change. `normalizeComposerRole` (handler-support.ts, all four resolver call sites wrapped) adapts this ONE value at the seam; every other role value passes through. This was caught exactly as designed: WB-T1's first run composed `""` because the band predicate never saw a content-lead. W-C's handlers read the same seam and are the Integrator's to reconcile (not edited by this lane).

## Test list + results

Unit contracts (vitest, `compose/handlers/__tests__/`, 33 tests green across the three files):
- `heading.test.ts` (7): exact bytes + keyed min-height; missing-height warning; two-headings silent null; media/second-role silent null; grid-column projection silent null; registry absence (typed `UNSUPPORTED_CAPABILITY` + null + empty mapping); missing-manifest honest gap.
- `header-band.test.ts` (5): exact byte order (text WYSIWYG → heading → buttons) + full dispositions incl. transparency folds and decoration gap; lead+heading-without-CTA silent null; body-role silent null; media silent null; CTA without link composes NO button + gap and requires no buttons caps.
- `card-grid.test.ts` (9): 3-tile exact bytes ([34,33,33] equal apportionment, ONE column-line, 13 mapping entries, width-fallback + media-fidelity warnings); observed fixed widths [67,33] + no fallback warning; intermediate-container + pure-chrome fold path (chrome fold, decoration gap inside); content-bearing extra child silent null; unequal kind sequences silent null; grid-column projection silent null; missing column-line cap → typed diagnostic + null; missing manifests → explicit gaps, never invented bytes; role-resolved heading gates the heading cap + consecutive CTAs merge into ONE buttons container.
- `elements-editorial.test.ts` (4, step 2 commit): all heading levels, escaper, legacy-identical chain bytes, style rules.

Compiled-adapter contract suite (`src/modules/magento/__tests__/wb-suite.mjs`, register(checkAsync), spawn of `dist/.../compose.js` with schema-valid synthesized ComposeInput against the committed real-derived registry + its pinned empty binding map; real stdin → stdout contract):
- **WB-T1 PASS** — header-band end-to-end byte-verbatim (`row > text + native heading + buttons pair`), echo hashes verified (`nodeIrContentHash` = dist `stableContentHash`, `contentHash` = sha256 of emitted bytes), every node mapped, zero diagnostics.
- **WB-T2 PASS** — card-grid end-to-end byte-verbatim (3 tiles → `row > column-group > ONE column-line > column(full-height) x3`, [34,33,33], 13/13 nodes mapped, fallback + fidelity warnings recorded).
- **WB-T3 PASS** — a renamed-but-identical band composes byte-identically (shape detection never branches on names) and a legacy hero section in the SAME page composes `banner(poster)` through the unchanged legacy composer (bg media maps to `magento_pagebuilder/banner` wrapper; no native heading in the hero fragment — the structural handlers steal nothing).

## Gates (final, at `1038176`)

- `pnpm test`: **200/201** — all WB checks, W-C's wc-suite, and every pinned byte-regression suite green (G28-T31c/T31f/T32a, G3-T29c/T29g, G4-T30c/T30f, real-derived R56: 2 mapped sections + 10 skipped unchanged → legacy fixtures byte-identical with the handlers registered). The single failure is **T-18b** (pre-existing, NOT this lane): W-D's committed `src/modules/figma/__tests__/role-hints.test.ts` contains the string "Slaunchpad" and its compiled `dist/` copy trips the core neutrality scan — first appeared with W-D's commit `f2a2f3e`, reproduced independently of my changes (the scan hit is `dist/src/modules/figma/__tests__/role-hints.test.js: Slaunch`).
- `pnpm run test:studio`: **610/610** (58 files).
- `pnpm run typecheck`: clean.
- `pnpm exec prettier --check` on every touched file: clean (`--write` applied to this lane's files only).
- `pnpm run build:core`: clean; `node bin/det.js inspect --help`: exit 0.

## Documented choices

- Native heading level 2 everywhere (`heading_type` stays an Admin-editable form field): the composer's established heading convention (the same level folded heading runs use).
- Card display headings compose as the native heading declaration; later heading-role texts and raw card copy fold as WYSIWYG `<h2>`/`<p>` runs — peer-card copy is card copy (the locator + manifest entry carries it, never a naming guess).
- Transparency folding (reverse document order, fold-blocked propagation) replaced role-prefix-based folds mid-step-3: a container folds only when its whole visible subtree is provably accounted — never an assumed flatten.
- Header-band requires the trailing CTA: deterministic guard that keeps the plain two-text statement band (pinned legacy text-band bytes) out of the band handler.
- Column-line N-policy documented at the emission site: ONE column-line for any N >= 2 per the vendor declaration (children allow `column`, no count cap).

## Honest limitations / NOT done

- The card-grid "groups are the whole visible content" bound DECLINES mixed sections (e.g. a header band beside tiles, trailing section-level captions/CTAs). Those stay with the dedicated shapes (header-band) or an honest skip; composite band+grid sections are NOT composed by this lane.
- Decoration gaps (icons/gradients), missing media aspect/crop fields, gutters/staggering, and the mobile breakpoint are recorded fidelity limits (NOT_VERIFIED warnings + accountable mapping entries), never approximated with custom CSS.
- No shapes/ extraction of the legacy composers (compose.ts's copies of percentSplit etc. remain; consolidation is Integrator work — the duplication is documented at the helper).
- W-C's products/slider-slide handlers, the Integrator's final registry ordering, and the legacy vocabulary drift at their seam are not this lane's files.
- Structural composition evidence only — no Admin round-trip or visual rendering was claimed or performed.
