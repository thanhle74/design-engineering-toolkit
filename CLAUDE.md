# Claude Code — Design Engineering Toolkit

Read [AGENTS.md](AGENTS.md) first; it is the single source of truth for workflow, safety, and project-neutral boundaries.

For current work read [Issue #5 architecture spec](specs/ISSUE-5-converter-architecture.md), then the relevant focused `.claude/skills/*/SKILL.md`. Task names begin with **`[5]`** (GitHub Issue ID). Dispatch independent read-only workers in parallel; keep exactly one shared-branch writer/integrator.

**Current gate:** architecture only; no Figma calls, no Magento CMS/DB writes, no CSS fidelity, no auto-merge.
