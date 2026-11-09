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

## Layout

- `app/` — App Router pages and `app/api/runs/**` route handlers (composition only)
- `components/ui/` — installed shadcn/ui primitives; `components/layout/` — studio shell
- `src/modules/` — feature lanes: `conversions`, `design-tree`, `mapping-review`, `preview`, `artifacts`
- `src/server/` — server-only `DetRunReader` implementations (fixture + directory), path guards
- `src/shared/contracts/` — frozen `StudioRunView` read model derived from `schemas/cli/*` + `schemas/converter/*`

Tests: `npx vitest run <path>` for a lane; `npm test` for the whole studio
suite. Screenshots used for the [29] receipt live in `docs/screenshots/`.
