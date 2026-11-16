# Test inventory baseline — Antigravity refactor audit (W-D)

- **Repo / SHA:** `thanhle74/design-engineering-toolkit` @ `5bf41d3aa3e81a6f547e9349d8ff763d9ee641b2` (branch `74-wd`, untouched origin/main baseline).
- **Method:** live recount in the audit worktree: `find src app -type f \( -name "*.test.ts" -o -name "*.test.tsx" \)`, plus `.mjs` suites under `src/modules/**` and `scripts/`. Machine-checkable by `scripts/proof/antigravity-refactor/verify-antigravity-claims.mjs` (check T1–T5).

## Headline counts

| Bucket | Count |
| --- | --- |
| Vitest test files **outside** `__tests__` (`src/**` + `app/**`) | **52** |
| Vitest test files **inside** `__tests__` (`src/**`) | **9** (briefing guessed 8 — actual is 9) |
| Top-level `src/modules/studio/__tests__/` | **2 `.mjs` suites** (`real-derived-suite.mjs`, `studio-startup-suite.mjs`) — **no** `*.test.ts(x)` there |
| All `.mjs` suites under `src/modules/**/__tests__/` | 24 (these are the root `pnpm test` contract suites; 201 checks total) |
| `.mjs` files directly under `scripts/` | 4 (`kb-license-guard.mjs`, `run-contract-tests.mjs`, `setup.mjs`, `studio.mjs` — launcher/guard tooling, not test suites) |
| `scripts/proof/**` | `issue70/det-proof-harness.php`, `issue72/` (4 PHP proof scripts + README) — **no** `.mjs` contract suites live here (briefing said "list .mjs contract suites under scripts/proof" — there are none; PHP only) |

**Gate totals on this SHA:** root `pnpm test` = **201/201 checks, exit 0**. Studio `pnpm run test:studio` = **61 files / 631 tests** (52 outside + 9 inside = 61 ✓). 61 files pass and 631/631 tests pass with `--fileParallelism=false`; under default file-parallel execution on this (heavily loaded) box the suite is flaky — see `ag-log-claim-audit.md` §gates for the failure inventory.

## The 52 outside-`__tests__` files, per lane

### `app/**` — 19 files (every route has a colocated test)

| File | Lane |
| --- | --- |
| `app/agent/page.test.ts` | agent |
| `app/api/agent/analyses/route.test.ts` | agent |
| `app/api/agent/analyses/[analysisId]/route.test.ts` | agent |
| `app/api/agent/analyses/[analysisId]/approve/route.test.ts` | agent |
| `app/api/agent/analyses/[analysisId]/cancel/route.test.ts` | agent |
| `app/api/agent/status/route.test.ts` | agent |
| `app/api/build-configs/route.test.ts` | build-configs |
| `app/api/build-flow/route.test.ts` | build-flow |
| `app/api/build-flow/[flowId]/route.test.ts` | build-flow |
| `app/api/build-flow/[flowId]/cancel/route.test.ts` | build-flow |
| `app/api/builds/route.test.ts` | builds |
| `app/api/builds/[runId]/route.test.ts` | builds |
| `app/api/catalog/route.test.ts` | catalog |
| `app/api/environment/route.test.ts` | environment |
| `app/api/projects/route.test.ts` | projects (AG-001) |
| `app/api/runs/route.test.ts` | runs |
| `app/api/runs/[runId]/route.test.ts` | runs |
| `app/api/runs/[runId]/artifacts/[artifactId]/route.test.ts` | runs |
| `app/api/runs/[runId]/download-bundle/route.test.ts` | runs (AG-008) |

### `src/modules/studio/**` — 33 files

| File | Lane/module |
| --- | --- |
| `agent/components/agent-plan-view.test.tsx` | agent UI |
| `agent/components/agent-workflow.test.tsx` | agent UI |
| `artifacts/artifact-manifest.test.tsx` | artifacts |
| `build-control/components/build-flow-view.test.ts` | build-control |
| `build-control/screens/build.screen.test.tsx` | build-control |
| `components/layout/readiness-indicator.test.tsx` | layout |
| `components/layout/studio-providers.test.tsx` | layout |
| `components/layout/studio-shell.test.tsx` | layout |
| `conversions/components/conversion-form.test.tsx` | conversions |
| `conversions/figma-input.test.ts` | conversions |
| `design-tree/design-tree.test.tsx` | design-tree (AG-008/009/010/011) |
| `mapping-review/mapping-review.test.tsx` | mapping-review (AG-008/009/011) |
| `preview/preview-panel.test.tsx` | preview |
| `readiness/studio-readiness.test.tsx` | readiness |
| `server/api-error.test.ts` | server |
| `server/artifact-access.test.ts` | server |
| `server/build-bundle-reader.test.ts` | server |
| `server/build-catalog.test.ts` | server |
| `server/build-flow/build-flow-orchestrator.test.ts` | server (AG-008 race fix) |
| `server/build-runner.test.ts` | server |
| `server/catalog/runner-catalog-integration.test.ts` | server |
| `server/catalog/sqlite-driver.test.ts` | server |
| `server/catalog/studio-catalog.test.ts` | server |
| `server/claude-agent/analysis-runner.test.ts` | server |
| `server/claude-agent/claude-detect.test.ts` | server |
| `server/claude-agent/plan-materializer.test.ts` | server |
| `server/det-run-reader-factory.test.ts` | server |
| `server/directory-det-run-reader.test.ts` | server |
| `server/environment/gate.test.ts` | server |
| `server/fixture-det-run-reader.test.ts` | server |
| `server/zip-bundle.test.ts` | server (AG-008) |
| `shared/contracts/agent-plan.test.ts` | contracts |
| `shared/contracts/studio-run-view.test.ts` | contracts |

## The 9 inside-`__tests__` files

| File | Module |
| --- | --- |
| `src/modules/figma/__tests__/role-hints.test.ts` | figma |
| `src/modules/magento/adapters/magento-cms-installer/__tests__/cms-installer-build.test.ts` | magento |
| `src/modules/magento/adapters/magento-cms-installer/__tests__/cms-installer-renderer.test.ts` | magento (AG-008 media/dry-run) |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/card-grid.test.ts` | magento |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/elements-editorial.test.ts` | magento |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/header-band.test.ts` | magento |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/heading.test.ts` | magento |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/products.test.ts` | magento |
| `src/modules/magento/adapters/magento-pagebuilder-compose/handlers/__tests__/slider-slide.test.ts` | magento |

## AG-log cross-checks (from the AG entries' own claims)

- AG-004/AG-005/AG-006/AG-007 claim "622/622 tests, 59 files"; AG-008/AG-009/AG-010/AG-011 claim "631/631, 61 files". Delta = **+2 files / +9 tests**, and exactly 2 of the 52 colocated files are AG-008 additions (`zip-bundle.test.ts`, `download-bundle/route.test.ts`) — internally consistent.
- AG-001 claims "7 tests" in `app/api/projects/route.test.ts` — file exists (only projects test in the repo; `src/modules/studio/projects/project-store.ts` itself has NO unit test file).
