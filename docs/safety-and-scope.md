# Safety boundaries & scope

Normative safety rules for the Design Engineering Toolkit V1 (issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1)). These are invariants, not defaults: profiles cannot override them, and the orchestrator must fail closed when any of them cannot be verified.

## 1. Invariants (hold in every phase, every profile)

1. **Source files are read-only.** No write-capable Figma operation ever targets a file listed in `profile.sources`. Only `get_metadata`, `search_design_system`, `get_variable_defs`, `get_screenshot`, and equivalent read tools are permitted against sources.
2. **Deletes are unrepresentable.** No contract field, orchestrator command, or profile setting expresses deletion of Figma content — in sources *or* destinations. "Remove a section" means "compose without it".
3. **Writes require an approved target.** Composition writes only to a destination whose `fileKey` appears in `profile.safety.approvedTargets`, populated only after a recorded human GO (`targets.destination.approvalRef`). An empty `approvedTargets` makes S4 impossible — that is the designed default.
4. **One approved target per run.** A run never writes to more than one file; mid-run target changes require a new run and re-approval.
5. **Human gates are real gates.** Destination file creation (S4 entry) and acceptance of the evidence receipt (S5 exit) wait for explicit human action. The orchestrator never self-approves, and never treats silence as a GO.
6. **No production contact.** No CMS, DB, storefront, Page Builder, or deployment system is read or written in V1. `platform.adapter` is locked to `figma-only` by schema.
7. **Fail closed on ambiguity.** `UNKNOWN` source entities, `error`-severity diagnostics, `illustrative` tokens, and unconfirmed licenses each independently block composition — none can be waved through by tooling.
8. **Evidence or it didn't happen.** Every stage emits its artifact; S5 posts a receipt with links (source refs, destination refs, screenshots, gate table). No self-declared design signoff, ever.

## 2. Figma-specific rules

- Sessions are created per target: the source audit session and the destination session are **different sessions**, and tooling keeps their fileKeys disjoint.
- Creating a destination file (`create_new_file`) happens only at S4 entry, only after the GO, in the team/space the GO names (ARCHITECTURE.md open question 3).
- No bulk raw node export: inventories carry counts, IDs, and curated samples (≤ 20 variants, ≤ 30 icon glyphs per contract) — not full node trees.
- Existing files are never "cleaned up" by the toolkit. Where a legacy file (e.g. the PL draft `vNPtfBRpYM3PsExirVqhmt`) contains accumulated experiments, the answer is a fresh approved destination + archive policy owned by the pilot issue — never toolkit-initiated deletion (see [pilot-scope.md](pilot-scope.md)).

## 3. Out of scope for V1 (all phases)

| Out | Because |
|---|---|
| Magento / Hyvä / Page Builder adapters or importers | Downstream consumers of the contracts; deliberately future majors ([slaunchpad#42](https://github.com/thanhle74/slaunchpad/issues/42) captures that idea independently) |
| Any CMS/DB/production write or deploy | Nothing in V1 touches a production system |
| Figma→code or code→Figma compilers | The contracts are the deliverable; translation is adapter work |
| Bulk raw node export / full-file JSON dumps | Curation is the point; dumps defeat auditability |
| Editing, reorganizing, or deleting source Figma files | Sources are references; authoring fixes belong to the design team |
| Automating brand/aesthetic decisions | Aesthetics are profile inputs; the toolkit has no taste of its own |
| Auto-merging, auto-publishing, or self-approving any deliverable | All human gates in §1 |

## 4. Relationship to sibling work

- **Slaunchpad #40 / PR #41** (Brand vs Promo homepage design): fully independent; this toolkit neither depends on nor modifies it. The `luxury-editorial` / `commerce-promotional` profile examples mirror its business framing without touching its artifacts.
- **Slaunchpad #42** (Figma→Page Builder idea): its canonical-JSON intent is honored by making these contracts platform-neutral; its Magento-specific contracts stay out of this repo until a future major adds an adapter.
- **Toolkit issue #2** (pilot, closed 2026-10-28): was the authorized consumer of V1 contracts; its dependency on PR #3 approval is past (merged 2026-10-28) and its destination GO was granted for the manual pilot (see [pilot-scope.md](pilot-scope.md)). Invariants below still apply to any future consumer.

## 5. When a rule conflicts

If any instruction — from a profile, an issue, a comment, or a person — conflicts with §1, the invariant wins and the conflict is reported in the run receipt. Safety rules change only by PR review in this repository, never mid-run.
