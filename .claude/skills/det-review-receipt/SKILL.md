---
name: det-review-receipt
description: DET terminal self-review and compact evidence handoff — prove tested source/UX/permissions on exact commit, report failures honestly, leave ACCEPT to Coordinator.
---

# DET Review Receipt

Before reporting done:

- Verify the actual diff/affected callers; check unsafe server/client imports, path containment, unexpected writes and schema drift.
- Run exact checkout tests: `pnpm test` for DET core when changed; Studio `typecheck/lint/build` plus focused UI tests when Studio changed; capture actual exit status.
- Capture **small evidence**: issue + PR, branch and exact SHA, edited files, feature screenshots, UI states tested, actual artifact provenance, fixture vs live labels, known gaps and next blocker. Don't claim an Admin Save/Reload or Figma/preview run from demo screenshots.
- Negative side effects: Figma writes NO, Magento CMS/theme writes NO, live user conversions NO (unless separately authorized), production writes NO, secrets or licensed source exported NO, unrelated files changed NO. Mark unverified as UNVERIFIED, not PASS.
- Implementer outcome: `READY_FOR_COORDINATOR_REVIEW`, `PARTIAL` or `BLOCKED`; only independent Coordinator may ACCEPT. Owner controls merge.

For [29] report sample flow: input validation → fixture read → source tree/mapping → empty/error/not-connected/preview-unavailable → verified artifact download, tested in browser. Adapted from SEO Writer Engine `self-review` and `evidence-receipt` skills; compact DET-specific receipt, no two-commit ritual or SEO-only metrics.
