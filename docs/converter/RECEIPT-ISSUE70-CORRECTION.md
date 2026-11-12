# Receipt — [70] Correction: C70-1 installer ResponseInterface fix + C70-2 real Magento integration proof

Date: 2026-11-12 · Branch/PR: same Draft PR #71 (correction commits on top of `718e3ee`) · Answers the Coordinator review "CORRECTION_REQUIRED @ `718e3ee`". No new issue, no self-merge — **STOP for re-review**.

## C70-1 — CRITICAL fix (commit `4e84d2f`)

**Confirmed against the real local Magento 2.4.8-p5 framework source** (`vendor/magento/framework/App/Bootstrap.php`, `AppInterface.php`, `App/Console/Response.php`): `Bootstrap::run()` executes `$response = $application->launch(); $response->sendResponse();`; a `Result\Raw` controller result has `renderResult()`, **not** `sendResponse()` — the old generated script saved the CMS page and THEN errored on `sendResponse()` (green `php -l` could never catch it).

**The fix** re-shapes the emitted `DetCmsInstallerApp` into the platform's own CLI-application shape (`\Magento\Framework\App\Cron`, read from the real source, not invented):

- constructor-injected `\Magento\Framework\App\State` + `\Magento\Framework\App\Console\Response` (a REAL `\Magento\Framework\App\ResponseInterface` whose `sendResponse()` exists and — for this CLI response — exits the process with the recorded code, exactly how the platform's cron app terminates) + `\Magento\Framework\ObjectManagerInterface`;
- `launch()` mirrors `App\Cron::launch()` boot semantics: `setAreaCode(AREA_CRONTAB)` + crontab area-config load, then the service-layer write, then `return $this->response`;
- ONE exit-decision point: `failWith()` records the code; `execute()` refusals throw `\RuntimeException` instead of `exit()`; `catchException()` reports + returns `true` (handled); the epilogue is `exit($app->getExitCode())`;
- regression test asserts the new contract AND that `ResultFactory`/`TYPE_RAW`/controller-Result construction are gone (prose explaining the defect is allowed; machinery is not).

Renderer-only change; one-click flow semantics, targets and artifact contract untouched.

## C70-2 — REAL Magento integration proof (isolated `det_preview` store, id 5, on slaunchpad local 2.4.8-p5 disposable dev store)

Pre-state captured first: 43 CMS pages, no `det-studio-homepage`, homepage configs `stores/4 → home|36`, `stores/5 → det-home-preview`, fingerprints of pages 2/36/42 recorded. The execution bundle was re-rendered from the frozen e2e run inputs (compose content sha256 `17a86fce3726836cf4e4445d71d1a69e7d877e08ed3afaeacab8e2ce3327f6ba`) with the corrected renderer; the store-5 execution variant and the store-0 demo variant differ ONLY in the declared-target constants (`diff` shows exactly `'storeId' => 5,` vs `'storeId' => 0,` plus the header echo) — same runtime shape, and the demo-target store-0 installer was never executed (isolated-store discipline).

| # | Step | Result |
|---|---|---|
| 1 | `php install-homepage.php --dry-run` | exit 0, plan JSON (identifier/title/store 5/active, 9909 bytes, sha256 matches), **no write** |
| 2 | Real run #1 (full entry path incl. `Bootstrap::run()` → `launch()` → `sendResponse()`) | **`action=created page_id=46`, exit 0, empty STDERR** — no fatal after the save (the C70-1 defect is gone) |
| 3 | DB verify page 46 | identifier/title/active correct, store set exactly `[5]`, `MD5(content)` **byte-identical** to `pagebuilder-content.html` (9909 bytes) |
| 4 | Harness (`scripts/proof/issue70/det-proof-harness.php`): real Bootstrap + real `createApplication` + real `launch()` | response = `Magento\Framework\App\Console\Response`; `instanceof ResponseInterface: true`; `method_exists sendResponse(): true`; then the harness performs the REAL `sendResponse()`; exit 0; the same launch performed `action=updated page_id=46` |
| 5 | Real run #2 | `action=updated page_id=46` — **same page id**, exit 0 (idempotent) |
| 6 | Scope-conflict fail-closed | conflict state created (same identifier at store 0); rerun → **REFUSING message + exit 1**, "Nothing was written"; page 46 and the conflict page both untouched (md5 verified). Note: Magento's own url_rewrite layer blocks duplicate identifiers through the service layer — the guard protects against fault states reachable only via imports/manual DB edits, which is exactly what the fixture constructed |
| 7 | Existing pages untouched | pages 2 (VI home) / 36 (EN home) / 42 (det_preview home) md5 identical to pre-state; `web/default/cms_home_page` config rows unchanged; total page count = pre-state + exactly the proof pages |
| 8 | Frontend | `/det-studio-homepage?___store=det_preview` HTTP 200 with the Page Builder DOM (`data-content-type="banner"`, `pagebuilder-banner-wrapper`, "The Quiet Grandeur") + screenshot; partial coverage renders as partial (the ledger's 42 mapped / 155 gap is visible truth, not hidden) |
| 8b | Admin Edit→Save→Reload | temp admin created; login → save POST of page 46 (12.9 KB → 302, under the recorded ~16 KB nginx limit this time) → new title visible on frontend reload + in DB; the documented nginx large-POST 500 blocker did not trigger at this size |
| coda | Installer vs manual edit | after the admin title edit, one installer rerun → `action=updated page_id=46`, title restored to the declared target — deterministic regeneration wins |
| 9 | Cleanup & restore | proof page 46 deleted via `PageRepositoryInterface::deleteById` (service layer); conflict fixture removed; temp admin + its `authorization_role` row removed; final state **43 pages = exact pre-state**, homepage configs unchanged; sandbox `<magento-root>/det-install/` removed |

Harness note (honest): PHP declares classes LATE — never hoisted past the generated file's top-level entry-guard `return` — so include-based extraction of the class is impossible; the harness derives a runnable copy with two EXACT textual cuts (entry-guard block + `Bootstrap::run` tail), verifies both anchors exist (refuses to guess otherwise), and requires the generated installer itself UNCHANGED. The full-file execution path is proven separately by steps 2/5 (direct runs through the real `Bootstrap::run`).

## Gates on the corrected head (`4e84d2f` content)

`pnpm test` **195/195** · `pnpm run test:studio` **558/558 (51 files)** — includes the new C70-1 regression test · `typecheck` PASS · `lint` PASS · `build` PASS. G28 engine fixtures unchanged (contract suite). Live negative re-check on the rebuilt production server: `hyva-phtml` 422, unknown flow 404, and — proven LIVE on a bare `next start` without `STUDIO_DET_RUNS_DIR` — GET `/api/environment` `ready:false` (`detRunsDir: not-configured`) and POST `/api/build-flow` **503 `environment-not-ready`** with the canonical `{error:{code,message},checks}` envelope. The corrected-head one-click flow rerun + download-hash verification are recorded below (final section).

## Honest operational findings (no gate change requested)

- The launcher (`scripts/studio.mjs start`) DEFAULTS `STUDIO_DET_RUNS_DIR` to `<root>/out/studio-runs`, so every launcher-started instance is "ready"; the 503 path exists for bare `next start` (proven above).
- The one-click single slot is per-server-process: two server instances each run their own flow. The documented launcher is single-instance; a stray second instance was cancelled cleanly mid-analysis (`cancel` → state `cancelled`, later stages `skipped`, agent process SIGTERMed and gone) — the safe-cancel path is proven live.
- A full `det build` rerun from the committed project composes DIFFERENT bytes than the e2e flow (by design: the flow's mapping stage pins the fresh agent plan into the run, while the committed project carries the older projection) — this is why the C70-2 bundle was re-rendered from the frozen e2e inputs instead.

## Final: corrected-head live one-click flow + downloads

Recorded after this receipt's first commit — see the PR comment for the flow id and the byte-exact download verification of the corrected bundle. STOP for re-review; no self-merge.
