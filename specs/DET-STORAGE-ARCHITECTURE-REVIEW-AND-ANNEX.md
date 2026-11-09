# [30] Independent Review + Annex — DET Studio SQLite & Artifact Architecture

**Status:** INDEPENDENT-REVIEW RECEIPT + AMENDMENT ANNEX — docs only, no DB implementation, no code changes to [28] or [29] · 2026-11-09
**Reviewed target:** Draft [PR #31](https://github.com/thanhle74/design-engineering-toolkit/pull/31) — `specs/DET-PERSISTENCE-AND-KNOWLEDGE-ARCHITECTURE.md` @ `d8f80e9` on `docs/30-studio-sqlite-artifact-architecture` (one commit on `main` `9495f43`).
**Scope:** [Issue #30](https://github.com/thanhle74/design-engineering-toolkit/issues/30) — architecture decision only.
**Authority refs (read and verified in this session):** `specs/knowledge-foundation/TECH-ADR.md` (ADR-1..5, OPEN_DECISIONS #1/#6), `schemas/cli/tool-run.schema.json`, `schemas/project-profile.schema.json`, `schemas/kb/kb-ingest-manifest.schema.json`, `schemas/kb/kb-store.schema.json`, `schemas/cli/content-manifest.schema.json`, `schemas/README.md` (Draft 2020-12, integer-major versioning, `additionalProperties: false`), `specs/DET-STUDIO-MVP.md` (on `origin/task/29-det-studio-nextjs-mvp`), `.github/workflows/validate.yml` (Node 22), `package.json` (`engines.node: ">=20"`).

---

## 1. Independent review verdict

**Verdict: ACCEPT-WITH-AMENDMENTS (architecture level).** PR #31's three-concern split (SQLite operational catalogue / versioned JSON-JSONL KB SSOT / immutable file artifacts) is sound, correctly preserves ADR-3's "index is a cache, never truth" rule, and correctly leaves [28]/[29] untouched. Six gaps must be closed before the architecture can be accepted as complete against issue #30's deliverables. They are filled by Annexes A–E below; none require changing PR #31's core design — they make it inspectable and implementable.

| #30 question | PR #31 coverage | Verdict | Filled by |
| --- | --- | --- | --- |
| Q1 deployment topology | §1/§4: one Studio server + SQLite on local disk; CLI standalone; multiuser needs real auth first | **ACCEPT** | — (matches [29] §5 "single local trusted operator MVP") |
| Q2 data ownership + canonical config schema + stable IDs/hashes | §3 tables defined; config schema named only as "nonsecret config JSON" | **PARTIAL** | Annex B |
| Q3 minimal schema, indexes, FK/invariants, transactions, statuses, idempotence, run pinning | §3 constraints in prose; statuses listed; write-safety in §4 | **PARTIAL** | Annex C |
| Q4 concurrency/backups | §4 WAL, short transactions, backup/restore incl. files, reconcile-missing | **PARTIAL** — retention policy absent | Annex C (retention) |
| Q5 security | §4 credential refs, realpath containment, download routes, licensing | **PARTIAL** — allowlisted source roots + preview-URL gating implicit only | Annex E + §7 gates |
| Q6 integration seams [28]/[29] + smallest next slice + GO/NO-GO | §5/§6 phase list, [28]-owned `det build` noted | **PARTIAL** — seam map not concrete; phase acceptance missing | Annex E + §7 |

**Two factual corrections for the record:**

1. **`schemas/cli/content-manifest.schema.json` is NOT the run artifact manifest.** It is the caller-supplied *literal content* manifest from [23]/G3 (`valueRef`→text/media/link entries pinned to a `sourceRevisionId`). Any persistence implementation that treats "content manifest" as the artifact index will conflate two different contracts. The run artifact index already exists as `tool-run.json` → `artifacts[]` (see Annex A).
2. **Live branch state (measured 2026-11-09):** `origin/task/28-det-preview-theme-figma-homepage` is **0 commits ahead of `main`** (tip = `9495f43`); `origin/task/29-det-studio-nextjs-mvp` is **2 commits ahead, specs only** (`specs/DET-STUDIO-MVP.md`, `specs/DET-STUDIO-PARALLEL-WORKERS.md`), no app code. `DetRunReader` and [28]'s one-shot `det build` + artifact bundle are therefore **contracted, not built**. The phased sequence in §7 must not assume either surface exists yet; "DetRunReader" seam statements below map to the *spec'd contract*, not shipped code.

---

## 2. Annex A — JSON artifact contract (run bundle)

**Existing contract (do not change):** every `det` invocation already emits a versioned run envelope `tool-run.json` (`schemas/cli/tool-run.schema.json`, major 1): required `schemaVersion, tool, command, exitCode, generatedAt, runDiagnostics`; optional `profileId, platformId, adapter, artifacts[], converterDiagnostics, counts, wroteFiles`. Its `artifacts[]` entries are `{role (closed additive enum), file (relative path under --out, never absolute), schemaRef ($id), contentHash}` — a content-addressed artifact index with **provenance-on-every-entry**.

**Run bundle = the unit of persistence.** A Studio run's bytes are one directory:

```text
artifacts/<projectId>/<runId>/
  tool-run.json            # the envelope above = the bundle manifest (SSOT for what is in the bundle)
  <file per artifacts[].file entry>
```

Rules:

1. **SQLite `artifacts` rows are derived from — and validated against — `tool-run.json`, never authored independently.** On run registration the persistence slice re-validates the envelope with ajv, verifies each `contentHash` against the file bytes (SHA-256, the hash `det` already writes), and rejects a bundle whose index and bytes disagree. A row that cannot be verified is `MISSING`/`CORRUPT`, never silently dropped (mirrors [29]'s "absence is rendered, never defaulted").
2. **No envelope schema change.** `byteSize`/`mediaType` are *not* added to `artifacts[]` (closed `additionalProperties: false` major 1); they become derived SQLite columns computed at registration time. JSON contracts stay frozen — the issue's "preserves JSON contracts" invariant.
3. **Idempotence:** canonical JSON rules (ADR-2: sorted keys, stable order by stable ID) + content hashes mean identical inputs produce hash-identical bundles. Re-running an unchanged conversion may reuse a prior bundle; the persistence slice may key artifact content by SHA-256 and hard-link/dedupe, but V1 may simply store per-run copies — dedupe is an optimization, never a correctness requirement.
4. **Write path (refines PR #31 §4):** staging dir → ajv-validate envelope → hash-verify files → atomic rename to final run path → single short SQLite transaction writes the run row + artifact rows + terminal status. Crash between rename and commit yields an `INTERRUPTED` run or an orphan staging dir reconciled by a maintenance sweep — never a half-catalogued run.
5. **Diagnostics:** full `runDiagnostics`/`converterDiagnostics` arrays stay in `tool-run.json` inside the bundle. SQLite stores only terminal status, diagnostic *count* and top-level codes for listing; the bundle remains the diagnostic SSOT. This keeps PR #31's "SQLite indexes, files hold bytes" boundary exact.

---

## 3. Annex B — canonical config schema and stable IDs

1. **Canonical project config = `schemas/project-profile.schema.json`** (already the toolkit's per-project contract: required `id, name, businessContext, sources, aesthetic, targets, content, platform, safety`; optional `description, gates`). The `projects` table stores the **validated** profile instance (compact JSON) plus:
   - `profileId` = `profile.id` (schema pattern `^[a-z0-9][a-z0-9-]*$`) — the human-stable identifier used in every CLI call, artifact path segment and export;
   - `configHash` = SHA-256 over the profile JSON serialized by the existing canonical rules (ADR-2) — the pin a run freezes.
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
- `runs`: UNIQUE `idempotence_key` = hash of `(project_id, source_revision, config_hash, kb_pins_hash, tool_version)`; INDEX(`project_id`, `created_at`).
- `artifacts`: UNIQUE(`run_id`, `file`) — matches `tool-run.artifacts[]` uniqueness; INDEX(`content_hash`) for future dedupe.
- FKs ON, `ON DELETE RESTRICT` everywhere (lifecycle is `ARCHIVED`/`STALE`, per ADR-3 "deletes are not an operation" — no cascade deletes in V1).

**Status transitions (`runs.status`, closed set from PR #31):**

```text
CREATED → RUNNING → {SUCCEEDED | PARTIAL | FAILED | INTERRUPTED}
RUNNING → INTERRUPTED (crash recovery / watchdog)
```

No transitions out of a terminal state; a retry creates a **new** run (same idempotence key may link it as `supersedes_run_id` for operator convenience, not truth rewrite).

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
| **P2 — [28] standalone artifacts/manifest** | issue #28 scope | one-shot run producing a `tool-run` bundle (hash-verified files), preview-theme isolation | NO-GO if bundle is not envelope-conformant, or SQLite becomes a dependency of `det` |
| **P3 — SQLite persistence slice** | P1+P2 accepted; Annex D spike executed | five tables + `run_kb_snapshots` (R1), migrations, backup/restore incl. artifacts, Annex A registration+verification, Annex C retention sweep | NO-GO without restore test proving DB+files together, or without idempotence-key uniqueness test |
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
- **Independent evidence gathered this session (all read, not assumed):** PR #31 content and commit; `origin/task/28...` = `9495f43` (0 ahead); `origin/task/29...` = 2 spec commits; `DetRunReader` appears in [29] specs only; `tool-run.artifacts[]` shape; `project-profile` required fields; `kb-store`/`kb-ingest-manifest` shapes; `content-manifest` purpose; CI Node 22; `engines >=20`; local Node v24.22.2 `node:sqlite` + FTS5 probe; `better-sqlite3` absent.
- **Not done, by scope:** no DB migration, no live data, no [28]/[29] edits, no Figma/Magento writes, no merge (Draft PR for Owner review).
- **Relationship to PR #31:** this doc is the issue's required *independent-review handoff* plus the annex closing its deliverable gaps (JSON artifact contract, migration/backup/retention detail, documented driver spike, seam map, phased GO/NO-GO). Integrator may fold Annexes A–E into PR #31 or keep this as the companion receipt — either satisfies issue #30's deliverables without a second ADR.
