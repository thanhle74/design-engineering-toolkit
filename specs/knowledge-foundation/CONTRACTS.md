# Knowledge Foundation — Contracts

> **Status:** DRAFT for review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)). Normative for the three knowledge bases and their boundaries. Companion documents: [KNOWLEDGE-ARCHITECTURE.md](KNOWLEDGE-ARCHITECTURE.md) (how these contracts are inhabited), [schemas/](schemas/README.md) (example schema drafts), [TECH-ADR.md](TECH-ADR.md) (technology that will enforce them).
>
> **These are contracts, not implementations.** Nothing here implies a running engine. The V1 contract family in [`schemas/`](../../schemas/) (issue #1) stays valid; this document **generalizes** its conventions and adds the knowledge layer on top.

## 0. Conventions inherited from V1 (normative)

- JSON Schema **Draft 2020-12**; payloads carry `schemaVersion` (integer **major**; additive-only within a major; breaking change = new major + migration note in the schema README).
- `additionalProperties: false` everywhere; extensions are schema changes, never smuggled fields.
- Diagnostics are structured `{code, severity, message, sourceRef?}` with `code` ∈ `^[A-Z][A-Z0-9_]*$` — never prose-only.
- Toolkit-normalized IDs are stable across runs and **never** the raw upstream name; the upstream identifier is preserved in a separate `nativeId` field.
- Every extractable entity carries provenance. Unverifiable facts are marked, not silently asserted.

---

## 1. Identity & taxonomy

### 1.1 Entity vocabulary

| Entity | KB | ID prefix | Meaning |
|---|---|---|---|
| `Requirement` | KB-3 | `req:` | A client need, goal, constraint, or acceptance criterion |
| `UXIntent` (Section) | KB-3 | `sec:` | A UX section/area a requirement implies (hero, category collection, lookbook, product grid, KOL/editorial, slider, tabs, …) |
| `Feature`/`Capability` | KB-1 | `cap:` | What the platform can do (render, compute, integrate), independent of any UI source |
| `UIComponent` | KB-2 | `uic:` | A composable UI unit from any of the three UI sources |
| `Variant` | KB-2 | (child of `uic:`) | A variant/appearance of a UI component (modeled as a field, not a top-level ID) |
| `Composition` | KB-3 | `cmp:` | A candidate assembly of UI components fulfilling one or more UXIntents |
| `DataProvider` | KB-1 | `dat:` | A data source/API/context a capability consumes or produces |
| `Decision` | KB-3 | `dec:` | A recorded human decision (approval, exclusion, direction) |
| `SourceReference` | shared | `src:` | A pointer to authoritative evidence (see §2) |
| `Evidence` | shared | (embedded) | The proof block attaching source references + proof level to a claim |

### 1.2 ID grammar

```
<prefix>:<scope>:<slug>          scope and slug are kebab-case: ^[a-z0-9][a-z0-9-]*$
```

- `<scope>` is the **project** for KB-3 entities (`req:slaunchpad-fashion:homepage-hero`) and the **source/platform namespace** for KB-1/KB-2 entities (`cap:magento-pagebuilder:banner`, `uic:secomm-uiwidget:banner-a`, `uic:hyva-ui:banner`).
- IDs are **version-free**: versions live in record fields (`version`, `sourceVersion`, `schemaVersion`), so a platform upgrade never rewrites the ID graph.
- **Versions are not IDs**: a record whose platform version changed gets a new `observed` snapshot with the same ID (see §4.4) — consumers matching on `id` + version filters, never on version-embedded IDs.
- **Stable across runs**: re-scans must not renumber, re-slug, or reassign IDs. A source-side rename produces `supersedes` (§3), not ID mutation.
- **Schema-version discipline**: every payload declares its `schemaVersion`; consumers reject payloads for majors they do not implement (never best-effort parse).

### 1.3 Taxonomy rule (no duplicate capability definitions)

The same real-world capability may appear in multiple KBs. Exactly **one** record owns the canonical definition; every other appearance is a **linked reference**, not a re-declaration:

- KB-1 owns *capabilities* (what the system can do, including rendering a widget/content type).
- KB-2 owns *UI composition units* (what a builder composes with) across three distinct sources.
- A `Secomm_UiWidget` component is **both**: its rendering capability is a KB-1 record; its composition surface (variants/slots/semantics) is a KB-2 record; the two link via `providedBy`/`implements` (§3), and equivalent composition units across the three UI sources link via `mapsTo` — they are **never** counted three times as three capabilities.

---

## 2. Evidence & proof

**Rule: no "supported" claim exists without evidence attached to it.** An unsupported claim is a schema-valid record with an empty evidence block — and is treated as an error by query and planning consumers.

### 2.1 SourceReference (generalizes V1 `sourceRef`)

V1's `sourceRef {fileKey, nodeId}` is Figma-bound. The knowledge layer generalizes it while keeping that shape for Figma evidence:

| `kind` | Locator fields | Notes |
|---|---|---|
| `figma-node` | `fileKey`, `nodeId`, `page?`, `name?` | Identical to V1 `sourceRef` — backward compatible |
| `repo-file` | `rootAlias`, `path`, `lineRange?`, `sha256?` | `rootAlias` resolves via the project's **local ignored config** (§9) — never an absolute owner path in any shared artifact |
| `package` | `name`, `version`, `registryRef?` | Composer/npm/lock-file pin |
| `document` | `path` or `url`, `section?` | Spec files, approved notes, README sections |
| `issue-ref` | `url` | GitHub issue/PR/comment receipts (e.g. slaunchpad #32/#42) |
| `db-config` | `configPath` | Config keys **by name only** — values of secrets are never captured |

A `SourceReference` may carry `capturedAt` (scan timestamp) and `digest` (content hash at capture time).

### 2.2 Proof levels

| Level | Meaning | Bars to clear |
|---|---|---|
| `DETECTED` | Present by inspection of a declaration/artifact | SourceReference with digest/lines |
| `ASSUMED` | Inferred from naming, docs, or absence — not proven | Must name the inference basis |
| `TESTED` | Runtime/admin round-trip verified | Evidence of the test run + environment |
| `UNKNOWN` | Cannot currently be assessed | Must appear, never be omitted |

**Installed ≠ enabled ≠ configured ≠ runtime verified.** These are distinct fields, not adjectives: a module may be `installed=true, enabled=false` (3 of 41 Secomm modules in the audited checkout), `enabled` but with runtime DB state unverified (config.php proves file state only — `UNKNOWN` until tested).

### 2.2.1 Proof vocabulary reconciliation (normative)

Three vocabularies exist across the toolkit's history. They describe different axes; records use **one per axis**, never mixed:

| Vocabulary | Axis | Where used | Mapping |
|---|---|---|---|
| `DETECTED / ASSUMED / TESTED / UNKNOWN` | **Proof**: how well-established a claim is | KB records (this document) | canonical for the knowledge layer |
| `observed / derived / illustrative` | **Extraction method**: how a design value was obtained | V1 Figma contracts (`schemas/*`) | `observed`→DETECTED; `derived`→DETECTED (method=derived); `illustrative`→ASSUMED |
| `DISCOVERED → REGISTERED → STRUCTURALLY_MAPPED → ADMIN_ROUNDTRIP_VERIFIED → VISUALLY_VERIFIED` | **Converter stage**: how far a capability has progressed through the #5 pipeline | Converter records (issue #5, PR #6) | stage ≤ proof level: `DISCOVERED`/`REGISTERED` require DETECTED; `STRUCTURALLY_MAPPED` requires DETECTED on the mapping; `ADMIN_ROUNDTRIP_VERIFIED`/`VISUALLY_VERIFIED` require TESTED |

Rule: a converter-stage status may never claim more than the record's proof level supports (a capability cannot be `ADMIN_ROUNDTRIP_VERIFIED` on `ASSUMED` evidence). The two ladders coexist by axis; neither replaces the other.

### 2.3 Evidence block (on every record)

```
evidence: { proofLevel, sources: SourceReference[], method?, confidence: high|medium|low,
            verifiedAt?, uncertainty: string[] }
```

- `uncertainty` states what could invalidate the record (e.g. "runtime DB config not scanned", "store-level Page Builder enablement lives in DB").
- Confidence **never upgrades silently**: moving `ASSUMED` → `TESTED` requires new evidence, recorded with `verifiedAt` and the verifying method.

### 2.4 Staleness & invalidation

Records carry `observed { scannedAt, inputDigests: {path → sha256} }`. Lifecycle states: `ACTIVE` → `STALE` (a tracked digest changed; re-audit required before the record feeds decisions) → `ACTIVE` again after re-verify, or → `INVALIDATED` (proven wrong; retained for history, excluded from queries by default) → `ARCHIVED` (superseded; lookup remains possible, §4.6).

---

## 3. Relations & graph

Typed, directed, evidence-carrying edges. Every edge records `{type, from, to, evidence, confidence, recordedAt}`.

| Edge | Direction & meaning | Cardinality |
|---|---|---|
| `requires` | A → B: A cannot function without B (hard prerequisite) | n:m |
| `providedBy` | A → B: capability A is provided by platform element B (module, package, service) | n:1 |
| `implements` | A → B: A actually delivers the business function B describes (evidence-backed) | n:m |
| `mapsTo` | A → B: UI-side correspondence (Hyvä UI ↔ `Secomm_UiWidget` ↔ Page Builder native; design concept ↔ component) | n:m |
| `compatibleWith` | A → B: verified to work together in a declared environment | n:m |
| `conflictsWith` | A → B: cannot coexist, or degrades, in a declared environment | n:m |
| `dependsOn` | A → B: soft dependency (optional enhancement, graceful degradation) | n:m |
| `supersedes` | A → B: A replaces B (component B2, requirement re-version, decision revision) | 1:n |

**KB-2 provenance relations** (audited checkout evidence: the widget registry already carries per-component `source_component` + `source_version`, so these are formalizations, not inventions):

| Edge | Direction & meaning |
|---|---|
| `adaptedFrom` | KB-2 A → KB-2 B: A was imported/adapted from upstream component B (version-pinned) |
| `neighborOf` | A → B: semantic neighbor in a *different capability class* — e.g. a widget vs a Page Builder content type. **Page Builder editability is a different capability class than a developer-owned widget: use `neighborOf`, never `mapsTo`, across that class boundary** — otherwise admin-editable-by-merchants gets wrongly merged with developer-owned components |
| `replaces` | A → B: A substitutes B in compositions going forward (softer than `supersedes`, which implies history) |
| `equivalentOf` | A → B: same capability surfaced by different sources; deduplication edge — consumers count one capability, not N |

**KB-3 chain relations** (requirement-side; see §7 and [UX-CAPABILITY-PLANNING.md](UX-CAPABILITY-PLANNING.md)): `satisfies` (Composition→Requirement), `constrains` (Constraint→any), `materializes` (UXIntent→Capability/Component refs), `decided-by` (Composition→Decision), `evidenced-by` (Decision→evidence artifact), `waives` (Decision→Requirement/Constraint exception).

### 3.1 The no-false-equivalence rule (normative)

**UI appearance is not business functionality.** `mapsTo` never implies `implements`:

- A Page Builder `banner` with a "poster" appearance **mapsTo** a Hyvä UI banner composition — that says nothing about whether checkout, pricing, inventory, or campaign logic works.
- Only `implements` edges — which require `TESTED`-level or explicitly `DETECTED`-with-source evidence of the business behavior — may back statements like "the system supports flash-sale pricing".
- Planners and queries that answer "can we build X?" must decompose X into functional requirements (KB-3) and match them against `implements` evidence in KB-1, using `mapsTo` only for **composition** reuse. A plan built on `mapsTo` alone must be labeled `APPEARANCE_ONLY`.

### 3.2 Graph integrity

- No cycles in `requires`/`providedBy`/`supersedes` (validate at store write time).
- Every edge's endpoints must resolve to records in the same store; dangling edges are write-time errors.
- Cross-project edges are forbidden (§8.2); cross-KB edges are the point.

---

## 4. Knowledge lifecycle

### 4.1 Ingestion plans

Every ingestion is defined by a plan: `{sourceId, adapterKind, allowRoots[], denyGlobs[], parserProfile, schedule: on-demand|on-change}`. Allowlisted roots bound what may be opened; deny globs (§8.1) are evaluated **before** any file is read. Ad-hoc scanning outside a plan is a contract violation.

### 4.2 Ingestion depth tiers

| Tier | Mechanism | Use |
|---|---|---|
| T0 | Declarations & manifests (XML content types, widget/component registries, `composer.lock`, `config.php`, package directory structure) | Default; deterministic, cheap, the KB-1/KB-2 backbone |
| T1 | Targeted file reads within allowlist (templates inventory, config providers) | When a capability's semantics need one more fact |
| T2 | LLM-assisted semantic classification | **Only** with per-record evidence review; every T2 claim carries `method: llm-classified` + `proofLevel: ASSUMED` until human-verified. Never a bulk codebase embedding pass |

### 4.3 Incremental sync & dedupe

- Sync is digest-driven: records pin `inputDigests`; a changed digest marks dependents `STALE` (§2.4). Unchanged digests are never re-parsed.
- Duplicate resolution: same `nativeId` within one source namespace → **update** the record (new `observed`, keep ID); same semantic unit in **different** sources → separate records + `mapsTo`/`equivalentOf` edges (never merge silently).
- Authoritative vs inferred: every record declares `factuality: authoritative | inferred`. Adapter-read declarations are authoritative; cross-source guesses are inferred and never override an authoritative record on merge.

### 4.4 Re-audit triggers

Digests to track per source (worked example from the audited checkout — see [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md)): lockfile (platform/version KB), enablement map (enablement KB), widget/component registry files (component registry KB), content-type declaration directory (Page Builder KB), module declaration files (dependency topology). A trigger file change ⇒ dependent records `STALE` ⇒ re-audit job. Scan timestamps and digests are mandatory record fields.

### 4.5 Review & approval gates

Records (especially `ASSUMED`, T2-classified, or business-critical) carry `reviewStatus: unreviewed | reviewed | approved` with reviewer + reference. Query consumers filter by it; planning output surfaces unreviewed facts as explicit uncertainty.

**Approval durability** (learned from the V1 pilot, where an in-session GO left `approvalRef: null`): approvals distinguish `recorded` (channel + URL + approver + date all present — satisfies approval-demanding gates) from `attested` (a real human go occurred but survives only as prose — satisfies "human said yes", **not** gates that require `approvalRef`). The distinction is recorded, never papered over: an attested approval blocking a gate stays blocking.

### 4.6 Archive, rollback, history, conflicts

- The store is git-versioned (see [TECH-ADR.md](TECH-ADR.md) §storage): rollback = `git revert`; old-version lookup = git history at record granularity (`observed.scannedAt` is the lookup key).
- Conflict policy: two scans disagreeing about the same fact keep **both observations** with a diagnostic (`CONFLICTING_OBSERVATIONS`) — never silent last-write-wins; a human or a stronger proof level resolves.

---

## 5. Search & query contracts

**Structured deterministic filters first.** `KnowledgeQuery` (§6) accepts:

| Filter dimension | Values (examples) |
|---|---|
| `kb` | `platform` \| `ui` \| `project` |
| `projectId` / `tenantId` | mandatory for KB-3; forbidden to omit |
| `platform`, `platformVersion` | e.g. `magento`, `2.4.8-p5` |
| `category`, `origin` | capability family; `native \| custom \| third-party` |
| `variant`, `appearance` | UI component variant axes |
| `proofLevel` ∈ DETECTED/ASSUMED/TESTED/UNKNOWN | and `reviewStatus`, lifecycle state |
| `licenseStatus` | `confirmed \| unconfirmed \| incompatible \| not-applicable` |
| `edgeType`, `relatedTo` | graph traversal (e.g. "everything `mapsTo` `uic:hyva-ui:banner`") |

Rules:
- **Deterministic**: identical query ⇒ identical result order (stable sort by ID). This is what makes the KB a contract testable in CI.
- **Provenance on every hit**: results carry their evidence blocks; consumers cannot strip them.
- **Lexical retrieval optional**: FTS over titles/semantics is an index **behind the same port**, adopted only when demonstrated useful on real queries; **semantic/embedding retrieval is out of scope** until a demonstrated need with human-reviewed relevance — and even then provenance rules stay.
- Proof-level honesty in results: a query for "tested capabilities" must never return `ASSUMED` records with a downgrade to "probably fine" — filtering is exact.

---

## 6. Cross-boundary ports (language-neutral signatures)

External tools (Figma MCP, Magento runtime, Hyvä packages, vendor CLIs) are **optional adapter backends**. The core must operate with none of them installed.

| Port | Responsibility | Key operations (shape) |
|---|---|---|
| `ProjectSourceAdapter` | Bind a project's source roots to the toolkit (per-project, local config) | `bind(profile) → SourceBinding{roots, denyGlobs, digests}`; refuses absolute defaults |
| `PlatformCapabilityAdapter` | KB-1 ingestion for a platform (Magento adapter is the first; Shopify et al. later) | `scan(binding) → {capabilities[], dataProviders[], relations[], observed}` |
| `UIInventoryAdapter` | KB-2 ingestion per UI source (hyva-ui / secomm-uiwidget / page-builder-native / future others) | `scan(binding) → {components[], variants[], relations[], observed}`; metadata-only for licensed sources |
| `RequirementsSourceAdapter` | KB-3 ingestion from specs/tickets/approved notes | `scan(binding) → {requirements[], uxIntents[], decisions[], relations[], observed}` |
| `KnowledgeStore` | Durable, versioned, per-project-isolated record storage | `put(record)`, `get(id, at?)`, `diff(sinceRev)`, `listStates()`, `archive(id)`; enforces §1.2/§3.2/§8.2 at write time |
| `KnowledgeQuery` | Deterministic filtered reads (§5) | `query(filter) → {hits[{record, evidence, score?}], diagnostics[]}` |
| `CapabilityMatcher` | Match a need statement to candidate capabilities/components | `match(needRef) → {candidates[{record, viaEdges, evidence}], gaps[{needRef, classification}]}` |

Port rules: ports are **interfaces, not processes** — they may be satisfied by CLI commands, library calls, or agent skills; no port may hardcode a platform; adapter registration is data (profiles/registry files), not code changes to core.

---

## 7. Future UX-planning contract (`PlanProposal`)

Given a requirement set (KB-3) plus platform/UI/project profiles, the planning port returns **a ranked or curated proposed section/layout/component plan** — an artifact for humans, **never a Figma design, never CMS content**.

```
plan(requirements, profiles) → PlanProposal {
  sections: [{
    uxIntentRef, rank,
    candidateCompositions: [{
      components: uic[] with variants chosen,
      reuse: {viaEdges, evidenceRefs},        // why this satisfies the intent
      proofLevel, confidence,
      risks[],                                 // including APPEARANCE_ONLY warnings (§3.1)
    }],
    missing: {classification: GAP | CUSTOM_REQUIRED | UNKNOWN, evidence, proposal?},
  }],
  openQuestions[], diagnostics[]
}
```

Hard rules:
1. Every recommendation traces to evidence IDs (records + edges). An untraceable recommendation is a contract violation, not a stylistic flaw.
2. Unsupported capabilities surface as `GAP` / `CUSTOM_REQUIRED` / `UNKNOWN` — **a planner must never invent a component** (§KB-2 rule) or silently approximate.
3. Output is validated against the KB before presentation (e.g. a proposed `uic:` ref that does not resolve = error).
4. Figma design creation is a **later, separately gated stage**; the plan is the contract boundary between knowledge and design.

Worked example (synthetic, non-Magento): [UX-CAPABILITY-PLANNING.md](UX-CAPABILITY-PLANNING.md).

---

## 8. Privacy, license & security

### 8.1 Structural deny-list (enforced before read, not by policy prose)

Deny globs evaluated by every adapter before opening anything under an allowlist root. Baseline deny-set (profiles may add, never remove):

```
auth.json, app/etc/env.php, .env*, *credentials*, *.pem, *.key,
var/**, generated/**, pub/media/** (bulk), *.sql.gz, *.dump*,
**/node_modules/**, vendor/** dist artifacts of licensed packages,
any Hyvä UI source/template/asset file (metadata via UIInventoryAdapter only)
```

On denial: emit diagnostic `DENIED_PATH_SKIPPED {path}` and continue — fail-open per file, fail-closed per run (a run whose allowlist included only denied paths is an error).

### 8.2 Cross-project isolation (KB-3)

- Every KB-3 record carries `projectId` + `tenantId` (+ optional `environment`); the store partitions by `projectId`; `KnowledgeQuery` **requires** the filter and the store refuses cross-partition edge writes (§3.2).
- No defaults that leak: an unset project scope is an error, never "all projects".
- Export paths (reports, plans) stamp every item with its projectId; mixed-project output is unrepresentable.

### 8.3 Licensing gates

- Licensed packages (Hyvä UI is the known case): records hold **identifiers, versions, file-path pointers, counts, capability semantics in neutral language, license facts** — never source, templates, rendered markup, assets, or license keys. `UIInventoryAdapter` output is schema-bounded to metadata (see `kb-ui-component.schema.json`).
- Derived artifacts (plans, specs, documentation) may cite the package only via provenance pointers; before any derived artifact leaves the owner's environment, `licenseStatus` gates apply (V1 gate G5 semantics).
- Client content in KB-3 must be sanitized before it may appear in this public repo: examples in the toolkit are **synthetic**; real client material stays in the project's private store.

### 8.4 Secrets & retention

- Store metadata and digests, not file contents: ingestion records *what exists and what it means*, never bulk copies.
- Evidence receipts are sanitized: no tokens, no keys, no personal data; person references use roles.

---

## 9. Portability

- **No absolute owner paths anywhere as defaults.** `/home/thanhle/Sites/Magento/slaunchpad` is the current owner's local audit path only — it appears in evidence receipts as a `rootAlias`-resolved pointer, never in schemas, defaults, docs-as-config, or tests of other users.
- Source roots are supplied **per project/adapter** via (in priority order): CLI flag → environment variable → local git-ignored config (e.g. `.toolkit/local.json`). Absence is a clean, early, actionable error.
- Core works with **no Magento, no Hyvä UI, no Figma installed**: KBs populated purely from synthetic fixtures must produce valid stores, queries, and plan proposals (tested in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) M3).
- A **second, non-Magento synthetic project** must exercise the same contracts unchanged — this is the standing neutrality test inherited from V1 (two-profile rule).

---

## Schema drafts

Machine-checkable drafts for the record shapes these contracts describe live in [schemas/](schemas/README.md):

| Schema | Covers |
|---|---|
| `kb-capability.schema.json` | KB-1 `Capability` + `DataProvider` records |
| `kb-ui-component.schema.json` | KB-2 `UIComponent` records (three-source aware, license-bounded) |
| `kb-project-record.schema.json` | KB-3 requirement-side records (Requirement, UXIntent, Composition, Decision, Constraint, Risk, OpenQuestion) |
| `kb-relations.schema.json` | Cross-KB typed edges (§3) |

They are **example drafts** for review — valid Draft 2020-12, JSON-syntax-checked, hand-reviewed against this document (the same standard the V1 schemas used before P1 CI landed).
