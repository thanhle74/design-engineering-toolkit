# [72] Frozen shared contract — modular native Page Builder capabilities

Integrator-frozen at base `186a191027e4dc4f6ec5a1840f50af9d17007430` (origin/main pin, HEAD verified). This document is the single coordination artifact for the #72 worker lanes. Path ownership is exclusive per worker; anything not listed here belongs to the Integrator.

## Baseline at pin (verified 2026-11-12, this worktree)

- `pnpm install --frozen-lockfile` — OK
- `pnpm test` — **195/195 checks passed**
- `pnpm run test:studio` — **558/558 passed** (one non-deterministic single-test failure observed on the very first local run; full suite green on immediate rerun and treated as an environment flake — re-verified before every receipt)
- `pnpm run typecheck` — OK · `pnpm run lint` — OK · `pnpm run build` — OK

## Module boundaries (unchanged, one-root modular monolith)

- `src/modules/core` — neutral engine/CLI; **no** Magento/Figma/Claude specifics.
- `src/modules/figma` — source→normalized structural evidence only.
- `src/modules/magento` — target-native Page Builder content-type handlers/serializers + PHP installer.
- `src/modules/studio` — operator UI/orchestration (untouched styling; #70 flow preserved).
- New composer code lives under `src/modules/magento/adapters/magento-pagebuilder-compose/` only. No new parser/composer engine anywhere else.

## Commit A (Integrator, already applied)

- `compose/elements.ts` — pure shared emit helpers extracted **verbatim** from `compose.ts` (esc/escText/SEP/pbStyleKey/auxNodeId/sha256Hex/imageElementHtml/textElementHtml/buttonVariantClass/buttonsElementHtml/TextRun). Byte-identical output contract; gate re-run before commit.
- `compose/handler-context.ts` — the frozen typed seam every NEW shape handler is written against (below).
- `compose/handlers/` — registry directory; each handler file exports one `SectionShapeHandler`.

## Frozen handler seam (`compose/handler-context.ts`)

```ts
export interface SectionComposeContext {
   // node inventory + document-order helpers (read-only views of the compose input)
   nodesById: Map<string, NodeIRNode>;
   locatorOf(node: NodeIRNode): string | null;
   walkSubtree(rootId: string, visit: (n: NodeIRNode) => void): void;
   // registry gate — declaration-backed native only, fail-closed diagnostics
   requireCap(id: string, appearanceId: string): boolean;
   // content manifest lookups
   textByRef: Map<string, string>;
   mediaByRef: Map<string, { mediaUrl: string; assetLabel?: string }>;
   linkByRef: Map<string, { linkUrl: string; linkTarget?: string; variant?: "primary" | "secondary" }>;
   // explicit semantic projection
   roleByLocator: Map<string, ComposerRole>;
   excludedLocators: Set<string>; // decoration-subtree exclusions
   // accountable records (append-only; handlers NEVER print)
   pushDiagnostic(d: Diagnostic): void;
   pushMapping(m: MappingEntry): void;
}

export interface SectionShapeHandler {
   readonly id: string; // stable handler identity, used in mapping notes
   compose(section: PageStructureSection, sectionNodeId: string, ctx: SectionComposeContext): string | null;
}
```

Rules binding every handler:

1. **Deterministic shape signature only.** Detect the shape from structure (peer repeated groups, media slots, role-resolved subtrees) — never from section names, node `245:2`, customer paths, or source identity.
2. **Registry-gated.** Every emitted content type × appearance must pass `ctx.requireCap` first; an absent/disabled/non-native declaration is a typed `UNSUPPORTED_CAPABILITY` diagnostic, never a guess.
3. **Vendor-verified persisted shapes.** Bytes emitted must mirror the real admin-saved master-format shapes recorded in `docs/evidence/issue-72/source/native-declarations-observed.md` (VERIFIED-REAL-ROW entries preferred over vendor-template-only).
4. **Honest accounting.** Every consumed source node produces a `mapping` entry (mapped/gap/excluded/skipped); anything unsupported returns typed GAP diagnostics — never an `html`/freeform-text escape hatch.
5. **No shared-file edits.** Handler workers add NEW files under `compose/handlers/` plus co-located suites; the Integrator wires `compose.ts` dispatch registration after review. Existing four shapes (hero, two-column G4, text-band #28, column-grid #28) keep their current bytes unless a fix is vendor-evidenced (then pinned suites update deliberately).
6. **Style keys via `pbStyleKey`, ids via `auxNodeId`** from `elements.ts` — the master-format `<style>` block stays keyed and deterministic.
7. **Tests co-located**: `compose/handlers/__tests__/…` as vitest `*.test.ts` (studio gate) or `src/modules/magento/__tests__/*-suite.mjs` (contract gate); fixtures synthesized from the observed declaration shapes, no owner-machine paths.

## New native capability scope for #72 (registry-backed, evidence-first)

| Family | Handler | Verified persisted shape source | Live-data rule |
| --- | --- | --- | --- |
| `heading` | W-B | real cms_page rows (h1–h6, `data-element="main"`) | n/a (text) |
| `slider`+`slide` | W-C | real cms_page rows (`pagebuilder-slider` div; poster slide wrapper/overlay/button chain; `data-background-images` JSON) | media URLs only from observed manifest |
| `products` grid/carousel | W-C | real cms_page rows (declaration div + `{{widget …ProductsList…}}` directive, `conditions_encoded`) | declaration + editable default config only; **no invented product data**; live listing = typed GAP unless a verified provider binding exists |
| `divider` | only if source-backed | vendor template only → VENDOR-TEMPLATE-ONLY unless a real row proves it | n/a |

Out of scope for handlers: `html`, `map`, `tabs/tab-item`, `video`, `block` (no source-backed evidence in the 12-section matrix yet — revisit only on W-A evidence).

## Path ownership (exclusive)

| Lane | Paths |
| --- | --- |
| Integrator | `compose.ts` (dispatcher wiring), `handler-context.ts` registry glue, root/package/build manifests, docs/handoff, receipts, PR |
| W-A | `docs/evidence/issue-72/source/**` (read-only elsewhere) |
| W-B | `compose/shapes/**` (extraction of the 4 existing composers), `compose.ts` edits for that extraction only, heading handler `compose/handlers/heading.ts` + co-located tests |
| W-C | `compose/handlers/slider-slide.ts`, `compose/handlers/products.ts` + co-located tests |
| W-D | `src/modules/figma/**` scoped helpers + fixtures, projection vocabulary extension (via Integrator review) |
| W-E | `scripts/proof/issue72/**`, `docs/evidence/issue-72/browser/**` |

Serialized commits: all lanes commit through the Integrator in one worktree (nested Orca worktrees unavailable) — noted as the #70-style fallback the issue allows.

## Verified environment facts (2026-11-12)

- Local Magento: `/home/thanhle/Sites/Magento/slaunchpad`, 2.4.8-p5, `php bin/magento` functional; DB access via `app/etc/env.php` PDO (magento-spec MCP `db_query` errors — do not depend on it).
- Stores: 1=vi (default), 4=en, **5=det_preview (isolated QA store — all writes target store 5 only)**.
- Pre-existing #70 test artifacts to fingerprint and never modify: cms_page 35 `home-6ad89b83d8c5d`, cms_page 36 `home`.
- Real PB rows observed (declaration evidence): pages 2/7/8/35 contain admin-saved heading/slider/slide/products markup — the persisted shapes above come from these rows.
