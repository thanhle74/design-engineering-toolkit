/**
 * [50] DET Studio — the ONE seam between the catalogue and SQLite.
 *
 * Driver decision (docs/studio/sqlite-driver-spike.md): the built-in
 * `node:sqlite` `DatabaseSync`, loaded through a dynamic import so a runtime
 * without it (Node < 22.13) fails with a CLEAR, actionable not-configured
 * error instead of a module-resolution crash. Studio declares its own
 * `engines.node >= 22.13.0`; the CLI's `>=20` floor is untouched — the det CLI
 * never depends on SQLite.
 *
 * Boundaries enforced here (issue #50):
 *  - Local, opt-in, single operator. The data dir is created 0700 (an existing
 *    dir is not re-permissioned), DB/WAL/SHM files are chmod 0600 after open.
 *  - WAL where safe: `journal_mode=WAL` is attempted; if the filesystem
 *    refuses it (some network mounts), the DB stays on its default rollback
 *    journal — the catalogue still works, slightly less concurrently.
 *  - `foreign_keys=ON` is re-asserted on EVERY open (it is per-connection) and
 *    `busy_timeout` bounds contention between two Studio processes.
 *  - No network, no shared DB, no ORM, no migration tooling — migrations live
 *    in ./migrations.ts and run through plain SQL in bounded transactions.
 *  - Env VALUES are never echoed into error messages (repo-wide rule).
 */
import "server-only";

import { chmod, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

export const CATALOG_DB_FILE = "studio.sqlite";
export const CATALOG_BACKUP_DB_FILE = "studio.backup.sqlite";
export const CATALOG_BACKUP_MANIFEST_FILE = "files-manifest.json";
export const CATALOG_BACKUP_FILES_DIR = "files";
export const CATALOG_DIR_MODE = 0o700;
export const CATALOG_FILE_MODE = 0o600;
export const CATALOG_BUSY_TIMEOUT_MS = 5000;

/** The minimal DatabaseSync surface the catalogue uses (keeps the seam honest). */
export interface CatalogDatabase {
   exec(sql: string): void;
   prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
   };
   close(): void;
   open: boolean;
}

/**
 * The builtin specifier, computed at runtime: Node 22's `module.builtinModules`
 * lists `sqlite` WITHOUT the `node:` prefix (Node 24 lists both), so Vite's
 * resolver treats a literal "node:sqlite" as bundleable and fails the whole
 * suite ("Cannot bundle Node.js built-in"). A computed dynamic import is left
 * to the runtime loader by Vite (@vite-ignore) and Turbopack alike, and Node
 * resolves it identically on 22 and 24.
 */
const SQLITE_MODULE_SPECIFIER = ["node", "sqlite"].join(":") as "node:sqlite";

type NodeSqliteModule = {
   DatabaseSync: new (
      path: string,
      options?: { open?: boolean },
   ) => CatalogDatabase;
};

export type SqliteImport = () => Promise<NodeSqliteModule>;

/** Production import; tests may inject a failure to prove the honest error path. */
const defaultImport: SqliteImport = async () =>
   (await import(
      /* @vite-ignore */ SQLITE_MODULE_SPECIFIER
   )) as unknown as NodeSqliteModule;

function driverUnavailableError(reason: string): DetRunReaderError {
   return new DetRunReaderError(
      "not-configured",
      `STUDIO_DATA_DIR is set but the catalogue cannot run on this Node runtime: ${reason} The SQLite catalogue requires Node >= 22.13 (node:sqlite). ` +
         "Unset STUDIO_DATA_DIR to run Studio without persistence, or run Studio on a supported Node.",
   );
}

export interface OpenCatalogOptions {
   /** Test seam: replaces the dynamic `import("node:sqlite")`. */
   importImpl?: SqliteImport;
}

/**
 * Open an EXISTING catalogue DB file directly (restore verification path:
 * the backup snapshot is inspected before any target directory is written).
 * Same pragmas as the catalogue; no dir creation, no permission changes.
 */
export async function openExistingDatabase(
   file: string,
   opts: OpenCatalogOptions = {},
): Promise<CatalogDatabase> {
   let driver: NodeSqliteModule;
   try {
      driver = await (opts.importImpl ?? defaultImport)();
   } catch {
      throw driverUnavailableError(
         "the built-in node:sqlite module is unavailable.",
      );
   }
   if (typeof driver?.DatabaseSync !== "function") {
      throw driverUnavailableError(
         "the built-in node:sqlite module did not provide DatabaseSync.",
      );
   }
   const info = await stat(file).catch(() => null);
   if (info === null || !info.isFile()) {
      throw new DetRunReaderError(
         "invalid-payload",
         "The backup database file is missing or is not a regular file; the backup set is incomplete.",
      );
   }
   let db: CatalogDatabase;
   try {
      db = new driver.DatabaseSync(file);
      db.exec(`PRAGMA busy_timeout = ${CATALOG_BUSY_TIMEOUT_MS};`);
      db.exec("PRAGMA foreign_keys = ON;");
   } catch {
      throw new DetRunReaderError(
         "invalid-payload",
         "The backup database file could not be opened as a SQLite catalogue; the backup set is corrupt.",
      );
   }
   return db;
}

/**
 * Open (creating if needed) `<dataDir>/studio.sqlite` with the catalogue's
 * pragmas and file permissions. Creates the dir 0700 when missing; refuses a
 * non-directory. Never echoes the configured path into error messages.
 */
export async function openCatalogDatabase(
   dataDir: string,
   opts: OpenCatalogOptions = {},
): Promise<CatalogDatabase> {
   if (typeof dataDir !== "string" || dataDir.trim() === "") {
      throw new DetRunReaderError(
         "not-configured",
         "STUDIO_DATA_DIR is set but empty; it must name a local directory for the catalogue database.",
      );
   }

   let driver: NodeSqliteModule;
   try {
      driver = await (opts.importImpl ?? defaultImport)();
   } catch {
      throw driverUnavailableError(
         "the built-in node:sqlite module is unavailable.",
      );
   }
   if (typeof driver?.DatabaseSync !== "function") {
      throw driverUnavailableError(
         "the built-in node:sqlite module did not provide DatabaseSync.",
      );
   }

   let dirInfo = await stat(dataDir).catch(() => null);
   if (dirInfo === null) {
      await mkdir(dataDir, { recursive: true, mode: CATALOG_DIR_MODE }).catch(
         () => {
            throw new DetRunReaderError(
               "not-configured",
               "STUDIO_DATA_DIR is set but its directory could not be created; check local filesystem permissions.",
            );
         },
      );
      dirInfo = await stat(dataDir).catch(() => null);
   }
   if (dirInfo === null || !dirInfo.isDirectory()) {
      throw new DetRunReaderError(
         "not-configured",
         "STUDIO_DATA_DIR is set but does not name a directory.",
      );
   }

   let db: CatalogDatabase;
   try {
      db = new driver.DatabaseSync(path.join(dataDir, CATALOG_DB_FILE));
   } catch {
      throw new DetRunReaderError(
         "not-configured",
         "STUDIO_DATA_DIR is set but its catalogue database could not be opened; check local filesystem permissions.",
      );
   }

   // Catalogue metadata is the operator's private local data (issue #50):
   // owner read/write only, regardless of the process umask. The paths are
   // plain filesystem joins (turbopackIgnore silences the bundler's
   // dynamic-path heuristic — nothing here resolves modules).
   await Promise.all(
      [CATALOG_DB_FILE, `${CATALOG_DB_FILE}-wal`, `${CATALOG_DB_FILE}-shm`].map(
         (file) =>
            chmod(
               path.join(/* turbopackIgnore: true */ dataDir, file),
               CATALOG_FILE_MODE,
            ).catch(() => {}),
      ),
   ).catch(() => {});

   try {
      db.exec(`PRAGMA busy_timeout = ${CATALOG_BUSY_TIMEOUT_MS};`);
      db.exec("PRAGMA foreign_keys = ON;");
      // WAL where safe: refused journal modes fall back silently to the default
      // rollback journal (probe returns the actually-selected mode either way).
      db.exec("PRAGMA journal_mode = WAL;");
   } catch {
      db.close();
      throw new DetRunReaderError(
         "not-configured",
         "STUDIO_DATA_DIR is set but its catalogue database rejected session pragmas (foreign_keys/busy_timeout); the catalogue refuses to run without FK enforcement.",
      );
   }
   return db;
}
