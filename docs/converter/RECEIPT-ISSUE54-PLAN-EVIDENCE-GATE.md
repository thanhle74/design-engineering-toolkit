# RECEIPT — Issue #54: live Figma-derived `det plan` proof — registry evidence gate repaired

**Date:** 2026-11-10 · **Branch:** `thanhle74/54-det-live-figma-derived-det-plan-proof-repair` · **Base:** `main` @ `8aaaf2e` (= #18/PR #21 merge tip)
**Gate status:** `REGISTRY_EVIDENCE_GATE_REPAIRED` + `REAL_SOURCE_PLAN_PASS` (exit 0, honestly zero bindings — **a passing `det plan` proves planned/gap behavior only; it is not mapping, not editability, not visual fidelity**)

---

## 1. What shipped (source-implemented, gate-tested)

- **Repaired example registry (in place):** `examples/converter/capability-registry.magento-pagebuilder.example.json` — the #9 registry now passes `validateRegistry` with **0 errors**: 55 native/widget entries carry **verified `config-declaration` evidence** from the platform's own registration surfaces; 6 theme-chrome entries are **honestly demoted to `discovered`**. The registry's source revision pin is unchanged (`66aff1e`), all 114 original `source-file` evidence records are untouched.
- **Reviewer-rerunnable plan inputs:** `profiles/slaunchpad-fashion.example.json` (placeholder paths — `det plan` is pure computation and never resolves them) + `examples/converter/component-binding-map.slaunchpad-fashion.example.json` (empty bindings, pinned to registry revision `66aff1e`).
- **Committed sanitized evidence:** `evidence/issue-54/live-plan-verified/resolution-report.json` + `evidence/issue-54/live-plan-verified.tool-run.json` (no owner paths, no credentials).
- **CI regression lock (REG-09):** `tests/registry-suite.mjs` now re-runs the exact acceptance — example registry validates, then the exact committed plan inputs resolve the revision-pinned live-derived #18 `PageStructure` offline (12 sections, coverage honestly 0, zero errors). **`npm test` = 180/180** (179 baseline + REG-09).

## 2. The exact 61 failures, proven and classified

Reproduced verbatim on `main` @ `8aaaf2e` via the compiled validator (`dist/src/core/semantic.js`): **61 × `EVIDENCE_MISSING` (error), all one class** — `proofLevel: 'registered'` claimed without `config-declaration` evidence. No duplicate identities, no summary tampering, no other error classes. Root cause: all 61 capabilities were `registered`, and all 114 evidence records were `kind: "source-file"` (0 `config-declaration`). 48 unique ids; 61 unique (id, appearanceId) identities — 13 ids carry multiple appearances (banner/slide/column/row/buttons/image/products).

Classification by provider: `Magento_PageBuilder` 34 (native), `Secomm_UiWidget` 21 (widget), theme 6 (chrome).

## 3. Verification chain (read-only Magento inspections only)

**No fabricated evidence.** Every grafted record was verified against the Owner's local Magento checkout (path resolved per the local gitignored profile only — never committed; read-only `git show`/`git diff`/`ls`; the checkout itself was never written):

1. **Enablement at the pinned revision** (tracked `app/etc/config.php` @ `66aff1e`): `Magento_PageBuilder => 1`, `Secomm_UiWidget => 1`, `Magento_Cms => 1`.
2. **Vendor-content determinism:** `composer.lock` is tracked and **byte-identical** between `66aff1e` and `933b36e` (current HEAD; `git diff` empty); `magento/module-page-builder` **2.2.6-p5 locked = installed**. `vendor/` is untracked, so the composer-installed registration surface at the verification read is the pinned-revision surface.
3. **Tracked registration files byte-identical** between `66aff1e` and `933b36e`, worktree clean for `app/code/Secomm/UiWidget/`: `etc/widget.xml` (single umbrella widget `secomm_ui`) and `etc/di.xml` (`Secomm\UiWidget\Model\Component\Registry` items, e.g. `accordion_a → AccordionADefinition` — the module's own component registration surface).
4. **Registration-surface scans by the shipped `det inspect` adapter** (`adapters/magento-pagebuilder/inspect.ts`, tested by the #9 suites), run read-only against the real checkout with a local gitignored profile (`sourceId: slaunch-checkout`): per-file `view/adminhtml/pagebuilder/content_type/*.xml` declarations (20 files), DI Registry items (21/21 example widgets matched), `di.xml` config arguments.
5. **`root-container`** (the only native type with no `content_type/*.xml` file) is declared on a platform surface: `vendor/magento/module-page-builder/etc/adminhtml/di.xml` → `<type name="Magento\PageBuilder\Model\Stage\Config">` / `<argument name="rootContainerConfig">` (consumed by `Model/Stage/Config.php`).

**Stale-vs-verified outcome:** every one of the 55 native/widget entries **does** have a verifiable registration-surface declaration — the #9 audit had read the right files but labeled all evidence `source-file`. Nothing was invented; nothing was dropped. The only over-claim was chrome: theme layout declarations are **not a platform registration surface**, so those 6 entries were demoted to `discovered` (kept, inventoried, out of CMS-page scope — never silently deleted, never papered over by lowering validation).

Pre-existing observation (untouched by this repair, verified on `main`): `chrome/header` and `chrome/navigation-menu` cite the identical theme-layout locator (`Magento_Theme/layout/default.xml#L10`) at the same revision, so they share one canonical `evidenceId` — evidence ids identify content (kind + locator + revision), not capability; the schema permits cross-capability reuse.

## 4. The repair (smallest legitimate diff)

Deterministic graft onto the existing registry: for each native/widget capability, one `config-declaration` evidence record taken verbatim from the adapter's scan output (locator/method), **re-pinned to `66aff1e` with the identity verification recorded per-entry in `note`** (canonical `evidenceId` recomputed per the schema rule — verified identical to the #9 entries' convention). Then: `summary` recomputed (55 registered / 6 discovered); the stale architecture-only diagnostic corrected ("every proofLevel stays at 'registered'" no longer true); a repair `NOT_VERIFIED` warning added; `generator` provenance updated. **Strict schema/contract preserved** — `validateContract("capability-registry")` and `validateRegistry` both green; no validator, schema or proof-ladder code changed.

## 5. The real-source plan proof

```
node bin/det.js plan \
  --profile profiles/slaunchpad-fashion.example.json \
  --registry examples/converter/capability-registry.magento-pagebuilder.example.json \
  --bindings examples/converter/component-binding-map.slaunchpad-fashion.example.json \
  --input evidence/issue-18/live-read-verified/page-structure.json \
  --out out/issue-54-plan --json
```

**Exit 0.** Input pins in the committed report: registry revision `66aff1ebd4cda9152a5e70635766b8030b10ff88`, binding-map content hash `d82f3d1a…`, PageStructure content hash `b54bfb62…` (the committed revision-pinned live artifact: file `vNPtfBRpYM3PsExirVqhmt`, root `245:2`, provider revision `2417494580183108397`).

- **12/12 live-derived sections enter the report** (Hero/Primary, BrandStatement, Hero/Secondary, FeaturedCollections, FeaturedProducts, CampaignEditorial, Lookbook, EditorialMosaic, Craftsmanship, ThePeople, ProductSpotlight, Newsletter), every one **`unmapped`** with `mappingConfidence: low` — honest remaining gap, no silent auto-binding.
- **`coverage.total = 0`** — zero proven capability bindings exist; binding a live design is separate future structural-mapping work, never fabricated here.
- **Proof:** claimed `registered` / justified `registered` — the registry's evidence ceiling, honestly below `structurally-mapped` because nothing is mapped.
- **0 errors, 0 warnings, 0 converter/run diagnostics.** Determinism: independent runs produce **byte-identical** `resolution-report.json` (sha256 `617b5c0a…`).

## 6. Honest remaining gaps (explicit, unresolved by this task)

1. **No proven bindings** — a structural-mapping/binding pass for the 12 live sections (map + explicit Owner-approved structural mapping) is future work; until then coverage stays 0.
2. `acceptedProps` types/requiredness **NOT audited** (type `unknown`), editor semantics `unknown`, widget placement rules unverified — declaration-only evidence ceiling.
3. Chrome is `discovered`-only and out of CMS-page scope.
4. `products`/`map` runtime data context unconfirmed (existing NOT_VERIFIED diagnostics kept).
5. Still **no** Admin round-trip, Page Builder serialization, CMS write or visual claim — all remain separately Owner-gated (G3/G4).

## 7. Decision log (this task)

- **ADR-054-001 — Repair in place, not replacement.** The smallest legitimate repair grafts verified evidence onto the existing #9 records; wholesale re-probing would discard the audit's detail (acceptedProps, chrome inventory) and churn the diff.
- **ADR-054-002 — Chrome demoted, not deleted.** `discovered` is the honest status for theme-owned layout declarations without a platform registration surface; the entries stay inventoried (out of CMS-page scope).
- **ADR-054-003 — Grafted evidence re-pinned to the registry's revision via identity verification.** Tracked files: `git diff 66aff1e..933b36e` empty + clean worktree. Vendor: tracked `composer.lock` byte-identical between revisions + locked version = installed version. Each evidence `note` states its exact chain; `retrievedAt` stays the actual read time.
- **ADR-054-004 — Zero bindings is the honest plan result.** The plan gate passes on registry validity + structural resolvability; auto-binding an unmapped live design would be fabrication, so coverage 0 is reported, locked by REG-09.
- **ADR-054-005 — CI regression lock (REG-09).** The exact acceptance (registry evidence-valid + live-derived plan green with honest zero coverage) now fails CI if the example registry ever regresses.

## 8. Boundaries honored

Read-only Magento inspections only (no CMS/Admin/source writes; the checkout was never modified — verified clean afterward for all touched paths). No Figma read or write beyond the already-committed #18 artifacts. No production, no Studio SQLite/runtime changes. No secrets or owner paths in committed artifacts (`tool-run.json` sanitized; same policy as #18's evidence). #18's passed extraction untouched — receipt, artifacts and pins unchanged.

## 9. Gates

- Root `npm test`: **180/180** (179 baseline + REG-09; build + all suites green).
- Studio (`apps/studio`): **216/216 vitest**, `tsc --noEmit` clean, eslint clean, `next build` production OK.
- CI `contracts` on the exact pushed head: recorded on the PR (see §10).

## 10. Reviewer rerun

```bash
npm ci && npm run build
node bin/det.js plan \
  --profile profiles/slaunchpad-fashion.example.json \
  --registry examples/converter/capability-registry.magento-pagebuilder.example.json \
  --bindings examples/converter/component-binding-map.slaunchpad-fashion.example.json \
  --input evidence/issue-18/live-read-verified/page-structure.json \
  --out out/issue-54-plan --json   # expect exit 0; report: 12 sections, coverage.total 0, counts.errors 0
npm test                            # expect 180/180 incl. REG-09
```

To re-verify registry evidence against the real checkout (read-only): re-run `det inspect` with a local gitignored profile (`sourceId: slaunch-checkout`) and compare locators; check `git diff 66aff1e..HEAD -- composer.lock app/code/Secomm/UiWidget` and `app/etc/config.php` module enablement at `66aff1e`.
