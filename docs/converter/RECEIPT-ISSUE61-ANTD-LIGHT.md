# RECEIPT — Issue #61: DET Studio Ant Design Light — shadcn UI completely replaced

**Date:** 2026-11-11 · **Branch:** `thanhle74/61-det-studio-ant-design-light-replace-shadcn-ui` · **Base:** `main` @ `4cbf306` (merge of PR #62, i.e. post-[60] npm workspaces — the issue's stated dependency).

**Status: `ANTD_LIGHT_STUDIO_MIGRATED`** — Studio's presentation layer is genuine Ant Design 6, light-only; shadcn/ui, Radix wrappers, `class-variance-authority`, `cn`, `tw-animate-css`, Lucide and the dark-only theme are removed from Studio source, deps and config. Engine, CLI, schemas, server-only runner, download integrity and all data-honesty surfaces unchanged. **Draft PR for Coordinator review; no merge without explicit Owner GO.**

---

## 1. What shipped (3 commits)

1. **C61-1 `79c0485` — antd foundation.** Verified pins (npm registry peer-deps checked, not guessed): `antd@6.7.0` (React 19 supported natively since 6.0.0 — no `@ant-design/v5-patch-for-react-19`), `@ant-design/icons@6.3.4`, `@ant-design/nextjs-registry@1.3.0` (CI-tested against Next 16). New client `components/layout/studio-providers.tsx`: `ConfigProvider` with `theme.defaultAlgorithm` **explicit** (light-only invariant, no toggle/OS-following), `controlHeight: 44` (the issue's 44px+ click targets), Menu `itemHeight: 44`, `App` wrapper (antd message context without contextHolder). Root layout composes `AntdRegistry > StudioProviders > StudioShell` inside a `Suspense` boundary — the official Next 16 remedy because `AntdRegistry`/cssinjs seed `Math.random()` (`createCache()`, module-scope `randomSelectorKey`), which Next 16's static prerender refuses to bake into `/_not-found` without a boundary. globals.css rewritten light (no `@custom-variant dark`, no `color-scheme: dark`, no dark tokens, no `shadcn/tailwind.css`/`tw-animate-css` imports). Deleted: `components.json`, dead `components/ui/{dialog,scroll-area,skeleton,tabs}.tsx` (zero importers, grep-verified). vitest.setup adds `window.matchMedia` + `scrollIntoView` mocks (antd rc-* needs). 4 focused provider/theme tests added.
2. **C61-2 `58f1d72` — full migration sweep.** All routes + shell + 5 module groups on antd primitives; server pages keep `connection()`/probes/metadata and shed presentational JSX into 5 new `'use client'` view children (`overview-view`, `build-view`, `catalog-view`, `run-header`, `reader-problem-state`); 12 presentational components gained `'use client'`. Deleted the remaining 10 `components/ui/*` + `lib/utils.ts` (cn shim); dropped deps `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`. vitest `include` fixed to cover `components/**` (the provider tests added in C61-1 were silently excluded before — count correction below).
3. **C61-3 (this commit) — docs + evidence.** `apps/studio/README.md` Theme section rewritten for [61]; `.claude/skills/det-studio-ui/SKILL.md` rewritten (antd 6 light-only doctrine, supersedes [29]/[52] stack); `DET-PERSISTENCE-AND-KNOWLEDGE-ARCHITECTURE.md` relabeled; `DET-STUDIO-MVP.md` gets a dated supersession note (body untouched); screenshots `61-*` + DOM evidence; historical [52] assets and all prior receipts untouched.

## 2. Dependency diff (apps/studio/package.json, exact)

| | before (base `4cbf306`) | after (head) |
|---|---|---|
| dependencies | `class-variance-authority`, `cn`, `lucide-react`, `next`, `radix-ui`, `react`, `react-dom`, `zod` | `@ant-design/icons 6.3.4`, `@ant-design/nextjs-registry 1.3.0`, `antd 6.7.0`, `next`, `react`, `react-dom`, `zod` |
| devDependencies | … `shadcn`, `tailwindcss`, `tw-animate-css` … | … `tailwindcss` … (no `shadcn`, no `tw-animate-css`) |
| Tailwind | kept | **kept — layout/typography utilities only** (evidence-based: 306/321 className attributes used utilities across 21 files; removing it would have doubled the diff without being required; the Magento/Hyvä adapter + Preview Theme Tailwind contract is separate and untouched) |

`package-lock.json` remains the ONE root lockfile ([60] invariant). `components.json` deleted.

## 3. Gates (exact commands, this workspace)

| Gate | Command | Result |
|---|---|---|
| Root contracts | `npm test` | **195/195 pass** (before AND after — engine untouched) |
| Studio unit | `cd apps/studio && npx vitest run` | **226/226** (222 pre-existing + 4 provider tests; conversion-form adapted once: Select selected-label assertion now queries the `.ant-select` root; tooltip `role="tooltip"` verified present in antd 6, no adaptation needed) |
| Studio typecheck | `npm run typecheck` | pass (0 errors) |
| Studio lint | `npm run lint` | pass |
| Studio prod build | `npm run build` | pass (routes: `/`,`/build`,`/catalog` partial-prerender, `/_not-found` static, APIs dynamic) |
| CI jobs | unchanged `.github/workflows/validate.yml` `contracts` + `studio` | no structural change; exact-head names preserved |

Honesty notes: (a) one load-order flake of `src/server/catalog/runner-catalog-integration.test.ts` was observed mid-integration; it passes in isolation and on two subsequent full runs — timing-sensitive real-CLI test, not touched by this issue. (b) The earlier C61-1 statement "222 = 218+4 new tests" was wrong: the vitest `include` gap meant the provider tests were not counted; real total after the fix is 226 (222 existing + 4 new).

## 4. Operator E2E (existing real-derived project, production server)

Single-root flow ([58] runbook): `npm run start` from the repo root (port 3100; 3000 occupied by an unrelated local server, same env note as the [56] receipt).

- `/build` lists **"Slaunchpad Homepage — real-derived (Figma rev 2417494580183108397)"** with `repository example` badge, `runnerReady: true`.
- Build triggered exactly as the UI button does — `POST /api/builds {"configId":"slaunchpad-home-real-derived"}` → **202** `build-1794385166500` → **exit 0** (0.93s); stages `capability-probe: reused / extraction: completed / composition: completed`.
- Run page: gaps verbatim (`COMPOSITION_SKIPS_PRESENT · 10`, `COMPOSITION_GAPS_PRESENT · 12`, both PREVIEW boundaries), source design tree renders all 12 real sections with per-node Compose vs Review tags (mapped=green, gap=gold, NEEDS_REVIEW=gold+warning, PARTIAL amber band), provenance footer, **`PREVIEW_UNAVAILABLE` rendered verbatim — not simulated**.
- Download integrity: `GET /api/runs/<runId>/artifacts/03-composition%2Fnative-content.html` → 200, **3288 bytes, sha256 `6362c6a9…893bdf` == build-manifest output hash** (byte-verified).
- Sanitized committed evidence: `evidence/issue-61/operator-run.antd-light.json` (machine paths replaced with `<repo-root>` per the evidence-path rule).
- 409 single-build semantics unchanged (api route tests cover it; the live race was not exercised because the real build finishes in ~1s).

## 5. Visual evidence (light UI, this commit)

`apps/studio/docs/screenshots/`: `61-overview-desktop/narrow.png`, `61-build-desktop/narrow.png`, `61-catalog-desktop/narrow.png`, `61-run-detail-desktop/narrow.png`, `61-run-not-found-desktop.png`, plus `61-light-dom-evidence.txt`. Headless Chrome with `--virtual-time-budget=10000` (plain `--screenshot` fires before hydration reveals the streamed Suspense content — blank body, see §6c). Narrow (414px) shows the horizontal antd Menu fitting without overflow and the tagline hidden below `md`. Historical `52-*` dark assets preserved untouched.

## 6. Known observations (honest, non-blocking)

a. antd's own injected library CSS contains internal `.ant-menu-dark` variant rules (part of every antd stylesheet; unused here). Studio source has zero dark tokens/classes — the acceptance target is Studio source, and it is clean.
b. antd derives `Layout.Header` height from tokens (`controlHeight*2` → 88px at 44); the shell pins a 64px enterprise header with 44px menu items — a one-line change if the Coordinator prefers the taller token-derived header.
c. The `Suspense` boundary (prerender remedy) means the streamed content reveals after hydration; on localhost this is sub-second. Static prerender of `/_not-found` stores the `fallback={null}` shell.
d. Copy-audit during migration: 131 curated user-facing strings checked rendered-form — 0 missing. Comments in a few new view files record that copy was carried over verbatim from the previous markup (provenance comments, kept intentionally).
e. Tailwind core typography utilities (`text-*`, `font-mono`, `truncate`, …) remain in feature code by design (layout/typography utilities, no shadcn tokens — grep-verified zero token-utility usage outside the deleted primitives).

## 7. Boundaries honored

No Figma reads/writes; no Magento CMS/Admin/DB/store/theme writes; no Hyvä source copying; no engine/schema/CLI contract changes; `kb-ui-component.schema.json`'s `"tailwind-v4"` enum (adapter data) untouched; Preview Theme untouched; receipts #52/#56/#58/#60 and `DET-STUDIO-PARALLEL-WORKERS.md` preserved as history. Parallel-work contract: 4 read-only audit workers → foundation by the integrator → 3 disjoint-path implementation workers (shell / routes / modules+tests) + 1 docs worker → single integrator ran all gates and the E2E. **STOP here for Coordinator independent review — no self-merge, no new issue.**
