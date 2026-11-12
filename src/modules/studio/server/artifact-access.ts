/**
 * [29] DET Studio — allowlisted, contained local artifact path access.
 *
 * Server-only. Every filesystem read of DET run output in Studio goes through
 * the helpers in this module: closed extension allowlists, a hard size cap,
 * rejection of absolute/parent-traversing path strings, and canonical realpath
 * containment against a trusted directory. No module outside `src/server` may
 * touch `node:fs`; nothing here may invoke the det CLI, child processes, the
 * Figma API, or the network, and nothing here writes.
 */
import "server-only";

import path from "node:path";

/**
 * One run = one immediate subdirectory of the configured DET output root,
 * named by its run id. `..` and `/`/`\` are structurally impossible with this
 * pattern (first char is alphanumeric; no separators allowed).
 */
export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Extensions the reader will parse as DET JSON payloads. */
export const ARTIFACT_PARSE_EXTENSIONS = [".json"] as const;

/**
 * Extensions the reader may hand out as artifact downloads. Deliberately
 * narrow: text/schema-ish outputs the det CLI actually writes. [70] adds the
 * CMS installer bundle artifacts: `.php` (the generated operator installer —
 * served as inert octet-stream bytes, never executed here) and `.md` (the
 * operator README).
 */
export const DOWNLOAD_EXTENSIONS = [
   ".json",
   ".xml",
   ".css",
   ".phtml",
   ".svg",
   ".txt",
   ".html",
   ".php",
   ".md",
] as const;

/** Content-Type served per allowlisted extension. */
export const DOWNLOAD_CONTENT_TYPES: Readonly<
   Record<(typeof DOWNLOAD_EXTENSIONS)[number], string>
> = {
   ".json": "application/json",
   ".xml": "application/xml",
   ".css": "text/css; charset=utf-8",
   ".phtml": "text/plain; charset=utf-8",
   ".svg": "image/svg+xml",
   ".txt": "text/plain; charset=utf-8",
   ".html": "text/html; charset=utf-8",
   ".php": "application/octet-stream",
   ".md": "text/markdown; charset=utf-8",
};

/** Hard cap for any single artifact file the reader parses or serves. */
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

export function isDownloadableExtension(fileName: string): boolean {
   const lower = fileName.toLowerCase();
   return (DOWNLOAD_EXTENSIONS as readonly string[]).some((ext) =>
      lower.endsWith(ext),
   );
}

export function downloadContentType(fileName: string): string | undefined {
   const lower = fileName.toLowerCase();
   const ext = (DOWNLOAD_EXTENSIONS as readonly string[]).find((candidate) =>
      lower.endsWith(candidate),
   );
   return ext === undefined
      ? undefined
      : DOWNLOAD_CONTENT_TYPES[ext as (typeof DOWNLOAD_EXTENSIONS)[number]];
}

/**
 * Manifest `file` values are relative, forward-slash separated paths under the
 * run directory. Refuse absolute paths, Windows separators, empty/dot segments
 * and any parent traversal — before any filesystem access happens.
 */
export function isSafeRelativeArtifactPath(file: string): boolean {
   if (typeof file !== "string" || file.length === 0) return false;
   if (file.startsWith("/") || file.includes("\\")) return false;
   if (path.isAbsolute(file)) return false;
   const segments = file.split("/");
   return segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
   );
}

/** A realpath is contained when it equals the trusted dir or lives below it. */
export function isInsideDir(
   candidateRealPath: string,
   dirRealPath: string,
): boolean {
   return (
      candidateRealPath === dirRealPath ||
      candidateRealPath.startsWith(dirRealPath + path.sep)
   );
}

/** Basename, stripped to a conservative charset, for Content-Disposition. */
export function safeAttachmentFileName(fileName: string): string {
   const base = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "_");
   return base.length > 0 ? base : "artifact";
}
