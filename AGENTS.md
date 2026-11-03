# Agent instructions — Design Engineering Toolkit

This is the **one agent policy entrypoint** for this reusable, platform-neutral toolkit. Claude Code reads [CLAUDE.md](CLAUDE.md), which points here. Read the selected **current spec**, existing [V1 architecture](docs/ARCHITECTURE.md), [safety rules](docs/safety-and-scope.md), and decision log before editing anything.

## Current task
- **[5]** = GitHub Issue [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5), not a version number. Begin worker/Orca task labels with `[5]`.
- Canonical new pipeline: **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity**.
- **Stage 1 only: ARCHITECTURE FIRST.** Do not access Figma (including read tools), write to Magento, generate a CMS page, modify production or polish CSS under [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) until explicit subsequent gates.
- All approved SLAUNCH designs are frozen. Figma `245:2` and `245:16` are future fixture references only.
- `/home/thanhle/Sites/Magento/slaunchpad` is an **example local checkout path** for the current profile; never hardcode it in shared toolkit modules.

## Cross-project boundaries
- Core: platform-neutral contracts, validation, deterministic resolution, diagnostics.
- Profile: project/brand/asset/source IDs, local checkout location, platform + permissions.
- Adapter: native Magento Page Builder, Secomm_UiWidget, Hyvä UI, Tailwind CSS v4 (CSS-first), Alpine.js (CSP-aware). Adapter work belongs downstream and is not part of generic core.
- Do not copy the local project's `.ai/`, `.claude/skills/` or proprietary code into this repository; **reference only** when permitted.
- Do not vendor OSS or auto-install plugins. Check licenses/source versions before using third-party code.

## Parallel-work contract
- Launch **[5] W-A (OSS/skills)**, **[5] W-B (Magento/Hyvä capability)**, **[5] W-C (contracts/architecture)** and **[5] W-D (repository quality)** concurrently on read-only independent sources.
- Only **one [5] Integrator** may write to the shared branch or update SSOT docs. If workers must draft code, isolate branches/worktrees and path ownership; integrate sequentially after review. Never let workers race to update `specs/`, `README.md`, `AGENTS.md` or schemas.
- Workers return concise, cited receipts: scope, base/version, evidence, findings, unknowns, proposal; **no self-declared PASS**.
- Integrator reconciles once, runs validation/tests, posts one decision/evidence receipt and leaves PR draft for Owner/Coordinator review.
- Do not relaunch an audit already evidenced. Time-box uncertain research and explicitly classify unsupported/unknown.

## Safety / evidence / deletion
- No Figma edits; no live storefront/CMS/DB/config writes; no active Homepage overwrite, and no auto-merge.
- No unverified `ADMIN_ROUNDTRIP_PASS`; real Page Builder Admin Edit → Save → Reload → Storefront is a later isolated proof.
- Before removing files/code: determine ownership, callers/imports/docs links, test coverage, behavior and migration impact; show evidence and diff. Old pilot assets/evidence are **not dead code** merely because they aren't used by V2.
- Preserve `docs/ARCHITECTURE.md` as historical V1 source; V2 spec evolves separately until formally superseding the V1 contract.
- Prefer concise Vietnamese status reports; keep technical names, paths and source code in English. Never hide blockers or overclaim completion.

## Navigation
- [Issue #5 architecture spec](specs/ISSUE-5-converter-architecture.md)
- [Converter decisions](docs/converter/DECISIONS.md)
- [OSS adoption](docs/research/oss-adoption-for-pagebuilder.md)
- [Agent skills adoption](docs/research/agent-skills-adoption.md)
- Focused skills under `.claude/skills/` (use only when relevant).
