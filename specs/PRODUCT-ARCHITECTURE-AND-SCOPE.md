# Product Architecture & Delivery Boundaries — Design Engineering Toolkit

**Status:** OWNER DIRECTION / cross-project scope contract · **Date:** 2026-11-03  
**Applies to:** future products built with this toolkit; scoped technical implementation still requires its own issue/spec, evidence and GO.  
**Related work:** [#5 Capability/Structural Architecture](https://github.com/thanhle74/design-engineering-toolkit/issues/5), [#7 Knowledge Foundation](https://github.com/thanhle74/design-engineering-toolkit/issues/7), [Slaunchpad #42](https://github.com/thanhle74/slaunchpad/issues/42), [#32](https://github.com/thanhle74/slaunchpad/issues/32).

> **Current delivery priority:** implement the **Figma → editable Magento Page Builder** path for CMS pages **FIRST**. Everything else below is explicitly longer-term architecture, not a requirement to implement now. #5 and #7 are running independently; do not interrupt or silently expand their current work.

## 1. Product purpose and end-to-end roadmap

Create a portable, reusable design-engineering tool that **does not invent missing UI/business capability**. It should know what a customer's platform and licensed UI packages actually provide, help plan/reuse those capabilities for UX/design, and eventually compile approved designs to maintainable, editable implementations.

**Canonical long-term pipeline (normative):**

```text
Requirements
  → Platform/UI Audit
  → Capability Registry
  → UX Architecture
  → Figma Design
  → Structural Mapping
  → Functional Round-trip
  → Visual Fidelity
```

- This is a **future end-to-end vision**, not one giant MVP or an instruction to open all gates.
- There are two useful flows: **Requirements → capability-informed design**, and **Approved design → implementation**.
- **Now:** focus on **approved Figma → Magento Page Builder** only. Knowledge Foundation (#7) may define upstream capability contracts in parallel, but implementation/consumption is gated separately.
- All approved original Figma designs are **frozen**. No automatic modification of approved frames. Fixture selection (Slaunchpad `245:2` Desktop / `245:16` Mobile) belongs to a later explicitly authorized stage.
- Avoid re-audit/rewrite loops. Every gate has inspectable artifacts, provenance, unresolved findings, and review receipts.

## 2. Three logical knowledge domains (future foundation)

| Domain | Answers | Data examples | Source/proof concerns |
|---|---|---|---|
| **Platform Knowledge** | What features, APIs, data/context and rendering methods does the target project actually have? | Magento modules/core, enabled/configured functionality, Page Builder content types/appearances, catalog providers, integration points, plugin/override contracts | Installed ≠ enabled ≠ configured ≠ runtime-proven. Include exact source path/symbol/version and constraints. |
| **UI Component Knowledge** | Which layouts/visual components and interactions can already be reused? | Licensed Hyvä UI component family, variants, templates, slots, Tailwind/CSS, Alpine.js behavior; native PB and Secomm_UiWidget relation | Distinguish upstream commercial package vs installed widgets vs PB native; retain licenses, provenance and eligibility. |
| **Project Knowledge** | What does the client actually need and what has been approved? | Requirements, users/journeys, page types/sections, business goals, design tokens, acceptance criteria, decisions, asset/license policy | Project isolation, explicit owners, approved vs inferred data, no client secrets or sample production claims. |

These are **logical domains**, not automatically three databases. Share stable IDs, schema versions, source pointers, proof state, relationships, and incremental invalidation rules; choose physical storage only after the [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) technology ADR. Index/query structured facts first; optional semantic search is justified only by evidence. Audit licensed local source without redistributing it.

**Future linking contract:** `Requirement → UX intent/section → available Platform Capability + UI Component/Variant → proposed composition → approved design → target implementation → acceptance/evidence`. Every `GAP` or `CUSTOM_REQUIRED` remains explicit; no invented functionality.

## 3. Strict page-type resolver and responsibility boundaries

**Magento Theme (Hyvä)** — site and commerce/system presentation:
- Header, navigation/menu, footer, breadcrumbs, PLP (category), PDP (product), Search results, Cart, other dynamic/system pages.
- Use Magento layout XML, theme template overrides / `.phtml`, view models, Tailwind CSS v4 CSS-first, CSP-safe Alpine.js. Platform modules own data/business behavior; theme is presentation.
- Existing Hyvä child theme first; create a new child theme **only when justified by a separate theme/design-system objective**.
- **Future pipeline only**, not generated in first Figma→Page Builder release.

**Magento Page Builder** — CMS-authored static/editorial page structure:
- Homepage, About, Landing, Campaign, brand/editorial storytelling, merchant-editable CMS pages/blocks.
- CMS pages may **embed dynamic catalog/widget components** (products, categories, recommendations) while Page Builder remains responsible for page composition; underlying data/business rules still belong to Magento.
- Prefer **native Page Builder content types** (Row, Columns, Text, Image, Banner, Slider, Products, etc.) and enabled **Secomm_UiWidget** only when compatible and editable.
- Do **not** put header/PLP/PDP/search-page logic into Page Builder simply to reuse the converter.

**Magento Modules** — domain behavior, providers, reusable widgets, Page Builder custom appearances/content types if truly necessary. They should not be created by default for each page/design, and must not duplicate Magento core behavior.

**Hyvä UI** — a separately licensed component/library layer, not the same as native Page Builder or the custom `Secomm_UiWidget`. Audit family/variant/layout/templates/styling/Alpine behavior and prerequisites before deciding whether reuse is safe. Existing Hyvä UI behavior is a starting point; changing placement/composition is allowed only while respecting registered component contracts, accessibility and upstream integration. Customization or licensing restrictions must be surfaced, not silently bypassed.

**Key rule:** theme and Page Builder are **two different future output pipelines**, selected by actual **page type** and editability requirements. No automatic one-to-one translation of every Figma layer into a Magento theme override.

## 4. Current Figma → Page Builder delivery contract (FIRST)

For the first deliverable, output **editable CMS composition**, not screenshot→pixel HTML and not a generated full Magento theme.

```text
Approved Figma [read-only, later gate]
  → semantic structural extraction (source IDs + layout geometry)
  → versioned Canonical PageStructure JSON
  → Capability Registry + binding resolver
      NATIVE_PAGEBUILDER | SECOMM_UI_WIDGET
      CUSTOM_APPEARANCE_REQUIRED | THEME_CHROME | UNSUPPORTED
  → safe Page Builder master-format content plan
  → isolated CMS Page/Block importer (future approved local gate)
  → Admin Edit → Save → Reload → Storefront
  → visual fidelity work ONLY after structure and functional proof
```

**Required sequence:** `Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity`.

1. **Capability Registry:** inventory native PB content types/appearances, constraints, allowed nesting, editability, real installed `Secomm_UiWidget` registry and actual component variants. A displayed palette item or source class is **not proof** of Admin persistence.
2. **Structural Mapping:** page/section hierarchy, ordering, width ratios (e.g. 40/60 remains 40/60), nested columns, full-bleed vs container, media/content slots, responsive order. **Layout correct before CSS**; unsupported editorial geometry is reported explicitly, not quietly rounded to a 50/50 default.
3. **Functional Round-trip:** generated content must survive real Magento Admin editor cycle without losing widget payload, content or ordering; dry-run/diff, idempotence, conflict guard, reversible rollback. Page Builder persists **master-format HTML**, not raw Canonical JSON in `cms_page.content`.
4. **Visual Fidelity:** typography, colors, images/crop, spacing, hover, animation, desktop/mobile parity, Hyvä/Tailwind/Alpine and accessibility/performance. Do not use CSS hacks to mask incorrect structural mapping.

**Component selection:** reuse the closest *supported semantic component* first, then custom appearance/component only for an evidenced gap. `HTML Code` is not an acceptable silent shortcut to claim merchant editability. No new `content_type.xml` per page. Header/footer/nav/search/cart are `THEME_CHROME` and excluded from Page Builder page content. Reuse existing Slaunchpad research #32 and #42; unresolved Admin round-trip remains a verification gate until a real receipt exists.

## 5. Installation, import and runtime safety

- **Do not default to a Data Patch** that overwrites CMS content on deploy. Prefer an explicit, scoped importer command/API using `dry-run → diff → preview → approved import → verify → rollback`. Idempotence, store/page scoping, conflict detection and merchant-edited-content preservation are mandatory.
- Data Patches are allowed only for **well-defined one-time installation/setup data**, with a documented lifecycle; never treat content sync/rebuild as irreversible patches.
- Create a **disposable local CMS page** for proof, not the active Homepage; use Magento service APIs rather than direct SQL.
- Avoid creating new themes, modules, PHP templates, CSS or plugins when native PB + existing module/Hyvä UI already supports the required behavior.
- Price, stock, discounts, cart/wishlist, business promises and campaign terms must be resolved from real Magento data/config, never Figma mock fixtures.
- For **layout-only QA**, placeholders/mock copy, media or sample product cards may be used **only in isolated previews**, explicitly flagged `MOCK_CONTENT` / `DATA_PROVIDER_PENDING` / `VISUAL_ONLY`; do not expose them as live product/stock/payment behavior or falsely mark functional PASS.
- No production DB/CMS changes, secret reads, active storefront overwrite, or Figma writes without explicit future authority.

## 6. Portability, versioning and licensed-source boundaries

- Shared core is **platform-neutral** and should be able to support another project/platform, without requiring Magento/Hyvä installed.
- Per-project profiles contain source path, platform adapter, theme, data policies, licensed assets, source refs, and target site/store scope. A local checkout such as `/home/thanhle/Sites/Magento/slaunchpad` is **development input for one current profile only**, never a default, required runtime path or source included in distribution.
- Do not embed Magento PHP/runtime semantics, client business rules, brand assets or Figma node IDs in the generic engine. Bind through adapters and profiles.
- Hyvä UI may be inspected only in an authorized local environment; **do not ship upstream source/template assets**, keys, licensed components or proprietary customer data with the toolkit. Store safe component metadata, provenance and pointers.
- Machine contracts: JSON/JSON Schema with version and deterministic serialization, stable IDs, snapshots and compatibility/migration policy. Markdown specs are decisions and acceptance criteria, **not the only executable output**. Work toward runnable core contracts/CLI/tests as their respective implementation gates authorize.
- Proof states must be distinct: `DISCOVERED`, `REGISTERED`, `STRUCTURALLY_MAPPED`, `ADMIN_ROUNDTRIP_VERIFIED`, `VISUALLY_VERIFIED`. Evidence required to promote state.
- Do not prematurely choose TypeScript vs Python by opinion; let #7 make an evidence-backed ADR considering packaging, JSON Schema, parsers, CI and adapters. Avoid a two-language core without proven benefit.

## 7. Task/worker policy and architectural change control

- Orca task titles and worker names use `[<GitHub issue number>] <task title>`. The bracketed number is the **GitHub issue ID**, not a version or phase.
- Independent read-only research can run in parallel with distinct scope; **one integrator owns shared spec/code changes**. Each worker returns source/commit, evidence, findings and gaps. Avoid repeated audits and multiple writers to the same file.
- Code deletions require usage/reference/callsite audit, tests and diff evidence; preserve historic Figma pilot/specs unless actually superseded and safely migrated.
- Do not expand the scope of already-running **#5** or **#7**. This product spec is a **cross-cutting reference**, not an automatic GO to build Theme Pipeline, UX Planner, Hyvä UI exporter or new knowledge ingestion infrastructure.
- The current first shippable capability remains **Figma → Magento Page Builder**. Later **Requirements → UX/Figma** and **Figma → Theme/PHTML** need separate explicit owner GO, specs and delivery plans.

## 8. Boundary acceptance checklist

A proposed implementation must answer:
1. Which page type is requested, and why is Page Builder vs Theme chosen?
2. Which native/installed capabilities and Hyvä UI variants are proven supported?
3. Which sections are editable in Admin and which remain code-owned?
4. What is structural mapping proof, separate from visual fidelity?
5. Are missing business/data behaviors explicitly mocked/gated instead of claimed?
6. Is content import safe against merchant changes and stores?
7. Does a fresh clone on another machine with a different project path work?
8. What is OUT OF SCOPE now, and which issue/GO unlocks it?

**Current answer:** Page Builder CMS pages only. The other outputs are future architecture, not present implementation requirements.
