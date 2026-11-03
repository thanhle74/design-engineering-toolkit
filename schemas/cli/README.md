# CLI runtime contract family (`schemas/cli/`)

Versioned, **platform-neutral** contracts for the `det` CLI runtime (issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9)): adapter registration, the adapter input transport, and the per-run tool envelope. The converter pipeline contracts stay in [`../converter/`](../converter/) — that family is untouched by this one (families keep independent majors, per the convention in [`../converter/README.md`](../converter/README.md) / ADR-005-011).

| Schema | Payload produced by | Consumed by |
|---|---|---|
| [`adapter-descriptor.schema.json`](adapter-descriptor.schema.json) | Each adapter (`adapters/<id>/descriptor.json`) | CLI adapter registry (`det` discovery + applicability) |
| [`adapter-input.schema.json`](adapter-input.schema.json) | CLI core, per inspect run | Adapter subprocess on stdin (transport only — never committed as a run artifact) |
| [`tool-run.schema.json`](tool-run.schema.json) | `det` after every command | Humans, CI, and agent skills reviewing what a run did |

## Relationship to the converter family

- `tool-run.schema.json#/$properties/converterDiagnostics` **references** the converter family's
  `common.defs.json#/$defs/diagnostic` (pinned by `$id`). This is deliberate semantic reuse: the
  codes emitted by `det` about *contract payloads* ARE converter-family diagnostics (closed
  21-code registry, same ordering rules). Process-level concerns that have no converter meaning
  (adapter crash, timeout, stdout contract violation) are **runDiagnostics** with an open,
  pattern-constrained code vocabulary — the sanctioned extension point. Adding a process-level
  code therefore never breaks the converter family.
- The adapter **input** schema is a transport envelope, not evidence: the registry the adapter
  returns carries `source://` locators (filesystem paths are unrepresentable in converter
  payloads), so absolute paths may appear only here, at run time.

## Determinism

Same rules as the converter family (canonical JSON, 2-space indent + trailing newline, SHA-256
content hash minus `generatedAt`). The envelope additionally carries `volatileContentHash` per
artifact: SHA-256 over the canonical payload with **all** observation timestamps
(`generatedAt`, `retrievedAt`, `accessedAt`) removed — this is the hash two runs of the same
tool version on the same inputs can be compared against.

## Versioning

Integer major only (`schemaVersion: 1`); additive minors tracked here; unknown majors rejected.

| Version | Change |
|---|---|
| 1.0.0 | Initial family (issue [#9] CLI engine): adapter descriptor, adapter input transport, tool-run envelope. |
