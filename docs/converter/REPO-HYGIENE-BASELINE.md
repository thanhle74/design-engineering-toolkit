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
