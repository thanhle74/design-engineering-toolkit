# DET Studio ([29])

Thin review / preview / export UI over the deterministic `det` CLI — a
presentation layer, **not** a conversion engine. Issue [28] owns the engine,
NodeIR/PageStructure, Page Builder / PHTML generation, the isolated DET
Preview Theme and all artifact production. Studio reads validated results and
never regenerates them.

Local trusted operator tool — **not** designed for public / multi-user
deployment (auth, per-run isolation and trust boundaries are future gates).

## Run

```bash
npm install   # once
npm run dev   # http://localhost:3000
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

## Local build control setup ([40])

Build Control (`/build`) triggers **real** offline `det build` runs through a
thin server-only local runner and serves the resulting bundle artifacts
download-verified against `build-manifest.json`. It needs THREE env vars set
before `npm run dev` (unset vars render an explicit not-connected state — the
build page never shows demo data):

```bash
# from the repo root: build the det CLI once (dist/)
npm ci && npm run build

# 1. where finished bundles land (one subdirectory per run/bundle)
export STUDIO_DET_RUNS_DIR="$PWD/out/studio-runs"
mkdir -p "$STUDIO_DET_RUNS_DIR"

# 2. your build-config catalog: one subdirectory per entry
export STUDIO_BUILD_PROJECTS_DIR="$PWD/out/studio-build-projects"
# The committed example's paths are CONFIG-RELATIVE (they resolve from
# examples/build/), so copying it elsewhere needs a path fix. This one-liner
# writes an equivalent entry with absolute paths that builds from any
# checkout location — replace it with your own project's config for real use:
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

# 3. optional: which det CLI to spawn (default: ../../bin/det.js relative to
#    apps/studio, i.e. this checkout layout; relative values resolve against
#    apps/studio). Also optional: STUDIO_BUILD_TIMEOUT_MS (default 120000).

cd apps/studio && npm install && npm run dev   # http://localhost:3000/build
```

Notes on honesty and scope (also enforced in code and tests):

- Build configs are **offline snapshot builds only** — the schema pins
  `designSource.mode` to `"snapshot"`; the UI offers no live mode.
- Config provenance paths are displayed **as declared** (config-relative);
  the engine resolves and authoritatively validates them at build time.
- One build at a time per Studio process; a second request while busy fails
  with **409** and the live job state. Job journals live under
  `<STUDIO_DET_RUNS_DIR>/.build-jobs/` and are never exposed as runs or
  downloads; a stale `running` journal reads back as `interrupted`.
- A finished bundle appears in the normal run listing. The run page shows the
  stage table and gap list from the manifest; **every** artifact download is
  re-checked against the manifest's per-FILE-BYTE sha256 + byte size first —
  a mismatch (tampered/stale bundle) is a hard refusal.
- Native Page Builder HTML is offered as **source/download only**. No Magento
  storefront or Admin preview is claimed anywhere; installing the output into
  a Magento checkout remains an operator step (a recorded manifest gap).

## Layout

- `app/` — App Router pages (`/`, `/build`, `/runs/[runId]`) and route handlers under `app/api/**` (composition only)
- `components/ui/` — installed shadcn/ui primitives; `components/layout/` — studio shell
- `src/modules/` — feature lanes: `conversions`, `design-tree`, `mapping-review`, `preview`, `artifacts`
- `src/server/` — server-only boundary: `DetRunReader` implementations (fixture + directory), the `[40]` build-bundle reader, build-config catalog, local build runner, path guards
- `src/shared/contracts/` — frozen `StudioRunView` read model derived from `schemas/cli/*` + `schemas/converter/*` (with the `[40]` additive optional `build` block)

Tests: `npx vitest run <path>` for a lane; `npm test` for the whole studio
suite. The `[40]` build-control tests drive the REAL `det CLI` — build the
repo root first (`npm ci && npm run build` at the checkout root, see the CI
`studio` job). Screenshots used for the [29]/[40] receipts live in
`docs/screenshots/`.
