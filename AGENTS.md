# Agent instructions — Design Engineering Toolkit

This is the **one agent policy entrypoint** for this reusable, platform-neutral toolkit. Claude Code reads [CLAUDE.md](CLAUDE.md), which points here. Read the selected **current spec**, existing [V1 architecture](docs/ARCHITECTURE.md), [safety rules](docs/safety-and-scope.md), and decision log before editing anything.

## Session and authority bootstrap (current policy)

- For a **Coordinator / new session**, read [CHATGPT-COORDINATOR-HANDOFF.md](specs/CHATGPT-COORDINATOR-HANDOFF.md) and the live GitHub Issue/PR/comments; handoff is a dated locator, not authority over live Git. Read task-relevant [product scope](specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md), [modular architecture](specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md), and [three-KB contracts](specs/knowledge-foundation/README.md).
- The `[N]` prefix is the **GitHub issue number** for the current task, not a permanent `[5]` label. Do not relaunch #5's reviewed architecture audit automatically.
- First executable CLI target is Magento Page Builder CMS; requirements-to-Figma, Hyvä Theme system pages, web FE/chat and CMS/Figma writes are separate later gates. Local `magento-specs` MCP is optional agent-side help, never a portable Core dependency.
- Coordinator verifies actual source, test and receipt; never self-claims Admin/visual/production PASS without that exact evidence.

## Historical [5] task-specific guidance (do not replay automatically)
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
- [Converter contracts (materialized schemas)](schemas/converter/README.md) · [Contract reference / deferred drafts](docs/converter/CONTRACTS.md)
- [Capability matrix (Magento PB + UiWidget + Hyvä)](docs/converter/CAPABILITY-MATRIX.md)
- [Converter decisions](docs/converter/DECISIONS.md)
- [Integrator receipt G1](docs/converter/RECEIPT-ISSUE5-G1.md)
- [OSS adoption](docs/research/oss-adoption-for-pagebuilder.md)
- [Agent skills adoption](docs/research/agent-skills-adoption.md)
- Focused skills under `.claude/skills/` (use only when relevant) — including `det-cli` for running the executable CLI. Contract test gate: `npm test` (build + 117 checks incl. G2/KB/G3/G4/G28 suites; neutrality, deny-list and negative cases run in CI). Deterministic CLI: `npm run build && node bin/det.js --help` ([receipt](docs/converter/RECEIPT-ISSUE9-CLI.md); G2 extraction receipt: [RECEIPT-ISSUE14-G2.md](docs/converter/RECEIPT-ISSUE14-G2.md); KB engine: [RECEIPT-ISSUE15-KB-MVP.md](docs/knowledge/RECEIPT-ISSUE15-KB-MVP.md); G3 native composition: [RECEIPT-ISSUE23-G3.md](docs/converter/RECEIPT-ISSUE23-G3.md); G4 two-column composition: [RECEIPT-ISSUE25-G4.md](docs/converter/RECEIPT-ISSUE25-G4.md); [28] full-root preview end-to-end: [RECEIPT-ISSUE28-G28.md](docs/converter/RECEIPT-ISSUE28-G28.md)). 

## Naming & portability invariants (Issue #5)

- Use `[<GitHub issue number>] <task name>` for tasks and parallel workers in Orca. **`[5]` is only this issue's ID**; reusable generators must derive the current issue number instead of hardcoding 5.
- The absolute path `/home/thanhle/Sites/Magento/slaunchpad` is **only the owner's local source checkout for the current Magento adapter development/audit**. It is **never** a default, assumption, or dependency for users of this toolkit. Other users supply their own project/source path, or no Magento path at all for non-Magento adapters.
- Keep local paths outside generic core, schemas, templates, emitted JSON and runtime defaults. Per-run CLI/env/local config may supply paths; error clearly if missing. Committed examples use placeholders, local overrides must remain gitignored.
- Always test a clean clone / non-Magento profile without access to the owner's machine path. The objective is a shareable, multi-client, multi-platform toolkit.
