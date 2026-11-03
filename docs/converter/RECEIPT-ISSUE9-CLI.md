# Integrator receipt — Issue #9, first executable CLI gate

**Status:** `IMPLEMENTED_TESTED` (synthetic + live read-only audit). This receipt claims **no** Figma access, **no** CMS/DB writes, **no** Admin round-trip, **no** visual verification, **no** runtime-functional claims. Later gates (G2 design extraction, G3 isolated Admin, G4 visual) need separate GOs.

## Scope delivered

One integration branch, no schema change to the frozen converter/V1 families, no new runtime dependency (`typescript`/`@types/node` are devDependencies).

| Deliverable | Where | Evidence |
|---|---|---|
| TypeScript production core (graduated from the tested #5 harness) | `src/core/` (canonical, preflight, resolver, semantic + types) | 30/30 original G1 checks pass **unchanged** against the compiled modules; T-08 hashes identical (`c070f13c4792b7f7…`) |
| `det` CLI (`validate` / `inspect` / `plan`) | `src/core/cli/`, `bin/det.js` | 14 new checks (T-15…T-18) incl. exit codes 0/1/2/3, no-write/dry-run, env/flag precedence |
| CLI runtime contract family | `schemas/cli/` (adapter-descriptor, adapter-input, tool-run) + README | Validates in CI; converter 21-code diagnostic registry untouched; process-level codes live in open `runDiagnostics` |
| Out-of-process adapter runtime | `src/core/adapter-runtime.ts` | 4 failure paths proven with fake adapters: `ADAPTER_EXIT_NONZERO`, `ADAPTER_TIMEOUT`, `ADAPTER_OUTPUT_INVALID_JSON`, `ADAPTER_OUTPUT_CONTRACT_VIOLATION` |
| Magento Page Builder read-only adapter | `adapters/magento-pagebuilder/` (descriptor + scanner) | Synthetic fixture (13 capabilities) + live audit (78 capabilities) below |
| Determinism proof | `stableContentHash` (strips all observation timestamps); committed `expected-registry.json` | Two live audit runs: identical `volatileContentHash`; fixture projection compared every CI run |
| Deny list / portability / neutrality | adapter DENY_RULES + T-09/T-18b scans | Planted `env.php`/`auth.json`/denied content-type fixtures: markers never leak; no owner paths in shipped surfaces; core has zero platform literals; no licensed Hyvä source |

## Test gate

`npm test` = build (tsc strict, noEmitOnError) + **44/44 checks**: the 30-check G1 suite (schema validation, 14-case negative plan, determinism, neutrality, two-family portability) + 14 CLI/adapter checks. Exit code of the gate is the CI gate (`.github/workflows/validate.yml`).

## Deterministic exit codes

| Code | Meaning |
|---|---|
| 0 | succeeded (warnings allowed) |
| 1 | completed with blocking (error-severity) diagnostics |
| 2 | usage error (unknown flag/command, missing required input, unreadable input file) |
| 3 | adapter runtime failure (crash, timeout, output contract violation) |

## Synthetic Magento-like proof (clean-clone portability)

`tests/fixtures/synthetic-magento-like/` is a miniature Magento-shaped tree (composer.lock version truth, `config.php`, per-file content types, widget.xml, DI registry, planted `env.php`/`auth.json`, a denied-surface content type, an out-of-scope module). `det inspect` on it: exit 0, 13 capabilities, platformVersion `2.4.8-p5` read from composer.lock, honest classifications — enabled→`registered` (config-declaration evidence), disabled→`discovered`, non-UI DI registries→`chrome` — zero secret-marker leakage, `LOCATOR_OUT_OF_SCOPE` for out-of-profile paths. The non-Magento synthetic (`synthetic-flatcms`) fails closed with `ADAPTER_NOT_APPLICABLE` (exit 1) and still runs `plan` end-to-end.

## Live read-only audit (gate 4 — caller-provided local checkout)

Target: the Owner's local Magento CE checkout (gitignored profile `profiles/magento-pagebuilder.local.json`, resolved per run; **the path never enters any committed file or payload**).

- Revision pinned: `66aff1ebd4cda9152a5e70635766b8030b10ff88`; platform: Magento CE **2.4.8-p5** (composer.lock), Page Builder module **2.2.6-p5**.
- Runtime ~0.4 s, exit 0; **78 capabilities**: 34 `native` (33 `Magento_PageBuilder` + 1 `Magento_PageBuilderImageAttribute` re-declaration), 33 `widget` (incl. **Secomm_UiWidget: 21 DI-registered components + 1 widget**), 11 `chrome` (Secomm_NotificationEmail 10, Secomm_FlashSale 1 — out of CMS-page scope, metadata-only).
- Proof honesty: all 78 carry `proofLevel: registered` justified by config-declaration evidence + `config.php` enablement, each with a `NOT_VERIFIED` warning: **declaration-only probe — props, nesting, editor semantics, responsive behavior NOT audited; installed=enabled=declared ≠ runtime-proven.** `ADMIN_ROUNDTRIP_VERIFIED` count: **0**.
- Determinism: two consecutive live runs produced identical registry `volatileContentHash`.
- Deny list: `env.php` and `auth.json` exist on the target and are reported as deny-listed (existence only); no credential content in the payload; no absolute paths in the payload (`source://` locators only).

Classification ladder applied: `DISCOVERED`/`REGISTERED` only; `ADMIN_ROUNDTRIP_VERIFIED` and `VISUALLY_VERIFIED` are unclaimed and unclaimable in this gate (semantic validator hard-rejects overclaims).

## Known limits (explicit unknowns)

- `acceptedProps`, nesting rules, editor forms (`pagebuilder_*_form.xml`), responsive rules: **not audited** by this declaration-only probe (NOT_VERIFIED per capability). `plan` consumes the G1 harness structure shape; real PageStructure materializes at G2.
- `magento-specs` MCP: not used at runtime; portable tests pass with zero MCP (T-09/T-18b + synthetic fixtures). Optional agent-side usage is documented in the `det-cli` skill with a manual CLI fallback.
- Deep PHP AST (ADR OPEN_DECISION #3): not needed — all surfaces read were declarative (XML/composer/PHP-array config).

## What this receipt does NOT claim

No Figma extraction, no structural mapping of a real design, no Page Builder Admin edit/save proof, no storefront/visual proof, no importer, no production change. #5 G2/G3/G4 remain not implemented; #9's later stages require separate Owner GOs.
