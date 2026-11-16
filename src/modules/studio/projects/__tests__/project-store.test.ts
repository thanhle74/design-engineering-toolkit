import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
   ProjectStoreError,
   addFigmaPage,
   createProject,
   deleteProject,
   getProject,
   listProjects,
   resetToDemoSeed,
} from "@/src/modules/studio/projects/project-store";

/**
 * [74] project-store hardening contract:
 *  - ENOENT initializes the deliberate demo seed (only that path does);
 *  - a corrupt store FAILS CLOSED with a typed error and never touches the
 *    bytes on disk;
 *  - writes are atomic (temp file + rename; no torn target, no tmp litter);
 *  - concurrent read-modify-write operations cannot lose each other's writes;
 *  - untrusted input (names, ids, notes, Figma URLs) is rejected with typed
 *    `invalid-input` errors for the routes to map to 400.
 *
 * Existing route/store behavior tests live in `./projects-route.test.ts`
 * (assertions preserved verbatim from the pre-[74] `app/api/projects`
 * suite); this file adds the NEW guarantees only.
 */

let root: string;
const originalDataDir = process.env.STUDIO_DATA_DIR;

const STORE_FILE = () => path.join(root, "projects-catalog.json");

async function readStoreBytes(): Promise<string> {
   return readFile(STORE_FILE(), "utf-8");
}

async function listTmpLitter(): Promise<string[]> {
   const entries = await readdir(root);
   return entries.filter((entry) => entry.includes(".tmp"));
}

beforeAll(async () => {
   root = await mkdtemp(path.join(os.tmpdir(), "det-project-store-test-"));
   process.env.STUDIO_DATA_DIR = root;
});

afterAll(async () => {
   if (originalDataDir !== undefined) {
      process.env.STUDIO_DATA_DIR = originalDataDir;
   } else {
      delete process.env.STUDIO_DATA_DIR;
   }
   await chmod(root, 0o755).catch(() => undefined);
   await rm(root, { recursive: true, force: true });
});

describe("project-store hardening [74]", () => {
   it("initializes the deliberate demo seed when the store file is absent (ENOENT only)", async () => {
      const projects = await listProjects();
      expect(projects.length).toBeGreaterThan(0);
      expect(projects[0].id).toBe("slaunchpad-fashion");
      // The seed write itself landed on disk atomically.
      expect((await listTmpLitter()).length).toBe(0);
      await expect(readStoreBytes()).resolves.toContain("slaunchpad-fashion");
   });

   it("fails CLOSED with a typed store-corrupt error when the JSON is unparseable and leaves the file bytes untouched", async () => {
      const corrupt = "{ this is not json at all";
      await writeFile(STORE_FILE(), corrupt, "utf-8");

      let caught: unknown;
      try {
         await listProjects();
      } catch (error) {
         caught = error;
      }
      expect(caught).toBeInstanceOf(ProjectStoreError);
      expect((caught as ProjectStoreError).code).toBe("store-corrupt");
      // Original bytes survive — the store never auto-resets.
      await expect(readStoreBytes()).resolves.toBe(corrupt);
      expect((await listTmpLitter()).length).toBe(0);
   });

   it("fails CLOSED when the JSON parses but has the wrong shape", async () => {
      const wrongShape = JSON.stringify({ projects: [] });
      await writeFile(STORE_FILE(), wrongShape, "utf-8");

      await expect(listProjects()).rejects.toMatchObject({
         name: "ProjectStoreError",
         code: "store-corrupt",
      });
      await expect(readStoreBytes()).resolves.toBe(wrongShape);
   });

   it("fails CLOSED with store-io on unreadable file (permission denied) without rewriting anything", async () => {
      await writeFile(STORE_FILE(), JSON.stringify([]), "utf-8");
      await chmod(STORE_FILE(), 0o000);
      try {
         await expect(listProjects()).rejects.toMatchObject({
            name: "ProjectStoreError",
            code: "store-io",
         });
      } finally {
         await chmod(STORE_FILE(), 0o644);
      }
   });

   it("writes atomically: a failed write leaves the previous content intact and no temp litter", async () => {
      await resetToDemoSeed();
      const before = await readStoreBytes();

      // Make the store directory unwritable → the temp file cannot be created
      // (the rename step is never reached), so the target cannot be torn.
      await chmod(root, 0o555);
      let caught: unknown;
      try {
         await createProject({ name: "Should Never Land" });
      } catch (error) {
         caught = error;
      } finally {
         await chmod(root, 0o755);
      }
      expect(caught).toBeInstanceOf(ProjectStoreError);
      expect((caught as ProjectStoreError).code).toBe("store-io");
      await expect(readStoreBytes()).resolves.toBe(before);
      expect((await listTmpLitter()).length).toBe(0);
   });

   it("serializes concurrent mutations so no write is lost", async () => {
      await resetToDemoSeed();

      const [alpha, beta] = await Promise.all([
         createProject({ name: "Concurrency Alpha" }),
         createProject({ name: "Concurrency Beta" }),
         addFigmaPage("slaunchpad-fashion", {
            name: "Concurrent Page",
            figmaUrl: "245:77",
         }),
         addFigmaPage("slaunchpad-fashion", {
            name: "Concurrent Page 2",
            figmaUrl: "245:78",
         }),
      ]);

      const projects = await listProjects();
      const ids = projects.map((p) => p.id);
      // Every mutation landed — without the lock, the last writer would
      // clobber the snapshot reads of the others.
      expect(ids).toContain(alpha.id);
      expect(ids).toContain(beta.id);
      const fashion = projects.find((p) => p.id === "slaunchpad-fashion");
      expect(fashion).toBeDefined();
      expect(
         fashion!.pages.some((p) => p.name === "Concurrent Page"),
      ).toBe(true);
      expect(
         fashion!.pages.some((p) => p.name === "Concurrent Page 2"),
      ).toBe(true);
      expect((await listTmpLitter()).length).toBe(0);
   });

   it("rejects invalid names, ids, notes and Figma URLs with typed invalid-input errors", async () => {
      await resetToDemoSeed();

      // Over-long project name.
      await expect(
         createProject({ name: "x".repeat(201) }),
      ).rejects.toMatchObject({ code: "invalid-input" });
      // Control character in name.
      await expect(
         createProject({ name: "Bad\nName" }),
      ).rejects.toMatchObject({ code: "invalid-input" });
      // Malformed explicit id.
      await expect(
         createProject({ name: "Valid Name", id: "bad id!" }),
      ).rejects.toMatchObject({ code: "invalid-input" });
      // Malformed projectId lookup.
      await expect(getProject("bad id!")).rejects.toMatchObject({
         code: "invalid-input",
      });
      await expect(getProject("")).rejects.toMatchObject({
         code: "invalid-input",
      });
      // Invalid Figma URL — the parser's own message surfaces verbatim.
      await expect(
         addFigmaPage("slaunchpad-fashion", {
            name: "Invalid Page",
            figmaUrl: "not-a-figma-url-or-node",
         }),
      ).rejects.toMatchObject({ code: "invalid-input" });
      // Control character in page notes.
      await expect(
         addFigmaPage("slaunchpad-fashion", {
            name: "Notes Page",
            figmaUrl: "245:5",
            notes: "line1\u0000line2",
         }),
      ).rejects.toMatchObject({ code: "invalid-input" });
      // Nothing above may have touched the store.
      expect((await listTmpLitter()).length).toBe(0);
   });

   it("still answers null for a well-formed id that does not exist (404 path preserved)", async () => {
      await expect(getProject("no-such-project")).resolves.toBeNull();
      await expect(deleteProject("no-such-project")).resolves.toBe(false);
   });

   it("keeps valid edge inputs working: bounded-length names and Vietnamese text", async () => {
      const created = await createProject({
         name: "D".repeat(200),
         description: "Mô tả tiếng Việt có dấu",
      });
      expect(created.name).toHaveLength(200);
      const retrieved = await getProject(created.id);
      expect(retrieved?.description).toBe("Mô tả tiếng Việt có dấu");
      await expect(deleteProject(created.id)).resolves.toBe(true);
   });

   it("exposes resetToDemoSeed as the explicit, deliberate reset path", async () => {
      await createProject({ name: "Temporary Junk" });
      const reset = await resetToDemoSeed();
      expect(reset.map((p) => p.id)).toEqual(["slaunchpad-fashion"]);
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("slaunchpad-fashion");
   });
});
