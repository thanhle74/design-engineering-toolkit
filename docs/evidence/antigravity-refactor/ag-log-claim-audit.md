# AG log claim audit — Antigravity feature log vs real code (W-D)

- **Audited:** `docs/specs/ANTIGRAVITY-FEATURE-LOG.md` entries AG-001…AG-011 against code/artifacts at `5bf41d3aa3e81a6f547e9349d8ff763d9ee641b2`.
- **Verdict legend:** VERIFIED = claim true as written · PARTIAL = true core, overstated detail · FALSE = contradicted by evidence · JOURNAL-DEFECT = log hygiene issue (no code claim).
- Machine-checkable subset: `scripts/proof/antigravity-refactor/verify-antigravity-claims.mjs` (checks A1–A7).

## Structural journal defects (handle before any consolidation)

1. **AG-006 and AG-007 each appear TWICE.** Headings at lines 159 & 275 (AG-006) and 203 & 319 (AG-007); the two copies of each are byte-identical bodies. Entries also appear out of numeric order (…AG-004, AG-006, AG-007, AG-005, AG-006, AG-007, AG-008…). The log's own rule is "APPEND; do not overwrite earlier entries" — so the fix must be a **new appendix entry** (e.g. "AG-JOURNAL-HYGIENE: AG-006/AG-007 duplicated by a re-append; second copies are void; entry order is append-order, not numeric"), **not** an in-place rewrite or renumbering. References to AG ids elsewhere (this audit, future issue text) must treat each id as one logical entry.
2. **Self-referential SHA trap (AG-011).** The original AG-011 commit recorded `` `main` `` (no SHA); the subsequent `git commit --amend` **added the now-stale SHA into the log text**. Details below.

## Entry-by-entry

### AG-001 — Projects & multi-Figma page manager — VERIFIED (with one gap)
- **Claims checked:** modules/routes/components exist; `parseFigmaInput` validation on page add; 7 tests in `app/api/projects/route.test.ts`; `?source=` prefill on `/build`.
- **Reality:** all 4 API routes exist (`app/api/projects/**`), all 5 listed module files exist, `route.test.ts` exists, `catalog.screen.tsx` hosts the tab, `build.screen.tsx` reads `?source=` (bootstrap effect at `build.screen.tsx:166-186`). Gates claimed (201/201, 622/622→later 631/631) match the log's era and the current baseline.
- **Debt (not claimed by the log):** `src/modules/studio/projects/project-store.ts` has **no unit test file** and does a **non-atomic `writeFile`**; `loadProjects` swallows *every* read error and re-seeds DEFAULT_PROJECTS — a corrupt `projects-catalog.json` silently **destroys** user projects on next load (see `missing-tests.md` M1).
- **Branch claim `main`:** TRUE — reflog shows these commits landed on local `main` (`main@{4}` = `2acab69`) and `origin/main` is at `5bf41d3` today.

### AG-002 — Build step spinner/success icons — VERIFIED
- `stageStepIcon` exists (`src/modules/studio/build-control/components/build-pipeline.tsx:69`, green `#52c41a` / blue `#1677ff` as claimed); build-control lane covered by `build-flow-view.test.ts` (its "33 tests" claim era matches pre-AG-008 counts; current suite green).

### AG-003 — Modal `destroyOnClose` → `destroyOnHidden` — VERIFIED
- `grep destroyOnHidden` hits exactly `create-project-modal.tsx:64` and `add-page-modal.tsx:98`; zero `destroyOnClose` anywhere in the repo.

### AG-004 — Run-detail 5-tab restructure — VERIFIED
- 5 tab labels live in `run.screen.tsx` (`Tổng quan…`, `Tệp tải về`, `Cây thiết kế Figma`, `Chi tiết ánh xạ`, `Kỹ thuật…`); quick-download handler `handleQuickDownload` at `run.screen.tsx:77-99` fetches artifact then anchors a download; `Flex`-based `build-bundle-section.tsx` / `build-pipeline.tsx` (no antd `List` import).

### AG-005 — RunOverviewPanel "12 sections converted successfully" — **FALSE (overstated)**, UI shipped otherwise VERIFIED
- **Claim (log, UI verification):** "Tab 1 … bảng danh sách **12 phân đoạn đã chuyển đổi thành công**" and "Không còn cảnh báo … COMPOSITION_SKIPS_PRESENT đập vào mắt".
- **Real composition truth (measured, this SHA):** offline build of the committed fixture `resources/examples/build/slaunchpad-home-72-extended/` (command from its README: `node bin/det.js build --config … --out /tmp/… --json`, exit 0):
  - `build-manifest.json` `gaps[0]` = `{"code":"COMPOSITION_SKIPS_PRESENT","message":"7 planned section(s) skipped by the composition table — measured partial coverage, never claimed complete.","count":7}`
  - `gaps[1]` = `COMPOSITION_GAPS_PRESENT`, `count: 21` composed nodes with fidelity gaps.
  - `02-extraction/page-structure.json` has **12 sections** (orders 0–11: Hero/Primary, BrandStatement, Hero/Secondary, FeaturedCollections, FeaturedProducts, CampaignEditorial, Lookbook, EditorialMosaic, Craftsmanship, ThePeople, ProductSpotlight, Newsletter).
  - Fixture README (committed): "5 of 12 sections compose … the other 7 carry explicit honest-skip records". Composed = Hero/Primary, BrandStatement, CampaignEditorial, Craftsmanship, Newsletter. **FeaturedCollections and FeaturedProducts — both named as "converted" in the AG-005 example list — are explicitly SKIPPED** (FeaturedProducts products-grid decision carries no selection binding per the C72 correction).
- **Why the UI lies:** `run.sections` is assembled from **all** page-structure sections (`src/modules/studio/server/assemble-run-view.ts:123-134`), and `run-overview-panel.tsx` then renders:
  - Card title "Các phân đoạn giao diện đã chuyển đổi ({sectionData.length})" → **12**, and
  - the Trạng thái column as a **constant** (`render: () => <CheckCircleFilled color #52c41a/> Đã ghép thành công`, `run-overview-panel.tsx:156-168`) — it reads no disposition data;
  - plus the headline status card is hardcoded "Hoàn tất thành công / Sẵn sàng sử dụng" (`run-overview-panel.tsx:192-206`) even though it prints `run.exitCode` underneath.
- **Verdict:** the panel shipped (VERIFIED as code), but the "12 converted successfully" claim is **FALSE**: real = 5/12 composed, 7 honest skips, 21 composed-node gaps; the overview hides skips and badges every row green. W-A's UI work should make disposition data-driven; the log needs a corrective appendix entry, not a rewrite.

### AG-006 (x2) / AG-007 (x2) — layout shell + Alert `title` — VERIFIED code, JOURNAL-DEFECT duplicates
- AG-007: zero `<Alert message=` in `src/modules/studio/**` + `app/**`; all listed files use `title=` (spot-verified `catalog.screen.tsx:262/270`, `add-page-modal.tsx:133/155`, plus `build-pipeline.tsx`, `analysis-summary-card.tsx`, `preview-panel.tsx`, `design-tree.tsx`, `not-connected-result.tsx`).
- AG-006: `orientation="vertical"` on both Steps (`build.screen.tsx:464`, `build-pipeline.tsx:250`); `app/globals.css` + `studio-shell.tsx` shell styling present.
- **See structural defect #1** for the duplicate-heading handling recommendation.

### AG-008 — ZIP bundle + media sync + Tree/Mapping redesign + orchestrator race fix — MOSTLY VERIFIED, media claims PARTIAL
- **Verified:** `src/modules/studio/server/zip-bundle.ts` (pure-Node PKZIP, DEFLATE, `zlib.crc32`) + `app/api/runs/[runId]/download-bundle/route.ts` (RUN_ID_PATTERN 400 / 404 / streaming 200) + route tests; ZIP button in `run-overview-panel.tsx:373-384` (`href=/api/runs/{runId}/download-bundle`); orchestrator terminal-state cancel guard (`build-flow-orchestrator.ts:416-426` returns `not-cancellable` for completed/failed/cancelled/interrupted); Tree/Mapping redesign code present (`figma-tree-view.tsx`, `mapping-review-table.tsx` 6 KPI cards + Drawer); build-manifest of the measured run lists 11 output roles incl. `cms-installer`, `native-content-copy`, and the `media/` dir carries the 4 committed placeholder JPGs into the bundle.
- **PARTIAL:** "Gói … chứa … thư mục media/wysiwyg/... chứa ảnh thật" — the media files are **labeled offline placeholders** (fixture content-manifest: "labeled offline placeholder (operator-supplied local asset required before any CMS write)"), not real imagery. Claim reads as if operator-ready assets ship; they do not.
- **New debt found (not in log):** `zip-bundle.ts` packs `readdirSync` order **unsorted** → archive byte-layout is **not deterministic** across machines/FS; no symlink policy; sizes are `UInt32LE` (>4 GiB silently corrupts); UTF-8 filename flag never set. See `missing-tests.md` M2.

### AG-009 — duplicate React keys — PARTIAL (fix real, but positional)
- `figma-tree-view.tsx` keys: `${sec.sectionId}::${m.nodeId}::${idx}` (:198) and `unassigned::${m.nodeId}::${idx}` (:341); `treeItemsByKey` Map for inspector fallback — as claimed.
- `mapping-review-table.tsx` rowKey and `node-table.tsx` rowKey: **still positional** — see AG-011.

### AG-010 — antd 6 props + Tree expandedKeys — VERIFIED
- `orientation="vertical"` on both Steps; `figma-tree-view.tsx` uses `userExpandedKeys ?? allSectionKeys` declarative pattern with search auto-expand, no `expandedKeys` effect; `add-page-modal.tsx` Alerts use `title=`; no `<Space orientation=` anywhere. Commit `a4dd00b` **resolves and is an ancestor of HEAD** (reflog: created as `d12e492`, amended to `a4dd00b`; the log's SHA matches the final amended commit).

### AG-011 — Table rowKey index deprecation — PARTIAL; **commit SHA claim is the interesting defect**
- **Commit claim:** log says `` `main` / `2e21f11` ``.
  - `git cat-file -e 2e21f11^{commit}` **resolves locally** — the Integrator's expectation ("does not resolve anywhere") is wrong *for this clone*, but right *for any fresh clone*: `2e21f11b02c1b9eba699c045767388ee3c391864` is the **pre-amend original** of AG-011 (reflog `main@{1}: commit` → `main@{0}: commit (amend)` = `5bf41d3`), **not an ancestor of HEAD**, contained in **no branch**, and reachable only via reflog until GC. `git diff 2e21f11 5bf41d3` = exactly 1 line: the amend that added `` `/ \`2e21f11\` `` into the log text. **The truthful receipt SHA for AG-011 is `5bf41d3`**; the log self-documents a SHA that its own commit obsoleted.
- **Code claim:** warning fix VERIFIED — `mapping-review-table.tsx:191` pre-computes `rowKey` in the `filteredMappings` useMemo and the Table uses string prop `rowKey="rowKey"` (:459); `node-table.tsx:89` does the same (`rowKey="rowKey"` :97).
- **Identity claim ("mỗi hàng … có key duy nhất ổn định, không phụ thuộc index") — FALSE as stated:** `mapping-review-table.tsx:162` declares `let idx = 0` and line 191 appends `-${idx++}` **over the post-filter chain** (`filter(...).map(...)`), and `node-table.tsx:87-90` appends `-${index}` positionally. Keys are unique (warning gone) but **not stable**: filtering/sorting reassigns suffixes, so React remounts rows and any row-scoped state (drawer selection is outside the table here — survivable) re-keys. This is exactly the mapping row-identity gap issue #74 targets (see `missing-tests.md` M3).

## Gate-claim cross-check (AG-011 claims 201/201 + 631/631/61)

| Gate | Claimed | Observed (this audit worktree, same SHA) |
| --- | --- | --- |
| `pnpm test` | 201/201 | **201/201, exit 0** ✓ (run twice: original + post-reset worktree) |
| `pnpm run test:studio` | 61 files / 631 tests | **61 files / 631 tests** ✓ with `--fileParallelism=false`, **exit 0** |
| (same, default parallel) | — | **flaky under load on this box**: 4 parallel runs → 4 *different* single-test failures, each passing in isolation: ① `build-flow-orchestrator.test.ts` "drives every stage…" (`expect(orch.activeSnapshot()).toBeNull()` at :566 saw the completed flow still in the slot — observation-window race between the terminal journal write and the `finally` slot release at `build-flow-orchestrator.ts:781-785`); ② `build-bundle-reader.test.ts` "[40] … real bundle" 5000 ms timeout; ③ `studio-readiness.test.tsx` "auto-checks GET /api/environment…"; ④ fourth run: 4 tests / 3 files failed under peak load. W-A/C should treat the orchestrator slot-release window as a real hardening item (M6) and the Integrator should run the receipt gate serialized. |

## Recommendation to the Integrator

1. Treat `5bf41d3` as the AG-011 receipt SHA; record in the appendix that `2e21f11` is its dangling pre-amend twin.
2. Add the journal-hygiene appendix (duplicates void; AG-005/AG-008 "12 sections" corrected to 5/12 + 7 skips; AG-008 media = labeled placeholders).
3. Carry `run-overview-panel.tsx` hardcoded-green status + hardcoded success card into W-A's UI lane as a truthfulness bug, not a style issue.
4. Run the final receipt gates with `--fileParallelism=false` (or on a quiet box) and file the orchestrator slot-release race as a hardening item.
