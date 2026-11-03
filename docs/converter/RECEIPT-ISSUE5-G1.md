# [5] Integrator receipt — G1 architecture pass (BASE→TIP)

**Date:** 2026-11-03 · **Executor:** one [5] Integrator (single writer) after four parallel read-only workers (W-A/B/C/D).
**BASE:** `82c9129` (main) → branch base `7c1508b` (PR #6 research content, stacked) → **TIP:** this branch `thanhle74/5-architecture-reusable-figma-pagebuilder-conver`.
**Spec:** [`specs/ISSUE-5-converter-architecture.md`](../../specs/ISSUE-5-converter-architecture.md) — status now **INTEGRATED_FOR_G1_REVIEW**.
**Exit target:** `READY_FOR_COORDINATOR_ARCHITECTURE_REVIEW` (this receipt + draft PR = the evidence package; the Coordinator/Owner decides GO).

## 1. What ran (exactly)

- **[5] W-A — OSS & agent skills:** 13 candidates verified live (GitHub API + raw files + Adobe docs). All PROPOSED decisions survive; 6 corrections applied (see §4). Receipt: `/tmp/issue5-worker-receipts/W-A-oss-skills.md` (session-local; distilled into the two research docs).
- **[5] W-B — Magento/Hyvä capability audit:** read-only inspection of the caller-supplied checkout at revision `66aff1eb` (Magento CE 2.4.8-p5): 20 PB content types / 33 appearances enumerated from `content_type/*.xml`; `Secomm_UiWidget` registry verified **21/21 B1 IDs** in `etc/di.xml` (B2 = 0/11, matching the approved Phase-1 boundary); master-format = HTML with `data-content-type`/`data-appearance`; payload codec caps 16 KiB/depth 6/50 items; Tailwind v4 CSS-first + Alpine v3 confirmed; chrome inventory separated. Receipt distilled into [`docs/converter/CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md); machine-readable payload transformed into [`examples/converter/capability-registry.magento-pagebuilder.example.json`](../../examples/converter/capability-registry.magento-pagebuilder.example.json) (61 capabilities, 114 evidence locators).
- **[5] W-C — core contracts:** full contract design (materialization decisions, 33-code diagnostic taxonomy, proof-ladder evidence rules, 14-case test plan, synthetic second platform). Receipt distilled into [`schemas/converter/README.md`](../../schemas/converter/README.md) + [`docs/converter/CONTRACTS.md`](CONTRACTS.md) + the test suite itself.
- **[5] W-D — repository hygiene:** 44-file inventory at `7c1508b`; grep scans (hardcoded paths / Figma IDs / platform terms in schemas) all PASS; 7 stale-doc findings; **0 removal candidates**; NO DELETE list. Distilled into the [hygiene baseline addendum](REPO-HYGIENE-BASELINE.md); all doc fixes applied (see §4).
- **Test gate (run on TIP):** `npm test` → **30/30 checks PASSED** (ajv Draft 2020-12, Node 24; schema compile of both families; T-01..T-14 negative plan incl. determinism + neutrality guard; V1 family regression). No other code was executed; no Figma call, no Magento runtime command, no DB/CMS write, no CSS.

## 2. Files (TIP delta on top of PR #6 base)

| Area | Files |
|---|---|
| Schemas (new family) | `schemas/converter/{common.defs.json, capability-registry.schema.json, component-binding-map.schema.json, resolution-report.schema.json, converter-profile.schema.json, README.md}` |
| Contract reference | `docs/converter/CONTRACTS.md` (DesignSourcePort interface; NodeIR + PageStructure field drafts; G1 harness shape; compatibility rules) |
| Capability inventory | `docs/converter/CAPABILITY-MATRIX.md` + `examples/converter/capability-registry.magento-pagebuilder.example.json` + `examples/converter/resolution-report.synthetic-flatcms.example.json` |
| Tests | `tests/run-all.mjs`, `tests/lib/{canonical,resolver,semantic,preflight}.mjs`, `tests/fixtures/synthetic-flatcms/{registry,bindings,structure}.fixture.json`, `tests/fixtures/negative/*.fixture.json` (13), `package.json` + lockfile (ajv devDependency only) |
| CI | `.github/workflows/validate.yml` (ADR-005-015) |
| Doc updates | `specs/ISSUE-5-converter-architecture.md` (status + §3 alignment), `schemas/README.md`, `README.md`, `AGENTS.md`, `docs/converter/DECISIONS.md` (table fix + ADR-005-011..016), `docs/converter/REPO-HYGIENE-BASELINE.md` (TIP addendum), `docs/ARCHITECTURE.md` (status line), `docs/safety-and-scope.md`, pilot parentheticals, both `docs/research/*.md` (verified corrections), `schemas/project-profile.schema.json` ($comment generalization), `.gitignore` |

**No file was deleted.** V1 pilot evidence, schemas, examples and docs all KEEP (hygiene addendum §NO DELETE).

## 3. Architecture reconciliation decisions (worker conflicts → one SSOT)

1. **Schema family split** (W-C proposal, adopted): `schemas/converter/` with own major; V1 frozen (ADR-005-011). Rationale: converter evidence is scheme-based, V1 `sourceRef` is Figma-typed.
2. **Coverage vocabulary**: spec §3 `custom` → `custom-required` everywhere (one enum).
3. **Capability ids keep platform spelling** (underscores allowed) — traceability beats renaming (`column_group`, `accordion_a` are real ids from W-B evidence). Integrator decision on top of W-C's stricter pattern; recorded in the family README.
4. **Nesting rules support policies** (`allow-all`/`deny-all` + `except`) — W-B source evidence shows real registries declare policies; pure allow-lists would be dishonest (ADR-005-012).
5. **Prop names carry payload paths** (`items[].title`) — faithful field paths from the widget schema-registry evidence.
6. **NodeIR/PageStructure deferred to G2**, `DesignSourcePort` stays interface-only (ADR-005-013) — materializing them now would freeze unvalidated guesses.
7. **CI now**, orchestrator later (ADR-005-015) — machine-checks what V1 docs had deferred to P1; no new runtime dependency.

## 4. Verified corrections applied (from worker receipts)

**W-A → research docs:** FigmaToCode has **five** stages (Read→Normalize→Optimize→Generate→**Explain**, incl. machine-readable conversion warnings; no tags — pin SHAs). `commerce-docs/pagebuilder-examples` license **escalated to proprietary** (Magento Customer Agreement) — read-only catalogue, no code copying (ADR-005-014); repo stale (2024-06). mage-os repo canonical org is `mage-os/…` (lab URL redirects). awesome-copilot items are `skills/` entries (no `collections/` dir), per-file provenance unvetted. anthropics/skills: per-skill licensing (skill-creator = Apache-2.0; document skills source-available). code-connect date pinned exactly (parsers unsupported from **2026-08-17**, CHANGELOG v1.5.0). cloudflare verdict taxonomy (`confirmed/needs_validation/rejected`) borrowed as method. **Zero code vendored; no new runtime dependency.**
**W-B → capability matrix:** hypothesis list validated (15/15 present) + **5 structural types the hypothesis missed** (`slide`, `button-item`, `column-line`, `tab-item`, `column-group`); 21/21 B1 widget IDs verified; B2 0/11; master format confirmed HTML-with-data-attributes; codec caps; 9 NOT_VERIFIED items recorded honestly (§6 of the matrix).
**W-D → hygiene:** findings F1–F7 all applied or explicitly dispositioned (table in the baseline addendum); pilot gate labels preserved verbatim; nothing deleted.

## 5. Test evidence (what actually ran)

`npm test` on TIP — **30/30 PASS**:
- Schema: synthetic registry valid + corrupted twin fails with precise paths; 3× wrong-`schemaVersion` rejected; Magento example (61 caps) valid; binding map valid; both converter profiles valid; committed resolution-report example valid + byte-equal to a fresh resolver run.
- Semantics: T-01 unknown capability → `UNSUPPORTED_CAPABILITY` + blocked; T-02 → `UNSUPPORTED_APPEARANCE`; T-03 → `VARIANT_NOT_MAPPED`, zero synthesized coverage; T-04 → `INCOMPATIBLE_NESTING`; T-05a/b → `AMBIGUOUS_BINDING`/`DUPLICATE_BINDING`; T-11 tampered summary caught; T-12/T-12b proof overclaims hard-rejected; T-13 disabled target → `CAPABILITY_DISABLED`.
- Preflight: T-06a–e (placeholder sentinel / not found / unreadable / empty sources / adapter mismatch).
- T-08 determinism (shuffled sorted arrays → identical hash), T-08b canonical serialization, T-09 neutrality guard (0 platform literals/paths/Figma ids across `schemas/**` + synthetic fixtures; V1 scanned separately), T-14 both families independent (V1 examples + profiles still validate).

## 6. Limitations & honest scope

- The resolver in `tests/lib/resolver.mjs` is a **test-gate harness** (negative-case engine over fixtures), not the production G2 resolver; `structure.fixture.json` is a documented harness shape, not `PageStructure`.
- Nothing in this pass proves G2–G4: no NodeIR extraction, no Admin round-trip, no visual parity. All proof stays ≤ `REGISTERED` per the ladder.
- W-B/W-A NOT_VERIFIED lists are carried forward (matrix §6; W-A receipt §5) — e.g. Google Maps key, active Alpine build variant, Magewire contradiction (docs claim 1.13; no package in `composer.lock`), widget placement rules.
- `docs/ARCHITECTURE.md` body remains the historical V1 SSOT (status header updated only); formal supersession is a future, explicit act.
- `profiles/commerce-promotional.example.json` keeps its baseline-era real fileKey (read-only archive reference) — flagged for Owner judgment, not changed.
- CI runs on GitHub-hosted runners only when pushed; local evidence here = the 30/30 run recorded above.

## 7. Stage-2 (Structural Mapping) readiness — **NO-GO by default**

Everything needed to *start* G2 safely is in place: gated fixture references (`245:2` / `245:16`) remain frozen; NodeIR/PageStructure field drafts exist; binding map + registry + report semantics are tested. **But G2 requires its own explicit GO** (spec §1; ADR-005-003) — no design-source access happened in this pass, and none is implied. Recommended pre-G2 checklist for the Coordinator: (1) confirm G2 GO + scope; (2) resolve the Magewire contradiction and Maps-key question during adapter work; (3) keep the Figma read strictly read-only via the official MCP, with `figma-structural-extraction` skill built at that point (ADR-005-016).

**Exit status: `READY_FOR_COORDINATOR_ARCHITECTURE_REVIEW`.** Stages 2–4 remain **HOLD**. PR stays draft; no auto-merge.
