# Receipt — Issue #63: DET single application (Studio as internal module, npm workspaces removed)

**Status:** DRAFT — awaiting independent Coordinator review before any Owner merge GO.
**Base:** `origin/main` = `429b247` (the merged post-#61 head). **One integrator workspace**, one Draft PR.
**Owner GO (issue #63, 2026-11-11):** "ONE Node.js application; Studio is a module, not a separate app/package" — the `apps/studio + packages/core` workspace layout is rejected; #63 and #65 may implement in parallel from the same main. **This is structural consolidation only — no engine/UI behavior change.**

## 1. What changed (the move map)

Every move is a `git mv` — file bytes preserved unless explicitly listed in §3.

| Before (post-#61) | After ([63]) | Notes |
|---|---|---|
| `apps/studio/app/**` | `app/**` | Next.js App Router (Studio routes + API). Routes, `'use client'` leaves, `globals.css`, `favicon.ico` byte-preserved |
| `apps/studio/components/**` | `components/**` | Studio shell/providers/metadata |
| `apps/studio/public/**` | `public/**` | |
| `apps/studio/src/**` | `src/studio/**` | Studio module: `server/`, `shared/`, `modules/` — the whole tree moved as one unit; intra-tree relative imports untouched |
| `apps/studio/docs/**` | `docs/studio/**` | incl. `screenshots/` (52-*/61-* historical preserved) |
| `apps/studio/README.md` | `docs/studio/README.md` | |
| `apps/studio/AGENTS.md` | merged verbatim into root `AGENTS.md` | the `BEGIN:nextjs-agent-rules` block is managed by `next dev` at the **app root**, which is now the checkout root |
| `apps/studio/{package.json,tsconfig.json,.gitignore,eslint.config.mjs,next.config.ts,vitest.config.ts,vitest.setup.ts}` | deleted / moved to root | root `tsconfig.json` (Next), root `eslint.config.mjs`, root `vitest.*`, root `next.config.ts` (content unchanged: `cacheComponents` + `partialPrefetching`); subordinate manifest + studio gitignore deleted |
| `packages/core/src/core/**` | `src/core/**` | engine source bytes preserved (see §2) |
| `packages/core/adapters/**` | `adapters/**` (root) | **required by descriptor resolution** — see §2 |
| `packages/core/schemas/**` | `resources/schemas/**` (root) | also makes the descriptor `inputContract`/`outputContract` GitHub raw URLs (`…/main/schemas/cli/…`) factually correct for the first time |
| `packages/core/{package.json,tsconfig.json,bin/det.js}` | deleted | replaced by root `tsconfig.core.json`; root `bin/det.js` is the one entrypoint |
| `tests/pack-portability-suite.mjs` | `tests/cli-path-resolution-suite.mjs` | content replaced — see §4 |

**Acceptance shape:** exactly ONE `package.json` + ONE `package-lock.json`; no `apps/`, no `packages/`, no npm `workspaces`, no `@det/core` alias, no subordinate manifests. `grep -r "@det/core"` across active code/config returns nothing (historical receipts/specs keep their dated wording, per the no-rewrites rule).

## 2. Why `adapters/` is at the root (issue-allowed deviation from `src/adapters`)

The issue's conceptual tree shows `src/adapters/` but explicitly allows "root `adapters/` when required by descriptor resolution". It is required:

- `loadAdapters(repoRoot)` scans `path.join(repoRoot, "adapters")` for `*/descriptor.json` (`src/core/adapter-runtime.ts:82`);
- every committed descriptor declares a **repoRoot-relative** `entry` (`"dist/adapters/<id>/<file>.js"`), containment-checked via `validateAdapterEntry(repoRoot, entry)` and spawned with `cwd: repoRoot`;
- keeping the compiled shape identical (below) means **zero descriptor bytes** and **zero engine-source bytes** change.

Compiling via root `tsconfig.core.json` (`rootDir: "."`, `include: ["src/core/**/*.ts", "adapters/**/*.ts"]`) reproduces the exact [60] dist shape `dist/src/core/**` + `dist/adapters/**`. Consequently the two `import.meta.url` anchors resolve with **zero TS edits** and now land on the **checkout root**:

| Anchor | Old target (packages/core) | New target (root) |
|---|---|---|
| `src/core/schema-registry.ts` `REPO_ROOT` (3 ups from `dist/src/core/`) | `packages/core` (schemas lived there) | checkout root (`resources/schemas/` now lives there) |
| `src/core/cli/main.ts` `REPO_ROOT` (4 ups from `dist/src/core/cli/`) | `packages/core` (version read from its `package.json`, 0.1.0) | checkout root (version read from the root `package.json`, same 0.1.0) |

REG-04's anchor lock (`tests/registry-suite.mjs`) was re-pointed accordingly: `REPO_ROOT === <checkout root>`.

## 3. Intentional (non-move) edits — all path re-anchors or doc pointers

- `bin/det.js` — entry string `../packages/core/dist/…` → `../dist/…` (+ comment). Messages/exit codes unchanged.
- `src/studio/server/test-helpers/det-cli.ts` — helper depth 5 → 4 ups; dist presence check `<root>/dist`; message updated.
- `src/studio/server/build-runner.ts` — `STUDIO_APP_ROOT` = `src/studio` (1 up from `server/`; the default `../../bin/det.js` still names `<root>/bin/det.js`); comments.
- `src/studio/server/build-catalog.ts` — root candidates: module-dir walk (4 ups = root) + `process.cwd()` (Next runs at root now); shape validation (package.json + resources/examples/build) unchanged.
- `@/src/…` → `@/src/studio/…` across app/components/src (alias `@/*` → `./*` at root, one authoritative `tsconfig.json`).
- Comment/doc-pointer updates: `det-payload-parsing.ts`, `catalog/migrations.ts`, `catalog/sqlite-driver.ts`, `catalog/studio-catalog.test.ts`, UI copy in `build-launcher.tsx`/`build-view.tsx` (`apps/studio/README.md` → `docs/studio/README.md`).
- `scripts/studio.mjs` — re-anchored (root = checkout root; dist entry `<root>/dist/...`; freshness walk `src/core` + `adapters`; spawns `npm run app:dev|app:start` at root so the launcher never re-enters itself); `print-env` JSON keys preserved (`studioDir` now names `src/studio`). `scripts/setup.mjs` — comments only; behavior identical (one `npm ci` + core build).
- Root `package.json` — merged dependencies (runtime: antd stack + next + react + zod + **ajv**; dev: testing/TS/eslint/vitest stack); scripts: `build` = `build:core && build:app`, `test` = `build:core && node tests/run-all.mjs`, `test:studio`, `typecheck`, `lint` (Studio scope), `setup`, `dev`, `start`, `studio:build`, plus `app:dev`/`app:start` for the launcher. `engines` stays `>=22.13.0` (Next 16 minimum). Lockfile regenerated by `npm install` at root (`lockfileVersion` 3, no `workspaces` key).

## 4. Suite migration: [60] packed-package → [63] foreign-cwd root path-resolution

The `npm pack --workspace @det/core` artifact **no longer exists and is not pretended**: a distributable root CLI package is explicitly NOT a supported artifact (the root `package.json` is `private: true` and the application tree — app/, src/studio — is not part of any claimed distributable). What the [60] checks actually protected — the CLI resolving its contracts OUTSIDE the caller's cwd — is preserved as `tests/cli-path-resolution-suite.mjs`, registered in `tests/run-all.mjs`:

- **T-63-1** foreign-cwd `--help` exit 0; `--version` equals the root package version (the `0.0.0` fallback would mean a broken version anchor).
- **T-63-2** foreign-cwd `plan` over the committed #54 inputs → exit 0, 12 sections, 0 errors (resources/schemas/registry resolved from the checkout root).
- **T-63-3** the five committed `adapters/<id>/descriptor.json` files + their `dist/adapters` entries resolve against the root; foreign-cwd `inspect` discovers them and runs `magento-pagebuilder` out-of-process (13 capabilities audited).
- **T-63-4** foreign-cwd fail-closed negative: missing profile → non-zero exit + structured error diagnostic.

## 5. Gates at the receipt head (all re-run on the final tree)

- Root contract suite: **`npm test` → 195/195 checks passed** (was 195 incl. 4 T-60; now 195 incl. 4 T-63 — same total, honest migration).
- Studio module: **`npm run test:studio` → 225/225** (26 files), `npm run typecheck` clean, `npm run lint` clean, `npm run build:app` production build green (all 12 routes).
- Clean-install proof: `rm -rf node_modules dist .next` → ONE `npm ci` → `npm run build` (core + app) green.
- CLI: `node bin/det.js --version` → `0.1.0`.
- Two intentional-fix findings during gate runs (both caught by tests, both path-anchor fixes): `STUDIO_APP_ROOT` depth (build-runner default CLI escaped the checkout — fixed to 1 up) and the moved `real-det-runs` fixture path in `directory-det-run-reader.test.ts`.

## 6. Operator end-to-end proof (single application flow)

`npm run dev` at the repository root (port 3100; launcher self-resolves root, no env needed) and then the production server `npm run start`:

1. `GET /` → 200; Vietnamese stock-antd light shell (`<html lang="vi">`, zero footer elements, 211-byte custom CSS identical to the C61-2 round; zero dark/tailwind/44px hits).
2. `GET /api/build-configs` → `runnerReady: true`, **exactly one** canonical entry `slaunchpad-home-real-derived` — "Slaunchpad Homepage — real-derived (Figma rev 2417494580183108397)", origin repository, listed in place.
3. `POST /api/builds {"configId":"slaunchpad-home-real-derived"}` → 202 (`build-1794394206354` dev; `build-1794394513557` production) → **exit 0**; stages `capability-probe=reused / extraction=completed / composition=completed` (all exit 0); runner invoked **the same root `bin/det.js`** (sanitized journal `command[1] = <repo-root>/bin/det.js`).
4. Gaps verbatim (unchanged truth): `COMPOSITION_SKIPS_PRESENT (10)`, `COMPOSITION_GAPS_PRESENT (12)`, `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED` — still honestly **2/12 composed, 10 skipped, zero proven bindings, `PREVIEW_UNAVAILABLE`**.
5. `GET /api/runs/<id>/artifacts/03-composition/native-content.html` → **3288 bytes, sha256 `6362c6a9…93bdf` == build-manifest declared sha256** — byte-identical across the dev run, the production run, and every pre-migration round (deterministic engine untouched).
6. Committed example project not mutated (`git status` clean on `resources/examples/`); outputs only under the gitignored `out/studio-runs` default.
7. Evidence committed: `docs/studio/screenshots/63-*` (7 screenshots: overview/build/run-detail/catalog desktop 1440px, overview/build narrow 480px, run-not-found) + `63-light-dom-evidence.txt` + sanitized `docs/evidence/issue-63/operator-run.single-application.json`.

## 7. Docs updated (historical artifacts never rewritten)

`README.md` (quick start + gate list), `AGENTS.md` (navigation + Next agent-rules block + gate list), `docs/runbook-real-derived-studio-build.md`, `.claude/skills/det-cli/SKILL.md`, `docs/converter/CONTRACTS.md` (port.ts path), `docs/converter/DECISIONS.md` (new ADR-063-001; ADR-060-001 kept as history), `docs/specs/DET-STUDIO-MVP.md` (banner + §2 layout marked superseded-by-[63], functional contract untouched), `docs/studio/README.md` + spike/data-model notes. `docs/specs/DET-STUDIO-PARALLEL-WORKERS.md` and dated receipts/evidence stay historical verbatim.

## 8. Boundaries honored

No Figma reads/writes; no Magento Admin/CMS/DB/staging/prod writes; no new converter UI/engine features; no schema/diagnostic changes; engine stays framework-independent (no React/Next imports in `src/core`/`adapters` — enforced by tsconfig separation, checked by the neutrality guards). **#65 parallel-work separation:** this PR touches only layout/config/CI/docs paths; no AI-feature code was added or merged (nothing from #65's scope appears in this diff).

## 9. Reviewer rerun commands

```bash
npm ci && npm test                 # 195/195
npm run build                      # core dist + Next production bundle
npm run test:studio                # 225/225
npm run typecheck && npm run lint  # clean
node bin/det.js --version          # 0.1.0 (also from any foreign cwd)
npm run dev                        # → http://localhost:3000/build → Build the real-derived entry
find . -name package.json -not -path '*/node_modules/*'   # exactly one
find . -name package-lock.json -not -path '*/node_modules/*'   # exactly one
```
