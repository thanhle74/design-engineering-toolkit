# RECEIPT — Issue #58: DET single-root startup — one Node workspace and in-place project catalogue

**Date:** 2026-11-11 · **Branch:** `thanhle74/58-det-single-root-startup-one-node-workspace-an` · **Base:** `main` @ `d9511ed` (#56 merge)

**Status: `SINGLE_ROOT_STARTUP_OPERATIONAL`** — one documented root install (`npm run setup`, once), then `npm run dev` from the repository root brings up the real DET Studio Build Control with the committed real-derived Slaunchpad project prelisted **in place** and buildable. No engine, schema or conversion-scope changes. Draft PR for Coordinator review; **no merge without explicit Owner GO.**

---

## 1. What shipped (source-implemented, gate-tested)

Two new root scripts and one bounded Studio-server change; no second app, no workspaces migration, no Docker/orchestrator:

1. **`scripts/studio.mjs`** — the root launcher behind `npm run dev` / `npm run start` / `npm run studio:build`. All paths resolve from the script's own location (never the caller's cwd). Per start it: asserts Node ≥ 22.13; installs Studio deps once if missing (`npm ci` against the committed lockfile); rebuilds root `dist/` when missing or stale (newest `src/`+`adapters/` mtime vs `dist/`); defaults **`STUDIO_DET_RUNS_DIR` to `<root>/out/studio-runs`** (created on demand) **only when unset** — every explicit `STUDIO_*` value passes through untouched; runs Next in the foreground with signals forwarded and the exit code propagated. `print-env` reports the resolved layout as JSON without side effects (used by the gate suite).
2. **`scripts/setup.mjs`** — `npm run setup`: the ONE first-time command. `npm ci` at the root + `npm ci` in `apps/studio` (both committed lockfiles stay isolated — the existing Studio CI is untouched, no npm-workspaces single-lockfile migration was forced) + the core build. `scripts/studio.mjs` self-installs the same pieces if missing, so `npm run dev` works on a fresh clone too.
3. **Canonical in-place catalogue ([58] extension of the [40] `BuildConfigCatalog`).** The catalogue is now a **union of roots**: the committed repository catalogue `<repoRoot>/resources/examples/build` (located from the module layout with validated cwd fallbacks; only directories directly containing `build-config.json` are entries — unrelated fixture dirs are never promoted) plus the caller-configured `STUDIO_BUILD_PROJECTS_DIR` when set (a configured entry with the same id overrides the repository example). Entries carry `origin: "repository" | "configured"`; the `/build` page renders a **"repository example" badge**. `resolveConfigPath` checks configured roots first, with the same pattern/realpath/containment guards per root. Nothing is copied into `out/`; the committed project is read-only input, builds write only under the runs root.
4. **UI/copy truth:** the `/build` not-connected alert and launcher texts now describe the root flow (`npm run dev` at the repo root defaults the runs dir; `STUDIO_BUILD_PROJECTS_DIR` adds your own entries). The honest no-demo-data contract is unchanged — with no usable catalogue/runner the page still refuses to look connected.
5. **Docs:** root README gains a concise **Quick start** at the top (setup once → `npm run dev` → `/build` → select the real-derived project → Build, with the accurate 2/12 · `PREVIEW_UNAVAILABLE` · no-CMS-write labels); `apps/studio/README.md` [40] section and the [56] operator runbook + example README rewritten for the single-root flow (old env/copy steps kept only as the explicit-override path); AGENTS.md gate count updated (186 → 191).
6. **`tests/studio-startup-suite.mjs`** (5 checks, wired into `tests/run-all.mjs`): R58-T1 cwd-independent launcher resolution from `os.tmpdir()`, R58-T2 explicit `STUDIO_*` passthrough, R58-T3 canonical catalogue shape (exactly one committed entry, RUN_ID-safe id, config-relative paths), R58-T4 a real in-place `det build` (exit 0) leaves the committed project byte-and-mtime-identical, R58-T5 root script wiring.

## 2. Operator proof (actual UI/API run, this workspace)

`npm run setup` (fresh worktree, bootstrapped everything), then **`npm run dev` at the root with zero env exports** (port 3111 for the isolated workspace):

- `/api/build-configs` → 200: the single canonical entry `slaunchpad-home-real-derived` (`origin: "repository"`, committed label, declared paths verbatim), `runnerReady: true`, `invalid: []`.
- `POST /api/builds` → 202 `build-1794363842946` → **exited 0**; journal `command[1]` = `<repoRoot>/bin/det.js` (the default CLI resolves correctly inside the real Next server); bundle manifest pins `figma-home-desktop @ 2417494580183108397` with honest gaps (`COMPOSITION_SKIPS_PRESENT · 10`, `COMPOSITION_GAPS_PRESENT · 12`, `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED`) and 7 declared outputs; the run is listed and artifact downloads stay byte-verified.
- Production mode: root `npm run start` on port 3112 → `/build` 200, same entry, `runnerReady: true`.
- Evidence: `docs/evidence/issue-58/operator-run.root-dev.json` + `docs/screenshots/58-build-page-root-dev.canonical-catalog.png` (dark-only `/build` with the repository-example badge and enabled Build button).

## 3. Gates (exact commands, this workspace)

| Gate | Command | Result |
|---|---|---|
| Root contracts | `npm test` | **191/191** (186 + R58-T1…T5; REG-09 and R56 locks unchanged) |
| Studio unit | `cd apps/studio && npx vitest run` | all suites pass (221 tests; updated catalog/route/builds tests assert the union semantics) |
| Studio typecheck | `npm run typecheck` | pass |
| Studio lint | `npm run lint` | pass |
| Studio prod build | `npm run build` | pass (all routes) |
| Operator E2E | root `npm run dev` (no env) → `/build` → Build → run page | exit 0; manifest verified; evidence above |

CI note: the two exact-head jobs are unchanged in construction — `contracts` runs the root gate (new suite rides `npm test`), `studio` keeps its isolated lockfile install (the two-lockfile layout is preserved by design).

**Correction C58-1 (on this PR, after the first exact-head CI run):** the `studio` job flaked in `build-runner.test.ts` C1 (`expected 'build-…177' to be 'build-…178'`). Root cause (pre-existing timing nondeterminism, first time fired under CI load): `start()` captures the provisional `build-${Date.now()}` synchronously at slot reservation, but `finalizeRunId()` re-read `Date.now()` after the first await — a crossed millisecond boundary changed the id AFTER a concurrent start had already observed it in the 409 `BuildBusyError.active` snapshot. Fix: `finalizeRunId` now scans forward **from the provisional id** instead of a fresh `Date.now()`, so the id changes only on a real journal/bundle collision — collision-bumping, pattern safety and all [40] guarantees unchanged; the C1 lock itself is untouched and is the regression guard. Studio suite 221/221 (build-runner file stable ×5), root gate 191/191 re-run after the fix.

**Correction C58-2 (on this PR, per Coordinator review of `1f1dd4e`, comment 6785640483):** duplicate-ID precedence with an INVALID configured override was inconsistent between listing and resolution. `listRoot()` pushed a malformed configured `slaunchpad-home-real-derived/build-config.json` only to `invalid[]`, leaving the id free — so the repository scan added a valid-looking buildable repository entry, while `resolveConfigPath()` (configured-first) still returned the broken configured file: the UI advertised a repository build whose Build actually read the stale override. Fix (one rule for list AND resolve): **the first root that contains `<id>/build-config.json` owns the id** — as a buildable entry when valid, as an explicit invalid notice when malformed (a `claimed` set now shadows the id before validation, configured roots scanning first). A broken configured copy can no longer leave the repository example falsely advertised; resolution still resolves to that same rejected file, so the UI can never silently map a selection to a different config. Valid overrides, per-root containment, env fail-closed and all other catalogue behavior unchanged. One focused regression test added (`build-catalog.test.ts`: invalid configured duplicate → no buildable entry for that id, invalid notice surfaced with a safe reason, resolve stays on the configured file). Gates after C58-2: Studio vitest **222/222** (221 + 1), typecheck/lint/prod build pass, root `npm test` **191/191**.

## 4. Test-semantics changes (honest deltas, all locked)

- `BuildConfigCatalog.open("")` (env unset) no longer 503s when the repository catalogue is reachable — it lists the committed examples; an **explicitly set but invalid** `STUDIO_BUILD_PROJECTS_DIR` still fails closed (`not-configured`, env name only). Locked in `build-catalog.test.ts` + `build-configs/route.test.ts`.
- `POST /api/builds` with no env and an unknown id is now a catalog-scoped **404** (the canonical catalogue answers) instead of 503 — locked in `builds/route.test.ts`.
- The fixture demo (`g28-example`) is **not prelisted** — it exists only in a caller-configured dir (the studio README one-liner), per the issue's "avoid promoting fixture directories" boundary.

## 5. Boundaries honored

- No Figma reads/writes; no Magento CMS/Admin/DB/store/theme writes anywhere; the only Magento-derived input remains the committed [56] pinned registry.
- No engine/adapter/schema changes; no new app, workspaces migration, Docker or monorepo orchestrator; Studio remains a thin presentation layer with the [40] single-slot runner, hash-verified downloads, 409 semantics, optional [50] SQLite mode and dark-only UI intact.
- The committed example project is proven untouched by in-place builds (R58-T4: content + mtime snapshot equality across a real `det build`).
- No secrets, no machine-specific absolute paths in committed project files (R56-T4 unchanged); launcher logs echo paths only to the local operator's terminal.
- One workspace, one Draft PR; stopped here for Coordinator review — **no merge without explicit Owner GO.**

## 6. Honest remaining gaps

1. The root `npm run dev` launcher itself is gate-locked via `print-env` (resolution/env logic) but is not driven end-to-end by CI — the operator E2E above is a local receipt, not a CI check.
2. `npm run start` always rebuilds the Studio production bundle before serving (simple and correct; a no-op-if-fresh optimization was deliberately skipped as unneeded complexity).
3. Windows/macOS launchers are untested (Node-only code, Fedora is the supported operator target per the issue).
4. The registry namespace divergence observation from [56] §3 remains open (untouched, different scope).

## 7. Reviewer rerun

```bash
npm run setup && npm test                     # 191/191 incl. R58-T1…T5
npm run dev                                   # root, no env → http://localhost:3000/build
# /build lists "Slaunchpad Homepage — real-derived (Figma rev …)" with the repository-example badge
cd apps/studio && npx vitest run && npm run typecheck && npm run lint && npm run build
```
