# KB contract family (issue #15 — Knowledge Engine MVP)

Versioned JSON Schema contracts for the knowledge engine (`det kb ingest|sync|query|validate`).
**Frozen at major 1** from the reviewed issue #7 drafts in
[`specs/knowledge-foundation/schemas/`](../../specs/knowledge-foundation/schemas/) (which remain the
dated review record). All schemas use **JSON Schema Draft 2020-12**, `schemaVersion` integer major
(`const: 1`), `additionalProperties: false` everywhere — same conventions as the converter and CLI
families.

| Schema | KB | Covers |
|---|---|---|
| [`kb-capability.schema.json`](kb-capability.schema.json) | KB-1 | `Capability` + `DataProvider` records — platform-neutral structure, Magento specifics only as VALUES |
| [`kb-ui-component.schema.json`](kb-ui-component.schema.json) | KB-2 | `UIComponent` records — three-source aware, license-bounded (metadata-only by structure + deterministic ingest caps) |
| [`kb-project-record.schema.json`](kb-project-record.schema.json) | KB-3 | Nine project record types (requirement, ux-intent, composition, decision, approval, risk, open-question, constraint, source-document), tenant-isolated |
| [`kb-relations.schema.json`](kb-relations.schema.json) | shared | Cross-KB typed edges: core graph + KB-2 provenance relations + KB-3 chain relations |
| [`kb-ingest-manifest.schema.json`](kb-ingest-manifest.schema.json) | engine | Plan-shaped ingest manifest: the only way `det kb ingest` reads anything |
| [`kb-store.schema.json`](kb-store.schema.json) | engine | Store descriptor (`kb/store.json`): identity, partitions, counts — hashed, re-derived by the validator |
| [`kb-engine-output.schema.json`](kb-engine-output.schema.json) | engine | Output envelopes for `det kb ingest`/`query`/`sync` artifacts (records view, query result with provenance-on-every-hit, sync report) |

## Store layout (one physical format, three logical domains)

```
kb/
  store.json                            # descriptor (this family)
  platform/records.jsonl                # KB-1, one record per line
  ui/records.jsonl                      # KB-2
  project/<projectId>/records.jsonl     # KB-3, partitioned per project
  relations/records.jsonl               # first-class relation records
```

Records are canonical JSON (sorted keys, compact) one per line, sorted by `id` — the same
deterministic serialization rules as the converter family. The repository's `kb/` directory carries
**public synthetic examples only**; local protected corpora live in gitignored user-configured
directories and never enter this repo.

## Freeze adjustments vs the issue #7 drafts (reviewed spec → executable contract)

1. **`kb-project-record`: the draft's `oneOf` branches were structurally broken for ajv** — branch
   fields (`kind`, `page`, `likelihood`, …) were declared outside the root
   `additionalProperties: false` scope, so *every* instance carrying them would have been rejected.
   The draft was only JSON-syntax-checked (per its own README). The frozen schema enumerates each
   branch's allowed fields fully (root lists the union; each branch closes its own set), which is
   the same review-freeze path the implementation plan (M1) anticipated.
2. **Unified record envelope on KB-3 and relations**: `lifecycle` + `observed` are required on
   KB-3 records, and `observed` is required on relations (KB-1/KB-2 already had them). This makes
   digest-pinned sync, review status and staleness uniform across all three KBs instead of a
   KB-1/KB-2-only mechanism.
3. **`kb-relations.evidence` gains optional `method`** (symmetry with the record evidence blocks).
4. `$id` paths moved from `specs/knowledge-foundation/schemas/` to `schemas/kb/` — the drafts stay
   in place as the dated review record; this family is the contract the CLI validates against.

The platform/source *kinds* in `kb-ui-component` (`hyva-ui`, `secomm-uiwidget`, `page-builder-native`,
plus `other`) are the audited first-class source kinds from the accepted #7 review — they are
contract VALUES, not core-code coupling: `src/core/kb` contains zero platform literals, the KB-1
schema and every other structure stays platform-free, and non-Magento sources use `other`/their own
platform values.

## Structural safety properties (enforced where prose cannot be)

| Property | Where enforced |
|---|---|
| Licensed Hyvä UI stays metadata-only | `kb-ui-component` structure (no source/template/asset fields) + ingest free-text size caps + secret-pattern guard (`det kb ingest`) |
| Tenant isolation | `kb-project-record`: `projectId` + `tenantId` required; query layer default-deny (`det kb query --kb project` without `--project` fails); partition-per-project layout |
| No absolute owner paths as data | all schemas: locators are rootAlias-relative or document/issue pointers; manifest paths are alias- or manifest-relative |
| No false equivalence | `kb-relations`: `authority` enum + `neighborOf` vs `mapsTo` distinction; the KB validator rejects `mapsTo`/`adaptedFrom`/`equivalentOf`/`replaces` across the Page Builder-native ↔ developer-owned class boundary |
| Dangling edges | `det kb ingest`/`det kb validate` reject endpoints that do not resolve in the store |
| External requirement IDs are never canonical | `kb-project-record`: LC/FC/LA/Jira only in `requirement.externalRef` with `traceStatus` |
| Approval durability is honest | `apr:` records distinguish `recorded` (durable ref) from `attested` (real go, no durable record — never satisfies approval-demanding gates) |

## Validation strategy

- **CI:** the KB schemas are registered in the same ajv registry as the converter/CLI families;
  `tests/kb-suite.mjs` validates positive fixtures and rejects negative twins (missing tenantId,
  dangling relation, cross-class `mapsTo`, oversized licensed free-text, secret markers, wrong
  project scope, cross-partition records).
- **Runtime:** `det kb ingest` validates at write time and refuses invalid records (never
  "fixes forward"); `det kb validate` re-checks any store directory on demand.

### Version history

| Version | Change |
|---|---|
| 1.0.0 | Initial freeze from the reviewed issue #7 drafts (issue #15). Adjustments listed above; older drafts remain in `specs/knowledge-foundation/schemas/` as the review record. |
