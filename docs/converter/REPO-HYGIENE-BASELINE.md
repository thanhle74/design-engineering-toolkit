# [5] Repository hygiene baseline — read-only inventory

**Scope:** Repository `thanhle74/design-engineering-toolkit`, default `main` tree observed at `82c9129950e1a3da3d51829f1c83aa137425a021` (41 entries), before the architecture documentation branch. This is a **preliminary inventory**, not evidence of unused runtime code.

## Findings

| Area | Evidence | Disposition |
|---|---|---|
| V1 architecture, safety, schemas/examples | `docs/ARCHITECTURE.md`, `docs/safety-and-scope.md`, `schemas/*`, `examples/*` | **KEEP**: stable historical contracts; future V2 must migrate/extend deliberately |
| Manual Figma pilot | `projects/slaunchpad-fashion/pilot/*`, `evidence/*.png`, `state-slaunch-v1-pilot.json` | **KEEP**: review/evidence assets are not dead merely because the pilot was manual |
| Root README stale status | Says architecture is DRAFT/awaiting review, while architecture PR #3 was merged and issues #1/#2 closed | **UPDATE CANDIDATE** after reconciling authoritative V1 state; preserve pilot's explicitly unverified gates |
| Runtime source/scripts/test/CI | None present in the 41-entry main tree snapshot | **NO DELETE CLAIM**: there is no runtime code to prove dead; implementation is not yet a working converter |
| `.claude/` and agent entrypoints | Absent on baseline | **ADD minimally in #5**, no copied Slaunchpad `.ai/` framework |
| Local absolute path | Owner development checkout used for Magento adapter audit | **NOT A DEFAULT**: keep out of generic code and public examples; accept per-run/project configuration only |
| Duplicate source authority | Old V1 architecture and new converter direction can coexist | **DOCUMENT VERSIONED SCOPE** instead of deleting historic docs prematurely |

## Required local evidence before any deletion

1. `git ls-files` / recursive tree inventory at actual checkout TIP.
2. Search incoming/outgoing references to candidate file/contract; verify imports, scripts, doc links and downstream fixtures.
3. Create deletion proposal with behavior/compatibility risk and diff.
4. Run fresh tests/lint/contracts validation; record results.
5. Integrator alone may delete **only if proven safe**; never blanket `rm -rf` pilot/screenshots/specs.

**No deletions are recommended at this initial review-only checkpoint.**

---

## [5] TIP audit addendum — 2026-11-03 ([5] W-D receipt + integrator actions)

Tree audited at `7c1508b` (44 tracked files) plus the [5] architecture-integration delta. GitHub state verified via `gh` (not assumed): #1 CLOSED, #2 CLOSED, PR #3 MERGED, PR #4 MERGED, #5 OPEN. Dispositions at TIP: **KEEP 37 · UPDATE 7 · REMOVE_CANDIDATE 0 · UNKNOWN 0**.

### Findings and actions taken by the Integrator

| # | Finding | Action |
|---|---|---|
| F1 | `docs/ARCHITECTURE.md:3` still said "DRAFT for human review" though PR #3 merged | **APPLIED**: status line now states approved/merged + historical-SSOT note; body untouched |
| F2 | `docs/converter/DECISIONS.md` ADR table broken by blank lines (009/010 detached) | **APPLIED**: table repaired; all rows preserved; new ADR-005-011..016 appended |
| F3 | `docs/research/oss-adoption-for-pagebuilder.md:54` said `FigmaBindingMap` vs spec's `ComponentBindingMap` | **APPLIED**: aligned to `ComponentBindingMap` with links to the materialized family |
| F4 | `docs/safety-and-scope.md:39` described issue #2 as blocked on PR approval (both closed/merged) | **APPLIED**: dated past-tense note; invariants untouched |
| F5 | Pilot files said PR #3 "DRAFT/unmerged" | **APPLIED**: dated parentheticals; **all NOT_VERIFIED/BLOCKED gate labels preserved verbatim** |
| F6a | `profiles/commerce-promotional.example.json:29` embeds the real PL fileKey in a committed example | **KEPT**: baseline-era read-only archive reference, not a secret; noted for Owner judgment |
| F6b | `schemas/project-profile.schema.json:135` `$comment` named platform-specific future adapters | **APPLIED**: `$comment` generalized; enum unchanged (`figma-only`); neutrality scan now 0 hits on V1 schemas for platform names |
| F6c | `.gitignore` missing `projects/*/*.local.*` | **APPLIED**: pattern added |
| F7 | No CI existed (deliberate deferral in ARCHITECTURE/schemas README) | **SUPERSEDED by ADR-005-015**: minimal gate `.github/workflows/validate.yml` added (ajv schema+example validation, 30-check contract suite, neutrality guard); orchestrator implementation remains P1 |

### Grep verdicts (unchanged by integration, re-verified by the test gate)

- `home/thanhle`: policy/illustrative statements only; **0 in schemas, examples, profiles, projects JSON** (now machine-checked by T-09).
- Fixture Figma IDs (`245:2`, `245:16`, fileKey): gated doc/spec/policy references only; 0 in schemas.
- Platform names in schemas: **0** (V1 `$comment` generalized; converter family born clean — enforced by T-09 in CI).

### NO DELETE (unchanged)

`projects/slaunchpad-fashion/**` (12 files, incl. zero-inbound-ref `project-profile.md` and `slaunch-logo.svg`) stays: pilot evidence, protected by ADR-005-008 and the evidence-led-repo-hygiene skill. All V1 docs/schemas/examples/profiles KEEP. Nothing qualified for REMOVE_CANDIDATE; no runtime code exists to prove dead.
