# RECEIPT — Issue #74: DET Antigravity integration hardening (modular refactor + per-module `__tests__`)

- **Issue:** [thanhle74/design-engineering-toolkit#74](https://github.com/thanhle74/design-engineering-toolkit/issues/74) — Owner GO, single-pass autonomous execution, **Draft PR only, no self-merge**.
- **Base (pinned):** `5bf41d3aa3e81a6f547e9349d8ff763d9ee641b2` — verified identical to `origin/main` at start (fetched during phase 0; no reconcile needed) and never advanced during the pass.
- **Integration head at receipt:** branch `thanhle74/74-det-antigravity-integration-hardening-modular` — integration round `abc8288` (code `84e436b` + docs), then the Coordinator **CORRECTION_REQUIRED** round: code `7c7f8eb` + this docs commit (one branch, one Draft PR; exact pushed SHA in the PR comment).
- **Date:** 2026-11-16.
- **Execution model:** Integrator (this session) + four bounded parallel workers in separate worktrees from the same pinned SHA: **W-A** projects/API/service, **W-B** UI lanes + AG-011 row identity, **W-C** artifacts/ZIP/PHP installer, **W-D** read-only audit. Lane commits preserved verbatim; merged sequentially `--no-ff`; one integrator fix commit (`84e436b`) after live-data verification.

## 1. What shipped (behavior-preserving quality pass)

| Lane | Scope delivered | Branch head |
| --- | --- | --- |
| W-D | Read-only audit: AG-log claim audit, live-recounted test inventory, route→service map, missing-test ranking, live-verified curl baseline + browser smoke runbook, `scripts/proof/antigravity-refactor/verify-antigravity-claims.mjs` (15/15 checks at `5bf41d3`) | `74-wd` @ `41a44ae` |
| W-A | `project-store.ts` fail-closed (ENOENT-vs-corruption), atomic temp+rename writes, in-process mutex, explicit demo seed, typed 400/500 validation at server boundaries; 6 fat routes thinned behind server-only seams; 39 test moves + 10 new project-store tests | `74-wa` @ `7196329` |
| W-B | `mappingRowKeys()` fact-based stable row identity (occurrence index over UNFILTERED source) in mapping-review table + node-table + figma-tree; per-occurrence inspector binding; honest derived run statuses (4-state card, per-row compose tags, download/integrity truth); bounded extractions (tree-model, mapping-inspector, overview-status-card, install-guide-tabs, section-summary); 12 test moves + 27 new tests | `74-wb` @ `798f459` |
| W-C | zip-bundle hardening (traversal/duplicate/UTF-8/caps/symlink + determinism), installer gates-before-writes (explicit `--store-id` for non-default stores, `--force` overwrite policy, media containment, symlink refusal pre-copy, scoped cache disclosure), 2 test moves + 43 new tests | `74-wc` @ `20937fb` |
| Integrator | 4 lane merges, guard checks, **`84e436b`** composed-count correction (below), docs (AG-012, standard amendment, this receipt), full gates, browser smoke, PHP dry-run proof, PR | `84e436b` |

### Integrator fix on live data (`84e436b`)

W-B's `summarizeRunSections` derived "composed" from `elementCount > 0`. Against the real generated `build-72extended` run this rendered **"Đã ghép 11/12"** — wrong in both directions: detection counts elements that composition may skip (11 detected), and BrandStatement (elementCount 0, 3 mapped entries) would be mislabeled uncomposed. Ground truth from the run's own mappings: **exactly 5 sections carry ≥1 `mapped` entry** (Hero/Primary, BrandStatement, CampaignEditorial, Craftsmanship, Newsletter), 7 sections have only `skipped` entries — matching the #72 ledger. Fix: `composed = (dispositions.mapped ?? 0) > 0`; two test expectations updated to the corrected semantics (the 5/12 fixture test was already asserting the truth its fixture had been shaped to produce — now the derivation itself is right). Live re-verification: run page renders "Đã ghép 5/12 phân đoạn · 28 mục gap/bỏ/loại trừ" (amber card).

## 2. Test reorganization (issue-mandated `__tests__` rule)

- Before: **52** `*.test.ts(x)` outside `__tests__` (19 under `app/**`, 33 under `src/modules/studio/**`) + 9 inside; **61 files / 631 tests**.
- After: **0** test files outside `__tests__`; **67 files / 711 tests** (+80 new, +6 files; every original test preserved — `git mv` semantics, assertions byte-identical except documented import-path lines).
- Route tests moved to owning server-module `__tests__` importing the real route (HTTP contracts asserted unchanged); `app/agent/page.test.ts` → `agent/__tests__/agent-page.test.tsx` importing the real page module; standalone `.mjs` contract suites and `scripts/proof/**` untouched (not `*.test.ts`).
- Cross-lane touch disclosed: W-A moved `shared/contracts/agent-plan.test.ts`, forcing a one-line import fix in `agent/components/agent-plan-view.test.tsx` (W-B's file, which W-B then moved with the same fix — merge resolved cleanly).
- `docs/specs/NEXTJS-MODULAR-STANDARD.md` "Deviation kept on purpose" paragraph replaced by the **Owner override (#74, 2026-11-16)**: all `*.test.ts(x)` under touched modules live in their owning module's `__tests__/`.

## 3. Feature acceptance matrix — before/after (all preserved)

| Surface | Before `5bf41d3` | After `84e436b` | Evidence |
| --- | --- | --- | --- |
| `/` overview | 3 quick cards, recent runs, conversion form | unchanged (visual + behavior) | screenshot `home.png`, HTTP 200 |
| `/build` | 2-column form + presets + 6-step Steps | unchanged + preset label now "(12 sections, 5 composed · 7 skipped)" | screenshot `build.png`, HTTP 200 |
| `/catalog` | Card tabs, projects manager | unchanged; seeded project + 3 pages intact | HTTP 200, `/api/projects` assertion |
| `/runs/[runId]` | 5 tabs, quick downloads, ZIP button | unchanged layout; statuses now honest (amber partial, per-row compose tags) | screenshot `run.png`/`run-fixed.png`, HTTP 200 |
| Run API | 12 sections / 12 artifacts / preview unavailable | identical contract; diagnostics honest | `/api/runs/build-72extended` JSON |
| Project CRUD + pages | REST contracts incl. exact VN error strings | byte-identical responses (7 tests unchanged); infra failures now honest 500s | preserved route tests |
| ZIP download | 200 application/zip | same + `unzip -t` clean, 9/9 members byte-identical, deterministic sha256, UTF-8 names correct, traversal id → 400 | curl + unzip evidence |
| HTML copy | copy button + char count | same; enabled with real 5,657-char PageBuilder markup | screenshot `run-fixed.png` |
| PHP installer | dry-run + real-run features | same features + explicit store flag for store 5, `--force` overwrite policy, containment, scoped cache | dry-run plan JSON, `php -l` clean |
| Figma source gate / readiness | pinned-source + env gate | unchanged (#70 policy intact; no new auth) | environment API `ready:true` |

## 4. Root-cause fixes confirmed (not speculative)

1. **Destructive store reset** (`project-store.ts` old `loadProjects` catch-all → reseed): verified in base source, fixed fail-closed, regression-tested (corrupt JSON leaves file bytes untouched).
2. **ZIP security/interop**: live Info-ZIP CP437 mangling of UTF-8 names reproduced, then fixed (EFS bit + Unix made-by host); traversal names packable before, refused now; no caps before (UInt32 wrap >4 GiB), fail-closed caps now; unsorted `readdirSync` order, now deterministic (byte-identical repeat packs proven).
3. **Unstable row identity** (AG-011 half-fix): post-filter `idx++` confirmed in base source; keys now derived once from unfiltered source facts; duplicate-`nodeId` inspector mis-binding fixed; 15 regression tests.
4. **False "12 sections converted"**: AG-005/AG-008 claim verified FALSE against the committed fixture + live run (5/12 compose, 7 skipped entries, 21 gaps); UI no longer claims it; hardcoded per-row green and unconditional success card removed (tests assert their absence).
5. **Composed-count semantics** (`84e436b`): derived from mapped entries per ledger, verified against the real run (see §1).

## 5. AG-log audit verdicts (W-D, evidence in `docs/evidence/antigravity-refactor/ag-log-claim-audit.md`)

- AG-011's recorded SHA `2e21f11` is a **dangling pre-amend twin** of `5bf41d3` (resolves locally, on no branch, dead on fresh clone; the amend's only content change added the stale SHA into the log). Truthful SHA recorded in AG-012; original AG-011 entry left untouched (append-only ledger).
- AG-006/AG-007 duplicated headings confirmed byte-identical pairs — preserved as journal entries, documented in AG-012.
- AG-003/AG-006/AG-007/AG-010 AntD claims re-verified in code/tests; AG-008 "media thật" overstated (labeled offline placeholders — kept source-labeled, no false "real asset" claim).
- Gate claims re-counted live: `pnpm test` 201/201 (×2 runs), `test:studio` 631/631 at base.

## 6. Gates — baseline vs final (exact local runs; repo has NO CI)

| Gate | Baseline `5bf41d3` | Final `84e436b` |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 | exit 0 |
| `pnpm test` (core contracts) | **201/201**, exit 0 | **201/201**, exit 0 |
| `pnpm run test:studio` | **631/631** in 61 files, exit 0 | **711/711** in 67 files at `84e436b`; **715/715** at correction `7c7f8eb` (+4 symlink-refusal tests), exit 0 |
| `pnpm run typecheck` | exit 0 | exit 0 |
| `pnpm run lint` | exit 0 | exit 0 |
| `pnpm run build` | exit 0 (9 pre-existing Turbopack warnings) | exit 0 (same warnings) |
| `pnpm run format:check` | **exit 1 (red on pristine main — pre-existing)** | exit 1 (unchanged; repo-wide reformat deliberately out of scope) |
| foreign-cwd `node bin/det.js --help` | exit 0 | exit 0 |
| Stable artifact hashes | n/a | ZIP determinism byte-identical; media sha256 identical build→zip→extract (8 fixture JPGs) |
| ZIP unarchive sanity | n/a | `unzip -t` "No errors detected" ×2 bundles + live HTTP bundle |
| `php -l` + dry-run | n/a | `php -l` clean; `--dry-run --store-id=5` exit 0 with plan JSON + **zero file changes** (before/after listing diff empty); without flag → exit 1, nothing written. Re-proven at correction `7c7f8eb` on a freshly generated installer (32,266 B): `php -l` clean, dry-run exit 0, zero mutation |

Studio-suite flake disclosure: under heavy parallel load on this machine, `build-flow-orchestrator.test.ts` (and once `studio-catalog.test.ts`) can fail on CLI-driven 5 s timeouts / an `activeSnapshot()` slot-release race. W-C reproduced the orchestrator flake at pristine base (1/11 runs) and 3/3 green isolated at HEAD; receipt gates ran on a quiet box and were green (711/711). Pre-existing, not introduced by this pass.

## 7. Browser smoke (executed at `84e436b`, prod bundle, PORT=3100)

- Readiness `GET /api/environment` → `ready:true` (claudeCode 2.1.325, figmaMcp ok, detRunsDir ok).
- 8/8 curl assertions pass (runbook §4): pages 200; run listed `mode:live`; run detail 12 sections / 12 artifacts / preview honestly `unavailable` (no mock); ZIP 200 `application/zip` 1,201,461 B, `unzip -t` clean, 9 entries, zeroed timestamps; traversal run id → 400; seeded `slaunchpad-fashion` project with 3 pages.
- Headless Chrome screenshots (`--headless=new --virtual-time-budget=15000`, Wayland portal not used): `/`, `/build`, `/catalog`, `/runs/build-72extended` — preserved layouts; run page shows the honest amber status card "Hoàn tất — còn mục chưa ghép · Mã thoát 0 · Đã ghép 5/12 phân đoạn · 28 mục gap/bỏ/loại trừ" and the real 5,657-char PageBuilder HTML with enabled copy button. Files: `74-gates/shots/*.png` (session scratch; copied next to this receipt as `docs/evidence/antigravity-refactor/screenshots/`).
- **Slaunchpad live-Magento proof: BLOCKED, not PASS** — the magento-spec MCP server was unresponsive this session (30-min tool timeout, matching the known broken-MCP memory), so the isolated store-5 safety precondition could not be verified now; per the issue's own conditional and the #72 precedent this is recorded BLOCKED. Nothing touched any real Magento install, store 0, or the default homepage. Installer safety was instead proven end-to-end against the committed fake-Magento bootstrap fixture (§6).

## 8. Environment incidents (disclosed for the Coordinator)

- An external cleanup process repeatedly deleted worktrees under `.worktrees/` (and once branch refs) mid-flight — W-D twice, W-B twice (relocated to `.wb-lane/74-wb`), W-A twice, W-C once (recreated + redone), and wiped `/tmp/74-baseline` mid-gates (one gate rerun). Mitigations that held: lane branches live in the shared object store; periodic `refs/backup/74-*` ref snapshots every 2 min; W-B kept bundle backups in `/tmp`; all work was re-verified intact post-incident. No work was lost in the final state.
- Lane briefs forbade `docs/specs`, root configs, lockfile, `app/globals.css`, `resources/**` — enforced by a forbidden-path guard on the integrated diff after every merge: **clean**.

## 9. Known gaps / structural debt (truthful)

1. Orchestrator test flake (pre-existing; §6) — upstream timeout fix recommended.
2. Media copied into bundles by `build.ts` is **not registered in `build-manifest.json`** (frozen [70] role contract; a media role needs a separate schema change + registry gate). Byte-identity therefore proven directly (sha256 chain), not via manifest.
3. ZIP caps are first-cut constants (not env-configurable); entries carry zeroed mtimes (determinism by design).
4. `resetToDemoSeed()` exported, deliberately unwired to any route/UI.
5. Fake-Magento harness proves gate semantics on PHP 8.3 — not a live-Magento proof ([70] honesty doctrine unchanged; live store-5 Admin Save→Reload stays the authorized later step, currently BLOCKED).
6. Build-screen preset numbers are static, evidence-sourced labels (match the accepted #72 ledger; noted in code they can go stale if the pinned source changes).
7. PLP preset label "(Hyvä PHTML)" is preserved pre-existing copy naming the target page type — not a working PHTML build claim (Hyvä remains an unsupported adapter per issue scope D).
8. `format:check` remains red exactly as on pristine main (pre-existing formatting debt outside this pass's scope; whole-repo reformat would violate the "not just autoformatted whitespace" bound).

## 10. PR

One Draft PR from `thanhle74/74-det-antigravity-integration-hardening-modular` (correction round code head `7c7f8eb` + docs; integration round was `abc8288`, code `84e436b`) → `main`, left for independent Coordinator review. **Not merged by the agent.** No Figma writes, no production Magento/CMS/DB writes, no Hyvä source distribution, no self-approval.

## 11. Correction round — Coordinator CORRECTION_REQUIRED (C74-1 / C74-2, same PR)

The Coordinator's review at `e23715c` (**HOLD MERGE**) found two places where the W-C symlink hardening still sat on the wrong side of a trust boundary — both fixed here, bounded, no redesign; the move inventory and AG-012 ledger are untouched.

**C74-1 — ZIP bundle root/media-root followed symlinks** (`src/modules/studio/server/zip-bundle.ts`): `packRunBundleZip` used `stat()` for the five bundle ROOT files and the top-level `media/` root. `stat()` follows links, so a symlinked root file (e.g. `README.md → /outside/secret.txt`) packed the OUTSIDE target's bytes into the archive, and a symlinked `media/` root packed an entire outside tree — the entry-level Dirent guard only catches links met INSIDE the recursion. Fix: both checks now `lstat()` and refuse loudly (throw) before any read; child links inside the recursion stay skip-never-follow (unchanged).

**C74-2 — installer copied through destination symlinks before checking** (`render-cms-installer.ts`): (a) Gate 6 classified preexisting media destinations via `is_file()` — which FOLLOWS the link — and with `--force` the run `copy()`-ed THROUGH the link (overwriting its outside target), with the realpath containment check only running AFTER the destructive write; (b) a symlinked bundle media ROOT was invisible to the entry-level `isLink()` guard, so the iterator would silently walk an outside tree. Fix: new **Gate 6.5 destination preflight** walks EVERY media destination before the first `mkdir`/`copy`/CMS write and refuses symlinked destination files **even with `--force`** and symlinked destination ancestor directories ("Nothing was written; remove or replace the symlink(s) manually first"); Gate 2 refuses a symlinked media root on real runs; the dry-run validator refuses the media root and any child link with exit 1 before printing any plan.

**Negative tests (red/green proven):** 4 new tests — zip root-file symlink refusal, zip media-root symlink refusal, `C74-2a` destination symlink + `--force` (asserts outside sentinel bytes untouched, symlink still a link, NO partial copies of the clean sibling, save log empty), `C74-2b` symlinked media root (real run AND dry-run refuse, `pub/media` never created, save log empty). Red proof: with the two SOURCE files reverted to HEAD and the new tests kept, exactly those 4 fail (4 failed / 46 passed); green: 50/50. So each test demonstrably catches its pre-fix regression.

**Correction-round gates (all green):** `pnpm test` 201/201; `test:studio` 715/715 in 67 files; typecheck/lint/build exit 0; `format:check` exit 1 (pre-existing, by design); narrow suites 50/50; ZIP interop `unzip -t` "No errors detected" (7 entries, zeroed timestamps) + deterministic sha256; foreign-cwd `node bin/det.js` exit 0; freshly generated installer `php -l` clean + `--dry-run` exit 0 with **zero file mutation** (before/after diff empty). Prettier run on exactly the 4 touched files. Live isolated-Magento availability unchanged: **BLOCKED** (magento-spec MCP still unresponsive this session) — the §7 BLOCKED-not-PASS disclosure stands.
