# Schemas

Versioned, platform-neutral JSON contracts for the Design Engineering Toolkit (V1 architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)).

## Contracts

| Schema | Payload produced by | Consumed by |
|---|---|---|
| [`project-profile.schema.json`](project-profile.schema.json) | Written per project (see [`../profiles/`](../profiles/)) | S0 Preflight — validates project inputs & permissions |
| [`source-manifest.schema.json`](source-manifest.schema.json) | S2 Audit | S3 Normalize; humans reviewing what was included/excluded |
| [`design-tokens.schema.json`](design-tokens.schema.json) | S3 Normalize | S4 Compose; future platform adapters |
| [`component-defs.schema.json`](component-defs.schema.json) | S3 Normalize | S4 Compose; future platform adapters |

All schemas use **JSON Schema Draft 2020-12**.

## Versioning

- Payloads carry `schemaVersion` (integer, **major** version only — currently `1`).
- Minor/patch changes are tracked here and must be **additive** within a major: new optional fields, new enum values in non-exhaustive enums, tighter `description` text. Anything that would make a previously-valid payload invalid is a new major (`schemaVersion: 2`) plus a migration note in this file.
- Tooling must reject payloads whose `schemaVersion` it does not implement — never best-effort parse.

### Version history

| Version | Change |
|---|---|
| 1.0.0 | Initial proposal (issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1)). Draft for review — schemas and examples may still be adjusted by PR review before P1 freezes them. |

## Validation strategy

1. **CI (implementation phase P1):** every schema and every `examples/*.json` + `profiles/*.json` validates with [`ajv`](https://ajv.js.org/) (Draft 2020-12) on push. Failing validation fails the build.
2. **Runtime (S0/S3):** the orchestrator validates inputs/outputs with the same schemas before a stage's checkpoint will pass. Invalid contract output blocks the pipeline — it is never "fixed forward".
3. **Semantic checks beyond JSON Schema** (encoded in the orchestrator, not the schemas): alias references resolve to declared primitives; every `illustrative` provenance entry blocks S4; `diagnostics` with severity `error` block S4; profile `gates` may tighten but not loosen defaults.
4. **Until P1 lands**, examples are hand-checked against the schemas; this PR's review is that check.

## Conventions

- Every extractable entity carries `sourceRef {fileKey, nodeId}` back into Figma and an `entryProvenance` (`observed` / `derived` / `illustrative`).
- Semantic values reference primitives with alias syntax `{primitive.<group>.<name>}` — references are strings so contracts stay pure JSON.
- Diagnostics use structured `CODE_SNAKE_CASE` + severity; free text belongs in `message`.
- `additionalProperties: false` everywhere: extensions get added to the schema (additively), not smuggled into payloads.
