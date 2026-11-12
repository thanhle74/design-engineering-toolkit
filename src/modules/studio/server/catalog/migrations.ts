/**
 * [50] DET Studio — versioned catalogue migrations.
 *
 * Plain numbered SQL migrations applied in bounded transactions, recorded in
 * `catalog_migrations`; reopening an up-to-date DB is a no-op. This is the
 * minimal coherent subset of the #30 five-table catalogue that issue #50
 * asks for (projects + versioned validated config hashes, runs with source
 * identity/pins, artifact metadata from VERIFIED build-manifest outputs) plus
 * the two bookkeeping tables it needs. Deliberately NOT in V1 (documented in
 * docs/studio/catalog-data-model.md): `design_sources`, `kb_snapshots`,
 * `run_kb_snapshots` — today's build-manifest contract carries no KB snapshot
 * identities and Studio reads design sources through configs on disk, so
 * those tables would have nothing truthful to reference yet.
 */
import "server-only";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import type { CatalogDatabase } from "./sqlite-driver";

export interface CatalogMigration {
  readonly number: number;
  readonly name: string;
  readonly statements: readonly string[];
}

/**
 * Statuses mirror the #30 closed set (RUNNING is the pre-terminal state a
 * runner job writes; the sweep or the indexer moves it to a terminal state —
 * code never fabricates a terminal state the disk does not support).
 * `integrity` is the point-in-time bundle verification state from the last
 * index pass ('corrupt' = the manifest itself stopped being readable/guardable).
 * runs.project_id is nullable by design: a runner job that dies before its
 * bundle is validated has NO trustworthy project identity yet (the profile
 * id only exists once the engine validated the manifest); cross-project
 * scoping stays enforced by the FK for every project-linked row.
 */
const MIGRATION_1_INITIAL: CatalogMigration = {
  number: 1,
  name: "catalogue-initial-projects-runs-artifacts",
  statements: [
    `CREATE TABLE catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
    `CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
    `CREATE TABLE project_configs (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  config_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, config_hash)
)`,
    `CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','INTERRUPTED')),
  origin TEXT NOT NULL CHECK (origin IN ('build-runner','scan')),
  config_hash TEXT NOT NULL DEFAULT '',
  source_id TEXT,
  revision_id TEXT,
  platform_id TEXT,
  input_fingerprint TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  signal TEXT,
  failure_kind TEXT CHECK (failure_kind IN ('timeout','spawn-failed')),
  bundle_present INTEGER NOT NULL DEFAULT 0,
  integrity TEXT NOT NULL DEFAULT 'unverified' CHECK (integrity IN ('unverified','verified','tampered','missing','corrupt')),
  manifest_sha256 TEXT,
  pid INTEGER,
  started_at TEXT,
  finished_at TEXT,
  indexed_at TEXT NOT NULL,
  artifact_count INTEGER NOT NULL DEFAULT 0
)`,
    `CREATE INDEX idx_runs_project ON runs(project_id, id)`,
    `CREATE INDEX idx_runs_fingerprint ON runs(input_fingerprint)`,
    `CREATE TABLE artifacts (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
  path TEXT NOT NULL,
  role TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  verified_at TEXT,
  PRIMARY KEY (run_id, path)
)`,
    `CREATE INDEX idx_artifacts_sha256 ON artifacts(sha256)`,
  ],
};

/** Ordered migration list — append-only; never edit an applied migration. */
export const CATALOG_MIGRATIONS: readonly CatalogMigration[] = [MIGRATION_1_INITIAL];

export interface MigrationResult {
  /** Migration numbers applied by THIS call (empty when already current). */
  applied: number[];
  /** The now-current schema version (highest applied number; 0 for a fresh DB that applied nothing). */
  version: number;
}

function ensureMigrationsTable(db: CatalogDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_migrations (
  number INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`);
}

function appliedNumbers(db: CatalogDatabase): Set<number> {
  const rows = db.prepare("SELECT number FROM catalog_migrations").all() as Array<{ number: number }>;
  return new Set(rows.map((row) => Number(row.number)));
}

/**
 * Apply every pending migration in order, each inside one IMMEDIATE
 * transaction (all-or-nothing; a failure rolls back that migration and
 * refuses the catalogue — a half-migrated DB is never operated on).
 */
export function migrateCatalogDatabase(
  db: CatalogDatabase,
  migrations: readonly CatalogMigration[] = CATALOG_MIGRATIONS
): MigrationResult {
  ensureMigrationsTable(db);
  const applied = appliedNumbers(db);

  const done: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.number)) continue;
    try {
      db.exec("BEGIN IMMEDIATE");
      for (const statement of migration.statements) db.exec(statement);
      db.prepare("INSERT INTO catalog_migrations (number, name, applied_at) VALUES (?, ?, ?)").run(
        migration.number,
        migration.name,
        new Date().toISOString()
      );
      db.exec("COMMIT");
      done.push(migration.number);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* the failed statement may have ended the transaction already */
      }
      throw new DetRunReaderError(
        "invalid-payload",
        `Catalog migration ${migration.number} (${migration.name}) failed; the catalogue refuses to run a partially migrated database. ${
          error instanceof Error ? error.message.slice(0, 120) : ""
        }`
      );
    }
  }

  const version = migrations.reduce((max, m) => (applied.has(m.number) || done.includes(m.number) ? Math.max(max, m.number) : max), 0);
  return { applied: done, version };
}
