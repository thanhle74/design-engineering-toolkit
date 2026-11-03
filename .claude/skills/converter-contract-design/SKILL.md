---
name: converter-contract-design
description: Design versioned platform-neutral contracts for design-source extraction, UI capability registries, component bindings, structural layout resolution and unsupported diagnostics. Use before implementing any new adapter, schema, compiler stage or mapping strategy.
---

# Converter contract design

Read `AGENTS.md`, `specs/ISSUE-5-converter-architecture.md`, existing `schemas/*` and relevant ADRs first.

1. Define who owns each contract: **core vs project profile vs backend adapter**. Keep generic schemas free of Magento/Page Builder classes, Secomm names, fixed Figma IDs and home-directory paths.
2. Model `CapabilityRegistry` first: stable ID, props, variants/appearance, allowed children, nesting, responsive policy, editor restrictions, provenance and **evidence-based proof level**.
3. Draft future `DesignSourcePort`, `NodeIR`, `ComponentBindingMap`, `PageStructure`, `ResolutionReport`, but **do not access Figma in G1**.
4. Specify deterministic serialization; explicit error codes for unknown content types, variant mismatch, incompatible children, responsive uncertainty, missing project source and insufficient evidence.
5. Prefer additive schema updates to V1; provide version/migration ADR for breaking change.
6. Design negative-case tests before implementation. Required cases: unknown type; missing appearance; wrong nesting; unsupported interaction; missing optional Magento checkout; non-Magento profile; no current issue ID; duplicated mapping ambiguity.
7. Document structural fidelity acceptance separate from functional Admin round-trip and visual/CSS fidelity.

**Output:** `[<issue>] W-C` schema proposal, interface boundaries, error taxonomy, backward-compatibility strategy, test plan and decision receipt. No invented PASS, no runtime mutation.
