import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFigmaInput } from "../conversions/figma-input";
import type {
   AddFigmaPageInput,
   CreateProjectInput,
   FigmaPage,
   ProjectRecord,
} from "./types";

const PROJECTS_FILE = "projects-catalog.json";

/**
 * Untrusted-input bounds for the server boundary ([74] hardening). The route
 * layer maps rejections to 400 `{error:{code:"invalid-input",…}}`; the store
 * never persists anything outside these bounds.
 */
const MAX_NAME_LENGTH = 200;
const MAX_ID_LENGTH = 100;
const MAX_TEXT_LENGTH = 2000;
/** Control characters never belong in operator-authored names, ids or notes. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** Project ids are slugs (generateSlug output or an explicitly provided id). */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function getStoreFilePath(): string {
   const dataDir = process.env.STUDIO_DATA_DIR || "./data";
   return path.resolve(process.cwd(), dataDir, PROJECTS_FILE);
}

/**
 * Typed store failure — every rejection the store can produce carries a
 * stable code so the HTTP seam can map it without string matching.
 */
export type ProjectStoreErrorCode =
   /** Stored file exists but cannot be parsed / has the wrong shape. */
   | "store-corrupt"
   /** Non-ENOENT filesystem failure on read or write. */
   | "store-io"
   /** Untrusted input failed validation (name, id, notes, Figma URL). */
   | "invalid-input";

export class ProjectStoreError extends Error {
   constructor(
      readonly code: ProjectStoreErrorCode,
      message: string,
   ) {
      super(message);
      this.name = "ProjectStoreError";
   }
}

/**
 * DELIBERATE DEMO SEED — client-specific (Slaunchpad), NOT generic production
 * behavior. This one project ships so the Projects UI has something truthful
 * to render on a fresh checkout ([63] single-application layout). It is only
 * ever written when the store file does not exist yet (ENOENT); a corrupt or
 * unreadable file NEVER falls back to it — see `loadProjectsLocked`. Existing
 * `data/projects-catalog.json` data is never migrated or rewritten.
 */
const DEMO_SEED_PROJECTS: ProjectRecord[] = [
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

/**
 * In-process serialization of every store operation ([74] hardening). The
 * previous implementation ran un-serialized read-modify-write cycles, so two
 * concurrent mutations could each read the same snapshot and the second write
 * clobbered the first. Every public operation below runs through this one
 * promise chain — simple, predictable, no dependencies.
 */
let storeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T>): Promise<T> {
   const run = storeQueue.then(operation, operation);
   // The chain itself never rejects; failures are surfaced only to the caller.
   storeQueue = run.then(
      () => undefined,
      () => undefined,
   );
   return run;
}

function isProjectRecordShape(value: unknown): value is ProjectRecord {
   if (typeof value !== "object" || value === null) return false;
   const record = value as Record<string, unknown>;
   return (
      typeof record.id === "string" &&
      typeof record.name === "string" &&
      typeof record.platformId === "string" &&
      Array.isArray(record.pages)
   );
}

function isProjectListShape(value: unknown): value is ProjectRecord[] {
   return Array.isArray(value) && value.every(isProjectRecordShape);
}

/**
 * Read the store WITHOUT the lock (caller must already hold it). Returns
 * `null` only for a missing file (ENOENT → the caller decides to seed);
 * anything else fails CLOSED with a typed error:
 *  - parse failure / wrong shape → `store-corrupt` (the file on disk is left
 *    untouched — never silently overwritten with defaults);
 *  - other read errors (permissions, is-a-directory, …) → `store-io`.
 */
async function readStoreUnlocked(): Promise<ProjectRecord[] | null> {
   const filePath = getStoreFilePath();
   let raw: string;
   try {
      raw = await readFile(filePath, "utf-8");
   } catch (error) {
      if (
         typeof error === "object" &&
         error !== null &&
         "code" in error &&
         (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
         return null;
      }
      throw new ProjectStoreError(
         "store-io",
         `Không đọc được projects-catalog.json (${(error as NodeJS.ErrnoException).code ?? "unknown"}). Store fail-closed — không tự ghi đè dữ liệu hiện có.`,
      );
   }

   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch {
      throw new ProjectStoreError(
         "store-corrupt",
         "projects-catalog.json không phải JSON hợp lệ. Store fail-closed — sửa hoặc xóa tệp thủ công; dữ liệu trên đĩa không bị ghi đè.",
      );
   }
   if (!isProjectListShape(parsed)) {
      throw new ProjectStoreError(
         "store-corrupt",
         "projects-catalog.json có cấu trúc không đúng (cần mảng ProjectRecord). Store fail-closed — dữ liệu trên đĩa không bị ghi đè.",
      );
   }
   return parsed;
}

/**
 * Atomic write ([74] hardening): serialize to a temp file in the SAME
 * directory (rename is atomic within one filesystem) and rename onto the
 * target, so a crash mid-write can never leave a torn `projects-catalog.json`
 * behind. The temp file is cleaned up on failure. Caller must hold the lock.
 */
async function writeStoreUnlocked(projects: ProjectRecord[]): Promise<void> {
   const filePath = getStoreFilePath();
   const tempPath = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
   try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(tempPath, JSON.stringify(projects, null, 2), "utf-8");
      await rename(tempPath, filePath);
   } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw new ProjectStoreError(
         "store-io",
         `Không ghi được projects-catalog.json (${(error as NodeJS.ErrnoException).code ?? (error as Error).message}). Store fail-closed.`,
      );
   }
}

async function loadProjectsLocked(): Promise<ProjectRecord[]> {
   const existing = await readStoreUnlocked();
   if (existing !== null) return existing;
   // ENOENT is the ONLY path that initializes the deliberate demo seed.
   await writeStoreUnlocked(DEMO_SEED_PROJECTS);
   return DEMO_SEED_PROJECTS;
}

function generateSlug(text: string): string {
   return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
}

function rejectInvalid(message: string): never {
   throw new ProjectStoreError("invalid-input", message);
}

/** Trim + bound a REQUIRED operator-authored name. */
function validateName(raw: unknown, field: string): string {
   if (typeof raw !== "string") {
      rejectInvalid(`${field} là bắt buộc và phải là chuỗi.`);
   }
   const name = raw.trim();
   if (name === "") {
      rejectInvalid(`${field} là bắt buộc và không được để trống.`);
   }
   if (name.length > MAX_NAME_LENGTH) {
      rejectInvalid(
         `${field} quá dài (tối đa ${MAX_NAME_LENGTH} ký tự).`,
      );
   }
   if (CONTROL_CHARS.test(name)) {
      rejectInvalid(`${field} không được chứa ký tự điều khiển.`);
   }
   return name;
}

/** Trim + bound an OPTIONAL free-text field; empty → undefined. */
function validateOptionalText(raw: unknown, field: string): string | undefined {
   if (raw === undefined || raw === null) return undefined;
   if (typeof raw !== "string") {
      rejectInvalid(`${field} phải là chuỗi.`);
   }
   const text = raw.trim();
   if (text === "") return undefined;
   if (text.length > MAX_TEXT_LENGTH) {
      rejectInvalid(`${field} quá dài (tối đa ${MAX_TEXT_LENGTH} ký tự).`);
   }
   if (CONTROL_CHARS.test(text)) {
      rejectInvalid(`${field} không được chứa ký tự điều khiển.`);
   }
   return text;
}

/**
 * Validate a route/store entity id (projectId, pageId). Malformed ids
 * (empty, oversized, control characters, non-slug characters) are rejected
 * as `invalid-input`; a VALID id that simply matches nothing still behaves
 * exactly as before (null / false → the route answers 404).
 */
function validateEntityId(raw: string, field: string): string {
   const id = typeof raw === "string" ? raw.trim() : "";
   if (id === "" || id.length > MAX_ID_LENGTH) {
      rejectInvalid(`${field} không hợp lệ.`);
   }
   if (CONTROL_CHARS.test(id) || !ID_PATTERN.test(id)) {
      rejectInvalid(`${field} không hợp lệ.`);
   }
   return id;
}

export async function listProjects(): Promise<ProjectRecord[]> {
   return withLock(loadProjectsLocked);
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
   const projectId = validateEntityId(id, "Project id");
   return withLock(async () => {
      const projects = await loadProjectsLocked();
      return projects.find((p) => p.id === projectId) ?? null;
   });
}

export async function createProject(
   input: CreateProjectInput,
): Promise<ProjectRecord> {
   const name = validateName(input.name, "Tên dự án");
   const explicitId = validateOptionalText(input.id, "Project id");
   const platformId =
      validateOptionalText(input.platformId, "Platform id") ??
      "magento-page-builder";
   const description =
      validateOptionalText(input.description, "Mô tả") ?? "";

   if (explicitId !== undefined && !ID_PATTERN.test(explicitId)) {
      rejectInvalid(
         "Project id chỉ được chứa chữ cái, số, dấu chấm, gạch ngang và gạch dưới.",
      );
   }

   return withLock(async () => {
      const projects = await loadProjectsLocked();
      const now = new Date().toISOString();

      // Generated slugs obey the same id bounds as validated explicit ids;
      // headroom is reserved for the collision suffix (`-<n>`).
      const slugBase =
         generateSlug(name).slice(0, MAX_ID_LENGTH - 4).replace(/^-+|-+$/g, "") ||
         "project";
      const baseId = explicitId || slugBase;
      let id = baseId;
      let counter = 1;
      while (projects.some((p) => p.id === id)) {
         id = `${baseId}-${counter++}`;
      }

      const newProject: ProjectRecord = {
         id,
         name,
         platformId,
         description,
         createdAt: now,
         updatedAt: now,
         pages: [],
      };

      projects.push(newProject);
      await writeStoreUnlocked(projects);
      return newProject;
   });
}

export async function deleteProject(id: string): Promise<boolean> {
   const projectId = validateEntityId(id, "Project id");
   return withLock(async () => {
      const projects = await loadProjectsLocked();
      const index = projects.findIndex((p) => p.id === projectId);
      if (index === -1) return false;

      projects.splice(index, 1);
      await writeStoreUnlocked(projects);
      return true;
   });
}

export async function addFigmaPage(
   projectId: string,
   input: AddFigmaPageInput,
): Promise<FigmaPage> {
   const validatedProjectId = validateEntityId(projectId, "Project id");
   const pageName = validateOptionalText(input.name, "Tên trang");
   const notes = validateOptionalText(input.notes, "Ghi chú");
   const figmaUrl =
      typeof input.figmaUrl === "string"
         ? input.figmaUrl.trim()
         : "";

   return withLock(async () => {
      const projects = await loadProjectsLocked();
      const project = projects.find((p) => p.id === validatedProjectId);
      if (!project) {
         throw new ProjectStoreError(
            "invalid-input",
            `Project ${validatedProjectId} not found`,
         );
      }

      const parsed = parseFigmaInput(figmaUrl);
      if (!parsed.ok) {
         rejectInvalid(parsed.message);
      }

      const now = new Date().toISOString();
      const pageId = `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const newPage: FigmaPage = {
         id: pageId,
         name: pageName || `Page ${parsed.nodeId}`,
         figmaUrl,
         fileKey: parsed.fileKey,
         nodeId: parsed.nodeId,
         notes: notes || "",
         createdAt: now,
         updatedAt: now,
      };

      project.pages.push(newPage);
      project.updatedAt = now;
      await writeStoreUnlocked(projects);
      return newPage;
   });
}

export async function deleteFigmaPage(
   projectId: string,
   pageId: string,
): Promise<boolean> {
   const validatedProjectId = validateEntityId(projectId, "Project id");
   const validatedPageId = validateEntityId(pageId, "Page id");
   return withLock(async () => {
      const projects = await loadProjectsLocked();
      const project = projects.find((p) => p.id === validatedProjectId);
      if (!project) return false;

      const pageIndex = project.pages.findIndex(
         (p) => p.id === validatedPageId,
      );
      if (pageIndex === -1) return false;

      project.pages.splice(pageIndex, 1);
      project.updatedAt = new Date().toISOString();
      await writeStoreUnlocked(projects);
      return true;
   });
}

/**
 * Explicit, DELIBERATE reset path ([74] hardening): replaces the store with
 * the demo seed. Intentionally NOT wired to any HTTP route — an operator (or
 * a future explicit UI affordance) must call this knowingly; the store never
 * auto-destructs on read errors.
 */
export async function resetToDemoSeed(): Promise<ProjectRecord[]> {
   return withLock(async () => {
      await writeStoreUnlocked(DEMO_SEED_PROJECTS);
      return DEMO_SEED_PROJECTS;
   });
}
