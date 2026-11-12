# [5] Converter architecture & contract specification

**Status:** INTEGRATED_FOR_G1_REVIEW — architecture pass executed 2026-11-03 (workers W-A..W-D receipts + one integrator; see [docs/converter/RECEIPT-ISSUE5-G1.md](../docs/converter/RECEIPT-ISSUE5-G1.md)). **Target:** [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5). **No Figma access authorized in this stage.** Approved designs remain frozen.

## 1. Outcomes

Build a multi-project design-engineering framework that can later map **approved structured design source** into a **Page Builder-editable page**, without building one codegen script per project. First adapter is Magento Page Builder + `Secomm_UiWidget` + Hyvä. Keep all other platforms possible without changing core data model.

**One authoritative roadmap:**  
`Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity`

| Gate | Scope | Outputs | Entry condition |
|---|---|---|---|
| **G1 / NOW: Capability Registry** | Installed native PB content types, appearances, nesting/props; enabled widget registry; core architecture/contracts, tests + skills | Source-backed machine-readable capability inventory, decisions, schema proposal, proof-level status | Current Owner GO |
| **G2 / HOLD: Structural Mapping** | Source-node extraction and semantic sections; exact layout hierarchy, ratios, order; mobile correspondence | Versioned `NodeIR`, `PageStructure`, diagnostic/coverage report | Separate GO; read-only design node `245:2`, mobile `245:16` |
| **G3 / HOLD: Functional Round-trip** | Magento structural adapter; isolated import into disposable CMS page, editor persistence and regeneration | Admin Edit → Save → Reload → Storefront receipts; no lost data, idempotent diff, rollback | Separate scoped LOCAL write GO and approved test site |
| **G4 / HOLD: Visual Fidelity** | Tailwind v4 CSS-first styling, images/crop, typography, Hyvä UI variants, Alpine CSP, responsive QA | Screenshots & parity at 1440/768/390; a11y, performance, interaction evidence | G2+G3 proven and separate GO |

**G1 is not proof of G2–G4.** Do not mark a capability `ADMIN_ROUNDTRIP_VERIFIED` when only XML/registry code exists.

## 2. Architecture boundaries

```text
core/
  contracts/           platform-neutral versioned models, validators
  sources/             DesignSourcePort (future implementation; current G1 no source calls)
  normalize/           semantic NodeIR normalization (future)
  resolve/             CapabilityRegistry, ComponentBindingMap, structural solver
  reports/             ResolutionReport, evidence/diagnostics, deterministic serialization
adapters/
  magento-pagebuilder/ Page Builder capability probe, appearances/master format/importer (G1 read-only probe)
profiles/
  project-profile.*    project-specific source refs, local checkout location, mapping overlays
```

These are **conceptual boundaries**, not an instruction to create empty folders. Do not add implementation code until tests and required APIs are specified.

**No platform contamination:** Core must not import Magento, PHP, Hyvä, Page Builder, Adobe, Magento-only taxonomy or fixed Figma IDs; put bindings and platform-specific mapping in adapters/profile. Local source path `/home/thanhle/Sites/Magento/slaunchpad` may be supplied by a profile/env, not embedded in reusable code.

**Tool is a consumer of installed capabilities:** inventory actual Magento source/config first. Use native PB and `Secomm_UiWidget` before authoring custom appearances. Never create one `content_type.xml` per Figma page, and never silently fall back to HTML Code.

## 3. Proposed contracts (schema drafts, to be validated in G1)

- `CapabilityRegistry`: `schemaVersion`, `platformId`, `sourceRevision`, capabilities `{id, provider, appearanceId, acceptedProps, allowedChildren, responsiveRules, dataContext, editorEditingMode, dependencies, evidence, proofLevel}`. Support `native`, `widget`, `chrome`, `custom-required`, `unsupported`.
- `DesignSourcePort` (future): read-only, scoped accessor with version and provenance; never requires mutating the approved source.
- `NodeIR` (future): stable semantic `nodeId`, `kind`, `children`, `layout{direction, positioning, constraints, relativeSizes, overflow}`, `contentSlots`, `sourceRef`. Do not confuse visual pixels with component semantics.
- `ComponentBindingMap`: versioned mapping `{sourceComponentId, variantConditions, targetCapabilityId, propsTransform, fallbackPolicy}`. Unmatched variants produce `UNSUPPORTED`, not guessed CSS.
- `PageStructure` (future): `sections[]` with stable IDs, content and media references, responsive composition, capability resolution, source refs. **PageStructure is an intermediate artifact, not raw `cms_page.content`**.
- `ResolutionReport`: per-section status, candidate/selected capabilities, unsupported reasons, mapping confidence, evidence/pin, missing contracts; summary coverage `native/widget/custom-required/unsupported/chrome` (one vocabulary with the registry `category` enum).

**Proof-level ladder:** `DISCOVERED` → `REGISTERED` → `STRUCTURALLY_MAPPED` → `ADMIN_ROUNDTRIP_VERIFIED` → `VISUALLY_VERIFIED`. Promotion needs evidence for that specific step.

All output types must have explicit schema major/version, stable identifiers, deterministic ordering and provenance. G1 materialized these as a **separate family `schemas/converter/`** (own integer major; V1 `schemas/*` stays frozen at major 1 — see [schemas/converter/README.md](../schemas/converter/README.md) and ADR-005-011): `capability-registry`, `component-binding-map`, `resolution-report`, `converter-profile` (+ shared `common.defs.json`), validated against real and synthetic payloads by the repo test gate (`npm test`, 30 checks incl. the T-01..T-14 negative plan). `NodeIR`/`PageStructure` field drafts and the `DesignSourcePort` interface are documented in [docs/converter/CONTRACTS.md](../docs/converter/CONTRACTS.md) and materialize at their gates (ADR-005-013). Breaking changes need a new major + migration ADR ([docs/converter/DECISIONS.md](../docs/converter/DECISIONS.md)).

## 4. Magento/Hyvä adapter contract

Check source at local path supplied by project profile and **read-only** during G1:
- Native Page Builder registered content types: start with `Row, Columns, Tabs, Text, Heading, Buttons, Divider, HTML Code, Image, Video, Banner, Slider, Map, Block, Products` but validate the installed version/enablement.
- Enumerate appearances, master/preview templates, form fields, allowed parents/children, nested structures, responsive properties, data bindings and editor persistence. **A palette screenshot is not source evidence**.
- `Secomm_UiWidget`: read `.ai/specs/SPEC-FEAT-J06WXZ-secomm-ui-widgets.md`, eligibility matrix, solution design, and live `app/code/Secomm/UiWidget` registry. Approved B1 matrix lists 21 IDs; verify actual enablement rather than assuming all work.
- Page Builder master content is HTML and uses content-type definitions; don't persist the converter JSON directly into `cms_page.content`.
- Dynamic product/category data, pricing, inventory and wishlist must resolve against Magento context. Neither Figma demo data nor mock prices is a production source.
- Magento/Hyvä presentation skill references in the local project: `hyva-ui-component`, `hyva-alpine-component`, `hyva-compile-tailwind-css`, `hyva-global-style-foundation`, `magento-module-analysis`.
- Tailwind v4 source discovery/build and theme ownership must be checked; Alpine interactions must be instance-safe and CSP-compatible. These are **later G3/G4 constraints**, not a reason to style before structural mapping.

## 5. Architecture QA, risks & deliberate exclusions

| Risk | Architecture decision | Proof |
|---|---|---|
| Source auto-layout misunderstood | Preserve layout primitives in IR; report unknown/absolute groups separately | Negative-case fixture tests at G2 |
| Unsupported PB appearance silently approximated | Fail closed `UNSUPPORTED` with location/reason and candidate mapping | Validator unit tests G1 |
| Widget parameters lost after Admin save | Do not claim `REGISTERED` equals `ROUNDTRIP`; reject naive directive/string hack | Actual G3 UI receipt required |
| Core couples to Magento or local path | ports + adapters + profiles, second non-Magento synthetic profile | Architecture test G1 |
| Pixel-perfect CSS hides structural errors | exact nested layout/relative ratio acceptance before styling | Stage G2 exit |
| OSS incompatibility / license | source references + licenses; no vendored code without review | W-A receipt |
| Uncontrolled cleanup destroys pilot evidence | delete only after usage reference and test proof | W-D receipt |
| Multiworker write conflict | read-only W-A..D; single integrator + bounded branch | issue receipt |

**Explicit non-goals for G1:** access/modify any Figma file, screenshot-to-code, direct CMS importer, PHP Magento runtime changes, active page overwrite, CSS polish, many-framework transpilation, arbitrary HTML import, auto-merge.

## 6. Parallel worker and evidence contract

**[5] W-A:** OSS skills/reuse/license shortlist.  
**[5] W-B:** Magento/Hyvä native PB + UiWidget source inventory.  
**[5] W-C:** IR + registry/binding/diagnostics schemas and ADR.  
**[5] W-D:** Repo inventory, dead/duplicate artifacts and validation gaps.

All four start concurrently, read-only. Exactly one **[5] Integrator** merges findings, edits SSOT once, validates changes and posts `BASE→TIP` receipt. No invented PASS. Work not verifiable from connector/local current state stays `NOT_VERIFIED`.

## 7. G1 acceptance criteria

- Every native PB and enabled UiWidget capability has sourceRef/path and exact proof level.
- One validated capability schema proposal and mapping/diagnostic semantics; no implicit appearance guessing.
- Traceable architecture and independent platform-neutral core, including a second synthetic project/platform example.
- One OSS/agent skill selection matrix and exactly the minimal set of reusable skills/agents.
- Repo hygiene report `KEEP / UPDATE / REMOVE_CANDIDATE`, no unproven deletions.
- Focused tests (schema, unknown capability, missing variant, wrong nesting, deterministic results); report what actually ran.
- Figma untouched, no Magento runtime writes, no unsanctioned CMS/import.
- One integrator receipt, PR remains draft until Owner review.

**Exit:** `READY_FOR_COORDINATOR_ARCHITECTURE_REVIEW`. **Do not start G2–G4 without GO.**

## 8. Task naming / Orca traceability (normative)

**Task label format:** `[<GitHub issue number>] <clear task title>`; apply to Orca tasks, worker names, worktrees/branches if useful, receipts, and reports. **For THIS issue** the prefix is `[5]` because its GitHub Issue number is 5; **it is not a phase, release or version**.

Examples: `[5] W-A — OSS research`, `[5] W-B — Page Builder capability audit`, `[5] W-C — Core contracts`, `[5] W-D — Repository hygiene`, `[5] Integrator — Architecture SSOT`.

For future work, resolve the issue ID from the selected work item (e.g., issue #17 → `[17]`) rather than leaving `[5]` hardcoded in reusable scripts, generators, skill templates or CI.

## 9. Local development checkout vs portable shared toolkit (normative)

`/home/thanhle/Sites/Magento/slaunchpad` is **ONLY the current owner's machine-local checkout to inspect/build/test the first Magento adapter**. It is **not** the toolkit install path, default source path, generated artifact path, or a requirement for any other user. Do not assume other users own `/home/thanhle`, the SLAUNCH repository, or Magento at all.

- Core runtime must work without any local Magento checkout, without any Figma credentials during G1, and without the SLAUNCH project profile.
- Accept optional adapter paths via **per-run CLI flag, environment variable, or local project profile**, with a documented precedence; validate existence/access/required files and show an actionable diagnostic when absent. Never silently fall back to this owner's path.
- The Magento adapter may discover **a caller-provided path or conventional working directory**, but may not scan arbitrary home directories, create a project, install dependencies, or mutate the checkout during detection.
- Local profile examples may show the owner's path as an **illustrative value only**, never as a portable default. Committed examples use placeholders such as `/path/to/magento-project`; **ignore local profile overrides in VCS**.
- Use a second synthetic non-Magento project/profile in tests to prove there is no Magento/Figma/Secomm source path coupling.
- Path-related error states: `PROJECT_SOURCE_NOT_CONFIGURED`, `PROJECT_SOURCE_NOT_FOUND`, `ADAPTER_NOT_APPLICABLE`, `PROJECT_SOURCE_NOT_READABLE` — no fabricated successful audit.
- Record the path actually used in local receipts **without recording secrets, user files or sensitive configuration contents**. Never commit `app/etc/env.php`, `auth.json`, local DB credentials or personal home-directory data.

**Multi-project portability gate:** a clean clone on a different machine with no `/home/thanhle` path must load the toolkit's generic contracts/tests; platform-specific audits run only when an appropriate project source is explicitly supplied. This is a prerequisite for G1 acceptance.
