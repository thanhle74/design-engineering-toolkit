---
name: det-studio-ui
description: Build or review the [29] DET Studio Next.js UI (Ant Design 6, light-only) using the existing DET JSON contracts, feature modules, truthful statuses and isolated Preview Theme boundary.
---

# DET Studio UI

> This skill was rewritten for the [#61](https://github.com/thanhle74/design-engineering-toolkit/issues/61) Ant Design light migration and supersedes the [29]/[52] shadcn/dark doctrine.

Read `specs/DET-STUDIO-MVP.md` (note its [#61] stack-supersession note at the top), the live [29] Issue, and the current DET schemas before editing. The Engine/CLI is the only conversion authority; Studio never generates Page Builder or PHTML.

1. **Stack:** Next.js App Router + TypeScript + Ant Design 6 (pinned `antd` / `@ant-design/icons` / `@ant-design/nextjs-registry`) used **as-is** — stock antd default light theme, no theme customization (no `ConfigProvider` theme or token overrides; this is the doctrine), with `AntdRegistry` in the root layout. Tailwind is removed from Studio — antd primitives replace its utilities. No shadcn/ui, Radix, Lucide, `cva` or `cn()` — antd primitives are used directly, with tiny feature-specific wrappers only where needed.
2. **Modules:** route files compose features; feature-local `components/`, `hooks/`, `types/`; narrow server-only DET reader. Avoid circular imports and arbitrary abstraction.
3. **Data honesty:** map actual `tool-run.json`, NodeIR, PageStructure and compose outputs; provenance and all `GAP/EXCLUDED/NEEDS_REVIEW` statuses survive. Fixture mode visibly labeled; Preview unavailable is not a failure to hide.
4. **Interactions:** controls must work; disable "run conversion" until [28] supplies a verified safe engine bridge. Do not invoke arbitrary shell commands or read arbitrary client-provided local paths.
5. **UX:** stock antd default sizes; no bespoke styling — an experienced antd user should recognize the UI as stock antd Light. Light-only is an invariant (no dark fallback, toggle or OS-following); clear heading hierarchy, accessible antd primitives, readable typography, loading/empty/error/partial/not-connected states. Screenshot and test the working UI.
6. **Boundary:** no licensed Hyvä source, client theme or Magento/Figma writes. No auth/database/queue/cloud system in MVP.

Adapted from `seo-writer-engine@development` `specs/SPEC-DASHBOARD.md` (feature modules, fast iteration, evidence discipline). **Do not copy SEO-specific domain code**; its shadcn doctrine and `components.json` no longer apply after [61].

## Parallel mode [29]

Read `specs/DET-STUDIO-PARALLEL-WORKERS.md`. The lead integrator bootstraps/fixes the shared `StudioRunView` contract first and explicitly opens the parallel gate; only then do worker A (conversions), B (design-tree + mapping-review), C (preview + artifacts) and D (server reader + guarded routes) work simultaneously. Each worker may touch ONLY its owned paths. Workers never alter the shared schema/`StudioRunView` contract, the app route shell, the shared provider/theme/globals (`studio-providers`, `app/globals.css`), package/lockfile or Engine — antd is the single UI-primitive source. Ask integrator for shared changes. Workers provide exact changed-file list + targeted test evidence; integrator performs composition, full build, UI verification and the single Draft PR.
