# RECEIPT — Issue #56: first real-source Studio build — evidence-backed mapping and operator usability

**Date:** 2026-11-10 · **Branch:** `thanhle74/56-det-first-real-source-studio-build-evidence-b` · **Base:** `main` @ `7c573e3` (PR #55 merge, per the issue's handoff)

**Status: `REAL_DERIVED_STUDIO_BUILD_OPERATIONAL`** — one revision-pinned real-derived project runs end to end through the existing Studio `/build`; coverage is honest (2/12 sections composed, everything else an explicit record). Draft PR for Coordinator review; **no merge without explicit Owner GO.**

---

## 1. What shipped (source-implemented, gate-tested)

**No engine, adapter, schema or Studio-code changes.** The missing link was materializing the committed #18 evidence into the exact inputs the existing product already consumes, plus locks that keep it honest:

1. **`resources/examples/build/slaunchpad-home-real-derived/`** — one self-contained, portable, revision-pinned build project:
   - `snapshot-project/figma-home-desktop.245-2.tree.json` — the offline design-source tree document derived **verbatim** from `docs/evidence/issue-18/live-read-verified/node-ir.json` (337 nodes, root `245:2`, provider revision `2417494580183108397`), by
   - `tools/derive-snapshot-tree.mjs` — the committed, deterministic provenance tool (componentRef values recovered verbatim from the committed NodeIR diagnostics; kind aliases chosen so the core's own kind table and identity hashes reproduce exactly);
   - `profile.json` (`slaunchpad-fashion`, snapshot design source; platform-checkout path stays the placeholder sentinel);
   - `capability-registry.json` — produced by **one read-only `det inspect`** of the Owner's local checkout at git HEAD `933b36e78211e571e4fab9a78866a02dc1b5e054` (80 capabilities, all `source://slaunch-checkout/...` locators, no absolute paths), committed so the build is portable;
   - `component-bindings.json` — deliberately **zero** bindings pinned to that registry revision;
   - `content-manifest.json` — observed-only: 3 hero text entries (text = the committed design layer names) + 4 labeled offline placeholder media entries (the reviewed [25]/[28] pattern);
   - `semantic-projection.json` — the recorded role decision, bounded to the two investigated candidate sections;
   - `README.md` — provenance table, honesty boundaries, short-form runbook.
2. **`tests/real-derived-suite.mjs`** (6 checks, wired into `tests/run-all.mjs`) — locks the whole chain offline: byte-identical tree re-derivation (T1), extraction stable-hash parity with the committed #18 artifacts (T2), the build bundle's honest partial composition + revision pin (T3), pin consistency + machine-path-free portability (T4), observed-only content (T5), plan coverage 0 over the committed chain (T6).
3. **`docs/runbook-real-derived-studio-build.md`** — the operator runbook (Fedora-tested): start Studio, choose the labeled real-derived project, Build, read stage table / per-section Compose-vs-Review columns / gap list / byte-verified downloads; includes the headless CLI equivalent and troubleshooting.
4. **`docs/evidence/issue-56/`** — the actual UI-driven operator run's bundle evidence (`build-manifest.json`, `compose-report.json`, `native-content.html`, both stage tool-run envelopes) + scoped DOM evidence text; `docs/screenshots/56-*.png` — catalog with both labeled entries, fixture run page, real-derived run page.
5. **`apps/studio/README.md`** — one paragraph pointing at the committed real-derived project and the runbook (no behavior text changed).

## 2. First run of the CURRENT product as an operator (issue step 1, at base commit `7c573e3`)

Executed before any repo change, through the real UI (Orca embedded browser → production Studio build of the base checkout):

- **Works as documented:** catalog listing from `STUDIO_BUILD_PROJECTS_DIR` with declared-path provenance; one click → real `det build`; job state with 409 single-build semantics; bundle run page with byte-verified manifest, stage table, gap list, per-section mapping review, artifacts table with per-file downloads; fixture demo (g28) composes 12/12 sections / 188 mappings.
- **Accurate limitations found:** `PREVIEW_UNAVAILABLE` on **every** `det build` bundle (fixture included) — no [28] Preview Theme render is bound to plain bundles, and Studio correctly refuses to fake one. Native Page Builder HTML stays source/download only (no Admin/storefront claim anywhere). Recorded in the runbook as the expected state, not a failure.
- Environment note: a detached issue-50 smoke server occupied port 3000 (`/tmp/det50-smoke` env); this task's Studio ran on port 3100. No other session's state was touched.

## 3. The bridge (smallest legitimate path, no relabeling)

`det build` major 1 is offline-snapshot-only by contract, while #18 committed sanitized derived artifacts (NodeIR/PageStructure/SourceReview — the raw provider snapshot is not committed). The bridge is the **exact inverse of the core's own derivation**, materialized as a tree document the existing fixture transport adapter consumes:

- locator ← NodeIR `sourceEvidence` locator (strip `design://<sourceId>/`);
- kind ← an adapter-vocabulary alias mapping (via the core's own `KIND_MAP`) to the committed NodeIR kind — node identity hashes the **mapped** kind (`deriveNodeId(sourceId ␟ locator ␟ mappedKind)`), so node/section/evidence ids reproduce exactly;
- componentRef ← verbatim from the committed NodeIR's 40 `NOT_VERIFIED` dangling-ref diagnostics (the core's own message shape);
- layout ← the committed (already-coerced) primitives, idempotent under `coerceLayout`; visible/children verbatim.

**Proof:** offline `det extract` over the derived tree (fixture adapter, no registry) reproduces the committed #18 artifacts' **stable content hashes for all three artifacts** (`stableContentHash` strips only timestamps); `node-ir` and `source-review` also match when the build's own registry/binding pins are added — `page-structure` then differs **only** in the `inputs` pins the build contract itself requires (verified by structural diff; locked as R56-T2). The #18 revision `2417494580183108397` pins the tree document, the content manifest and the projection; the bundle manifest carries `source: figma-home-desktop @ 2417494580183108397`. **No live Figma read was performed; nothing is relabeled fixture-as-live** — the fixture demo stays a separate, clearly labeled catalog entry.

### Registry namespace note (decision + observation)

The reviewed composer shapes hard-code the probe-derived capability namespace (`magento_pagebuilder/row#contained`, …), while the committed [54] example registry uses `magento-pagebuilder/row#contained` (dash). With the [54] registry the composer fails closed with `UNSUPPORTED_CAPABILITY` (reproduced, not patched around); `det inspect` emits the underscore namespace deterministically. Decision: keep [54]'s registry untouched (its REG-09 lock still passes — plan-side, coverage 0), and pin the build to the probe-derived registry from the same checkout. The two registries serve different, documented purposes; the namespace divergence between the compose family and the [54] declaration registry is flagged here as an observation for the Coordinator (no follow-up issue opened, per the issue's boundary).

## 4. Real mapping coverage (honest, measured)

- `det plan` over the committed chain: **12/12 real sections resolved, coverage 0, all `unmapped`** — identical to the #54 result; zero proven component bindings (28 instances stay custom-required `NEEDS_REVIEW`). Locked (R56-T6).
- Composition (the composer's structural shapes, zero bindings): **`SECTION/Hero/Primary` → native `row(contained) > banner(poster)`** (background media slot + content-lead/heading/body projected; no CTA — the button instance's label/link copy is absent from the committed evidence and was **not** invented; the button stays a recorded gap); **`SECTION/Craftsmanship` → native `row > column-group > column-line > column(full-height) ×2` with `image` elements** (media slots composed with labeled offline placeholder URLs; the role-named `Overline`/`Title`/`Body` layers are projected with reasons but their display copy is **absent** from the extraction — explicit gaps, fields left empty). **10 sections skipped** with explicit reasons ("does not carry the hero shape this slice composes … skipped — nothing invented." etc.); 12 fidelity gaps (decorations, unbound instances, unfolded containers) recorded per node in `compose-report.json`. Manifest gaps: `COMPOSITION_SKIPS_PRESENT · 10`, `COMPOSITION_GAPS_PRESENT · 12`.
- `MAPPED / NEEDS_REVIEW / GAP / EXCLUDED` per section/element is exactly what the run page shows (Compose vs Review columns); nothing is quietly swapped with fixture-derived results (the fixture project is a separate catalog entry with its own inputs).

## 5. Verification chain

- Root gate: `npm test` → **186/186 checks pass** (180 pre-existing + R56-T1…T6), including REG-09 ([54] lock unchanged), the [28] build suite, neutrality scan (scope unchanged — schemas + generic example; the project-specific dir is evidence, like `resources/projects/slaunchpad-fashion/`), determinism and negative cases.
- `det build --config resources/examples/build/slaunchpad-home-real-derived/build-config.json --out <tmp>` → exit 0, three stages, per-file-byte manifest verified (also executed from the committed location, self-contained).
- Studio: `npm run build` (production), `npm start` + Orca-browser operator run (DOM evidence + screenshots above), `npx vitest run` full suite, `npm run lint`, `npm run typecheck` — all pass (details in §6).
- Extraction parity: stable hashes of the bundle's `02-extraction/node-ir.json` == committed #18 `node-ir.json` (R56-T3), plus full three-artifact parity in the pin-free shape (R56-T2).

## 6. Gates (exact commands, this workspace)

| Gate | Command | Result |
|---|---|---|
| Root contracts | `npm test` | 186/186 pass |
| Studio unit | `cd apps/studio && npx vitest run` | all suites pass |
| Studio lint | `cd apps/studio && npm run lint` | pass |
| Studio typecheck | `cd apps/studio && npm run typecheck` | pass |
| Studio prod build | `cd apps/studio && npm run build` | pass |
| Operator E2E | Studio `/build` → Build on the real-derived entry → run page → artifact download | exit 0; manifest verified; `native-content.html` 200 / 3288 bytes |

CI note: the two exact-head jobs (`contracts`, `studio` in `.github/workflows/validate.yml`) are unaffected by construction — no schema/src/studio source changes; the new suite rides the existing `npm test`; the committed project JSON passes the CI's JSON-parse sanity scan.

## 7. Boundaries honored

- No Figma provider read/write; the committed #18 artifact is the only design input. No live extraction re-run.
- No Magento Admin/CMS/DB/store/theme writes anywhere; the one local-checkout access was a **read-only `det inspect`** capability probe (the toolkit's own read-only declaration scan), committed with its revision pin.
- No secrets, no provider file key, no licensed Hyvä source, no raw customer assets committed; machine-specific absolute paths absent from every committed project file (locked R56-T4).
- Studio layout/UX untouched (dark-only, spacious); no new UI framework; no converter/adapter built.
- One workspace, one Draft PR; no follow-up issues opened; **stopped here for Coordinator review — no merge without explicit Owner GO.**

## 8. Honest remaining gaps (explicit, unresolved by this task)

1. **8 of 12 sections** remain outside the reviewed composer shapes (FeaturedProducts, ThePeople, Lookbook, …) — explicit skips with reasons; composing more shapes is future composer work ([23]/[25]/[28] family), not a mapping promise.
2. **Component bindings remain zero** — the 28 instances need real binding evidence (definition-resolvable refs + registry targets) before any instance-level mapping can be claimed.
3. **Craftsmanship display copy, CTA label/link and all real media assets are absent from the committed evidence** — they stay explicit gaps/labeled placeholders until observed and supplied through the content manifest (never authored into the toolkit).
4. **Preview binding** (`PREVIEW_UNAVAILABLE`) applies to all `det build` bundles today, fixture included — connecting [28]'s verified Preview Theme output to bundles is its own future gate.
5. **Admin Save→Reload / storefront rendering is not proved** — native Page Builder HTML is source/download only; that proof remains the separately gated isolated round-trip.
6. Registry namespace divergence (compose family underscore vs [54] declaration registry dash) — see §3 observation.

## 9. Reviewer rerun

```bash
npm ci && npm run build && npm test                     # 186/186 incl. R56-T1…T6
node bin/det.js build \
  --config resources/examples/build/slaunchpad-home-real-derived/build-config.json \
  --out /tmp/r56-review                                 # exit 0; check build-manifest.json source pin
# operator path: docs/runbook-real-derived-studio-build.md
```
