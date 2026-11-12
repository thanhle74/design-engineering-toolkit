# Modular Architecture & Adapter Boundaries — Design Engineering Toolkit

**Status:** OWNER-DIRECTED ARCHITECTURAL INTENT / SPEC ONLY · 2026-11-03  
**Architecture style:** **Modular Monolith + bounded pluggable adapters + contract-driven pipeline**. This is a product design, not a statement that executable modules already exist. Technology selection remains subject to the evidence-based #7 ADR.  
**Reference:** [PRODUCT-ARCHITECTURE-AND-SCOPE.md](PRODUCT-ARCHITECTURE-AND-SCOPE.md), [Figma naming contract](FIGMA-NODE-SEMANTICS-AND-NAMING.md).  
**Inspiration (selected principles only):** [SEO Writer Engine bounded extension points](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/architecture/BOUNDED-EXTENSION-POINTS.md), [Integration Control Plane](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/architecture/INTEGRATION-CONTROL-PLANE.md), [Engine modular structure](https://github.com/thanhle74/seo-writer-engine/tree/main/src/modules).

## 1. Decision and non-goals

The toolkit should be **ONE deployable local CLI/library initially**, split into separately owned logical modules. Domain modules implement stable contracts, while platform dependencies live behind optional adapters. Claude Code/Orca **or** a human terminal/CI calls the exact same executable engine. A module here is an *internal toolkit capability*, **not a Magento PHP module**.

**Now:** only the minimal concrete modules required by **Figma → editable Magento Page Builder CMS pages**. Read-only audit/validation and structural mapping come before any authorized Figma extraction or Magento import.  
**Later, separately gated:** requirements-to-design planning, the full three-KB ingestion platform, Hyvä Theme output for Header/PLP/PDP/Search, additional design sources, local GUI. Keep their *extension seams* only when genuine future variation justifies them.

**Reject:** microservices, queues, Kubernetes, multiple runtime processes, three mandatory KB databases, generic "everything is a plugin" framework, runtime arbitrary dynamic code loading, N variants of the same registry, auto-created Magento modules for every Figma section, screen-to-static-HTML shortcuts, user-specific paths and hardcoded Figma IDs.

## 2. Single stable pipeline and composition root

```text
  Claude Code / Orca skill OR direct CLI / CI
                      |
               CLI Composition Root
          (input policy, profiles, gates)
                      |
              Core Pipeline Contract
                      |
      +---------------+----------------+
      |               |                |
  Source Reader   Knowledge/        Target Adapter
  Figma (later)   Capability Query   Page Builder (first)
      |               |                |
      +------- Canonical Design/Layout IR
                      |
                Structural Mapper
                      |
              Generated Content Plan
                      |
                  Validation
                      |
       JSON + Evidence + Diagnostics + Diff
             [import gated separately]
```

**Immutability:** stages consume an immutable snapshot of resolved project profile + source versions + capability registry versions. Each stage emits a **versioned artifact** with schema, provenance, ownership, diagnostics and an explicit outcome; downstream stages never reinterpret missing proof as PASS.

**What belongs where:**
- **Core contracts:** shared types/JSON schemas, artifact envelopes, IDs, provenances, capability claims and diagnostics; no Magento/Figma SDK imports.
- **Pipeline/orchestrator:** stage ordering, lifecycle, capability selection, approval gates and deterministic execution; does not know provider/vendor special cases.
- **Source module:** future scoped read-only Figma node/asset extraction, source manifest and semantic layout IR; replaceable with other design input only if a real second source exists.
- **Knowledge module:** reads three logical KBs (Platform, UI Component, Project); versioned capability lookup/provenance. Avoid building a second registry inside each adapter.
- **Structural mapper:** pure conversion of semantic IR + capability constraints to an explicit mapping plan; records mapped/excluded/unknown node decisions, including `THEME_CHROME`.
- **Target adapter:** Magento Page Builder native/custom-appearance serializer, content-type constraints and later CMS Admin import. Domain-specific knowledge stays in this adapter.
- **Validation/QA module:** schemas, structural invariants, coverage/provenance, reproducible output, later isolated Admin Edit→Save→Reload→Storefront receipt and visual parity. An adapter cannot self-certify its own runtime PASS.
- **CLI:** deterministic commands, project/profile/path resolution, preview and error handling; agent remains optional and must not become part of core logic.
- **Skills/agents:** thin user/AI operating procedures routing to modules and gates, not a second logic engine.

Illustrative logical structure **(not a directive to materialize empty packages and not a technology lock):**

```text
core/
  contracts/              # shared versioned types and IO schemas
  pipeline/               # stage sequencing + gates
  diagnostics/            # typed findings, evidence, proof level
modules/
  project-profile/        # per-project source paths and target scope
  capability-registry/    # single capability resolution authority
  design-structure/       # normalized Figma semantics (later extractor)
  structural-mapping/     # deterministic page structure/selection
  validation/             # QA + evidence
adapters/
  targets/magento-pagebuilder/  # FIRST target
  sources/figma/               # later approved read-only source
  inventory/magento/           # project-local read-only audit
  inventory/hyva-ui/           # licensed read-only metadata only
  targets/magento-hyva-theme/  # FUTURE, no implementation yet
cli/
skills/
specs/
```

Refine actual names to match the *implemented* #5/#7 interfaces rather than creating duplicate contracts.

## 3. Module admission, ownership and dependencies

A new module is justified only when it has a distinct stable responsibility, testable input/output contract and clear owned data/provenance. **One implementation with no variability should remain concrete.** Add a plugin/adapter abstraction only for a proven external boundary, two genuine implementations, an accepted second implementation, or a real runtime selection requirement.

**Dependency rule:** `CLI → application/pipeline → domain contracts ← adapters/infrastructure`. No domain → Magento SDK, Figma API, Hyvä UI commercial source, vendor MCP or Claude Code imports. Avoid cyclic imports. No plugin may register an arbitrary file path/class supplied by user input.

**Each module's contract manifest should declare:**
- `moduleId`, version and owner; what capability it provides and consumes.
- Input/output JSON Schema or typed API; compatible schema versions, stable IDs, traceable source refs.
- Allowed side effects: `READ_ONLY` (default) or separately authorized scoped write.
- Dependencies (required/optional), permissions and error/fallback semantics.
- Evidence/proof state, deterministic behavior guarantees, test fixtures, diagnostics and changes that invalidate cached knowledge.
- Status `PLANNED | IMPLEMENTED | VERIFIED` — a folder or Markdown contract is not implemented functionality.

**Selection modes:** prefer exactly one target adapter per job (`SINGLE`), one explicit capability mapping policy (deterministic highest supported match or `NEEDS_REVIEW`); allow `FIRST_MATCH`, `ORDERED_FALLBACK` or `CHAIN` only for a justified, typed use case. Record which implementation actually served a request. Do not copy the SEO engine's full generic six-mode execution framework into this much smaller toolkit.

## 4. Target boundary: Page Builder now, Theme later

The chosen Figma frame is inventoried recursively (including header/footer) to preserve provenance. For the **Magento Page Builder target**, only editorial CMS sections are serialized. Actual Header/Footer/PLP/PDP/Search/Cart stay `THEME_CHROME` or `SYSTEM_PAGE` and do not leak into CMS content. A future **Magento Hyvä Theme target** may reuse the same semantic IR/registry but owns layout XML, `.phtml`, Tailwind CSS and Alpine.js integration.

- Native Page Builder content types, installed `Secomm_UiWidget` components and licensed upstream Hyvä UI are **distinct** capability sources; no duplicated capabilities or assumptions of compatibility.
- Dynamic product/list data and customer/business behavior belong to Magento providers/modules. Do not generate fake runtime functionality from visual design.
- A theme is not automatically created when running a CMS page job. A Magento module is not generated unless a proven missing business/widget capability warrants it.
- No Data Patch as the default CMS content importer; later scoped import supports dry-run/diff, idempotence, merchant-content conflict protection and rollback.
- Never mistake raw canonical JSON or a static HTML screen for Page Builder **editable master HTML**, nor `STRUCTURALLY_MAPPED` for `ADMIN_ROUNDTRIP_VERIFIED`.
- No Figma writes in this task. Naming rules are specified separately; even approved Figma renaming requires a later explicit GO.

## 5. Test strategy and integration gates

**First valuable code proof** (once #5/#7 architecture is reconciled and #9 receives explicit GO):
1. A direct CLI command runs with no Claude Code, MCP, Figma credentials or Magento installation and validates synthetic profiles/contracts.
2. Module and adapter contract tests establish correct input/output versions and **no hidden side effects**.
3. A synthetic Figma-like node tree contains a real Header, Hero 40/60, nested Collection and Footer; all nodes are accounted for in the mapping report, only CMS sections mapped; unknowns are flagged.
4. Registry resolution records actual proof state, compatibility and source version; unsupported product/variant behavior yields a structured GAP, not invented code.
5. The Page Builder adapter serializes supported content in a versioned **plan** first; later Admin round-trip requires an isolated real Magento receipt.
6. A non-Magento synthetic project runs the same core tests without any local Slaunchpad path. Local licensed Hyvä UI auditing remains adapter-opt-in.
7. Narrow tests during implementation, one appropriate comprehensive closure battery; review evidence includes base/tip SHAs, changed paths, exact commands, failures, known gaps and authorized next stage.

**Gates:** `CAPABILITY_INVENTORIED → STRUCTURE_PROVED → CONTENT_PLAN_VALIDATED → ADMIN_ROUNDTRIP_VERIFIED → VISUAL_FIDELITY_VERIFIED`. Do not promote states based on screenshots or Claude Code assertion alone.

## 6. Architectural migration and change safety

- Existing #5/#7 contracts are authoritative for their respective completed scope; this document is **new owner intent** to be reconciled, **not a unilateral refactor mandate**.
- Upgrade schemas via versioned adapters/migrations. New target platform must add an adapter and capability proofs, not rewrite canonical Figma parsing, knowledge schema, CLI logic or owner approvals.
- No automated import/production write from the general CLI; separate approval and scoped capability for each mutate operation.
- Every module addition passes the **removal test**: if removing the abstraction would not impede the current Page Builder job or the accepted next adapter, do not implement it prematurely.
- GitHub Issue tasks remain the execution authority, with `[<GitHub issue number>]` prefix, one integrator owning shared files, no automatic merge.

**Implementation status:** SPEC ONLY. This does not modify or launch #5, #7, #9, Figma, or any Magento project.
