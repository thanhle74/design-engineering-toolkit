# slaunchpad-home-real-derived — first real-source Studio build ([56])

A **self-contained, revision-pinned offline build project**: the committed issue #18 live
Figma read of the Slaunchpad Homepage (root `245:2`, provider revision
`2417494580183108397`, 337/337 nodes accounted, 12 sections), materialized into the exact
inputs `det build --config` consumes, so the existing Studio `/build` can run a
**real-derived** project end to end — clearly distinct from the fixture demo
(`g28-example`, built from `src/modules/magento/__tests__/fixtures/g28-home-design-source`).

This directory is portable: every path in `build-config.json` is relative to this file, so
copying the whole directory anywhere (e.g. into the Studio build-projects catalog) works
without edits. No credentials, no provider identifiers, no machine-specific absolute paths.

## What is pinned here

| File | Role | Provenance |
|---|---|---|
| `snapshot-project/figma-home-desktop.245-2.tree.json` | offline design-source tree document (fixture transport) | derived **verbatim** from `docs/evidence/issue-18/live-read-verified/node-ir.json` by `tools/derive-snapshot-tree.mjs`; revision pinned inside (`2417494580183108397`) |
| `profile.json` | converter profile (`slaunchpad-fashion`, `magento-pagebuilder`) | design source = the committed tree document; platform-checkout path stays a placeholder sentinel |
| `capability-registry.json` | pinned capability evidence for the build | produced by **one read-only `det inspect`** of the Owner's local checkout at git HEAD `933b36e78211e571e4fab9a78866a02dc1b5e054` (80 capabilities; `source://slaunch-checkout/...` locators, no absolute paths). Committed so the build is portable and re-runnable |
| `component-bindings.json` | binding map — deliberately **zero** bindings | pinned to the registry revision; no component binding is provable from the committed evidence (28 instances stay `NEEDS_REVIEW`/custom-required) |
| `content-manifest.json` | observed-only content | the three hero text layers (observed as the design layer names at the pinned revision); labeled offline placeholder media URLs (the reviewed [25]/[28] pattern — the operator supplies real assets before any CMS write). Craftsmanship copy and CTA label/link copy are **absent** from the committed extraction and are deliberately not supplied |
| `semantic-projection.json` | the recorded role decision | bounded to the two investigated candidate sections (`SECTION/Hero/Primary` hero shape; `SECTION/Craftsmanship` two-column shape); every assignment carries its observed-evidence reason |

## Provenance proof (locked by `src/modules/studio/__tests__/real-derived-suite.mjs`)

- The committed tree document re-derives **byte-for-byte** from the committed #18 NodeIR
  (R56-T1).
- An offline `det extract` over the committed tree reproduces the committed #18 artifacts'
  stable content hashes for **node-ir** and **source-review** exactly; `page-structure`
  matches except for the registry/binding input pins the build contract itself adds
  (R56-T2).
- `det build` on `build-config.json` exits 0 with the manifest source pin
  `figma-home-desktop @ 2417494580183108397`; the bundle's extraction NodeIR stable hash
  equals the committed #18 NodeIR's (R56-T3).
- Honesty locks: 2 of 12 sections compose (`SECTION/Hero/Primary` → native
  `row > banner(poster)`; `SECTION/Craftsmanship` → native
  `row > column-group > column-line > column(full-height) x2` with `image` elements), 10
  sections carry explicit `skipped` records, content-manifest text entries must equal the
  committed NodeIR node names (no invented copy), and no machine-specific path appears in
  any committed project file (R56-T4/T5).

## Run it

Operator runbook (Studio on Fedora): [docs/runbook-real-derived-studio-build.md](../../../../docs/runbook-real-derived-studio-build.md).
Since [58] the short form is the single-root operator flow — this project is cataloged
**in place** by Studio (no copying, no exports):

```bash
pnpm run setup    # once: one root pnpm install --frozen-lockfile (single root pnpm lockfile) + builds the det core
pnpm run dev      # http://localhost:3000/build
```

Then on `/build`: choose **"Slaunchpad Homepage — real-derived (Figma rev
2417494580183108397)"** (it carries the "repository example" badge), click **Build**,
open the bundle run, and inspect the stage table, the per-section Compose/Review columns
and the gap list. Artifacts (native Page Builder HTML, compose report, extraction
inventory) download only after byte-verification against `build-manifest.json`.

Headless equivalent of the same build (what the Studio runner executes — in place, this
directory stays read-only):

```bash
node bin/det.js build \
  --config resources/examples/build/slaunchpad-home-real-derived/build-config.json \
  --out out/det-bundles/slaunchpad-home-real-derived
```

## CMS install target ([70])

`build-config.json` declares an explicit `cmsInstall` target (`det-studio-homepage`, store
view 0, active) so `det build` also emits the operator-executed install bundle at the bundle
root (`install-homepage.php`, `pagebuilder-content.html`, `mapping-and-gaps.json`,
`README.md`). This is a **dedicated page identifier, explicitly NOT the store default
homepage**: the generated installer never reads or writes the store config value
`web/default/cms_home_page` and never touches any other CMS page. DET itself never writes —
running the installer writes the CMS page only inside the operator's own authorized Magento
installation (run its `--dry-run` first).

## Honest boundaries

- This is an **offline** build from a pinned snapshot of the #18 read. No Figma provider is
  contacted; nothing here is a claim about the file's current state.
- Native Page Builder HTML is **source/download only**: no Magento Admin Save→Reload, no
  storefront render and no visual-pixel claim is proved by this project or any Studio run.
- Media URLs are labeled offline placeholders; real assets are an operator-supplied step
  before any CMS write (which is separately gated anyway).
- Capability evidence comes from the pinned registry produced against the Owner's checkout
  at the pinned commit; the separately committed
  `resources/examples/converter/capability-registry.magento-pagebuilder.example.json` ([54],
  dash-id namespace) remains the plan-side declaration evidence and is unchanged.
- Regenerating the registry requires the Owner's local checkout (read-only
  `det inspect`); everything else in this directory re-derives from committed artifacts.
