---
name: evidence-led-repo-hygiene
description: Inspect a toolkit repository for unreferenced files, redundant code, duplicate guidance, outdated specs and dependencies without behavior loss. Use before deleting, consolidating, renaming or simplifying code/docs in a shared multi-project toolkit.
---

# Evidence-led repository hygiene

**Read-only worker first.** Identify current git baseline, branch, all repository files and entrypoints. Read `AGENTS.md` and the active issue contract.

1. Build a simple inventory: runtime code, contracts/schema, active docs, historical design pilot, evidence, templates, scripts, tests, CI, profiles and skills.
2. Check **actual references** from README, spec, scripts, imports, tests, examples, workflows and downstream projects. A file not called by new code may still be historic evidence.
3. Classify each item `KEEP`, `UPDATE`, `DUPLICATE_CANDIDATE`, `REMOVE_CANDIDATE`, or `UNKNOWN`. Quote source path / reference search and blast radius.
4. Present the exact proposed removal diff **before** action. Never delete `projects/slaunchpad-fashion/pilot/evidence`, fixtures or V1 contracts merely because a newer stage exists.
5. Only the single integrator may remove files after dependency/call-site scan and a fresh test/build. Keep old public schema compatibility unless migration is explicitly approved.
6. Verify there is no hardcoded path like `/home/thanhle` or Figma node IDs in reusable core/runtime; project-specific local overrides must be untracked.
7. Report stale claims (e.g. README describing the V1 architecture as awaiting review after PR approval), but update once from authoritative evidence rather than replacing history.

**Output:** `[<issue>] W-D` evidence table, safe candidates, blockers, tests required and explicit **NO DELETE** when usage cannot be established. Clean code means less accidental complexity, not fewer files at any cost.
