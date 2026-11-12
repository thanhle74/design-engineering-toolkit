/**
 * [40] DET Studio — the single contained-read chokepoint for DET output files.
 *
 * Extracted from DirectoryDetRunReader ([29]) so the [40] build-bundle reader
 * uses the exact same containment rules instead of a parallel implementation:
 * safe relative path, 8 MiB size cap, realpath containment inside the trusted
 * root. Returns null when the path does not exist — the caller decides whether
 * that is an error. Server-only, read-only; never invokes the det CLI, child
 * processes, the Figma API or the network, and never writes.
 */
import "server-only";

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { DetRunReaderError, type DetRunReaderErrorCode } from "@/src/modules/studio/shared/contracts";

import {
  MAX_ARTIFACT_BYTES,
  isDownloadableExtension,
  isInsideDir,
  isSafeRelativeArtifactPath,
} from "./artifact-access";
import { parseJsonRecord, type JsonRecord } from "./det-payload-parsing";

/**
 * Read a fixed-name JSON artifact from inside a run dir. Returns null when
 * absent; throws invalid-payload when present but unparseable; enforces
 * realpath containment + the size cap for every candidate path.
 */
export async function readJsonRecordIfPresent(
  rootDir: string,
  fileName: string,
  oversizeCode: DetRunReaderErrorCode
): Promise<JsonRecord | null> {
  const bytes = await readContainedBytes(rootDir, fileName, oversizeCode);
  if (bytes === null) return null;
  return parseJsonRecord(bytes, fileName);
}

/**
 * The single contained-read chokepoint: safe relative path, size cap,
 * realpath containment inside `rootDir`. Returns null when the path does not
 * exist (the caller decides whether that is an error).
 */
export async function readContainedBytes(
  rootDir: string,
  relativePath: string,
  oversizeCode: DetRunReaderErrorCode
): Promise<Uint8Array | null> {
  if (!isSafeRelativeArtifactPath(relativePath)) {
    throw new DetRunReaderError(
      "path-refused",
      "The requested path was refused: it is not a safe relative path inside the run directory."
    );
  }
  const joined = path.join(rootDir, relativePath);
  const info = await stat(joined).catch(() => null);
  if (info === null || !info.isFile()) return null;
  if (info.size > MAX_ARTIFACT_BYTES) {
    throw new DetRunReaderError(oversizeCode, "The requested file exceeds the 8 MiB artifact size cap.");
  }
  let resolved: string | null = null;
  try {
    resolved = await realpath(joined);
  } catch {
    return null;
  }
  if (!isInsideDir(resolved, rootDir)) {
    throw new DetRunReaderError(
      "path-refused",
      "The requested path was refused: it resolves outside the run directory."
    );
  }
  const buffer = await readFile(joined);
  if (buffer.byteLength > MAX_ARTIFACT_BYTES) {
    throw new DetRunReaderError(oversizeCode, "The requested file exceeds the 8 MiB artifact size cap.");
  }
  return new Uint8Array(buffer);
}

/** Contained stat: is this manifest-declared file servable (safe, allowlisted, capped)? */
export async function canServeContainedFile(rootDir: string, relativePath: string): Promise<boolean> {
  if (!isSafeRelativeArtifactPath(relativePath)) return false;
  if (!isDownloadableExtension(relativePath)) return false;
  try {
    const joined = path.join(rootDir, relativePath);
    const info = await stat(joined);
    if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) return false;
    const resolved = await realpath(joined);
    return isInsideDir(resolved, rootDir);
  } catch {
    return false;
  }
}
