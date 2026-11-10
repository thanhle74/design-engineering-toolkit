# [50] SQLite driver / deployment spike — Studio catalogue

**Status:** EXECUTED — decision recorded · 2026-11-10
**Scope:** issue #50 bounded implementation step 1 (no migration code before this; nothing
installed). Formalizes Annex D of `specs/DET-STORAGE-ARCHITECTURE-REVIEW-AND-ANNEX.md`
against today's actual runtimes.

## Measured facts (probes run this session, read-only)

| Runtime | `node:sqlite` unflagged | Bundled SQLite | WAL | FK enforcement | `prepare/get/run` | `VACUUM INTO` | `db.backup()` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Node **v22.23.1** (`/usr/bin/node`, same 22.x line CI resolves via `setup-node` `node-version: 22`) | **loads and executes** (ExperimentalWarning on stderr only) | 3.51.2 | ✅ `journal_mode=wal` | ✅ FK violation throws | ✅ | ✅ | ❌ absent |
| Node **v24.22.2** (owner machine, Studio dev runtime) | ✅ loads and executes | 3.53.4 | ✅ | ✅ | ✅ | ✅ | ❌ absent |
| Node 20 / 21 (permitted by root `engines.node: ">=20"`) | absent (module does not exist before 22.5; flag required until 22.13) | — | — | — | — | — | — |

Additional measured behavior on both runtimes:

- A **second connection** to the same file DB with `PRAGMA busy_timeout` set can write while
  the first holds a transaction — busy handling works as documented.
- `PRAGMA foreign_keys = ON` is per-connection and must be re-asserted on every open.
- There is **no `DatabaseSync.prototype.backup()`** on either line → online backup uses
  `VACUUM INTO '<path>'` (SQLite ≥ 3.27, present in both bundled versions), which produces a
  consistent snapshot of the whole DB (WAL included).

## Decision: `node:sqlite` (built-in), behind one thin driver module

**Why:** zero install and zero native ABI coupling (no `better-sqlite3` prebuild/rebuild story
per Node major, no install-scripts surface in CI), and it is unflagged and functional on
**both** the CI-pinned 22.x line and the owner's 24.x dev line. The Experimental upstream
label is accepted and recorded here; the API surface used by the catalogue (`DatabaseSync`,
`prepare`, `exec`, transactions via SQL) has been stable across 22.5→24.x.

**Runtime floor:** Studio declares `"engines": { "node": ">=22.13.0" }` (first 22.x release
with unflagged `node:sqlite`). The root package engines floor (`>=20`, the CLI) is
**unchanged** — the CLI keeps no SQLite dependency, ever (issue #50 boundary).

**Reversibility:** all `node:sqlite` access goes through
`apps/studio/src/server/catalog/sqlite-driver.ts`. Swapping to a pinned portable driver later
means rewriting that one module, not the catalogue/indexer/UI.

## Runtime boundaries enforced in code

1. **Driver missing** (Node < 22.13, e.g. someone runs Studio on Node 20/21): catalogue mode
   fails **honestly** with `DetRunReaderError("not-configured")` naming the env var and the
   required floor — it never silently degrades to "off", because the operator explicitly
   configured `STUDIO_DATA_DIR` and a silent fallback would hide the misconfiguration.
2. **`STUDIO_DATA_DIR` unset:** no driver import side effect touches disk, no DB file is
   created anywhere, fixture/file-backed modes behave byte-for-byte as before
   (`getStudioCatalog()` returns `null`).
3. **File permissions:** the data dir is created `0700` (existing dirs are not re-permissioned),
   the DB/WAL/SHM files are chmod `0600` after open. Local single-operator trust model; no
   network/shared-filesystem semantics are attempted (WAL fallback to rollback journal if WAL
   cannot be set, e.g. some network mounts).
4. **No ORM, no migration tooling, no FTS5 in P1** (FTS5 was probed available in Annex D; the
   KB index is out of scope here and stays derived-and-rebuildable whenever it lands).

## Rejected alternative (recorded, not installed)

`better-sqlite3` (pinned portable driver): works on Node ≥ 20 and would avoid the
Experimental label, but adds a native dependency (ABI rebuild per Node major, prebuilt
availability, install scripts in the isolated studio lockfile) for a capability the standard
library already provides on the pinned CI/dev lines. Revisit only if `node:sqlite` breaks an
upgrade — the driver seam keeps that cheap.
