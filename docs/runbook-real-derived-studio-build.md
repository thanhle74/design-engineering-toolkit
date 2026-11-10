# Runbook — first real-source Studio build ([56])

One labeled **real-derived** Slaunchpad Homepage project (from the committed #18 live Figma
read, revision `2417494580183108397`) run through the existing offline engine and the
existing Studio `/build`. Tested end to end on Fedora (workstation Linux) with Node ≥ 22.13.

Commands below run from the repository root unless stated. One-time setup is marked.

## 1. Build the engine and start Studio

```bash
# one-time (also required again after pulling engine changes)
npm ci && npm run build          # compiles dist/ — the det CLI the Studio runner spawns

# Studio dependencies (one-time; apps/studio has its own lockfile)
cd apps/studio && npm install && cd ../..

# Studio env: where bundles land + where build-config entries are listed from
export STUDIO_DET_RUNS_DIR="$PWD/out/studio-runs"
export STUDIO_BUILD_PROJECTS_DIR="$PWD/out/studio-build-projects"
mkdir -p "$STUDIO_DET_RUNS_DIR" "$STUDIO_BUILD_PROJECTS_DIR"

# register the real-derived project (self-contained; no path edits needed)
cp -r examples/build/slaunchpad-home-real-derived "$STUDIO_BUILD_PROJECTS_DIR/"

# start Studio (dev or production build)
cd apps/studio && npm run dev            # http://localhost:3000
# …or: npm run build && npm start
```

The optional `STUDIO_DATA_DIR` catalogue mode ([50]) is independent of this workflow.

## 2. Run the real-derived build

1. Open **http://localhost:3000/build**.
2. Two entries are listed (plus any of your own):
   - **G28 example (fixture demo)** — the shipped fixture build, clearly labeled demo.
   - **"Slaunchpad Homepage — real-derived (Figma rev 2417494580183108397)"** — the
     real-source project. Its declared provenance paths are shown as declared; the engine
     validates them at build time.
3. Click **Build** on the real-derived entry. The runner executes the real
   `det build --config` offline (one build at a time; a second concurrent request fails
   with 409).
4. When the alert reads **Build completed (exit 0)**, open **"Open the bundle run"**.

## 3. Read the results honestly

On the run page:

- **Stage table** — `capability-probe: reused` (the pinned registry is consumed, never
  re-probed), `extraction` and `composition: completed`.
- **Gaps and boundaries** — the measured state, never a completeness claim:
  `COMPOSITION_SKIPS_PRESENT · count 10` (10 of 12 sections are outside the reviewed
  composer shapes), `COMPOSITION_GAPS_PRESENT · count 12`, plus the standing
  preview-install/asset boundaries.
- **Source design tree** — all 12 real sections with per-node **Compose** vs **Review**
  columns: `SECTION/Hero/Primary` and `SECTION/Craftsmanship` compose into native Page
  Builder shapes; everything else shows its explicit skip/gap reason. Hidden site chrome is
  excluded from the plan but visible in the review.
- **Preview** — reads `PREVIEW_UNAVAILABLE` by design: no verified DET Preview Theme render
  is bound to a plain build bundle, and Studio never renders a mock screenshot as Magento
  proof. This is the accurate state for **any** `det build` bundle today (fixture demo
  included).
- **Artifacts** — `native-content.html` (the composed native Page Builder HTML),
  `compose-report.json` (per-node mapping ledger), the extraction inventory
  (`node-ir` / `page-structure` / `source-review`), stage `tool-run.json` envelopes and
  `build-manifest.json`. Every download is re-verified against the manifest's per-file
  SHA-256 + byte size before it is served.

## 4. Provenance expectations (what makes this "real-derived")

- The bundle manifest pins `source: figma-home-desktop @ 2417494580183108397` — the #18
  provider revision, not a fixture revision.
- The extraction inventory in the bundle is **stable-hash identical** to the committed
  `evidence/issue-18/live-read-verified/node-ir.json` (locked by `tests/real-derived-suite.mjs`,
  checks R56-T1…T6; run `npm test` to re-verify the whole chain offline).
- Media URLs in the composed HTML are **labeled offline placeholders**; supply real assets
  via the project's `content-manifest.json` before any CMS use (writes are separately
  gated regardless).

## 5. CLI equivalent (no browser)

```bash
node bin/det.js build \
  --config examples/build/slaunchpad-home-real-derived/build-config.json \
  --out out/det-bundles/slaunchpad-home-real-derived
```

Exit 0 = all stages completed; the bundle layout matches what Studio serves above.

## Troubleshooting

- **`det: compiled core not found`** — run `npm run build` at the repository root (the
  Studio runner and CLI both need `dist/`).
- **The build page shows "not connected"** — the two `STUDIO_*` env vars were not set
  before starting Studio; set them and restart `npm run dev` / `npm start`.
- **Port already in use** (e.g. `EADDRINUSE :3000` — a leftover Studio from another
  workspace) — either stop that process or start on another port: `PORT=3100 npm run dev`
  and use http://localhost:3100.
- **409 on Build** — one build at a time per Studio process; wait for the current job.
- **A download is refused** — the bundle's bytes no longer match `build-manifest.json`
  (stale or tampered bundle); re-run the build.
