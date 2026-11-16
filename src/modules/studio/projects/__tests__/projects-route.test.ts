import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
   addFigmaPage,
   createProject,
   deleteFigmaPage,
   deleteProject,
   getProject,
   listProjects,
} from "@/src/modules/studio/projects/project-store";
import { GET, POST } from "@/app/api/projects/route";

let root: string;
const originalDataDir = process.env.STUDIO_DATA_DIR;

beforeAll(async () => {
   root = await mkdtemp(path.join(os.tmpdir(), "det-projects-test-"));
   process.env.STUDIO_DATA_DIR = root;
});

afterAll(async () => {
   if (originalDataDir !== undefined) {
      process.env.STUDIO_DATA_DIR = originalDataDir;
   } else {
      delete process.env.STUDIO_DATA_DIR;
   }
   await rm(root, { recursive: true, force: true });
});

describe("Project Store & API", () => {
   it("initializes default seed projects when empty", async () => {
      const projects = await listProjects();
      expect(projects.length).toBeGreaterThan(0);
      expect(projects[0].id).toBe("slaunchpad-fashion");
      expect(projects[0].pages.length).toBe(3);
   });

   it("creates a new project and retrieves it", async () => {
      const created = await createProject({
         name: "Test Store",
         description: "A test project",
         platformId: "magento-page-builder",
      });
      expect(created.id).toBe("test-store");
      expect(created.name).toBe("Test Store");

      const retrieved = await getProject("test-store");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("test-store");
   });

   it("adds a Figma page to a project with valid parsing", async () => {
      const page = await addFigmaPage("test-store", {
         name: "Header Section",
         figmaUrl: "245:99",
         notes: "Test notes",
      });
      expect(page.name).toBe("Header Section");
      expect(page.nodeId).toBe("245:99");

      const project = await getProject("test-store");
      expect(project?.pages.some((p) => p.id === page.id)).toBe(true);
   });

   it("rejects an invalid Figma URL/node id when adding a page", async () => {
      await expect(
         addFigmaPage("test-store", {
            name: "Invalid Page",
            figmaUrl: "not-a-figma-url-or-node",
         }),
      ).rejects.toThrow();
   });

   it("deletes a page from a project", async () => {
      const projectBefore = await getProject("test-store");
      const pageId = projectBefore!.pages[0].id;

      const deleted = await deleteFigmaPage("test-store", pageId);
      expect(deleted).toBe(true);

      const projectAfter = await getProject("test-store");
      expect(projectAfter?.pages.some((p) => p.id === pageId)).toBe(false);
   });

   it("deletes a project", async () => {
      const deleted = await deleteProject("test-store");
      expect(deleted).toBe(true);

      const retrieved = await getProject("test-store");
      expect(retrieved).toBeNull();
   });

   it("handles GET and POST HTTP routes correctly", async () => {
      const getRes = await GET();
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as { projects: unknown[] };
      expect(Array.isArray(getBody.projects)).toBe(true);

      const postRes = await POST(
         new Request("http://localhost/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "API Created Project" }),
         }),
      );
      expect(postRes.status).toBe(201);
      const postBody = (await postRes.json()) as {
         project: { name: string; id: string };
      };
      expect(postBody.project.name).toBe("API Created Project");
   });
});
