# Missing-test inventory for issue #74 scope (W-D, @ `5bf41d3`)

Concrete gaps, ranked by risk to the #74 hardening goals (project-store reliability, zip determinism/safety, mapping row identity, download error paths, environment route, cms-installer dry-run). Each item names the file to test and the exact behavior to pin.

## M1 — Project store reliability — **HIGH (no unit tests at all)**
`src/modules/studio/projects/project-store.ts` has **no test file**; only the API route collection test exists (`app/api/projects/route.test.ts`, happy paths). Real behaviors to pin:
- **Silent data destruction:** `loadProjects()` (`project-store.ts:66-77`) catches *every* read/parse error and returns `DEFAULT_PROJECTS`, after first calling `saveProjects(DEFAULT_PROJECTS)` — a corrupt/truncated `projects-catalog.json` is **overwritten with seed data on the next read**, destroying user projects. Test: corrupt JSON on disk → must NOT silently re-seed (fail loud or quarantine), never overwrite.
- **Non-atomic writes:** `saveProjects()` does a plain `writeFile` (no temp-file + rename). Crash/concurrent POSTs can truncate the catalog. Tests: concurrent `createProject` calls don't lose either project; interrupted write doesn't corrupt.
- ID collision/slug behavior (`generateSlug`), `deleteProject`/`addFigmaPage`/`deleteFigmaPage` return values, and `getStoreFilePath` honoring `STUDIO_DATA_DIR` (note: setting `STUDIO_DATA_DIR` also flips the build catalog to SQLite — that coupling deserves its own contract test).
- Sub-routes with zero colocated tests: `app/api/projects/[projectId]/route.ts` (GET/DELETE), `.../pages/route.ts` (POST w/ `parseFigmaInput`), `.../pages/[pageId]/route.ts` (DELETE).

## M2 — zip-bundle traversal / determinism / oversize — **HIGH (AG-008 core deliverable)**
`src/modules/studio/server/zip-bundle.test.ts` has only 3 cases (valid zip via `unzip`, packs files+media, throws on missing dir). Missing:
- **Determinism:** same run dir → byte-identical zip. Current code fails this across machines: `collectMedia` uses unsorted `fs.readdirSync` (`zip-bundle.ts:127`), so entry order (and thus archive bytes) follows FS order. Pin: sorted walk (then the zeroed mod-time/date fields already present make the archive deterministic).
- **Symlink policy:** `entry.isDirectory()/.isFile()` are both false for symlink dirents → symlinked dirs/files are silently dropped. Pin intended behavior (skip-and-notice vs follow-with-containment) so media sync doesn't silently miss operator assets.
- **Oversize:** sizes/CRC/offsets are `writeUInt32LE` — entries >4 GiB silently corrupt the archive. Pin a guard (reject with clear error) before any real-photo bundles flow through.
- **Filenames:** UTF-8 name flag (general-purpose bit 11) is never set; Vietnamese/emoji names would mojibake in some extractors. Pin ASCII-safe or UTF-8-flagged behavior.
- **Empty-run 500 path:** `packRunBundleZip` throws "No bundle files found" → route's catch returns 500; no test covers it (`route.test.ts` covers 400/404/200 only).

## M3 — Mapping row-identity stability — **HIGH (AG-009/AG-011 debt, #74 target)**
No test pins row-key stability:
- `mapping-review-table.tsx:162,191`: `rowKey = ${nodeId}-${sectionId ?? "none"}-${composeDisposition}-${idx++}` — `idx` counts the **post-filter** array, so toggling the disposition filter / search reassigns keys for every surviving row (React remounts, DOM `data-node-id` rows churn). Test: filtering to a subset preserves each row's key.
- `node-table.tsx:87-90`: `${nodeId}-${index}` — same positional problem in the design-tree table.
- `figma-tree-view.tsx:198,341`: tree keys embed `::${idx}` per section — duplicate node ids across sections are handled, but re-filtering re-keys. The durable fix (and its test) is a genuinely stable id (occurrence-qualified node id, e.g. `${nodeId}#${occurrence}` derived from source order, not filter position).
- Regression pin for the AG-009 duplicate-key case: the same node appearing twice (gap assessment + binding) must yield distinct stable keys.

## M4 — download-bundle error paths — **MEDIUM**
`app/api/runs/[runId]/download-bundle/route.test.ts` covers 400 invalid id, 404 missing run, 200 zip. Missing: `packRunBundleZip` throw → 500 envelope (empty run dir); malformed `runId` boundary cases of `RUN_ID_PATTERN` (64-char, dot-segments); Content-Disposition filename safety; concurrent download memory behavior (whole ZIP buffered in RAM — acceptable now, worth a comment/test-size guard).

## M5 — cms-installer dry-run non-mutation — **MEDIUM (good coverage exists; gaps at the edges)**
`cms-installer-renderer.test.ts` already executes the generated PHP `--dry-run` (plan math with stubbed Magento, media-asset listing when `media/` exists). Remaining gaps:
- Dry-run **non-mutation proof**: assert no filesystem writes anywhere under the target during dry-run (temp-dir snapshot compare) — the current tests assert plan output, not absence of side effects.
- `PHP_BIN` absent → tests skip (env-dependent); CI/hardening should assert the skip is loud, not silent-green.
- Real copy path (recursive `pub/media` copy, 0755/0644, `FlushCacheInterface` full_page/block_html) is generated but **never executed** — correctly out of unit-test scope; belongs to the BLOCKED isolated-store proof (see runbook §Slaunchpad).

## M6 — Environment route + gate — **LOW (well covered; two pin-holes)**
`app/api/environment/route.test.ts` + `server/environment/gate.test.ts` cover ready/broken/500 and gate-never-consulted cancels. Pin-holes: (a) `checkDetRunsDir` symlinked-dir accept behavior (`realpath` then `stat`); (b) the orchestrator slot-release observation window surfaced by the parallel-load flake (`build-flow-orchestrator.ts:781-785` — `activeSnapshot()` can still return the completed flow after the terminal state is visible; see `ag-log-claim-audit.md` §gates ①). One deterministic test: after the journal shows a terminal state, `activeSnapshot()` must be null.

## M7 — Studio run-view honesty (new, from this audit) — **HIGH for W-A's UI lane**
No test prevents the AG-005 class of lie: `run-overview-panel.tsx` renders every `run.sections` row with a hardcoded green "Đã ghép thành công" and a hardcoded success status card. Pin: panel must derive per-section disposition from compose data (skipped sections must NOT render "composed"), and the status card must reflect `run.exitCode`/diagnostics. This is a UI-truthfulness contract test, not a snapshot test.
