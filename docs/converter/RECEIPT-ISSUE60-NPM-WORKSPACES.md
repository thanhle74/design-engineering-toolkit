# [60] RECEIPT — DET npm workspaces: one lockfile and a portable `packages/core`

**Status:** `READY_FOR_COORDINATOR_REVIEW` (implementer does not self-ACCEPT; Owner controls merge)
**Branch:** `thanhle74/60-det-npm-workspaces-one-lockfile-and-portable` · **Base:** `main` @ `11f1141` (#58 merge)
**Worker plan:** 4 read-only workers (W-A core/CLI move inventory · W-B studio/runner audit · W-C packaging/lockfile/CI · W-D tests/docs inventory) → ONE integrator on this branch/worktree (parallel-work contract, `AGENTS.md`).

## 1. What changed (and what deliberately did not)

**Moved as ONE deployable unit into `packages/core` (`@det/core` 0.1.0, private):** `src/` → `packages/core/src`, `adapters/`, `resources/schemas/`, `bin/det.js` — `git mv`, no content edits in any moved engine file. Forced by source evidence: adapter descriptors carry root-relative `entry` values validated by realpath containment inside the engine's anchor (`adapter-runtime.ts`), five adapters import across into `src/core`, one tsconfig `rootDir: "."` mirrors both trees to `dist/src/core/**` + `dist/adapters/**`, and the packed tarball contract (#38) ships schemas + descriptors at package root.

**Preserved compiled-path shape = zero engine edits.** `packages/core/tsconfig.json` is the old root tsconfig + `declaration: true`; the two `import.meta.url` `REPO_ROOT` anchors (`schema-registry.ts:23`, `cli/main.ts:21`) now resolve to `packages/core` — identical layout inside the checkout and inside the npm tarball. No `"exports"` map: deep dist imports stay open for the test harness and the REG-07 foreign-cwd probe. `main`/`types` point at `dist/src/core/cli/main.*`.

**Root became a pure orchestrator:** `workspaces: ["apps/*","packages/*"]`, `build = tsc -p packages/core/tsconfig.json`, engines `>=22.13.0` (the floor every root script already asserted), root `tsconfig.json`/`ajv`/`typescript`/`@types/node` moved into the package, script names/strings unchanged (R58-T5 pins them). Root `bin/det.js` is a byte-compatibility wrapper (`../packages/core/dist/...`, same two error messages, same exit semantics) — `node bin/det.js`, `npm exec det`, Studio's `../../bin/det.js` default, REG-09 and the CI smoke are unchanged.

**One lockfile:** `apps/studio/package-lock.json` (782 entries) deleted; ONE regenerated root `package-lock.json` (lockfileVersion 3, workspace entries `apps/studio` + `packages/core`; `@types/node` 26 nests inside `apps/studio/node_modules`, 22 hoists for core). `scripts/setup.mjs` runs exactly one `npm ci`; `scripts/studio.mjs` checks hoisted-or-local `next` and self-installs at the ROOT. pnpm verdict: a pnpm/yarn lockfile never existed on any branch (`git log --all -- pnpm-lock.yaml` empty) — the issue's "legacy pnpm-lock" clause closed as already-absent.

**CI (`validate.yml`):** studio job = one root `npm ci` + one `npm run build`; `cache-dependency-path` = root lockfile only; the four `working-directory: apps/studio` gates unchanged; contracts job JSON-sanity glob now covers `packages/core/schemas`. Pack portability is regression-gated inside `npm test` (no separate job needed).

## 2. New regression gate — `tests/pack-portability-suite.mjs` (T-60-1..4)

1. `npm pack --workspace @det/core --json` → tarball layout contract: ships `bin/`, `dist/src/core/cli/main.js`+`schema-registry.js`, `resources/schemas/registry.json`, all 5 `adapters/*/descriptor.json`; never `src/`, `tests/`, `node_modules` (124 files).
2. Consumer flow: `tar -xzf` + `npm install --omit=dev` in the extracted dir (the tarball deliberately bundles no deps), then `--help` exit 0 and `--version` from a foreign cwd == the package version — the CLI's silent `0.0.0` fallback would expose a broken version anchor (the only prior test asserted the semver *shape*).
3. Package-root schema resolution: the packed CLI resolves the committed #54 plan inputs offline → exit 0, 12 sections, 0 errors.
4. Fail-closed negative: missing profile → non-zero exit with a structured error diagnostic (CLI contract: JSON on stdout, stderr silent).

REG-04 re-pointed to the honest new anchor lock: `REPO_ROOT === <root>/packages/core`; REG-07's foreign-cwd probe follows the moved dist module. T-18b neutrality scans follow the moved surfaces (`packages/core/{src,adapters,schemas,bin,dist/src}` + root `bin/`), skipping `.d.ts` for the compiled-core scan — declarations mirror *type-level* literals (e.g. the design-source `kind` taxonomy contains `"figma-node"`) that the compiler erases from the runtime surface the guard has always scanned; runtime `.js` output remains fully scanned.

## 3. Verification (exact commands, real output)

| Gate | Command | Result |
|---|---|---|
| Clean clone | `rm -rf node_modules && npm ci && npm test` | **195/195 checks passed**, exit 0 |
| Root gate (rebuild incl.) | `npm test` | **195/195** (191 prior + T-60-1..4), exit 0 |
| Packed CLI (inside gate + manual repro) | `npm pack --workspace @det/core` → extract outside checkout → `node <pkg>/bin/det.js --version` | `0.1.0`, exit 0 |
| CLI wrapper | `node bin/det.js --version` / `--help` | `0.1.0` / usage, exit 0 |
| Studio tests | `cd apps/studio && npm test` | **222/222** vitest (incl. real-CLI build-control E2E through the wrapper) |
| Studio typecheck / lint / prod build | `npm run typecheck && npm run lint && NEXT_TELEMETRY_DISABLED=1 npm run build` | all exit 0, routes compiled |
| Operator E2E (no browser) | root `npm run dev`, NO env → `/api/build-configs` → POST `/api/builds` → poll → artifact download | **10/10 steps** (`docs/evidence/issue-60/operator-run.root-dev.json`): canonical entry origin=repository, build exit 0, journal `command[1] = <root>/bin/det.js`, second POST **409**, `native-content.html` byte-verified 3-way (run-view sha256 == manifest outputs sha256 == downloaded bytes), 10 skips / 12 gaps / `PREVIEW_INSTALL_OPERATOR_GATED` intact, `git status resources/examples/` clean |
| Hoisting sanity | `npm ls @types/node typescript` | `typescript 5.9.3` single copy; `@types/node` 22.20.5 hoisted (core) + 26.6.6 nested (studio) — types-only, both resolve |

## 4. Boundaries / negative side effects

Figma reads/writes: **NO**. Magento CMS/Admin/DB/store/theme writes: **NO**. Live customer assets/secrets: **NO**. Studio component library: **UNTOUCHED** (the Ant Design Light replacement is explicitly a separate issue — this PR is its clean base). Historical receipts/ADR rows: **UNTOUCHED** (append-only: new ADR-060-001 + handoff checkpoint). Engine behavior/schema/ABI: **unchanged** — all committed-example content locks (byte equality) pass unchanged. `kb/`, `resources/profiles/`, `resources/projects/`, `resources/examples/`, `docs/evidence/` stayed at root; no project catalogue duplication; no accidental customer writes (R58-T4 no-write lock passes).

## 5. Known gaps / notes

- `npm install` on npm ≥ 11.19 prints an `allowScripts` advisory for `@swc/core` postinstall (advisory only; CI npm 10 unaffected; studio suite passes regardless).
- The packed tarball intentionally ships no `node_modules`; the consumer flow (`npm install <tarball>` → ajv resolved as the declared dependency) is exercised by T-60-2, which therefore needs registry/cache access like any install step. Everything else in the gate stays offline.
- `packages/core` stays `private: true` (npm pack works; publish remains blocked by design). `tool.version` provenance now comes from `packages/core/package.json` (same `0.1.0`; no test pins the literal, and the committed-example content locks pass byte-identically).
- Doc check-count drift repaired where living (README 131→195, AGENTS 191→195, CI comment numberized description); historical receipts keep their period numbers by convention.
- Production server mode (`npm run start`) shares the launcher path exercised in dev E2E + the unchanged `apps/studio` scripts; the studio production *build* gate passes. A separate browser-level production-mode run was not re-executed in this receipt (out of the migration's blast radius — identical spawn code, verified in #58).

## 6. Suggested coordinator re-run

```bash
rm -rf node_modules && npm ci && npm test          # one install, 195/195
node bin/det.js --version                          # 0.1.0 via root wrapper
npm pack --workspace @det/core --pack-destination /tmp && mkdir /tmp/p && tar -xzf /tmp/det-core-0.1.0.tgz -C /tmp/p && (cd /tmp/p/package && npm install --omit=dev) && node /tmp/p/package/bin/det.js --version
cd apps/studio && npm test && npm run typecheck && npm run lint && npm run build
npm run dev                                        # root, no env → /build → Build → run page + downloads
```
