# TECH-ADR — Technology selection for the knowledge foundation

> **Status:** DRAFT for Owner review (issue [#7](https://github.com/thanhle74/design-engineering-toolkit/issues/7)). Each decision follows **Chosen / Alternatives / Trade-offs / Evidence / When-to-revisit**. Decisions marked `OPEN_DECISION` state the exact proof needed and the owner action. This ADR covers the *knowledge foundation* layer only; it does not commit the #5 converter or the V1 Figma pipeline to anything.
>
> Ground rule from the issue: **do not preselect TS because Figma uses JS, or Python because AI is involved.** The comparison below is evidence-weighted.

## Context facts (measured, not assumed)

| Fact | Value | Source |
|---|---|---|
| Toolkit repo state | 11 `.md`, 10 `.json`, 5 `.svg`, 5 `.png`; **zero code files**; no package manifest, no CI | repo census, HEAD `82c9129` |
| Existing technology precedent | "JSON Schema via `ajv` in CI once implementation phase P1 lands" — deferred to P1, never frozen | [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §5 |
| Canonical artifacts | JSON Schema **Draft 2020-12**, integer-major versioning, `additionalProperties: false`, string aliases ("contracts stay pure JSON") | [schemas/README.md](../../schemas/README.md) |
| Audited platform stack | Magento CE 2.4.8-p5 (PHP `~8.2||~8.3||~8.4` declared), Hyvä default theme 1.5.2, Tailwind CSS v4.3.2, Alpine 3 + CSP build, Hyvä UI 2.8.0 (require-dev, commercial) | composer.json/lock, theme files (W-A/W-B receipts) |
| Knowledge scale | hundreds–low-thousands of records per project (118 `app/code` modules, 921 `etc/*.xml`, 36 Hyvä UI component families/70 variants, 21 widgets, ~55 KB-3 records for the pilot) | W-A/W-B/W-C receipts |
| Operator machine | Node v24.22.2 + npm 11.19.1 present (Claude Code depends on Node); Python 3.14.8 present; `uv` absent; PHP 8.3.36 present | machine check (W-D) |
| Sibling alignment (PR #6, open, read-only reference) | adopt ideas not dependencies; determinism gate "same input + pinned manifests ⇒ identical JSON hash"; registry = enabled registry; no vendoring; portability via CLI/env/gitignored profile | PR #6 diff summary (W-D) |

---

## ADR-1 — Language & runtime

**Chosen: TypeScript on Node** — one language for core + adapters; platform-specific analysis (e.g. deep PHP AST, when someday justified) runs as an **out-of-process adapter** in whatever language the target needs (`nikic/php-parser` in a PHP subprocess being the canonical example; PHP 8.3 is present wherever a Magento project is).

**Alternatives:** Python 3 (+ uv/pipx); TS core + Python analysis split; Go/Rust single binary (rejected without deep dive: no ecosystem precedent in this repo, weaker agent iteration loop, no JSON Schema runtime story as mature as ajv).

**Trade-offs:**
- *Schema safety:* the repo's canonical layer is JSON Schema 2020-12. In TS, ajv validates contracts and schema-first codegen (`json-schema-to-typescript`/`json-schema-to-ts`) keeps code types derived — one source of truth, drift is a CI failure. In Python, JSON Schema validation (`jsonschema`) and the data-model layer (pydantic) are two type systems needing a codegen bridge with known 2020-12 gaps. Existing precedent already names ajv; honoring it is free, replacing it rewrites the one normative tooling sentence in the SSOT.
- *PHP analysis:* the supposed Python/PHP-side advantage dissolves on evidence — everything KB-1 needs in this phase (XML declarations, registries, lockfile, enablement map, module topology) is declarative; **deep PHP AST is out of scope** for the knowledge foundation and, when it ever matters, is language-neutral behind an adapter subprocess (see ADR-4).
- *Distribution:* `npx` runs with zero new tooling for the owner (Node already installed and maintained because Claude Code requires it); Python via uv/pipx adds a first-install + venv model for a solo owner.
- *CI:* tie (setup-node vs setup-python are both one-step).
- *Agent-friendliness (the primary operator is an AI agent):* `tsc --noEmit` is a single deterministic gate agents re-run cheaply; TS has fewer untyped escape hatches, which measurably constrains hallucinated APIs; MCP reference SDK is TypeScript-first if the KB is ever exposed as an MCP server; snapshot-style determinism tests (PR #6's gate) are simplest in vitest.
- *Honest framing:* this is a **low-regret** decision at this scale — both ecosystems can do the work. TS wins on evidence alignment (SSOT precedent + installed runtime + agent ecosystem), and the regret cost is bounded because the contract layer is language-neutral JSON Schema (ADR-2), so a future rewrite orphans zero data.

**Evidence:** facts table above; `docs/ARCHITECTURE.md` §5; `schemas/README.md`; W-D machine checks.

**When-to-revisit:** (a) a committed hosted-service/daemon requirement appears (out of scope per issue #7's no-services rule); (b) a proven KB capability requires PHP AST *in core* (it belongs in an adapter); (c) owner's secondary machines lack Node but have Python; (d) a required integration exists only as a Python SDK. Revisit = new ADR row, append-only.

---

## ADR-2 — Canonical serialization & validation

**Chosen: JSON Schema Draft 2020-12 stays the canonical, language-neutral contract layer** (existing `schemas/*` untouched in format; KB drafts in [schemas/](schemas/README.md) follow the same conventions). Records serialize as **canonical JSON/JSONL** (pretty JSON for profiles/contracts; JSONL for KB corpora — one record per line, git-diffable, append-friendly). Validation via ajv 8 in CI when implementation lands. **Keep integer-major + additive-minor versioning.**

**Alternatives:** pydantic/TypeBox models as source of truth (rejected: makes reviewed schema files a generated artifact, orphans the contracts); relaxing `additionalProperties` (rejected: unknown fields are how provenance silently erodes — the schemas README explicitly forbids smuggling).

**Trade-offs:** language-neutrality is what makes ADR-1 low-regret; the canonical-serialization rule (sorted keys, stable array order by stable ID, documented hash) adopts PR #6's determinism gate and makes freshness checks cheap hash compares instead of semantic diffs. Superseded records are a record *lifecycle* concern (`supersedes` + history), not a schema-version concern — the existing versioning rule handles the KBs without modification.

**Evidence:** `schemas/README.md` (all quoted rules), `schemas/source-manifest.schema.json` (2020-12 + `$id` + strictness verified), `docs/ARCHITECTURE.md` §5/§10, PR #6 determinism gate.

**When-to-revisit:** a record type proves unexpressible in 2020-12 (e.g. large recursive graph references) → add a separate 2020-12 schema with `$dynamicRef`/anchors before ever changing format.

---

## ADR-3 — Storage & query

**Chosen (minimal viable): git-versioned JSON/JSONL manifests as the only source of truth, three *logical* domains — `kb/platform/`, `kb/ui/`, `kb/project/` — one physical format; plus a derived, gitignored **SQLite (FTS5) index** rebuilt by a single deterministic command. No PostgreSQL. No vector store. No services.**

**Alternatives:** (b) PostgreSQL — rejected: violates the zero-services/laptop premise; at hundreds–low-thousands of records there is no concurrency, durability, or planner problem to solve. (c) embeddings/vector — rejected as default: issue #7 itself forbids blind embeddings; embedding proprietary component descriptions would also create a new licensing surface.

**Trade-offs / rules:**
- Three KBs are **namespaces, not databases**: same record envelope, same provenance block; only required filter fields differ (KB-1: platform+version; KB-2: sourcePackage + license class; KB-3: projectId/tenantId).
- Cross-KB links are plain ID references resolved by the query layer — **not** a graph database.
- The index is a cache, never truth: kill the file, lose nothing.
- Deletes are not an operation: lifecycle is `STALE`/`INVALIDATED`/`ARCHIVED` + `supersedes` (mirrors V1's "deletes are unrepresentable").
- `KnowledgeQuery` filter dimensions are contract-mandated ([CONTRACTS.md §5](CONTRACTS.md)); provenance-on-every-hit is structural (the result envelope requires evidence fields — a query that cannot fill provenance cannot return a record).

**Upgrade thresholds (when Postgres / vectors become justified — concrete):**
- **PostgreSQL:** KB exceeds ~10k records/project **and** warm query latency > ~1s over the full corpus; or multiple concurrent writers need transactional cross-KB invariants; or a second consumer process needs server-backed access.
- **Vector/embeddings:** only after a measured failure of deterministic retrieval — query log over one full milestone shows **>30%** of queries ending in empty structured results that a human resolves by semantic recall; then a **local** index (sqlite-vec / LanceDB-local, never cloud — privacy + zero services) behind the same port as `mode: "semantic"`, provenance identical to every other hit.

**Evidence:** measured scale (facts table); issue #7 storage guidance; PR #6 clean-clone requirement; `docs/quality-gates.md` G1 (provenance as gate).

**When-to-revisit:** the thresholds above firing; `OPEN_DECISION` on driver choice below.

---

## ADR-4 — Ingestion & parsing

**Chosen: local, out-of-process source adapters behind the named ports** (`ProjectSourceAdapter`, `PlatformCapabilityAdapter`, `UIInventoryAdapter`, `RequirementsSourceAdapter` — adopted verbatim from issue #7 §6). Deterministic extraction is the default; LLM-assisted classification is **propose-only** and can never promote a proof level; permission enforcement is structural (one path gateway + negative fixture tests), not documentary.

**Trade-offs / mechanics:**
- Core spawns adapters with a validated input contract and receives JSONL + diagnostics; core never imports platform code; an absent/crashing adapter yields `ADAPTER_NOT_APPLICABLE`/`NOT_VERIFIED` — never a guess.
- The path gateway is the only filesystem entry point: allowlist roots from CLI > env > gitignored local config; `realpath` resolution; deny-globs at walk time; `DENIED_PATH_SKIPPED` diagnostics. Proven by planted-secret fixture tests.
- Deterministic first: same tree + pinned revision ⇒ same JSON hash (PR #6 gate). Digests power incremental sync and re-audit triggers.
- Deep PHP analysis, if ever needed: `nikic/php-parser` as a PHP subprocess *inside the Magento adapter* — the canonical Magento-accurate parser; requires nothing of core. Not needed in this phase (ADR-1).
- Version-aware discovery is mandatory: the audited PB version has **per-file** content-type declarations, not the assumed single `etc/content_type.xml` — a fixed path would silently under-scan.

**Evidence:** W-A/W-B receipts (declaration layers, per-file content types, registry-in-di.xml finding); issue #7 §4/§8; `docs/safety-and-scope.md` §1; `docs/source-audit/method.md`.

**When-to-revisit:** a named KB capability that cannot reach even `DETECTED` from declarative surfaces (files the OPEN_DECISION below).

---

## ADR-5 — Multi-project packaging & distribution

**Chosen: one repository, workspace packaging: `core` (CLI `det` + ports + validation + store/index), `adapters/*` (optional, separately installable, out-of-process, registered by JSON descriptor — never core imports), `profiles/` (data). Distribution V1 = `npx` from the repo/package.**

**Trade-offs:** adapter registration as data keeps core platform-free and lets an adapter be written in any language (the eventual PHP-AST adapter would be a PHP script); per-project roots follow CLI flag → env var → local git-ignored profile precedence, with `PROJECT_SOURCE_NOT_CONFIGURED/NOT_FOUND/NOT_READABLE` diagnostics (PR #6 §9 vocabulary, adopted). **The owner's local absolute paths never appear as defaults anywhere** — committed examples use placeholders; CI includes a clean-clone synthetic project proving portability (IMPLEMENTATION-PLAN M3).

**Evidence:** issue #7 §portability; PR #6 portability checklist; V1 two-profile neutrality precedent (`profiles/`).

**When-to-revisit:** first evidence of a consumer without Node (`OPEN_DECISION` single-binary below).

---

## OPEN_DECISIONS

| # | Decision | Status | Exact proof needed | Owner action |
|---|---|---|---|---|
| 1 | SQLite driver: `better-sqlite3` vs built-in `node:sqlite` (FTS5 availability) | `OPEN_DECISION` | P1 spike: confirm `node:sqlite` + FTS5 stability on the pinned Node version; 20-line index-rebuild prototype | None now; decide at implementation M2 |
| 2 | TS typing: schema-first codegen vs TypeBox-as-ajv-source | `OPEN_DECISION` | First non-trivial schema iteration: measure round-trip drift + CI friction once | None now |
| 3 | Deep PHP AST necessity | `OPEN_DECISION` | A named KB-1 capability that cannot reach `DETECTED` from XML/composer/declarations | File a gap before building any AST path |
| 4 | Semantic retrieval layer | `OPEN_DECISION` | Query log over one full milestone showing >30% structured-filter misses resolved semantically (ADR-3 threshold) | Approve the query-log requirement as part of the implementation plan |
| 5 | Single-binary distribution | `OPEN_DECISION` | Evidence of a real consumer without Node | Defer; revisit on first such user |
| 6 | KB-3 private-material storage venue (sanitized-in-repo vs private store + promotion gate) | `OPEN_DECISION` | Owner policy call; affects sanitization strictness and fileKey handling | Owner decides before KB-3 ingestion milestones go live |
| 7 | First-party Figma fileKey publication policy | `OPEN_DECISION` | Owner policy: may SECOMM fileKeys/URLs persist in public toolkit docs, or must they be parameterized on promotion? | Owner decision; currently V1 docs already publish them |
| 8 | PR #6 merge state | Note, not a decision | This ADR assumes its contracts (registry, proof ladder, diagnostics vocabulary) land via #5's integrator; no dependency created here | Owner reviews #6 in its own lane |

## Alignment with sibling work (issue #5 / PR #6)

No conflicts found. PR #6's conclusions are adopted as *ideas, not dependencies*: independently owned contracts, determinism gate, diagnostics vocabulary (`SUPPORTED / CUSTOM_APPEARANCE_REQUIRED / UNSUPPORTED` — planner-side analogue: `GAP / CUSTOM_REQUIRED / UNKNOWN`), enabled-registry semantics, proof-stage ladder reconciled to KB proof levels in [CONTRACTS.md §2.2.1](CONTRACTS.md). Nothing in this ADR requires #5 or PR #6 to change; if #6's wording ever conflicts, PR review in this repo resolves it.
