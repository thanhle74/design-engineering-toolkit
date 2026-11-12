# Receipt — Chore: Next.js modular standard adopted (Studio screens/lanes), CI workflow removed

Date: 2026-11-12 · Branch: `main` (Owner-directed, no issue) · Base: `3739041` · Gates all green on the receipt head.

## What the Owner asked (2026-11-12, same session)

1. Adopt the pasted **Next.js Modular Architecture — Coding Standards** as the default coding convention for the project; audit → controlled refactor → validation, no mid-way confirmation stops, no business changes.
2. Remove `.github/workflows/validate.yml` ("ko xài validate github").
3. With all architecture/format changes done, update and clean the agent-facing specs.

## Standard landing (new spec: docs/specs/NEXTJS-MODULAR-STANDARD.md)

The standard governs the **Next.js surface only** — `app/` + `src/modules/studio/**`. The headless engine (`src/core`, figma/magento/knowledge modules, adapters) is a deterministic CLI, not a Next.js feature module, and stays under the [68] doctrine (the standard's own rule 10 forbids mechanical restructuring of what is already correct; its services/repositories roles map to the existing `server/` server-only seam; `permissions/` is deliberately absent — local operator tool, auth is a future gate). Prettier tabWidth 3 (from this session's `afc2735`) is codified in the spec. Gates are now **local** — recorded in AGENTS.md/README.

## Audit → refactor (behavior-preserving, `git mv` history preserved)

Audit facts: every non-routing component in `app/` was imported ONLY by its own `page.tsx` (or sibling view); zero tests imported `app/` files; zero non-receipt docs referenced the moved paths — minimal blast radius.

Moved out of `app/` into module lanes (new lanes get an explicit `index.ts` public API; screens named `*.screen.tsx` per the standard):

| Was | Now |
|---|---|
| `app/overview-view.tsx` (`OverviewView`) | `modules/overview/screens/overview.screen.tsx` (`OverviewScreen`) |
| `app/build/build-view.tsx` (`BuildView`) | `modules/build-control/screens/build.screen.tsx` (`BuildScreen`) |
| `app/build/build-launcher.tsx` | `modules/build-control/components/build-launcher.tsx` |
| `app/catalog/catalog-view.tsx` (`CatalogView`) | `modules/catalog/screens/catalog.screen.tsx` (`CatalogScreen`) |
| `app/runs/[runId]/{run-header,build-bundle-section,reader-problem-state,client-artifact-manifest}.tsx` | `modules/run-detail/components/…` |
| run composition inline in `app/runs/[runId]/page.tsx` | new `modules/run-detail/screens/run.screen.tsx` (`RunScreen`) |

`app/**/page.tsx` now contains ONLY routing, metadata, `connection()`, request-time reads and failure mapping (the agent page already followed this shape via the `agent` lane — the other three converged to it). All pages import screens through the lane public API (`@/src/modules/studio/modules/<lane>`). Internal `build.screen.tsx` → launcher import is relative (`../components/…`), per the standard's internal-import rule. Server/client boundaries unchanged: every moved file keeps its `"use client"` directive; server code stays in `server/` behind `import "server-only"`; no circular imports introduced (screens import lanes one-way).

## CI workflow removal

`.github/workflows/validate.yml` deleted (Owner direction; `git rm`, `.github/` left empty and removed). The **gates themselves are unchanged and still mandatory** — they just run locally: `pnpm test` (contract suite), `pnpm run test:studio`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`. No CI badge/run claims remain anywhere in live docs.

## Agent specs cleaned (truth updates only, no history rewrites)

- `AGENTS.md` — gate paragraph now says gates run LOCALLY on the exact head (no GitHub Actions workflow since 2026-11-12), `pnpm run format` (Prettier tabWidth 3) before committing; Navigation gains the new standard doc.
- `CLAUDE.md` — "refresh GitHub Issue/PR/ref/CI truth" → "ref truth" (no in-repo CI to refresh).
- `README.md` — test-gate bullet: local-gates wording + corrected Studio gate count (375 tests / 37 files, was stale "225 checks") + format command.
- `resources/schemas/README.md`, `resources/schemas/converter/README.md`, `docs/studio/README.md`, `.claude/skills/det-cli/SKILL.md` — CI mentions reworded to the local gate truth.
- Historical receipts/specs/ADRs keep their dated wording (no-rewrites rule); this receipt documents the supersession.

## Gates on the exact receipt head (all PASS)

- `pnpm run typecheck` clean · `pnpm run lint` clean
- Studio vitest: **375/375 (37 files)** — incl. the truthfulness contracts (asserted copy untouched; not-connected/single-alert/DOM contracts intact)
- Contract suite: **195/195 checks passed** (engine untouched)
- Production build: **14/14 routes**, "Compiled successfully"
- Behavior preserved: no copy/logic/schema changes in moved files (verbatim `git mv` + import-path edits + three `View`→`Screen` symbol renames)

## Boundaries honored

No engine/schema/CLI/adapter changes; no UI redesign beyond structure; no Figma/Magento writes; historical docs untouched; direct-to-`main` commits per the Owner's session workflow.
