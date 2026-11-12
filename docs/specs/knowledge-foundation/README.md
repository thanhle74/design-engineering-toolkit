# Knowledge Foundation — Requirements → Design → Implementation

> **Status:** DRAFT for human review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)).
> This package specifies the three knowledge domains and their contracts, the technology selection ADR,
> and the implementation plan. **It is a specification-only deliverable.** Nothing here claims that a
> knowledge store, adapter, or engine is implemented — exit of this package is
> `READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW`, after which a separate Owner GO creates an
> implementation scope.

## Scope (normative)

Expand the toolkit from **Figma → Code** into an evidence-driven, multi-project
**Requirements → Design → Implementation** system by building the **knowledge foundation first**:
three logical knowledge bases, their shared contracts, an evidence-based technology ADR, and a
sequenced implementation plan with human GO gates. **No engine code and no runtime data ingestion
belongs to this issue.**

### Canonical end-to-end roadmap (normative; never silently shortened or reordered)

```
Requirements → Platform/UI Audit → Capability Registry → UX Architecture
→ Figma Design → Structural Mapping → Functional Round-trip → Visual Fidelity
```

This package governs the **knowledge foundation + decision/design gates only**. The roadmap above is
the single reference for every milestone in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md); stages
that already have artifacts from V1 (Figma Design pipeline, [docs/ARCHITECTURE.md](../../ARCHITECTURE.md))
are consumers of this foundation, not replacements for it.

## The three knowledge repositories

Logical domains with shared contracts — **not** three mandatory physical databases (see [TECH-ADR.md](TECH-ADR.md) §storage):

| KB | Domain question | Owns | Key protections |
|---|---|---|---|
| **KB-1** — Platform Knowledge | WHAT THE SYSTEM CAN DO | Capabilities discovered in the user's project and installed platform code/config (modules, Page Builder content types & appearances, widget registries, domain APIs, catalog features, config constraints) | Installed ≠ enabled ≠ configured ≠ runtime verified; Magento introspection lives in an **adapter**, never generic core |
| **KB-2** — UI Component Knowledge | WHAT CAN BE COMPOSED | Three distinct sources kept separate and linked: Hyvä UI upstream, `Secomm_UiWidget` components, Magento Page Builder native; component→UX-semantic mapping; gaps as `CUSTOM_REQUIRED` | Hyvä UI is **commercially licensed** — metadata/identifiers/pointers only, never source, templates, assets or keys |
| **KB-3** — Project Knowledge | WHAT THIS CLIENT NEEDS & APPROVED | Normalized requirements, UX intents/sections, decisions, approvals, risks, constraints, exclusions, open questions; the full requirement→evidence chain | Strict per-project tenant isolation; sanitized/synthetic content only in this public repo |

## Document index

| Document | Answers |
|---|---|
| [KNOWLEDGE-ARCHITECTURE.md](KNOWLEDGE-ARCHITECTURE.md) | Domain boundaries, ingestion/query architecture, knowledge lifecycle, cross-project protections, dependency diagram |
| [CONTRACTS.md](CONTRACTS.md) | The nine architectural contracts: identity/taxonomy, docs/evidence/proof, relations graph, lifecycle, search/query, cross-boundary ports, UX-planning contract, privacy/license/security, portability |
| [resources/schemas/](../../../resources/schemas/README.md) | Example schema drafts: KB-1 capability, KB-2 UI component, KB-3 project record, cross-KB relations — Draft 2020-12, compatible with the V1 schema family |
| [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md) | Evidence-based inventory of every source this foundation reuses (toolkit docs, local Slaunchpad checkout, Hyvä UI package, issue receipts) + reuse matrix, **no proprietary code** |
| [TECH-ADR.md](TECH-ADR.md) | Technology selection with evidence: language/runtime, serialization/validation, storage/query, ingestion, packaging — each as Chosen / Alternatives / Trade-offs / Evidence / When-to-revisit |
| [UX-CAPABILITY-PLANNING.md](UX-CAPABILITY-PLANNING.md) | The future UX-planning contract: requirements → ranked reusable-section plan, missing-feature handling (`GAP` / `CUSTOM_REQUIRED` / `UNKNOWN`), synthetic walkthrough on a **non-Magento** project |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Sequenced milestones with GO gates, test strategy (two synthetic projects; with/without Magento/Hyvä), exit criteria |
| [INTEGRATION-RECEIPT.md](INTEGRATION-RECEIPT.md) | Integrator receipt: worker findings, base/branch, affected files, proof, unknowns, unresolved decisions, GO/NO-GO |

## Relationship to parallel work

- **Toolkit issue [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5)** (Figma → Page Builder converter architecture) is running in parallel and **must not be edited, interrupted, or silently expanded** by this work. Its pipeline (`Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity`) is the **right half** of the canonical roadmap above; this foundation adds the **left half** (requirements, audit inputs, capability registry as a shared contract) and the cross-cutting evidence model. Open PR [#6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) is read-only reference material for [TECH-ADR.md](TECH-ADR.md) alignment.
- **Slaunchpad [#42](https://github.com/thanhle74/slaunchpad/issues/42)** (Figma→PageBuilder idea) and **[#32](https://github.com/thanhle74/slaunchpad/issues/32)** (closed Phase-A audit with recorded traps) are source receipts, reused read-only.
- **Local audit source:** `/home/thanhle/Sites/Magento/slaunchpad` is **only** the current owner's local development/audit path. It is never committed as a default, never required by other users, and never appears as a hardcoded default in any contract (see [CONTRACTS.md](CONTRACTS.md) §9 portability).

## Safety summary (full contracts in CONTRACTS.md §8)

Read-only ingestion of user-supplied roots; deny-list `auth.json`, `app/etc/env.php`, secret/env/config
credentials, personal data, proprietary binary/assets; Hyvä UI licensing separation demonstrable in the
data contracts; no Figma access, no CMS/DB mutation, no platform runtime dependency added by this
package; toolkit examples remain sanitized/synthetic.

## Exit gate

`READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW` → Owner reviews technology + three-KB design →
a **new GO** creates an implementation issue. **Specs existing does not mean knowledge stores exist.**
