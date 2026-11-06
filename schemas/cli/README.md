# CLI runtime contract family (`schemas/cli/`)

Versioned, **platform-neutral** contracts for the `det` CLI runtime (issue [#9](https://github.com/thanhle74/design-engineering-toolkit/issues/9)): adapter registration, the adapter input transport, and the per-run tool envelope. The converter pipeline contracts stay in [`../converter/`](../converter/) — that family is untouched by this one (families keep independent majors, per the convention in [`../converter/README.md`](../converter/README.md) / ADR-005-011).

| Schema | Payload produced by | Consumed by |
|---|---|---|
| [`adapter-descriptor.schema.json`](adapter-descriptor.schema.json) | Each adapter (`adapters/<id>/descriptor.json`) | CLI adapter registry (`det` discovery + applicability) |
| [`adapter-input.schema.json`](adapter-input.schema.json) | CLI core, per inspect/extract run | Adapter subprocess on stdin (transport only — never committed as a run artifact) |
| [`design-source-snapshot.schema.json`](design-source-snapshot.schema.json) | Design-source adapters (out-of-process), per extract run | `det extract` core: validated, then wrapped as the in-memory `DesignSourcePort` (transport only — the port itself stays an interface per ADR-005-013) |
| [`content-manifest.schema.json`](content-manifest.schema.json) | Caller, per compose run | `det compose` core: validated + revision-pinned, then transported to the compose adapter (literal content only — never nodes, never invented assets) |
| [`compose-input.schema.json`](compose-input.schema.json) | CLI core, per compose run | Compose adapter subprocess on stdin (transport only; the five embedded payloads are schema-validated + pin-checked by the core first) |
| [`compose-output.schema.json`](compose-output.schema.json) | Compose adapters (out-of-process), per compose run | `det compose` core: echo-verified, then persisted as `compose-report.json` + `native-content.html` |
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

## Trust boundaries (normative)

- `permissions.readOnly: true` is a **declarative statement validated by schema — it is not OS sandbox enforcement**. Adapters run as subprocesses with the invoking user's local privileges; the enforcement layers are the descriptor contract, the schema-checked output contract, the deny list/scopes inside each adapter, and the realpath containment checks at spawn time. Document this whenever distributing third-party adapters.
- Adapter `stderr` is **terminal-only**: machine-readable diagnostics and persisted `tool-run.json` receipts carry the failure *fact* (exit code, bounded-output verdict), never untrusted adapter bytes.
- Child `stdout`/`stderr` are collected under deterministic byte caps (defaults 8 MiB / 64 KiB); exceeding the stdout cap is `ADAPTER_OUTPUT_OVERFLOW` — the process is killed and nothing is parsed.
- Adapter `entry` must contain no traversal segments and must realpath-resolve inside the repository root (checked twice: schema pattern + runtime containment).

## Versioning

Integer major only (`schemaVersion: 1`); additive minors tracked here; unknown majors rejected.

| Version | Change |
|---|---|
| 1.0.0 | Initial family (issue [#9] CLI engine): adapter descriptor, adapter input transport, tool-run envelope. Revised **pre-release** (family unreleased outside this PR): descriptor `entry` pattern tightened to reject interior traversal; trust-boundary descriptions added — no payload valid under the initial pattern is invalid under the tightened one except traversal-carrying entries, which were never legitimately shippable. |
| 1.2.0 | Native content composition (issue [#23], G3 hero slice): new `content-manifest`, `compose-input`, `compose-output`; `tool-run` gains the `compose` command and the `compose-report` artifact role. Compose adapters are discovered by the same descriptor and discriminated by `outputContract` = compose-output; the closed converter diagnostic registry is unchanged (compose gaps are `NOT_VERIFIED` warnings). Composition is structural evidence only — never an Admin or visual claim. |
| 1.1.0 | Read-only design-source extraction (issue [#14], synthetic gate): new `design-source-snapshot` transport schema; `tool-run` gains the `extract` command and the `node-ir`/`page-structure`/`source-review` artifact roles. Additive minors only; the descriptor/input contracts are unchanged (a design-source adapter is discovered by the same descriptor, discriminated by its `outputContract`; the caller-selected root rides in the open `options` object). Credentials, if a provider ever needs them, come only from the caller's environment — never flags, profile files or receipts. |

## 1.1.0 KB integration

| 1.1.0 (additive minor) | Knowledge Engine (issue [#15]): `tool-run.command` gains `"kb"` and the artifact `role` enum gains `kb-ingest-manifest`, `kb-records`, `kb-query-result`, `kb-sync-report`, `kb-store-descriptor`. Purely additive — every payload valid under 1.0.0 stays valid. |
