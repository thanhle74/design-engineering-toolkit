# Integrator receipt — Issue #14, G2 read-only structural extraction (synthetic gate)

**Status:** `SYNTHETIC_G2_PASS` — implemented and tested against synthetic design-source fixtures only. This receipt claims **no** live design-tool access of any kind (no read of any external design file, including the reserved `245:2`/`245:16` subtrees), **no** design-source write/rename, **no** CMS/DB/storefront write, **no** Admin round-trip, **no** visual verification. `LIVE_FIGMA_READ_ONLY_VERIFIED` is **NOT claimed** — a live read-only provider requires a separate exact Owner GO per the issue gate.

**Gate:** all 51 pre-existing #9 checks pass unchanged; the gate is **64/64** (`npm test` = tsc build + 30 G1 + 21 CLI/adapter + 13 G2 checks). CI: `.github/workflows/validate.yml` on the PR tip.

## Scope delivered

| Deliverable | Where | Evidence |
|---|---|---|
| `NodeIR` materialized (major 1) | `schemas/converter/node-ir.schema.json` | Closed kind/layout/slot enums per CONTRACTS §2; locator-keyed revision-independent ids (`n-`+SHA-256(sourceId␟locator␟kind)[:12]); full inventory incl. hidden/instances/decorations/unknown; worked example `examples/converter/node-ir.g2-fixture.example.json` reproduced byte-identically by a fresh run (timestamps stripped) — G2-T23a/b |
| `PageStructure` materialized (major 1) | `schemas/converter/page-structure.schema.json` | Editorial-only sections; stable `s-` ids; **stable** input pins (registry revision + binding-map hash + NodeIR hash); chrome/hidden/merged/unresolved absent by construction — same evidence |
| `SourceReview` accountability ledger (new, major 1) | `schemas/converter/source-review.schema.json` | Exactly one entry per node: closed `semanticClass` × closed `disposition` + reason + naming hint + `provisionalTarget` (registry category reuse; `custom-required`, `requiresRuntimeData`); counts must equal the NodeIR node count |
| Typed `DesignSourcePort` (interface only) + snapshot-backed impl | `src/core/design-source/port.ts` | Interface per CONTRACTS §1; out-of-scope reads byte-identical (indistinguishable from absent — no leak), graph integrity checked before extraction — G2-T26b |
| Deterministic G2 extractor | `src/core/design-source/extract.ts` | Documented adapter-kind→closed-enum table (unknown stays unknown + `NOT_VERIFIED`); verbatim layout primitives (invalid values → unknown, never guessed); combined-evidence classification precedence (CONTRACTS §6.7); binding reuse via `findBinding` (single source of truth with the resolver) |
| `det extract` command | `src/core/cli/commands/extract.ts`, `args.ts`, `main.ts` | Root comes ONLY from `--design-file`/`--design-node` (no defaults); exit codes 0/1/2/3; no-write default, truthful `--out` receipt, `--dry-run` — G2-T25a |
| Design-source fixture adapter (out-of-process) | `adapters/design-source-fixture/` (descriptor + reader) | Same descriptor mechanism as #9 (read-only `const true`), discriminated by `outputContract`; bounded subtree reads, node budget, no traversal, plain-filename rule, dangling refs pass through for core fail-closed checks |
| Synthetic fixtures + worked examples | `tests/fixtures/g2-design-source/`, `tests/fixtures/negative/profile-g2-design-*.fixture.json`, `examples/converter/*.g2-fixture.example.json` | Tree A: chrome, ambiguous bare `Footer`, 40/60 nested row, slots, shared component def + 2 instances, hidden section, top-level + nested decorations, external unsupported widget, unknown layer — 25 nodes, every one accounted for |
| `det plan` dual input (additive) | `src/core/cli/commands/plan.ts` | Real `PageStructure` identity/pin checks (profile, registry revision, binding-map stable hash) → normalized onto the existing resolver; G1 harness shape still accepted (all 51 #9 tests untouched) — G2-T27a |
| Neutrality over new surfaces | G2-T28 | Zero platform literals/owner paths across the 3 new converter schemas, the transport schema, compiled extract/port/command modules, adapter descriptor, fixtures and examples |

## Accountability proof (tree A, pinned registry + bindings)

`25/25` nodes inventoried and dispositioned: `MAPPED 11 · EXCLUDED_WITH_REASON 5 · DECORATION_MERGED 2 · REFERENCE_ONLY 3 · NEEDS_REVIEW 4`. Classes: `SITE_CHROME 3 · EDITORIAL_SECTION 11 · SHARED_COMPONENT 6 · PRESENTATIONAL 2 · UNKNOWN_OR_AMBIGUOUS 3`. Key behaviors asserted exact (G2-T24a):

- `SITE/Header` subtree → `SITE_CHROME`/`EXCLUDED_WITH_REASON` ("theme-owned, retained in audit"), absent from the plan.
- Bare `Footer` container (no semantic hint) → `UNKNOWN_OR_AMBIGUOUS`/`NEEDS_REVIEW` — **never** excluded by label, never planned.
- Hidden section → inventoried with `visible:false`, excluded with reason, subtree excluded.
- Both `ProductCard` instances resolve through ONE binding keyed on the definition's hashed node id (G2 vocabulary, CONTRACTS §5.3) → `flatcms/teaser` exact target + `bindingId`.
- External widget instance (`componentRef` outside scope) → `NEEDS_REVIEW` + `custom-required` — no fabricated mapping.
- Unknown kind `mystery-box` → `kind:"unknown"` + `NOT_VERIFIED` warning — never guessed into a near-miss bucket.
- Without `--registry`: instances stay `NEEDS_REVIEW`/`custom-required`, sections honestly `unmapped` (exit 0 with warnings — pendency is reported, blocking belongs to later gates).

## Negative / safety proof

| Case | Result | Check |
|---|---|---|
| Cyclic subtree / dangling child / duplicate locator | exit 1, `EVIDENCE_MISSING`, **zero artifacts** | G2-T26a |
| Unknown selected root | adapter refuses (bounded read) → exit 3 `ADAPTER_EXIT_NONZERO` | G2-T26b |
| Out-of-scope port reads | byte-identical `LOCATOR_OUT_OF_SCOPE` (indistinguishable from absent) | G2-T26b |
| Cross-project registry | exit 1 `INPUT_CONTRACT_MISMATCH`, nothing extracted | G2-T26c |
| Stale binding/registry pin (extract AND plan) | exit 1 `EVIDENCE_MISSING` | G2-T26c, G2-T27a |
| Tampered `bindingMapContentHash` pin | plan exits 1 pre-resolution | G2-T27a |
| Revision bump | same node ids (locator-keyed), new payload hash + pins | G2-T25c |
| Determinism | two runs → identical `volatileContentHash`, byte-stable examples | G2-T25b, G2-T23b |
| No-write / dry-run / truthful receipt | disk = receipt = terminal | G2-T25a |
| Second design source (source B, different locator grammar) | same core rules, invalid `componentRef` flagged, zero cross-source leakage | G2-T27b |

## Honest limitations (not claimed)

- `NODE_ID_COLLISION` is enforced as a hard guard but is **not cryptographically triggered** in tests (48-bit truncation collisions are not constructible in a fixture); duplicate-locator identities are the exercised negative.
- Layout values are preserved **verbatim** from the adapter's normalized primitives — no auto-layout inference; unsupported/invalid values stay `unknown` with a warning.
- Structural containers without component identity are inventoried and planned structurally but are **not** binding-resolved by `det plan` (that is the later gated serializer stage's scope).
- The G1 harness shape retirement (CONTRACTS §4) is staged follow-up, deliberately out of this gate to preserve the 51 #9 tests.
- No live design-source adapter ships here. The prepared seam is descriptor + snapshot transport (ADR-014-002/008); a live provider is a separate authorized task with credentials only from the caller's environment.
