# Design Engineering Toolkit

A **multi-project, platform-neutral** foundation for design-system contracts, semantic structure, capability resolution and evidence-led conversion. Magento Page Builder + Hyvä is the **first adapter**, not a required core dependency.

## Current work — [5] converter architecture

**[Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5)** is architecture-first: **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity**.

**Current gate (G1):** source-backed capability inventory, neutral contracts/schema decisions, reusable skills/agents and evidence-based repo hygiene. **No Figma access, no CMS import, no CSS pixel-perfect, no production writes.** Later G2–G4 require separate decisions.

Start here:
- [Current architecture/spec](specs/ISSUE-5-converter-architecture.md)
- [Accepted/proposed decisions](docs/converter/DECISIONS.md)
- [OSS source selection](docs/research/oss-adoption-for-pagebuilder.md)
- [Agent skills selection](docs/research/agent-skills-adoption.md)
- [Repo hygiene baseline](docs/converter/REPO-HYGIENE-BASELINE.md)
- [Agent rules](AGENTS.md), [Claude Code entry](CLAUDE.md), `.claude/skills/` and `.claude/agents/`

**Task naming:** `[<issue number>] <task title>`; `[5]` is this task's GitHub issue number, **not a version**.

**Portability:** `/home/thanhle/Sites/Magento/slaunchpad` is only the Owner's current local checkout used to develop the first adapter; it is **not** a toolkit dependency or a default path. Future users provide their **own** checkout/profile or use the generic core without Magento.

## Existing V1 architecture and manual pilot

**V1 intent:** Discover Figma style guide → normalize versioned design tokens/components → compose an editable Figma page into an approved destination → visual QA receipt.

[Issue #1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) architecture was approved/closed via merged [PR #3](https://github.com/thanhle74/design-engineering-toolkit/pull/3). [Issue #2](https://github.com/thanhle74/design-engineering-toolkit/issues/2) manual Figma pilot was built and closed; **it was not an automated toolkit pipeline**. `projects/slaunchpad-fashion/pilot/pilot-plan.md` documents what was built and which QA gates remain unverified. The orchestrator/runtime importer is **not implemented by that pilot**.

Historic V1 references remain:
- [Architecture](docs/ARCHITECTURE.md) · [Source audit](docs/source-audit/secomm-launchpad-fashion.md)
- [Quality gates](docs/quality-gates.md) · [Safety](docs/safety-and-scope.md) · [Pilot scope](docs/pilot-scope.md)
- [Versioned schemas](schemas/) · [example profiles](profiles/) · [contract examples](examples/)

## Safety

The toolkit must remain shareable across projects and platforms. Keep core free of brand-specific code, fixed source IDs, local user paths and Magento dependencies. Source designs are read-only; do not modify approved Figma files or production storefronts. Preserve V1 pilot/evidence until a source-backed migration or deletion review authorizes changes. No third-party source vendoring without license review and no auto-merge.
