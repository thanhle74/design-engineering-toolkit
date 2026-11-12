---
name: det-fast-iteration
description: Efficient iteration for DET tasks — source-backed small diffs, narrow tests during edits, complete verification once before review. Adapted from SEO Writer Engine fast-iteration and root-cause-analysis.
---

# DET Fast Iteration

1. Read only the active issue, current task-specific DET specs, affected code and prior receipt. Inspect existing components/schema before adding files; use `rg`/CodeGraph if available, but no mandatory tooling bootstrap or install.
2. Name the exact failing assumption or missing capability. For a bug: **reproduce → localize → reduce → smallest root-cause fix → regression guard**; do not patch individual Figma nodes, arbitrary URLs or hardcode Owner-specific paths.
3. One writer per branch/workspace; validate the existing Orca worktree rather than creating nested worktrees. Preserve unrelated changes and never reset/clean/force-push.
4. During editing run the smallest tests for changed files (e.g. `pnpm exec vitest run <file>` for Studio, the single targeted `scripts/run-contract-tests.mjs` suite for engine), optionally incremental TS checking. **Full gates once at the end, LOCALLY on the exact head (the repo has no CI):** `pnpm test` (contract suite), `pnpm run test:studio`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`; rerun after final correction, then `pnpm run format` (Prettier, tabWidth 3) before committing.
5. Keep imports/schemas narrow. Don't add libraries or abstractions "for future". If a needed API is unavailable, present truthful `BLOCKED`/not-connected status and a concrete dependency on [28], not a fake success.
6. Write concise results: exact branch SHA, tests and counts, out-of-scope unchanged, next true blocker. Hand off one Draft PR; implementer never self-ACCEPTs.

Adapted principles from `seo-writer-engine@development` `.claude/skills/fast-iteration/SKILL.md` and `root-cause-analysis/SKILL.md`; no SEO cron, DB, publish or OpenResearch assumptions.
