# Knowledge Foundation schemas — example drafts

Example schema drafts for the three knowledge bases and their cross-KB relations
([CONTRACTS.md](../CONTRACTS.md)). **Drafts for review** (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)):
they are valid JSON, syntactically checked, and hand-reviewed against the contracts — the same
standard the V1 schemas used before implementation-phase CI lands. They are **not** frozen
contracts, and nothing here implies a running store.

| Schema | KB | Covers |
|---|---|---|
| [`kb-capability.schema.json`](kb-capability.schema.json) | KB-1 | `Capability` + `DataProvider` records — platform-neutral structure, Magento specifics only as values |
| [`kb-ui-component.schema.json`](kb-ui-component.schema.json) | KB-2 | `UIComponent` records — three-source aware, four availability states, license-bounded (metadata-only by structure) |
| [`kb-project-record.schema.json`](kb-project-record.schema.json) | KB-3 | Nine project record types (requirement, ux-intent, composition, decision, approval, risk, open-question, constraint, source-document), tenant-isolated |
| [`kb-relations.schema.json`](kb-relations.schema.json) | shared | Cross-KB typed edges: core graph + KB-2 provenance relations + KB-3 chain relations |

## Conventions (inherited from the V1 schema family — unchanged)

- **JSON Schema Draft 2020-12**, `schemaVersion` integer **major** (`const: 1` today), additive-only within a major; breaking change = new major + migration note here.
- `additionalProperties: false` everywhere; extensions are schema changes, never smuggled fields.
- Diagnostics are structured `CODE_SNAKE_CASE` + severity.
- IDs are version-free (`<prefix>:<scope>:<kebab-slug>`); upstream identifiers are preserved verbatim in `nativeId`. Versions live in record fields.
- Every record carries: generalized `sourceRef` (the V1 Figma `{fileKey, nodeId}` is the `figma-node` variant), `evidence` (proof level + uncertainty — mandatory even if `['none identified']`), `lifecycle` (ACTIVE/STALE/INVALIDATED/ARCHIVED + review status), and `observed` (`scannedAt` + input digests — the re-audit trigger keys).
- Proof levels: `DETECTED / ASSUMED / TESTED / UNKNOWN`, with the vocabulary reconciliation to V1's `observed/derived/illustrative` and the converter stage ladder defined in [CONTRACTS.md §2.2.1](../CONTRACTS.md).

## Structural safety properties (not just documentation)

| Property | Where enforced |
|---|---|
| Licensed Hyvä UI stays metadata-only | `kb-ui-component.schema.json`: no field can hold source, template markup, assets, or license keys; `license.derivedArtifactPolicy` records the policy per record |
| Tenant isolation | `kb-project-record.schema.json`: `projectId` + `tenantId` required, no nullable "all projects" state |
| No absolute owner paths as data | all schemas: locators are rootAlias-relative or document/issue pointers |
| No false equivalence | `kb-relations.schema.json`: `authority` enum + `neighborOf` vs `mapsTo` distinction; `implements` carries its own proof burden |
| External requirement IDs are never canonical | `kb-project-record.schema.json`: LC/FC/LA/Jira only in `requirement.externalRef` with `traceStatus` |
| Approval durability is honest | `apr:` records distinguish `recorded` (durable ref) from `attested` (real go, no durable record — never satisfies approval-demanding gates) |

## Validation strategy

1. **Now (this PR):** JSON syntax check on every schema; hand-review against CONTRACTS.md.
2. **Implementation phase (per [IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md) M2):** ajv (Draft 2020-12) validates schemas + fixture records in CI, including negative fixtures (records that must fail: missing tenantId, dangling relation, license-bearing fields).
3. **Runtime:** the future `KnowledgeStore` validates at write time; invalid records are rejected, never "fixed forward".

### Version history

| Version | Change |
|---|---|
| 1.0.0 (draft) | Initial proposal (issue #7). Draft for review — may still be adjusted by PR review before the implementation GO freezes them. |
