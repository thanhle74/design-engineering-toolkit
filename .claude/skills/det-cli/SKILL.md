---
name: det-cli
description: Run the toolkit's deterministic det CLI (validate/inspect/plan/extract) from Claude Code — profile validation, read-only capability inspection, structural mapping, and read-only synthetic design-source extraction to NodeIR/PageStructure/SourceReview with exit codes and JSON artifacts. Use whenever a task needs project/adapter evidence instead of reimplementing parsing, validation or mapping as a prompt.
---

# det CLI operations

The toolkit's deterministic logic lives in the **`det` CLI**, never in prompts. Claude Code (or any agent) invokes it; a human terminal or CI runs the identical commands without an agent. Do NOT reimplement profile parsing, capability scanning, binding validation, structural mapping or diagnostics in a prompt — call the CLI and read its JSON.

## Setup

```bash
npm ci          # once per checkout
npm run build   # compile src/ + adapters/ to dist/ (gitignored)
node bin/det.js --help
```

## Commands (read-only; nothing is written without --out)

```bash
# 1. Validate a converter profile + resolve its project source (preflight only)
node bin/det.js validate --profile profiles/magento-pagebuilder.example.json \
  --project /path/to/your/magento-checkout --json

# 2. Read-only capability inspection → CapabilityRegistry (source:// evidence locators)
node bin/det.js inspect --profile profiles/magento-pagebuilder.example.json \
  --project /path/to/your/magento-checkout --out out/

# 3. Deterministic structural mapping → ResolutionReport (pure computation, no checkout needed)
node bin/det.js plan --profile <profile.json> --registry out/capability-registry.json \
  --bindings <component-binding-map.json> --input <design-structure.json> \
  --dry-run          # compute, write nothing
node bin/det.js plan ... --out out/   # writes resolution-report.json + tool-run.json

# 5. Gated native content composition (G3 #23 + G4 #25) — the platform-serializer stage
node bin/det.js compose --profile <profile.json> --registry out/capability-registry.json \
  --bindings <binding-map.json> --input <page-structure.json> --nodeir <node-ir.json> \
  --content <content-manifest.json> [--projection <semantic-projection.json>] [--out out/] [--dry-run]
# Emits compose-report.json (per-source-node mapping + diagnostics) and native-content.html
# (the platform's persisted native format) via the platform's out-of-process compose adapter.
# Two bounded section shapes today: hero (row > banner) and two-column (row > column-group >
# column-line > column x2 with text WYSIWYG + native image elements); the explicit
# reason-carrying semantic projection assigns composer roles when source layer names do not
# carry the SLOT-role convention — without it the raw source composes nothing (test-asserted).
# Structural composition evidence ONLY — never an Admin-round-trip or visual claim; a local
# isolated CMS write requires a separate explicit operator-selected target.

# 5. One-shot validated build (issue #28 C1) — thin orchestrator over the shipped commands:
node bin/det.js build --config <build-config.json> [--out <dir>] [--dry-run] [--json]
# Config paths resolve relative to the config file itself; major 1 builds run from OFFLINE
# snapshot/tree documents only (a live design-source mode is not representable and fails
# closed). Bundle = staged stage dirs + build-manifest.json: the per-FILE-BYTE sha256
# inventory of every generated artifact and consumed input, stage provenance and honest gaps
# (preview installation into a checkout is OPERATOR_GATED — det build never writes to any
# platform). Example config: examples/build/project.example.json; preview install runbook:
# examples/local-preview/README.md.

# 4. Read-only design-source extraction (G2, SYNTHETIC fixtures only — see gate note)
node bin/det.js extract --profile profiles/your-profile.json --project /path/to/design-source \
  --design-file <tree-document> --design-node <root-locator> \
  [--registry <capability-registry.json> --bindings <binding-map.json>] [--out out/] [--dry-run]
# Emits node-ir.json (full inventory), page-structure.json (editorial-only plan),
# source-review.json (every-node accountability: class + disposition + reason).
```

## Rules for agents

1. **Exit codes are the contract:** `0` ok · `1` blocking diagnostics · `2` usage error · `3` adapter runtime failure. Never guess an outcome the exit code already states.
2. Parse `--json` output (`{"run": <tool-run envelope>, "output": <registry|report>}`), not the human summary. Diagnostics carry structured codes (`PROJECT_SOURCE_NOT_CONFIGURED`, `ADAPTER_NOT_APPLICABLE`, `VARIANT_NOT_MAPPED`, `NOT_VERIFIED`, `LOCATOR_OUT_OF_SCOPE`, …) — act on codes, not message text.
3. **Proof discipline:** registry proof levels never exceed what pinned evidence justifies (`registered` = declaration evidence + enabled; never treat installed/enabled/declared as runtime-proven or Admin-verified). `NOT_VERIFIED` diagnostics mark unaudited fields — report them, don't smooth them over.
4. **Boundaries:** the CLI never writes to CMS/DB/storefront/design sources; adapters are read-only by schema contract. `det extract` is authorized for SYNTHETIC design-source fixtures only in this gate — a live design-tool read (e.g. the approved Figma subtree) requires a separate explicit Owner GO and a live source adapter; never point `extract` at a provider before that GO, never rename any layer, never attempt CMS import, Admin round-trips or visual QA under this skill. The selected root comes ONLY from `--design-file`/`--design-node`; never guess or hardcode one.
5. **Paths:** supply the project root per run (`--project` > `DET_PROJECT_SOURCE` env > gitignored `profiles/*.local.json`). Never commit a real owner path; never read `env.php`/`auth.json` yourself — the adapter deny-lists them.
6. Determinism: same inputs + same tool version ⇒ identical `contentHash`/`volatileContentHash` in `tool-run.json`. If hashes drift, stop and investigate — do not re-run until it passes.

## magento-specs MCP (optional, local Claude Code only)

The `magento-specs` MCP is a documentation/pattern reference for authoring and audits. It is **not** a runtime dependency of `det`: every portable test passes with zero MCP. If the MCP is unavailable in a session, use the CLI as above — nothing in the workflow requires it. When both exist, installed-source evidence (what `det inspect` returns) outranks generic MCP/reference docs.

## Knowledge Engine commands (issue #15 — det kb)

```bash
# Deterministic ingest from a manifest (the only way records enter a KB store; report-only by default)
node bin/det.js kb ingest --manifest examples/kb/manifest.json \
  --root reg="$(pwd)/tests/fixtures/synthetic-magento-like" --json

# Digest-driven sync (changed sources -> records marked STALE; writes only when something went stale)
node bin/det.js kb sync --store kb --manifest examples/kb/manifest.json --root reg=... --out kb

# Structured query — provenance on every hit; KB-3 is default-deny (--project required)
node bin/det.js kb query --store kb --kb platform --where category=content --text banner --json
node bin/det.js kb query --store kb --kb project --project synthetic-fashion --where recordType=constraint --json

# Store validation (schemas, graph integrity, project isolation, descriptor honesty)
node bin/det.js kb validate --store kb --json
```
