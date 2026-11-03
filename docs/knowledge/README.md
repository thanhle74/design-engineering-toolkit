# Knowledge Engine (`det kb`) — usage, store layout and safety

The Knowledge Engine (issue [#15](https://github.com/thanhle74/design-engineering-toolkit/issues/15))
turns source-backed audits into **reusable, evidence-carrying knowledge** across three logical
domains — one physical format:

| KB | Question | Store partition |
|---|---|---|
| **KB-1 Platform** | WHAT THE SYSTEM CAN DO | `kb/platform/records.jsonl` |
| **KB-2 UI** | WHAT CAN BE COMPOSED (Hyvä UI / imported widgets / PB native — three distinct sources) | `kb/ui/records.jsonl` |
| **KB-3 Project** | WHAT THIS CLIENT NEEDS & APPROVED (tenant-isolated) | `kb/project/<projectId>/records.jsonl` |
| relations | typed cross-KB edges (first-class records) | `kb/relations/records.jsonl` |

Contracts: [`schemas/kb/`](../../schemas/kb/README.md) (frozen major 1 from the reviewed #7
drafts). Spec lineage: [`specs/knowledge-foundation/`](../../specs/knowledge-foundation/README.md).

## Commands (read-only core; nothing is written without `--out`)

```bash
npm run build   # once per checkout

# 1. Deterministic ingest from a manifest (the ONLY way records enter a store)
node bin/det.js kb ingest --manifest examples/kb/manifest.json \
  --root reg="$(pwd)/tests/fixtures/synthetic-magento-like" \
  --json                          # report only (no-write default)
node bin/det.js kb ingest --manifest examples/kb/manifest.json \
  --root reg="$HOME/your/magento-checkout-audit" --out kb    # regenerate the store

# 2. Digest-driven sync: changed sources mark their pinned records STALE (never upgrades)
node bin/det.js kb sync --store kb --manifest examples/kb/manifest.json \
  --root reg=... --out kb         # writes only when something went stale

# 3. Deterministic structured query — provenance on every hit, KB-3 default-deny
node bin/det.js kb query --store kb --kb platform --where category=content --text banner --json
node bin/det.js kb query --store kb --kb ui --where sourcePackage.kind=hyva-ui --text hero --json
node bin/det.js kb query --store kb --kb relations --edge-type constrains \
  --related-to uxi:synthetic-fashion:homepage-hero --json
node bin/det.js kb query --store kb --kb project --project synthetic-fashion \
  --where recordType=constraint --json

# 4. Store validation: schemas, graph integrity, project isolation, descriptor honesty
node bin/det.js kb validate --store kb --json
```

Exit codes are the contract: `0` ok · `1` blocking diagnostics · `2` usage error · `3` unused by
`kb` (no adapters). Parse `--json` output (`{"run": <tool-run envelope>, "output": …}`), not the
human summary; act on diagnostic codes (`DENIED_PATH_SKIPPED`, `INGEST_PARTIAL_DENIAL`,
`DANGLING_RELATION_ENDPOINT`, `CLASS_BOUNDARY_EDGE_FORBIDDEN`, `PROJECT_SCOPE_REQUIRED`,
`SOURCE_DIGEST_CHANGED`, `SECRET_PATTERN_DETECTED`, `LICENSED_FIELD_TOO_LARGE`, …).

## The three acceptance queries (reproducible)

1. *"What registered banner components can this Magento Page Builder project use?"* → KB-1 query
   (Q1 above): exact banner capabilities with enablement, evidence locators and uncertainty.
2. *"Which Hyvä UI hero variants exist locally and what evidence/source points to them?"* → KB-2
   query (Q2): variants, `license.regime=commercial`, `derivedArtifactPolicy=metadata-only`,
   `behavior.cmsEditable=false` — visual resemblance never implies editability.
3. *"Which project requirement/decision constrains the selected hero?"* → relation traversal (Q3)
   + KB-3 query (Q3b): the `constrains` edge resolves to the invariant licensing constraint.

## Honesty rules encoded in the engine

- **Installed ≠ enabled ≠ configured ≠ runtime verified.** The #9 registry bridge maps converter
  `discovered/registered` (declaration inspection) to KB `DETECTED` — never `TESTED`. Later-stage
  claims in a declaration-only registry fail closed (`BRIDGE_PROOF_LEVEL_UNSUPPORTED`).
- **No false equivalence.** `mapsTo`/`adaptedFrom`/`equivalentOf` connect developer-owned UI
  records only; Page Builder native ↔ developer-owned is `neighborOf` — enforced
  (`CLASS_BOUNDARY_EDGE_FORBIDDEN`), same-appearance/different-editability is data, not inference.
- **Digest-pinned staleness.** Every record pins `observed.inputDigests`; `det kb sync` marks
  dependents `STALE` when a source changes or disappears and never silently upgrades; queries
  exclude `STALE`/`INVALIDATED`/`ARCHIVED` unless explicitly included.
- **Default-deny project scope.** KB-3 queries without `--project` fail; records from another
  project never surface; partitions are per-project and validate flags misplaced records.
- **Structural deny-list before any read.** Baseline: `auth.json`, `app/etc/env.php`, `.env*`,
  `*credentials*`, `*.pem`, `*.key`, `var/**`, `generated/**`, `pub/media/**`, `*.sql.gz`,
  `*.dump*`, `**/node_modules/**`; manifests may add globs, never remove. Partial denials refuse
  to regenerate a store (no silent record loss); an all-denied run is an error.
- **Metadata-only for licensed packages.** No source/template/asset fields exist in the schema;
  oversized free text on commercial records is rejected (`LICENSED_FIELD_TOO_LARGE`); a secret
  pattern guard rejects credential-shaped values (`SECRET_PATTERN_DETECTED`).
- **Explicit paths only.** Manifest inputs are alias-relative (`--root alias=path` >
  `DET_KB_ROOT_<ALIAS>`) or manifest-relative; realpath containment; no default owner path ever.

## What this MVP deliberately does NOT do

No SQLite FTS5 index yet (deferred until structured-filter misses are measured — TECH-ADR
`OPEN_DECISION` #4/#1), no vector/semantic retrieval, no LLM ingestion, no MCP dependency, no
live commercial-source audit (`SYNTHETIC_KB_MVP_PASS` only — live Hyvä/Magento/client-doc
ingestion is a separately gated M4 with exact Owner GO), no Figma reads, no CMS/DB writes.
Local protected corpora: point `--store` at a gitignored user-configured directory; they never
enter this repository.
