# Selective Architecture, Specs & Agent-Skill Reuse from SEO Writer Engine

**Reviewed:** 2026-11-03 · **Mode:** read-only research, selective adaptation, **no wholesale framework or source copy**.  
**Upstream repo:** [thanhle74/seo-writer-engine](https://github.com/thanhle74/seo-writer-engine).  
**Toolkit destination:** [MODULAR-ARCHITECTURE-AND-ADAPTERS.md](../../specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md) and [Product Architecture](../../specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md).

## Scope and evidence read

Examined upstream repository root, `AGENTS.md`, `CLAUDE.md`, `specs/.index.md`, `specs/PROJECT-INVARIANTS.md`, `specs/AGENT-RULES.md`, `specs/AI-COLLABORATION-PROTOCOL.md`, `specs/SPEC-ENGINE.md`, `specs/architecture/BOUNDED-EXTENSION-POINTS.md`, `specs/architecture/INTEGRATION-CONTROL-PLANE.md`, `specs/standards/SYSTEM-QUALITY-AUDIT-CONTRACT.md`, `specs/research/SKILLS-HARVEST-EVALUATION-69-20260920.md`; enumerated `src/modules/`, `.claude/skills/` and `.claude/tools/`; inspected the relevant skill `SKILL.md` files listed below. These are **repository-grounded patterns**. This research is NOT a full SEO engine source audit or a claim that its business/runtime implementation is transferable as-is.

## What transfers cleanly (prioritized)

| SEO source | Observed useful principle | Toolkit adoption | Action/gate |
|---|---|---|---|
| [Bounded extension points](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/architecture/BOUNDED-EXTENSION-POINTS.md) | Stable flow → typed domain contract → deterministic registry/selection → provenance; avoid a generic abstraction without a real variation axis | **ADOPT principle** | One pipeline, optional Figma/Magento adapters, single capability authority; concrete single-use modules stay concrete |
| [Integration Control Plane](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/architecture/INTEGRATION-CONTROL-PLANE.md) / `src/modules/integrations` | Vendor integrations behind boundary; contracts/registry/runtime/provider ownership; truth of registered ≠ actively executable | **ADAPT light** | Keep agent/MCP/Figma SDK and Magento APIs outside Core. Distinguish `DISCOVERED`, `REGISTERED`, `VERIFIED` in Registry |
| [AGENTS.md](https://github.com/thanhle74/seo-writer-engine/blob/main/AGENTS.md) + [CLAUDE.md](https://github.com/thanhle74/seo-writer-engine/blob/main/CLAUDE.md) | Universal agent entrypoint, thin Claude adapter, GitHub Issue is task authority; task-scoped cold-start | **ADOPT pattern** | Keep toolkit `AGENTS.md` minimal and issue-based, avoid duplicating entire specs per skill; proportional reading for bounded tasks |
| [Specs index](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/.index.md) + [Invariants](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/PROJECT-INVARIANTS.md) | Indexed task-specific authorities; durable decision/invariant router; history ≠ current authority; mechanical registry validation | **ADAPT progressively** | Single navigable specs index and decision log; add invariant ID registry + checker only when docs actually grow, don't copy 50k policy |
| [Project Coordinator skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/project-coordinator/SKILL.md) | GitHub state/Issue comments over remembered chat; actual branch/tip verification; Coordinator owns ACCEPT | **ADOPT lightweight** | Use `[issue number]`, one integration writer, receipts, source review and explicit verdict; don't force a background fleet or duplicate prompts |
| [Fast Iteration skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/fast-iteration/SKILL.md) | Read last blocker, classify failures, smallest root-cause fix, narrow tests during iteration, full battery once at closure | **ADOPT** | Prevent repetitive Figma/CMS correction cycles; one representative fixture per failure family; one final integration validation |
| [Evidence Receipt skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/evidence-receipt/SKILL.md) | Explicit preconditions and negative side-effect attestations; implementer cannot self-ACCEPT; bounded LITE receipt | **ADOPT scoped** | Evidence fields: root frame/version, capability revision, mapping proof, target page, fixture vs live, write permissions, test commands and outcome |
| [Correction Round skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/correction-round/SKILL.md) | Corrections are numbered, evidence-backed, append-only, supersede prior false claims, no uncontrolled scope growth | **ADOPT scoped** | For mapper bugs, quote actual broken nodes/layout; fix root cause and fixture test, not per-page CSS hacks |
| [Self Review skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/self-review/SKILL.md) | Independent challenge + blast radius + targeted tests; reject unverified PASS | **ADAPT** | Include module boundary tests, schema check, no-write validation, Admin round-trip only with real Magento evidence |
| [Tool Selection skill](https://github.com/thanhle74/seo-writer-engine/blob/main/.claude/skills/dev-tool-selection/SKILL.md) | Reuse installed tools; one primary agent surface; availability must be verified, not guessed | **ADOPT** | Claude Code/Orca primary. Detect user's local `magento-specs` MCP and local CodeGraph only if actually available; no mandatory dependency |
| [Quality Audit Standard](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/standards/SYSTEM-QUALITY-AUDIT-CONTRACT.md) | Evidence-based findings, explicit severity/confidence/disposition, no cosmetic refactor masquerading as correctness | **ADAPT** | Explicit `OBSERVED/INFERRED/UNKNOWN` findings, real fixture repro, no destructive cleanup without impact proof |
| [Skills Harvest Evaluation](https://github.com/thanhle74/seo-writer-engine/blob/main/specs/research/SKILLS-HARVEST-EVALUATION-69-20260920.md) | Selectively assess OSS skills and licenses; no blanket install or global configuration changes | **ADOPT** | Evaluate existing toolkit/Hyvä/Magento/Figma skills before adding a new one; avoid licensing issues |

## Toolkit's own skills: recommended minimal set (to reconcile with existing #5 skill work)

**Do not overwrite concurrent #5 `.claude/skills/` authorship.** After #5 review, inspect its actual skill inventory; fill only missing roles, ideally by one integrator:

1. **`toolkit-coordinator` (if absent):** Task Issue + AGENTS + relevant specs bootstrap; read Git/PR evidence; bounded fan-out; one writer; owner review; no auto-merge.
2. **`toolkit-capability-audit` (if absent):** read-only project/Hyvä UI/Page Builder inventory; exact installed version; evidence/provenance; classify known/unknown; no proprietary source copy.
3. **`toolkit-fast-iteration` (if absent):** narrow fixture check while coding, one full closure gate, classify failure families before fixes.
4. **`toolkit-evidence-receipt` (if absent):** versioned `input → output → proof`, tests and negative attestations, protected write boundary, honest `NOT_EXECUTED`.
5. **`toolkit-figma-structure` / `toolkit-pagebuilder-roundtrip` only at their separately approved stages:** semantic source inventory and real Admin editability evidence.

Each `SKILL.md` uses concise YAML `name`/`description`, clear trigger, inputs, output artifact, gates, failure states and links to normative contracts. **Skill instructions route to reusable CLI operations; they do not reimplement conversion logic or install an agent framework.** Prefer skill consolidation if several triggers overlap.

## Patterns to deliberately NOT copy

- SEO business concepts and runtime modules (GSC, keyword opportunity, article factory, content deploy, release branch choreography, SEO-specific AI model router) have no applicability to Figma → Page Builder.
- SEO production architecture (PostgreSQL, Next.js dashboard, cron scheduling, 14-tool MCP auditor, distributed fleet/agent control) is **not justified** for first local CLI release.
- Mandatory `CodeGraph`, AI reviewer models, project-wide full battery for every typo, exhaustive 10,000-word startup documents, or hardcoded source paths are **not portable requirements**. Use CodeGraph optionally where installed; direct targeted reads are valid fallback.
- Whole-source skill copy, external skill installation, commercial Hyvä UI source copying, client design dumps and SEO repo operational data are **out of scope**.
- Do not blindly inherit upstream's exact state machine, execution modes, release process or TypeScript stack. Choose only transferable doctrines; technology choice for toolkit follows its own ADR.

## Concrete application to the first pipeline

```text
[GitHub Issue + bounded specs]
       ↓ Claude Code skill or CLI
[Project/Profile read-only preflight]
       ↓
[Verified capabilities + pinned source snapshot]
       ↓
[Figma semantic node IR]       [actual Figma adapter later]
       ↓
[Pure structural mapper]      [40/60, nesting, responsive, exclusions]
       ↓
[Page Builder plan]           [native PB / Secomm_UiWidget; known GAP]
       ↓
[Deterministic schema/fixture checks]
       ↓
[Evidence receipt for Coordinator review]
       ↓
[Later Owner-approved isolated Magento Admin round-trip]
```

**Status:** research/spec-only integration with the first Page Builder goal. The actual `.claude/skills/` and CLI implementations belong to their owning issue after #5/#7 reconciliation and explicit GO. No task restarted and no production or Figma write performed.
