import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFigmaInput } from "../conversions/figma-input";
import type {
   AddFigmaPageInput,
   CreateProjectInput,
   FigmaPage,
   ProjectRecord,
} from "./types";

const PROJECTS_FILE = "projects-catalog.json";

function getStoreFilePath(): string {
   const dataDir = process.env.STUDIO_DATA_DIR || "./data";
   return path.resolve(process.cwd(), dataDir, PROJECTS_FILE);
}

const DEFAULT_PROJECTS: ProjectRecord[] = [
   {
      id: "slaunchpad-fashion",
      name: "Slaunchpad Fashion",
      platformId: "magento-page-builder",
      description: "Dự án mẫu Slaunchpad — Magento 2.4.7 + Hyvä UI",
      createdAt: "2026-11-13T10:00:00.000Z",
      updatedAt: "2026-11-13T10:00:00.000Z",
      pages: [
         {
            id: "page-home",
            name: "Trang chủ (Homepage — Hero & Craftsmanship)",
            figmaUrl:
               "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/PL?node-id=245-2",
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:2",
            notes: "Hero banner + Two-column Craftsmanship",
            createdAt: "2026-11-13T10:00:00.000Z",
            updatedAt: "2026-11-13T10:00:00.000Z",
         },
         {
            id: "page-home-extended",
            name: "Trang chủ mở rộng (Homepage — Extended Sections)",
            figmaUrl:
               "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/PL?node-id=245-16",
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:16",
            notes: "Các section bổ sung",
            createdAt: "2026-11-13T10:00:00.000Z",
            updatedAt: "2026-11-13T10:00:00.000Z",
         },
         {
            id: "page-plp",
            name: "Danh mục sản phẩm (PLP)",
            figmaUrl:
               "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/PL?node-id=301-4",
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "301:4",
            notes: "Product Listing Page (Hyvä PHTML)",
            createdAt: "2026-11-13T10:00:00.000Z",
            updatedAt: "2026-11-13T10:00:00.000Z",
         },
      ],
   },
];

async function loadProjects(): Promise<ProjectRecord[]> {
   const filePath = getStoreFilePath();
   try {
      const data = await readFile(filePath, "utf-8");
      return JSON.parse(data) as ProjectRecord[];
   } catch {
      // File doesn't exist yet: initialize with seed defaults
      await saveProjects(DEFAULT_PROJECTS);
      return DEFAULT_PROJECTS;
   }
}

async function saveProjects(projects: ProjectRecord[]): Promise<void> {
   const filePath = getStoreFilePath();
   await mkdir(path.dirname(filePath), { recursive: true });
   await writeFile(filePath, JSON.stringify(projects, null, 2), "utf-8");
}

function generateSlug(text: string): string {
   return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
}

export async function listProjects(): Promise<ProjectRecord[]> {
   return loadProjects();
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
   const projects = await loadProjects();
   return projects.find((p) => p.id === id) ?? null;
}

export async function createProject(
   input: CreateProjectInput,
): Promise<ProjectRecord> {
   const projects = await loadProjects();
   const now = new Date().toISOString();

   const baseId = input.id?.trim() || generateSlug(input.name) || "project";
   let id = baseId;
   let counter = 1;
   while (projects.some((p) => p.id === id)) {
      id = `${baseId}-${counter++}`;
   }

   const newProject: ProjectRecord = {
      id,
      name: input.name.trim(),
      platformId: input.platformId?.trim() || "magento-page-builder",
      description: input.description?.trim() || "",
      createdAt: now,
      updatedAt: now,
      pages: [],
   };

   projects.push(newProject);
   await saveProjects(projects);
   return newProject;
}

export async function deleteProject(id: string): Promise<boolean> {
   const projects = await loadProjects();
   const index = projects.findIndex((p) => p.id === id);
   if (index === -1) return false;

   projects.splice(index, 1);
   await saveProjects(projects);
   return true;
}

export async function addFigmaPage(
   projectId: string,
   input: AddFigmaPageInput,
): Promise<FigmaPage> {
   const projects = await loadProjects();
   const project = projects.find((p) => p.id === projectId);
   if (!project) {
      throw new Error(`Project ${projectId} not found`);
   }

   const parsed = parseFigmaInput(input.figmaUrl);
   if (!parsed.ok) {
      throw new Error(parsed.message);
   }

   const now = new Date().toISOString();
   const pageId = `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

   const newPage: FigmaPage = {
      id: pageId,
      name: input.name.trim() || `Page ${parsed.nodeId}`,
      figmaUrl: input.figmaUrl.trim(),
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      notes: input.notes?.trim() || "",
      createdAt: now,
      updatedAt: now,
   };

   project.pages.push(newPage);
   project.updatedAt = now;
   await saveProjects(projects);
   return newPage;
}

export async function deleteFigmaPage(
   projectId: string,
   pageId: string,
): Promise<boolean> {
   const projects = await loadProjects();
   const project = projects.find((p) => p.id === projectId);
   if (!project) return false;

   const pageIndex = project.pages.findIndex((p) => p.id === pageId);
   if (pageIndex === -1) return false;

   project.pages.splice(pageIndex, 1);
   project.updatedAt = new Date().toISOString();
   await saveProjects(projects);
   return true;
}
