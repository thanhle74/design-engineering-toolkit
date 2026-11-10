# Knowledge Engine (`det kb`) — usage, store layout and safety

> M4 (issue #19) added the read-only source-extract lane: `det kb extract` + the
> `magento-kb-source` scanner adapter. Integrator receipt with real-run evidence:
> [RECEIPT-ISSUE19-M4.md](RECEIPT-ISSUE19-M4.md). Integrated onto current main as a normal merge
> under issue [#44](https://github.com/thanhle74/design-engineering-toolkit/issues/44) — conflict
> ledger and main-integration receipts:
> [RECEIPT-ISSUE44-M4-INTEGRATION.md](RECEIPT-ISSUE44-M4-INTEGRATION.md).

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

# 5. Read-only source extract (M4): plan-driven out-of-process scans → KB-record files for ingest
#    The plan (kb-extract-manifest) declares alias NAMES + scans; root VALUES resolve per run:
#    --root <alias>=<path> > DET_KB_ROOT_<ALIAS> > gitignored .toolkit/local.json
#    ({"roots": {"<alias>": "<absolute path>"}} relative to the working directory).
#    Real extract plans, outputs and stores live under the gitignored local-kb/<private-dir>/
#    tree and never enter this repository — placeholders below.
node bin/det.js kb extract --manifest local-kb/<private-dir>/extract-plan.json \
  --root src="<absolute path to your checkout>" \
  --out local-kb/<private-dir>/extract-out --json   # without --out (or with --dry-run): report only
node bin/det.js kb ingest --manifest local-kb/<private-dir>/ingest-manifest.json \
  --root ex="local-kb/<private-dir>/extract-out" --out kb   # extract outputs are the ingest inputs
```

### `det kb extract` — read-only source extraction (M4)

Plan-driven and fail-closed: the manifest declares which scans may run (`magento-platform`,
`pagebuilder-native`, `secomm-uiwidget`, `hyva-ui` kinds, one declared root alias each); every
scan is spawned out-of-process through the KB source-scanner adapter (discovered by its
`kb-source-scan` output contract — stdin JSON in, one payload out). The orchestrator re-validates
every emitted record against the KB record contracts and the shared record-safety gate, checks
digest pins and payload counts, merges lanes deterministically (records kept exactly as emitted,
id-sorted), and writes only into `--out` — never inside any source root
(`OUT_PATH_WITHIN_SOURCE_ROOT`), never the KB store. Any error-severity diagnostic — gateway,
adapter runtime (exit 3), payload contract, record gate, counts/digests, conflicting record ids —
writes nothing; diagnostics name record ids and violation kinds, never content. Exit codes as
usual: `0` ok · `1` blocking diagnostics · `2` usage error · `3` adapter runtime failure.
Root aliases resolve through the same three-lane gateway as ingest/sync; a missing
`.toolkit/local.json` is just an absent lane, an invalid one is a blocking `LOCAL_CONFIG_INVALID`
(content never echoed). Extract never writes sources, the store, or anything outside `--out`.

Exit codes are the contract: `0` ok · `1` blocking diagnostics · `2` usage error · `3` adapter
runtime failure (`det kb extract` only). Parse `--json` output (`{"run": <tool-run envelope>,
"output": …}`), not the
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
  project never surface; project-scoped relation edges are KB-3 content too (unscoped relation
  queries see shared edges only); partitions are per-project, a scoped query opens only its own
  partition (another tenant's corruption can neither leak in nor break the run), and validate
  flags misplaced records.
- **Query is a trust gate.** Every candidate hit is schema-checked and passes the secret/licensed
  content guards before it can surface (`QUERY_RECORD_UNSAFE`); an unsafe scope exits nonzero
  with the record id + violation kind named, the content itself withheld. Foreign-project
  records and project-scoped relation edges are excluded before any diagnostic is composed and
  reported only as a count (`FOREIGN_PROJECT_RECORDS_EXCLUDED`) — no cross-tenant identifiers
  in diagnostics.
- **Review metadata survives re-ingest — but never inherits.** `det kb ingest` carries
  `reviewStatus`/`reviewedBy`/`reviewRef` forward on unchanged digests across all four lanes;
  changed sources reset the record to `unreviewed` with an explicit
  `REVIEW_RESET_ON_CHANGED_SOURCE` diagnostic (an approval is never inherited by content nobody
  reviewed).
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
Figma reads, no CMS/DB writes. Live-source extraction now EXISTS (`det kb extract`, M4) but
running it against real private sources is a separately gated step: it needs explicit Owner GO
and explicitly resolved roots — private stores and extract outputs stay in gitignored
user-configured directories (`.toolkit/`, `local-kb/`) and never enter this repository.
