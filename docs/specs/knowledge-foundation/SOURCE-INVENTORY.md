# SOURCE-INVENTORY — evidence-based sources & reuse matrix

> **Status:** DRAFT for review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)). Inventory of every source this knowledge foundation builds on, with proof levels, classifications, and the reuse matrix (which source feeds which deliverable). **No proprietary code, templates, assets, or secrets appear anywhere in this document** — licensed material is recorded as metadata + path pointers only.
>
> **Path policy:** the local checkout path below is the **current owner's local development/audit path only** — never a toolkit default, never required by other users. In the future store it appears as a `rootAlias` resolved from local ignored config ([CONTRACTS.md §9](CONTRACTS.md)).

Audit basis: four parallel read-only worker audits executed 2026-11-03 (W-A platform, W-B UI, W-C project materials, W-D technology), scopes detailed in [INTEGRATION-RECEIPT.md](INTEGRATION-RECEIPT.md).

## 1. Toolkit-internal sources (public repo)

| Source | Location | Facts it supplies | Proof | Reused by |
|---|---|---|---|---|
| V1 architecture SSOT | `docs/ARCHITECTURE.md` | Pipeline, layers, gates G1–G5, decision log, ajv precedent | VERIFIED (read) | KNOWLEDGE-ARCHITECTURE, TECH-ADR |
| V1 schema family | `schemas/*.schema.json`, `schemas/README.md` | Draft 2020-12 conventions, provenance/diagnostic shapes, versioning rule | VERIFIED (read) | CONTRACTS §0, all kb schemas |
| Safety invariants | `docs/safety-and-scope.md` | 8 invariants incl. fail-closed, deletes-unrepresentable | VERIFIED (read) | CONTRACTS §3/§4/§8 |
| Quality gates | `docs/quality-gates.md` | Gate measurement patterns (provenance as gate) | VERIFIED (read) | IMPLEMENTATION-PLAN §2 |
| Pilot materials | `projects/slaunchpad-fashion/**` | KB-3 seed: profile, audit, pilot plan, state JSON (evidence ledger), approvals (2 attested-only), risks, deviations | VERIFIED (read) | SOURCE-INVENTORY §5, CONTRACTS §4.5, KB-3 schema enums |
| Example profiles & payloads | `profiles/*.json`, `examples/*.json` | Synthetic fixture precedents; approval-slot design; `PATTERN_NOT_COMPONENT_IN_SOURCE` precedent | VERIFIED (read) | kb-project-record schema, UX-CAPABILITY-PLANNING |
| Sibling research (open) | PR [#6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) (`research/5-oss-selective-adoption`) | Determinism gate, diagnostics vocabulary, portability checklist, proof-stage ladder | VERIFIED (read via `gh pr view/diff`) | TECH-ADR alignment, CONTRACTS §2.2.1 |
| Governing issue | [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) | Normative scope, deliverables, KB definitions | VERIFIED | everything |
| Sibling issue (untouched) | [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) (OPEN) | Converter pipeline, stage ladder, worker model | VERIFIED (read-only) | CONTRACTS §2.2.1, README roadmap mapping |

## 2. External receipts (GitHub, other repos)

| Source | State | Facts supplied | Proof | Handling |
|---|---|---|---|---|
| slaunchpad [#42](https://github.com/thanhle74/slaunchpad/issues/42) (Figma→PageBuilder idea) | OPEN | Canonical-JSON intent, architectural clarifications (master-format HTML persistence, LL-0039 widget-payload trap, `<style>` crash), persistence/rollback requirements | VERIFIED (issue body) | Read-only receipt; feeds KB-1 restrictions vocabulary and future converter gates |
| slaunchpad [#32](https://github.com/thanhle74/slaunchpad/issues/32) (closed Phase-A audit) | CLOSED (superseded by #40 direction) | LC/FC coverage status (5 traced, 5 UNKNOWN), section-mapping table (richest existing uxi→capability example), gaps list, "Phase B not accepted as done" | VERIFIED (issue body + receipt comments) | KB-3 seed material (private tenant); Phase B claims excluded from evidence |
| slaunchpad #40 (referenced by #32/#42) | OPEN | Design Feature Matrix gate spec (runtime-maturity enum, decision enum), LC/FC/LA taxonomy correction, owner principles | VERIFIED (via W-C read) | kb-project-record enums; KB-3 chain precedent |

## 3. Platform sources — local checkout (owner-authorized, read-only)

Classification: all facts `DETECTED` by file inspection on 2026-11-03; **runtime/DB facts remain `UNKNOWN`** (not queried, by rule). Owner path (source pointer, never a default): `/home/thanhle/Sites/Magento/slaunchpad`.

### 3.1 Platform & stack facts

| Artifact | Path (relative to checkout root) | Fact | Proof |
|---|---|---|---|
| Platform version | `composer.json`, `composer.lock` | Magento CE **2.4.8-p5** (+ security patches APSB26-73/92, VULN-39341, AC-15223, MAGENTO-40225); PHP constraint `~8.2\|\|~8.3\|\|~8.4`; plugin-api 2.3.0; lock content-hash `a36b1cc7…` | VERIFIED |
| Hyvä stack | `composer.lock` | default-theme **1.5.2**, theme-module 1.5.2, cms-tailwind-jit **2.0.3**, compat-fallback 1.1.4, luma-checkout 1.1.7, smile-elasticsuite bridge 1.2.8; ElasticSuite 2.12.0 | VERIFIED |
| Page Builder | `vendor/magento/module-page-builder` (2.2.6-p5) | **20 content types / 33 appearances**, declared per-file under `view/adminhtml/pagebuilder/content_type/*.xml` (**no** single `etc/content_type.xml` in this version — version-aware discovery required); grid 12/16; converters, master-format renderer paths recorded | VERIFIED |
| Third-party PB modifications | `vendor/hyva-themes/magento2-theme-module`, `magento2-cms-tailwind-jit` | theme-module modifies 7 content types (banner, column, column-group, image, row, slide, tab-item); tailwind-jit modifies block + html | VERIFIED |
| Enablement map | `app/etc/config.php` | **528 entries: 524 enabled / 4 disabled** (`Magento_TwoFactorAuth`, `Secomm_Ahamove`, `Secomm_GhnAddressMapper`, `Secomm_GiaoHangNhanh`); file-level only — runtime DB state UNKNOWN | VERIFIED (file) |
| Custom modules | `app/code/*` (119 modules; **41 under `Secomm/`**) | 38/41 Secomm enabled; classification: 4 glue (Base, ThemeHelper, UiWidget, CurrencyPrecision), 33 commerce-domain (payments VNPAY/MoMo/ZaloPay/VietQr/Cod, carriers Ghn/Ghtk/Ahamove*, fulfillment, e-invoice, promo, comms), remainder other; `Launchpad_Osc` installed-but-absent-from-config (semantics UNKNOWN) | VERIFIED (declarations) |
| Tailwind / Alpine | theme `web/tailwind/*`, `vendor/hyva-themes/magento2-theme-module` | Tailwind **v4.3.2** CSS-first (built-output banner + `@theme` blocks); scaffold 1:1 with hyva-ui `tailwind-v4` plugin; Alpine 3 regular + **CSP builds shipped** (active variant config-driven — UNKNOWN from files); Magewire 1.13 | VERIFIED |
| Figma↔Tailwind bridge | theme `web/tailwind/tokens/contract.yaml` | Existing token pipeline mapping 15 token files → Figma collections → `generated/figma-design-tokens.css` | VERIFIED |

### 3.2 `Secomm_UiWidget` — live registry (the issue's "verify live registry" item)

| Fact | Value | Proof |
|---|---|---|
| Widget declaration | `app/code/Secomm/UiWidget/etc/widget.xml` declares **one** widget `secomm_ui` (5 params incl. required `component` select) | VERIFIED |
| Component registry | **21 component definitions** injected via `etc/di.xml` → `Model/Component/Registry`; all `schemaVersion=1`, `group=content`, `enabled=true`, `sourceVersion='2.8.0'` | VERIFIED |
| Live vs documented | B1 matrix (`.ai/specs/FEAT-J06WXZ-component-eligibility-matrix.md`, approved 2026-08-24) documents 21 B1 IDs — **exact match, zero discrepancy**; B2 (11) and DEFER/EXCLUDE (~38 rows) not implemented, consistent | VERIFIED |
| Structural lesson | A KB parsing only `widget.xml` would undercount 21→1 — adapters must parse **both** declaration and registry layers | VERIFIED (finding) |
| Templates | 21 module templates (1:1 with definitions) + 2 theme overrides (`launchpad` theme: `accordion/a`, `categories/a`) | VERIFIED (names) |
| Guards | CSP whitelist (YouTube/Vimeo frames); widget-parameter validation plugins; per-definition fail-closed enablement | VERIFIED |

### 3.3 Hyvä UI upstream package — **commercially licensed, metadata-only**

License fact: "HYVÄ SOFTWARE USER LICENSE" (commercial; license file + hyva.io URL are pointers — text not reproduced). Package: `hyva-themes/hyva-ui` **2.8.0** (require-dev; upstream `gitlab.hyva.io/hyva-themes/ui/hyva-ui`).

| Fact | Value | Proof |
|---|---|---|
| Size | **36 components / 70 variants** (A/B/C/D = Basic/Enhanced/Advanced/Specialized) | VERIFIED (directory census — names only) |
| Consumption model | **Copy-in source library** (not a Magento module: no `registration.php`/`theme.xml`/`package.json` at root); components copied into child themes; CMS-targeted components paste into admin via Tailwind JIT | VERIFIED (structure + README sections) |
| Plugins | 5 (`alpine-collapse`, `splidejs`, `sticky-header`, `tailwind-v3-design-tokens`, `tailwind-v4`); `tailwind-v4` plugin scaffold = the launchpad theme's directory shape | VERIFIED (names/structure) |
| Theme consumption | Theme implements structural components (header/footer/menu/minicart/breadcrumbs/sticky-atc/…) as **theme-native code**, not package copies; splidejs not consumed | VERIFIED (template inventory) |
| Upstream↔widget mapping | **21 CONFIRMED `adaptedFrom` pairs** — registry `source_component`/`source_version` + module README provenance + eligibility matrix; 25 components/38 variants have **no** widget counterpart (EXCLUDE/DEFER with reasons) | VERIFIED (documented in-repo) |
| Safe-to-store rule | identifiers, variants, counts, versions, path pointers, neutral capability semantics, license facts — **never** source/templates/CSS/JS/assets/i18n/keys (deny-list in [CONTRACTS.md §8.3](CONTRACTS.md), schema-bounded in `kb-ui-component.schema.json`) | policy (this package) |

## 4. Project material sources — slaunchpad `.ai/specs` (client-proprietary, private tenant)

| Document | Supplies | Classification |
|---|---|---|
| `SPEC-FEAT-J06WXZ-secomm-ui-widgets.md` | Requirement set (US-001..005 + ACs), business rules UIW-BR-001..010, phase-boundary decision (2026-08-28), CSS-exception decision (2026-10-22), risk table ×10, approvals (DEV, 2026-08-24), OQ-001..006 | client-proprietary → KB-3 private records; structure promotable after sanitization |
| `FEAT-J06WXZ-component-eligibility-matrix.md` | B1/B2/DEFER/EXCLUDE disposition taxonomy; import-fidelity contract; per-row provenance (the KB-2 eligibility vocabulary) | client-proprietary; structure reusable |
| `FEAT-J06WXZ-solution-design.md` | Component definition contract (id/label/fields/status…), persistence constraints (16 KiB / depth 6 / 50 rows), remaining decisions | client-proprietary |
| LC/FC registry hunt | **No authoritative BA registry exists**; LC/FC appear as `legacy_ids`/external refs; LC-01 collision (security patches vs Figma footer tag) — external IDs must stay non-canonical ([CONTRACTS.md §1.2](CONTRACTS.md)) | finding |

## 5. Reuse matrix — what feeds what

| Deliverable | Fed by (this inventory §) | Verdict |
|---|---|---|
| CONTRACTS.md | §1 (conventions), §3/§4 (invariants), §4 (registry lesson), #7 text | REUSE — conventions and safety model carried forward unchanged |
| kb-capability schema | §3.1/§3.2 field evidence | NEW (draft) — grounded in measured artifacts |
| kb-ui-component schema | §3.3 + §4 eligibility vocabulary | NEW (draft) — availability states formalized from evidence |
| kb-project-record schema | §1 pilot materials + §4 spec structures + #40 matrix enums | REUSE + NEW — "make the #40 matrix a schema" |
| kb-relations schema | §3.3 provenance pairs (already in-repo as prose) | REUSE — formalize existing `source_component` provenance as edges |
| KNOWLEDGE-ARCHITECTURE.md | all | NEW — synthesis |
| TECH-ADR.md | §1 (repo state), §3 (stack facts), PR #6 | NEW — decision record |
| UX-CAPABILITY-PLANNING.md | §1 method precedents | NEW — synthetic walkthrough (no real data) |
| IMPLEMENTATION-PLAN.md | §5 sufficiency (below) | NEW — milestones sized from measured inventory |

## 6. Re-audit triggers (digest-pinned, measured 2026-11-03)

| Trigger | Feeds | Effect when changed |
|---|---|---|
| `composer.lock` (hash `4e2c4709…`) | platform/version facts | platform KB records STALE |
| `app/etc/config.php` (hash `0686b069…`) | enablement facts | enablement fields STALE |
| `app/code/Secomm/UiWidget/etc/{widget.xml,di.xml}` | component registry | KB-2 widget records + `adaptedFrom` edges STALE |
| `vendor/magento/module-page-builder/view/adminhtml/pagebuilder/content_type/` (directory digest) | PB capabilities | KB-1/KB-2 native records STALE |
| `app/code/*/**/etc/module.xml` | dependency topology | `requires`/`providedBy` edges STALE |
| theme `web/tailwind/**` + `tokens/contract.yaml` | Tailwind/Alpine/token-bridge facts | KB-2 behavior fields STALE |

(Full sha256 values recorded in the integration session; digests are per-record fields once the store exists — M2.)

## 7. Sufficiency assessment (KB-3 seed for the pilot project)

From existing documents **only, zero new Figma reads**: ~55 evidence-backed records are creatable today (≈12 source documents, ≈20 requirements, ≈12 UX intents, ≈15 decisions, 4 approvals — 2 of them `attested`-only, ≈18 risks, ≈14 open questions, ≈20 constraints) plus a rich evidence ledger (pilot state JSON). Creatable-as-inferred (must be marked): 5 UNKNOWN LC/FC mappings, candidate render-owner intents. **Not honestly creatable**: authoritative BA definitions for LC-03/04/16, FC-04/07, LA coverage; measured gate values; real offer data policy. Conclusion: the "project info from existing specs/tickets/approved notes" requirement passes.

## 8. Gaps & unknowns carried forward

Runtime PHP version; runtime DB enablement state; active Alpine build variant (config-driven); `Launchpad_Osc` absence semantics; exhaustive non-widget package usage in theme; PB edition scope (CE: no dynamic blocks); BA registry location (owner-supplied checklist needed); first-party fileKey publication policy; KB-3 private-material storage venue. Owned as `OPEN_DECISION`s / open questions in [TECH-ADR.md](TECH-ADR.md) and [INTEGRATION-RECEIPT.md](INTEGRATION-RECEIPT.md).

## 9. Hygiene note (out of scope, flagged)

The local checkout root contains `slaunchpad-magento.sql.gz` (~3.9 MB DB dump in VCS) and `auth.json` — both were never read or opened by this audit. Flagged to the owner as repo-hygiene items in *their* repository; irrelevant to this package beyond reinforcing the deny-list.
