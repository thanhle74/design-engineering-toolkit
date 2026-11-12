# Receipt — [70] One-click Figma Homepage → Magento Page Builder PHP (3-menu Studio, parallel lanes, one Draft PR)

Date: 2026-11-12 · Branch: `thanhle74/70-det-studio-3-menu-build-ai-workflow-global-re` · Owner GO in issue #70 (2026-11-12) · Pinned base: `origin/main @ 50ebfe106dd82ae23b456a62cfd9a8e6c37d744e` (the only branch-off base, per issue). All gates green on the receipt head `8e5f3bb`. **STOP for independent Coordinator review — nothing merged, no self-merge.**

## What the Owner asked (issue #70, excerpt)

1. Paste Figma URL → choose output → click ONE Build → truthful step-by-step pipeline → download native Magento Page Builder PHP installer (`install-homepage.php`), HTML, manifest. No AI/manual tabs, no human plan approval: the Build click authorizes bounded read-only analysis + local artifact generation — it is **not** a Magento DB write (that stays an operator-gated generated-installer step).
2. Exactly 3 header menus (`Tổng quan` `/` · `Build` `/build` · `Dự án` `/catalog`), compact readiness with Kiểm tra button; env failure blocks all NEW mutations **server-side** (503 `environment-not-ready`); GETs/downloads/safe cancels stay usable.
3. Multi-worker: Integrator freezes the shared typed contract FIRST and records it in the issue; lanes W-A…W-E in parallel with non-overlapping file ownership; ONE integration; ONE Draft PR #70; no worker PR merges.
4. First demo pinned: file `vNPtfBRpYM3PsExirVqhmt`, root `245:2`, revision `2417494580183108397`, config `slaunchpad-home-real-derived`. Wrong file/root fails closed. `hyva-phtml` shown disabled "Chưa hỗ trợ". 6 truthful stages, no fake %/timings, stock AntD 6 Light, Vietnamese copy.

## Contract freeze (Integrator, commit `9d29f59`)

`src/modules/studio/shared/contracts/build-flow.ts` — frozen before any lane branched: `BUILD_FLOW_OUTPUT_TARGETS`, `BUILD_FLOW_STAGES` (verify-source → snapshot → ai-analysis → mapping → compose → results) + Vietnamese labels, `BuildFlowRunSnapshot` (zod), `BUILD_FLOW_ERROR_CODES`/`BUILD_FLOW_ERROR_STATUS` (`environment-not-ready` 503, `invalid-input` 400, `unsupported-target`/`source-not-pinned` 422, `flow-busy`/`flow-not-cancellable` 409, `flow-not-found` 404, `internal-error` 500), `StudioReadinessChecks`/`StudioReadinessStatus`, API shapes, `BUILD_FLOW_ARTIFACT_FILES` + roles (`cms-installer`, `native-content-copy`, `mapping-gap-report`, `operator-readme`). Freeze also seeded two cross-lane seams so lanes never import each other's internals: server gate `src/modules/studio/server/environment/gate.ts` (`getStudioReadiness`, `assertStudioEnvironmentReady`, `StudioEnvironmentError`, `environmentNotReadyResponse`) and client readiness `src/modules/studio/readiness/studio-readiness.tsx` (`useStudioReadiness`); `build-runner.ts` gained `cancel(runId)` + `"cancelled"` terminal state.

## Lanes (one commit each; strict file ownership, audited commit-by-commit — 5/5 clean)

| Lane | Commit | Scope (owned files) |
|---|---|---|
| W-A header + 3 nav | `413b2bc` | `app/agent/page.tsx` (redirect preserving query), `app/layout.tsx` (provider mount), `studio-shell.tsx`, `readiness-indicator.tsx` (+tests), readiness refinements (shape guard, monotonic stale-drop) |
| W-B server readiness | `b4d30f8` | `app/api/environment/route.ts` (+test), `environment-not-ready` 503 gates on the three mutating legacy routes (+tests), `environment/gate.test.ts`, `build-runner.test.ts` cancel tests |
| W-C orchestrator | `6d22cfa` | `server/build-flow/{build-flow-orchestrator,build-flow-errors,tests}`, `app/api/build-flow/{route,[flowId]/route,[flowId]/cancel/route}.ts` (+tests) |
| W-E build screen | `24acdf3` | `app/build/page.tsx` rework, `modules/build-control/screens/build.screen.tsx` + `build-launch-form`/`build-pipeline`/`build-flow-view`/`analysis-summary-card` (+tests); deleted legacy `build-launcher.tsx` (666 lines) |
| W-D CMS installer | `2465995` | `magento/adapters/magento-cms-installer/render-cms-installer.ts` (+2 test suites), `core/adapters/cms-install-bundle.ts` neutrality bridge, `core/cli/commands/build.ts` emit extension, example config `cmsInstall` |

**Execution honesty:** the planned isolated per-lane worktrees were not available (this session itself runs inside an Orca worktree; nested isolation silently no-ops). All five lanes ran as bounded workers in the SAME tree with frozen ownership boundaries; the Integrator audited every commit's file list against its lane's ownership — zero cross-lane edits. History is linear: `9d29f59 → 413b2bc → b4d30f8 → 6d22cfa → 24acdf3 → 2465995`, then the Integrator fix below. No worker PRs were opened (per issue: no worker merges).

## Integrator fix on top (`8e5f3bb`, HEAD)

`artifact-access.ts` — the [29] download allowlist lacked `.php`/`.md`, so the run view flagged W-D's `install-homepage.php`/`README.md` downloadable while the route refused them (403 `artifact-not-downloadable`). Added both: `.php` served as inert `application/octet-stream` (Studio never executes it), `.md` as `text/markdown`. Tests extended; shared seam [29] contract unchanged otherwise.

## Gates (local, exact HEAD content `8e5f3bb`)

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile unchanged all session) |
| `pnpm test` | **195/195 checks passed** |
| `pnpm run test:studio` | **Test Files 51 passed (51) · Tests 557 passed (557)** |
| `pnpm run typecheck` | PASS (tsc --noEmit clean) |
| `pnpm run lint` | PASS (eslint clean) |
| `pnpm run build` | PASS (production bundle, PPR routes) |
| det CLI from foreign cwd | PASS (`node bin/det.js --help`, exit 0 from a fresh `mktemp -d`) |
| `php -l` generated installer | **No syntax errors detected** in `install-homepage.php` |
| Production route smoke (:3100) | `/api/environment` `ready:true` (claude 2.1.322, plugin:figma:figma listed, runs dir ok) · `/build` 200 · `/agent?analysis=1` streamed `NEXT_REDIRECT;replace;/build?analysis=1;307` · unknown flow 404 |
| API negatives | bad body → **400 `invalid-input`**; `hyva-phtml` → **422 `unsupported-target`** ("…chưa được hỗ trợ (Chưa hỗ trợ)…"); unknown artifact-safe run id → 404 |
| Wrong-file fail-closed | POST with file `ABCdef1234567890123456` → 202 accepted, then flow **`failed` at verify-source in 14 ms** with honest Vietnamese reason ("không khớp với bất kỳ cấu hình cơ sở nào đã gắn nguồn…"); all later stages `skipped`; no agent spawn, no Figma call |
| Downloads (real run bundle) | 5/5 HTTP 200 **byte-exact (sha256)**: `install-homepage.php` (octet-stream attachment), `README.md` (text/markdown), `mapping-and-gaps.json`, `pagebuilder-content.html`, `build-manifest.json` |
| Responsive | headless-chrome PNGs desktop 1440×900 + mobile 390×844: 3 menus, readiness "Đã kết nối" + Kiểm tra, pinned URL prefilled, target select, no horizontal scroll on mobile |

Flaky-note (honest): one mid-session `test:studio` run showed a single unnamed failure (556/557); the immediately following full run and the final run above were both 557/557, and the touched suite passes 28/28 standalone — consistent with the environment-flaky server tests W-E also observed (transient preflight 503/timeouts while real builds ran). No failure was reproducible or code-attributable.

`format:check` is red on 33 files that are already unformatted on pristine `50ebfe1` (pre-existing; verified on a clean base worktree this session). Gate applies to files a task touches.

## Real end-to-end proof (the actual demo, one Build click)

`POST /api/build-flow {vNPtfBRpYM3PsExirVqhmt node 245:2, magento-page-builder}` → **flow-1794476748756 → state `completed`**, ~10 minutes wall-clock, all six stages truthful:

1. **verify-source** success — pinned config `slaunchpad-home-real-derived` matched.
2. **snapshot** success — reused the committed pinned snapshot (no live Figma call on this rerun).
3. **ai-analysis** success — real Claude Code 2.1.322 + `plugin:figma:figma` analysis, **agent-1794476751313, outcome `plan-ready`, grounded**.
4. **mapping** success — deterministic auto-handoff (no approval click): plan pinned into build inputs, derived from the agent analysis.
5. **compose** warning — **build-1794477290885 exit 0** with 5 honest gap codes (warning, not success, because gaps exist).
6. **results** success — 5 artifacts ready.

Bundle truth (`out/studio-runs/build-1794477290885/`): manifest `source.revisionId = 2417494580183108397`, 11 outputs incl. the 4 new roles; `pagebuilder-content.html` byte-identical to `03-composition/native-content.html`; mapping ledger over 230 entries: **mapped 42 · gap 155 · excluded 29 · skipped 4** — reported as measured partial coverage, never "pixel-perfect". Gap codes: `COMPOSITION_SKIPS_PRESENT` (4), `COMPOSITION_EXCLUSIONS_PRESENT` (29), `COMPOSITION_GAPS_PRESENT` (155), `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED`.

## Protected boundaries honored

- **No Figma writes, no Page Builder CMS/DB writes, anywhere.** DET never connects to Magento; the generated `install-homepage.php` is inert bytes for the operator. Its runtime behavior against a live Magento is **UNPROVEN by design** — that proof requires a separate Owner GO + isolated test store, outside this task.
- Env-gating is server-side (`assertStudioEnvironmentReady` before every new mutation; 503 + checks envelope); UI readiness is display-only.

## Known not-done / future

- `hyva-phtml` target: correctly disabled ("Chưa hỗ trợ") — later issue scope per product plan.
- Visual preview of composed content: not implemented (gap code `PREVIEW_ASSETS_NOT_GENERATED` documents it in-artifact).
- Snapshot reuse means the demo rerun did not hit Figma live; live-snapshot behavior is covered by the [65] analysis path and unit tests.

## Deliverable

ONE Draft PR from this branch against latest `main`. Nothing merged by the Integrator; worker commits carry their own lane scope. **Awaiting independent Coordinator review.**
