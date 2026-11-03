---
name: det-cli
description: Run the toolkit's deterministic det CLI (validate/inspect/plan) from Claude Code — profile validation, read-only Magento Page Builder capability inspection and structural mapping with exit codes and JSON artifacts. Use whenever a task needs project/adapter evidence instead of reimplementing parsing, validation or mapping as a prompt.
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
```

## Rules for agents

1. **Exit codes are the contract:** `0` ok · `1` blocking diagnostics · `2` usage error · `3` adapter runtime failure. Never guess an outcome the exit code already states.
2. Parse `--json` output (`{"run": <tool-run envelope>, "output": <registry|report>}`), not the human summary. Diagnostics carry structured codes (`PROJECT_SOURCE_NOT_CONFIGURED`, `ADAPTER_NOT_APPLICABLE`, `VARIANT_NOT_MAPPED`, `NOT_VERIFIED`, `LOCATOR_OUT_OF_SCOPE`, …) — act on codes, not message text.
3. **Proof discipline:** registry proof levels never exceed what pinned evidence justifies (`registered` = declaration evidence + enabled; never treat installed/enabled/declared as runtime-proven or Admin-verified). `NOT_VERIFIED` diagnostics mark unaudited fields — report them, don't smooth them over.
4. **Boundaries:** the CLI never writes to CMS/DB/storefront/design sources; adapters are read-only by schema contract. Figma reads, CMS import, Admin round-trips and visual QA are separate gated stages — do not attempt them under this skill.
5. **Paths:** supply the project root per run (`--project` > `DET_PROJECT_SOURCE` env > gitignored `profiles/*.local.json`). Never commit a real owner path; never read `env.php`/`auth.json` yourself — the adapter deny-lists them.
6. Determinism: same inputs + same tool version ⇒ identical `contentHash`/`volatileContentHash` in `tool-run.json`. If hashes drift, stop and investigate — do not re-run until it passes.

## magento-specs MCP (optional, local Claude Code only)

The `magento-specs` MCP is a documentation/pattern reference for authoring and audits. It is **not** a runtime dependency of `det`: every portable test passes with zero MCP. If the MCP is unavailable in a session, use the CLI as above — nothing in the workflow requires it. When both exist, installed-source evidence (what `det inspect` returns) outranks generic MCP/reference docs.
