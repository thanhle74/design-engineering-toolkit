# IMPLEMENTATION-PLAN — knowledge foundation milestones & gates

> **Status:** DRAFT for Owner review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)). **This plan contains no implementation code.** Every milestone after M0 starts only on an explicit Owner GO; estimates are sizing for review, not commitments. Technology per [TECH-ADR.md](TECH-ADR.md); contracts per [CONTRACTS.md](CONTRACTS.md); architecture per [KNOWLEDGE-ARCHITECTURE.md](KNOWLEDGE-ARCHITECTURE.md).

## 0. Standing invariants (all milestones)

1. Read-only ingestion of user-supplied sources; the path gateway + deny-list hold from the first line of code (no "we'll add safety later" phase).
2. No hardcoded owner paths, ever. Source roots: CLI flag → env → local git-ignored config. CI proves a clean clone works without any `/home/…` path.
3. Core runs with **no Magento, no Hyvä, no Figma installed** at every milestone (fixture-driven).
4. Issue #5 and its artifacts remain untouched; this plan consumes its *outputs* (receipts, PR #6 vocabulary) read-only.
5. Human gates are real gates: silence is never a GO; every gate's approval is recorded (`apr:` semantics, `recorded` vs `attested` — [CONTRACTS.md §4.5](CONTRACTS.md)).
6. Evidence or it didn't happen: every milestone exits with a receipt naming what was verified and what was not.

## 1. Milestones

### M0 — Architecture package (this PR) — no GO needed to review

| | |
|---|---|
| Scope | This `specs/knowledge-foundation/` package: contracts, schema drafts, source inventory, tech ADR, planning contract, this plan, integration receipt |
| Exit criteria | Package reviewable in a draft PR; exit status `READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW` recorded on issue #7 |
| Estimate | done (this package) |
| Next gate | **GO-1 (Owner)**: approve architecture + technology selection → creates implementation scope. No code before GO-1. |

### M1 — Contracts freeze + validation CI — after GO-1

| | |
|---|---|
| Scope | Promote schema drafts to frozen `schemas/kb-*.schema.json` (or adjust per review, then freeze); ajv (Draft 2020-12) CI validating schemas + synthetic fixture records; negative fixtures; decide `OPEN_DECISION` #2 (typing strategy) with one measured iteration |
| Depends | GO-1 |
| Exit criteria | CI red/green on positive + negative fixtures; frozen contracts documented in schemas README version history |
| Estimate | small (days) |
| Next gate | none — flows into M2 |

### M2 — KnowledgeStore, KnowledgeQuery, index — after M1

| | |
|---|---|
| Scope | Git-versioned JSONL store (three logical domains), write-time validation, lifecycle states (`STALE`/`INVALIDATED`/`ARCHIVED`, `supersedes`), deterministic query port with provenance envelopes, SQLite FTS5 index as rebuildable cache; **decide `OPEN_DECISION` #1** (SQLite driver) via the 20-line spike |
| Depends | M1 |
| Exit criteria | Determinism test (same input ⇒ same store hash); provenance-on-every-hit test; isolation test (unscoped query refused); index-rebuild determinism |
| Estimate | medium (1–2 weeks of agent-executed work with review) |
| Next gate | **GO-2 (Owner)**: authorize first real-source adapters (M4) |

### M3 — Synthetic-project portability proof — parallel with M2

| | |
|---|---|
| Scope | **Two synthetic projects** exercising everything with zero real sources: (a) `aurora-tea-house` — fictional non-Magento platform, non-licensed UI inventory (from [UX-CAPABILITY-PLANNING.md](UX-CAPABILITY-PLANNING.md) §6); (b) a *Magento-shaped synthetic* fixture tree (declaration files resembling the real artifact shapes, no proprietary content) — so the Magento adapter logic is testable without Magento |
| Depends | M1 (schemas) |
| Exit criteria | Clean-clone CI: both projects ingest → query → produce a PlanProposal with zero core changes (the neutrality test) and zero network/platform dependencies; deny-list negative fixtures pass (planted fake `auth.json`/`env.php` appear in diagnostics, never in output) |
| Estimate | small–medium |
| Next gate | none — required evidence for GO-2 |

### M4 — First real ingestion (owner-authorized, read-only) — after GO-2

| | |
|---|---|
| Scope | Out-of-process adapters against the owner's authorized local checkout (root supplied via local config; path never committed): `adapter-magento` (KB-1), `adapter-hyva-ui` (KB-2 metadata-only), `adapter-uiwidget` (KB-2 + `adaptedFrom` edges), `adapter-pagebuilder-native`, `adapter-requirements` (KB-3 seed from existing specs/pilot materials per [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md) §sufficiency) |
| Depends | GO-2 + M2 |
| Exit criteria | Real KBs built for the pilot project: counts reconcile with the audited inventory (528 tracked modules, 21 widgets, 20 PB content types, 36/70 Hyvä variants); every record carries evidence; re-audit trigger dry-run (touch a digest ⇒ STALE propagates); license separation audit (zero Hyvä source bytes in store — asserted by fixture-comparison test) |
| Estimate | medium |
| Next gate | **GO-3 (Owner)**: approve KB contents + `OPEN_DECISION` #6/#7 policy (private-material venue, fileKey policy) before any plan generation on real data |

### M5 — PlanProposal v0 on real knowledge — after GO-3

| | |
|---|---|
| Scope | Planner implementing [UX-CAPABILITY-PLANNING.md](UX-CAPABILITY-PLANNING.md) against the real KBs for the pilot project; every recommendation traceable; gaps honestly classified |
| Depends | GO-3 + M4 |
| Exit criteria | Pilot project plan generated with full traceability review; determinism check (re-run ⇒ identical proposal); `OPEN_DECISION` #4 measurement starts (query log) |
| Estimate | medium |
| Next gate | Owner reviews the plan → **new GO** for the UX Architecture stage (outside this issue's scope) |

### Beyond M5 — out of this issue's scope (named for the roadmap only)

`UX Architecture → Figma Design → Structural Mapping → Functional Round-trip → Visual Fidelity` remain separately gated stages owned by V1 (issues #1/#2) and issue #5. Nothing here schedules them.

## 2. Test strategy

| Test family | What it proves | Milestone |
|---|---|---|
| Schema validation (positive + negative) | Contracts are enforceable: invalid records rejected (missing tenantId, dangling relation edge, license-status violations, `attested` approval gating an approval-demanding record) | M1+ |
| Determinism | Same inputs ⇒ identical store hash / identical PlanProposal (PR #6 gate, adopted) | M2, M5 |
| Deny-list negatives | Planted fake secrets appear in diagnostics, never in output; run fails closed if nothing readable remains | M2+ (fixtures), M4 (real) |
| Isolation | Unscoped/cross-project queries refused; edges across projects unrepresentable | M2+ |
| Portability (clean clone) | Both synthetic projects run with zero `/home/…` paths, zero Magento/Hyvä/Figma installed, zero network | M3 (CI), re-run M4+ |
| With-Magento (synthetic-shaped) | Adapter logic correct against synthetic declaration trees shaped like the real artifacts | M3 |
| With-Magento (real, read-only) | Counts reconcile with the audited inventory; evidence present on every record | M4 |
| Licensing separation | Zero licensed source bytes in the store (byte-level assertion vs the local package, owner-authorized run only) | M4 |
| Re-audit triggers | Digest change ⇒ STALE propagation ⇒ re-audit job | M4 |

## 3. Exit criteria for the whole foundation (M5 done)

- [ ] Three logical KBs live with minimal shared contracts; zero duplicate capability definitions (dedupe via relation edges verified by test).
- [ ] Source→claim traceability: every record resolves to `DETECTED`/`TESTED` evidence or is explicitly `ASSUMED`/`UNKNOWN` with uncertainty stated.
- [ ] Security & licensed-Hyvä separation demonstrable in data (byte-level test) and policy (schemas cannot express violations).
- [ ] Technology selected and explained ([TECH-ADR.md](TECH-ADR.md)); alternate paths + upgrade strategy documented; `OPEN_DECISION`s either resolved with evidence or carried with named proofs.
- [ ] Contracts work for a second non-Magento synthetic project without the owner's checkout (M3 CI green).
- [ ] No Figma access, no CMS/DB mutations, no platform runtime dependencies added — verifiable from the dependency graph and CI.
- [ ] Issue #5 unchanged and independently executable.

## 4. Risk register (planning-level)

| Risk | Mitigation |
|---|---|
| Owner GO gates stall (single reviewer) | Milestones sized small; each gate has a concrete artifact list; receipts make review cheap |
| Schema drafts need rework after review | Expected and cheap — drafts are marked as such; freeze happens at M1, not before |
| Real-ingestion scope creep (M4 tempting to expand into #5's lane) | M4 emits records only; converter/mapping work stays in #5 |
| `OPEN_DECISION` #6/#7 (private material, fileKeys) block M5 | Decisions requested at GO-3 review, before planning on real data |
| Determinism erosion as store evolves | Hash assertions in CI from M2 onward |
