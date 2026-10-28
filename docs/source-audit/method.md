# Source audit method

How stage **S2 (Audit)** inventories a Figma source and classifies it into the `source-manifest`. Worked example: [secomm-launchpad-fashion.md](secomm-launchpad-fashion.md).

## Goal

Produce a *curated, evidence-backed* inventory of a source file — what is genuinely reusable, what needs normalization, what is reference-only — **without** dumping every frame into JSON. The manifest is the audit of record: anything not classified in it may not enter contracts (stage S3) or composition (stage S4).

## Procedure

1. **Bound the audit.** Only pages/node scopes listed in the profile's `sources[].scopes` are read. Everything outside is invisible — widen scopes deliberately, not accidentally.
2. **Enumerate pages.** Read top-level page structure (Figma MCP `get_metadata`, no node id). Record every page, including empty ones (`IGNORE` class keeps them visible in the manifest).
3. **Probe for machine-readable design data first.** Query the design system for **variables** and **styles** (Figma MCP `search_design_system`). Record `variables.present` / `styles.present` honestly — including `false`. This single check decides whether tokens will be `observed` (harvested) or `derived` (normalized from artwork).
4. **Inventory components.** For each component-bearing page, extract component sets and count variant symbols; parse variant names into property sets (e.g. `Hierarchy=Primary, State=Default, …`). Record per-group stats (symbols/instances/frames/texts) from `get_metadata` — counts only, no bulk node export.
5. **Inventory icon sets.** Count glyph families, style variants (fill/outline), and size scales; capture the naming convention. Sample glyph names only (≤ 30).
6. **Inspect compositions.** For layout/reference pages, read the frame structure and confirm visually (`get_screenshot`) whether the page is complete or a partial draft. Never assume a "Home page" is finished because it is named like one.
7. **Classify** each page and node group with the rubric below; attach diagnostics for every anomaly found.
8. **Provenance sweep.** Identify imagery, logos, and fonts visible in the source; record `licenseStatus` (`unconfirmed` is the honest default until checked).

## Classification rubric

| Class | Test | Examples |
|---|---|---|
| `REUSE` | A genuine Figma component set / variable collection / style — variant-complete and named consistently enough to reference by ID | the `button` set (Hierarchy × State × Style × Size) |
| `NORMALIZE` | Real design information, but as documentation artwork, inconsistent naming, or duplicated groups — usable **after** the toolkit regularizes it | a color "Library" drawn with swatch *components* instead of variables; `theme` vs `Theme` properties |
| `REFERENCE_ONLY` | Drafts, mockups, explorations — context for aesthetic direction, never extracted | hero-only homepage drafts, `Sketch` explorations |
| `UNKNOWN` | Cannot be classified yet | pages not yet inspected inside an in-scope scope |
| `IGNORE` | Empty canvases, covers, separators | `Page 7`, `---` |

**Rules:**
- A class is attached with evidence: node IDs and counts from step 4–6, not impressions.
- `UNKNOWN` **blocks composition** (S4 gate). Resolve or explicitly waive in the manifest.
- Distinguishing demonstration swatches from genuine styles is the whole point of step 3 — a drawn rectangle is artwork, a variable is data. When unsure, classify `NORMALIZE` and diagnose `SOURCE_DATA_ARTWORK_ONLY`.
- The audit is read-only by construction: `get_metadata`, `search_design_system`, `get_variable_defs`, `get_screenshot` only. No write-capable tool runs against a source file.

## Diagnostics vocabulary (growing list)

| Code | Severity | Meaning |
|---|---|---|
| `NO_FIGMA_VARIABLES` | info | Source declares no variable collections; tokens must be derived |
| `NO_FIGMA_STYLES` | info | Source declares no published styles; text/fill specs live in artwork |
| `SOURCE_DATA_ARTWORK_ONLY` | warning | Design data exists only as drawn/typed demonstration content |
| `VARIANT_NAMING_INCONSISTENT` | warning | Variant property names inconsistent across sibling groups (`theme` vs `Theme`, `Style = X` vs `Style=X`) |
| `DUPLICATE_COMPONENT_GROUPS` | warning | Multiple groups cover the same concept (`button` vs `button/base`) |
| `LEGACY_GROUP_PRESENT` | info | A `Legacy/`-prefixed or superseded group exists |
| `SOURCE_PAGE_PARTIAL` | warning | A composition page is visibly incomplete (empty regions, missing breakpoint) |
| `LICENSE_UNCONFIRMED` | warning | Asset/font provenance not yet verified |
| `UNSUPPORTED_ENTITY` | error | Entity cannot be represented in the contract; blocks its use in S4 |

## Outputs

- `source-manifest` payload (validated against [`schemas/source-manifest.schema.json`](../../schemas/source-manifest.schema.json))
- A human-readable audit document per source (see the worked example) linked from the manifest's `audit.auditDocUrl`.
