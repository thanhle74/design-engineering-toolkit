# DET — ANTIGRAVITY FEATURE & FIX LOG

> **Purpose:** working ledger for rapid **feature implementation AND bug fixes** in the Design Engineering Toolkit (DET). Antigravity is the fast **implementer**: build real functionality, run it, correct defects. This file records exactly what was changed so ChatGPT/Claude Code can later consolidate a well-scoped **architecture / code-quality / regression-hardening issue**. **NOT** a mandate to stop at prototypes or to fix bugs only.
>
> **Base:** start the Antigravity feature-development phase **after issue #72 / PR #73 is independently reviewed and merged to `main`**. Record that actual merged commit below. This document can be created before the merge; its existence does not authorize merging an unfinished PR.
>
> **Repository:** `thanhle74/design-engineering-toolkit`

## Baseline (fill once when Antigravity phase begins)

- Baseline `main` SHA: `TBD — after #72 merge`
- Tool/environment: Antigravity in the DET repository; local Slaunchpad Magento is **test-only**.
- Product flow to preserve: Figma → grounded AI/semantic mapping → deterministic Magento Page Builder → downloadable operator-executed PHP installer.
- Architecture target: `src/modules/core` (neutral contracts/engine) · `src/modules/figma` (source extraction) · `src/modules/magento` (native Page Builder composition / PHP installer) · `src/modules/studio` (Next/Ant Design UI and orchestration). Keep contracts, provider assumptions and source evidence explicit.
- Do not put tokens, passwords, customer data, local `env.php`, raw private assets or screenshots containing secrets in this file.
- Never modify the live Magento storefront/default CMS homepage or Figma source as part of fast iteration. Use an explicitly isolated local test page/store; stage/prod writes require separate owner permission.

## How to work — functionality FIRST, rigorous cleanup LATER

1. **Antigravity may develop full features**, UI, conversion handlers, integration, tests, and bug fixes. Prioritize a **working observable end-to-end behavior** over premature cross-module refactoring.
2. After **each substantive feature or fix**, append one entry to this file. Keep it short and factual; *feature and fix both belong here*. Record the actual working path, commit, affected code and known shortcuts/limitations. Avoid status claims without evidence.
3. Prefer committing each functional unit separately to a feature branch; record commit SHA/branch. Do **not** silently push unreviewed experimental changes directly to `main` if a review flow is expected.
4. During rapid iteration, avoid intentionally destroying module boundaries or introducing secrets; if a shortcut is necessary, **record the technical debt candidly** rather than hiding it. Keep the deterministic engine and safe Magento write boundaries intact.
5. When the owner says **"đọc file Antigravity và lên issue chuẩn hóa"**, ChatGPT will read this log **and independently inspect real code/diff/test state**, group work by affected modules, identify duplicate logic, wrong boundaries, hardcoding, brittle contracts and missing tests, then create **a single cohesive GitHub issue** (or bounded parallel worker lanes) to refactor and preserve all proven features. Claude Code then hardens architecture with tests and real Magento Admin verification. No automatic functionality deletion or unsupported rewrites.
6. A feature that works only in one project is **not automatically portable**. Record target Magento version/provider/extension requirements and any unverified behavior for later proper adapter/config work.

## Feature / Fix entries (APPEND; do not overwrite earlier entries)

Copy the following template for each addition. If a field is irrelevant, write `N/A`. Use `DONE`, `PARTIAL` or `BLOCKED` based on *observed* behavior.

```md
### AG-001 — [Feature | Fix] Short descriptive title
- Status: DONE | PARTIAL | BLOCKED
- Goal / intended behavior: ...
- Implemented behavior (what actually works): ...
- How to test (URL, CLI, user actions): ...
- Test result / evidence: ... (Admin Save→Reload / browser / CLI / unit tests, with exact limitations)
- Changed code: `src/modules/...`, `app/...`
- Branch / commit: ...
- Known issues / shortcuts / structural debt: ...
- Next functional follow-up (optional): ...
```

### Notes for Page Builder work

- **PASS is correct native component type and hierarchy**, not pixel-perfect styling: Row, Column, Banner, Image, Slider→Slide, Products grid/carousel, verified Magento widgets, and editable Admin Save→Reload behavior.
- Do not fake a product widget/slider using HTML; do not invent runtime catalog providers or inject products without a verified filter/binding. Unknown behavior → explicit GAP.
- The original Slaunchpad Figma Homepage is an **integration example**, not a customer-specific rule to bake into generic modules.
- For generated PHP: DET only produces the installer; executing it is an explicit Magento write. Test via `php -l`, dry-run and isolated store create/update/save/reload, with cleanup proof.

## Review / refactor handoff (fill when owner requests)

- Last Antigravity commit / branch:
- Implemented entry IDs:
- Known broken behavior / failed smoke tests:
- Architectural debt to prioritize:
- **ChatGPT review status:** NOT STARTED — wait for owner request; do not auto-create issues.
