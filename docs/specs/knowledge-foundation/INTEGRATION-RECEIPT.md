# INTEGRATION-RECEIPT — [7] knowledge foundation package

> **[68] layout note:** the `specs/` tree now lives at `docs/specs/`, and the schema draft files listed in §5 below were removed as superseded by the frozen `resources/schemas/kb/` contract family (git history at the pre-[68] path `specs/knowledge-foundation/schemas/` keeps the review record). All other paths in this receipt are historical.

> Integrator: single-writer session (branch `thanhle74/7-architecture-three-knowledge-bases-requirement`, base `main` @ `82c9129`). Dispatch model per issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7): four parallel read-only workers → one integrator. All worker audits executed 2026-11-03. **Draft PR only — no auto-merge.**

## 1. Worker dispatch & receipts

| Worker | Scope (non-overlapping) | Key verified findings |
|---|---|---|
| **[7] W-A — Platform KB** | Local checkout platform/module/PB/registry audit (read-only) | Magento CE 2.4.8-p5 + patch set; Hyvä stack versions (theme 1.5.2, tailwind-jit 2.0.3); PB **2.2.6-p5: 20 content types / 33 appearances, per-file declarations (no `etc/content_type.xml`)**; enablement map: 528 entries, 524 enabled / 4 disabled; 119 `app/code` modules (41 Secomm: 38 enabled); **live UiWidget registry = 21 components in di.xml (widget.xml declares 1 widget)** — exact match with B1 matrix; installed-vs-enabled distinctions recorded as data; re-audit trigger digests captured |
| **[7] W-B — UI KB** | Licensed Hyvä UI + theme/Tailwind/Alpine audit + three-source mapping + licensing policy | Hyvä UI **2.8.0, commercial license, 36 components / 70 variants**, copy-in source library (no module/theme/package manifests); Tailwind **v4.3.2 CSS-first**, scaffold derived from hyva-ui `tailwind-v4` plugin; Alpine CSP build shipped (active variant UNKNOWN — config-driven); **21 CONFIRMED `adaptedFrom` pairs** already documented in-repo (registry `source_component`/`source_version` + README provenance + eligibility matrix); 25 components/38 variants without widget counterparts (EXCLUDE/DEFER); theme implements structural components natively; PB must be linked via `neighborOf` (different capability class), never `mapsTo`; zero source code reproduced in any receipt |
| **[7] W-C — Project KB** | Toolkit pilot materials + slaunchpad `.ai/specs` + LC/FC registry hunt + KB-3 normalization proposal | No authoritative LC/FC registry exists (LC-01 collision verified live: security patches vs Figma section tag) → external IDs non-canonical; ~55 evidence-backed KB-3 records creatable today for the pilot project with zero Figma reads; richest existing linkage example = #32 section-mapping table; #40 Design Feature Matrix enums adopted (`maturity`, `SHOW/CONDITIONAL/OMIT/NEEDS_APPROVAL`); approval durability gap found in pilot (in-session GO, `approvalRef: null`) → `recorded` vs `attested` semantics |
| **[7] W-D — Tech/knowledge architecture** | TS vs Python evidence comparison, storage/query, ingestion, packaging, PR #6 alignment | **TypeScript/Node** recommended (SSOT ajv precedent + Node installed + agent-friendliness; PHP-AST needs out of scope and language-neutral behind adapters); JSON Schema 2020-12 stays canonical; **git-versioned JSON/JSONL + derived gitignored SQLite FTS5 index, three logical domains**; Postgres/vectors rejected with concrete upgrade thresholds; out-of-process adapters + single path gateway; PR #6 fully aligned, no conflicts; 7 OPEN_DECISIONs with exact proofs needed |

Full receipts preserved in the session log; their load-bearing content is integrated into the deliverables and summarized in [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md).

## 2. Affected files (BASE `82c9129` → this branch)

```
docs/specs/knowledge-foundation/README.md                     (new — A: scope + navigable index + exact roadmap text)
docs/specs/knowledge-foundation/KNOWLEDGE-ARCHITECTURE.md     (new — B: boundaries, ingestion/query, lifecycle, isolation, diagram)
docs/specs/knowledge-foundation/CONTRACTS.md                  (new — C: nine contracts)
docs/specs/knowledge-foundation/schemas/README.md             (new — C: schema family doc)
docs/specs/knowledge-foundation/schemas/kb-capability.schema.json      (new — C: KB-1 draft)
docs/specs/knowledge-foundation/schemas/kb-ui-component.schema.json    (new — C: KB-2 draft, license-bounded)
docs/specs/knowledge-foundation/schemas/kb-project-record.schema.json  (new — C: KB-3 draft, tenant-isolated)
docs/specs/knowledge-foundation/schemas/kb-relations.schema.json       (new — C: cross-KB edges)
docs/specs/knowledge-foundation/SOURCE-INVENTORY.md           (new — D: evidence-based inventory + reuse matrix)
docs/specs/knowledge-foundation/TECH-ADR.md                   (new — E: ADR-1..5 + OPEN_DECISIONS)
docs/specs/knowledge-foundation/UX-CAPABILITY-PLANNING.md     (new — F: planning contract + synthetic non-Magento walkthrough)
docs/specs/knowledge-foundation/IMPLEMENTATION-PLAN.md        (new — G: M0–M5 + GO gates + test strategy)
docs/specs/knowledge-foundation/INTEGRATION-RECEIPT.md        (new — H: this receipt)
README.md                                                (modified — link to the package)
```

No existing file's semantics changed; no Figma, CMS, DB, or runtime contact; issue #5 and PR #6 untouched.

## 3. Integrator reconciliations (conflicts resolved once)

| Conflict | Resolution |
|---|---|
| Proof vocabulary (issue: detected/assumed/tested · V1: observed/derived/illustrative · #5 ladder: DISCOVERED→…→VISUALLY_VERIFIED) | Three axes kept, mapped, and non-mixable — [CONTRACTS.md §2.2.1](CONTRACTS.md): proofLevel canonical for KB; converter stage ≤ proof level |
| ID grammar (W-A dotted, W-D dotted, W-C/W-B colon/kebab) | Ratified: `<prefix>:<scope>:<kebab-slug>`, version-free; upstream identifiers preserved verbatim in `nativeId` ([CONTRACTS.md §1.2](CONTRACTS.md)) |
| "21 components" hypothesis | Corrected structurally: 1 declared widget, 21 di.xml-registered components (exact B1 match) — adapters must parse both layers |
| "etc/content_type.xml" assumption | Corrected for PB 2.2.6-p5: per-file declarations; version-aware discovery required |
| Equivalence counting (three sources) | Relation-edge dedupe: `mapsTo`/`adaptedFrom`/`equivalentOf` within class; `neighborOf` across the Page Builder class boundary ([CONTRACTS.md §3](CONTRACTS.md)) |
| PB path in issue brief vs reality | Inventory records the real layout; contract text stays version-neutral |
| Owner local path handling | Real path appears **only** as evidence pointers with never-a-default warnings (mirrors issue text); contracts/schemas use `rootAlias` placeholders |

## 4. Proof status

- **Verified:** all toolkit-internal claims (read); all slaunchpad declaration-layer facts (file inspection, 2026-11-03); B1 matrix live-match (21/21 identifiers); Hyvä UI metadata facts (structure/names/versions only); repo/stack facts for the ADR; JSON syntax of all four schema drafts (Node 24 parse).
- **NOT_VERIFIED / UNKNOWN (honest):** runtime PHP version; DB enablement vs config.php; active Alpine build variant; `Launchpad_Osc` absence semantics; store-level PB enablement; measured gate values (G1–G5 never measured — pilot was manual); BA registry definitions (LC-03/04/16, FC-04/07, LA); exhaustive non-widget package usage in theme.
- **Schemas are drafts:** hand-reviewed against CONTRACTS.md, syntax-checked; full Draft 2020-12 validation is M1 CI (stated in schemas README).

## 5. Unresolved decisions (need Owner)

| # | Decision | Where | Proof needed |
|---|---|---|---|
| 1 | SQLite driver (`better-sqlite3` vs `node:sqlite`+FTS5) | TECH-ADR OPEN #1 | P1 spike |
| 2 | TS typing strategy (codegen vs TypeBox) | TECH-ADR OPEN #2 | first schema iteration |
| 3 | PHP AST necessity | TECH-ADR OPEN #3 | a capability unreachable from declarations |
| 4 | Semantic retrieval | TECH-ADR OPEN #4 | query log: >30% structured misses over a milestone |
| 5 | Single-binary distribution | TECH-ADR OPEN #5 | consumer without Node |
| 6 | KB-3 private-material venue (sanitized-in-repo vs private store) | TECH-ADR OPEN #6 | Owner policy |
| 7 | First-party fileKey publication policy | TECH-ADR OPEN #7 | Owner policy (V1 docs already publish SECOMM fileKeys) |
| 8 | Approval-durability policy (which gates accept `attested` GOs) | CONTRACTS §4.5 | Owner ratification of the proposed rule |

## 6. Definition-of-ready check (issue's list)

- [x] Three logical KBs mapped with minimal shared contracts; no duplicate capability definitions (dedupe by relation edges); source→claim traceability structurally required
- [x] Security + licensed-Hyvä separation demonstrable in the data contracts (no field can hold source/assets/keys; byte-level test planned M4)
- [x] Technology selected and explained in ADR; alternate paths + upgrade strategy + when-to-revisit documented
- [x] Every UX concept candidate supported by source evidence or classified `GAP` / `CUSTOM_REQUIRED` / `UNKNOWN` (planning contract + walkthrough)
- [x] Contracts generic: second **non-Magento synthetic** project walkthrough proves shape without owner checkout (M3 CI will prove execution)
- [x] Skills/agent references chosen from existing toolkit + local Slaunchpad materials; no extra agent framework introduced
- [x] No Figma access, no CMS/DB mutations, no platform runtime dependencies, no bulk refactor/deletion
- [x] #5 unchanged and independently executable (nothing references or modifies it)

## 7. GO / NO-GO

**Recommendation: GO for review — exit status `READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW`.**

- **GO** = Owner reviews this package (esp. TECH-ADR + CONTRACTS §1/§2/§7) and grants **GO-1** (per [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)) to create the implementation scope. Resolutions of §5 decisions 6/7/8 can ride with GO-1 review.
- **NO-GO (until separate GOs):** any implementation code, real-source ingestion, plan generation on real data, or Figma/CMS contact. **Specs existing does not mean knowledge stores exist** — none do.
- **NO-GO:** merging this PR without review (draft only; no auto-merge).
