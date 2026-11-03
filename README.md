# Design Engineering Toolkit

Reusable, project-agnostic Design Engineering workflows for transforming Figma design systems into consistent, editable designs.

**Pipeline (V1):** Discover Figma style guide → normalize design tokens/components (versioned JSON) → compose an editable Figma page in an approved destination → visual QA with an evidence receipt.

## Status: DRAFT — awaiting review of the architecture package

Everything below was prepared for issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) and is **not yet approved**. No Figma file has been modified; all source findings come from read-only audits. Implementation (orchestrator skill, validators) starts only after this package is reviewed.

## Start here

1. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the SSOT: layers, pipeline stages, orchestrator contract, decision log, bounded V1 implementation plan.
2. **[docs/source-audit/secomm-launchpad-fashion.md](docs/source-audit/secomm-launchpad-fashion.md)** — read-only audit of the reference style guide (key finding: zero Figma variables/styles; the "Library" is documentation artwork).
3. **[docs/quality-gates.md](docs/quality-gates.md)** · **[docs/safety-and-scope.md](docs/safety-and-scope.md)** · **[docs/pilot-scope.md](docs/pilot-scope.md)** — measurable gates, invariants, and the bounded pilot scope handed to issue #2.
4. **[schemas/](schemas/)** — four versioned JSON Schema (Draft 2020-12) contracts, machine-validated against all bundled examples.
5. **[profiles/](profiles/)** — two example project profiles (luxury editorial / commerce promotional) exercising cross-project neutrality; **[examples/](examples/)** — illustrative contract payloads derived from the audit.
6. **[specs/knowledge-foundation/](specs/knowledge-foundation/README.md)** — DRAFT (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)): three knowledge bases (platform / UI component / project), contracts + example schema drafts, technology ADR, source inventory, UX-planning contract, and implementation plan — specification only, no implementation claimed.

## Work tracking

- [Issue #1 — Architecture & Design System](https://github.com/thanhle74/design-engineering-toolkit/issues/1) — this package
- [Issue #2 — Figma Pilot](https://github.com/thanhle74/design-engineering-toolkit/issues/2) — executes the pilot; blocked on #1 approval + destination GO

Issue #2 can research independently but must wait for the reviewed contracts from #1 before writing the Figma pilot. Shared dependencies are coordinated via GitHub issue comments.

## Safety

Preserve existing Figma files as read-only references until an explicitly approved write target is established. Do not delete existing Figma pages. No Magento/Hyvä implementation or Page Builder importer in V1. Full invariants: [docs/safety-and-scope.md](docs/safety-and-scope.md).
