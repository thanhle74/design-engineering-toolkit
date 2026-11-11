# DET Studio ([29])

Thin review / preview / export UI over the deterministic `det` CLI — a
presentation layer, **not** a conversion engine. Issue [28] owns the engine,
NodeIR/PageStructure, Page Builder / PHTML generation, the isolated DET
Preview Theme and all artifact production. Studio reads validated results and
never regenerates them.

Local trusted operator tool — **not** designed for public / multi-user
deployment (auth, per-run isolation and trust boundaries are future gates).

## Run

**Primary operator path ([58]):** from the REPOSITORY ROOT (not this dir):

```bash
npm run setup   # once: one root npm ci (single npm-workspaces lockfile, [60]) + builds the det core
npm run dev     # http://localhost:3000/build — repository examples are cataloged in place
```

`npm run dev` at the root launches this app with `STUDIO_DET_RUNS_DIR`
defaulted to `<root>/out/studio-runs` (created on demand) and the root `det`
dist built. `npm run start` at the root is the production-mode equivalent
(`next build` + `next start`). This dir's own scripts stay for Studio
development:

```bash
npm run dev     # http://localhost:3000 (needs the env vars from [40] below)
```

Other commands: `npm run build` · `npm start` (serve the production build) ·
`npm test` (vitest) · `npm run lint` · `npm run typecheck`.

## Data modes

- **Fixture mode (default).** With no configuration, Studio serves the single
  labeled DEMO fixture (`src/shared/fixtures/demo-run.json`, runId
  `demo-run-245-2`). Downloads are intentionally unavailable; preview shows
  `PREVIEW_UNAVAILABLE`.
- **Live read mode.** Set `STUDIO_DET_RUNS_DIR` to a directory of det output
  runs (one subdirectory per run, each containing `tool-run.json` plus the
  artifacts it declares). The server-side reader validates every payload,
  enforces realpath containment / extension / size limits, and only serves
  manifest-declared files for download. No CLI invocation, no Figma API, no
  CMS writes — ever — from Studio.
- **Catalogue mode ([50], opt-in).** Set `STUDIO_DATA_DIR` to a local
  directory to persist project/run metadata in `<dir>/studio.sqlite` (Node
  ≥ 22.13 built-in `node:sqlite`; see
  `docs/sqlite-driver-spike.md`). The `/catalog` page and `/api/catalog`
  then survive restarts: indexed build bundles, frozen config/source pins,
  truthful run states and per-artifact integrity. Unset → no DB anywhere and
  the modes above behave byte-for-byte as before. Files stay the truth: the
  catalogue indexes metadata verified against the build manifest's per-file
  sha256/bytes, and downloads are still re-verified live on every read — a
  DB row never makes a missing/tampered file downloadable. See
  `docs/catalog-data-model.md` for the schema, backup/restore and recovery
  behavior.

## Local build control ([40], single-root operator flow [58])

Build Control (`/build`) triggers **real** offline `det build` runs through a
thin server-only local runner and serves the resulting bundle artifacts
download-verified against `build-manifest.json`.

**Default local operation needs NO env setup** — start it from the repository
root with `npm run dev` (one-time `npm run setup` first). Then:

- **Catalogue (in place, [58]).** The build-config catalogue is the union of
  the committed repository examples (`examples/build/*` — the revision-pinned
  real-derived Slaunchpad project is listed and buildable IN PLACE, never
  copied into `out/`) plus caller-configured entries from
  `STUDIO_BUILD_PROJECTS_DIR` when set. Unrelated fixture directories are
  never promoted; a configured entry with the same id overrides the
  repository example. Repository entries carry a "repository example" badge;
  the engine resolves and validates every config at build time.
- **`STUDIO_DET_RUNS_DIR`** — where finished bundles land (one subdirectory
  per run/bundle). Required by the runner; the root `npm run dev`/`npm run
  start` launchers default it to `<root>/out/studio-runs` and create it, so
  operators normally never export it. An unset env renders the honest
  not-ready state — the build page never shows demo data.
- **Optional:** `STUDIO_DET_CLI` (which det CLI to spawn; default
  `../../bin/det.js` relative to apps/studio, i.e. this checkout layout;
  relative values resolve against apps/studio), `STUDIO_BUILD_TIMEOUT_MS`
  (default 120000), and `STUDIO_DATA_DIR` (the [50] catalogue DB). To add
  your OWN build projects, point `STUDIO_BUILD_PROJECTS_DIR` at a directory
  of entries (one subdirectory per entry with a `build-config.json`); the
  fixture demo (`g28-example`) can be created there with this one-liner if
  you want it listed too:

```bash
export STUDIO_BUILD_PROJECTS_DIR="$PWD/out/studio-build-projects"
mkdir -p "$STUDIO_BUILD_PROJECTS_DIR"
node -e '
const fs=require("fs"),path=require("path");
const root=process.cwd(), fx=path.join(root,"tests/fixtures/g28-home-design-source");
const dir=path.join(process.env.STUDIO_BUILD_PROJECTS_DIR,"g28-example");
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,"build-config.json"),JSON.stringify({
 schemaVersion:1,profileId:"g28-home-preview",
 profile:path.join(fx,"profile-g28-home-fixture.json"),
 designSource:{mode:"snapshot",project:fx,designFile:"design-tree-home-desktop.fixture.json",designNode:"245:2"},
 capabilityProbe:{project:path.join(root,"tests/fixtures/g3-magento-like")},
 bindings:path.join(fx,"g28-component-bindings.fixture.json"),
 content:path.join(fx,"g28-home-content.fixture.json"),
 projection:path.join(fx,"g28-home-projection.fixture.json")
},null,2));'
# optional human label: $STUDIO_BUILD_PROJECTS_DIR/g28-example/project.json
#   {"label": "G28 example", "description": "offline example build"}
```

Notes on honesty and scope (also enforced in code and tests):

- Build configs are **offline snapshot builds only** — the schema pins
  `designSource.mode` to `"snapshot"`; the UI offers no live mode.
- Config provenance paths are displayed **as declared** (config-relative);
  the engine resolves and authoritatively validates them at build time.
- The committed repository catalogue is **read-only**: builds write only
  under the configured runs root (and optional explicit SQLite path), never
  into `examples/build/`.
- One build at a time per Studio process; a second request while busy fails
  with **409** and the live job state. Job journals live under
  `<STUDIO_DET_RUNS_DIR>/.build-jobs/` and are never exposed as runs or
  downloads; a stale `running` journal reads back as `interrupted`.
- A finished bundle appears in the normal run listing. The run page shows the
  stage table and gap list from the manifest; **every** artifact download is
  re-checked against the manifest's per-FILE-BYTE sha256 + byte size first —
  a mismatch (tampered/stale bundle) is a hard refusal.
- With `STUDIO_DATA_DIR` set, the runner also records job/run metadata in the
  local catalogue (best-effort; a catalogue problem never blocks a build).
- Native Page Builder HTML is offered as **source/download only**. No Magento
  storefront or Admin preview is claimed anywhere; installing the output into
  a Magento checkout remains an operator step (a recorded manifest gap).
- The committed **real-derived** example — the issue [#18] live Figma read
  (revision-pinned) materialized as a portable offline build project — is the
  canonical catalogue entry ([56] receipt:
  `docs/converter/RECEIPT-ISSUE56-REAL-DERIVED-STUDIO-BUILD.md`); the
  operator runbook is `docs/runbook-real-derived-studio-build.md`.

## Theme ([61])

Light-only by owner direction — Ant Design 6 is the single source of
component theming. `StudioProviders`
(`components/layout/studio-providers.tsx`) sets `ConfigProvider` with
`theme.defaultAlgorithm` explicitly: no dark algorithm, no toggle, no OS
theme switching. The root layout composes `AntdRegistry` +
`StudioProviders` (ConfigProvider plus the antd `App` wrapper, so antd
message/notification context works without per-call contextHolders) and
antd styles are injected server-side, so the first paint is already styled
(no FOUC). Tokens: `controlHeight: 44` carries the ≥44px operator
click-target requirement into every Button/Input/Select (Menu
`itemHeight: 44` likewise); everything else stays on antd's calm neutral
light defaults with comfortable whitespace — enterprise tool aesthetics,
not a card-heavy dashboard. `app/globals.css` is light-only (`:root` only)
and Tailwind remains only for layout utilities inside Studio — the
Magento/Hyvä adapter and the Preview Theme Tailwind contract are
unchanged. No dark tokens or `dark:` classes exist anywhere in the Studio
app. The [52] evidence assets (`docs/screenshots/52-*.png` and
`52-dark-only-dom-evidence.txt`) show the retired dark UI and are
preserved as history.

## Layout

- `app/` — App Router pages (`/`, `/build`, `/runs/[runId]`) and route handlers under `app/api/**` (composition only)
- antd primitives are used directly — no `components/ui` library, only tiny feature-specific wrappers where needed; `components/layout/` — studio shell plus `studio-providers` (the [61] antd light-only root providers)
- `src/modules/` — feature lanes: `conversions`, `design-tree`, `mapping-review`, `preview`, `artifacts`
- `src/server/` — server-only boundary: `DetRunReader` implementations (fixture + directory), the `[40]` build-bundle reader, build-config catalog, local build runner, path guards
- `src/shared/contracts/` — frozen `StudioRunView` read model derived from `schemas/cli/*` + `schemas/converter/*` (with the `[40]` additive optional `build` block)

Tests: `npx vitest run <path>` for a lane; `npm test` for the whole studio
suite. The `[40]` build-control tests drive the REAL `det CLI` — build the
repo root first (`npm ci && npm run build` at the checkout root, see the CI
`studio` job). Screenshots used for the [29]/[40] receipts live in
`docs/screenshots/`.
