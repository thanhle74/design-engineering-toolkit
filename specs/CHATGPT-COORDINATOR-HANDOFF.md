# ACTIVE CHATGPT COORDINATOR HANDOFF — Design Engineering Toolkit

## CURRENT COORDINATOR CHECKPOINT — 2026-11-03 (later) — #9 FIRST CLI GATE IMPLEMENTED (DRAFT, PENDING REVIEW)

> **NEWEST checkpoint.** Supersedes the status lines below for Issue #9 only; the #5/#7 integration truth below is unchanged. Live Git/GitHub still beats this file.

**Issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) first implementation gate is CODE-COMPLETE on branch `thanhle74/9-backlog-executable-cli-engine-via-claude-code` (draft PR, no auto-merge):**
- TypeScript core graduated from the tested #5 harness to `src/core/` (parity: unchanged 30-check suite, identical hashes); `det` CLI (`validate`/`inspect`/`plan`) with deterministic JSON/exit codes; new independent `schemas/cli/` family (converter family untouched); out-of-process adapter runtime (4 explicit failure diagnostics); **read-only Magento Page Builder adapter** (composer.lock versions, config.php narrow reader, per-file `content_type/` globs, cross-module merge NOT_VERIFIED, widget.xml + DI registries with chrome/precision rule).
- Gate: `npm test` = build + **44/44** checks (30 G1 + 14 new CLI/adapter incl. deny-list leakage, determinism, portability). Receipt: `docs/converter/RECEIPT-ISSUE9-CLI.md`; decisions ADR-009-001..009 in `docs/converter/DECISIONS.md`; agent skill `.claude/skills/det-cli/`.
- **Live read-only audit of the Owner's local checkout** (gitignored profile, path never committed): 78 capabilities @ checkout HEAD `66aff1eb`, Magento CE 2.4.8-p5 / PB 2.2.6-p5, all `registered` ceiling with per-capability `NOT_VERIFIED` (declaration-only), two runs hash-identical, `env.php`/`auth.json` deny-listed. `ADMIN_ROUNDTRIP_VERIFIED`=0.
- **NOT done / NOT claimed:** Figma access, structural mapping of a real design, CMS import, Admin round-trip, visual QA, Theme output, FE. Those remain separate gated stages needing explicit Owner GO.
- **NEXT:** Owner/Coordinator review of the draft PR → merge GO; then the later-gate sequencing on issue #9 stays as written (G2 read-only design extraction first, separate GO).

---

## HISTORICAL COORDINATOR CHECKPOINT — 2026-11-03 — #5/#7 FULLY INTEGRATED

> **CURRENT INTEGRATED TRUTH at this checkpoint.** This section supersedes older dated snapshots and stale PR/GO statements below. New sessions must still re-fetch live GitHub refs, Issue comments, CI and source before asserting status. This is not an authority to write to Figma, Magento CMS/DB or production.

**Accepted architecture and Git evidence:**
- **Issue [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5): CLOSED/COMPLETED (G1 ONLY).** Reviewed 61 registered capabilities / 114 evidence locators; schema contracts/negative-case harness, 30/30 test receipt and two verified PASS CI check runs. [PR #11](https://github.com/thanhle74/design-engineering-toolkit/pull/11) MERGED into `main` at `c161fbc0c0d38cb7fa711a521b624380efe7b644`. Research [PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) CLOSED as **SUPERSEDED** after confirming that PR #11 included its source. **G2 Figma structural extraction, G3 Magento Admin round-trip, G4 visual parity NOT DONE.**
- **Issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7): CLOSED/COMPLETED (SPEC/ADR ONLY).** Reviewed three-KB contracts, evidence/policy, TypeScript/Node + JSON Schema 2020-12 + versioned JSONL/derived SQLite FTS5 direction. Clarified `neighborOf` across Page Builder vs developer-owned component classes and licensed free-text sanitization. [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) MERGED in ancestry via integration. **No executable knowledge store/ingestion/query exists yet; these are specs and draft schemas.**
- **Product/operations docs [PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8) MERGED in ancestry**, including modular architecture, Figma node naming, Page Builder-first scope, SEO Engine selective skills research and THIS handoff.
- **Integration [PR #12](https://github.com/thanhle74/design-engineering-toolkit/pull/12) MERGED** at exact `main` SHA `3d44bf3cb96ff229fd001c9edf07bd58e97c9836`. GitHub commit `contracts` CI **SUCCESS** on that integrated SHA and two SUCCESS checks on integration PR head `be5d7e4d`. README and AGENTS/CLAUDE were reconciled in **one integration**, not replaced by old V1 README.
- **Issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) remains OPEN BACKLOG (not executed).** Only clear next **code-facing deliverable**: real portable CLI/Core, schema validation, read-only capability inspection and deterministic mapping/report using #5 contracts and #7 ADR. Read-only synthetic/Magento-shaped fixture tests first; design extraction, CMS importer, Hyvä Theme and GUI are separate later gates.
- **Figma `245:2`/mobile `245:16`: unchanged / source frozen.** Future name-only normalization requires new, exact Owner GO and reviewed manifest; no automatic reads/writes under this integration. `magento-specs` MCP is optional local Claude Code support, not a CLI runtime dependency.

**NEXT for new Coordinator:** fetch LIVE `main`/CI and issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9), verify dependencies above are still integrated, read `specs/ISSUE-5-converter-architecture.md` + `schemas/converter/` and `specs/knowledge-foundation/` + `specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md`. Prepare #9 one coherent implementation contract reusing code/tests. **Do not relaunch #5/#7, open duplicate review Issues, or pretend current contract test harness is a production converter.** Start #9 implementation only under the Owner's separate authorized scope; no premature live Figma/Magento operations.

**Short status:** `#5=CLOSED_G1_IN_MAIN | #7=CLOSED_SPEC_IN_MAIN | PR11/PR10/PR8/PR12=MERGED | PR6=SUPERSEDED_CLOSED | MAIN@3d44bf3_CI_SUCCESS | #9=BACKLOG | FIGMA_WRITE=OFF | CMS_WRITE=OFF`.

---

## HISTORICAL COORDINATOR CHECKPOINT — 2026-11-03 ~11:17 ICT — #5/#7 SOURCE REVIEW ACCEPTED; PRs NOT MERGED

> **This newer checkpoint supersedes the older Issue #5/#7 status in §5/§9 below.** Live refs/Issue comments always take precedence; it does not authorize an integration merge, Figma access, Magento CMS/DB writes, or #9 execution.

**Confirmed GitHub review truth:**
- **Issue #5:** [Coordinator verdict `ACCEPT_ARCHITECTURE_G1`](https://github.com/thanhle74/design-engineering-toolkit/issues/5#issuecomment-6595394463), candidate **Draft PR #11** @ `7a2cbfde43f143dd0e7995c17146ebfdb87c3d62`, stacked on Draft PR #6. Two actual GitHub Actions `contracts` checks on this exact SHA **SUCCESS**; committed sample 61 capabilities/114 evidence locators, 30/30 test claim from integrator with CI corroboration. **Not** a running Figma extractor, importer, Admin round-trip or visual pass. G2–G4 HOLD. Magento local-source inventory not independently rerun.
- **Issue #7:** [Coordinator verdict `ACCEPT_ARCHITECTURE_SPEC_ONLY`](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6595395058), candidate **Draft PR #10**. Three-KB specs, tech ADR recommending **TypeScript/Node + JSON Schema 2020-12 + versioned JSONL/derived SQLite FTS5**. One bounded reviewer correction on the *same PR #10 branch* resolved cross-capability-class `mapsTo` vs `neighborOf` inconsistency and clarified that metadata-only schema fields do **not** by themselves prevent sensitive/licensed code from appearing in free text (must sanitize/test at ingest/export); last reviewer commit `5086efdf`. All four schema drafts parse as JSON; executable schema/KB CI remains a later implementation gate, not an invented PASS.
- **Draft PR #8** contains our own product scope, modular architecture, selective SEO architecture/skills learning, Figma node taxonomy and **this handoff**. **Draft PRs #6/#8/#10/#11 remain open/unmerged** as of this snapshot. Issues #5/#7 can remain open until approved integration.
- **Issue #9** is **BACKLOG/NO-GO** without explicit Owner approval. It must reuse #5/#7 contracts; first deliverable code is local CLI + pure registry/mapping/validation + synthetic fixtures. No FE/chat, no Theme output, no Figma writes.

**NEXT — one coherent integration decision:** under a **specific Owner GO MERGE ARCHITECTURE**, review and integrate **#11 as the aggregate #5 branch including #6** (close #6 as superseded after confirming content), then **#10** (resolve README/contract conflicts against merged #11), then **#8** (pure docs/handoff, rebase/reconcile current index/AGENTS navigation once). No duplicate PR merges and no force-push/overwriting parallel commits. Verify exact merged SHAs on `main` and update handoff/issue receipts. Only **after integrated contracts + separate GO #9** may implementation begin. Owner policy items #7 on private KB-3 material, Figma fileKey visibility and approval durability must be resolved before related real-source operations, not before all synthetic CLI work.

**Owner-facing short status format:** `#5=REVIEW_ACCEPTED_G1; #7=REVIEW_ACCEPTED_SPEC; #11/#10/#8=OPEN_DRAFT; NEXT=OWNER MERGE GO for reviewed architecture (no auto-merge); #9=BACKLOG.`

---

> **First checkpoint:** 2026-11-03 (Asia/Ho_Chi_Minh).  
> **Status:** DRAFT PR #8, branch `docs/pagebuilder-first-product-scope` — **NOT YET MERGED INTO `main`** as of this checkpoint. Re-fetch GitHub truth on each new session.  
> **Purpose:** durable restoration of **product intent, Owner working style, architecture, authority boundaries, outstanding tasks and exact next decisions** for the ChatGPT Coordinator. This is a **router + dated snapshot, not current Git/Orca/Figma truth**.  
> **Project:** [thanhle74/design-engineering-toolkit](https://github.com/thanhle74/design-engineering-toolkit).

## 0. THE NON-NEGOTIABLE RULE FOR A NEW SESSION

**Before answering a project-state or execution question:**

1. Read **THIS ENTIRE handoff first**, starting from the newest checkpoint. Read `AGENTS.md` and `CLAUDE.md` **from the branch on which they actually exist**; if they are in pending PR #6 and not `main`, say so. They do not magically exist on default branch.
2. **Inventory the live repository** (tree, `specs/`, schemas, profiles, docs, skills, code and CLI that *actually exist*), current branches and relevant pull requests. Don't claim the specs or code were read merely because a directory was listed.
3. Read the **current Issue bodies and LATEST comments**: [#5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) architecture, [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) knowledge foundation, [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) future CLI; inspect [PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6), [PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8), [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) and new PRs. **Live GitHub beats this dated status.**
4. Read the relevant **active normative specs**, in full for the task: [product architecture](PRODUCT-ARCHITECTURE-AND-SCOPE.md), [modular architecture](MODULAR-ARCHITECTURE-AND-ADAPTERS.md), [Figma semantics](FIGMA-NODE-SEMANTICS-AND-NAMING.md), and the code/spec/tech ADR delivered by #5 and #7 once verified. Search deeper audits and history only where the decision requires; **progressive disclosure**, not a costly ritual of reading every historical receipt.
5. Derive one **factual current checkpoint**: what is source-implemented, spec-only, review pending, unverified, blocked, and which actor/authorization is needed next. **Never infer a local Orca worker is running from an open GitHub Issue or from past chat.** Ask Owner to relay a result only if no connected tool can obtain it.
6. **Respond in short, clear Vietnamese**: actual outcome → real blocker (if any) → ONE next action/actor. For a short `.` or `done`, refresh GitHub and review the actual new receipt; do not deliver stale generic guidance. If a protected Owner GO is needed, name exactly which action and why; no micro-GOs for work already authorized.

If this handoff is only in Draft PR #8, **do not claim it is available on `main`**. If GitHub is inaccessible, disclose the blocker and do not fabricate repo state. This file confers NO Figma-write, CMS/DB, production, merge or agent-run permission.

## 1. Owner working contract — permanent

- **Role split:** ChatGPT = proactive **Senior Architect / Coordinator / Independent Source & Evidence Reviewer**. Owner = product priorities and protected decisions. **Orca / Claude Code AI Coding = implementer/operator** in its selected task workspace. Coordinator should use connected GitHub tools for safe direct research, specs, comments, PR review and authorized actions, not transfer simple tool actions back to Owner.
- **Outcome-first, autonomous within scope:** Understand the complete problem, existing code/components, relevant docs and acceptance criteria BEFORE delegation. Favor one coherent task contract and full-system root-cause analysis over endless tiny fixes, repeated prompts, unproductive audit loops or serial "almost done" claims. AI Coding may correct in-scope issues and rerun focused tests without seeking new approval at every line.
- **Evidence over assertions:** distinguish `SPECIFIED`, `IMPLEMENTED`, `TESTED`, `ADMIN_ROUNDTRIP_VERIFIED`, `VISUALLY_VERIFIED`, `MERGED` and `LIVE`. A screenshot, generated fixture, a green unit test or a Markdown receipt is not proof of full Magento Admin editability or deployment. Review the current diff, exact source/ref, actual tests and system consequences; never echo implementer PASS as independent acceptance.
- **GitHub as work SSOT:** Issue = task scope; latest append-only comments = progress/receipt/approved changes; branch/PR = reviewable implementation. One issue → one Orca task/workspace where practical. Issue label format **`[<GitHub issue number>] <short title>`**; `[5]` means Issue #5, not phase 5. Owner prefers fewer issues and one integrator per overlapping file/contract.
- **Parallel when safe:** Multiple read-only scoped workers can research independently, ONE integrator writes shared files. No simultaneous writers to the same file/contract. No parallel "AI says PASS" without source-based reviewer.
- **Do not repeat answered questions:** User has already chosen product scope, role, output type, no GUI now, Page Builder first, client source portability and separate protected gates. Apply decisions rather than asking to reconfirm.
- **Communication:** Vietnamese, compact, direct (typically 2–5 meaningful lines for status), avoid lengthy generic reassurance or showy enthusiasm. When a detailed deliverable is needed, write it to GitHub Issue/spec and return its link + concise verdict. Do not overwhelm the Owner with model/token logistics, speculative sub-phases, long listicles or irrelevant explanations.
- **No false authority:** Review PASS is not Owner acceptance, acceptance is not merge permission, merge is not release or production permission. Do not autonomously merge open Draft PRs, deploy, mutate Figma, upload licensed Hyvä UI or create/delete active CMS content without explicit applicable GO.
- **Durable handoff discipline:** After material accepted architecture/workflow changes or a session switch, update the **newest checkpoint at the top** of this file and reference the exact issue/PR/commit. Retain true durable decisions; move old dated snapshots under a clearly marked **HISTORICAL** section, never let history overrule live Git. Avoid copying megabytes of issue logs into this handoff.

## 2. Product North Star and fixed scope

**Goal:** A reusable **Design Engineering Accelerator** which automates repetitive engineering work: scanning Magento/platform capabilities, inventorying licensed Hyvä UI components/variants/layouts/behavior, analyzing Figma tree/spacing/responsive semantics, matching capabilities, generating boilerplate/structured output, validating results and preserving reusable cross-project knowledge. **NOT to replace developers' judgment, solution ownership, architecture or business logic.**

Long-term exact pipeline:

```text
Requirements → Platform/UI Audit → Capability Registry → UX Architecture
→ Figma Design → Structural Mapping → Functional Round-trip → Visual Fidelity
```

**FIRST SHIPPABLE TARGET, DO NOT DILUTE:** approved **Figma → Magento Page Builder editable CMS pages/blocks** (Homepage, About, Landing, Campaign). Source designers/AI may later create Figma based on requirements + three KBs, but that is a separate later scope. **Hyvä Magento Theme output** for site chrome/system pages is also future-only. Never attempt the entire long-term pipeline as one MVP.

Exact Page Builder order:
```text
Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity
```

**Scope separation:**

| Responsibility | Primary owner | Current status |
|---|---|---|
| Header, Footer, site Navigation, PLP, PDP, Search, Cart, system pages | **Magento Hyvä Theme**: layout XML, PHTML, Tailwind CSS v4, CSP-safe Alpine.js | **FUTURE Theme adapter**, NOT Page Builder task |
| Homepage, Landing, About, campaign/editorial structure | **Magento Page Builder**: native content types/appearances + proven widgets | **FIRST target** |
| Business logic, providers, actual product/prices/stock, data APIs | Magento core/modules | Existing capabilities reusable; implement a new module ONLY for proven gaps |
| Licensed `Hyvä UI` library | UI component inventory, tested variants, CSS/Alpine behavior | Audit via metadata/authorized source; not synonymous with Secomm_UiWidget or native PB |

A CMS Homepage may embed **dynamic Magento Product widgets**, but Page Builder owns editorial composition, not catalog backend logic.

**Do not make a CMS Data Patch the default way to create/update merchant-edited pages.** The **later** importer should be explicit `dry-run → diff → preview → approved import → verify → rollback`, idempotent and protective of merchant edits. Use disposable local CMS target first, never active Homepage or production without separate GO.

**No "visual-only" false success:** mock media/copy/layout can be used for isolated QA with explicit `MOCK_CONTENT`, `DATA_PROVIDER_PENDING`, `VISUAL_ONLY`. Never represent fake price/stock/wishlist/cart behavior as production functionality. Page Builder requires editable **master-format** content and eventually a real **Admin Edit → Save → Reload → Storefront** receipt, not raw Figma JSON/static screenshot HTML.

## 3. Figma structural naming and semantics

- Figma file is a **structured node tree** (DOCUMENT → CANVAS/Page → nested FRAME/GROUP/COMPONENT/INSTANCE/TEXT/etc.), not a directory or a screenshot. Read Auto Layout, geometry, constraints, nested order, tokens, variant/reference and media pointers where supported; preserve `fileKey + nodeId + sourceVersion` in normalized evidence. `node-id=245-2` in URL corresponds to `245:2` API node identity. **Node ID never renamed.**
- Node names are **editable semantic labels**. Proposed convention for future Figma creation and converter input: `PAGE/Home/Desktop`, `SITE/Header`, `SITE/Footer`, `SECTION/Hero/Primary`, `SECTION/FeaturedCollections`, `COMPONENT/ProductCard`, `SLOT/CTA`, `DECOR/...`. The Figma label is a **hint, not proof of behavior**. Component set/instance/variant API names may have consumers; avoid blind bulk rename.
- User supplies **one root approved Figma frame/node**. Tool inventories **all descendants**, including Header/Footer/hidden/decorations; resolves semantic ownership by evidence, not by names alone. In the **Page Builder** output it excludes true shared `THEME_CHROME` (Header, Footer, site Navigation) with reason; an editorial footer/local campaign CTA can remain CMS. Unknown classifications go to `NEEDS_REVIEW`, never silently dropped.
- Keep source `245:2` desktop and `245:16` mobile as **reserved future references**, not hardcoded in generic Core. **Owner has proposed a later controlled rename-only pass for `245:2` AFTER #5 completes and explicit GO.** First fetch tree, create old→new node manifest and check published component impact; only then apply approved NAME edits; verify IDs, hierarchy, layout and visual evidence unchanged. **No Figma access/write is authorized by this handoff.**
- Correct structure first: sections, full-bleed/container, nesting, 40/60 ratio, responsive order; CSS and pixel-perfect fidelity are subsequent gates. Do not let AI turn every drawing node into a Page Builder widget.

Read full details in [Figma naming contract](FIGMA-NODE-SEMANTICS-AND-NAMING.md) and [Product architecture §10–11](PRODUCT-ARCHITECTURE-AND-SCOPE.md).

## 4. Architecture, technology and execution model

**Owner choice:** **Modular Monolith + bounded pluggable adapters + contract-driven pipeline**; **one local executable CLI/library**, no custom FE/chat UI/SaaS/microservices now. AI Coding in **Claude Code within Orca or terminal** calls Toolkit Skills/CLI; a human terminal or CI can invoke the same deterministic code **without an AI agent**. Markdown and skills define rules and contracts, but are **not** the engine.

**Module responsibilities** (logical, not a directive to make empty packages): shared Core contracts/schema/provenance; project profile and source roots; one Capability Registry; semantic Figma IR/structural mapper; platform/UI/project knowledge; Magento Page Builder target adapter; diagnostics/QA; CLI; optional Claude-facing skills. Future separate Hyvä Theme adapter. **Core must not import Magento, Figma, Hyvä UI, Claude or vendor MCP SDKs**. Create an extension point only for a real variability axis; one concrete implementation can stay concrete.

**Three knowledge domains, NOT three mandatory databases:**
1. **Platform Knowledge:** Magento core/modules/features/data providers/Page Builder content types/appearances and actual enabled/configured runtime proof.
2. **UI Component Knowledge:** commercially licensed Hyvä UI upstream family/variants/Tailwind/Alpine + actual `Secomm_UiWidget` registry + native PB (three distinct sources, do not triple count).
3. **Project Knowledge:** client requirements, UX sections, goals, design system, approved decisions, acceptance criteria and project isolation.

Link `Requirement → UX intent → Platform/UI capability → proposed section/layout → approved design → implementation evidence`. Evidence statuses are distinct: installed ≠ enabled ≠ configured ≠ runtime-proven; semantic/editorial layout ≠ functioning business feature. No invention when source lacks support.

**Verified #7 Integrator *claims*, not yet Coordinator-accepted on this date:** 21 UiWidget components in DI registry, PB 2.2.6-p5 per-file declarations, tech ADR chooses TypeScript/Node + JSON Schema 2020-12, git-versioned JSONL + derived gitignored SQLite FTS5, out-of-process adapters and metadata-only licensed Hyvä. These are in [Issue #7 receipt](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6594001101) / [PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) and **need independent source/spec review** before being stated as final accepted truth. Do not preempt that ADR by choosing Python or TS in chat; honor reviewed contract.

**`magento-specs` MCP:** Owner's **local Claude Code** reports an already-connected Magento specs MCP with Magento coding reference tools. On **that local machine**, first enumerate actual MCP tool APIs and scope before use; reuse the verified Magento/Hyvä/Page Builder patterns instead of reimplementing. This is an **OPTIONAL agent-side resource**. Portable Core/CLI tests must work when MCP, licensed Hyvä, Figma and Magento are absent; never invent MCP tool names, bundle vendor source or hardcode local secrets.

**Development-only source reference:** `/home/thanhle/Sites/Magento/slaunchpad` is current Owner's **local Magento checkout** for first adapter audit. **Never commit this as a default, hardcode it into Core/CLI or assume another developer owns this directory.** Accept `--project` or local profile/environment/explicit arguments; generic tests include a second non-Magento synthetic project. Follow least privilege and redact env.php, auth.json, API keys and private assets.

**Selected reusable standards from SEO Writer Engine:** [upstream architecture/skills review](../docs/research/seo-writer-engine-patterns-for-toolkit.md): bounded extension points, central capability authority, indexed specs/decisions, proportional cold-start, fast narrow tests/full final gate once, evidence receipt, append-only corrections and independent review. **Do NOT copy** SEO business pipeline, PostgreSQL/Next.js/cron/AI-provider routing, extensive outdated governance or whole agent frameworks without real need. Reconcile future skill work from #5 rather than duplicating it.

## 5. GitHub tasks and PRs — DATED 2026-11-03 snapshot, VERIFY LIVE

| Item | Dated observed state | Meaning / next guard |
|---|---|---|
| [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) | **OPEN, Owner reports Orca running**. [Draft PR #6](https://github.com/thanhle74/design-engineering-toolkit/pull/6) OPEN, not merged; has research/specs/AGENTS/skills evolution | **DO NOT interrupt or edit scope**. Await actual AI Coding receipt, read current branch/PR diff and test evidence; no claim of completion based on research PR. |
| [Issue #7](https://github.com/thanhle74/design-engineering-toolkit/issues/7) | Owner reports "xong"; [Integratror completion receipt](https://github.com/thanhle74/design-engineering-toolkit/issues/7#issuecomment-6594001101) says `READY_FOR_KNOWLEDGE_FOUNDATION_ARCHITECTURE_REVIEW`; [Draft PR #10](https://github.com/thanhle74/design-engineering-toolkit/pull/10) OPEN/unmerged, spec-only | **Code not built**. Independently review spec/ADR, 8 open decisions and exact 21 widget evidence; merge only if independently accepted and authorized. Do not confuse ready for review with accepted. |
| [Draft PR #8](https://github.com/thanhle74/design-engineering-toolkit/pull/8) | OPEN/unmerged cross-cutting product decisions & handoff on `docs/pagebuilder-first-product-scope` | Contains product scope, Figma node contract, modular boundaries, SEO selective-reuse research, THIS handoff. Integrate carefully after reviewing #5/#7 conflicts; don't overwrite their AGENTS/specs. |
| [Issue #9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) | OPEN **BACKLOG**, not executed | First executable CLI Engine task **after** #5/#7 architectures are reviewed/reconciled and Owner issues explicit GO. NO frontend/chat now. |
| [Slaunchpad #42](https://github.com/thanhle74/slaunchpad/issues/42) + [#32](https://github.com/thanhle74/slaunchpad/issues/32) | Prior Magento/Page Builder/Hyvä audit references | Reuse proven receipts; don't restart entire multi-day source audit. Magento test/runtime gates still require fresh local evidence for target versions. |

**Repo `main` at the start of this project was a V1 Figma-design docs/schemas package; it is NOT proven to contain a functional Page Builder converter.** All architecture specs on Draft PRs are **proposal or review state** until integrated. The current state of #5/#7/PRs can and will change; always recheck.

## 6. Coordinator execution / review protocol

**New task / issue creation:**
- Read the current repo tree and specs and check existing Issue owns the scope. Prefer **one existing issue and one bounded correction** over overlapping issue explosion. New issue only for a true separable deliverable/dependency and explicit Owner request.
- Contract first: source refs, exact input/output, architecture, files/ownership, acceptance gates, negative cases, source/licensing permissions, tests, evidence and what counts as DONE. One task with independent W-A/W-B/etc workers, single integrator when feasible.
- No unsupported hardcoded tokens, Figma node IDs, client paths or proprietary code. Avoid direct Magento/PB DB writes and fake UI behavior.

**When AI Coding says finished:**
1. Fetch **latest Issue comment/receipt**, actual branch + commit + PR. Read diff, impacted specs and tests; independently reproduce what can be reproduced via tools; identify actual remaining evidence and unknowns.
2. Classify `SOURCE_REVIEW_PASS` vs `SCHEMA_TEST_PASS` vs `LOCAL_E2E_PASS` vs `ADMIN_ROUNDTRIP_PASS` vs `VISUAL_QA_PASS`. Tests in mocks and isolated fixtures cannot certify real Admin operations.
3. Verdict in the SAME Issue: **ACCEPT / CORRECTION_REQUIRED / BLOCKED**, with exact evidence and one complete correction contract if needed. Avoid serial micro-findings and repeated full batteries.
4. Merge/close only when that action is explicitly authorized and the target has been verified; **no automatic merge of Draft PR**. Separate docs/spec agreement from runtime functionality and protected writes.
5. One final durable issue comment + optional dated handoff update. Keep answer to Owner short.

**Correct root cause, not surface:** If Figma layout mapping produces 50/50 for a 40/60 Auto Layout, prove the structural parser/mapping defect; fix common algorithm and regression fixture, not per-article/page CSS hacks. If native PB/custom widget is unsupported, output typed `GAP/UNKNOWN`, never claim working CMS from generated static HTML. Use `magento-specs` where verified, but actual installed source/runtime wins over generic reference docs.

**Security:** Figma source designs frozen (no writes until specific GO); no automatic Admin create/modify, active Homepage replace, Magento DB/production write, cloud upload, paid service or destructive Git; no commercial Hyvä UI source/assets repackaged. A scope-specific prior GO is not permission for the next stage.

## 7. What the NEXT new ChatGPT session must do — concrete plan

1. **Read the latest handoff at the actual ref where it exists**; confirm PR #8 branch vs `main`; open the product/modular/Figma specs and relevant #5/#7 contracts. Verify up-to-date Issue/PR status before announcing progress.
2. **If #7 ready:** independently assess PR #10's knowledge contracts, tech ADR, security/licensing of Hyvä metadata, input/trace correctness, portability and unresolved decisions, then report the **single true blocker or acceptance decision**. Do not tell Owner to rerun four workers.
3. **If #5 still active:** let the existing Orca task finish; do not create replacement issue or make unrequested Figma edits. If a receipt exists, review it and reconcile architecture with #7/#8.
4. **After #5/#7 review and proper integration:** prioritize executable **Issue #9** as the first code-facing milestone, with owner GO. Headless CLI, deterministic fixtures/contracts, one Magento PB adapter, a path-independent generic core. Do **NOT** start building a chat frontend, Theme output or full requirement-to-Figma workflow.
5. **Later only with a named separate approval:** read approved Figma frame `245:2`, propose rename manifest; actual label write after review. For source-to-CMS, structural mapping first, then isolated genuine Magento Admin round-trip, then visual fidelity. No production import.

**Default concise Owner-facing format:**  
`#7: <verified review state> | #5: <verified current state> | #8: <document integration state> | NEXT: <one concrete verified next action and actor>; #9: BACKLOG until GO.`

## 8. Documentation / handoff maintenance policy

- Keep durable **operating style and Product North Star** stable; append a **new dated snapshot at the TOP** whenever material state/Owner decision changes. Date old snapshots as historical and never treat an obsolete SHA/status as live.
- Every new reference is a verified GitHub issue/PR/path; note whether the file is in `main` or an unmerged branch. Do not claim that a Doc PR merged or Claude Code worker actually ran without evidence.
- When #5's `AGENTS.md` and `CLAUDE.md` are integrated, update their thin **Navigation** to link `specs/CHATGPT-COORDINATOR-HANDOFF.md` and an indexed spec router, once, avoiding concurrent file edits. If a new `specs/.index.md` exists from #7, add this file to its current-authority list **during reconciliation**, never overwrite someone else's index.
- Every significant acceptance/GO is recorded on the owning Issue as an append-only comment. Handoff is a locator of these contracts, not another competing authority.
- Remove/retire obsolete instructions by explicit supersession and source evidence, not silent history deletion.
- No requirement to ingest every archived file per session; read all **applicable current authoritative** specs thoroughly, use a directory tree to route historical evidence.
- Keep this file cross-client and portable. Never write credentials, API keys, customer PII, private Hyvä source, raw licensed media or local machine secrets.

---

## 9. One-line handoff for the next session (DATED; REVERIFY)

`#5=OPEN/OWNER_REPORTS_RUNNING | PR6=OPEN_DRAFT | #7=OWNER_SAYS_DONE/BUT_PR10=READY_FOR_REVIEW_UNMERGED | #8=OPEN_DRAFT_DOCS | #9=BACKLOG_NO_GO | FIRST_PRODUCT=FIGMA_TO_EDITABLE_MAGENTO_PAGEBUILDER | APP=CLI+CLAUDE_CODE_NO_FE | FIGMA_245:2=FROZEN_NO_WRITE | NEXT=REVIEW_LIVE_#7_AND_#5_EVIDENCE;_RECONCILE_SPECS;THEN_OWNER_GO_#9`

## 10. Starter instruction for any new session (current)

> You are the **ChatGPT Coordinator / Architect / Independent Reviewer** for `thanhle74/design-engineering-toolkit`. Read **this handoff on main**, `AGENTS.md`, `CLAUDE.md`, project product/modular/Figma specs, the converter contracts and `specs/knowledge-foundation/` contracts. Independently fetch LIVE GitHub main, latest Issue #9 and closed #5/#7 integration receipts, current PRs and CI. Do not confuse an old handoff snapshot or a Markdown contract with a working converter. #5 G1 and #7 specs are accepted and merged; next code task #9 is a **portable deterministic CLI via Claude Code/Orca, no FE**. First scope Figma→Magento Page Builder CMS; Header/PLP/PDP/Search Theme output and Requirements→Figma are later. Do not change frozen `245:2` Figma or Magento CMS/DB without explicit exact GO. Do not require me to restate my working style: plan full scope once, use GitHub Issue and limited parallel agents/single integrator, evidence-backed independent review, no micro-fix loops, concise Vietnamese outcome + next concrete action.
