# [30] Independent Review + Annex — DET Studio SQLite & Artifact Architecture

**Status:** INDEPENDENT-REVIEW RECEIPT + AMENDMENT ANNEX — docs only, no DB implementation, no code changes to [28] or [29] · 2026-11-09 · **R2:** coordinator corrections **C1–C3** applied (see [PR #32 review](https://github.com/thanhle74/design-engineering-toolkit/pull/32#issuecomment-6732338324), all evidence re-verified against `main` source before editing)
**Reviewed target:** Draft [PR #31](https://github.com/thanhle74/design-engineering-toolkit/pull/31) — `specs/DET-PERSISTENCE-AND-KNOWLEDGE-ARCHITECTURE.md` @ `d8f80e9` on `docs/30-studio-sqlite-artifact-architecture` (one commit on `main` `9495f43`).
**Scope:** [Issue #30](https://github.com/thanhle74/design-engineering-toolkit/issues/30) — architecture decision only.
**Authority refs (read and verified in this session):** `specs/knowledge-foundation/TECH-ADR.md` (ADR-1..5, OPEN_DECISIONS #1/#6), `schemas/cli/tool-run.schema.json`, `schemas/project-profile.schema.json`, `schemas/kb/kb-ingest-manifest.schema.json`, `schemas/kb/kb-store.schema.json`, `schemas/cli/content-manifest.schema.json`, `schemas/README.md` (Draft 2020-12, integer-major versioning, `additionalProperties: false`), `specs/DET-STUDIO-MVP.md` (on `origin/task/29-det-studio-nextjs-mvp`), `.github/workflows/validate.yml` (Node 22), `package.json` (`engines.node: ">=20"`).

---

## 1. Independent review verdict

**Verdict: ACCEPT-WITH-AMENDMENTS (architecture level).** PR #31's three-concern split (SQLite operational catalogue / versioned JSON-JSONL KB SSOT / immutable file artifacts) is sound, correctly preserves ADR-3's "index is a cache, never truth" rule, and correctly leaves [28]/[29] untouched. Six gaps must be closed before the architecture can be accepted as complete against issue #30's deliverables. They are filled by Annexes A–E below; none require changing PR #31's core design — they make it inspectable and implementable. **R2:** the coordinator's review confirmed the direction and required three precision corrections (C1–C3), applied in this revision — the current `tool-run` envelope is *not* yet a complete build-bundle manifest (C1, Annex A), the run retry/idempotence wording was self-contradictory (C2, Annex C), and the profile *envelope*, not just the nested profile, must be stored and hashed (C3, Annex B).

| #30 question | PR #31 coverage | Verdict | Filled by |
| --- | --- | --- | --- |
| Q1 deployment topology | §1/§4: one Studio server + SQLite on local disk; CLI standalone; multiuser needs real auth first | **ACCEPT** | — (matches [29] §5 "single local trusted operator MVP") |
| Q2 data ownership + canonical config schema + stable IDs/hashes | §3 tables defined; config schema named only as "nonsecret config JSON" | **PARTIAL** | Annex B |
| Q3 minimal schema, indexes, FK/invariants, transactions, statuses, idempotence, run pinning | §3 constraints in prose; statuses listed; write-safety in §4 | **PARTIAL** | Annex C |
| Q4 concurrency/backups | §4 WAL, short transactions, backup/restore incl. files, reconcile-missing | **PARTIAL** — retention policy absent | Annex C (retention) |
| Q5 security | §4 credential refs, realpath containment, download routes, licensing | **PARTIAL** — allowlisted source roots + preview-URL gating implicit only | Annex E + §7 gates |
| Q6 integration seams [28]/[29] + smallest next slice + GO/NO-GO | §5/§6 phase list, [28]-owned `det build` noted | **PARTIAL** — seam map not concrete; phase acceptance missing | Annex E + §7 |

**Two factual corrections for the record:**

1. **`schemas/cli/content-manifest.schema.json` is NOT the run artifact manifest.** It is the caller-supplied *literal content* manifest from [23]/G3 (`valueRef`→text/media/link entries pinned to a `sourceRevisionId`). Any persistence implementation that treats "content manifest" as the artifact index will conflate two different contracts. The *per-command* artifact index is `tool-run.json` → `artifacts[]` — which itself is not yet the complete build-bundle manifest (Annex A.1).
2. **Live branch state (measured 2026-11-09):** `origin/task/28-det-preview-theme-figma-homepage` is **0 commits ahead of `main`** (tip = `9495f43`); `origin/task/29-det-studio-nextjs-mvp` is **2 commits ahead, specs only** (`specs/DET-STUDIO-MVP.md`, `specs/DET-STUDIO-PARALLEL-WORKERS.md`), no app code. `DetRunReader` and [28]'s one-shot `det build` + artifact bundle are therefore **contracted, not built**. The phased sequence in §7 must not assume either surface exists yet; "DetRunReader" seam statements below map to the *spec'd contract*, not shipped code.

---

## 2. Annex A — JSON artifact contract (run bundle) — corrected per C1

**Two different artifacts must not be conflated** (this is correction C1; evidence re-verified against `main` source in this session):

### A.1 What exists today: the per-command `ToolRun` envelope (current facts, verified)

Every `det` invocation emits `tool-run.json` (`schemas/cli/tool-run.schema.json`, major 1): required `schemaVersion, tool, command, exitCode, generatedAt, runDiagnostics`; optional `profileId, platformId, adapter, artifacts[], converterDiagnostics, counts, wroteFiles`. Its `artifacts[]` entries are `{role (closed additive enum), file (relative path under --out, optional), schemaRef ($id), contentHash}`.

**This envelope is a per-command execution record — it is NOT yet a complete, schema-valid build-bundle manifest.** Verified gaps (as of `main` `9495f43`):

1. **Schema/implementation drift:** `src/core/cli/commands/compose.ts:409` emits `artifact("compose-report", …)`, and the TypeScript union in `src/core/run-envelope.ts:16` includes `"compose-report"`, but the closed `role` enum in `tool-run.schema.json` **omits it** — a compose envelope is not schema-valid as written.
2. **Unindexed output files:** `compose.ts:414` writes `native-content.html` with **no corresponding `artifacts[]` entry** — the envelope's file index is incomplete for raw/native output.
3. **File-less entries:** some entries (e.g. `adapter-descriptor`, `compose.ts:410`) carry no `file`; a per-file byte hash cannot be asserted for them at all.
4. **Hash semantics:** `run-envelope.ts:80` computes `contentHash` over the **canonical JSON payload** (`contentHash(payload)` / `sha256Hex(canonicalStringify(payload))`) — not a SHA-256 of the literal on-disk bytes. An R1-draft rule that hash-verifies files by comparing `contentHash` to file bytes was wrong and is withdrawn.

### A.2 What [28] must own: the final immutable build bundle manifest (requirement, not design)

[28] (unchanged by [30]) must deliver the **schema-conformant final output inventory** for raw/native artifacts (native PB HTML, PHTML, CSS, assets). Requirements the contract must meet, whatever shape [28] chooses:

- **Complete:** every file written by the run appears in the manifest — including `native-content.html` and any preview-theme output; an unindexed written file is a contract violation.
- **Byte-verifiable:** every indexed file carries a hash of its **literal on-disk bytes** (SHA-256), distinct from the payload `contentHash` semantics above; file-less informational entries stay expressible.
- **Schema-conformant, no silent major-1 change:** closing the `compose-report` enum drift and adding byte-hash/byte-size fields must go through the family's own additive-versioning rules (`schemas/cli/README.md`), never by hand-editing a closed major.
- **Deterministic:** same inputs ⇒ same manifest (ADR-2 canonical rules).

[30] does not design this schema here — designing or implementing it is [28]'s task.

### A.3 What the SQLite persistence slice may rely on

```text
artifacts/<projectId>/<runId>/
  <final bundle manifest per the A.2 contract>   # SSOT for what is in the bundle
  <every file the manifest indexes>
```

1. **SQLite `artifacts` rows are derived from — and validated against — the final A.2 bundle manifest, never authored independently, and never derived from the per-command envelope alone.** On registration the slice re-validates the manifest with ajv and verifies each per-file-byte hash against the stored bytes; any disagreement is `MISSING`/`CORRUPT`, never silently dropped.
2. **Until the A.2 contract lands ([28] / phase P2), bundle registration is BLOCKED.** The interim per-command `ToolRun` envelope may be stored and displayed as-is (it is what `DetRunReader` consumes), but it must not be treated as the verified persistence unit. **No schema fix for the A.1 drift is implemented under [30]** — it belongs to [28]'s additive-versioning pass.
3. **Derived DB-only columns** (`byteSize`, `mediaType`, per-file-byte hash) are computed at registration time from verified bytes; the JSON contracts stay frozen at their own versioning rules.
4. **Dedup is an optimization, never correctness:** identical inputs produce hash-identical bundles (canonical JSON + byte hashes); V1 may store per-run copies.
5. **Write path (refines PR #31 §4):** staging dir → ajv-validate final manifest → byte-hash-verify files → atomic rename to final run path → one short SQLite transaction writes the run row + artifact rows + terminal status. A crash between rename and commit yields an `INTERRUPTED` run or an orphan staging dir reconciled by a maintenance sweep — never a half-catalogued run.
6. **Diagnostics:** full `runDiagnostics`/`converterDiagnostics` arrays stay in the run's JSON inside the bundle. SQLite stores only terminal status, diagnostic *count* and top-level codes for listing; the bundle remains the diagnostic SSOT.

---

## 3. Annex B — canonical config schema and stable IDs — corrected per C3

1. **Canonical project config document = the whole validated `schemas/project-profile.schema.json` envelope.** The schema's top level requires `schemaVersion` and `profile` (`profile` carrying required `id, name, businessContext, sources, aesthetic, targets, content, platform, safety`; optional `description, gates`). The `projects` table stores and hashes the **whole validated envelope document** — not only the nested `profile` — so schema version and validation context stay authoritative with the data:
   - `profileId` = `document.profile.id` (schema pattern `^[a-z0-9][a-z0-9-]*$`) — the human-stable identifier used in every CLI call, artifact path segment and export;
   - `configHash` = SHA-256 over the **entire envelope document** (`{schemaVersion, profile}`) serialized by the existing canonical rules (ADR-2, sorted keys) — the pin a run freezes;
   - `configSchemaVersion` = `document.schemaVersion`, stored as its own column so a future envelope-major bump is visible in listings without re-parsing JSON.
2. **Run identity pin** (frozen at run creation): `(profileId, configHash, source revision id, pinned KB snapshot identities, det tool version)`. Old runs stay explainable because every component of the pin is immutable after creation.
3. **Secrets:** `profile.sources` carries *paths/roots, never tokens*. Any credential lives in env/secret store referenced by name only; validation rejects token-shaped values in config (extends the existing deny-list/planted-secret test culture).
4. **Authorization never uses row IDs or slugs as capability.** Project scoping is enforced server-side per session/user once team auth lands ([29] §5 and PR #31 §4 agree; both defer to the team gate in §7).

---

## 4. Annex C — schema hardening: indexes, invariants, transactions, statuses, retention

Concrete minimum for the five-table catalogue of PR #31 §3 (plus one amendment):

**Amendment R1 — include `run_kb_snapshots` in the initial migration.** PR #31 defers it ("only if real runs require multiple independent snapshot versions"). KB-1/KB-2/KB-3 are independently versioned namespaces from day one (`kb-ingest-manifest` is per-namespace: `manifestId, platform, inputs, visibilityPolicy`), so a run pinning all three **always** references ≥3 independent snapshot identities. Deferring the join table guarantees a migration in the first implementation slice anyway. Model it now: `run_kb_snapshots(run_id, kb_snapshot_id, role)` with PK `(run_id, role)`.

**Indexes / uniqueness:**

- `projects`: UNIQUE(`slug`); the profile `id` *is* the slug (one name, not two).
- `design_sources`: UNIQUE(`project_id`, `provider`, `fileKey`, `nodeId`).
- `kb_snapshots`: UNIQUE(`content_hash`, `source_fingerprint`); INDEX(`scope`, `lifecycle`).
- `runs`: `id` UNIQUE (the sole unique run identity); **non-unique** `input_fingerprint` INDEX = hash of `(project_id, source_revision, config_hash, kb_pins_hash, tool_version)`; INDEX(`project_id`, `created_at`); optional indexed `supersedes_run_id`.
- `artifacts`: UNIQUE(`run_id`, `file`) — matches `tool-run.artifacts[]` uniqueness; INDEX(`content_hash`) for future dedupe.
- FKs ON, `ON DELETE RESTRICT` everywhere (lifecycle is `ARCHIVED`/`STALE`, per ADR-3 "deletes are not an operation" — no cascade deletes in V1).

**Status transitions (`runs.status`, closed set from PR #31):**

```text
CREATED → RUNNING → {SUCCEEDED | PARTIAL | FAILED | INTERRUPTED}
RUNNING → INTERRUPTED (crash recovery / watchdog)
```

No transitions out of a terminal state.

**Retry/duplicate behavior (corrected per C2 — the R1 draft's UNIQUE-on-retried-key wording was self-contradictory and is withdrawn):**

- The **run `id` is the only unique run identity**; `input_fingerprint` is a **non-unique** index. Two runs with identical inputs are legitimately distinct rows.
- **A retry always creates a NEW run row** carrying the same `input_fingerprint`; V1 has **no same-run replay**: a run row is written once at `CREATED` and once at its terminal transition, never rewritten or reused (`supersedes_run_id` is an optional operator-facing link between a retry and the run it replaces — provenance convenience, not truth rewrite).
- Listings/UX may **group** runs by `input_fingerprint` ("5 runs with identical inputs — latest SUCCEEDED") but the DB keeps every row; counting, cost and audit stay per-run.

**Transactions:** WAL, `busy_timeout`, every write inside one bounded transaction; the run lifecycle uses at most two: (1) INSERT run `CREATED` (+pins), (2) on completion UPDATE status + INSERT artifacts. All file writes happen *outside* transactions (Annex A rule 4).

**Retention (absent from PR #31 — explicit policy):**

- Default: **keep everything** referenced by a non-deleted project; disk is the budget, not the schema.
- Allowed automated cleanup, V1 only: orphan `INTERRUPTED` staging directories older than a configured threshold; superseded *derived* indexes. Both are re-derivable or never-catalogued.
- Project/run deletion is an explicit operator action in a later slice; it must refuse while any artifact row is referenced (FK RESTRICT) and record an audit note. No auto-retention of run history in any phase.

---

## 5. Annex D — driver compatibility spike (documented OPEN; nothing installed)

This formalizes TECH-ADR **OPEN_DECISION #1** (`better-sqlite3` vs `node:sqlite`) for the Studio catalogue; the KB FTS5 index question is the same decision, same spike.

**Measured on the owner machine (2026-11-09, this session, read-only probe):**

| Fact | Value |
| --- | --- |
| Local Node | v24.22.2 (matches TECH-ADR machine check) |
| `node:sqlite` unflagged | **loads and executes** (`DatabaseSync`, in-memory CREATE TABLE) |
| Bundled SQLite version | 3.53.4 |
| FTS5 virtual table creation | **succeeds** (probed via `--experimental-sqlite`; also available unflagged on this Node line) |
| `better-sqlite3` | **not installed** — deliberately, per issue #30 ("rather than installing blindly") |

**Compatibility matrix to verify at implementation time (the actual spike):**

| Runtime | `node:sqlite` | Implication |
| --- | --- | --- |
| Node 20/21 (permitted by `engines.node: ">=20"`) | absent | Studio must either raise the floor or not use `node:sqlite` |
| **Node 22 (CI pin, `validate.yml`)** | present but **behind `--experimental-sqlite`** (22.5.0+) | CI/dev need the flag, or `better-sqlite3` |
| Node 23.4+/24 (owner machine) | unflagged, still Experimental-status upstream | current measured basis |

**Spike acceptance criteria (one bounded slice, before any migration code):** on the exact Node line pinned for Studio runtime: (1) `node:sqlite` (or `better-sqlite3`) opens a file DB with WAL + FK enforcement ON; (2) FTS5 module available (`CREATE VIRTUAL TABLE ... USING fts5`); (3) online-backup API usable; (4) 20-line catalogue prototype performs the two Annex-C transactions; (5) install/rebuild story recorded for `better-sqlite3` (native ABI coupling to Node majors) vs zero-install `node:sqlite`. **Decision rule:** prefer `node:sqlite` iff the Studio runtime Node floor is ≥ 23.4 (accept the Experimental label + write the floor into `package.json`); else `better-sqlite3`. Either way the catalogue is behind one thin store module so the choice stays reversible. **No driver, ORM or migration tool is installed in this architecture phase.**

---

## 6. Annex E — integration seam map (running branches unchanged)

| Seam | Contract today (verified) | Persistence slice maps it by | Change to [28]/[29] |
| --- | --- | --- | --- |
| [29] `DetRunReader` | Spec'd in `specs/DET-STUDIO-MVP.md` §3: typed boundary over real `tool-run.json` + NodeIR/PageStructure/SourceReview/compose-output; explicit DEMO/FIXTURE mode; "preview unavailable" when unverified; no invented IDs/status | Later, Studio's reader gains a second implementation backed by the SQLite catalogue (`listProjects/runs/artifacts`) with **identical view models**; fixture mode remains for demo | none — additive consumer |
| [29] file-route security | Spec'd §5: configured DET output roots only, `realpath` containment, symlink traversal blocked, extension/MIME/size validation, no absolute paths exposed | Download/preview routes keep the same guard and additionally resolve only through `artifacts` rows (path comes from the DB index, then is `realpath`-contained) | none |
| [28] one-shot `det build` + artifact bundle | Contracted in issue #28; **branch has no code yet** (0 ahead of main). Envelope + `artifacts[]` already exist on `main` | Persistence slice consumes whatever bundle [28] emits **iff** it is a `tool-run` envelope with hash-verified files; anything else is `UNSUPPORTED_BUNDLE`, not guessed | none — [28] keeps schema ownership |
| KB engine (`det kb ingest/sync/query/validate`) | Shipped (issue #15): JSONL records + `kb-store.json` descriptor (`storeId, generator, platforms, projects, counts`) + per-namespace ingest manifests | `kb_snapshots` rows reference manifests by relative path + `content_hash` + `source_fingerprint`; refresh compares fingerprints exactly as PR #31 §2 describes | none — no second knowledge engine |
| Fingerprint/staleness | ADR-4: same tree + pinned revision ⇒ same JSON hash; digests power incremental sync | `STALE` marking and targeted re-`sync` are existing engine semantics; Studio only records and surfaces them | none |

**Preview URLs (issue Q5):** a run's preview may be served only after (a) the run bundle verified (Annex A rule 1) and (b) the artifact serving that preview has a verified hash row. Until then the UI must show `PREVIEW_UNAVAILABLE` — this is already a [29] truthfulness rule and is here pinned as a persistence-level precondition too.

---

## 7. Phased sequence and GO/NO-GO acceptance (issue #30's exact order)

| Phase | Entry | Deliverable | GO/NO-GO acceptance |
| --- | --- | --- | --- |
| **P1 — [29] fixture UI** | specs merged (done, 2 commits) | Studio UI on schema-shaped fixtures, truthful states, `DetRunReader` boundary | NO-GO if any invented ID/status/preview appears, or fixtures drift from real schemas |
| **P2 — [28] standalone artifacts/manifest** | issue #28 scope | one-shot run producing a bundle with the **final complete build-manifest contract (Annex A.2)**: full file inventory incl. native HTML/PHTML/CSS/assets, per-file-byte hashes, schema-conformant via additive versioning (also closes the A.1 `compose-report` enum drift there, not under [30]); preview-theme isolation | NO-GO if any written file is unindexed, hashes are payload-only, or the closed major-1 schema is silently edited, or SQLite becomes a dependency of `det` |
| **P3 — SQLite persistence slice** | P1+P2 accepted (bundle registration is **BLOCKED until P2's A.2 contract lands**); Annex D spike executed | five tables + `run_kb_snapshots` (R1), migrations, backup/restore incl. artifacts, Annex A.3 registration+verification, Annex C retention sweep | NO-GO without restore test proving DB+files together, or without the retry test proving **new run per retry with equal `input_fingerprint`** and no truth rewrite |
| **P4 — Studio real read integration** | P3 GO | reader backed by catalogue; download/preview through verified artifact rows; seam table above | NO-GO if any route bypasses realpath/hash verification |
| **P5 — team deployment security gate** | P4 GO | real auth, per-project authorization, secret policy, concurrency/backup ops runbook | NO-GO for any multiuser hosting before this gate passes; single-operator mode remains valid without it |

**Smallest subsequent implementation slice (issue Q6):** P3 alone — migration + backup/restore + bundle registration/verification + the two transactions, no Studio UI change, no [28]/[29] change. It is independently testable and immediately useful to [29]'s fixture UI as a drop-in reader backend.

---

## 8. Open items for Owner decision

1. Accept Amendment **R1** (`run_kb_snapshots` in initial migration) — recommended, cheap now, expensive later.
2. Confirm Studio runtime Node floor. `engines.node: ">=20"` is the CLI floor; Studio may declare its own higher floor (≥ 23.4 keeps `node:sqlite` viable per Annex D). This is a policy call, not a code change today.
3. TECH-ADR OPEN_DECISION #6 (KB-3 private-material storage venue) interacts with `kb_snapshots.scope`/`visibilityPolicy`; decide before P3's first private-project snapshot design.

---

## 9. Receipt

- **Base:** `main` `9495f43`; this branch adds **this one doc** — no code, no schema files, no DB, no driver installs.
- **R2 (2026-11-09):** coordinator corrections **C1–C3** ([PR #32 review](https://github.com/thanhle74/design-engineering-toolkit/pull/32#issuecomment-6732338324)) applied; every C1 claim independently re-verified in `main` source before editing (`compose.ts:409-414`, `run-envelope.ts:16/80`, `tool-run.schema.json` role enum). No runtime changes; the A.1 enum drift is explicitly left to [28]'s additive-versioning pass, not fixed under [30].
- **Independent evidence gathered this session (all read, not assumed):** PR #31 content and commit; `origin/task/28...` = `9495f43` (0 ahead); `origin/task/29...` = 2 spec commits; `DetRunReader` appears in [29] specs only; `tool-run.artifacts[]` shape; `project-profile` required fields; `kb-store`/`kb-ingest-manifest` shapes; `content-manifest` purpose; CI Node 22; `engines >=20`; local Node v24.22.2 `node:sqlite` + FTS5 probe; `better-sqlite3` absent.
- **Not done, by scope:** no DB migration, no live data, no [28]/[29] edits, no Figma/Magento writes, no merge (Draft PR for Owner review).
- **Relationship to PR #31:** this doc is the issue's required *independent-review handoff* plus the annex closing its deliverable gaps (JSON artifact contract, migration/backup/retention detail, documented driver spike, seam map, phased GO/NO-GO). Integrator may fold Annexes A–E into PR #31 or keep this as the companion receipt — either satisfies issue #30's deliverables without a second ADR.
