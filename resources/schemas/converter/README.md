# Converter contract family (`resources/schemas/converter/`)

Versioned, **platform-neutral** contracts for the converter pipeline
(*Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity*, [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues) #5 spec: [`docs/specs/ISSUE-5-converter-architecture.md`](../../../docs/specs/ISSUE-5-converter-architecture.md)).
Field definitions and the G2 materialization record for `NodeIR`, `PageStructure`, `SourceReview` and the `DesignSourcePort` interface live in [`docs/converter/CONTRACTS.md`](../../../docs/converter/CONTRACTS.md).

## Schemas (all Draft 2020-12)

| Schema | Payload produced by | Consumed by |
|---|---|---|
| [`converter-profile.schema.json`](converter-profile.schema.json) | Written per project / per run | Probe preflight (S-source checks), resolver |
| [`capability-registry.schema.json`](capability-registry.schema.json) | Adapter capability probe (read-only) | Resolver; humans reviewing platform coverage |
| [`component-binding-map.schema.json`](component-binding-map.schema.json) | Authored per project | Resolver |
| [`resolution-report.schema.json`](resolution-report.schema.json) | Resolver | Stage checkpoints; negative-case tests |
| [`node-ir.schema.json`](node-ir.schema.json) | `det extract` (G2 design-source extraction) | Structural mapping; humans reviewing the source inventory |
| [`page-structure.schema.json`](page-structure.schema.json) | `det extract` (G2 structural plan) | `det plan` (additive dual input); later gated serializer stage |
| [`source-review.schema.json`](source-review.schema.json) | `det extract` (G2 accountability report) | Humans reviewing classification/exclusions; gate evidence |
| [`common.defs.json`](common.defs.json) | — | Shared `$defs` for the whole family |

Worked examples: [`resources/examples/converter/`](../../examples/converter) (a real-platform registry derived from the [5] W-B audit, and a resolver report) and `src/core/__tests__/fixtures/synthetic-flatcms/` (a synthetic second platform proving core neutrality). The V1 family ([`../`](../)) stays frozen at its own major — the families are independent (ADR-005-011).

## Versioning

- Payloads carry `schemaVersion` (integer, **major** only — currently `1`). Unknown majors are rejected (`SCHEMA_VERSION_UNSUPPORTED`), never best-effort parsed.
- Additive minors are tracked here. Breaking changes (including **any new enum value** — see closed enums below) require a new major + migration ADR in [`docs/converter/DECISIONS.md`](../../../docs/converter/DECISIONS.md).

### Version history

| Version | Change |
|---|---|
| 1.0.0 | Initial family (issue [#5] architecture pass): profile, registry, binding map, report + shared defs. `NodeIR`/`PageStructure` are field-documented in CONTRACTS.md and materialize at the Structural Mapping gate (ADR-005-013). |
| 1.1.0 | Structural Mapping gate materialized (issue [#14], synthetic design source only): new `node-ir`, `page-structure`, `source-review` payloads + worked examples; `det plan` additively accepts real `PageStructure` next to the G1 harness shape. Additive only — no existing payload, enum or code changed; the closed 21-code diagnostic registry is untouched (G2 reuses existing codes). Materialization deltas recorded in CONTRACTS.md §6. |

## Closed vs open vocabularies (normative)

Every enum below is **closed**: adding a value is a breaking change (new major + ADR). The sanctioned extension point is **adapter-defined free strings** (marked *open*).

| Vocabulary | Values | Status |
|---|---|---|
| `evidence.kind` | `source-file, config-declaration, document, rendered-artifact, runtime-observation, test-receipt` | closed |
| capability `category` | `native, widget, chrome, custom-required, unsupported` | closed |
| `availability` | `enabled, disabled, deprecated, unknown` | closed |
| `proofLevel` | `not-verified, discovered, registered, structurally-mapped, admin-roundtrip-verified, visually-verified` | closed, totally ordered |
| `editorEditingMode` | `form, wysiwyg, code, none, unknown` | closed |
| diagnostic `code` | the 21-code registry in `common.defs.json#/$defs/diagnostic` | closed |
| diagnostic `severity` | `info, warning, error` | closed |
| binding `fallbackPolicy` | `fail-unsupported, degrade-advisory, omit` | closed |
| transform `transform` | `identity, map, template, constant, omit` | closed |
| report/section `status` | `mapped, partially-mapped, unmapped, blocked` | closed |
| `mappingConfidence` | `high, medium, low` | closed |
| NodeIR node `kind` | `page-section, container, component, text, media, icon, divider, spacer, unknown` | closed |
| NodeIR layout `direction` | `row, column, grid, absolute, unknown` | closed |
| NodeIR layout `positioning` | `static, relative, absolute, sticky, unknown` | closed |
| NodeIR layout `overflow` | `visible, hidden, scroll, unknown` | closed |
| layout constraint `axis` | `x, y, width, height` | closed |
| content slot `kind` | `text, media, icon, component, dynamic` | closed |
| review `semanticClass` | `SITE_CHROME, EDITORIAL_SECTION, SHARED_COMPONENT, PRESENTATIONAL, UNKNOWN_OR_AMBIGUOUS` | closed |
| review `disposition` | `MAPPED, EXCLUDED_WITH_REASON, DECORATION_MERGED, REFERENCE_ONLY, NEEDS_REVIEW` | closed |
| prop `type` | `string, number, boolean, enum, color, length, json, reference, unknown` | closed |
| capability/prop/provider/scope id strings | adapter-documented formation rules | open (pattern-constrained) |
| `dataContext.dataSources`, `editorRestrictions`, `responsiveRules.scope/effect` | adapter vocabulary | open |

## Deterministic serialization (normative for every emitter)

1. Association arrays are **sorted by their key** in Unicode code-point order; fixed keys: `capabilities` → (`id`, `appearanceId`); `acceptedProps` → `name`; nesting rules → policy entries first, then concrete by `capabilityId`; `evidence[]` → (`locator`, `evidenceId`); `diagnostics[]` → (`code`, severity rank `info<warning<error`, `subject.id`, `message`); `bindings` → (`sourceComponentId`, canonical `variantConditions`); `responsiveRules` → `scope`; report `sections` → (`order`, `sectionId`).
2. **Document order is semantic, not arbitrary** — `children[]`, `sections[].order`, `elements[]` keep source document order; they are deterministic because the revision-pinned source defines them. Everything else is key-sorted.
3. Canonical JSON (for hashing): UTF-8, object keys sorted lexicographically, no insignificant whitespace. **Content hash = SHA-256 over canonical JSON of the payload minus `generatedAt`.** File serialization = 2-space indent + trailing newline.
4. Emitters must not iterate unordered sets (glob order, locale collation) without applying rule 1.

## Validation strategy

1. **Repo test gate:** `pnpm test` (Node ≥ 20, `ajv` devDependency) validates all schemas + examples + fixtures, runs the 14-case negative/semantic test plan (unknown capability, appearance mismatch, missing variant, wrong nesting, ambiguous/duplicate binding, missing project source, wrong schemaVersion, determinism, neutrality guard, synthetic profile, summary consistency, evidence overclaim, disabled capability, family independence), and fails the run on any violation (run locally — no repo CI workflow since 2026-11-12).
2. **Runtime:** each stage validates its output with the same schemas before its checkpoint passes; invalid output blocks the stage — never "fixed forward".
3. **Semantic checks beyond JSON Schema** (in the test gate now, in the future resolver): summary/counts consistency; (id, appearanceId) uniqueness; proof-level evidence justification (`registered` needs `config-declaration` evidence; G1/G2 payloads claiming `admin-roundtrip-verified` are rejected); binding target existence/appearance/enablement; parents/children declaration agreement.

## Neutrality rules (normative)

- These schemas contain **no platform name, no platform id grammar, and no filesystem path**. The repo test gate greps `resources/schemas/converter/*.json` for platform literals, Figma-style node-id patterns and absolute/home paths — zero matches is the pass condition.
- Payload **values** may name platforms (e.g. the Magento example registry); the schemas must not.
- `source://`-scheme locators make absolute paths unrepresentable. The `sourceId → local path` binding lives only in the per-run profile/env/CLI.
- Exempt from the grep guard: the V1 family (legitimately Figma-typed), `resources/examples/converter/*.json` (sample payload values), docs, specs and `.claude/` policy files. The exemption list is explicit in the test.

## Integration notes (reconciliation decisions, issue #5)

1. **`capabilityId` segments allow underscores** so platform identifiers are carried faithfully (`column_group`, `tab_item`, component ids like `accordion_a`) — traceability beats renaming; the namespace prefix scopes the vocabulary.
2. **Nesting rules support policies** (`allow-all`/`deny-all` + `except`) alongside concrete lists, because real platform registries declare allow/deny policies rather than full enumerations; a policy rule keeps the registry honest when the platform adds types.
3. ResolutionReport coverage keys use registry `category` names exactly (`custom-required`, not `custom`) — one vocabulary across the family.
4. The family is deliberately **not** `$ref`-linked to the V1 family: V1 `sourceRef` is Figma-typed, converter evidence is scheme-based. Convention reuse (diagnostic shape, provenance discipline, closed enums) instead of schema coupling.
