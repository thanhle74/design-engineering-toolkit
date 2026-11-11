# ACTIVE CHATGPT COORDINATOR HANDOFF — Design Engineering Toolkit

## CURRENT CHECKPOINT — 2026-11-11 — [60] NPM WORKSPACES: ONE ROOT LOCKFILE, PORTABLE `packages/core` (@det/core); DRAFT PR AWAITING COORDINATOR REVIEW

- **Repository layout migrated per the Owner's explicit #60 GO** (receipt: [RECEIPT-ISSUE60-NPM-WORKSPACES.md](../docs/converter/RECEIPT-ISSUE60-NPM-WORKSPACES.md)): root `package.json` is now a pure npm-workspaces orchestrator (`workspaces: ["apps/*","packages/*"]`); the engine moved as ONE deployable unit into `packages/core` (`@det/core` 0.1.0, private) owning `src/`, `adapters/`, `schemas/`, `bin/det.js` — zero TypeScript source edits, zero descriptor edits, zero `registry.json` edits (the two `import.meta.url` `REPO_ROOT` anchors land on the package root, the exact tarball layout). `apps/studio` joined the workspace; `apps/studio/package-lock.json` is DELETED — ONE root `package-lock.json` remains. The root `bin/det.js` is a byte-compatibility wrapper (same messages/exit codes) so `node bin/det.js`, `npm exec det`, Studio's `../../bin/det.js` default, REG-09 and the CI smoke are unchanged.
- **Behavior preserved end-to-end:** root `npm run dev` (NO env) → `/api/build-configs` lists `slaunchpad-home-real-derived` (origin=repository) → real offline Build exit 0 → journal `command[1] = <root>/bin/det.js` → second POST 409 (single slot) → `native-content.html` download byte-verified (run-view sha256 == build-manifest outputs sha256 == downloaded bytes, 3-way) → 10 skips / 12 gaps / `PREVIEW_INSTALL_OPERATOR_GATED` honesty fields intact → committed project untouched. Evidence: `evidence/issue-60/operator-run.root-dev.json`.
- **Gate:** root `npm test` **195/195** (191 + new T-60-1..4 pack-portability suite: tarball layout contract, foreign-cwd install+`--version` (0.0.0 fallback would mean a broken anchor), package-root schema resolution of the committed #54 plan inputs, fail-closed negative). Studio **222 tests / typecheck / lint / production build** green. Clean-clone simulation: `rm -rf node_modules` → ONE `npm ci` → 195/195. CI `validate.yml` studio job collapsed to one root install.
- **Boundaries honored:** no Figma reads/writes; no Magento CMS/Admin/DB writes; Studio component library untouched (Ant Design Light is a separate issue); receipts historical; `kb/`, `profiles/`, `projects/`, `examples/`, `evidence/` stayed at root.
- **NEXT:** Coordinator/Owner review the Draft PR (migration diff + receipt + evidence) → merge decision. Known follow-up (not this issue): the Studio component-library replacement (Ant Design Light) must base on the reviewed result of this PR to avoid colliding diffs.

## HISTORICAL CHECKPOINT — 2026-11-10 — [54] REGISTRY EVIDENCE GATE REPAIRED; REAL-SOURCE `det plan` PASS (HONEST ZERO BINDINGS); DRAFT PR AWAITING COORDINATOR REVIEW (superseded by the [60] checkpoint above; #56/#58 merged as PRs #57/#59)

- **The #18 follow-up blocker is repaired** (receipt: [RECEIPT-ISSUE54-PLAN-EVIDENCE-GATE.md](../docs/converter/RECEIPT-ISSUE54-PLAN-EVIDENCE-GATE.md)): the #9 example registry now passes `validateRegistry` with **0 errors** — 55 native/widget entries carry **verified `config-declaration` evidence** (registration-surface scans by the shipped `det inspect` adapter: per-file `content_type/*.xml`, `Secomm\UiWidget\Model\Component\Registry` DI items, `rootContainerConfig` in `adminhtml/di.xml`), and the 6 theme-chrome entries are **honestly demoted to `discovered`** (theme layout is not a platform registration surface). Nothing invented, nothing deleted; the registry's `66aff1e` source pin and all original evidence are untouched; every grafted record's verification chain is in its `note` field.
- **Real-derived `det plan` now passes** on the committed revision-pinned #18 `PageStructure` (root `245:2`, provider revision `2417494580183108397`) with the repaired registry: **exit 0, 12/12 sections, `coverage.total = 0`, 0 diagnostics, byte-identical across runs** — every section honestly `unmapped`; no auto-binding was fabricated. Committed sanitized evidence: `evidence/issue-54/live-plan-verified/` (+ tool-run).
- **Gate:** `npm test` **180/180** (179 + new REG-09 which re-runs this exact acceptance in CI); Studio 216 tests / typecheck / lint / production build green.
- **Boundaries honored:** read-only Magento inspections only; no Figma reads/writes; no CMS/DB writes; no mapping/editability/visual claim — the remaining gaps (zero proven bindings, unaudited prop types, chrome discovered-only) are listed explicitly in the receipt §6.
- **NEXT:** Coordinator/Owner review the Draft PR (repair diff + receipt + evidence; rerun commands in receipt §10) → merge decision. The next product step after merge is separately scoped **structural mapping/binding work for the 12 live sections**; G3/CMS remains gated as before. Refresh live GitHub before acting on older dated checkpoints below.

## HISTORICAL CHECKPOINT — 2026-11-10 — #18 LIVE PROOF PASS; PR #21 MERGED AS `8aaaf2e` (superseded by [54] checkpoint above)

- **#18 live read-only proof EXECUTED and PASSED** on PR #21 branch `task/18-figma-live-readonly-pilot` (reconciled with `main` @ `1cc90b5`, gate **179/179**): bounded single-GET extract of Desktop root `245:2` (file `vNPtfBRpYM3PsExirVqhmt`) under the recorded Owner GO — revision pinned `2417494580183108397`, **337/337 nodes accounted** (92 SITE chrome excluded with reason, 168 MAPPED into **12 planned sections**, 28 instances honest custom-required NEEDS_REVIEW, 49 decoration-merged), two runs byte-stable (`volatileContentHash` equal). Gate status **`LIVE_FIGMA_READ_ONLY_VERIFIED`** (receipt §8); sanitized evidence committed — no token, no raw provider dump.
- **Boundaries:** no Figma writes, no `245:16`, no CMS/DB/storefront writes; stop at plan; G3/CMS remains separately gated.
- **Known pre-existing defect (on `main`, not this PR):** `examples/converter/capability-registry.magento-pagebuilder.example.json` fails `validateRegistry` (61× registered-without-config-declaration-evidence) — live `det plan` resolution deferred until that registry is repaired; the extract→plan chain is proven offline (G2-T31f).
- **NEXT (completed 2026-11-10):** PR #21 merged to `main` as `8aaaf2e015462a5f7154d3c00999428bcbbedec6`; the registry-evidence follow-up is handled by [54] (checkpoint above).


## MERGED INTEGRATION CHECKPOINT — 2026-11-09 — [23] + [25]

- **Owner explicitly approved merge**. Integration [PR #27](https://github.com/thanhle74/design-engineering-toolkit/pull/27) **MERGED to `main`** (merge commit `d256682450e10419fe94a2999f82495e957769d2`). It includes **[23] G3 Hero / PR #24** (`837a1fe`), **[25] G4 Craftsmanship / PR #26** (`5057b5e`) and **docs PR #20**. GitHub also marked source PRs **#20, #24, #26 merged** because their exact commits are in the integration ancestry. DO NOT re-merge them, re-run their POCs or overwrite the integrated source with older branches.
- **Combined source quality:** one `det compose` adapter with two bounded Page Builder shapes (native Hero Banner and native Row → 2 Columns → Text/Images); both native `data-pb-style` corrections preserved: G3 poster overlay `min-height` and G4 column 6/12 widths/flex layout. Integrated PR #27 head `9a15db7` had `contracts` **SUCCESS ×2**. **Merged-main CI is a separate gate**; confirm actual `main` check result for merge commit `d256682` (it was running at this checkpoint), do not misstate pending CI as PASS.
- **Magento LOCAL owner verification:** corrected disposable G3 CMS page **41** rendered in Admin and Owner confirmed Save→Reload persisted the Hero; corrected G4 CMS page **40** showed columns **6/12 + 6/12** (no NaN), and Owner confirmed content preserved after Save→Reload. Storefront and service-layer checks reported separately in Issues. POC acceptance is **structural/native/editable**, NOT visual pixel fidelity or Magento business/data integration. Non-blocking fidelity gaps remain documented.
- **Product policy remains:** two distinct outputs — native CMS-editable **Page Builder** and UI-only **Hyvä PHTML/Tailwind/CSP-safe Alpine** (backend wiring by developers); use **one independent DET Preview Theme** to render/test generated UI/CSS, never write into a customer's Hyvä child theme or create a theme per conversion. **Preview Theme and PHTML converter are future separately scoped implementation work, not part of #27.** Keep all licensed Hyvä UI source within authorized local installations.
- **Integration follow-through:** [23] closed by GitHub's integration; [25] can close once merged-main CI is checked. Leave unrelated **PR #21** Figma REST pilot (live token not proven) and **PR #22** KB scanner separate/unmerged. For every later task, refresh live GitHub PRs/issues/CI rather than relying on this dated note; use real issue-number prefix `[N]` for issue/Orca task names.

---

## LATEST OWNER PRODUCT DECISION & LIVE-REF CHECKPOINT — 2026-11-09

**OWNER CORRECTION (2026-11-09) — INDEPENDENT DET PREVIEW THEME:** For both output paths, all converter-generated visual CSS and PHTML should be **developed and tested in one toolkit-owned isolated `DET Preview Theme`**, **NOT in the customer's active Hyvä child theme**. The preview theme can extend the licensed Hyvä base; “independent” means independent from client-theme code and local theme configuration, not a license-free substitute for Hyvä. **Page Builder output = native editable CMS content + optional portable `det-*`-scoped Tailwind/CSS/asset bundle**. Structural/editable Page Builder fields and `data-pb-style` stay native, never forced through theme CSS. **PHTML output = frontend-only `.phtml` + Tailwind + CSP-safe Alpine** in that same preview theme, mock/data contract, no Magento BE logic. Developer manually ports selected files into the actual target theme and wires BE. Never modify a client's theme, write directly into its Tailwind config, change its assigned theme, or regenerate a new theme per conversion. This supersedes prior advice to target the existing customer child theme. It is a spec/handoff decision only; do not implement new preview-theme work until separately scoped after the two Page Builder POCs. See [Product Specs — Owner correction](PRODUCT-ARCHITECTURE-AND-SCOPE.md).



**Authoritative product scope:** [PRODUCT-ARCHITECTURE-AND-SCOPE.md](PRODUCT-ARCHITECTURE-AND-SCOPE.md), section **“Owner decision — 2026-11-09: two DISTINCT deliverables”**. Owner approves two **separate OUTPUT CONTRACTS**:

1. **Figma → Native Page Builder** for CMS/editorial: native content types, merchant editability, real Admin Edit→Save→Reload→Storefront proof. Current priority: close and integrate existing two POCs.
2. **Figma → Hyvä PHTML frontend-only** for PLP/PDP/theme UI: generate minimal `.phtml` (and only necessary small supporting assets) using **installed Hyvä UI + Tailwind + CSP-safe Alpine.js**; visually faithful desktop/mobile, responsive, real Hyvä render, presentational interactions. **NO Magento BE/domain logic, no modules, repositories, providers, product queries, pricing/stock/cart/search integration**. Use explicitly labeled mock/demo data and a small data contract for Magento devs to connect. **PLP first PHTML POC, then PDP**, only after separately scoped implementation GO. Do not make Theme/PHTML a full backend-powered page generator or split into many trivial files.
3. **Acceptance is distinct:** Page Builder requires native Admin persistence; PHTML passes for **UI frontend quality**, while commerce functionality stays `INTEGRATION_PENDING` and belongs to developer. No false `FUNCTIONAL_PASS` for mocked PDP/PLP. Do not request Page Builder Admin round-trip for PHTML.

**GitHub actual state observed 2026-11-09 (refresh live before action):** `[23]` G3 Hero / Draft PR **#24** (unmerged) needs a bounded native `data-pb-style` fix for hero min-height persistence on Admin resave; follow-up documented in [Issue #23](https://github.com/thanhle74/design-engineering-toolkit/issues/23). `[25]` G4 Craftsmanship / Draft PR **#26** tip `5057b5e` (unmerged) corrected Admin `NaN/12` by native style-block keys, **CI SUCCESS ×2**; Owner screenshot verified Admin shows **6/12 + 6/12**. Owner-specific edit→Save→Reload content persistence is not separately proved by that screenshot. New disposable local CMS page **40** is the corrected sample; page 39 is the old shape. Draft PR **#20** holds lean product-spec updates, **#21** REST Figma adapter and **#22** local knowledge input are unmerged; #21 PAT/live REST proof not required for the MCP-observed structural POCs. **No PR merge or new issue implied by this handoff.** After finishing [23] correction and [25] final smoke confirmation, review exact tips and propose dependency-aware integration **#20 → #24 → #26** for Owner merge GO. Do not launch another framework/audit loop.

**Coordinator/worker communication:** issue, PR and Orca task names must start with **`[<real GitHub issue number>]`** (e.g. `[23]`, `[25]`), not `#`-less phase names; the Owner prefers **short Vietnamese** and one concrete next action. Read LIVE GitHub latest issue comments/PR head/CI; older dated checkpoints below are HISTORICAL and must not be mistaken for current prohibitions or work status. A local Orca worker does not start just because a GitHub comment exists.

---

## HISTORICAL CHECKPOINT — 2026-11-06 — #18 LIVE ADAPTER IMPLEMENTED (superseded by live proof on the PR)

## CURRENT CHECKPOINT — 2026-11-06 — #18 LIVE ADAPTER IMPLEMENTED; LIVE READ `BLOCKED_WITH_REASON: FIGMA_TOKEN_UNSET`

- **#18 [live pilot](https://github.com/thanhle74/design-engineering-toolkit/issues/18):** the bounded read-only live design-source adapter `design-source-figma-live` is implemented on branch `task/18-figma-live-readonly-pilot` (Draft PR, one workspace). It sits behind the unchanged #14 `DesignSourcePort`/snapshot seam (no core/schema changes): provider token only from env `FIGMA_TOKEN` (fail closed when missing), profile `scopes.include` gates the approvable roots at the transport, revision pin required from the provider version token (else fail closed), 32 MiB response cap, 100 000-node budget, redirects never followed, no asset bytes or text content copied. Gate **102/102** (was 95 on merged main; +7 offline G2 checks T31a–T31g over a stubbed provider API — no network, no credentials, no committed provider identifiers).
- **Live read of `245:2` NOT executed:** the single attempt failed closed exactly as designed — exit 3, zero artifacts, terminal-only stderr naming `FIGMA_TOKEN_UNSET`; sanitized envelope at `evidence/issue-18/live-read-blocked.tool-run.json`. Per the Owner's rule this is **`BLOCKED_WITH_REASON`, not `LIVE_FIGMA_READ_ONLY_VERIFIED`**. Receipt: `docs/converter/RECEIPT-ISSUE18-G2-LIVE.md` (ADR-018-001..006 + the exact re-run command).
- **Single unblock action (Owner):** provision a read-only provider token as `FIGMA_TOKEN` in the execution environment, then re-run the receipt §3 command; on success the revision-pinned `NodeIR/PageStructure/SourceReview` + sanitized mapping inventory complete the proof on the same branch/PR. No token ever enters the repo.
- **Boundaries unchanged:** no Figma writes, no `245:16`, no CMS/DB writes, stop at plan; G3 remains separately gated. #19 stays `BLOCKED_LOCAL_SOURCE_NOT_MOUNTED` (untouched here).

---

## LIVE READ-ONLY GO CHECKPOINT — 2026-11-04 — #18 #19

- **Owner GO received** explicitly for live read-only #18 and M4 read-only #19, recorded in their issue comments. Does **not** authorize Figma Code Connect edits, any design write, Magento/CMS/DB/prod write, commercial-source redistribution or G3.
- **#18 [live pilot](https://github.com/thanhle74/design-engineering-toolkit/issues/18):** direct connected Figma read-only `get_metadata` for selected Design Desktop root `245:2` succeeded: root `PAGE/Home/Desktop` 1440×9891; **162 exposed XML nodes / 162 unique IDs** (61 frames, 59 texts, 30 instances, 12 rounded rectangles); 15 top-level frames = 3 SITE chrome containers + 12 SECTION frames. This is **metadata-only partial source evidence**, with **no revision pin or complete source transport**, not `LIVE_FIGMA_READ_ONLY_VERIFIED`. Code Connect asked for mapping; no mappings written, as outside read-only grant. Full Figma adapter, complete revision-pinned NodeIR/PageStructure/plan and source reconciliation remain task scope. Branch: `task/18-figma-live-readonly-pilot`; no code in branch yet.
- **#19 [M4 KB real source](https://github.com/thanhle74/design-engineering-toolkit/issues/19):** read-only Owner GO-2 recorded, but current Coordinator tools **cannot access user's local Fedora Magento/Hyvä source roots**. Status `BLOCKED_LOCAL_SOURCE_NOT_MOUNTED` for real corpus. Locally authorized coding agent may use explicit root aliases and metadata-only licensed adapter, local gitignored corpus, sanitised proof. No false claim of M4 real-source validation. Branch: `task/19-m4-magento-hyva-kb-ingest`; no code in branch yet.
- Both branches are isolated and prepared for local Orca/Claude Code execution. **No workers are running from this ChatGPT session**. Workers must read this handoff and the respective issue/GO comments, implement/test/post receipt in one PR each, avoid duplicate engine work, and integrate sequentially if touching shared files. Naming `[18]` and `[19]`.
- Once both gates are source-verified, separately scope G3 isolated Magento Page Builder serializer + Admin edit/save/reload. G3 NOT authorized.

---

## NEXT EXECUTION TRACKS — 2026-11-04 — LIVE READ-ONLY GATES AWAITING OWNER GO

- **[#18](https://github.com/thanhle74/design-engineering-toolkit/issues/18)** `[18] G2 — Live Figma read-only extraction pilot (245:2)`: existing #14 `DesignSourcePort`/snapshot → live read-only provider adapter → one selected real frame only → `NodeIR` / `SourceReview` / `PageStructure` / `det plan` + unresolved map. **Gate `AWAITING_OWNER_GO_LIVE_FIGMA_READ_ONLY`.** No Figma read or write until exact Owner GO; no mobile `245:16`, CMS/DB work or visual acceptance.
- **[#19](https://github.com/thanhle74/design-engineering-toolkit/issues/19)** `[19] M4 — Read-only Magento + Hyvä UI real-source Knowledge ingestion`: owners' approved local Magento/Hyvä/Secomm_UiWidget/native Page Builder source roots only → reuse #15 `det kb` + metadata-only commercial guard → locally scoped private evidence-backed KB1/KB2/KB3. **Gate `AWAITING_OWNER_GO_2_M4_REAL_SOURCES`.** Never publish licensed/private code or client material; no production writes.
- **Parallelism:** #18 and #19 have separate integrator branches/workspaces; review source+CI independently, integrate sequentially if shared CLI/schema surfaces touched. No duplicate engine/research work, no new tasks for G3 before these real-source gates reveal actual mapping gaps. Issue/PR/Orca prefixes must match actual number.
- **Owner approval needed to begin reads:** explicit `GO READ-ONLY #18 #19` (scoped to the current known selected desktop frame and locally authorized Magento/Hyvä sources, no source modifications). G3 CMS import still separately gated.

---

## CURRENT COORDINATOR CHECKPOINT — 2026-11-04 — #14 + #15 INTEGRATED INTO MAIN

> **Live GitHub is the authority.** Both tasks are integrated as **SYNTHETIC GATES** only. Do not confuse code/fixture proof with real Figma/Hyvä ingestion or Magento Admin proof.

- **#14 G2 structural extraction:** [PR #16](https://github.com/thanhle74/design-engineering-toolkit/pull/16) **MERGED** to `main` via normal Git merge `fc6d9c5d39f4ffb49e94f999f390bee8b54eb502`. Source-reviewed C1/C1-final fix prevents ambiguous `SITE/` ownership from being silently excluded or promoted to mapped; 66/66 standalone CI/receipt. Provides `det extract`, `NodeIR`, `PageStructure`, `SourceReview`, bounded synthetic design-source adapter, tests. **No connected/live Figma read**; no source writes or CMS import.
- **#15 Knowledge Engine MVP:** [PR #17](https://github.com/thanhle74/design-engineering-toolkit/pull/17) **MERGED** via normal Git merge `a1536030d8c458fc5d95c3bbe721543de34fdb34`. Independent source review closed query safety K1 + foreign-project metadata K2. `det kb ingest|sync|query|validate`, three logical KBs (Platform, UI, Project), JSONL/schemas, evidence/provenance/isolated query, synthetic 37-record corpus. **No live Hyvä UI/Magento/client-doc corpus has been ingested**; licensed/private materials remain local and require separate bounded GO.
- **Sequential integration detail:** On top of #14 merged `main`, reconstructed one **two-parent Git merge commit** `ab8e4ed47c540297848d8f67490e3c8af9e0fcb3` on #15's original PR branch, preserving both branches, all unique G2/KB code and reconciling 11 shared CLI/schema/docs/test-runner files without force-push. Exact-tip GitHub CI `contracts` **SUCCESS ×2**, full **95/95 checks passed** (51 baseline + 15 G2 + 29 KB); both `det extract` and `det kb` confirmed in the merged tree. No retest loop is needed unless a new regression occurs.
- **Integration/closure verified:** `contracts` CI **SUCCESS** on both the #15 merged `main` SHA `a1536030d8c458fc5d95c3bbe721543de34fdb34` and handoff checkpoint `c7653bfaabc15f623eff76f4ebbc01c870027a34`. **Issues [#14](https://github.com/thanhle74/design-engineering-toolkit/issues/14) and [#15](https://github.com/thanhle74/design-engineering-toolkit/issues/15) CLOSED / COMPLETED**, with final closure receipts. Next product milestone is **live read-only source validation** (Figma frame `245:2`, Magento/Hyvä project-source knowledge with commercial metadata-only controls) under exact Owner GO, followed by separately gated **G3 isolated Page Builder serializer/import with Admin Edit→Save→Reload**, then G4 visual QA. No automatic Figma writing, Magento CMS/DB writing, theme generation or production changes.
- **Naming invariant:** Issue, PR and Orca task names start with the *real GitHub issue number*: `[14]`, `[15]`, `[N]` — never feature-only prefixes such as `[G2]` or `[KB-MVP]`.

---

## CURRENT COORDINATOR CHECKPOINT — 2026-11-03 — G2 #14 SYNTHETIC IMPLEMENTATION POSTED FOR REVIEW

- **Issue [#14](https://github.com/thanhle74/design-engineering-toolkit/issues/14) G2 synthetic implementation is POSTED, NOT yet accepted.** One integrator commit `6816c6f` on branch `thanhle74/g2-figma-read-only-structural-extraction-nodeir`, Draft PR [#16](https://github.com/thanhle74/design-engineering-toolkit/pull/16) → `main`. Receipt: `docs/converter/RECEIPT-ISSUE14-G2.md` + ADR-014-001…009. Gate **64/64** (51 unchanged #9 checks + 13 G2 checks). Status class: `SYNTHETIC_G2_PASS` **only** — `LIVE_FIGMA_READ_ONLY_VERIFIED` is **NOT claimed**; no live design-tool access happened, `245:2`/`245:16` untouched, no CMS/DB writes.
- **Delivered:** `NodeIR`/`PageStructure`/`SourceReview` materialized (converter family 1.1.0, additive, closed diagnostic registry untouched); `det extract` with caller-selected root only; typed `DesignSourcePort` stays an interface (snapshot is transport, ADR-014-002); combined-evidence classification with every-node accountability; `det plan` additively accepts real `PageStructure` (G1 harness retained → 51 #9 tests unchanged).
- **Coordinator corrections C1 + C1-final APPLIED (2026-11-04):** (1) top-level `SITE/` chrome requires container evidence — label alone never excludes; spoofed SITE/-labelled non-containers stay `NEEDS_REVIEW`/retained (tip `39d9b42`, G2-T29, ADR-014-010); (2) a capability binding never promotes ambiguous ownership to `MAPPED` — bound spoofed instances stay `NEEDS_REVIEW` with provisional capabilities reported, while the same def+binding still maps valid editorial instances (tip **`1f881c4`**, G2-T30, ADR-014-011). Gate **66/66**, CI `contracts` SUCCESS on `1f881c4`, receipts posted on issue #14.
- **NEXT for the Coordinator:** re-review exact tip `1f881c4`, then ACCEPT/CORRECTION_REQUIRED on issue #14; coordinate **sequential integration with PR #17 (`det kb`, issue #15)** — shared surfaces (`args.ts`, `main.ts`, `run-envelope.ts`, `schema-registry.ts`, `tool-run.schema.json`, `tests/run-all.mjs`, AGENTS/skill/CI) must reconcile preserving BOTH `det extract` and `det kb`, both schema families, combined gate 51 + 14 G2 + 28 KB checks; normal merge only, no force/rewrite; merge itself under the project's merge authority (explicit Owner GO). A live read-only provider (e.g. the reserved `245:2` read) remains a separate exact Owner GO — the seam is prepared (ADR-014-002/008), no live adapter ships here.

---

## PREVIOUS TRACKED EXECUTION — G2 Issue #14 (2026-11-03)

**Task:** [#14 G2 Figma read-only structural extraction → NodeIR / PageStructure](https://github.com/thanhle74/design-engineering-toolkit/issues/14). This issue has a full scoped contract and test plan and is **READY_FOR_SYNTHETIC_IMPLEMENTATION**. First develop schemas/ports/semantic extraction and deterministic synthetic tests on #9 CLI. **Live Figma read of `245:2` requires explicit separate Owner GO**; no Figma rename, CMS/DB write, G3 importer or claim of live runtime proof. Reuse source fixture and latest Figma naming receipt (61 names), do not restart #5/#7/#9.

---

## CURRENT COORDINATOR CHECKPOINT — 2026-11-03 — #9 CLI-FIRST MERGED/ACCEPTED

> This **current** checkpoint supersedes the older dated #9 `CORRECTION_REQUIRED` section below. For any future status, fetch live GitHub Issues/PRs/CI first; a dated handoff is a locator, not a runtime truth.

- **Issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) — CLI-first milestone REVIEW ACCEPTED and integrated.** [PR #13](https://github.com/thanhle74/design-engineering-toolkit/pull/13) merged into `main` as `5137893e67e76d8ea60bb14628552bd45d3925b2`, preserving the corrected tip `8d3e1ea88e2fe30925f9eafd3d649d6b15177f97` and prior main ancestry. The exact merged commit's [`contracts` CI run 41606269272](https://github.com/thanhle74/design-engineering-toolkit/actions/runs/41606269272) was **SUCCESS**; both exact-tip PR CI runs also SUCCESS. Worker 51/51 test receipt is source-correlated to `tests/cli-suite.mjs` T-19..T-22 and prior G1 tests.
- **Coordinator independently reviewed correction F1–F4**, [final review comment](https://github.com/thanhle74/design-engineering-toolkit/issues/9#issuecomment-6599256843): receipt/exit honesty, guarded read-only realpath and symlink-escape checks, project identity fail-closed, bounded adapter streams/stderr handling and entry traversal rejection. Runtime `permissions.readOnly` is declarative, **NOT** an OS sandbox; no live CMS/Admin proof exists.
- **What actually runs:** TypeScript/Node `det validate`, `det inspect`, `det plan`; platform-neutral deterministic core, versioned converter/CLI schemas, out-of-process read-only Magento Page Builder adapter, synthetic Magento-like and non-Magento fixture tests, Claude Code skill calling the same CLI. Live Magento audit receipt records **78 declared capabilities** on a local checkout, `registered` ceiling with `NOT_VERIFIED` semantics; these are not runtime-certified widgets.
- **Not done and not authorized by this merge:** G2 Figma design-tree extraction into `NodeIR/PageStructure`, G3 isolated Magento CMS importer with true Admin Edit→Save→Reload evidence, G4 visual QA. No Theme/PLP/PDP/Header output, no FE, and no production modifications. Existing Figma `245:2` desktop layer-only normalization already happened (61 names) and **must not be rerun**; mobile `245:16` has not been renamed.
- **NEXT single major milestone — G2 READ-ONLY Figma structural extraction**: connect the existing `det` pipeline to a Figma subtree source, create stable source identity and semantics under the existing `PAGE/SITE/SECTION/SLOT/DECOR` naming *with structural verification*, retain Header/Footer as reported chrome and exclude them from Page Builder CMS plans, produce G2 `NodeIR` and a deterministic `PageStructure` fixture/report, never write Figma. Require separate exact Owner GO before any live connected Figma access; design/contract work may be prepared independently. G3/G4 require their own gates. One focused task and one integrator; do not restart #5/#7/#9 reviews.

**Compact status:** `#5=CLOSED_G1 | #7=CLOSED_SPEC | #9=CLI_MERGED_MAIN_5137893 | MERGED_CI=SUCCESS | NEXT=G2_FIGMA_READ_ONLY | FIGMA_WRITE=OFF | CMS_WRITE=OFF`.

---

## HISTORICAL #9 CHECKPOINT — 2026-11-03 — CLI IMPLEMENTED; CORRECTION_REQUIRED BEFORE MERGE

> **Live GitHub supersedes this snapshot.** [Issue #9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) remains OPEN; [Draft PR #13](https://github.com/thanhle74/design-engineering-toolkit/pull/13) at `0c3afecafa3a8f0f6c999e4ccbce82c647b6f597` contains a real TypeScript `det` CLI (`validate/inspect/plan`), out-of-process Magento Page Builder read-only capability adapter, `schemas/cli`, synthetic fixtures and Claude Code `det-cli` skill. Integrator receipt claims 44/44, and Coordinator independently verified exact-tip GitHub Actions `contracts=SUCCESS`. **No Figma extraction, CMS imports, Admin round-trip or storefront QA.**
>
> **Coordinator verdict: `CORRECTION_REQUIRED`**, consolidated in [Issue #9 comment 6596713837](https://github.com/thanhle74/design-engineering-toolkit/issues/9#issuecomment-6596713837). Four bounded source findings: (F1/P0) `emit.ts` persists false `wroteFiles` and fails to propagate output write errors into JSON/exit; (F2/P0) adapter path guard checks relative strings but does not stop symlink file/dir escapes or explicit metadata exclusion; (F3/P1) `plan` does not cross-check binding map/registry project identities; (F4/P1) child streams lack output byte caps, raw stderr and descriptor entry traversal risk, and PR #13 needs a normal merge/reconciliation with newer `main` handoff.
>
> **NEXT:** Existing #9 Claude Code Integrator implements **one correction pass** directly on the owning PR branch, adds deterministic regressions, runs `npm test` and posts a final BASE→TIP receipt + exact remote checks in the SAME Issue. Coordinator reviews that exact tip and only then ACCEPT/merge/close #9 for first CLI gate. **No new issue, no full #5/#7 audit, no autonomous Figma/DB write.** Main remains stable until #9 passes.
>
> **Integrator correction pass (this branch, after `main` merged normally): COMPLETE.** F1–F4 fixed with deterministic regressions T-19..T-22 (write-truth/exit propagation; symlink-escape rejection via one central path gateway + documented metadata exception; cross-project identity enforcement; bounded child streams, terminal-only stderr, entry-traversal rejection; `permissions.readOnly` documented as declarative, not OS sandbox). Gate now **51/51** (30 G1 + 21 CLI/adapter); live audit re-verified (78 caps, hash-identical runs, truthful `wroteFiles:true`). Exact tip and final BASE→TIP receipt are in the Issue #9 correction-receipt comment — that comment beats this file.

---

## NEWEST FIGMA NAMING CHECKPOINT — 2026-11-03 — DESKTOP FRAME 245:2 RENAMED

> **Actual connected Figma read/write evidence.** File key `vNPtfBRpYM3PsExirVqhmt`, Figma page `Home page — Luxury`, source frame ID `245:2`. User explicitly asked to normalize the tree once #5 completed. The Figma plugin read verified 331 descendants (97 FRAME, 102 TEXT, 40 INSTANCE, 28 RECTANGLE, 52 VECTOR, 12 ELLIPSE); then applied **61 label-only changes** after validating all expected old names. **Source IDs, ancestry, child order, top-level section count and all frame geometry matched before/after**. No component instances, text contents, fills, media, or styles were intentionally mutated. No CMS/DB changes.
>
> Named top-level children: `SITE/AnnouncementBar`, `SITE/Header`, `SECTION/Hero/Primary`, `SECTION/BrandStatement`, `SECTION/Hero/Secondary`, `SECTION/FeaturedCollections`, `SECTION/FeaturedProducts`, `SECTION/CampaignEditorial`, `SECTION/Lookbook`, `SECTION/EditorialMosaic`, `SECTION/Craftsmanship`, `SECTION/ThePeople`, `SECTION/ProductSpotlight`, `SECTION/Newsletter`, `SITE/Footer`; root renamed to `PAGE/Home/Desktop`. Selected safe normal FRAME descendants renamed `SLOT/...` or `DECOR/...`. Deep instance children, shared-library components and text remain unchanged. **This is partial scoped semantic naming, not a claim that all 331 layers have been standardized.**
>
> **Semantic contract:** The converter must inventory every descendant, exclude true site header/footer chrome from Page Builder (but retain them in report), and derive responsibilities using structural/capability evidence rather than trusting name prefixes alone. The normalized Figma source remains a design only, **not evidence of any executable Page Builder converter**. Next code task #9 is still the first real CLI milestone; do not treat this as a GO for G2/G3/Figma→CMS writes. File naming contract: [FIGMA-NODE-SEMANTICS-AND-NAMING.md](FIGMA-NODE-SEMANTICS-AND-NAMING.md).
>
> **Next-session rule:** Do not rerun the 61-name rename or assume the old `s_header`, `s_hero` layer labels exist. Re-read live Figma if working with `245:2`; use immutable node IDs and current source version. Do not rename mobile `245:16` automatically — it is a separate scope.

---

## CURRENT COORDINATOR CHECKPOINT — 2026-11-03 — #5/#7 FULLY INTEGRATED

> **CURRENT INTEGRATED TRUTH at this checkpoint.** This section supersedes older dated snapshots and stale PR/GO statements below. New sessions must still re-fetch live GitHub refs, Issue comments, CI and source before asserting status. This is not an authority to write to Figma, Magento CMS/DB or production.

**Accepted architecture and Git evidence:**
- **Issue [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5): CLOSED/COMPLETED (G1 ONLY).** Reviewed 61 registered capabilities / 114 evidence locators; schema contracts/negative-case harness, 30/30 test receipt and two verified PASS CI check runs. [PR #11](https://github.com/thanhle74/design-engineering-toolkit/pull/11) MERGED into `main` at `c161fbc0c0d38cb7fa711a521b624380efe7b644`. Research [PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) CLOSED as **SUPERSEDED** after confirming that PR #11 included its source. **G2 Figma structural extraction, G3 Magento Admin round-trip, G4 visual parity NOT DONE.**
- **Issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7): CLOSED/COMPLETED (SPEC/ADR ONLY).** Reviewed three-KB contracts, evidence/policy, TypeScript/Node + JSON Schema 2020-12 + versioned JSONL/derived SQLite FTS5 direction. Clarified `neighborOf` across Page Builder vs developer-owned component classes and licensed free-text sanitization. [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) MERGED in ancestry via integration. **No executable knowledge store/ingestion/query exists yet; these are specs and draft schemas.**
- **Product/operations docs [PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8) MERGED in ancestry**, including modular architecture, Figma node naming, Page Builder-first scope, SEO Engine selective skills research and THIS handoff.
- **Integration [PR #12](https://github.com/thanhle74/design-engineering-toolkit/pull/12) MERGED** at exact `main` SHA `3d44bf3cb96ff229fd001c9edf07bd58e97c9836`. GitHub commit `contracts` CI **SUCCESS** on that integrated SHA and two SUCCESS checks on integration PR head `be5d7e4d`. README and AGENTS/CLAUDE were reconciled in **one integration**, not replaced by old V1 README.
- **Issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) remains OPEN BACKLOG (not executed).** Only clear next **code-facing deliverable**: real portable CLI/Core, schema validation, read-only capability inspection and deterministic mapping/report using #5 contracts and #7 ADR. Read-only synthetic/Magento-shaped fixture tests first; design extraction, CMS importer, Hyvä Theme and GUI are separate later gates.
- **Figma `245:2`/mobile `245:16`: unchanged / source frozen.** Future name-only normalization requires new, exact Owner GO and reviewed manifest; no automatic reads/writes under this integration. `magento-specs` MCP is optional local Claude Code support, not a CLI runtime dependency.

**NEXT for new Coordinator:** fetch LIVE `main`/CI and issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9), verify dependencies above are still integrated, read `specs/ISSUE-5-converter-architecture.md` + `schemas/converter/` and `specs/knowledge-foundation/` + `specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md`. Prepare #9 one coherent implementation contract reusing code/tests. **Do not relaunch #5/#7, open duplicate review Issues, or pretend current contract test harness is a production converter.** Start #9 implementation only under the Owner's separate authorized scope; no premature live Figma/Magento operations.

**Short status:** `#5=CLOSED_G1_IN_MAIN | #7=CLOSED_SPEC_IN_MAIN | PR11/PR10/PR8/PR12=MERGED | PR6=SUPERSEDED_CLOSED | MAIN@3d44bf3_CI_SUCCESS | #9=BACKLOG | FIGMA_WRITE=OFF | CMS_WRITE=OFF`.

---

## HISTORICAL COORDINATOR CHECKPOINT — 2026-11-03 ~11:17 ICT — #5/#7 SOURCE REVIEW ACCEPTED; PRs NOT MERGED

> **This newer checkpoint supersedes the older Issue #5/#7 status in §5/§9 below.** Live refs/Issue comments always take precedence; it does not authorize an integration merge, Figma access, Magento CMS/DB writes, or #9 execution.

**Confirmed GitHub review truth:**
- **Issue #5:** [Coordinator verdict `ACCEPT_ARCHITECTURE_G1`](https://github.com/thanhle74/design-engineering-toolkit/issues/5#issuecomment-6595394463), candidate **Draft PR #11** @ `7a2cbfde43f143dd0e7995c17146ebfdb87c3d62`, stacked on Draft PR #6. Two actual GitHub Actions `contracts` checks on this exact SHA **SUCCESS**; committed sample 61 capabilities/114 evidence locators, 30/30 test claim from integrator with CI corroboration. **Not** a running Figma extractor, importer, Admin round-trip or visual pass. G2–G4 HOLD. Magento local-source inventory not independently rerun.
- **Issue #7:** [Coordinator verdict `ACCEPT_ARCHITECTURE_SPEC_ONLY`](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6595395058), candidate **Draft PR #10**. Three-KB specs, tech ADR recommending **TypeScript/Node + JSON Schema 2020-12 + versioned JSONL/derived SQLite FTS5**. One bounded reviewer correction on the *same PR #10 branch* resolved cross-capability-class `mapsTo` vs `neighborOf` inconsistency and clarified that metadata-only schema fields do **not** by themselves prevent sensitive/licensed code from appearing in free text (must sanitize/test at ingest/export); last reviewer commit `5086efdf`. All four schema drafts parse as JSON; executable schema/KB CI remains a later implementation gate, not an invented PASS.
- **Draft PR #8** contains our own product scope, modular architecture, selective SEO architecture/skills learning, Figma node taxonomy and **this handoff**. **Draft PRs #6/#8/#10/#11 remain open/unmerged** as of this snapshot. Issues #5/#7 can remain open until approved integration.
- **Issue #9** is **BACKLOG/NO-GO** without explicit Owner approval. It must reuse #5/#7 contracts; first deliverable code is local CLI + pure registry/mapping/validation + synthetic fixtures. No FE/chat, no Theme output, no Figma writes.

**NEXT — one coherent integration decision:** under a **specific Owner GO MERGE ARCHITECTURE**, review and integrate **#11 as the aggregate #5 branch including #6** (close #6 as superseded after confirming content), then **#10** (resolve README/contract conflicts against merged #11), then **#8** (pure docs/handoff, rebase/reconcile current index/AGENTS navigation once). No duplicate PR merges and no force-push/overwriting parallel commits. Verify exact merged SHAs on `main` and update handoff/issue receipts. Only **after integrated contracts + separate GO #9** may implementation begin. Owner policy items #7 on private KB-3 material, Figma fileKey visibility and approval durability must be resolved before related real-source operations, not before all synthetic CLI work.

**Owner-facing short status format:** `#5=REVIEW_ACCEPTED_G1; #7=REVIEW_ACCEPTED_SPEC; #11/#10/#8=OPEN_DRAFT; NEXT=OWNER MERGE GO for reviewed architecture (no auto-merge); #9=BACKLOG.`

---

> **First checkpoint:** 2026-11-03 (Asia/Ho_Chi_Minh).  
> **Status:** DRAFT PR #8, branch `docs/pagebuilder-first-product-scope` — **NOT YET MERGED INTO `main`** as of this checkpoint. Re-fetch GitHub truth on each new session.  
> **Purpose:** durable restoration of **product intent, Owner working style, architecture, authority boundaries, outstanding tasks and exact next decisions** for the ChatGPT Coordinator. This is a **router + dated snapshot, not current Git/Orca/Figma truth**.  
> **Project:** [thanhle74/design-engineering-toolkit](https://github.com/thanhle74/design-engineering-toolkit).

## 0. THE NON-NEGOTIABLE RULE FOR A NEW SESSION

**Before answering a project-state or execution question:**

1. Read **THIS ENTIRE handoff first**, starting from the newest checkpoint. Read `AGENTS.md` and `CLAUDE.md` **from the branch on which they actually exist**; if they are in pending PR #6 and not `main`, say so. They do not magically exist on default branch.
2. **Inventory the live repository** (tree, `specs/`, schemas, profiles, docs, skills, code and CLI that *actually exist*), current branches and relevant pull requests. Don't claim the specs or code were read merely because a directory was listed.
3. Read the **current Issue bodies and LATEST comments**: [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) architecture, [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) knowledge foundation, [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) future CLI; inspect [PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6), [PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8), [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) and new PRs. **Live GitHub beats this dated status.**
4. Read the relevant **active normative specs**, in full for the task: [product architecture](PRODUCT-ARCHITECTURE-AND-SCOPE.md), [modular architecture](MODULAR-ARCHITECTURE-AND-ADAPTERS.md), [Figma semantics](FIGMA-NODE-SEMANTICS-AND-NAMING.md), and the code/spec/tech ADR delivered by #5 and #7 once verified. Search deeper audits and history only where the decision requires; **progressive disclosure**, not a costly ritual of reading every historical receipt.
5. Derive one **factual current checkpoint**: what is source-implemented, spec-only, review pending, unverified, blocked, and which actor/authorization is needed next. **Never infer a local Orca worker is running from an open GitHub Issue or from past chat.** Ask Owner to relay a result only if no connected tool can obtain it.
6. **Respond in short, clear Vietnamese**: actual outcome → real blocker (if any) → ONE next action/actor. For a short `.` or `done`, refresh GitHub and review the actual new receipt; do not deliver stale generic guidance. If a protected Owner GO is needed, name exactly which action and why; no micro-GOs for work already authorized.

If this handoff is only in Draft PR #8, **do not claim it is available on `main`**. If GitHub is inaccessible, disclose the blocker and do not fabricate repo state. This file confers NO Figma-write, CMS/DB, production, merge or agent-run permission.

## 1. Owner working contract — permanent

- **Role split:** ChatGPT = proactive **Senior Architect / Coordinator / Independent Source & Evidence Reviewer**. Owner = product priorities and protected decisions. **Orca / Claude Code AI Coding = implementer/operator** in its selected task workspace. Coordinator should use connected GitHub tools for safe direct research, specs, comments, PR review and authorized actions, not transfer simple tool actions back to Owner.
- **Outcome-first, autonomous within scope:** Understand the complete problem, existing code/components, relevant docs and acceptance criteria BEFORE delegation. Favor one coherent task contract and full-system root-cause analysis over endless tiny fixes, repeated prompts, unproductive audit loops or serial "almost done" claims. AI Coding may correct in-scope issues and rerun focused tests without seeking new approval at every line.
- **Evidence over assertions:** distinguish `SPECIFIED`, `IMPLEMENTED`, `TESTED`, `ADMIN_ROUNDTRIP_VERIFIED`, `VISUALLY_VERIFIED`, `MERGED` and `LIVE`. A screenshot, generated fixture, a green unit test or a Markdown receipt is not proof of full Magento Admin editability or deployment. Review the current diff, exact source/ref, actual tests and system consequences; never echo implementer PASS as independent acceptance.
- **GitHub as work SSOT:** Issue = task scope; latest append-only comments = progress/receipt/approved changes; branch/PR = reviewable implementation. One issue → one Orca task/workspace where practical. Issue label format **`[<GitHub issue number>] <short title>`**; `[5]` means Issue #5, not phase 5. Owner prefers fewer issues and one integrator per overlapping file/contract.
- **Parallel when safe:** Multiple read-only scoped workers can research independently, ONE integrator writes shared files. No simultaneous writers to the same file/contract. No parallel "AI says PASS" without source-based reviewer.
- **Do not repeat answered questions:** User has already chosen product scope, role, output type, no GUI now, Page Builder first, client source portability and separate protected gates. Apply decisions rather than asking to reconfirm.
- **Communication:** Vietnamese, compact, direct (typically 2–5 meaningful lines for status), avoid lengthy generic reassurance or showy enthusiasm. When a detailed deliverable is needed, write it to GitHub Issue/spec and return its link + concise verdict. Do not overwhelm the Owner with model/token logistics, speculative sub-phases, long listicles or irrelevant explanations.
- **No false authority:** Review PASS is not Owner acceptance, acceptance is not merge permission, merge is not release or production permission. Do not autonomously merge open Draft PRs, deploy, mutate Figma, upload licensed Hyvä UI or create/delete active CMS content without explicit applicable GO.
- **Durable handoff discipline:** After material accepted architecture/workflow changes or a session switch, update the **newest checkpoint at the top** of this file and reference the exact issue/PR/commit. Retain true durable decisions; move old dated snapshots under a clearly marked **HISTORICAL** section, never let history overrule live Git. Avoid copying megabytes of issue logs into this handoff.

## 2. Product North Star and fixed scope

**Goal:** A reusable **Design Engineering Accelerator** which automates repetitive engineering work: scanning Magento/platform capabilities, inventorying licensed Hyvä UI components/variants/layouts/behavior, analyzing Figma tree/spacing/responsive semantics, matching capabilities, generating boilerplate/structured output, validating results and preserving reusable cross-project knowledge. **NOT to replace developers' judgment, solution ownership, architecture or business logic.**

Long-term exact pipeline:

```text
Requirements → Platform/UI Audit → Capability Registry → UX Architecture
→ Figma Design → Structural Mapping → Functional Round-trip → Visual Fidelity
```

**FIRST SHIPPABLE TARGET, DO NOT DILUTE:** approved **Figma → Magento Page Builder editable CMS pages/blocks** (Homepage, About, Landing, Campaign). Source designers/AI may later create Figma based on requirements + three KBs, but that is a separate later scope. **Hyvä Magento Theme output** for site chrome/system pages is also future-only. Never attempt the entire long-term pipeline as one MVP.

Exact Page Builder order:
```text
Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity
```

**Scope separation:**

| Responsibility | Primary owner | Current status |
|---|---|---|
| Header, Footer, site Navigation, PLP, PDP, Search, Cart, system pages | **Magento Hyvä Theme**: layout XML, PHTML, Tailwind CSS v4, CSP-safe Alpine.js | **FUTURE Theme adapter**, NOT Page Builder task |
| Homepage, Landing, About, campaign/editorial structure | **Magento Page Builder**: native content types/appearances + proven widgets | **FIRST target** |
| Business logic, providers, actual product/prices/stock, data APIs | Magento core/modules | Existing capabilities reusable; implement a new module ONLY for proven gaps |
| Licensed `Hyvä UI` library | UI component inventory, tested variants, CSS/Alpine behavior | Audit via metadata/authorized source; not synonymous with Secomm_UiWidget or native PB |

A CMS Homepage may embed **dynamic Magento Product widgets**, but Page Builder owns editorial composition, not catalog backend logic.

**Do not make a CMS Data Patch the default way to create/update merchant-edited pages.** The **later** importer should be explicit `dry-run → diff → preview → approved import → verify → rollback`, idempotent and protective of merchant edits. Use disposable local CMS target first, never active Homepage or production without separate GO.

**No "visual-only" false success:** mock media/copy/layout can be used for isolated QA with explicit `MOCK_CONTENT`, `DATA_PROVIDER_PENDING`, `VISUAL_ONLY`. Never represent fake price/stock/wishlist/cart behavior as production functionality. Page Builder requires editable **master-format** content and eventually a real **Admin Edit → Save → Reload → Storefront** receipt, not raw Figma JSON/static screenshot HTML.

## 3. Figma structural naming and semantics

- Figma file is a **structured node tree** (DOCUMENT → CANVAS/Page → nested FRAME/GROUP/COMPONENT/INSTANCE/TEXT/etc.), not a directory or a screenshot. Read Auto Layout, geometry, constraints, nested order, tokens, variant/reference and media pointers where supported; preserve `fileKey + nodeId + sourceVersion` in normalized evidence. `node-id=245-2` in URL corresponds to `245:2` API node identity. **Node ID never renamed.**
- Node names are **editable semantic labels**. Proposed convention for future Figma creation and converter input: `PAGE/Home/Desktop`, `SITE/Header`, `SITE/Footer`, `SECTION/Hero/Primary`, `SECTION/FeaturedCollections`, `COMPONENT/ProductCard`, `SLOT/CTA`, `DECOR/...`. The Figma label is a **hint, not proof of behavior**. Component set/instance/variant API names may have consumers; avoid blind bulk rename.
- User supplies **one root approved Figma frame/node**. Tool inventories **all descendants**, including Header/Footer/hidden/decorations; resolves semantic ownership by evidence, not by names alone. In the **Page Builder** output it excludes true shared `THEME_CHROME` (Header, Footer, site Navigation) with reason; an editorial footer/local campaign CTA can remain CMS. Unknown classifications go to `NEEDS_REVIEW`, never silently dropped.
- Keep source `245:2` desktop and `245:16` mobile as **reserved future references**, not hardcoded in generic Core. **Owner has proposed a later controlled rename-only pass for `245:2` AFTER #5 completes and explicit GO.** First fetch tree, create old→new node manifest and check published component impact; only then apply approved NAME edits; verify IDs, hierarchy, layout and visual evidence unchanged. **No Figma access/write is authorized by this handoff.**
- Correct structure first: sections, full-bleed/container, nesting, 40/60 ratio, responsive order; CSS and pixel-perfect fidelity are subsequent gates. Do not let AI turn every drawing node into a Page Builder widget.

Read full details in [Figma naming contract](FIGMA-NODE-SEMANTICS-AND-NAMING.md) and [Product architecture §10–11](PRODUCT-ARCHITECTURE-AND-SCOPE.md).

## 4. Architecture, technology and execution model

**Owner choice:** **Modular Monolith + bounded pluggable adapters + contract-driven pipeline**; **one local executable CLI/library**, no custom FE/chat UI/SaaS/microservices now. AI Coding in **Claude Code within Orca or terminal** calls Toolkit Skills/CLI; a human terminal or CI can invoke the same deterministic code **without an AI agent**. Markdown and skills define rules and contracts, but are **not** the engine.

**Module responsibilities** (logical, not a directive to make empty packages): shared Core contracts/schema/provenance; project profile and source roots; one Capability Registry; semantic Figma IR/structural mapper; platform/UI/project knowledge; Magento Page Builder target adapter; diagnostics/QA; CLI; optional Claude-facing skills. Future separate Hyvä Theme adapter. **Core must not import Magento, Figma, Hyvä UI, Claude or vendor MCP SDKs**. Create an extension point only for a real variability axis; one concrete implementation can stay concrete.

**Three knowledge domains, NOT three mandatory databases:**
1. **Platform Knowledge:** Magento core/modules/features/data providers/Page Builder content types/appearances and actual enabled/configured runtime proof.
2. **UI Component Knowledge:** commercially licensed Hyvä UI upstream family/variants/Tailwind/Alpine + actual `Secomm_UiWidget` registry + native PB (three distinct sources, do not triple count).
3. **Project Knowledge:** client requirements, UX sections, goals, design system, approved decisions, acceptance criteria and project isolation.

Link `Requirement → UX intent → Platform/UI capability → proposed section/layout → approved design → implementation evidence`. Evidence statuses are distinct: installed ≠ enabled ≠ configured ≠ runtime-proven; semantic/editorial layout ≠ functioning business feature. No invention when source lacks support.

**Verified #7 Integrator *claims*, not yet Coordinator-accepted on this date:** 21 UiWidget components in DI registry, PB 2.2.6-p5 per-file declarations, tech ADR chooses TypeScript/Node + JSON Schema 2020-12, git-versioned JSONL + derived gitignored SQLite FTS5, out-of-process adapters and metadata-only licensed Hyvä. These are in [Issue #7 receipt](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6594001101) / [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) and **need independent source/spec review** before being stated as final accepted truth. Do not preempt that ADR by choosing Python or TS in chat; honor reviewed contract.

**`magento-specs` MCP:** Owner's **local Claude Code** reports an already-connected Magento specs MCP with Magento coding reference tools. On **that local machine**, first enumerate actual MCP tool APIs and scope before use; reuse the verified Magento/Hyvä/Page Builder patterns instead of reimplementing. This is an **OPTIONAL agent-side resource**. Portable Core/CLI tests must work when MCP, licensed Hyvä, Figma and Magento are absent; never invent MCP tool names, bundle vendor source or hardcode local secrets.

**Development-only source reference:** `/home/thanhle/Sites/Magento/slaunchpad` is current Owner's **local Magento checkout** for first adapter audit. **Never commit this as a default, hardcode it into Core/CLI or assume another developer owns this directory.** Accept `--project` or local profile/environment/explicit arguments; generic tests include a second non-Magento synthetic project. Follow least privilege and redact env.php, auth.json, API keys and private assets.

**Selected reusable standards from SEO Writer Engine:** [upstream architecture/skills review](../docs/research/seo-writer-engine-patterns-for-toolkit.md): bounded extension points, central capability authority, indexed specs/decisions, proportional cold-start, fast narrow tests/full final gate once, evidence receipt, append-only corrections and independent review. **Do NOT copy** SEO business pipeline, PostgreSQL/Next.js/cron/AI-provider routing, extensive outdated governance or whole agent frameworks without real need. Reconcile future skill work from #5 rather than duplicating it.

## 5. GitHub tasks and PRs — DATED 2026-11-03 snapshot, VERIFY LIVE

| Item | Dated observed state | Meaning / next guard |
|---|---|---|
| [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) | **OPEN, Owner reports Orca running**. [Draft PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) OPEN, not merged; has research/specs/AGENTS/skills evolution | **DO NOT interrupt or edit scope**. Await actual AI Coding receipt, read current branch/PR diff and test evidence; no claim of completion based on research PR. |
| [Issue #7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) | Owner reports "xong"; [Integratror completion receipt](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6594001101) says `READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW`; [Draft PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) OPEN/unmerged, spec-only | **Code not built**. Independently review spec/ADR, 8 open decisions and exact 21 widget evidence; merge only if independently accepted and authorized. Do not confuse ready for review with accepted. |
| [Draft PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8) | OPEN/unmerged cross-cutting product decisions & handoff on `docs/pagebuilder-first-product-scope` | Contains product scope, Figma node contract, modular boundaries, SEO selective-reuse research, THIS handoff. Integrate carefully after reviewing #5/#7 conflicts; don't overwrite their AGENTS/specs. |
| [Issue #9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) | OPEN **BACKLOG**, not executed | First executable CLI Engine task **after** #5/#7 architectures are reviewed/reconciled and Owner issues explicit GO. NO frontend/chat now. |
| [Slaunchpad #42](https://github.com/thanhle74/slaunchpad/issues/42) + [#32](https://github.com/thanhle74/slaunchpad/issues/32) | Prior Magento/Page Builder/Hyvä audit references | Reuse proven receipts; don't restart entire multi-day source audit. Magento test/runtime gates still require fresh local evidence for target versions. |

**Repo `main` at the start of this project was a V1 Figma-design docs/schemas package; it is NOT proven to contain a functional Page Builder converter.** All architecture specs on Draft PRs are **proposal or review state** until integrated. The current state of #5/#7/PRs can and will change; always recheck.

## 6. Coordinator execution / review protocol

**New task / issue creation:**
- Read the current repo tree and specs and check existing Issue owns the scope. Prefer **one existing issue and one bounded correction** over overlapping issue explosion. New issue only for a true separable deliverable/dependency and explicit Owner request.
- Contract first: source refs, exact input/output, architecture, files/ownership, acceptance gates, negative cases, source/licensing permissions, tests, evidence and what counts as DONE. One task with independent W-A/W-B/etc workers, single integrator when feasible.
- No unsupported hardcoded tokens, Figma node IDs, client paths or proprietary code. Avoid direct Magento/PB DB writes and fake UI behavior.

**When AI Coding says finished:**
1. Fetch **latest Issue comment/receipt**, actual branch + commit + PR. Read diff, impacted specs and tests; independently reproduce what can be reproduced via tools; identify actual remaining evidence and unknowns.
2. Classify `SOURCE_REVIEW_PASS` vs `SCHEMA_TEST_PASS` vs `LOCAL_E2E_PASS` vs `ADMIN_ROUNDTRIP_PASS` vs `VISUAL_QA_PASS`. Tests in mocks and isolated fixtures cannot certify real Admin operations.
3. Verdict in the SAME Issue: **ACCEPT / CORRECTION_REQUIRED / BLOCKED**, with exact evidence and one complete correction contract if needed. Avoid serial micro-findings and repeated full batteries.
4. Merge/close only when that action is explicitly authorized and the target has been verified; **no automatic merge of Draft PR**. Separate docs/spec agreement from runtime functionality and protected writes.
5. One final durable issue comment + optional dated handoff update. Keep answer to Owner short.

**Correct root cause, not surface:** If Figma layout mapping produces 50/50 for a 40/60 Auto Layout, prove the structural parser/mapping defect; fix common algorithm and regression fixture, not per-article/page CSS hacks. If native PB/custom widget is unsupported, output typed `GAP/UNKNOWN`, never claim working CMS from generated static HTML. Use `magento-specs` where verified, but actual installed source/runtime wins over generic reference docs.

**Security:** Figma source designs frozen (no writes until specific GO); no automatic Admin create/modify, active Homepage replace, Magento DB/production write, cloud upload, paid service or destructive Git; no commercial Hyvä UI source/assets repackaged. A scope-specific prior GO is not permission for the next stage.

## 7. What the NEXT new ChatGPT session must do — concrete plan

1. **Read the latest handoff at the actual ref where it exists**; confirm PR #8 branch vs `main`; open the product/modular/Figma specs and relevant #5/#7 contracts. Verify up-to-date Issue/PR status before announcing progress.
2. **If #7 ready:** independently assess PR #10's knowledge contracts, tech ADR, security/licensing of Hyvä metadata, input/trace correctness, portability and unresolved decisions, then report the **single true blocker or acceptance decision**. Do not tell Owner to rerun four workers.
3. **If #5 still active:** let the existing Orca task finish; do not create replacement issue or make unrequested Figma edits. If a receipt exists, review it and reconcile architecture with #7/#8.
4. **After #5/#7 review and proper integration:** prioritize executable **Issue #9** as the first code-facing milestone, with owner GO. Headless CLI, deterministic fixtures/contracts, one Magento PB adapter, a path-independent generic core. Do **NOT** start building a chat frontend, Theme output or full requirement-to-Figma workflow.
5. **Later only with a named separate approval:** read approved Figma frame `245:2`, propose rename manifest; actual label write after review. For source-to-CMS, structural mapping first, then isolated genuine Magento Admin round-trip, then visual fidelity. No production import.

**Default concise Owner-facing format:**  
`#7: <verified review state> | #5: <verified current state> | #8: <document integration state> | NEXT: <one concrete verified next action and actor>; #9: BACKLOG until GO.`

## 8. Documentation / handoff maintenance policy

- Keep durable **operating style and Product North Star** stable; append a **new dated snapshot at the TOP** whenever material state/Owner decision changes. Date old snapshots as historical and never treat an obsolete SHA/status as live.
- Every new reference is a verified GitHub issue/PR/path; note whether the file is in `main` or an unmerged branch. Do not claim that a Doc PR merged or Claude Code worker actually ran without evidence.
- When #5's `AGENTS.md` and `CLAUDE.md` are integrated, update their thin **Navigation** to link `specs/CHATGPT-COORDINATOR-HANDOFF.md` and an indexed spec router, once, avoiding concurrent file edits. If a new `specs/.index.md` exists from #7, add this file to its current-authority list **during reconciliation**, never overwrite someone else's index.
- Every significant acceptance/GO is recorded on the owning Issue as an append-only comment. Handoff is a locator of these contracts, not another competing authority.
- Remove/retire obsolete instructions by explicit supersession and source evidence, not silent history deletion.
- No requirement to ingest every archived file per session; read all **applicable current authoritative** specs thoroughly, use a directory tree to route historical evidence.
- Keep this file cross-client and portable. Never write credentials, API keys, customer PII, private Hyvä source, raw licensed media or local machine secrets.

---

## 9. One-line handoff for the next session (DATED; REVERIFY)

`#5=OPEN/OWNER_REPORTS_RUNNING | PR6=OPEN_DRAFT | #7=OWNER_SAYS_DONE/BUT_PR10=READY_FOR_REVIEW_UNMERGED | #8=OPEN_DRAFT_DOCS | #9=BACKLOG_NO_GO | FIRST_PRODUCT=FIGMA_TO_EDITABLE_MAGENTO_PAGEBUILDER | APP=CLI+CLAUDE_CODE_NO_FE | FIGMA_245:2=FROZEN_NO_WRITE | NEXT=REVIEW_LIVE_#7_AND_#5_EVIDENCE;_RECONCILE_SPECS;THEN_OWNER_GO_#9`

## 10. Starter instruction for any new session (current)

> You are the **ChatGPT Coordinator / Architect / Independent Reviewer** for `thanhle74/design-engineering-toolkit`. Read **this handoff on main**, `AGENTS.md`, `CLAUDE.md`, project product/modular/Figma specs, the converter contracts and `specs/knowledge-foundation/` contracts. Independently fetch LIVE GitHub main, latest Issue #9 and closed #5/#7 integration receipts, current PRs and CI. Do not confuse an old handoff snapshot or a Markdown contract with a working converter. #5 G1 and #7 specs are accepted and merged; next code task #9 is a **portable deterministic CLI via Claude Code/Orca, no FE**. First scope Figma→Magento Page Builder CMS; Header/PLP/PDP/Search Theme output and Requirements→Figma are later. Do not change frozen `245:2` Figma or Magento CMS/DB without explicit exact GO. Do not require me to restate my working style: plan full scope once, use GitHub Issue and limited parallel agents/single integrator, evidence-backed independent review, no micro-fix loops, concise Vietnamese outcome + next concrete action.
