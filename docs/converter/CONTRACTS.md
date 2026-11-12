# Converter contracts — reference (Issue #5, G1 + Issue #14, G2)

**Status:** normative reference for the converter contract family. Materialized schemas live in [`resources/schemas/converter/`](../../resources/schemas/converter) (see its [README](../../resources/schemas/converter/README.md) for closed enums, deterministic serialization and validation strategy). G1 materialized the registry family; **G2 (issue #14) materialized `NodeIR`, `PageStructure` and the `SourceReview` accountability report** after the synthetic design-source gate (§6 below records the materialization deltas). The G1 harness shape (§4) is still accepted by `det plan` additively until its staged retirement.

Pipeline (one roadmap): **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity**.

## 1. `DesignSourcePort` — interface only (never a schema)

Read-only, scope-bounded accessor to any approved design source; the only legal way stages touch design content. It is an interface, not a payload — no JSON Schema exists or will exist for it. The typed TypeScript interface and its in-memory snapshot-backed implementation live in `src/core/design-source/port.ts` ([63] single-application layout).

| Member | Signature (language-neutral) | Contract |
|---|---|---|
| `describe()` | → `SourceDescriptor` | `{sourceId, providerId, revision: sourceRevision, scopes[], notes?}`. `scopes` = profile-declared visibility set. |
| `readNode(locator)` | → `NodeRecord \| Diagnostic` | `NodeRecord = {locator, kind (adapter-defined), name?, visible?, componentRef?, properties (adapter-defined), revision}`. Outside `scopes` ⇒ `LOCATOR_OUT_OF_SCOPE` (internally an error; externally indistinguishable from absent — no information leak, byte-identical diagnostics). |
| `listChildren(locator)` | → `locator[]` | Document order. Scope-bounded like `readNode`. |
| `resolveRevision()` | → `sourceRevision` | Callers pin every payload's `source` to this. |

**Rules:** the port has **no mutating operation at all** — read-only is structural, not a runtime promise. Every record carries its revision; mixing revisions in one stage run is an `EVIDENCE_MISSING`-class failure. Errors are diagnostics, never fabricated nodes.

**Transport note (G2):** when a design source is read across the out-of-process adapter boundary (TECH-ADR ADR-4), the adapter returns a bounded `DesignSourceSnapshot` document (`resources/schemas/cli/design-source-snapshot.schema.json` — CLI **transport** family). That snapshot is NOT the port and not a schema for the port (ADR-014-002): the core constructs `SnapshotDesignSourcePort` from it, and all semantic decisions stay in the core extractor.

## 2. `NodeIR` — MATERIALIZED at G2 (`resources/schemas/converter/node-ir.schema.json`, major 1; issue #14)

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

## 3. `PageStructure` — MATERIALIZED at G2 (`resources/schemas/converter/page-structure.schema.json`, major 1; issue #14)

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

## 4. G1 harness structure shape (accepted by `det plan` until staged retirement)

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

Rules: elements are a flat list per section; `childrenElementIds` expresses nesting (checked against the registry's nesting rules); `variantAssignment` selects the binding via `variantConditions`. G2 materialized the real `PageStructure` (issue #14); `det plan` now accepts **both** shapes — the real schema when the payload validates against it, the harness otherwise — and the existing #9 fixtures/tests keep exercising the harness path. **Retirement is staged**: migrating the #9 harness fixtures to real `PageStructure` payloads is follow-up work, not part of the G2 gate (issue #14 preserves all 51 #9 tests unchanged).

## 5. Compatibility decisions (one vocabulary)

1. **Family split:** converter contracts are a new family (`resources/schemas/converter/`, own integer major). V1 stays frozen at major 1 — converter evidence locators are scheme-based (`source://`, `design://`, `doc://`, `https://`), while V1 `sourceRef` is Figma-typed; forcing them together would break V1 for zero gain (ADR-005-011). Convention reuse, not `$ref` coupling.
2. **One coverage vocabulary:** ResolutionReport coverage keys equal registry `category` values exactly (`native`, `widget`, `chrome`, `custom-required`, `unsupported`) — the spec's earlier `custom` shorthand was aligned to `custom-required`.
3. **Source-component vocabulary per stage:** G1 bindings use V1 `component-defs` component ids; G2 bindings use NodeIR node ids of kind `component`. Both match the schema pattern; each stage declares which vocabulary it feeds.
4. **NodeIR/PageStructure identity:** opaque hashed ids derived from source locators (never platform ids in the clear); stable across revisions; `NODE_ID_COLLISION` is a hard error.

## 6. G2 materialization record (issue #14) — deltas against the pre-G2 field notes

The field tables above were written **before** any design-source read existed (ADR-005-013 deferred them precisely to avoid freezing guesses). Materialization landed with these documented refinements:

1. **`NodeIR.rootNodeId`** (new required field): identifies the caller-selected subtree root (`parentNodeId` null). The selected root is always explicit caller input (`det extract --design-file/--design-node`), never a default.
2. **`node.visible`** (new optional boolean, default true): source visibility at the pinned revision. Hidden nodes stay inventoried (nothing silently omitted) but are excluded from `PageStructure` with an `EXCLUDED_WITH_REASON` entry in the review.
3. **`node.componentRefNodeId`** (new optional field): for instances, the inventoried kind-`component` definition they reference. References outside the extracted scope are recorded as `REFERENCE_ONLY` — never fabricated.
4. **`PageStructure` element nesting** (`childrenElementIds`) and **`variantAssignment`** adopt the G1 harness precedent so the same resolver semantics keep working on materialized payloads.
5. **`PageStructure.inputs`**: `nodeIrContentHash` is required; `registryRevisionId` / `bindingMapContentHash` are present iff those inputs were supplied. Pins are **stable content hashes** (observation timestamps removed) so re-extraction of the same source revision reproduces them.
6. **`SourceReview`** (`resources/schemas/converter/source-review.schema.json`, major 1 — new payload): the every-node accountability ledger. Exactly one entry per `NodeIR` node with `semanticClass` (closed: `SITE_CHROME | EDITORIAL_SECTION | SHARED_COMPONENT | PRESENTATIONAL | UNKNOWN_OR_AMBIGUOUS`) and `disposition` (closed: `MAPPED | EXCLUDED_WITH_REASON | DECORATION_MERGED | REFERENCE_ONLY | NEEDS_REVIEW`), a required reason sentence, the naming hint when one was weighed, and an optional `provisionalTarget` reusing the registry `category` vocabulary (`custom-required` = no proven target; `requiresRuntimeData` = data-provider-pending). Counts must equal the pinned NodeIR's node count.
7. **Classification precedence (normative, deterministic)** — combined evidence only: own visibility → inherited branch (chrome / hidden / ambiguous / definition subtree) → top-level rules (SITE/ hint ⇒ chrome **only with top-level position AND container evidence** — a SITE/ label on a non-container is `UNKNOWN_OR_AMBIGUOUS`/`NEEDS_REVIEW`, never excluded by label alone, and stays NEEDS_REVIEW even when a capability binding resolves it — ambiguous ownership is never promoted to MAPPED (Coordinator C1 + C1-final); SECTION/ + container ⇒ editorial; bare-name container ⇒ UNKNOWN_OR_AMBIGUOUS) → unknown kind ⇒ unknown + `NEEDS_REVIEW` → dangling/invalid componentRef ⇒ `NEEDS_REVIEW` → shared-component instance ⇒ `SHARED_COMPONENT` (MAPPED only with a proven target) → presentational leaves ⇒ `DECORATION_MERGED` → content-slot children ⇒ mapped slots of their parent.
8. **Id derivation** is exactly as pre-G2 documented: `n-` + SHA-256(`sourceId ␟ designLocator ␟ kind`)[:12] (revision-independent), `s-` + SHA-256(`sourceId ␟ designLocator ␟ order`)[:12], separator U+241F; collision ⇒ hard `NODE_ID_COLLISION` reject. Duplicate locators and dangling/cyclic child references fail closed (`EVIDENCE_MISSING`) before any mapping.
9. **The closed 21-code diagnostic registry is unchanged.** G2 reuses existing codes only: `EVIDENCE_MISSING` (broken graphs, stale pins), `LOCATOR_OUT_OF_SCOPE` (root mismatch, port scope escapes), `NODE_ID_COLLISION` (guard), `NOT_VERIFIED` (unmapped kinds, unresolved refs, custom-required pendency — warnings, never silent), `SCHEMA_VERSION_UNSUPPORTED` (unknown majors). No new converter diagnostic code was needed, so no major bump was forced.
10. **`det plan` dual input** (additive): real `PageStructure` payloads are identity- and pin-checked (`profileId`, registry revision pin, binding-map pin hash) and normalized onto the same resolver; only elements with a component identity are binding-resolved — structural containers stay in NodeIR/PageStructure for the later gated serializer stage.
