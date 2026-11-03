# Converter contracts — reference (Issue #5, G1)

**Status:** normative reference for the converter contract family. Materialized schemas live in [`schemas/converter/`](../../schemas/converter/) (see its [README](../../schemas/converter/README.md) for closed enums, deterministic serialization and validation strategy). This document carries the contracts that are **deliberately not materialized yet**, plus the harness shape the G1 tests use.

Pipeline (one roadmap): **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity**. G1 materializes the registry family; G2 materializes `NodeIR` + `PageStructure` after the gated design-source read (ADR-005-013) — freezing those field sets now, with zero design-source access, would bake in unvalidated guesses.

## 1. `DesignSourcePort` — interface only (never a schema)

Read-only, scope-bounded accessor to any approved design source; the only legal way stages touch design content. It is an interface, not a payload — no JSON Schema exists or will exist for it.

| Member | Signature (language-neutral) | Contract |
|---|---|---|
| `describe()` | → `SourceDescriptor` | `{sourceId, providerId, revision: sourceRevision, scopes[], notes?}`. `scopes` = profile-declared visibility set. |
| `readNode(locator)` | → `NodeRecord \| Diagnostic` | `NodeRecord = {locator, kind (adapter-defined), name?, properties (adapter-defined), revision}`. Outside `scopes` ⇒ `LOCATOR_OUT_OF_SCOPE` (internally an error; externally indistinguishable from absent — no information leak). |
| `listChildren(locator)` | → `locator[]` | Document order. Scope-bounded like `readNode`. |
| `resolveRevision()` | → `sourceRevision` | Callers pin every payload's `source` to this. |

**Rules:** the port has **no mutating operation at all** — read-only is structural, not a runtime promise. Every record carries its revision; mixing revisions in one stage run is an `EVIDENCE_MISSING`-class failure. Errors are diagnostics, never fabricated nodes.

## 2. `NodeIR` — materializes at G2 (`schemas/converter/node-ir.schema.json`, major 1)

Platform-neutral semantic tree of an approved design page: structure + layout primitives + content slots, zero target-platform vocabulary. Visual pixels are not component semantics.

| Field | Type | Req | Notes |
|---|---|---|---|
| `schemaVersion` | int const 1 | yes | Converter family major. |
| `profileId` | string | yes | |
| `generatedAt` | date-time | yes | Excluded from content hash. |
| `source` | sourceRevision | yes | Design-source revision extracted from. |
| `nodes` | array of `node` | yes | **Sorted by `nodeId`**; tree expressed via `childrenNodeIds`. |
| `diagnostics` | array of diagnostic | yes | e.g. absolute/unknown groups reported separately — never silently dropped. |

`node`: `nodeId` (`^n-[0-9a-f]{12}$` = `n-` + SHA-256(`sourceId ␟ designLocator ␟ kind`)[:12]; **stable across revisions** — locator-keyed, revision tracked at payload level; collision ⇒ `NODE_ID_COLLISION`); `kind` (closed enum `page-section | container | component | text | media | icon | divider | spacer | unknown`); `name`; `role?`; `childrenNodeIds` (**document order**); `parentNodeId` (nodeId | null); `layout`; `contentSlots?` (sorted by `slotId`); `sourceEvidence` (≥1, `design://` locators).

`layout` (preserved verbatim — no auto-layout guessing): `direction` (`row|column|grid|absolute|unknown`), `positioning` (`static|relative|absolute|sticky|unknown`), `constraints` (array of `{axis: x|y|width|height, type, value}`, sorted by `axis`), `relativeSizes` (array of `{target, ratio}`, sorted by `target`), `overflow` (`visible|hidden|scroll|unknown`).
`slot`: `{slotId (kebab), kind (closed: `text|media|icon|component|dynamic`), valueRef, evidence?}`.

Extracted-vs-observed distinctions reuse the V1 provenance *classes* (`observed | derived | illustrative`) via slot/evidence `method` fields — no new class vocabulary.

## 3. `PageStructure` — materializes at G2 (`schemas/converter/page-structure.schema.json`, major 1)

Resolved intermediate artifact: sections with stable ids, ordered elements, content/media references, responsive composition, resolution status. **Explicitly not raw `cms_page.content` or any platform serialization** — platform rendering is G3 adapter work behind its own GO.

| Field | Type | Req | Notes |
|---|---|---|---|
| `schemaVersion`, `profileId`, `generatedAt` | as usual | yes | |
| `source` | sourceRevision | yes | Design-source revision. |
| `inputs` | object | yes | `{nodeIrContentHash, registryRevisionId, bindingMapContentHash}` — full input pinning. |
| `sections` | array of `section` | yes | `order` (int ≥ 0, unique, = document position); sorted by (`order`, `sectionId`). |
| `diagnostics` | array of diagnostic | yes | |

`section`: `sectionId` (`^s-[0-9a-f]{12}$` = SHA-256(`sourceId ␟ designLocator ␟ order`)[:12]), `name`, `role?`, `layout` (same shape as NodeIR `layout`), `elements` (document order), `sourceEvidence` (≥1).
`element`: `elementId` (reuses NodeIR node ids), `sourceComponentId?`, `bindingId?`, `target? {capabilityId, appearanceId}`, `contentSlots` (sorted by `slotId`; `{slotId, contentType: text|media|icon|dynamic, valueRef | aliasRef | fixtureRef}`), `responsiveComposition` (sorted), `resolution {status: mapped|partially-mapped|unmapped|blocked, mappingConfidence, diagnostics[]}`.

## 4. G1 harness structure shape (tests-only until G2)

The G1 negative-case tests need a structure input before `PageStructure` is materialized. `tests/fixtures/synthetic-flatcms/structure.fixture.json` uses this minimal harness shape — documented here so it is not mistaken for the future contract:

```json
{
  "profileId": "...", "platformId": "...",
  "source": { "sourceId": "...", "revisionId": "...", "accessedAt": "..." },
  "sections": [
    { "sectionId": "s-<12hex>", "order": 0, "name": "...",
      "elements": [ { "elementId": "n-<12hex>", "sourceComponentId": "...",
                      "variantAssignment": {"prop": "value"}, "childrenElementIds": ["n-..."] } ] }
  ]
}
```

Rules: elements are a flat list per section; `childrenElementIds` expresses nesting (checked against the registry's nesting rules); `variantAssignment` selects the binding via `variantConditions`. When G2 materializes `PageStructure`, this harness is retired in favor of the real schema (same major family, additive).

## 5. Compatibility decisions (one vocabulary)

1. **Family split:** converter contracts are a new family (`schemas/converter/`, own integer major). V1 stays frozen at major 1 — converter evidence locators are scheme-based (`source://`, `design://`, `doc://`, `https://`), while V1 `sourceRef` is Figma-typed; forcing them together would break V1 for zero gain (ADR-005-011). Convention reuse, not `$ref` coupling.
2. **One coverage vocabulary:** ResolutionReport coverage keys equal registry `category` values exactly (`native`, `widget`, `chrome`, `custom-required`, `unsupported`) — the spec's earlier `custom` shorthand was aligned to `custom-required`.
3. **Source-component vocabulary per stage:** G1 bindings use V1 `component-defs` component ids; G2 bindings use NodeIR node ids of kind `component`. Both match the schema pattern; each stage declares which vocabulary it feeds.
4. **NodeIR/PageStructure identity:** opaque hashed ids derived from source locators (never platform ids in the clear); stable across revisions; `NODE_ID_COLLISION` is a hard error.
