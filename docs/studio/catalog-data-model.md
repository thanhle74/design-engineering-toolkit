# [50] Studio catalogue — data model & operational boundaries

**Status:** IMPLEMENTED (P1 slice) · 2026-11-10 · Driver decision:
[sqlite-driver-spike.md](./sqlite-driver-spike.md) (`node:sqlite`, floor
`node >= 22.13`, Studio `engines` declared; the CLI keeps no SQLite dependency).

This is the minimal coherent subset of the #30 catalogue schema that issue #50
asks for, reconciled against the actually-shipped `det build` bundle contract
(`resources/schemas/cli/build-manifest.schema.json`) instead of the pre-#28/#40 annex
prose. KB records and artifact BYTES never live in the DB — canonical
JSON/JSONL KB and immutable bundle files stay authoritative.

## Configuration

| Env | Meaning |
| --- | --- |
| `STUDIO_DATA_DIR` | **Opt-in.** Local directory holding `<dir>/studio.sqlite` (+ WAL/SHM). Unset → catalogue off, no DB anywhere, all existing modes byte-for-byte unchanged. Set-but-unusable → honest `not-configured` 503 (never a silent fallback). |
| `STUDIO_DET_RUNS_DIR` | Unchanged: the file-backed runs root the indexer scans (bundle directories). |

One local trusted operator; no auth, no multi-tenant claims, no network/shared
DB. The data dir is created `0700`, DB/WAL/SHM files `0600`.

## Schema (migration 1)

```text
catalog_migrations(number PK, name, applied_at)     -- versioned migrations
catalog_meta(key PK, value)                          -- scan signature etc.

projects(id PK, platform_id, config_hash,            -- id = manifest profileId (slug);
         first_seen_at, updated_at)                  -- config_hash = LAST OBSERVED
project_configs(project_id FK→projects, config_hash, -- VERSIONED validated config
                first_seen_at, last_seen_at,         -- identities (history)
                PK(project_id, config_hash))
runs(id PK, project_id FK→projects nullable,         -- nullable: a runner job that
     status, origin,                                 -- died pre-validation has no
     config_hash, source_id, revision_id,            -- trustworthy project yet;
     platform_id, input_fingerprint,                 -- frozen per-run pins
     exit_code, signal, failure_kind,
     bundle_present, integrity, manifest_sha256,
     pid, started_at, finished_at,
     indexed_at, artifact_count)
artifacts(run_id FK→runs, path, role, sha256,        -- PK(run_id, path); metadata
          bytes, verified_at)                        -- ONLY from VERIFIED manifest
-- indexes: runs(project_id,id), runs(input_fingerprint), artifacts(sha256)
-- FKs ON DELETE RESTRICT; foreign_keys=ON per connection; WAL; busy_timeout 5s
```

Deliberately **not** in V1 (and why): `design_sources` (Studio reads design
sources through caller configs on disk; the manifest carries `sourceId` +
`revisionId` pins already), `kb_snapshots` / `run_kb_snapshots` (the
build-manifest contract carries no KB snapshot identities yet — the tables
would reference nothing truthful; Annex C's R1 assumed a KB pin surface that
#28/#40 did not ship). Add them as migration 2+ when a real consumer exists.

## Truth boundaries

- **Files are truth.** `indexBundleDir` indexes a bundle only after
  `guardBuildManifest` accepts its root manifest and `verifyBundleOutputs`
  (the shared download-gating check) re-verifies every declared output's
  on-disk bytes. `runs.status` = engine truth from the stage table
  (`SUCCEEDED` exit 0; `PARTIAL` non-zero with ≥1 completed/reused stage;
  `FAILED` otherwise); `runs.integrity` = last index's verification verdict
  (`verified` / `tampered` / `missing` / `corrupt` / `unverified`).
- **A DB row is never a capability.** Downloads keep flowing through the
  unchanged file-backed reader, which re-verifies live bytes on every read —
  a missing/tampered file stays refused even though its metadata row exists.
- **No fabrication.** Terminal states come from disk or the runner's terminal
  event. Stale `RUNNING` rows (dead pid) are swept to `INTERRUPTED` at open.
  A valid bundle on disk is promoted truthfully by the indexer; a job without
  a bundle is recorded `FAILED`/`INTERRUPTED`, never "succeeded".
- **History is retained.** Re-index is idempotent (upsert by run id, artifacts
  re-derived wholesale in one transaction). A bundle that later disappears or
  corrupts keeps its row, flagged via `integrity`; config changes update
  `projects.config_hash` (last observed) while `project_configs` and every
  run's frozen pin keep the full history.
- **Private data stays out.** The DB stores ids, hashes, statuses, relative
  paths, timestamps — never config contents, absolute server paths, KB
  records, media bytes, or token-shaped values (asserted by test).

## Runner integration (additive)

`BuildRunner` gains ONE optional constructor seam (`catalog`). With the
catalogue enabled it records: job `RUNNING` (+pid) at start → terminal truth
at finish (verified bundle indexed from disk; no-bundle jobs as
`FAILED`/`INTERRUPTED`). Every hook is best-effort: a catalogue failure never
blocks, slows gating of, or changes a build — the journal + bundle on disk
remain the truth, and the single-slot/early-error guarantees are untouched.

## Restart / recovery behavior

- `StudioCatalog.open` runs migrations then the stale-RUNNING sweep.
- `/api/catalog` and the Catalog page call `refreshIndex(runsRoot)`: a cheap
  recursive (path,size,mtime) signature makes unchanged trees a no-op; any
  change triggers a full idempotent re-index; vanished catalogued bundles are
  flagged `missing`.
- Backup/restore (R1-C1): `StudioCatalog.backupCatalog(backupDir, runsRoot)`
  writes a **recoverable snapshot of the database AND every referenced bundle
  byte**: `studio.backup.sqlite` (`VACUUM INTO` — consistent snapshot;
  node:sqlite has no backup API, see the spike doc), `files-manifest.json`
  (per run: the root `build-manifest.json` trust anchor + every
  manifest-declared output with sha256/bytes; relative paths only), and
  `files/<runId>/…` holding the actual bytes. Every copied file is read
  contained/size-bounded and re-verified against BOTH the guard and the DB
  rows before it is written — any missing/mismatched bytes, guard failure,
  DB/manifest disagreement, or symlink escape aborts the whole backup and
  removes exactly what the call wrote (fail closed; a partial snapshot is
  never presented as success). Before this correction the snapshot was
  metadata-only (DB + file manifest) and NOT disaster-recoverable.
  `StudioCatalog.restoreBackup(backupDir, { dataDir, runsRoot })` restores
  into FRESH directories: it verifies the backup set (every listed file's
  sha256/bytes, DB ↔ manifest ↔ bytes consistency, supported schema version)
  BEFORE writing anything, refuses existing targets (no silent overwrite of
  live runs), then copies the DB as `studio.sqlite` and each run's files.
  The R1-C1 regression proves the disaster case: real bundle → snapshot →
  the entire runs root destroyed → restore from the backup alone →
  independent guard/byte/row verification passes — and corrupt/missing
  backup bytes make restore refuse. `verifyReferencedFiles(runsRoot)`
  remains the live-tree drift detector. Backup/restore targets are private
  local files (0600/0700) and never exposed through any Studio route. Note
  the recoverable scope: what the catalogue indexes (bundle bundles) — KB
  JSON/JSONL sources, if any, are NOT catalogued today and stay separately
  backed up.

## Where things live

- `src/server/catalog/sqlite-driver.ts` — the one `node:sqlite` seam (swap point).
- `src/server/catalog/migrations.ts` — ordered SQL migrations (append-only).
- `src/server/catalog/studio-catalog.ts` — catalogue + indexer + sweep + recoverable backup/restore.
- `app/api/catalog/route.ts` — `mode: "off" | "on"`, `?runId=` detail query.
- `app/catalog/page.tsx` — operator history view (off state is explicit).
