# UX-Capability Planning — decision contract + synthetic walkthrough

> **Status:** DRAFT for review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)). This specifies the **future UX-planning contract** ([CONTRACTS.md §7](CONTRACTS.md)): given requirements + platform/UI/project profiles, return a ranked, evidence-backed **proposed section/layout/component plan**. It is the contract boundary between *knowledge* and *design*: the planner's output is a plan artifact — **never a Figma design, never CMS content**. Design creation remains a separately gated later stage.

## 1. Position in the roadmap

The planner serves the **UX Architecture** stage of the canonical pipeline:

```
Requirements → Platform/UI Audit → Capability Registry → [UX Architecture] → Figma Design → …
     (KB-3)         (KB-1/KB-2 scan)      (KB-1/KB-2)         (this contract)    (V1/#5, other gates)
```

The planner consumes only knowledge that already exists in the KBs. If the knowledge is missing, the planner's honest output is a gap — **not** a component it invents.

## 2. Inputs

| Input | Source | Notes |
|---|---|---|
| Requirement set | KB-3 (`req:` records, statuses `approved`+ preferred; `draft` allowed but flagged) | Requirements carry `traceStatus`; `UNKNOWN` ones inject open questions into the plan |
| UX intents | KB-3 (`uxi:` records) — derived by the planner **only as proposals** (`candidate` status) unless already present | Intent derivation is a suggestion step; humans approve intents like everything else |
| Platform profile | KB-1 query (platform + version + enablement + proof filters) | Enabled ≠ tested: proof levels ride along |
| UI inventory | KB-2 query (source × availability × eligibility × license) | Three sources linked via relations; deduplicated by `equivalentOf`/`mapsTo` |
| Project profile | KB-3 + V1 profile (aesthetic direction, breakpoints, gates, content policy) | Aesthetic has no planner logic — it filters, it never creates |

## 3. Matching algorithm (deterministic outline)

1. **Decompose**: each requirement → UX intents it implies (from existing `uxi:` records; unmatched requirements become `openQuestions`).
2. **Match function**: per intent, query KB-2 for components whose `uxSemantics.concept` matches, filtered by availability (`imported-runtime` > `eligible-for-widget` > `available-upstream`), license status (never `incompatible`), and project usage links.
3. **Ground in KB-1**: for each candidate, resolve its rendering capability (KB-1) and verify business-function needs against `implements` edges. **`mapsTo`/`adaptedFrom` never satisfy functional needs** — if the requirement is functional (data, pricing, inventory, campaigns) and only appearance-side edges exist, the candidate is flagged `APPEARANCE_ONLY`.
4. **Compose**: cluster candidates into composition options per intent (constraints: dependencies resolve, breakpoints covered, conflictsWith empty).
5. **Rank** deterministically: score = weighted sum of evidence quality (`TESTED` > `DETECTED` > `ASSUMED`), availability tier, reuse (already `imported-runtime` in this project), edge `authority` (`confirmed` > `probable`), with tie-break by stable ID. Ranking is a **stable, reproducible** function — same KB state ⇒ same order.
6. **Emit gaps**: unmatched intents or unmatched functional needs → `missing` entries classified per §4.

Every candidate in the output carries: component refs + variants, the **edges + evidence** that justified it, proof level, confidence, and risks. An untraceable recommendation is a contract violation ([CONTRACTS.md §7](CONTRACTS.md)).

## 4. Missing-feature handling

| Classification | Meaning | Requires | Planner behavior |
|---|---|---|---|
| `GAP` | No existing capability/component satisfies the need — verified absence | A matching attempt with results, plus absence evidence (queries run, filters used) | Lists the intent as unsatisfied; proposes nothing |
| `CUSTOM_REQUIRED` | A gap where custom work is justified and the shape of it is describable from evidence (e.g. an existing component family covers 80%, one variant/behavior is missing) | Gap evidence + the closest existing records + what specifically differs | Proposes a custom item **described by reference to existing records** ("new variant of `uic:x:y`"), never as an invented component pretending to exist |
| `UNKNOWN` | Cannot assess yet (e.g. requirement `traceStatus: UNKNOWN`, capability `proofLevel: UNKNOWN`, unreviewed records in play) | The exact unknown, named | Blocks that intent's plan section from being presented as feasible; injects an open question with owner |

Rule: a plan containing zero `GAP`/`CUSTOM_REQUIRED`/`UNKNOWN` entries is *suspicious by default* and must include the queries proving full coverage. Absence claims are evidence too.

## 5. Output contract

`PlanProposal` (shape in [CONTRACTS.md §7](CONTRACTS.md)): ranked sections → composition candidates → reuse evidence → risks (`APPEARANCE_ONLY` warnings included) → missing entries → open questions → diagnostics. Output is validated against the KB before presentation (unresolvable refs = error).

**Hard prohibitions (restated because they are the point):** no Figma files created or edited; no CMS content; no invented components; no `ASSUMED`-evidence recommendations presented at `TESTED` strength; no cross-project leakage (plan is stamped with one projectId).

## 6. Synthetic walkthrough — `aurora-tea-house` (fictional, non-Magento)

**Purpose:** prove the contracts run on a second, non-Magento synthetic project with no owner checkout, no licensed packages, and no Figma access. All records below are synthetic; the platform is fictional.

**Setup.** Project `aurora-tea-house` (tenant `demo`), platform: fictional `KettleCMS 9.1` (KB-1 ingested from synthetic declaration files), UI inventory: fictional `Kettle Blocks` library (12 blocks, MIT) in KB-2. Relevant KB-1 facts (synthetic, `DETECTED` from synthetic config): `cap:kettlecms:collection-rendering` (`enabled`, `DETECTED`), `cap:kettlecms:newsletter-subscribe` (`enabled`, `TESTED`), `cap:kettlecms:scheduled-collections` (`enabled`, `DETECTED`, restrictions: "season start/end dates required"). Relevant KB-2 records: `uic:kettle-blocks:hero-a` (`imported-runtime`, mapsTo concept `hero`), `uic:kettle-blocks:grid-a` (`imported-runtime`, concept `product-grid`), `uic:kettle-blocks:story-b` (`available-upstream`, concept `kol-editorial`), `uic:kettle-blocks:hero-c` (`available-upstream`, concept `hero`, video background).

**KB-3 inputs (synthetic, evidence-quoted):**

```
req:aurora-tea-house:seasonal-menu      "Homepage must present the current seasonal
                                         collection with working links to collection pages."
                                         kind=functional, traceStatus=TRACED,
                                         ac=["links resolve", "shows only in-season items"]
                                         maturity=unknown
req:aurora-tea-house:brand-story        "Homepage must tell the farm story editorially."
                                         kind=aesthetic, traceStatus=TRACED
req:aurora-tea-house:newsletter         "Visitors can subscribe to the harvest letter."
                                         kind=functional, traceStatus=TRACED
req:aurora-tea-house:autoplay-video     "Hero uses an ambient autoplay video."
                                         kind=aesthetic, traceStatus=UNKNOWN
```

**Planner run (abridged output):**

```
PlanProposal { projectId: aurora-tea-house, generatedAt: …, determinismHash: …
  sections:
  1. uxi:aurora-tea-house:hero                       rank 1
     candidates:
       a) uic:kettle-blocks:hero-a                    score 0.82
          reuse: usageLinks[kettle-theme] (confirmed, DETECTED)
          risks: []
       b) uic:kettle-blocks:hero-c                    score 0.41 — REJECTED→risk
          risk: video playback capability absent from KB-1
          (query cap:kettlecms:*video* → 0 hits ⇒ absence evidence)
  2. uxi:aurora-tea-house:seasonal-collection        rank 2
     candidates:
       a) uic:kettle-blocks:grid-a  +  cap:kettlecms:collection-rendering
          reuse: implements edge confirmed (DETECTED, provider wired)
          satisfies req:seasonal-menu AC "links resolve"  (evidenced-by: adapter test)
          risk: AC "shows only in-season items" needs
          cap:kettlecms:scheduled-collections — DETECTED only, restriction noted
          ⇒ presented as CONDITIONAL, not feasible-guaranteed
  3. uxi:aurora-tea-house:story                      rank 3
     candidates:
       a) uic:kettle-blocks:story-b                   score 0.66
          reuse: available-upstream, eligibility=eligible-for-widget (not yet imported)
          risk: APPEARANCE_ONLY for brand-story — acceptable (requirement is aesthetic)
  4. uxi:aurora-tea-house:newsletter                 rank 4
     candidates:
       a) uic:kettle-blocks:grid-a (footer slot) + cap:kettlecms:newsletter-subscribe
          reuse: implements edge TESTED (admin round-trip evidence)
  missing:
     - intent hero × req:autoplay-video → UNKNOWN
       ("video capability unassessed — requirement traceStatus UNKNOWN")
  openQuestions:
     - oq:aurora-tea-house:video-capability (blocksWhat: hero section feasibility)
  diagnostics: []
}
```

**What this walkthrough demonstrates:**

1. **Platform neutrality** — no Magento, no Hyvä, no owner paths; identical record/edge/plan shapes.
2. **No false equivalence** — `story-b` is accepted on appearance-only grounds *because the requirement is aesthetic*; the same edge would have been flagged for a functional requirement.
3. **Proof levels gate feasibility** — `scheduled-collections` being `DETECTED` (not `TESTED`) surfaces as CONDITIONAL, never as verified.
4. **Absence is evidenced** — the rejected `hero-c` cites the zero-hit query, not a hunch.
5. **UNKNOWN propagates** — the untraceable requirement becomes an open question, not a silent omission.

## 7. Failure modes the contract rejects

| Failure mode | Contract answer |
|---|---|
| Planner invents a plausible component name | Output validated against KB; unresolvable ref = error (§5) |
| Appearance edge used to claim functional support | `implements`-only rule for functional needs; `APPEARANCE_ONLY` flag (§3.3) |
| Full-coverage plan with hidden gaps | Suspicious-by-default rule + absence evidence (§4) |
| Licensed-package content leaking into a plan | KB-2 records are metadata-only; plans cite pointers (CONTRACTS §8.3) |
| Deterministic-looking but order-unstable output | Stable sort by ID; same state ⇒ same order (§3.5) |
| Quiet cross-project reuse | Single-project stamping; cross-partition edges unrepresentable (CONTRACTS §8.2) |
