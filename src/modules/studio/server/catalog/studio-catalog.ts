/**
 * [50] DET Studio — opt-in local SQLite project/run catalogue.
 *
 * Enabled ONLY by an explicit `STUDIO_DATA_DIR` (a local directory; the DB is
 * `<dir>/studio.sqlite`). Unset → `getStudioCatalog()` returns null and every
 * existing Studio mode behaves byte-for-byte as before: the DB is never a
 * dependency of the readers, the runner's single-slot guarantees, or the CLI.
 *
 * Truth boundaries (issue #50, Annex A of #30):
 *  - Files are truth. The catalogue indexes metadata ONLY from a guarded
 *    root `build-manifest.json` whose declared outputs it re-verified against
 *    on-disk bytes (shared verifyBundleOutputs — the exact check downloads
 *    use). A DB row never makes a missing/tampered file downloadable: the
 *    download path re-verifies live bytes exactly as before.
 *  - The DB stores identity/pin metadata only: project ids, validated
 *    nonsecret config hashes (never config contents), source identity pins,
 *    statuses, artifact relative paths + SHA256 + byte sizes. No KB records,
 *    no blobs, no absolute server paths, no secrets.
 *  - Terminal states come from disk or from the runner's truthful terminal
 *    event — never fabricated. A crashed job's RUNNING row is swept to
 *    INTERRUPTED (dead pid) at open; a valid bundle on disk is promoted
 *    truthfully by the indexer, never invented.
 *  - Re-index is idempotent: refreshIndex re-scans when the runs tree changes
 *    and upserts by run id; history is retained even when a bundle later
 *    disappears or corrupts (integrity flags it honestly).
 */
import "server-only";

import { createHash } from "node:crypto";
import {
   copyFile,
   readdir,
   realpath,
   stat,
   mkdir,
   chmod,
   readFile,
   rm,
   writeFile,
} from "node:fs/promises";
import path from "node:path";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import {
   BUILD_MANIFEST_FILE,
   HEX64_PATTERN,
   echoId,
   parseJsonRecord,
} from "../det-payload-parsing";
import {
   deriveBundleExitCode,
   guardBuildManifest,
   verifyBundleOutputs,
   type GuardedBuildManifest,
} from "../build-bundle-reader";
import { readContainedBytes } from "../contained-read";
import {
   RUN_ID_PATTERN,
   isInsideDir,
   isSafeRelativeArtifactPath,
} from "../artifact-access";
import { CATALOG_MIGRATIONS, migrateCatalogDatabase } from "./migrations";
import {
   CATALOG_BACKUP_DB_FILE,
   CATALOG_BACKUP_FILES_DIR,
   CATALOG_BACKUP_MANIFEST_FILE,
   CATALOG_DB_FILE,
   openCatalogDatabase,
   openExistingDatabase,
   type CatalogDatabase,
   type OpenCatalogOptions,
} from "./sqlite-driver";

export const STUDIO_DATA_DIR_ENV = "STUDIO_DATA_DIR";

export type CatalogRunStatus =
   "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "INTERRUPTED";
export type CatalogIntegrity =
   "unverified" | "verified" | "tampered" | "missing" | "corrupt";
export type CatalogRunOrigin = "build-runner" | "scan";

export interface CatalogProjectView {
   id: string;
   platformId: string;
   /** Last observed validated config hash (history lives in project_configs + runs). */
   configHash: string;
   firstSeenAt: string;
   updatedAt: string;
   configHistoryCount: number;
   runCount: number;
}

export interface CatalogRunView {
   id: string;
   projectId: string | null;
   status: CatalogRunStatus;
   origin: CatalogRunOrigin;
   configHash: string;
   sourceId: string | null;
   revisionId: string | null;
   platformId: string | null;
   inputFingerprint: string;
   exitCode: number | null;
   signal: string | null;
   failureKind: string | null;
   bundlePresent: boolean;
   integrity: CatalogIntegrity;
   manifestSha256: string | null;
   pid: number | null;
   startedAt: string | null;
   finishedAt: string | null;
   indexedAt: string;
   artifactCount: number;
}

export interface CatalogArtifactView {
   runId: string;
   path: string;
   role: string;
   sha256: string;
   bytes: number;
   verifiedAt: string | null;
}

export interface CatalogFileProblem {
   runId: string;
   path: string;
   problem: "missing" | "corrupted";
}

export interface CatalogStats {
   projects: number;
   runs: number;
   byStatus: Record<CatalogRunStatus, number>;
   artifacts: number;
}

export interface CatalogBackupSummary {
   backupDir: string;
   dbFile: string;
   manifestFile: string;
   filesRoot: string;
   runCount: number;
   fileCount: number;
}

export interface CatalogRestoreSummary {
   runsRestored: number;
   filesRestored: number;
   dataDir: string;
   runsRoot: string;
}

/** Runner hints recorded with an indexed bundle (job timing provenance). */
export interface RunnerTimingHints {
   startedAt?: string | null;
   finishedAt?: string | null;
   exitCode?: number | null;
   signal?: string | null;
}

interface RunRow {
   id: string;
   project_id: string | null;
   status: CatalogRunStatus;
   origin: CatalogRunOrigin;
   config_hash: string;
   source_id: string | null;
   revision_id: string | null;
   platform_id: string | null;
   input_fingerprint: string;
   exit_code: number | null;
   signal: string | null;
   failure_kind: string | null;
   bundle_present: number;
   integrity: CatalogIntegrity;
   manifest_sha256: string | null;
   pid: number | null;
   started_at: string | null;
   finished_at: string | null;
   indexed_at: string;
   artifact_count: number;
}

function nowIso(): string {
   return new Date().toISOString();
}

/** pid liveness for the stale-RUNNING sweep (EPERM = alive-but-protected). */
function pidAlive(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      return (
         error instanceof Error &&
         "code" in error &&
         (error as NodeJS.ErrnoException).code === "EPERM"
      );
   }
}

/** Deterministic non-secret pin hash over what the manifest freezes. */
function inputFingerprint(
   projectId: string,
   sourceId: string | null,
   revisionId: string | null,
   configHash: string,
   platformId: string,
): string {
   return createHash("sha256")
      .update(
         [
            projectId,
            sourceId ?? "",
            revisionId ?? "",
            configHash,
            platformId,
         ].join("\u0000"),
      )
      .digest("hex");
}

function rowToRunView(row: RunRow): CatalogRunView {
   return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      origin: row.origin,
      configHash: row.config_hash,
      sourceId: row.source_id,
      revisionId: row.revision_id,
      platformId: row.platform_id,
      inputFingerprint: row.input_fingerprint,
      exitCode: row.exit_code,
      signal: row.signal,
      failureKind: row.failure_kind,
      bundlePresent: row.bundle_present === 1,
      integrity: row.integrity,
      manifestSha256: row.manifest_sha256,
      pid: row.pid,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      indexedAt: row.indexed_at,
      artifactCount: row.artifact_count,
   };
}

export class StudioCatalog {
   private readonly db: CatalogDatabase;

   private constructor(db: CatalogDatabase) {
      this.db = db;
   }

   /** Open + migrate + recovery sweep (stale RUNNING rows with a dead pid). */
   static async open(
      dataDir: string,
      opts: OpenCatalogOptions = {},
   ): Promise<StudioCatalog> {
      const db = await openCatalogDatabase(dataDir, opts);
      migrateCatalogDatabase(db);
      const catalog = new StudioCatalog(db);
      catalog.sweepInterrupted();
      return catalog;
   }

   /* ------------------------- runner lifecycle hooks ------------------------- */

   /**
    * Runner job started (before spawn). Best-effort: a catalogue failure never
    * blocks or fails a build — the bundle/journal on disk remain the truth.
    */
   recordRunnerStart(job: {
      runId: string;
      configId: string;
      pid: number | null;
      startedAt: string;
   }): void {
      this.db
         .prepare(
            `INSERT OR IGNORE INTO runs (id, project_id, status, origin, config_hash, indexed_at, pid, started_at)
         VALUES (?, NULL, 'RUNNING', 'build-runner', '', ?, ?, ?)`,
         )
         .run(job.runId, nowIso(), job.pid, job.startedAt);
   }

   /**
    * Record the spawned child's pid on the RUNNING row (the stale-RUNNING
    * sweep keys on it). Best-effort; a missing pid sweep is conservative.
    */
   recordRunnerPid(runId: string, pid: number): void {
      this.db
         .prepare(`UPDATE runs SET pid = ? WHERE id = ? AND status = 'RUNNING'`)
         .run(pid, runId);
   }

   /**
    * Runner job finished WITHOUT a verifiable bundle (spawn failure, timeout,
    * or a terminal exit that produced no manifest). The terminal transition is
    * truthful: exit != 0 or spawn failure is FAILED; a timeout kill is
    * INTERRUPTED — never a fake success. Existing terminal rows are untouched.
    */
   recordRunnerTerminal(job: {
      runId: string;
      exitCode: number | null;
      signal: string | null;
      failureKind: "timeout" | "spawn-failed" | null;
      finishedAt: string | null;
   }): void {
      const status: CatalogRunStatus =
         job.failureKind === "timeout" ? "INTERRUPTED" : "FAILED";
      const updated = this.db
         .prepare(
            `UPDATE runs SET status = ?, exit_code = ?, signal = ?, failure_kind = ?, finished_at = ?, bundle_present = 0
         WHERE id = ? AND status = 'RUNNING'`,
         )
         .run(
            status,
            job.exitCode,
            job.signal,
            job.failureKind,
            job.finishedAt ?? nowIso(),
            job.runId,
         );
      if (Number(updated.changes) > 0) return;
      // The start row never landed (catalogue unavailable at start): record the
      // terminal truth directly — but never touch an existing row (a terminal
      // state is written once; history is never rewritten).
      this.db
         .prepare(
            `INSERT OR IGNORE INTO runs (id, project_id, status, origin, config_hash, indexed_at, exit_code, signal, failure_kind, finished_at)
         VALUES (?, NULL, ?, 'build-runner', '', ?, ?, ?, ?, ?)`,
         )
         .run(
            job.runId,
            status,
            nowIso(),
            job.exitCode,
            job.signal,
            job.failureKind,
            job.finishedAt ?? nowIso(),
         );
   }

   /* ------------------------------- indexing ------------------------------- */

   /**
    * Index one bundle directory from DISK TRUTH: guard the root manifest,
    * byte-verify every declared output, then upsert project/config/run/artifact
    * rows in ONE transaction. Idempotent by run id. A missing/corrupt manifest
    * on a previously-catalogued bundle marks the row corrupt (history kept);
    * a dir with no manifest at all is simply not a bundle run (null).
    */
   async indexBundleDir(
      runDir: string,
      runId: string,
      timing: RunnerTimingHints = {},
   ): Promise<{
      status: CatalogRunStatus;
      integrity: CatalogIntegrity;
   } | null> {
      if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) return null;

      let manifestBytes: Uint8Array | null = null;
      try {
         manifestBytes = await readContainedBytes(
            runDir,
            BUILD_MANIFEST_FILE,
            "invalid-payload",
         );
      } catch {
         manifestBytes = null; // present but unreadable/over-cap — treated as corrupt below
      }
      if (manifestBytes === null) {
         const exists = this.db
            .prepare(
               "SELECT id, status FROM runs WHERE id = ? AND bundle_present = 1",
            )
            .get(runId) as { status: CatalogRunStatus } | undefined;
         if (exists !== undefined) {
            this.db
               .prepare(
                  `UPDATE runs SET integrity = 'corrupt', indexed_at = ? WHERE id = ?`,
               )
               .run(nowIso(), runId);
            return { status: exists.status, integrity: "corrupt" };
         }
         return null;
      }

      let guarded: GuardedBuildManifest;
      try {
         guarded = guardBuildManifest(
            parseJsonRecord(manifestBytes, BUILD_MANIFEST_FILE),
         );
      } catch {
         const exists = this.db
            .prepare(
               "SELECT id, status FROM runs WHERE id = ? AND bundle_present = 1",
            )
            .get(runId) as { status: CatalogRunStatus } | undefined;
         if (exists !== undefined) {
            this.db
               .prepare(
                  `UPDATE runs SET integrity = 'corrupt', indexed_at = ? WHERE id = ?`,
               )
               .run(nowIso(), runId);
            return { status: exists.status, integrity: "corrupt" };
         }
         return null;
      }

      const verification = await verifyBundleOutputs(runDir, guarded);
      let badHash = 0;
      let missing = 0;
      for (const filePath of guarded.outputOrder) {
         const state = verification.get(filePath);
         if (state?.ok === true) continue;
         if (state?.reason === "declared output is missing from the bundle")
            missing += 1;
         else badHash += 1;
      }
      const integrity: CatalogIntegrity =
         badHash > 0 ? "tampered" : missing > 0 ? "missing" : "verified";

      // Status is ENGINE truth from the stage table: exit 0 → SUCCEEDED; a
      // non-zero exit with at least one completed/reused stage → PARTIAL; a
      // build whose stages all failed → FAILED. Bundle presence itself never
      // upgrades a failed build.
      const exitCode = deriveBundleExitCode(guarded.stages);
      const completedStages = guarded.stages.filter(
         (s) => s.status === "completed" || s.status === "reused",
      ).length;
      const status: CatalogRunStatus =
         exitCode === 0
            ? "SUCCEEDED"
            : completedStages > 0
              ? "PARTIAL"
              : "FAILED";

      const manifestSha256 = createHash("sha256")
         .update(manifestBytes)
         .digest("hex");
      const fingerprint = inputFingerprint(
         guarded.profileId,
         guarded.sourceId,
         guarded.revisionId,
         guarded.configContentHash,
         guarded.platformId,
      );
      const now = nowIso();

      this.db.exec("BEGIN IMMEDIATE");
      try {
         this.db
            .prepare(
               `INSERT INTO projects (id, platform_id, config_hash, first_seen_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET platform_id = excluded.platform_id, config_hash = excluded.config_hash, updated_at = excluded.updated_at`,
            )
            .run(
               guarded.profileId,
               guarded.platformId,
               guarded.configContentHash,
               now,
               now,
            );
         this.db
            .prepare(
               `INSERT INTO project_configs (project_id, config_hash, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, config_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
            )
            .run(guarded.profileId, guarded.configContentHash, now, now);
         this.db
            .prepare(
               `INSERT INTO runs (id, project_id, status, origin, config_hash, source_id, revision_id, platform_id,
             input_fingerprint, exit_code, bundle_present, integrity, manifest_sha256, started_at, finished_at, indexed_at)
           VALUES (?, ?, ?, 'scan', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = excluded.project_id,
             status = excluded.status,
             config_hash = excluded.config_hash,
             source_id = excluded.source_id,
             revision_id = excluded.revision_id,
             platform_id = excluded.platform_id,
             input_fingerprint = excluded.input_fingerprint,
             exit_code = excluded.exit_code,
             bundle_present = 1,
             integrity = excluded.integrity,
             manifest_sha256 = excluded.manifest_sha256,
             indexed_at = excluded.indexed_at,
             artifact_count = excluded.artifact_count`,
            )
            .run(
               runId,
               guarded.profileId,
               status,
               guarded.configContentHash,
               guarded.sourceId,
               guarded.revisionId,
               guarded.platformId,
               fingerprint,
               exitCode,
               integrity,
               manifestSha256,
               timing.startedAt ?? null,
               timing.finishedAt ?? null,
               now,
            );
         // Artifact rows are re-derived wholesale: the manifest is the SSOT for
         // what is in the bundle; the DB never accumulates stale outputs.
         this.db.prepare(`DELETE FROM artifacts WHERE run_id = ?`).run(runId);
         const insertArtifact = this.db.prepare(
            `INSERT INTO artifacts (run_id, path, role, sha256, bytes, verified_at) VALUES (?, ?, ?, ?, ?, ?)`,
         );
         const verifiedAt = integrity === "verified" ? now : null;
         for (const filePath of guarded.outputOrder) {
            const output = guarded.outputs.get(filePath)!;
            const fileVerified = verification.get(filePath)?.ok === true;
            insertArtifact.run(
               runId,
               filePath,
               output.role,
               output.sha256,
               output.bytes,
               fileVerified ? (verifiedAt ?? now) : null,
            );
         }
         this.db
            .prepare(`UPDATE runs SET artifact_count = ? WHERE id = ?`)
            .run(guarded.outputOrder.length, runId);
         // Runner timing is first-known provenance: never overwritten by a later scan.
         if (
            timing.startedAt !== undefined ||
            timing.finishedAt !== undefined
         ) {
            this.db
               .prepare(
                  `UPDATE runs SET
               started_at = COALESCE(started_at, ?),
               finished_at = COALESCE(finished_at, ?),
               exit_code = COALESCE(exit_code, ?),
               signal = COALESCE(signal, ?),
               origin = 'build-runner'
             WHERE id = ?`,
               )
               .run(
                  timing.startedAt ?? null,
                  timing.finishedAt ?? null,
                  timing.exitCode ?? null,
                  timing.signal ?? null,
                  runId,
               );
         }
         this.db.exec("COMMIT");
      } catch (error) {
         try {
            this.db.exec("ROLLBACK");
         } catch {
            /* nothing to roll back */
         }
         throw error instanceof DetRunReaderError
            ? error
            : new DetRunReaderError(
                 "invalid-payload",
                 `Catalogue write for run "${echoId(runId)}" failed: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`,
              );
      }

      return { status, integrity };
   }

   /**
    * Re-index when the runs tree changed since the last scan (cheap recursive
    * signature: name+size+mtime per file under candidate run dirs). Full
    * re-index on any change keeps rows exactly equal to disk truth; an
    * unchanged tree is a no-op, so restarts are cheap and idempotent.
    */
   async refreshIndex(
      runsRoot: string,
   ): Promise<{ changed: boolean; indexed: number }> {
      const rootReal = await realpath(runsRoot);
      const dirents = await readdir(rootReal, { withFileTypes: true }).catch(
         () => null,
      );
      if (dirents === null) {
         throw new DetRunReaderError(
            "not-configured",
            "STUDIO_DET_RUNS_DIR is set but cannot be listed; the catalogue cannot index runs.",
         );
      }

      const candidateIds: string[] = [];
      const signatures: string[] = [];
      for (const dirent of dirents) {
         if (!dirent.isDirectory()) continue;
         if (!RUN_ID_PATTERN.test(dirent.name)) continue;
         candidateIds.push(dirent.name);
         const dirPath = path.join(rootReal, dirent.name);
         const entries = await readdir(dirPath, {
            withFileTypes: true,
            recursive: true,
         }).catch(() => []);
         const parts: string[] = [];
         for (const entry of entries) {
            const abs = path.join(entry.parentPath, entry.name);
            const rel = path.relative(dirPath, abs);
            const info = await stat(abs).catch(() => null);
            parts.push(`${rel}:${info?.size ?? "?"}:${info?.mtimeMs ?? "?"}`);
         }
         signatures.push(`${dirent.name}::{${parts.sort().join("|")}}`);
      }
      const signature = createHash("sha256")
         .update(signatures.sort().join("\n"))
         .digest("hex");

      const stored = this.getMeta("runs_scan_signature");
      if (stored === signature) return { changed: false, indexed: 0 };

      const knownBundles = this.db
         .prepare(`SELECT id FROM runs WHERE bundle_present = 1`)
         .all() as Array<{ id: string }>;
      const knownIds = new Set(knownBundles.map((row) => row.id));
      const seen = new Set<string>();
      let indexed = 0;
      for (const runId of candidateIds.sort()) {
         seen.add(runId);
         const dirPath = path.join(rootReal, runId);
         const result = await this.indexBundleDir(dirPath, runId);
         if (result !== null) indexed += 1;
      }
      // A previously-catalogued bundle whose directory vanished keeps its row,
      // flagged truthfully — history is retained, absence is not success.
      for (const runId of knownIds) {
         if (!seen.has(runId)) {
            this.db
               .prepare(
                  `UPDATE runs SET integrity = 'missing', indexed_at = ? WHERE id = ?`,
               )
               .run(nowIso(), runId);
            indexed += 1;
         }
      }
      this.setMeta("runs_scan_signature", signature);
      return { changed: true, indexed };
   }

   /** Stale RUNNING rows whose recorded pid is gone read back as INTERRUPTED. */
   sweepInterrupted(): number {
      const running = this.db
         .prepare(`SELECT id, pid FROM runs WHERE status = 'RUNNING'`)
         .all() as Array<{ id: string; pid: number | null }>;
      let swept = 0;
      const now = nowIso();
      for (const row of running) {
         if (row.pid === null || !pidAlive(row.pid)) {
            this.db
               .prepare(
                  `UPDATE runs SET status = 'INTERRUPTED', finished_at = COALESCE(finished_at, ?) WHERE id = ? AND status = 'RUNNING'`,
               )
               .run(now, row.id);
            swept += 1;
         }
      }
      return swept;
   }

   /* -------------------------------- queries -------------------------------- */

   listProjects(): CatalogProjectView[] {
      const rows = this.db
         .prepare(
            `SELECT p.id, p.platform_id, p.config_hash, p.first_seen_at, p.updated_at,
           (SELECT COUNT(*) FROM project_configs c WHERE c.project_id = p.id) AS config_history_count,
           (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS run_count
         FROM projects p ORDER BY p.id`,
         )
         .all() as Array<{
         id: string;
         platform_id: string;
         config_hash: string;
         first_seen_at: string;
         updated_at: string;
         config_history_count: number;
         run_count: number;
      }>;
      return rows.map((row) => ({
         id: row.id,
         platformId: row.platform_id,
         configHash: row.config_hash,
         firstSeenAt: row.first_seen_at,
         updatedAt: row.updated_at,
         configHistoryCount: Number(row.config_history_count),
         runCount: Number(row.run_count),
      }));
   }

   listRuns(projectId?: string): CatalogRunView[] {
      const rows = (projectId === undefined
         ? this.db
              .prepare(
                 `SELECT * FROM runs ORDER BY (started_at IS NULL) ASC, started_at DESC, indexed_at DESC, id DESC`,
              )
              .all()
         : this.db
              .prepare(
                 `SELECT * FROM runs WHERE project_id = ? ORDER BY (started_at IS NULL) ASC, started_at DESC, indexed_at DESC, id DESC`,
              )
              .all(projectId)) as unknown as RunRow[];
      return rows.map(rowToRunView);
   }

   getRun(runId: string): CatalogRunView | null {
      const row = this.db
         .prepare(`SELECT * FROM runs WHERE id = ?`)
         .get(runId) as RunRow | undefined;
      return row === undefined ? null : rowToRunView(row);
   }

   listArtifacts(runId: string): CatalogArtifactView[] {
      const rows = this.db
         .prepare(
            `SELECT run_id, path, role, sha256, bytes, verified_at FROM artifacts WHERE run_id = ? ORDER BY path`,
         )
         .all(runId) as Array<{
         run_id: string;
         path: string;
         role: string;
         sha256: string;
         bytes: number;
         verified_at: string | null;
      }>;
      return rows.map((row) => ({
         runId: row.run_id,
         path: row.path,
         role: row.role,
         sha256: row.sha256,
         bytes: Number(row.bytes),
         verifiedAt: row.verified_at,
      }));
   }

   stats(): CatalogStats {
      const byStatus: Record<CatalogRunStatus, number> = {
         RUNNING: 0,
         SUCCEEDED: 0,
         PARTIAL: 0,
         FAILED: 0,
         INTERRUPTED: 0,
      };
      for (const run of this.listRuns()) byStatus[run.status] += 1;
      const artifacts = this.db
         .prepare(`SELECT COUNT(*) AS n FROM artifacts`)
         .get() as { n: number };
      return {
         projects: this.listProjects().length,
         runs: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
         byStatus,
         artifacts: Number(artifacts.n),
      };
   }

   /* --------------------------- backup / recovery --------------------------- */

   /**
    * [50/R1-C1] RECOVERABLE backup of the database AND every referenced
    * bundle file: a `VACUUM INTO` snapshot of the DB (no backup API on the
    * node:sqlite lines — see the spike doc) plus, for each catalogued bundle,
    * its root `build-manifest.json` trust anchor and every manifest-declared
    * output, copied under `files/<runId>/…` with their manifest-declared
    * sha256/bytes identities preserved in `files-manifest.json`.
    *
    * Fail-closed: every copied byte is read contained/size-bounded and
    * re-verified against BOTH the guard (manifest) and the DB rows before it
    * is written; any missing/mismatched bytes, guard failure, symlink escape
    * (readContainedBytes containment), or DB/manifest disagreement aborts the
    * whole backup and removes exactly the files this call wrote — a partial
    * snapshot is never presented as success. Restoring when the original runs
    * root is gone therefore works: the backup holds every needed byte.
    *
    * Backup layout (relative paths only; nothing is exposed via any route):
    *   <backupDir>/studio.backup.sqlite
    *   <backupDir>/files-manifest.json
    *   <backupDir>/files/<runId>/build-manifest.json
    *   <backupDir>/files/<runId>/<manifest-declared outputs…>
    */
   async backupCatalog(
      backupDir: string,
      runsRoot: string,
   ): Promise<CatalogBackupSummary> {
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      // Require a fresh, EMPTY backup target. Otherwise a failed snapshot
      // could remove a pre-existing files/ tree during its cleanup, or a
      // successful snapshot could overwrite another operator's files.
      // Check BEFORE chmod, VACUUM INTO or any other backup write.
      const existing = await readdir(backupDir);
      if (existing.length !== 0) {
         throw new DetRunReaderError(
            "path-refused",
            "Backup refused: the target directory is not empty; choose a new, empty backup directory.",
         );
      }
      // mkdir mode alone is umask-filtered; enforce operator-private modes.
      await chmod(backupDir, 0o700);
      const dbFile = path.join(backupDir, CATALOG_BACKUP_DB_FILE);
      const manifestFile = path.join(backupDir, CATALOG_BACKUP_MANIFEST_FILE);
      const filesRoot = path.join(backupDir, CATALOG_BACKUP_FILES_DIR);
      const written: string[] = [];
      try {
         // VACUUM INTO refuses an existing target, which keeps every backup a
         // complete fresh snapshot (callers choose a fresh directory).
         // Register the target BEFORE VACUUM: if SQLite creates a partial DB
         // and then fails, the fail-closed cleanup must remove that partial file.
         // This is safe because the directory was proven empty above.
         written.push(dbFile);
         this.db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
         await chmod(dbFile, 0o600).catch(() => {});
         await mkdir(filesRoot, { recursive: true, mode: 0o700 });
         await chmod(filesRoot, 0o700).catch(() => {});
         written.push(filesRoot);

         const entries: Array<{
            runId: string;
            manifest: { path: string; sha256: string; bytes: number };
            files: Array<{ path: string; sha256: string; bytes: number }>;
         }> = [];
         for (const run of this.listRuns()) {
            if (!run.bundlePresent) continue;
            if (run.manifestSha256 === null) {
               throw new DetRunReaderError(
                  "invalid-payload",
                  `Backup refused: run "${echoId(run.id)}" has no recorded manifest hash; re-index the runs root before backing up.`,
               );
            }
            const sourceRunDir = await this.resolveRunDirFor(runsRoot, run.id);
            const manifestBytes = await this.readVerifiedBundleFile(
               sourceRunDir,
               BUILD_MANIFEST_FILE,
               run.manifestSha256,
            );
            const guarded = guardBuildManifest(
               parseJsonRecord(manifestBytes, BUILD_MANIFEST_FILE),
            );

            // DB ↔ manifest consistency: the artifact rows must match the guard,
            // otherwise the catalogue is stale and no consistent snapshot exists.
            const rows = this.listArtifacts(run.id);
            if (rows.length !== guarded.outputOrder.length) {
               throw new DetRunReaderError(
                  "invalid-payload",
                  `Backup refused: catalogue rows for run "${echoId(run.id)}" disagree with its build manifest. Re-index the runs root before backing up.`,
               );
            }
            for (const filePath of guarded.outputOrder) {
               const output = guarded.outputs.get(filePath)!;
               const row = rows.find((r) => r.path === filePath);
               if (
                  row === undefined ||
                  row.sha256 !== output.sha256 ||
                  row.bytes !== output.bytes
               ) {
                  throw new DetRunReaderError(
                     "invalid-payload",
                     `Backup refused: catalogue row for "${echoId(filePath)}" in run "${echoId(run.id)}" disagrees with its build manifest. Re-index the runs root before backing up.`,
                  );
               }
            }

            const runFilesDir = path.join(filesRoot, run.id);
            await mkdir(runFilesDir, { recursive: true, mode: 0o700 });
            await chmod(runFilesDir, 0o700).catch(() => {});
            written.push(runFilesDir);
            await this.writeBackupFile(
               runFilesDir,
               BUILD_MANIFEST_FILE,
               manifestBytes,
            );
            // files[] lists the declared OUTPUTS; the root manifest trust anchor
            // is the separate `manifest` entry (never double-listed).
            const files: Array<{
               path: string;
               sha256: string;
               bytes: number;
            }> = [];
            for (const filePath of guarded.outputOrder) {
               const output = guarded.outputs.get(filePath)!;
               const bytes = await this.readVerifiedBundleFile(
                  sourceRunDir,
                  filePath,
                  output.sha256,
                  output.bytes,
               );
               await this.writeBackupFile(runFilesDir, filePath, bytes);
               files.push({
                  path: filePath,
                  sha256: output.sha256,
                  bytes: output.bytes,
               });
            }
            entries.push({
               runId: run.id,
               manifest: {
                  path: BUILD_MANIFEST_FILE,
                  sha256: run.manifestSha256!,
                  bytes: manifestBytes.byteLength,
               },
               files,
            });
         }

         const manifest = {
            backupSchemaVersion: 1,
            generatedAt: nowIso(),
            dbFile: CATALOG_BACKUP_DB_FILE,
            filesRoot: CATALOG_BACKUP_FILES_DIR,
            runCount: entries.length,
            fileCount: entries.reduce(
               (sum, entry) => sum + entry.files.length + 1,
               0,
            ),
            runs: entries,
         };
         await writeFile(
            manifestFile,
            `${JSON.stringify(manifest, null, 2)}\n`,
            { encoding: "utf8", mode: 0o600 },
         );
         written.push(manifestFile);
         return {
            backupDir,
            dbFile,
            manifestFile,
            filesRoot,
            runCount: entries.length,
            fileCount: manifest.fileCount,
         };
      } catch (error) {
         // Fail closed: remove exactly what THIS call wrote (never sweep the
         // operator's pre-existing backupDir content). Directories go down
         // recursively — a run's files dir lives inside files/ and must not
         // survive a refused snapshot.
         await Promise.all(
            [...written]
               .reverse()
               .map((p) => rm(p, { recursive: true, force: true })),
         ).catch(() => {});
         throw error instanceof DetRunReaderError
            ? error
            : new DetRunReaderError(
                 "invalid-payload",
                 `Backup failed before completing a consistent snapshot: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`,
              );
      }
   }

   /**
    * [50/R1-C1] Restore a backup produced by backupCatalog into FRESH target
    * directories: verify the backup set is complete and internally consistent
    * (DB ↔ files-manifest ↔ copied bytes) BEFORE writing anything, then copy
    * the DB as the target's studio.sqlite and each run's files under the
    * target runs root. Refuses partial/corrupt sets, existing targets (no
    * silent overwrite of live runs), and any sha256/bytes disagreement —
    * all-or-nothing on the verification side; file copies happen only after
    * the whole set checked out.
    */
   static async restoreBackup(
      backupDir: string,
      targets: { dataDir: string; runsRoot: string },
   ): Promise<CatalogRestoreSummary> {
      const dbFile = path.join(backupDir, CATALOG_BACKUP_DB_FILE);
      const manifestFile = path.join(backupDir, CATALOG_BACKUP_MANIFEST_FILE);
      const filesRoot = path.join(backupDir, CATALOG_BACKUP_FILES_DIR);
      const filesRootReal = await realpath(filesRoot).catch(() => null);
      if (filesRootReal === null) {
         throw new DetRunReaderError(
            "invalid-payload",
            "Restore refused: the backup's files/ directory is missing; the backup set is incomplete.",
         );
      }

      // 1. Parse the files manifest and validate every listed path shape.
      const rawManifest = await readFile(manifestFile, "utf8").catch(
         () => null,
      );
      if (rawManifest === null) {
         throw new DetRunReaderError(
            "invalid-payload",
            "Restore refused: files-manifest.json is missing; the backup set is incomplete.",
         );
      }
      let parsedManifest: unknown;
      try {
         parsedManifest = JSON.parse(rawManifest);
      } catch {
         throw new DetRunReaderError(
            "invalid-payload",
            "Restore refused: files-manifest.json is not valid JSON.",
         );
      }
      if (
         typeof parsedManifest !== "object" ||
         parsedManifest === null ||
         !Array.isArray((parsedManifest as { runs?: unknown }).runs)
      ) {
         throw new DetRunReaderError(
            "invalid-payload",
            "Restore refused: files-manifest.json has an unexpected shape.",
         );
      }
      const manifest = parsedManifest as {
         backupSchemaVersion: number;
         runs: Array<{ runId: unknown; manifest?: unknown; files?: unknown }>;
      };
      if (manifest.backupSchemaVersion !== 1) {
         throw new DetRunReaderError(
            "invalid-payload",
            `Restore refused: unsupported backup schema version (${String(manifest.backupSchemaVersion).slice(0, 20)}).`,
         );
      }

      interface ListedFile {
         runId: string;
         path: string;
         sha256: string;
         bytes: number;
         isManifestAnchor: boolean;
      }
      const listed: ListedFile[] = [];
      for (const entry of manifest.runs) {
         const runId = entry.runId;
         if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
            throw new DetRunReaderError(
               "invalid-payload",
               "Restore refused: files-manifest.json names an invalid run id.",
            );
         }
         const anchor = entry.manifest as
            { path?: unknown; sha256?: unknown; bytes?: unknown } | undefined;
         if (
            anchor === undefined ||
            typeof anchor.path !== "string" ||
            !isSafeRelativeArtifactPath(anchor.path) ||
            typeof anchor.sha256 !== "string" ||
            !HEX64_PATTERN.test(anchor.sha256) ||
            typeof anchor.bytes !== "number" ||
            !Number.isInteger(anchor.bytes) ||
            anchor.bytes < 1
         ) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: run "${echoId(runId)}" has an invalid manifest anchor entry.`,
            );
         }
         listed.push({
            runId,
            path: anchor.path,
            sha256: anchor.sha256,
            bytes: anchor.bytes,
            isManifestAnchor: true,
         });
         if (!Array.isArray(entry.files)) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: run "${echoId(runId)}" has no file list.`,
            );
         }
         for (const file of entry.files) {
            const f = file as {
               path?: unknown;
               sha256?: unknown;
               bytes?: unknown;
            };
            if (
               typeof f?.path !== "string" ||
               !isSafeRelativeArtifactPath(f.path) ||
               typeof f.sha256 !== "string" ||
               !HEX64_PATTERN.test(f.sha256) ||
               typeof f.bytes !== "number" ||
               !Number.isInteger(f.bytes) ||
               f.bytes < 1
            ) {
               throw new DetRunReaderError(
                  "invalid-payload",
                  `Restore refused: run "${echoId(runId)}" has an invalid file entry.`,
               );
            }
            listed.push({
               runId,
               path: f.path,
               sha256: f.sha256,
               bytes: f.bytes,
               isManifestAnchor: false,
            });
         }
      }

      // 2. Verify every listed file inside the BACKUP: contained read, sha256 + bytes.
      for (const file of listed) {
         const abs = path.join(filesRootReal, file.runId, file.path);
         const real = await realpath(abs).catch(() => null);
         if (real === null || !isInsideDir(real, filesRootReal)) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: backup file for run "${echoId(file.runId)}" escapes the backup set.`,
            );
         }
         const bytes = await readFile(real).catch(() => null);
         if (bytes === null) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: a backup file of run "${echoId(file.runId)}" is missing; the set is incomplete.`,
            );
         }
         const diskSha256 = createHash("sha256").update(bytes).digest("hex");
         if (diskSha256 !== file.sha256 || bytes.byteLength !== file.bytes) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: a backup file of run "${echoId(file.runId)}" does not match its recorded sha256/bytes (corrupt backup).`,
            );
         }
      }

      // 3. Verify the backup DB against the files manifest BEFORE any target write.
      const backupDb = await openExistingDatabase(dbFile);
      try {
         const versionRow = backupDb
            .prepare("SELECT MAX(number) AS v FROM catalog_migrations")
            .get() as { v: number | null };
         const backupVersion = versionRow.v === null ? 0 : Number(versionRow.v);
         if (backupVersion !== CATALOG_MIGRATIONS.length) {
            throw new DetRunReaderError(
               "invalid-payload",
               `Restore refused: the backup DB schema version (${backupVersion}) is not supported by this Studio (expected ${CATALOG_MIGRATIONS.length}); restore with a matching Studio version.`,
            );
         }
         const bundleRows = backupDb
            .prepare(
               `SELECT id, manifest_sha256 FROM runs WHERE bundle_present = 1`,
            )
            .all() as Array<{ id: string; manifest_sha256: string | null }>;
         if (bundleRows.length !== manifest.runs.length) {
            throw new DetRunReaderError(
               "invalid-payload",
               "Restore refused: the backup DB and its files manifest disagree about the catalogued bundle runs.",
            );
         }
         for (const row of bundleRows) {
            const entry = manifest.runs.find((r) => r.runId === row.id);
            const anchor = entry?.manifest as { sha256?: unknown } | undefined;
            if (
               entry === undefined ||
               typeof anchor?.sha256 !== "string" ||
               anchor.sha256 !== row.manifest_sha256
            ) {
               throw new DetRunReaderError(
                  "invalid-payload",
                  `Restore refused: the backup DB and its files manifest disagree for run "${echoId(row.id)}".`,
               );
            }
            const dbFiles = backupDb
               .prepare(
                  `SELECT path, sha256, bytes FROM artifacts WHERE run_id = ? ORDER BY path`,
               )
               .all(row.id) as Array<{
               path: string;
               sha256: string;
               bytes: number;
            }>;
            const listedFiles = listed.filter(
               (l) => l.runId === row.id && !l.isManifestAnchor,
            );
            if (dbFiles.length !== listedFiles.length) {
               throw new DetRunReaderError(
                  "invalid-payload",
                  `Restore refused: the backup DB and its files manifest disagree on artifact count for run "${echoId(row.id)}".`,
               );
            }
            for (const dbFile of dbFiles) {
               const match = listedFiles.find((l) => l.path === dbFile.path);
               if (
                  match === undefined ||
                  match.sha256 !== dbFile.sha256 ||
                  match.bytes !== Number(dbFile.bytes)
               ) {
                  throw new DetRunReaderError(
                     "invalid-payload",
                     `Restore refused: the backup DB and its files manifest disagree on "${echoId(dbFile.path)}" of run "${echoId(row.id)}".`,
                  );
               }
            }
         }
      } finally {
         backupDb.close();
      }

      // 4. Targets must be fresh — no silent overwrite of live runs or a DB.
      await mkdir(targets.dataDir, { recursive: true, mode: 0o700 });
      await chmod(targets.dataDir, 0o700).catch(() => {});
      const targetDb = path.join(targets.dataDir, CATALOG_DB_FILE);
      if (
         await stat(targetDb)
            .then(() => true)
            .catch(() => false)
      ) {
         throw new DetRunReaderError(
            "path-refused",
            "Restore refused: the target data directory already holds a catalogue database; choose an empty directory (no silent overwrite).",
         );
      }
      await mkdir(targets.runsRoot, { recursive: true, mode: 0o700 }).catch(
         async () => {
            const info = await stat(targets.runsRoot).catch(() => null);
            if (info === null || !info.isDirectory()) {
               throw new DetRunReaderError(
                  "path-refused",
                  "Restore refused: the target runs root is not a usable directory.",
               );
            }
         },
      );
      const runsRootReal = await realpath(targets.runsRoot);
      for (const entry of manifest.runs) {
         const runId = entry.runId as string;
         if (
            await stat(path.join(runsRootReal, runId))
               .then(() => true)
               .catch(() => false)
         ) {
            throw new DetRunReaderError(
               "path-refused",
               `Restore refused: a run directory "${echoId(runId)}" already exists in the target runs root (no silent overwrite of live runs).`,
            );
         }
      }

      // 5. Verified set + fresh targets: copy DB then files.
      await copyFile(dbFile, targetDb);
      await chmod(targetDb, 0o600).catch(() => {});
      let filesRestored = 0;
      for (const file of listed) {
         const sourceReal = await realpath(
            path.join(filesRootReal, file.runId, file.path),
         );
         const targetRunDir = path.join(runsRootReal, file.runId);
         await mkdir(targetRunDir, { recursive: true, mode: 0o700 });
         await chmod(targetRunDir, 0o700).catch(() => {});
         const segments = file.path.split("/");
         const dirPath = path.join(targetRunDir, ...segments.slice(0, -1));
         if (segments.length > 1) {
            await mkdir(dirPath, { recursive: true, mode: 0o700 });
         }
         const targetFile = path.join(targetRunDir, ...segments);
         await copyFile(sourceReal, targetFile);
         await chmod(targetFile, 0o600).catch(() => {});
         filesRestored += 1;
      }
      return {
         runsRestored: manifest.runs.length,
         filesRestored,
         dataDir: targets.dataDir,
         runsRoot: runsRootReal,
      };
   }

   /* ------------------------------ backup internals ------------------------------ */

   /**
    * Contained, size-bounded read of one bundle file whose bytes MUST hash to
    * `expectedSha256` (and optionally match `expectedBytes`) — the fail-closed
    * core of both backup verification and the DB-consistency probe.
    */
   private async readVerifiedBundleFile(
      runDir: string,
      relativePath: string,
      expectedSha256: string,
      expectedBytes?: number,
   ): Promise<Buffer> {
      if (!isSafeRelativeArtifactPath(relativePath)) {
         throw new DetRunReaderError(
            "path-refused",
            `Backup refused: "${echoId(relativePath)}" is not a safe bundle-relative path.`,
         );
      }
      const bytes = await readContainedBytes(
         runDir,
         relativePath,
         "invalid-payload",
      ).catch(() => null);
      if (bytes === null) {
         throw new DetRunReaderError(
            "invalid-payload",
            `Backup refused: "${echoId(relativePath)}" is missing from its bundle; a complete snapshot cannot be taken. Re-index or rebuild the bundle first.`,
         );
      }
      const diskSha256 = createHash("sha256").update(bytes).digest("hex");
      if (
         diskSha256 !== expectedSha256 ||
         (expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
      ) {
         throw new DetRunReaderError(
            "invalid-payload",
            `Backup refused: the on-disk bytes of "${echoId(relativePath)}" do not match their recorded sha256/bytes; a complete snapshot cannot be taken. Re-index or rebuild the bundle first.`,
         );
      }
      return Buffer.from(bytes);
   }

   /** Write one file into the backup set (0600, safe relative path inside it). */
   private async writeBackupFile(
      runFilesDir: string,
      relativePath: string,
      bytes: Buffer,
   ): Promise<void> {
      const segments = relativePath.split("/");
      if (segments.length > 1) {
         const dirPath = path.join(runFilesDir, ...segments.slice(0, -1));
         await mkdir(dirPath, { recursive: true, mode: 0o700 });
         await chmod(dirPath, 0o700).catch(() => {});
      }
      const target = path.join(runFilesDir, ...segments);
      await writeFile(target, bytes, { mode: 0o600 });
      await chmod(target, 0o600).catch(() => {});
   }

   /**
    * The source directory of one catalogued bundle run: `<runsRoot>/<runId>`,
    * realpath-contained. The runs root is a caller parameter (the catalogue
    * stores relative paths only — never absolute server paths).
    */
   private async resolveRunDirFor(
      runsRoot: string,
      runId: string,
   ): Promise<string> {
      const rootReal = await realpath(runsRoot).catch(() => null);
      if (rootReal === null) {
         throw new DetRunReaderError(
            "not-configured",
            "Backup refused: the configured runs root is not readable.",
         );
      }
      const runDir = path.join(rootReal, runId);
      const runReal = await realpath(runDir).catch(() => null);
      if (runReal === null || !isInsideDir(runReal, rootReal)) {
         throw new DetRunReaderError(
            "invalid-payload",
            `Backup refused: the bundle directory of run "${echoId(runId)}" is missing or escapes the runs root.`,
         );
      }
      return runReal;
   }

   /**
    * Re-check every catalogued artifact against the files under `runsRoot`
    * (the catalogue stores relative paths only — the caller supplies the
    * configured runs root). Missing/corrupt files are reported, never healed.
    */
   async verifyReferencedFiles(
      runsRoot: string,
   ): Promise<CatalogFileProblem[]> {
      const rootReal = await realpath(runsRoot);
      const problems: CatalogFileProblem[] = [];
      for (const run of this.listRuns()) {
         if (!run.bundlePresent) continue;
         const runDir = path.join(rootReal, run.id);
         for (const artifact of this.listArtifacts(run.id)) {
            const bytes = await readContainedBytes(
               runDir,
               artifact.path,
               "invalid-payload",
            ).catch(() => null);
            if (bytes === null) {
               problems.push({
                  runId: run.id,
                  path: artifact.path,
                  problem: "missing",
               });
               continue;
            }
            const diskSha256 = createHash("sha256").update(bytes).digest("hex");
            if (
               diskSha256 !== artifact.sha256 ||
               bytes.byteLength !== artifact.bytes
            ) {
               problems.push({
                  runId: run.id,
                  path: artifact.path,
                  problem: "corrupted",
               });
            }
         }
      }
      return problems;
   }

   /* ------------------------------- internals ------------------------------- */

   private getMeta(key: string): string | null {
      const row = this.db
         .prepare(`SELECT value FROM catalog_meta WHERE key = ?`)
         .get(key) as { value: string } | undefined;
      return row === undefined ? null : row.value;
   }

   private setMeta(key: string, value: string): void {
      this.db
         .prepare(
            `INSERT INTO catalog_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
         )
         .run(key, value);
   }

   close(): void {
      this.db.close();
   }
}

/* ------------------------------- factory ------------------------------- */

const globalForCatalog = globalThis as {
   __detStudioCatalog?: Promise<StudioCatalog | null>;
};

/**
 * The ONE process-wide catalogue (null = persistence off: `STUDIO_DATA_DIR`
 * unset). Next.js dev can reload route modules; the global keeps one DB
 * handle across re-evaluations, exactly like the build runner's slot.
 */
export async function getStudioCatalog(): Promise<StudioCatalog | null> {
   if (globalForCatalog.__detStudioCatalog === undefined) {
      const configured = process.env[STUDIO_DATA_DIR_ENV];
      if (configured === undefined) {
         globalForCatalog.__detStudioCatalog = Promise.resolve(null);
         return null;
      }
      globalForCatalog.__detStudioCatalog = StudioCatalog.open(
         configured,
      ).catch((error) => {
         globalForCatalog.__detStudioCatalog = undefined;
         throw error;
      });
   }
   return globalForCatalog.__detStudioCatalog;
}
