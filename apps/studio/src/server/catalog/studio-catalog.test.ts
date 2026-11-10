/**
 * [50] StudioCatalog tests — the issue's crash/recovery matrix, proven against
 * a REAL example build bundle (the same accepted `det build` the [40] suite
 * drives; dist must be built first — see apps/studio/README.md):
 *
 *  - migration 1 on fresh open; synthetic N→N+1 with data preserved; reopen idempotent
 *  - restart re-index idempotence (identical catalogued rows)
 *  - stale RUNNING → INTERRUPTED sweep (dead pid); live pid stays RUNNING
 *  - corrupted/missing bundle refusal: integrity flags, history retained, and
 *    the DB row never makes a tampered file downloadable (reader refuses)
 *  - config change does NOT rewrite historical hashes (project last-observed +
 *    versioned project_configs + frozen per-run pins)
 *  - cross-project scoping (two projects, runs/artifacts never cross)
 *  - private-data exclusion (no absolute paths, no config contents in the DB)
 *  - concurrent writes / busy handling (two connections, busy_timeout)
 *  - backup + restore of DB and referenced files, with missing/corrupt detection
 *  - runner lifecycle: RUNNING row → real build → indexed SUCCEEDED bundle;
 *    catalogue-off mode never creates a DB
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DetRunReaderError } from "@/src/shared/contracts";

import { BuildBundleReader } from "../build-bundle-reader";
import { runExampleBuild } from "../test-helpers/det-cli";

import { migrateCatalogDatabase, type CatalogMigration } from "./migrations";
import {
  CATALOG_BACKUP_DB_FILE,
  CATALOG_BACKUP_FILES_DIR,
  CATALOG_BACKUP_MANIFEST_FILE,
  CATALOG_DB_FILE,
  openCatalogDatabase,
} from "./sqlite-driver";
import {
  getStudioCatalog,
  STUDIO_DATA_DIR_ENV,
  StudioCatalog,
} from "./studio-catalog";

let root: string;
let runsRoot: string;
let dataDir: string;
const openCatalogs: StudioCatalog[] = [];

async function openTestCatalog(dir: string = dataDir): Promise<StudioCatalog> {
  const catalog = await StudioCatalog.open(dir);
  openCatalogs.push(catalog);
  return catalog;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "det50-catalog-"));
  runsRoot = path.join(root, "runs");
  dataDir = path.join(root, "data");
  await mkdir(runsRoot, { recursive: true });
});

afterAll(async () => {
  for (const catalog of openCatalogs.splice(0)) {
    try {
      catalog.close();
    } catch {
      /* already closed */
    }
  }
  await rm(root, { recursive: true, force: true });
});

/** Run the REAL accepted example build into <runsDir>/<runId> (exit 0, verified bundle). */
async function makeRealBundle(runId: string, runsDir: string = runsRoot): Promise<string> {
  const runDir = path.join(runsDir, runId);
  const exitCode = runExampleBuild(runDir);
  if (exitCode !== 0) {
    throw new Error(`example build failed with exit ${exitCode}`);
  }
  return runDir;
}

/** A comparable projection of the whole catalogue (timestamps excluded). */
async function catalogueFingerprint(catalog: StudioCatalog): Promise<string> {
  const projects = catalog
    .listProjects()
    .map((p) => `${p.id}|${p.platformId}|${p.configHash}|${p.configHistoryCount}|${p.runCount}`)
    .sort();
  const runs = catalog
    .listRuns()
    .map(
      (r) =>
        `${r.id}|${r.projectId}|${r.status}|${r.origin}|${r.configHash}|${r.sourceId}|${r.revisionId}|${r.platformId}|${r.exitCode}|${r.bundlePresent}|${r.integrity}|${r.manifestSha256}|${r.artifactCount}`
    )
    .sort();
  const artifacts = catalog
    .listRuns()
    .map((r) => r.id)
    .flatMap((runId) => catalog.listArtifacts(runId).map((a) => `${a.runId}|${a.path}|${a.role}|${a.sha256}|${a.bytes}`))
    .sort();
  return [projects.join("\n"), runs.join("\n"), artifacts.join("\n")].join("\n\n");
}

/** Test seam: force the next refreshIndex to do a full re-index. */
function forceStaleSignature(catalog: StudioCatalog): void {
  (catalog as unknown as { setMeta(key: string, value: string): void }).setMeta("runs_scan_signature", "stale-for-test");
}

/** Full-text dump of every catalogue table (private-data exclusion probe). */
function catalogueDump(catalog: StudioCatalog): string {
  const db = (catalog as unknown as { db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } } }).db;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  return tables.map(({ name }) => `${name}: ${JSON.stringify(db.prepare(`SELECT * FROM ${name}`).all())}`).join("\n");
}

function migration1ForTest(): CatalogMigration {
  return {
    number: 1,
    name: "catalogue-initial-projects-runs-artifacts",
    statements: [
      `CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE projects (id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, config_hash TEXT NOT NULL, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE project_configs (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, config_hash TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, PRIMARY KEY (project_id, config_hash))`,
      `CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','INTERRUPTED')),
        origin TEXT NOT NULL CHECK (origin IN ('build-runner','scan')),
        config_hash TEXT NOT NULL DEFAULT '',
        source_id TEXT, revision_id TEXT, platform_id TEXT,
        input_fingerprint TEXT NOT NULL DEFAULT '',
        exit_code INTEGER, signal TEXT,
        failure_kind TEXT CHECK (failure_kind IN ('timeout','spawn-failed')),
        bundle_present INTEGER NOT NULL DEFAULT 0,
        integrity TEXT NOT NULL DEFAULT 'unverified' CHECK (integrity IN ('unverified','verified','tampered','missing','corrupt')),
        manifest_sha256 TEXT, pid INTEGER, started_at TEXT, finished_at TEXT,
        indexed_at TEXT NOT NULL, artifact_count INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX idx_runs_project ON runs(project_id, id)`,
      `CREATE INDEX idx_runs_fingerprint ON runs(input_fingerprint)`,
      `CREATE TABLE artifacts (
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        path TEXT NOT NULL, role TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, verified_at TEXT,
        PRIMARY KEY (run_id, path)
      )`,
      `CREATE INDEX idx_artifacts_sha256 ON artifacts(sha256)`,
    ],
  };
}

describe("migrations", () => {
  it("applies migration 1 to a fresh DB, then is a no-op on reopen", async () => {
    const dir = path.join(root, "migrations-fresh");
    const first = await openCatalogDatabase(dir);
    const firstResult = migrateCatalogDatabase(first);
    expect(firstResult.applied).toEqual([1]);
    expect(firstResult.version).toBe(1);
    first.close();

    const second = await openCatalogDatabase(dir);
    const secondResult = migrateCatalogDatabase(second);
    expect(secondResult.applied).toEqual([]);
    expect(secondResult.version).toBe(1);
    second.close();
  });

  it("applies a synthetic N→N+1 in order, preserves data, never re-applies", async () => {
    const dir = path.join(root, "migrations-n1");
    const migration2: CatalogMigration = {
      number: 2,
      name: "test-only-extra-table",
      statements: ["CREATE TABLE migration_probe (note TEXT NOT NULL)"],
    };
    const db1 = await openCatalogDatabase(dir);
    expect(migrateCatalogDatabase(db1).applied).toEqual([1]);
    db1.exec(
      "INSERT INTO projects (id, platform_id, config_hash, first_seen_at, updated_at) VALUES ('p1', 'magento-community', 'sha256:" +
        "a".repeat(64) +
        "', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"
    );
    db1.close();

    const db2 = await openCatalogDatabase(dir);
    expect(migrateCatalogDatabase(db2, [migration1ForTest(), migration2])).toEqual({ applied: [2], version: 2 });
    const preserved = db2.prepare("SELECT id FROM projects").all() as Array<{ id: string }>;
    expect(preserved.map((row) => row.id)).toEqual(["p1"]);
    db2.prepare("INSERT INTO migration_probe (note) VALUES (?)").run("v2 works");
    db2.close();

    // Reopen: nothing left to apply, data still there.
    const db3 = await openCatalogDatabase(dir);
    expect(migrateCatalogDatabase(db3, [migration1ForTest(), migration2])).toEqual({ applied: [], version: 2 });
    expect((db3.prepare("SELECT note FROM migration_probe").all() as Array<{ note: string }>).map((r) => r.note)).toEqual(["v2 works"]);
    db3.close();
  });

  it("rolls back all-or-nothing when a migration statement fails", async () => {
    const dir = path.join(root, "migrations-broken");
    const db = await openCatalogDatabase(dir);
    const broken: CatalogMigration = {
      number: 1,
      name: "broken",
      statements: ["CREATE TABLE migration_x (x INTEGER)", "CREATE TABLE !totally-not-sql"],
    };
    expect(() => migrateCatalogDatabase(db, [broken])).toThrow(DetRunReaderError);
    // The successful first statement rolled back with the failed one.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_x'").all();
    expect(tables).toHaveLength(0);
    // The DB is still usable afterwards.
    db.exec("CREATE TABLE after_failure (x INTEGER)");
    db.close();
  });
});

describe("real bundle indexing (disk truth)", () => {
  let catalog: StudioCatalog;

  beforeAll(async () => {
    await makeRealBundle("build-catalog-a");
    catalog = await openTestCatalog();
    const result = await catalog.indexBundleDir(path.join(runsRoot, "build-catalog-a"), "build-catalog-a");
    expect(result).toEqual({ status: "SUCCEEDED", integrity: "verified" });
  });

  it("indexes a real bundle: project, frozen pins, byte-verified artifacts", () => {
    const projects = catalog.listProjects();
    expect(projects.map((p) => p.id)).toEqual(["g28-home-preview"]);
    expect(projects[0].configHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(projects[0].platformId.length).toBeGreaterThan(0);

    const run = catalog.getRun("build-catalog-a")!;
    expect(run.projectId).toBe("g28-home-preview");
    expect(run.status).toBe("SUCCEEDED");
    expect(run.integrity).toBe("verified");
    expect(run.bundlePresent).toBe(true);
    expect(run.exitCode).toBe(0);
    expect(run.configHash).toBe(projects[0].configHash);
    expect(run.sourceId).toBeTruthy();
    expect(run.revisionId).toBeTruthy();
    expect(run.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(run.manifestSha256).toMatch(/^[0-9a-f]{64}$/);

    const artifacts = catalog.listArtifacts("build-catalog-a");
    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(artifact.verifiedAt).not.toBeNull();
    }
    expect(run.artifactCount).toBe(artifacts.length);
  });

  it("is idempotent across a restart: identical rows, no duplicates", async () => {
    const before = await catalogueFingerprint(catalog);
    const reopened = await openTestCatalog();
    // First refresh establishes the scan signature from scratch…
    const first = await reopened.refreshIndex(runsRoot);
    expect(first.changed).toBe(true);
    expect(await catalogueFingerprint(reopened)).toBe(before);
    // …and an unchanged tree is then a genuine no-op (restart idempotence).
    expect(await reopened.refreshIndex(runsRoot)).toEqual({ changed: false, indexed: 0 });
    expect(await catalogueFingerprint(reopened)).toBe(before);

    // Force a full re-index and require the identical projection.
    forceStaleSignature(reopened);
    const forced = await reopened.refreshIndex(runsRoot);
    expect(forced.changed).toBe(true);
    expect(await catalogueFingerprint(reopened)).toBe(before);
  });

  it("sweeps a stale RUNNING row (dead pid) to INTERRUPTED on open; live pid survives", async () => {
    const dead = spawnSync(process.execPath, ["-e", ""]);
    const deadPid = typeof dead.pid === "number" ? dead.pid : -1;
    expect(deadPid).toBeGreaterThan(0); // exited by now → stale

    catalog.recordRunnerStart({ runId: "build-runner-live", configId: "cfg", pid: process.pid, startedAt: "2026-01-01T00:00:00.000Z" });
    catalog.recordRunnerStart({ runId: "build-runner-stale-nopid", configId: "cfg", pid: null, startedAt: "2026-01-01T00:00:00.000Z" });
    catalog.recordRunnerStart({ runId: "build-runner-stale-deadpid", configId: "cfg", pid: deadPid, startedAt: "2026-01-01T00:00:00.000Z" });

    const reopened = await openTestCatalog(); // open() runs the sweep
    expect(reopened.getRun("build-runner-stale-nopid")!.status).toBe("INTERRUPTED");
    expect(reopened.getRun("build-runner-stale-deadpid")!.status).toBe("INTERRUPTED");
    expect(reopened.getRun("build-runner-stale-nopid")!.finishedAt).not.toBeNull();
    expect(reopened.getRun("build-runner-live")!.status).toBe("RUNNING"); // this process is alive
  });

  it("flags tampered bytes on re-index and the DB row never makes them downloadable", async () => {
    const tamperId = "build-catalog-tamper";
    const runDir = await makeRealBundle(tamperId);
    await catalog.indexBundleDir(runDir, tamperId);
    expect(catalog.getRun(tamperId)!.integrity).toBe("verified");

    // Flip one byte inside a declared output (rewrite → mtime changes).
    const targetRel = catalog.listArtifacts(tamperId)[0].path;
    const targetAbs = path.join(runDir, targetRel);
    const flipped = Buffer.from(await readFile(targetAbs));
    flipped[0] = flipped[0] ^ 0xff;
    await writeFile(targetAbs, flipped);

    expect((await catalog.refreshIndex(runsRoot)).changed).toBe(true);
    expect(catalog.getRun(tamperId)!.integrity).toBe("tampered");
    expect(catalog.listArtifacts(tamperId).find((a) => a.path === targetRel)!.verifiedAt).toBeNull();

    // The file-backed reader STILL refuses the download — a DB row is never a capability.
    const reader = new BuildBundleReader();
    await expect(reader.readArtifact(runDir, tamperId, targetRel)).rejects.toMatchObject({ code: "invalid-payload" });
  });

  it("flags missing outputs while keeping the run's engine truth", async () => {
    const missingId = "build-catalog-missing";
    const runDir = await makeRealBundle(missingId);
    await catalog.indexBundleDir(runDir, missingId);
    const targetRel = catalog.listArtifacts(missingId)[0].path;
    await rm(path.join(runDir, targetRel));

    await catalog.refreshIndex(runsRoot);
    const run = catalog.getRun(missingId)!;
    expect(run.integrity).toBe("missing");
    expect(run.status).toBe("SUCCEEDED"); // engine truth unchanged; integrity reports the loss
  });

  it("flags a corrupt manifest but keeps the previously catalogued history", async () => {
    const corruptId = "build-catalog-corrupt";
    const runDir = await makeRealBundle(corruptId);
    await catalog.indexBundleDir(runDir, corruptId);
    const before = catalog.getRun(corruptId)!;
    await writeFile(path.join(runDir, "build-manifest.json"), "{not json");

    await catalog.refreshIndex(runsRoot);
    const after = catalog.getRun(corruptId)!;
    expect(after.integrity).toBe("corrupt");
    expect(after.projectId).toBe(before.projectId); // history retained
    expect(after.configHash).toBe(before.configHash);
    expect(after.artifactCount).toBe(before.artifactCount);
    // A dir with a corrupt manifest that was NEVER catalogued stays unknown.
    expect(catalog.getRun("build-never-seen")).toBeNull();
  });

  it("config change keeps historical hashes (last-observed + versioned configs + frozen run pins)", async () => {
    // Bundle B = copy of A with a DIFFERENT validated config identity in its manifest.
    const bId = "build-catalog-configb";
    const bDir = path.join(runsRoot, bId);
    await cp(path.join(runsRoot, "build-catalog-a"), bDir, { recursive: true });
    const manifestPath = path.join(bDir, "build-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { config: { contentHash: string } };
    const hashA = catalog.getRun("build-catalog-a")!.configHash;
    const hashB = `sha256:${"b".repeat(64)}`;
    manifest.config.contentHash = hashB;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    await catalog.refreshIndex(runsRoot);
    const project = catalog.listProjects().find((p) => p.id === "g28-home-preview")!;
    expect(project.configHistoryCount).toBe(2); // both validated config identities kept
    expect([hashA, hashB]).toContain(project.configHash); // last observed (scan-order)

    const runA = catalog.getRun("build-catalog-a")!;
    const runB = catalog.getRun(bId)!;
    expect(runA.configHash).toBe(hashA); // historical pins frozen, never rewritten
    expect(runB.configHash).toBe(hashB);
  });

  it("tracks last-observed config hash deterministically when indexing bundles one at a time", async () => {
    const dir = path.join(root, "config-tracking-data");
    const trackingRoot = path.join(root, "config-tracking-runs");
    await mkdir(trackingRoot, { recursive: true });
    const tracking = await openTestCatalog(dir);
    const makeCopy = async (runId: string, transform?: (manifest: { profileId: string; config: { contentHash: string } }) => void): Promise<string> => {
      const dirPath = path.join(trackingRoot, runId);
      await cp(path.join(runsRoot, "build-catalog-a"), dirPath, { recursive: true });
      const manifestPath = path.join(dirPath, "build-manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      transform?.(manifest);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      return dirPath;
    };

    const dirA = await makeCopy("build-track-a");
    await tracking.indexBundleDir(dirA, "build-track-a");
    const hashA = tracking.getRun("build-track-a")!.configHash;
    expect(tracking.listProjects()[0].configHash).toBe(hashA);

    const dirB = await makeCopy("build-track-b", (manifest) => {
      manifest.config.contentHash = `sha256:${"c".repeat(64)}`;
    });
    await tracking.indexBundleDir(dirB, "build-track-b");
    expect(tracking.listProjects()[0].configHash).toBe(`sha256:${"c".repeat(64)}`); // updated, history kept
    expect(tracking.getRun("build-track-a")!.configHash).toBe(hashA); // NOT rewritten
    expect(tracking.listProjects()[0].configHistoryCount).toBe(2);
  });

  it("scopes runs and artifacts per project when two projects exist", async () => {
    const cId = "build-catalog-alt";
    const cDir = path.join(runsRoot, cId);
    await cp(path.join(runsRoot, "build-catalog-a"), cDir, { recursive: true });
    const manifestPath = path.join(cDir, "build-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { profileId: string };
    manifest.profileId = "g28-alt-preview";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    await catalog.refreshIndex(runsRoot);
    const homeRuns = catalog.listRuns("g28-home-preview").map((r) => r.id);
    const altRuns = catalog.listRuns("g28-alt-preview").map((r) => r.id);
    expect(homeRuns).toContain("build-catalog-a");
    expect(altRuns).toEqual([cId]);
    expect(homeRuns).not.toContain(cId);
    for (const artifact of catalog.listArtifacts(cId)) expect(artifact.runId).toBe(cId);
    expect(catalog.listProjects().map((p) => p.id).sort()).toEqual(["g28-alt-preview", "g28-home-preview"]);
  });

  it("keeps the catalogue free of private data (no absolute paths, no config contents)", () => {
    const dump = catalogueDump(catalog);
    expect(dump).not.toContain(root);
    expect(dump).not.toContain(os.tmpdir());
    expect(dump).not.toContain("design-tree-home-desktop");
    expect(dump).not.toContain("profile-g28-home-fixture");
    // No config contents (the design node is config data; only its hash is stored).
    expect(dump).not.toContain("245:2");
  });
});

describe("runner lifecycle through the catalogue", () => {
  it("records RUNNING, indexes the finished bundle truthfully, and survives a restart", async () => {
    const dir = path.join(root, "runner-data");
    const catalog = await openTestCatalog(dir);
    const runId = "build-runner-e2e";
    catalog.recordRunnerStart({ runId, configId: "g28-example", pid: process.pid, startedAt: "2026-01-02T00:00:00.000Z" });

    const runDir = await makeRealBundle(runId);
    expect(
      await catalog.indexBundleDir(runDir, runId, {
        startedAt: "2026-01-02T00:00:00.000Z",
        finishedAt: "2026-01-02T00:00:05.000Z",
        exitCode: 0,
        signal: null,
      })
    ).toEqual({ status: "SUCCEEDED", integrity: "verified" });
    const run = catalog.getRun(runId)!;
    expect(run.origin).toBe("build-runner");
    expect(run.startedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(run.finishedAt).toBe("2026-01-02T00:00:05.000Z");
    const expectedArtifacts = catalog.listArtifacts(runId);
    catalog.close();

    // "Restart": a fresh handle sees the same durable history.
    const reopened = await openTestCatalog(dir);
    const after = reopened.getRun(runId)!;
    expect(after.status).toBe("SUCCEEDED");
    expect(after.projectId).toBe("g28-home-preview");
    expect(after.startedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(reopened.listArtifacts(runId)).toEqual(expectedArtifacts);
    expect(after.artifactCount).toBeGreaterThan(0);
  });

  it("records truthful terminal states; terminal rows are never rewritten", async () => {
    const catalog = await openTestCatalog(path.join(root, "runner-data"));
    const timeoutRun = "build-runner-timeout";
    const spawnRun = "build-runner-spawnfail";
    catalog.recordRunnerStart({ runId: timeoutRun, configId: "g28-example", pid: process.pid, startedAt: "2026-01-03T00:00:00.000Z" });
    catalog.recordRunnerTerminal({ runId: timeoutRun, exitCode: null, signal: "SIGTERM", failureKind: "timeout", finishedAt: "2026-01-03T00:00:30.000Z" });
    // Terminal without a prior start row (catalogue was unavailable at start).
    catalog.recordRunnerTerminal({ runId: spawnRun, exitCode: null, signal: null, failureKind: "spawn-failed", finishedAt: "2026-01-03T00:01:00.000Z" });

    expect(catalog.getRun(timeoutRun)!.status).toBe("INTERRUPTED");
    expect(catalog.getRun(timeoutRun)!.bundlePresent).toBe(false);
    expect(catalog.getRun(timeoutRun)!.finishedAt).toBe("2026-01-03T00:00:30.000Z");
    expect(catalog.getRun(spawnRun)!.status).toBe("FAILED");
    // A terminal row is never rewritten by a later terminal event.
    catalog.recordRunnerTerminal({ runId: timeoutRun, exitCode: 0, signal: null, failureKind: null, finishedAt: "2026-01-03T00:09:00.000Z" });
    expect(catalog.getRun(timeoutRun)!.exitCode).toBeNull();
    expect(catalog.getRun(timeoutRun)!.finishedAt).toBe("2026-01-03T00:00:30.000Z");
  });
});

describe("concurrency / busy handling", () => {
  it("serializes concurrent writers from two connections without BUSY errors", async () => {
    const dir = path.join(root, "concurrent-data");
    const catalogA = await openTestCatalog(dir);
    const catalogB = await openTestCatalog(dir);
    await Promise.all([
      catalogA.recordRunnerStart({ runId: "build-concurrent-a", configId: "c", pid: null, startedAt: "2026-01-04T00:00:00.000Z" }),
      catalogB.recordRunnerStart({ runId: "build-concurrent-b", configId: "c", pid: null, startedAt: "2026-01-04T00:00:00.000Z" }),
      catalogA.recordRunnerStart({ runId: "build-concurrent-c", configId: "c", pid: null, startedAt: "2026-01-04T00:00:00.000Z" }),
      catalogB.recordRunnerStart({ runId: "build-concurrent-d", configId: "c", pid: null, startedAt: "2026-01-04T00:00:00.000Z" }),
    ]);
    const reopened = await openTestCatalog(dir);
    for (const suffix of ["a", "b", "c", "d"]) {
      expect(reopened.getRun(`build-concurrent-${suffix}`)).not.toBeNull();
    }
  });
});

describe("backup + restore of DB AND referenced files (R1-C1 recovery proof)", () => {
  it("refuses a nonempty backup target without changing or deleting the operator's existing files", async () => {
    const dir = path.join(root, "backup-nonempty-data");
    const catalog = await openTestCatalog(dir);
    const backupDir = path.join(root, "backup-nonempty-out");
    const existingFilesDir = path.join(backupDir, CATALOG_BACKUP_FILES_DIR);
    await mkdir(existingFilesDir, { recursive: true });
    const sentinel = path.join(existingFilesDir, "existing-operator-file.txt");
    await writeFile(sentinel, "must remain untouched", "utf8");
    await expect(catalog.backupCatalog(backupDir, runsRoot)).rejects.toMatchObject({
      code: "path-refused",
    });
    expect(await readFile(sentinel, "utf8")).toBe("must remain untouched");
    await expect(stat(path.join(backupDir, CATALOG_BACKUP_DB_FILE))).rejects.toThrow();
    catalog.close();
  });

  it("detects missing/corrupt referenced files against a live runs root", async () => {
    const dir = path.join(root, "verify-files-data");
    const catalog = await openTestCatalog(dir);
    const runId = "build-verify-files";
    const runDir = await makeRealBundle(runId);
    await catalog.indexBundleDir(runDir, runId);
    expect(await catalog.verifyReferencedFiles(runsRoot)).toEqual([]);
    const missingRel = catalog.listArtifacts(runId)[0].path;
    const corruptRel = catalog.listArtifacts(runId)[1].path;
    await rm(path.join(runDir, missingRel));
    const flipped = Buffer.from(await readFile(path.join(runDir, corruptRel)));
    flipped[0] = flipped[0] ^ 0xff;
    await writeFile(path.join(runDir, corruptRel), flipped);
    const problems = await catalog.verifyReferencedFiles(runsRoot);
    expect(problems).toContainEqual({ runId, path: missingRel, problem: "missing" });
    expect(problems).toContainEqual({ runId, path: corruptRel, problem: "corrupted" });
  });

  it("refuses a backup when a referenced bundle file is missing or tampered (fail-closed snapshot)", async () => {
    const dir = path.join(root, "backup-refusal-data");
    const refusalRuns = path.join(root, "backup-refusal-runs");
    await mkdir(refusalRuns, { recursive: true });
    const catalog = await openTestCatalog(dir);
    const runId = "build-backup-refuse";
    // A REAL bundle with one output byte-flipped afterwards: indexing still
    // records engine truth, but the snapshot must refuse (its bytes are not
    // verifiable against the manifest, so no complete snapshot can exist).
    const runDir = await makeRealBundle(runId, refusalRuns);
    const manifestPath = path.join(runDir, "build-manifest.json");
    const outputs = (JSON.parse(await readFile(manifestPath, "utf8")) as { outputs: Array<{ path: string }> }).outputs;
    const victimAbs = path.join(runDir, outputs[0].path);
    const flipped = Buffer.from(await readFile(victimAbs));
    flipped[0] = flipped[0] ^ 0xff;
    await writeFile(victimAbs, flipped);
    await catalog.indexBundleDir(runDir, runId);
    expect(catalog.getRun(runId)!.integrity).toBe("tampered");

    const backupDir = path.join(root, "backup-refusal-out");
    await expect(catalog.backupCatalog(backupDir, refusalRuns)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(DetRunReaderError);
      expect((error as DetRunReaderError).code).toBe("invalid-payload");
      expect((error as DetRunReaderError).message).toContain("do not match their recorded sha256/bytes");
      return true;
    });
    // Fail-closed cleanup: no partial snapshot survives (only the empty dir shell).
    await expect(stat(path.join(backupDir, CATALOG_BACKUP_DB_FILE))).rejects.toThrow();
    await expect(stat(path.join(backupDir, CATALOG_BACKUP_MANIFEST_FILE))).rejects.toThrow();
    await expect(stat(path.join(backupDir, CATALOG_BACKUP_FILES_DIR))).rejects.toThrow();
  });

  // Runs LAST: the disaster proof destroys the shared runs root.
  it("snapshots the DB plus EVERY referenced bundle byte, recovers after the runs root is DESTROYED, and fails closed on a corrupt/incomplete backup", async () => {
    const dir = path.join(root, "backup-data");
    const catalog = await openTestCatalog(dir);
    const runId = "build-backup-a";
    const runDir = await makeRealBundle(runId);
    await catalog.indexBundleDir(runDir, runId);
    const expectedArtifacts = catalog.listArtifacts(runId);

    // --- Full DB+files snapshot ---
    const backupDir = path.join(root, "backup-out");
    const summary = await catalog.backupCatalog(backupDir, runsRoot);
    expect(summary.runCount).toBe(1);
    // Every declared output + the root manifest trust anchor.
    expect(summary.fileCount).toBe(expectedArtifacts.length + 1);
    expect((await stat(summary.dbFile)).mode & 0o777).toBe(0o600);
    expect((await stat(summary.filesRoot)).mode & 0o777).toBe(0o700);
    const manifest = JSON.parse(await readFile(summary.manifestFile, "utf8")) as {
      backupSchemaVersion: number;
      runs: Array<{
        runId: string;
        manifest: { path: string; sha256: string; bytes: number };
        files: Array<{ path: string; sha256: string; bytes: number }>;
      }>;
    };
    expect(manifest.backupSchemaVersion).toBe(1);
    expect(manifest.runs[0].runId).toBe(runId);
    expect(manifest.runs[0].manifest.path).toBe("build-manifest.json");
    // files[] lists the declared outputs; the anchor is the separate entry.
    expect(manifest.runs[0].files.map((f) => f.path).sort()).toEqual(expectedArtifacts.map((a) => a.path).sort());
    // The backup physically holds the bytes (independent of the original tree).
    const backedUpAnchor = await readFile(path.join(summary.filesRoot, runId, "build-manifest.json"));
    expect(backedUpAnchor.byteLength).toBe(manifest.runs[0].manifest.bytes);
    const backedUpOutput = await readFile(path.join(summary.filesRoot, runId, expectedArtifacts[0].path));
    expect(backedUpOutput.byteLength).toBe(expectedArtifacts[0].bytes);
    catalog.close();

    // --- DISASTER: the entire original runs root is destroyed ---
    await rm(runsRoot, { recursive: true, force: true });
    await expect(stat(runsRoot)).rejects.toThrow();

    // --- Restore into fresh directories from the backup alone ---
    const restoreData = path.join(root, "restore-data");
    const restoreRuns = path.join(root, "restore-runs");
    const restoredSummary = await StudioCatalog.restoreBackup(backupDir, { dataDir: restoreData, runsRoot: restoreRuns });
    expect(restoredSummary.runsRestored).toBe(1);
    expect(restoredSummary.filesRestored).toBe(expectedArtifacts.length + 1);

    // Independent verification of the RESTORED tree: catalog rows, referenced
    // files, and the reader's own guard + per-file byte verification.
    const restored = await openTestCatalog(restoreData);
    expect(restored.getRun(runId)!.status).toBe("SUCCEEDED");
    expect(restored.getRun(runId)!.integrity).toBe("verified");
    expect(restored.listArtifacts(runId)).toEqual(expectedArtifacts);
    expect(await restored.verifyReferencedFiles(restoreRuns)).toEqual([]);
    const reader = new BuildBundleReader();
    const view = await reader.getRun(path.join(restoreRuns, runId), runId);
    expect(view.build?.manifestVerified).toBe(true);
    const download = await reader.readArtifact(path.join(restoreRuns, runId), runId, expectedArtifacts[0].path);
    expect(download.bytes.byteLength).toBe(expectedArtifacts[0].bytes);

    // --- No silent overwrite: a second restore into the same targets refuses ---
    await expect(StudioCatalog.restoreBackup(backupDir, { dataDir: restoreData, runsRoot: restoreRuns })).rejects.toMatchObject({
      code: "path-refused",
    });
    restored.close();

    // --- Fail closed: corrupt ONE file inside the BACKUP -> restore refuses ---
    const corruptData = path.join(root, "restore-data-corrupt");
    const corruptRuns = path.join(root, "restore-runs-corrupt");
    const corruptTarget = path.join(backupDir, CATALOG_BACKUP_FILES_DIR, runId, expectedArtifacts[0].path);
    const flipped = Buffer.from(await readFile(corruptTarget));
    flipped[0] = flipped[0] ^ 0xff;
    await writeFile(corruptTarget, flipped);
    await expect(StudioCatalog.restoreBackup(backupDir, { dataDir: corruptData, runsRoot: corruptRuns })).rejects.toMatchObject({
      code: "invalid-payload",
    });
    // Nothing was written to the fresh targets.
    await expect(stat(path.join(corruptData, CATALOG_DB_FILE))).rejects.toThrow();
    // --- Fail closed: remove ONE backup file -> restore refuses ---
    await rm(corruptTarget);
    await expect(StudioCatalog.restoreBackup(backupDir, { dataDir: corruptData, runsRoot: corruptRuns })).rejects.toMatchObject({
      code: "invalid-payload",
    });
    await expect(stat(path.join(corruptData, CATALOG_DB_FILE))).rejects.toThrow();
    // --- Fail closed: remove the files/ dir entirely -> restore refuses ---
    await rm(path.join(backupDir, CATALOG_BACKUP_FILES_DIR), { recursive: true, force: true });
    await expect(StudioCatalog.restoreBackup(backupDir, { dataDir: corruptData, runsRoot: corruptRuns })).rejects.toMatchObject({
      code: "invalid-payload",
    });
    await expect(stat(path.join(corruptData, CATALOG_DB_FILE))).rejects.toThrow();
  });
});

describe("opt-in factory (STUDIO_DATA_DIR)", () => {
  const factoryGlobal = globalThis as { __detStudioCatalog?: unknown };

  it("returns null and creates nothing when unset", async () => {
    const saved = process.env[STUDIO_DATA_DIR_ENV];
    try {
      delete process.env[STUDIO_DATA_DIR_ENV];
      factoryGlobal.__detStudioCatalog = undefined;
      expect(await getStudioCatalog()).toBeNull();
      // No data dir appeared anywhere in the test root while unset.
      const dataDirs = (await readdir(root)).filter((name) => name.startsWith("factory-data"));
      expect(dataDirs).toHaveLength(0);
    } finally {
      if (saved === undefined) delete process.env[STUDIO_DATA_DIR_ENV];
      else process.env[STUDIO_DATA_DIR_ENV] = saved;
      factoryGlobal.__detStudioCatalog = undefined;
    }
  });

  it("maps an unusable STUDIO_DATA_DIR to an honest not-configured rejection", async () => {
    const saved = process.env[STUDIO_DATA_DIR_ENV];
    const filePath = path.join(root, "factory-not-a-dir");
    await writeFile(filePath, "not a directory", "utf8");
    try {
      process.env[STUDIO_DATA_DIR_ENV] = filePath;
      factoryGlobal.__detStudioCatalog = undefined;
      await expect(getStudioCatalog()).rejects.toMatchObject({ code: "not-configured" });
      // The env VALUE is never echoed into the error.
      const captured = (await getStudioCatalog().catch((error: unknown) => error)) as DetRunReaderError;
      expect(captured).toBeInstanceOf(DetRunReaderError);
      expect(captured.message).not.toContain(filePath);
    } finally {
      if (saved === undefined) delete process.env[STUDIO_DATA_DIR_ENV];
      else process.env[STUDIO_DATA_DIR_ENV] = saved;
      factoryGlobal.__detStudioCatalog = undefined;
    }
  });

  it("opens one process-wide handle and persists rows across factory calls", async () => {
    const saved = process.env[STUDIO_DATA_DIR_ENV];
    const dir = path.join(root, "factory-data");
    try {
      process.env[STUDIO_DATA_DIR_ENV] = dir;
      factoryGlobal.__detStudioCatalog = undefined;
      const first = await getStudioCatalog();
      expect(first).not.toBeNull();
      first!.recordRunnerStart({ runId: "build-factory", configId: "c", pid: null, startedAt: "2026-01-05T00:00:00.000Z" });
      const second = await getStudioCatalog();
      expect(second).toBe(first); // one process-wide handle
      expect(second!.getRun("build-factory")).not.toBeNull();
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
    } finally {
      if (saved === undefined) delete process.env[STUDIO_DATA_DIR_ENV];
      else process.env[STUDIO_DATA_DIR_ENV] = saved;
      factoryGlobal.__detStudioCatalog = undefined;
    }
  });
});
