# [5] Agent skills adoption — architecture-first research

**Status:** SELECTIVE / PROPOSED for [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5). Source examples are references, not vendored skills. No runtime dependencies or Figma access are authorized in G1.

## Decision rubric

Choose a skill only when it:
1. Captures a **repeatable** technique across clients/platforms;
2. Adds a real capability beyond `AGENTS.md` and test automation;
3. Specifies triggers, source-of-truth, boundaries and verifiable output;
4. Has provenance/license reviewed before source copying;
5. Fits independent worker/read-only execution and one integrator ownership.

| Public GitHub source | Focused material | Decision for toolkit | Rationale |
|---|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | `skill-creator` | **ADAPT METHOD** | Trigger-focused SKILL.md with short progressive disclosure; eval prompts and evidence. Do not vendor. **License verified:** repo has no root LICENSE; `skill-creator` ships its own `LICENSE.txt` = Apache-2.0 (Anthropic PBC); document skills are source-available — check per skill, never per repo. |
| [obra/superpowers](https://github.com/obra/superpowers) | `dispatching-parallel-agents`, `using-git-worktrees`, `verification-before-completion` | **ADAPT METHOD** | Concurrent isolated read-only scopes; exactly one writer; fresh tests before PASS claims. |
| [obra/superpowers](https://github.com/obra/superpowers) | `test-driven-development`, `systematic-debugging`, `writing-plans` | **REFERENCE FOR FUTURE CODE** | G1 needs contracts and negative-case tests; avoid importing entire workflow framework. |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `spec-driven-development`, `source-driven-development`, `code-simplification` | **ADAPT METHOD** | Specs first, direct source evidence, behavior-preserving cleanup after proof. |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | `agent-architecture`, `audit-integrity`, `agent-supply-chain` (exist as entries under `skills/` — the repo has no `collections/` dir) | **REFERENCE ONLY** | Useful checklists, but a broad skills directory is not a safe default dependency. README warns content is "sourced from third-party developers" with no per-file license statements — treat every file as unvetted. |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Engineering skill catalogue (20 skills under `skills/engineering`; explicit `deprecated/` and `in-progress/` categories) | **REFERENCE ONLY** | Evaluate a specific gap before adopting; per-skill freshness check required. |
| [wshobson/agents](https://github.com/wshobson/agents) | Multi-harness plugin marketplace (94 plugins / 202 agents / 185 skills per README) | **REJECT DEFAULT INSTALL** | Massive role overlap increases orchestration overhead without extra evidence. |
| [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | Security review | **DEFER G3 (method borrowed now)** | Relevant when handling CMS payload writes and untrusted content, not the current architecture-only gate. Its verdict taxonomy (`confirmed` / `needs_validation` / `rejected` in machine-readable findings, "fresh verifier whose job is to disprove") is the strongest verified model for this toolkit's NOT_VERIFIED/UNSUPPORTED diagnostics discipline — adopt the method, defer the skill. |

**Licensing:** never assume that a repository license automatically authorizes every third-party/bundled artifact. If integration is proposed, pin source commit, read exact LICENSE/file headers, document obligations and review before copying code. This repo uses **original** local short process skills, not wholesale copies.

## Selected new skills and agents

- `.claude/skills/pagebuilder-capability-audit/SKILL.md` — [5] W-B. Source-grounded native PB and `Secomm_UiWidget` capability audit.
- `.claude/skills/converter-contract-design/SKILL.md` — [5] W-C. Neutral contracts, diagnostics, schema migration and negative tests.
- `.claude/skills/evidence-led-repo-hygiene/SKILL.md` — [5] W-D and integrator. Unused/duplicate code verification before proposed deletion.
- `.claude/agents/converter-coordinator.md` — [5] Orchestrator of four read-only workers and a single integrator.
- `.claude/agents/pagebuilder-source-auditor.md` — narrow read-only local Magento source investigator.

**Deferred:** Figma extraction and visual-fidelity skills; no Figma access in G1. One deferred skill is **named now** (ADR-005-016) and built at the Figma gate: `.claude/skills/figma-structural-extraction/` — read-only node walk, responsive correspondence, deterministic NodeIR with explicit `UNKNOWN` values; FigmaToCode's five-stage contract as method only (GPL-3.0), optional read-only Figwright Grounding adapter, never a Figma write. **Do not clone/duplicate** Slaunchpad's existing skills: `hyva-ui-component`, `hyva-alpine-component`, `hyva-compile-tailwind-css`, `hyva-global-style-foundation`, `magento-module-analysis`. Reference only if the explicitly supplied local project checkout contains them.

## Skill validation checklist

Before claiming the skills are deployable, test that:
- A task for another issue gets that issue number, **not hardcoded `[5]`**.
- A clean clone with no `/home/thanhle` path works for generic contract tasks.
- A non-Magento profile is not forced to load Magento dependencies.
- Read-only workers cannot write to shared docs/specs/branch.
- A missing capability, variant, evidence source or optional local source yields `NOT_VERIFIED`/`UNSUPPORTED` diagnostics, not fabricated PASS.
- No source design or production CMS is accessed in the current G1.
