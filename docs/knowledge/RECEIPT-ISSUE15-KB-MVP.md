# Integrator receipt — Issue #15 Knowledge Engine MVP

**Status:** `SYNTHETIC_KB_MVP_IMPLEMENTED` — implementer receipt awaiting independent
Coordinator review. This is **not** a live-source audit (`SYNTHETIC_KB_MVP_PASS` ≠ licensed/live
Hyvä/Magento/client-doc ingestion; M4 stays gated), not a Figma/CMS change, and not merge
authorization.

| | |
|---|---|
| Issue | [#15 — Reusable Magento + Hyvä UI + Project knowledge ingestion, index & query](https://github.com/thanhle74/design-engineering-toolkit/issues/15) |
| Base | `main` @ `f44dcdc8487551e1f0a0cc6fe1a8fa2ef7064e56` (= `origin/main` at start, clean) |
| Implementation tip | `ec9a7025fa67b1f8e674f990adae0b023767c4e8` |
| Receipt commit | this commit (docs/skill additions only after the implementation tip) |
| Gate | `npm test` = tsc strict build + **78/78 checks** (51 unchanged from #9: G1 suite, CLI T-15…T-22; + 27 KB checks KB-01…KB-27) |
| PR | Draft PR linked from issue #15 by the integrator; normal merge only, no auto-merge |
| Concurrency | #14 (`NodeIR`/`PageStructure`) untouched — zero edits outside KB-owned paths plus the shared-cli additive extension points |

## Scope delivered (issue contract, point by point)

1. **Three logical domains, one engine** — `kb/platform`, `kb/ui`, `kb/project/<projectId>`,
   `kb/relations` (JSONL, one canonical record per line, id-sorted). Editability is data
   (`behavior.cmsEditable`, `availability.state`); cross-class Page Builder ↔ developer-owned
   references are `neighborOf`, and `mapsTo`/`adaptedFrom`/`equivalentOf` across the class
   boundary are **engine-rejected** (`CLASS_BOUNDARY_EDGE_FORBIDDEN`, KB-11).
2. **Source-backed, revision-pinned** — typed record envelopes (schemas/kb, Draft 2020-12,
   `additionalProperties:false`, integer-major): stable version-free IDs + verbatim `nativeId`,
   `sourceRef` (rootAlias-relative locators), `proofLevel` DETECTED/ASSUMED/TESTED/UNKNOWN,
   per-record `evidence.uncertainty` (mandatory), lifecycle + review status. Unsupported claims
   fail closed (KB-12 licensed field, KB-14 secret pattern, `BRIDGE_PROOF_LEVEL_UNSUPPORTED`).
3. **Deterministic ingest/sync** — manifest-driven (`kb-ingest-manifest` schema; plans are data):
   explicit read-only bridge from the #9 `CapabilityRegistry` → KB-1 with documented mapping
   tables (below); KB-2 metadata-only inventory; KB-3 synthetic records; relations. Baseline
   deny-list + manifest globs evaluated before any read; root aliases resolve `--root` > env;
   realpath containment. Digest-pinned `observed.inputDigests`; `det kb sync` marks dependents
   STALE and never upgrades (KB-17/KB-22). Denials: per-file skip + per-run fail-closed
   (KB-08); partial denial refuses to regenerate a store (KB-09).
4. **Store and query** — git-versioned JSONL; the committed `kb/` store is public synthetic
   examples only (37 records, incl. a non-Magento neutrality twin project). `det kb
   ingest|sync|query|validate` with `--json`, no-write defaults. Structured exact filters
   (whitelisted keys; unknown key = blocking diagnostic), relation traversal
   (`--edge-type`/`--related-to`), exact proof filter (`--require-proof`), deterministic result
   order. Engine artifact payloads validate against the `kb-engine-output` envelope (schemaRef honesty; KB-27). SQLite FTS5 deliberately deferred (TECH-ADR OPEN_DECISION #1/#4: adopt only on
   measured structured-miss evidence) — no vector DB, SaaS, daemon, MCP, GUI, LLM ingestion.
5. **Usability proof** — the three issue queries run end-to-end (see below); every hit carries
   provenance, license boundary and uncertainty; nothing claims runtime/admin verification.
6. **Regression and isolation** — `tests/fixtures/kb/` covers same-appearance/different-editability
   (neighborOf pair), disabled module (enablement `disabled`), unknown behavior (enablement
   `unknown`), stale digest (KB-17), cross-project record (KB-16), dangling relation (KB-10),
   licensed-code marker (KB-07/KB-12), secret markers (KB-07/KB-14). 77/77 locally; CI runs the
   same gate on every push. #14 files untouched.

## Explicit mapping tables (registry → KB-1 bridge)

| Registry field | KB-1 record | Notes |
|---|---|---|
| `category` native/widget/chrome | `content`/`content`/`layout` | `custom-required`/`unsupported` are converter-need classifications → skipped with `BRIDGE_CATEGORY_SKIPPED` summary (gaps belong to planning, not KB-1) |
| `category` | `origin` native/widget→`custom`/chrome→`native` | |
| `proofLevel` discovered/registered/structurally-mapped | `DETECTED` | CONTRACTS §2.2.1: declaration-inspection levels |
| `proofLevel` not-verified | `UNKNOWN` | |
| `proofLevel` admin-roundtrip-verified / visually-verified | **refused** | `BRIDGE_PROOF_LEVEL_UNSUPPORTED` — a G1-ceiling registry can never justify TESTED |
| `availability` enabled/disabled/unknown | `enablement` enabled/disabled/unknown + source `config-scan`/`declaration` | config.php proves file state only |
| evidence `source://<alias>/<path>#…` | `sourceRef` repo-file `{rootAlias, path}` | alias stays portable; digest pinned on the registry INPUT (the only thing the bridge reads) |

## Reproducible acceptance evidence (run at the implementation tip)

```bash
npm run build
node bin/det.js kb validate --store kb            # exit 0 — 37 records, 0 errors
# Q1 — "What registered banner components can this Magento Page Builder project use?"
node bin/det.js kb query --store kb --kb platform --where category=content --text banner --json
#   → 4 hits (cap:example-customwidgets:component-banner-a, cap:example-customwidgets:custombanner,
#     cap:magento-pagebuilder:banner-full-width, cap:magento-pagebuilder:banner-minimal),
#     each with proofLevel DETECTED, enablement {state:enabled, source:config-scan},
#     ≥1 uncertainty string, file/line store location.
# Q2 — "Which Hyvä UI hero variants exist locally and what evidence/source points to them?"
node bin/det.js kb query --store kb --kb ui --where sourcePackage.kind=hyva-ui --text hero --json
#   → uic:hyva-ui:hero, variants [A-default, B-overlay], license {regime:commercial,
#     derivedArtifactPolicy:metadata-only}, behavior.cmsEditable=false, DETECTED + uncertainty.
# Q3 — "Which project requirement/decision constrains the selected hero?"
node bin/det.js kb query --store kb --kb relations --edge-type constrains \
  --related-to uxi:synthetic-fashion:homepage-hero --json
#   → rel:synthetic-fashion:constrain-hero-license (from con:synthetic-fashion:licensed-ui-no-embed,
#     projectId synthetic-fashion); the constraint itself: strength invariant, enforcement fail-closed.
```

Determinism: two fresh ingests produce identical `kb-records` `volatileContentHash` (KB-03); the
committed store equals a fresh ingest modulo observation timestamps (KB-04); identical queries
produce identical JSON (KB-20).

## Honest limits / unknowns

- Local-config file for root aliases (the third portability lane: CLI > env > gitignored config)
  is not implemented — CLI + env only, with clear `ROOT_ALIAS_NOT_RESOLVED` failure. Planned with
  the M4 real-source adapters.
- No SQLite FTS5 index in this MVP (deliberate, evidenced above). `--text` is a deterministic
  substring filter, not FTS.
- Licensing separation here is structural (schema + size caps + deny-paths + secret guard); the
  byte-level licensed-source assertion is the M4 gate against an authorized local package.
- `docs/knowledge/RECEIPT-ISSUE15-KB-MVP.md` records CI evidence as run links; the receipt does
  not self-claim CI status before the run exists.
- `attested` approval in the KB-3 example fixture is synthetic teaching data only — it satisfies
  no gate.

## Protected boundaries observed

No Figma access (including read tools), no Magento CMS/DB/config writes, no licensed Hyvä source
bytes in the repo (metadata pointers only), no live-source reads, no auto-merge, #14 paths
untouched, no force pushes.
