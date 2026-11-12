# Schemas

Versioned, platform-neutral JSON contracts for the Design Engineering Toolkit (V1 architecture: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)).

## Contracts

| Schema | Payload produced by | Consumed by |
|---|---|---|
| [`project-profile.schema.json`](project-profile.schema.json) | Written per project (see [`../resources/profiles/`](../profiles)) | S0 Preflight — validates project inputs & permissions |
| [`source-manifest.schema.json`](source-manifest.schema.json) | S2 Audit | S3 Normalize; humans reviewing what was included/excluded |
| [`design-tokens.schema.json`](design-tokens.schema.json) | S3 Normalize | S4 Compose; future platform adapters |
| [`component-defs.schema.json`](component-defs.schema.json) | S3 Normalize | S4 Compose; future platform adapters |

All schemas use **JSON Schema Draft 2020-12**.

## Converter contract family (issue #5)

The converter pipeline (Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity) has its **own schema family** under [`converter/`](converter/) with an independent integer major: [`converter/capability-registry.schema.json`](converter/capability-registry.schema.json), [`converter/component-binding-map.schema.json`](converter/component-binding-map.schema.json), [`converter/resolution-report.schema.json`](converter/resolution-report.schema.json), [`converter/converter-profile.schema.json`](converter/converter-profile.schema.json) + shared [`converter/common.defs.json`](converter/common.defs.json). Conventions, closed enums, deterministic serialization and its version history: [`converter/README.md`](converter/README.md). This V1 family stays frozen at major 1 (ADR-005-011).

## CLI runtime contract family (issue #9)

The `det` CLI runtime has its **own schema family** under [`cli/`](cli/) with an independent integer major: [`cli/adapter-descriptor.schema.json`](cli/adapter-descriptor.schema.json) (adapter registration), [`cli/adapter-input.schema.json`](cli/adapter-input.schema.json) (per-run transport to an out-of-process adapter) and [`cli/tool-run.schema.json`](cli/tool-run.schema.json) (per-run envelope with artifacts, content hashes and diagnostics). `tool-run` reuses the converter family's closed diagnostic registry via a pinned `$ref`; process-level diagnostics stay open-vocabulary so the converter enums are never extended. Conventions and version history: [`cli/README.md`](cli/README.md).

## Knowledge Engine contract family (issue #15)

The `det kb` engine has its **own schema family** under [`kb/`](kb/) with an independent integer
major: [`kb/kb-capability.schema.json`](kb/kb-capability.schema.json) (KB-1 platform records),
[`kb/kb-ui-component.schema.json`](kb/kb-ui-component.schema.json) (KB-2 UI components,
license-bounded), [`kb/kb-project-record.schema.json`](kb/kb-project-record.schema.json) (KB-3
tenant-isolated project records), [`kb/kb-relations.schema.json`](kb/kb-relations.schema.json)
(cross-KB typed edges), [`kb/kb-ingest-manifest.schema.json`](kb/kb-ingest-manifest.schema.json)
(plan-shaped ingest) and [`kb/kb-store.schema.json`](kb/kb-store.schema.json) (store descriptor).
The family is frozen from the reviewed issue #7 drafts with documented freeze adjustments; the
repository's `kb/` directory carries the resulting **public synthetic example store** only.
Conventions, store layout and version history: [`kb/README.md`](kb/README.md).

## Versioning

- Payloads carry `schemaVersion` (integer, **major** version only — currently `1`).
- Minor/patch changes are tracked here and must be **additive** within a major: new optional fields, new enum values in non-exhaustive enums, tighter `description` text. Anything that would make a previously-valid payload invalid is a new major (`schemaVersion: 2`) plus a migration note in this file.
- Tooling must reject payloads whose `schemaVersion` it does not implement — never best-effort parse.

### Version history

| Version | Change |
|---|---|
| 1.0.0 | Initial proposal (issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1)). Draft for review — schemas and examples may still be adjusted by PR review before P1 freezes them. |

## Validation strategy

1. **Repo test gate (live since the issue #5 architecture pass — ADR-005-015; run locally, the repo has no GitHub Actions workflow since 2026-11-12):** `pnpm test` — every schema and every example/fixture validates with [`ajv`](https://ajv.js.org/) (Draft 2020-12), the contract suite (incl. the negative plans) runs, and the neutrality guard greps neutral surfaces. Failing validation fails the run. The orchestrator runtime itself remains P1.
2. **Runtime (S0/S3):** the orchestrator validates inputs/outputs with the same schemas before a stage's checkpoint will pass. Invalid contract output blocks the pipeline — it is never "fixed forward".
3. **Semantic checks beyond JSON Schema** (encoded in the orchestrator, not the schemas): alias references resolve to declared primitives; every `illustrative` provenance entry blocks S4; `diagnostics` with severity `error` block S4; profile `gates` may tighten but not loosen defaults.
4. **Until P1 lands**, examples are hand-checked against the schemas; this PR's review is that check.

## Conventions

- Every extractable entity carries `sourceRef {fileKey, nodeId}` back into Figma and an `entryProvenance` (`observed` / `derived` / `illustrative`).
- Semantic values reference primitives with alias syntax `{primitive.<group>.<name>}` — references are strings so contracts stay pure JSON.
- Diagnostics use structured `CODE_SNAKE_CASE` + severity; free text belongs in `message`.
- `additionalProperties: false` everywhere: extensions get added to the schema (additively), not smuggled into payloads.
