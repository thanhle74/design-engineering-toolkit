# DET Studio MVP — UI and Module Contract

> **SUPERSEDED (implementation stack only) — 2026-11-11, Issue [#61](https://github.com/thanhle74/design-engineering-toolkit/issues/61):** Owner GO replaced the shadcn/ui + Radix + Lucide stack prescribed below with **Ant Design 6 (antd 6.7.0), LIGHT mode only** — light-only is an invariant (no dark fallback, toggle or OS-following); shadcn/ui, Radix wrappers, cva, cn, tw-animate-css and lucide-react are removed, and Tailwind remains only for layout utilities inside Studio. The affected implementation-stack passages are §1 "Owner-selected stack", the §2 layout tree (`components/ui/`, `components.json`), §4 UI principles (shadcn primitives/Lucide), §6 item 1 and the §7 shadcn-doctrine provenance bullets. All functional requirements — the Engine/Studio boundary, data honesty and truthful states (§3, §4, §5, §6, §8) — remain in force. **Owner correction (2026-11-11):** that correction also supersedes any custom-theme/44px wording in this document — **stock antd light** (default theme, sizes and fonts used as-is; no `ConfigProvider` theme or token overrides; Studio Tailwind removed entirely) is the implementation standard.

**Status:** implementation contract for [#29](https://github.com/thanhle74/design-engineering-toolkit/issues/29) · 2026-11-09.
**Authority:** current `specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md`, `specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md`, live Issue [28]/[29] and actual `det` schemas/source. This document is *not* an authorization to change Engine behavior.

## 1. Goal and scope

Build **one small, independently bootable DET Studio UI** for local trusted developer/team use. It is a thin operator/review layer over the deterministic `det` CLI: input a Figma URL, view extracted sections/node mappings and diagnostics, preview only an **actual available** isolated DET Preview Theme, and download validated artifacts.

**Owner-selected stack:** **Next.js App Router + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix primitives) + Lucide icons**. Use the official shadcn CLI, `components.json`, CSS variables and `cn()`, pin compatible versions in the Studio lockfile. Reference the currently maintained official installation guides; DO NOT blindly import the SEO repo's versions or private business components.

The boundary is nonnegotiable:
- **[28] Engine** owns source adapters, NodeIR, PageStructure, KB/capability evidence, component classification, Page Builder/PHTML generation, standalone `det build`, disposable Magento preview and portable artifacts.
- **[29] Studio** owns layout, forms, component review, diagnostics, preview presentation, artifact listing/download and typed adapter interface. Never regenerate/guess conversion logic in React or Route Handlers. No Figma provider implementation, Hyvä PHP/theme changes, CMS import or Magento writes.
- Standalone Engine and Studio can run separately. Neither relies on Claude Code/Orca at runtime.

## 2. Feature-based modular shape

Prefer the smallest practical structure; keep Next.js routes as composition only:

```text
apps/studio/
  app/                         # App Router pages/layout and thin server route handlers
  components/ui/               # installed shadcn components; avoid hand-rolled equivalents
  components/layout/           # one shared Studio shell/navigation
  src/modules/
    conversions/               # New conversion form and run/result summary
    design-tree/               # source tree and section inventory
    mapping-review/            # MAPPED / GAP / EXCLUDED / NEEDS_REVIEW views
    preview/                   # honest resolved-preview state or unavailable
    artifacts/                 # manifest and safe export/download views
  src/server/
    det-run-reader.ts           # server-only typed reader for versioned DET outputs
    artifact-access.ts         # allowlisted local path resolution
  src/shared/
    contracts/                 # read-model validation; conform to actual Engine JSON
    ui/                        # shared non-shadcn UI compositions only if reused
  components.json
```

This is a **guide, not mandatory empty-folder scaffolding**. Only create modules actually needed by [29]. A feature owns its components/hooks/types; cross-feature access goes through explicitly exported small public interfaces. Don't create per-feature backend services, registries or one-off wrappers without real reuse.

**Dependency direction:** `app/ -> feature modules -> typed run reader -> existing DET artifact/schema`. `components/ui` is shared and presentation-only. Client Components do not import `fs`, `path`, Node `child_process`, secrets or private project data. Default to Server Components; create narrow `"use client"` leaves only for state/interactions.

## 3. Read-model contract

Consume **real existing `tool-run.json` + NodeIR/PageStructure/SourceReview/compose-output** and their schema definitions. If [28]'s final one-shot manifest is not yet available, implement a typed `DetRunReader` boundary with **explicit DEMO/FIXTURE mode** and fixtures shaped exactly like current source schemas. Keep schema and origin provenance visible. Do not invent persistent IDs, live status, preview URLs, or unsupported labels and treat them as production facts.

At minimum each run presents source id/revision (or truthful unavailable), ordered sections, per-node mapping disposition, diagnostics and artifact manifest. **"Preview unavailable"** must render whenever a verified local Preview Theme URL/artifact is absent. Any request to start a live conversion is disabled or explicitly labeled `NOT CONNECTED` until [28]'s CLI invocation boundary is verified. Never execute raw shell input received from the browser.

## 4. UI principles (adapted from SEO Writer Engine)

Use shadcn primitives `Button`, `Input`, `Select`, `Tabs`, `Badge`, `Table`, `Dialog`, `Skeleton`, `Tooltip` before custom controls; `cn()` + Tailwind semantic variables before custom CSS. One h1 per view; consistent spacing and readable type (`text-xs` floor, `text-sm` body), calm neutral palette, accessible focus, Lucide icons. Optimize for an **operator workspace** (clear source list, mapping statuses, diagnostics, preview), not a card-heavy SaaS dashboard.

Truthful `EMPTY`, `LOADING`, `ERROR`, `NOT_CONFIGURED`, `PARTIAL`, `PREVIEW_UNAVAILABLE` and `DEMO` states; unknown counts remain unknown, never rendered as zero. No disabled controls that appear to work; interactions must have real behavior or clearly state unavailable. Responsive desktop/tablet, keyboard navigation and scroll containment.

**Do not copy SEO's admin pages, domain logic, DB/auth, dashboards, 20-rule policy verbatim, or its historic UI-framework experiments.** Only principles and minimal, license-safe general patterns.

## 5. Server and security boundary

Single local trusted operator MVP, **not public/multi-user deployable**. Server routes read *only* configured DET output roots, enforce canonical `realpath` containment, block symlink traversal and arbitrary parent paths, validate allowed extensions, MIME and size before downloads, and expose neither absolute paths nor tokens. Use static fixture export paths where even a guarded file route is premature. No upload of licensed Hyvä UI or private Figma assets to public demo services.

Later multi-user deployment requires explicit auth, per-run isolation and access control; **not this issue**. Do not build a new DB, scheduler, queue, AI provider abstraction, remote execution service, account system or production API.

## 6. Acceptance and fast review

1. Next.js + shadcn starts from a single documented command, build/lint/typecheck pass on pinned package versions.
2. End-to-end **fixture-backed** UI: form validation; source tree; mapping + diagnostics; Preview unavailable vs verified-preview states; artifact list/download if real artifact exists; accurate provenance.
3. Keyboard/responsive check plus screenshot of main/results/empty/error (screenshots are UI proof, not converter proof).
4. Module boundary check: no `det` engine source modified; no Figma/Hyvä/Magento writes; no phantom conversion success. CI on exact PR tip.
5. One Draft PR (Owner merge gate), small source-backed receipt. Coder reports `READY_FOR_COORDINATOR_REVIEW`, never self-`ACCEPT`.

## 7. Reuse/provenance (private source — principles only)

Reference **`thanhle74/seo-writer-engine@development`**:
- `specs/SPEC-DASHBOARD.md` — active shadcn/Tailwind UI doctrine and § “MODULAR PROJECT ARCHITECTURE SPEC”.
- `components.json` — neutral shadcn configuration pattern, not a byte-for-byte Studio config.
- `.claude/skills/fast-iteration/SKILL.md` — narrow suite during coding; full battery once at closure.
- `.claude/skills/self-review/SKILL.md`, `evidence-receipt/SKILL.md`, `root-cause-analysis/SKILL.md` — actual proof, smallest fix, Coordinator owns ACCEPT.
- `specs/architecture/BOUNDED-EXTENSION-POINTS.md` — only abstract when real provider variance exists.

These rules are **adapted to DET**, not imported as an additional governance layer. Prioritize fast iteration and small diffs.

## 8. Parallel Orca execution for [29]

**MANDATORY:** Use the [Studio parallel worker contract](DET-STUDIO-PARALLEL-WORKERS.md) before starting multiple coding agents. It defines the bootstrap gate, four simultaneous worker lanes, exact file ownership, frozen shared types, integration owner, tests and stop conditions. Existing UI/Engine and trust-boundary rules above remain authoritative. **One issue, one integrated Draft PR; four bounded workers, not four competing implementations.**
