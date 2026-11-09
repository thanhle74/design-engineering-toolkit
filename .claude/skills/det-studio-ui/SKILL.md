---
name: det-studio-ui
description: Build or review the [29] DET Studio Next.js/shadcn UI using the existing DET JSON contracts, feature modules, truthful statuses and isolated Preview Theme boundary.
---

# DET Studio UI

Read `specs/DET-STUDIO-MVP.md`, the live [29] Issue, and the current DET schemas before editing. The Engine/CLI is the only conversion authority; Studio never generates Page Builder or PHTML.

1. **Stack:** Next.js App Router + TypeScript + Tailwind 4 + official shadcn/ui/Radix + Lucide. Generate standard components, prefer tokens and `cn()` over custom widgets. Check compatibility rather than copying versions.
2. **Modules:** route files compose features; feature-local `components/`, `hooks/`, `types/`; shared `components/ui/`; narrow server-only DET reader. Avoid circular imports and arbitrary abstraction.
3. **Data honesty:** map actual `tool-run.json`, NodeIR, PageStructure and compose outputs; provenance and all `GAP/EXCLUDED/NEEDS_REVIEW` statuses survive. Fixture mode visibly labeled; Preview unavailable is not a failure to hide.
4. **Interactions:** controls must work; disable "run conversion" until [28] supplies a verified safe engine bridge. Do not invoke arbitrary shell commands or read arbitrary client-provided local paths.
5. **UX:** calm operator layout, clear heading hierarchy, accessible shadcn primitives, readable typography, loading/empty/error/partial/not-connected states. Screenshot and test the working UI.
6. **Boundary:** no licensed Hyvä source, client theme or Magento/Figma writes. No auth/database/queue/cloud system in MVP.

Adapted from `seo-writer-engine@development` `specs/SPEC-DASHBOARD.md` (active shadcn doctrine and feature modules) and `components.json`. **Do not copy SEO-specific domain code.**
