/**
 * [50] sqlite-driver tests — the driver/deployment spike proven in code:
 * permissions, WAL, FK enforcement, busy_timeout, and the HONEST failure when
 * the built-in node:sqlite module is unavailable (Node < 22.13 runtimes).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import {
  CATALOG_BUSY_TIMEOUT_MS,
  CATALOG_DB_FILE,
  CATALOG_FILE_MODE,
  openCatalogDatabase,
} from "./sqlite-driver";

let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "det50-driver-"));
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("openCatalogDatabase", () => {
  it("creates the data dir 0700 and the DB file 0600 when missing", async () => {
    const fresh = path.join(dataDir, "fresh-0700");
    const db = await openCatalogDatabase(fresh);
    try {
      const dirMode = (await stat(fresh)).mode & 0o777;
      expect(dirMode).toBe(0o700);
      const fileMode = (await stat(path.join(fresh, CATALOG_DB_FILE))).mode & 0o777;
      expect(fileMode).toBe(CATALOG_FILE_MODE);
    } finally {
      db.close();
    }
  });

  it("opens an existing dir without re-permissioning it and enables FK + WAL + busy_timeout", async () => {
    const existing = path.join(dataDir, "existing-dir");
    await mkdir(existing, { mode: 0o755 });
    const db = await openCatalogDatabase(existing);
    try {
      // Existing dir keeps its own mode (operator-owned).
      expect((await stat(existing)).mode & 0o777).toBe(0o755);

      db.exec("CREATE TABLE parent (id TEXT PRIMARY KEY)");
      db.exec("CREATE TABLE child (parent_id TEXT REFERENCES parent(id) ON DELETE RESTRICT)");
      let fkThrew = false;
      try {
        db.prepare("INSERT INTO child VALUES (?)").run("no-such-parent");
      } catch {
        fkThrew = true;
      }
      expect(fkThrew).toBe(true);

      const pragmas = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(Number(pragmas.foreign_keys)).toBe(1);
      const busy = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
      expect(Number(busy.timeout)).toBe(CATALOG_BUSY_TIMEOUT_MS);
      // WAL where safe (local tmpfs/ext4): the probe asserts the selected mode.
      const journal = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(journal.journal_mode).toBe("wal");
    } finally {
      db.close();
    }
  });

  it("refuses an empty configuration and a non-directory", async () => {
    await expect(openCatalogDatabase("")).rejects.toMatchObject({ code: "not-configured" });
    const file = path.join(dataDir, "a-file");
    await writeFile(file, "not a dir", "utf8");
    await expect(openCatalogDatabase(file)).rejects.toMatchObject({ code: "not-configured" });
  });

  it("fails honestly (not-configured) when node:sqlite is unavailable, naming the floor", async () => {
    await expect(
      openCatalogDatabase(dataDir, {
        importImpl: async () => {
          throw new Error("Cannot find module 'node:sqlite'");
        },
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DetRunReaderError);
      const readerError = err as DetRunReaderError;
      expect(readerError.code).toBe("not-configured");
      expect(readerError.message).toContain("Node >= 22.13");
      expect(readerError.message).toContain("STUDIO_DATA_DIR");
      // The env VALUE is never echoed.
      expect(readerError.message).not.toContain(dataDir);
      return true;
    });
  });
});
