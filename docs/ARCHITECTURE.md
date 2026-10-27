# Design Engineering Toolkit — Architecture (V1 SSOT)

> **Status:** DRAFT for human review (issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1)).
> This document is the single source of truth for V1 architecture, contracts, and boundaries. Other docs and schemas are normative annexes linked from here. Nothing in this repository has been executed against a live target; all Figma findings come from read-only audits.

## 1. Purpose and V1 boundary

A reusable, project-agnostic pipeline that turns an existing Figma style guide into normalized design contracts and composes a **new, editable Figma page** that survives visual QA — for any client, brand style, or frontend platform.

**V1 pipeline (the only supported path):**

```
Discover Figma style guide
  → normalize design tokens / components (versioned JSON)
    → compose an editable Figma page in an approved destination
      → visual QA + evidence receipt
```

**Explicitly out of V1** (see [safety-and-scope.md](safety-and-scope.md)): Magento/Hyvä adapters, Page Builder importers, any CMS/DB write, compilers, bulk raw node export, edits or deletions in source Figma files. Adapter selection is a profile field reserved for future majors — the *contracts* below are already platform-neutral so adapters become consumers, not redesigns.

## 2. Design principles

1. **Design-first.** Contracts describe design intent (semantic roles, variants, states), not any frontend's serialization format.
2. **Project data lives in profiles, never in core.** Toolkit core contains no brand colors, fonts, copy, or business rules. Two projects must be able to run the same pipeline with nothing but different profile files (validated by the two examples in [`profiles/`](../profiles/)).
3. **Curate, don't dump.** Source Figma is audited and classified before extraction; demonstration artwork and one-off drafts are excluded from contracts by default.
4. **Observed ≠ machine-readable.** A swatch *drawn* in Figma is not a Figma variable. The SECOMM audit found **zero Figma variables and zero styles** in the reference file — the toolkit must distinguish these and record how each token was obtained (`observed` from a real style/variable, `derived` from documented artwork, `illustrative` placeholder pending extraction).
5. **Evidence over claims.** Every stage emits an artifact; every gate has a measurement; nothing is "done" without a receipt a human can check.
6. **Human gates on writes.** Source files are read-only, always. The compose stage writes only to a destination that the profile explicitly marks as approved.

## 3. System layers

| Layer | Contents | May contain project data? |
|---|---|---|
| **Core** (this repo) | Orchestrator spec, JSON schemas, audit method, quality gates, safety rules | No |
| **Profile** (`profiles/*.json`) | Per-project sources, business context, aesthetic direction, destination, content policy, gate thresholds | Yes — everything project-specific |
| **Sources** | Read-only Figma files (style guides, references), referenced by fileKey + node scopes | Referenced, never mutated |
| **Contracts** (`examples/`, produced per run) | `source-manifest`, `design-tokens`, `component-defs` JSON payloads | Per-project *data* under *neutral* schemas |
| **Destination** | A Figma file approved for writes (V1: a fresh file created only after an explicit GO) | Project output |

## 4. Pipeline and orchestrator

One entrypoint — a `design-toolkit` orchestrator skill (authored in implementation phase P1, specified here) — reuses the official Figma MCP skills and walks five stages. Each stage consumes and emits contract artifacts and stops at its checkpoint.

| Stage | Reads | Writes | Figma MCP usage | Checkpoint before proceeding |
|---|---|---|---|---|
| **S0 Preflight** | profile | validation report | none | Profile passes `project-profile.schema.json`; destination policy resolved |
| **S1 Discover** | profile.sources | raw inventory (session-local) | `create_session`, `get_metadata`, `search_design_system`, `get_variable_defs`, `get_screenshot` (all read-only) | Inventory bounded to profile scopes |
| **S2 Audit** | inventory, audit method | `source-manifest` | read-only | Every classified group has a sourceRef + classification; UNKNOWN items listed, never silently dropped |
| **S3 Normalize** | `source-manifest` | `design-tokens`, `component-defs` | read-only | Both payloads validate; every entry carries provenance + sourceRef; `illustrative` entries flagged |
| **S4 Compose** | contracts | **new Figma file** (only after human GO), one responsive page | `create_new_file`, `use_figma`, `upload_assets`, `search_design_system` (destination-side reuse) | Destination approval recorded in profile; no writes to any source fileKey |
| **S5 Visual QA** | destination screenshots vs source references | QA report + evidence receipt | `get_screenshot` | Gates G1–G5 measured (see below); deviations documented; receipt posted for human review |

**Orchestrator rules:**
- The orchestrator is a *controller*, not a design system. It holds no aesthetic opinions; aesthetics come from the profile (`aesthetic.direction` + reference designs).
- It invokes official Figma skills (`/figma-use`, `/figma-design-to-code`, `/figma-create-new-file`) rather than re-implementing Figma interaction, and follows their mandatory preloads.
- Platform adapter selection (`profile.platform.adapter`) exists as a reserved field. In V1 the only legal value is `figma-only`; anything else fails S0.
- Every Figma write happens inside a session created for the approved destination fileKey only.

## 5. Contracts

Four versioned JSON Schemas (Draft 2020-12) under [`schemas/`](../schemas/). All payloads carry `schemaVersion` (integer **major**; minor/patch tracked in [schemas/README.md](../schemas/README.md) — additive-only within a major). Validation strategy: JSON Schema via `ajv` in CI once implementation phase P1 lands; until then examples in [`examples/`](../examples/) are hand-validated against the schemas.

| Contract | File | Purpose | Key fields |
|---|---|---|---|
| **Project profile** | `project-profile.schema.json` | Per-project inputs & permissions | `sources`, `aesthetic`, `targets`, `content`, `platform`, `gates`, `safety` |
| **Source manifest** | `source-manifest.schema.json` | What exists in each source, classified, with diagnostics | `sources[].pages[].classification`, `audit`, `diagnostics` |
| **Design tokens** | `design-tokens.schema.json` | Semantic tokens: color, typography roles, spacing, radius; aliases + modes | `primitive`, `semantic`, `typography`, `modes`, `provenance`, `diagnostics` |
| **Component definitions** | `component-defs.schema.json` | Component sets: props/variants/states/slots/breakpoints, icon sets | `components[].props/variants/states`, `icons`, `diagnostics` |

**Cross-cutting rules (normative):**
- Every extractable entity carries `sourceRef {fileKey, nodeId, page}` back to Figma, plus `provenance.class` ∈ `observed | derived | illustrative`.
- Semantic values reference primitives by alias (`{primitive.color.ink-900}`) — one definition, many roles.
- Modes (e.g. `light`/`dark`) are declared once in `modes`; token values may vary per mode.
- Diagnostics use structured codes (`NO_FIGMA_VARIABLES`, `VARIANT_NAMING_INCONSISTENT`, `SOURCE_PAGE_PARTIAL`, `UNSUPPORTED_ENTITY`, …) with severity — never prose-only.
- Deletions are unrepresentable: no contract field expresses "remove from source".

## 6. Source classification rubric

Applied per page/node-group during S2; full method in [source-audit/method.md](source-audit/method.md), worked example in [source-audit/secomm-launchpad-fashion.md](source-audit/secomm-launchpad-fashion.md).

| Class | Meaning | Enters contracts? |
|---|---|---|
| `REUSE` | Genuine Figma component set / variable / style, variant-complete | Yes — referenced by ID |
| `NORMALIZE` | Real design information present but as documentation artwork, inconsistent naming, or duplicated groups | Yes — after normalization, with diagnostics |
| `REFERENCE_ONLY` | Drafts, mockups, explorations — context, not extractable system | No (referenced in manifest only) |
| `UNKNOWN` | Unclassified | No — must be resolved or explicitly waived before S4 |
| `IGNORE` | Empty canvases, separators, covers | No |

## 7. Quality gates (summary)

Measurable definitions in [quality-gates.md](quality-gates.md). Thresholds are defaults; profiles may tighten, never loosen, them.

| Gate | Measures | Default threshold |
|---|---|---|
| **G1 Source fidelity** | Token/component entries traceable to a real source node; no invented brand assets | 100% traceable; 0 invented |
| **G2 Editability** | Native text layers, real component instances, working variants in destination | 100% |
| **G3 Reuse** | Placed UI built from audited components/instances vs one-offs | ≥ 80% instance ratio |
| **G4 Accessibility & responsive** | WCAG AA contrast on declared token pairs; renders at all profile breakpoints | AA pass; 0 overflow |
| **G5 Provenance & licensing** | Every external asset/font has license + source; content matches profile policy | 100% documented |

## 8. Safety model (summary)

Full rules in [safety-and-scope.md](safety-and-scope.md). Invariants: source files read-only; deletes impossible by construction; writes only to profile-approved destinations; one approved target per run; human GO required for destination file creation; evidence receipt required before any human acceptance; no production system contact (CMS, DB, storefront) in V1.

## 9. Bounded V1 implementation plan

| Phase | Scope | Exit criteria | Depends on |
|---|---|---|---|
| **P0 — Architecture (this PR)** | This docs + schemas package; source audit; profile examples; pilot scope | Human approval of PR; issue #1 definition-of-ready checked | — |
| **P1 — Core implementation** | `design-toolkit` orchestrator skill (S0–S5 controllers); ajv validation in CI for schemas + examples; audit report generator | Schemas validate in CI; orchestrator runs S0–S3 end-to-end read-only against the SECOMM file reproducing the audit | P0 approved |
| **P2 — Pilot (issue #2)** | Fresh destination file (after explicit GO), one responsive page, tokens/components from SECOMM audit, QA receipt | All gates G1–G5 measured and passing or explicitly waived; evidence receipt posted on #2 | P1 + destination GO |
| **P3 — Hardening** | Second profile dry-run (commerce-promotional example made real), deviation handling, docs from pilot lessons | Two profiles run through S0–S3 with zero core changes — the neutrality test | P2 |

Non-goals for all phases are listed in [safety-and-scope.md](safety-and-scope.md) §3.

## 10. Decision log

| Decision | Rationale |
|---|---|
| Tokens are normalized, not harvested — schema assumes *no* Figma variables/styles exist | SECOMM audit found zero of either; assuming them would break on day one |
| Contracts are platform-neutral JSON, adapters consume them | Keeps Magento/Page Builder ([slaunchpad#42](https://github.com/thanhle74/slaunchpad/issues/42)) as a future consumer without contract redesign |
| Classification happens in a manifest, not in tokens/components | Keeps extraction decisions auditable and reversible without touching normalized payloads |
| Integer `schemaVersion` majors only, additive minors in docs | Minimal versioning burden for a V1; breaking changes get a new major + migration note |
| Icons are a first-class section of `component-defs`, not tokens | 2,300 icon symbols with size variants behave like components (sets + variants), not values |
| Home page in source treated as REFERENCE_ONLY | Audit showed it is a hero-only draft (top ~2,048px of a 6,398px frame, no mobile) — composing the pilot page is the pilot's job, not a copy |
| `UNKNOWN` blocks compose (S4) | Prevents silent curation gaps from becoming invisible design decisions |

## 11. Open questions (for review)

1. **Icon licensing** — the source icon sets resemble Heroicons (MIT) but provenance is unconfirmed. G5 requires confirmation before icons enter a composed page. Confirm with the design owner?
2. **Font identification** — the serif display family is visible in artwork but its exact family/license is not yet extracted. Must be resolved in P2 before text composition (G5).
3. **Destination file ownership** — which Figma account/team owns the pilot destination, and who approves the GO? (Blocks S4, not this PR.)
4. **Figma version pinning** — the manifest records `accessedAt` but Figma file versions are not addressable via current MCP tooling. Accept documenting accessedAt + node IDs as the pin? (Proposed: yes for V1.)
