# Receipt — Chore: package manager switched from npm to pnpm (no GitHub issue — `[chore]`)

Date: 2026-11-12 · Branch: `thanhle74/chore-switch-npm-to-pnpm` (off `main` @ a759968) · Tool: pnpm 12.18.0, Node 24.22.2, Fedora Linux.

## Summary

The root application ([63] ONE package.json, ONE lockfile) now installs with **pnpm** instead of npm. The npm lockfile is deleted and replaced by a committed `pnpm-lock.yaml`; the pnpm version is pinned via `packageManager` in `package.json`; every operator/CI path installs with `pnpm install --frozen-lockfile` against that single lockfile. No engine, schema, CLI, adapter or UI behavior changed — the deterministic engine is untouched; only the dependency-manager seam moved.

- **Pinned toolchain:** `package.json` → `"packageManager": "pnpm@12.18.0"`. CI installs exactly this version via `pnpm/action-setup@v4` (reads the field).
- **Single lockfile parity:** `package-lock.json` DELETED; ONE root `pnpm-lock.yaml` is the SSOT (lockfileVersion 9.0, records `packageManagerDependencies: pnpm 12.18.0`). The [63] "one package, one lockfile" contract survives — only the lockfile format changed.
- **`pnpm-workspace.yaml`** exists ONLY as pnpm 11+ settings home (`allowBuilds: { "@swc/core": true }` — the one dependency whose postinstall places a native binary, needed by `@vitejs/plugin-react-swc` in the Studio vitest suite). It has **no `packages:` entries and there are no subordinate manifests** — it is NOT an npm-style workspace declaration, so the [63] no-workspaces invariant is intact.
- **Scripts:** root `build`/`test` call `pnpm run …` internally; script NAMES and their `node scripts/*.mjs` wiring are unchanged (R58-T5 values identical).
- **Launchers:** `scripts/setup.mjs` and `scripts/studio.mjs` spawn `pnpm install --frozen-lockfile` / `pnpm run …` at the repository root; the [58] launcher contract is byte-preserved (`print-env` keys, runs-dir default, Node ≥ 22.13 assert, single-slot 409 unchanged).
- **CI:** `.github/workflows/validate.yml` — both jobs: `pnpm/action-setup@v4` → `actions/setup-node` with `cache: pnpm` → `pnpm install --frozen-lockfile`; every command is the `pnpm` equivalent (`pnpm test`, `pnpm run build`, `pnpm run test:studio`, `pnpm run typecheck`, `pnpm run lint`). The workflow stays issue-agnostic.
- **Live docs updated** (dated receipts/specs/evidence keep their wording per the no-rewrites rule): `README.md`, `AGENTS.md`, `docs/studio/README.md`, `docs/runbook-real-derived-studio-build.md`, `docs/knowledge/README.md`, `resources/schemas/README.md`, `resources/schemas/converter/README.md`, `resources/examples/build/slaunchpad-home-real-derived/README.md`, `.claude/skills/det-cli/SKILL.md`, `.claude/skills/det-review-receipt/SKILL.md`; two user-facing messages (`src/core/adapter-runtime.ts` "run the build (pnpm run build)", `src/modules/studio/server/test-helpers/det-cli.ts` "`pnpm install && pnpm run build`") and the R58-T5 check label. `.gitignore`: `npm-debug.log*` → `pnpm-debug.log*`.
- `docs/specs/CHATGPT-COORDINATOR-HANDOFF.md` is left untouched on purpose: its `npm` gate lines are dated records of gates run at their historical heads under npm. The live gate truth is this receipt + `AGENTS.md` (now `pnpm`).

## Gates (all run with pnpm on the exact receipt head)

- `pnpm install` (fresh, after `rm -rf node_modules`) → clean resolution; `pnpm install --frozen-lockfile` → exit 0 ("Lockfile is up to date").
- Root contract suite: **`pnpm test` → 195/195 checks passed** (same total as the npm-era gate — every suite unchanged, incl. the [63] foreign-cwd root path-resolution suite).
- Studio module: **`pnpm run test:studio` → 375/375 tests passed (37 files)**; `pnpm run typecheck` clean; `pnpm run lint` clean.
- Full production build: **`pnpm run build` → core dist + Next 16 production bundle green (14/14 routes, "Compiled successfully")** — first pnpm-layout proof for antd 6.7.0 + next 16.4.5 (isolated node_modules; no hoisting shims needed).
- CLI smoke: `node bin/det.js --version` → `0.1.0`; foreign-cwd `node bin/det.js --help` from `/tmp` → usage banner (the [63] cwd-independent resolution unaffected by the node_modules layout change).
- [58] launcher: `node scripts/studio.mjs print-env` → identical JSON keys (`root`, `studioDir`, `coreDistEntry`, `coreDistFresh`, `studioDepsInstalled`, `env.*`), `studioDepsInstalled: true` under the pnpm layout.

## Boundaries honored

No Figma reads/writes; no Magento CMS/Admin/DB writes; no engine/schema/CLI/adapter source changes beyond the two message strings named above; historical receipts/ADRs/specs/evidence never rewritten; no merge/self-merge — this branch is left for Owner review.
