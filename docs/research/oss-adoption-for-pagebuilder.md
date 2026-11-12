# OSS adoption decision — Figma → editable Magento Page Builder

**Status:** PROPOSED / review-only, Issue [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) · 2026-11-03  
**Scope:** Independent design-engineering toolkit core + Magento-specific adapter; approved SLAUNCH Figma Desktop `245:2` and Mobile `245:16` are read-only fixtures.  
**Decision:** Reuse verified ideas and contracts first. **No third-party source vendoring, runtime dependency, Figma write, Magento installation, CMS import, or production mutation in this research change.**

## Goal and evaluation rubric

We need **editable Page Builder structural output**, not a screenshot-to-HTML export. A source is relevant only if it improves one of:
1. Figma structural extraction (parent/child, Auto Layout, absolute positioning, constraints, ratios and responsive intent);
2. stable component-to-capability resolution with explicit `UNSUPPORTED` output;
3. Page Builder appearance/master format/Admin edit round-trip;
4. low-risk adapter interoperability, tests and provenance.

Check concrete source paths, license, maintenance, dependency weight and live Magento compatibility **before** importing external code. Avoid copying implementations with unresolved legal/technical compatibility.

## Selection matrix

| OSS/project | Decision for #5 | What to borrow or implement independently | Why not integrate whole project? | License/constraints |
|---|---|---|---|---|
| [bernaferrari/FigmaToCode](https://github.com/bernaferrari/FigmaToCode) | **REFERENCE_ONLY (high priority)** | Verified five compiler stages — Read → Normalize → Optimize → Generate → **Explain** (the Explain stage returns code, preview data, extracted assets and machine-readable conversion warnings — a diagnostics channel worth borrowing as a contract concept); inspect Figma Auto Layout, order, sizing and parent/child handling. No git tags/releases exist — pin by commit SHA. Reimplement only needed semantic `NodeIR` and deterministic tests **without copying code** | Produces HTML/Tailwind/React etc., not editable Page Builder semantics; may discard meaningful components during generic codegen | **GPL-3.0**: do not copy/vend code into this toolkit without a separate explicit license review |
| [figma/code-connect](https://github.com/figma/code-connect) | **ADAPT PATTERN (high priority)** | Stable Figma component ID/variant/props → existing backend capability registry binding; detect mapping drift; prefer explicit mappings to heuristic guesses | Code Connect product targets Figma Dev Mode snippets; official publishing requires eligible paid plans; framework-specific parsers are deprecated (template files are current) | Source MIT; platform availability is not an assumed runtime dependency |
| [commerce-docs/pagebuilder-examples](https://github.com/commerce-docs/pagebuilder-examples) + [Adobe Page Builder docs](https://developer.adobe.com/commerce/frontend-core/page-builder/architecture/configurations) (URL works **without** trailing slash; `/configurations/` 404s) | **REFERENCE_ONLY (mandatory for Magento adapter)** | Read actual content types, appearances, allowed parents/children, admin preview/master templates, forms and readers. Test only narrowly needed custom appearance when native types fail | Educational examples explicitly aren't production-ready; installing or copying entire modules adds unnecessary surface; stale (last push 2024-06) | **VERIFIED PROPRIETARY:** `LICENSE.txt` = Magento Customer Agreement (© 2021 Adobe) — read-only structural catalogue; **code copying is NOT permitted** (ADR-005-014). Registry evidence comes from official Adobe docs + the caller-supplied checkout |
| [mage-os/module-pagebuilder-template-import-export](https://github.com/mage-os/module-pagebuilder-template-import-export) (canonical; the `mage-os-lab` URL redirects) | **SPIKE_LATER (not default dependency)** | Study template packaging/export/import and media portability **if** later stage needs it | Import/export of **PB templates between Magento instances** is not Figma JSON → CMS Page import, nor proof of Admin Save/Reload | README states MIT; keep Magento adapter dependency-free initially; test on isolated local instance only |
| [awdr74100/figwright](https://github.com/awdr74100/figwright) | **OPTIONAL_READ_ADAPTER** | Optional richer design context via its Grounding tool group (`component_map`, `token_map`, `icon_map`, `design_diff`) plus Read tools — never the Write tools (135 tools across Read/Write/Grounding per README); pin by commit (young project, single maintainer) | Requires local Figma plugin, server/WebSocket, exposes write tools; project design is **frozen** and must not receive writes; no reason to make it mandatory | MIT; use pinned versions and *read-only allowlist*, never auto-enable write tools |
| [BuilderIO/mitosis](https://github.com/BuilderIO/mitosis) | **ARCHITECTURE_REFERENCE / DEFER** | Neutral intermediate representation, pluggable output adapters, fixtures and snapshot tests | Multi-framework compiler is unnecessary for Page Builder master-format persistence and adds significant complexity | MIT; no dependency in V2 structural POC |

**Fact checks (verified live, [5] W-A 2026-11-03):** FigmaToCode `LICENSE` is GPL-3.0 (confirmed; no tags/releases — pin commit SHAs). Code Connect CHANGELOG v1.5.0 (2026-07-29) fixes the date exactly: framework parsers unsupported **from August 17, 2026**; "Template files are now the only actively maintained way"; availability gated to paid plans. Figwright README lists Read/Write/Grounding MCP tools (135 total per README), so source-only discipline must be enforced outside the plugin. Mage-OS module moves Page Builder *templates* between Magento instances (README never mentions Figma). Adobe `/architecture/` confirms XHTML-with-data-attributes master storage. All upstream versions/commits used in implementation must be pinned at integration time; this table alone does not approve dependencies.

## Target architecture: selective adoption, not a Frankenstein tool

```text
Figma read-only node scopes: 245:2 (+ mobile 245:16)
  → FigmaProvider port (existing official MCP; optional Figwright read adapter)
  → normalized semantic NodeIR (inspired by FigmaToCode architecture, independently implemented)
  → component binding map (Code Connect-style, our own neutral manifest)
  → capability registry (native PB / Secomm_UiWidget / theme chrome)
  → structural resolver + diagnostics (SUPPORTED / CUSTOM_APPEARANCE_REQUIRED / UNSUPPORTED)
  → deterministic PageStructure JSON + coverage report + dry-run plan
  → [separate Slaunchpad adapter, AFTER local GO] PB master format/preview + Admin round-trip
```

- Core module must not import Magento, Hyvä, Code Connect, Mitosis or Figwright as a required runtime package.
- Source nodes carry immutable `{fileKey,nodeId}`; layout data is kept distinct from style fidelity and runtime business data.
- Native Page Builder or registered `Secomm_UiWidget` first; custom appearance only on verified unsupported compositions. Don't create a `content_type.xml` per page.
- Do not use arbitrary HTML Code content type to claim editable output.
- Data-backed items (prices, inventory, product links) must resolve from Magento, not Figma fixtures.
- Page Builder storage is XHTML/master format, **not** raw canonical JSON in `cms_page.content`. An Admin round-trip proof is mandatory for any importer success claim.
- `UNKNOWN` and `UNSUPPORTED` must appear in machine-readable diagnostics; never silently flatten or pretend a 40/60 layout is 50/50.

## Implement in Issue #5 (in this order)

1. **OSS source spike, bounded:** inspect only code paths needed for normalized geometry and stable component binding; record upstream commit SHA, direct source link, license and expected tests. Output `REUSE / ADAPT / REFERENCE_ONLY / DEFER / REJECT` per candidate. Do not repeat broad research.
2. **Own contracts:** `NodeIR`, `ComponentBindingMap` (materialized: [`resources/schemas/converter/`](../../resources/schemas/converter)), `CapabilityRegistry`, `ResolutionReport` and `PageStructure` (field drafts: [CONTRACTS.md](../converter/CONTRACTS.md)); keep project-specific mappings in a profile, never toolkit core.
3. **Structural extractor:** start with `245:2`, use `245:16` only for responsive correspondence, deterministic output, nested/flex/columns/full-bleed/absolute placement preserved. Proof via fixtures and tests; no CSS polish.
4. **Resolver:** bind into **verified local** Page Builder content types + appearances and `Secomm_UiWidget` *enabled registry*, marking `REGISTERED` separately from `ADMIN_ROUNDTRIP_VERIFIED`.
5. **Coverage report:** for every section show Figma node ID, target capability, variant, data/media/interaction requirements, evidence, reasons and exact unsupported features.
6. **Separated Magento gate:** after separate approval, pilot on disposable local CMS page, run Edit → Save → Reload → Storefront and visual *structural* QA at 1440/768/390; no production writes.

### Acceptance gates

- 0 Figma writes and 0 silent approximation.
- 100% of audited Page sections classified, unsupported explicitly visible.
- Same input + pinned source manifests ⇒ identical JSON hash.
- No third-party code copied and no unpinned package added in this PR.
- Every adopted feature demonstrates at least one focused test; no automatic adoption based on GitHub stars.
- No `ADMIN_ROUNDTRIP_PASS` without evidence of real Magento Admin interaction.

## Relevant project source of truth

- Toolkit [architecture](../ARCHITECTURE.md), [safety](../safety-and-scope.md), existing `resources/schemas/*`.
- SLAUNCH [Issue #42](https://github.com/thanhle74/slaunchpad/issues/42), [#32](https://github.com/thanhle74/slaunchpad/issues/32), approved `.ai/docs/specs/SPEC-FEAT-J06WXZ-secomm-ui-widgets.md`, `FEAT-J06WXZ-component-eligibility-matrix.md`, `FEAT-J06WXZ-solution-design.md`.
- Local source path belongs **only** in project profile: `/home/thanhle/Sites/Magento/slaunchpad`.
- **Design Freeze:** never edit `245:2` or other approved Figma frames.

## Decision

**GO selective OSS learning; NO_GO installing all six repos.** Integrate a small, independently owned structural IR and binding map into the toolkit, backed by tests. Keep Page Builder master-format/import work in the Magento adapter and behind the isolated local execution gate. This document is a research decision / implementation input, **not proof that a working converter exists**.
