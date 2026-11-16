import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export interface ZipFileInput {
   name: string;
   content: Buffer;
}

/**
 * Fail-closed format caps ([74] hardening). The hand-rolled PKZIP writer emits 32-bit
 * size/offset fields only (no Zip64), so a bundle beyond these caps would silently CORRUPT
 * (wrapped UInt32 sizes/offsets) — exceeding a cap is a thrown error before any byte is
 * written, never a truncated or wrapped archive.
 * - ZIP_MAX_ENTRIES: the central-directory entry count is a UInt16 field; 2000 is far above
 *   any real CMS install bundle (installer + 4 companions + scoped media) while staying
 *   inside UInt16 with headroom.
 * - ZIP_MAX_ENTRY_BYTES / ZIP_MAX_TOTAL_BYTES: uncompressed sizes stay inside UInt32, and
 *   the cumulative central-directory offset stays inside UInt32 too (DEFLATE output is never
 *   larger than the input by more than a fixed few bytes, so total uncompressed bounds total
 *   compressed).
 */
export const ZIP_MAX_ENTRIES = 2000;
export const ZIP_MAX_ENTRY_BYTES = 512 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/** The cap set applied by createZipBuffer (overridable per call for focused tests). */
export interface ZipLimits {
   maxEntries: number;
   maxEntryBytes: number;
   maxTotalBytes: number;
}

export const ZIP_DEFAULT_LIMITS: ZipLimits = {
   maxEntries: ZIP_MAX_ENTRIES,
   maxEntryBytes: ZIP_MAX_ENTRY_BYTES,
   maxTotalBytes: ZIP_MAX_TOTAL_BYTES,
};

/** UTF-8 filename flag (general-purpose bit 11, APPNOTE 4.4.4). */
const GENERAL_FLAG_UTF8 = 0x0800;

/** The duplicate-name error: duplicate members are undefined behavior across extractors. */
class ZipEntryNameError extends Error {}

/**
 * Validates and canonicalizes ONE zip entry name ([74] hardening).
 *
 * The bundle is assembled from Figma-derived project data and operator media trees, so an
 * entry name is UNTRUSTED INPUT: anything that could escape the extraction directory, or
 * corrupt interoperability, is refused with a thrown error — never rewritten silently.
 * - Backslashes are normalized to forward slashes FIRST (Windows-style separators map to the
 *   canonical zip form), then the canonical name is validated — so `a\..\..\x` becomes the
 *   refused `a/../../x` instead of smuggling a traversal through the normalization.
 * - Refused: empty names, absolute paths (leading `/`), Windows drive prefixes (`C:`), any
 *   `.` or `..` segment, empty segments (double slashes), trailing slashes (no directory
 *   entries are written), over-long names, and ANY control character (NUL, newline, tab,
 *   C0/C1 controls, DEL — a filename is not free text; the [65] preserve-newlines rule
 *   applies to CONTENT text, which this writer passes through byte-exactly and never
 *   sanitizes).
 * - The returned name is exactly what is written to both headers (local == central).
 */
function resolveZipEntryName(name: string): string {
   if (typeof name !== "string" || name.length === 0) {
      throw new ZipEntryNameError(
         `zip entry name must be a non-empty string, got: ${JSON.stringify(name)}`,
      );
   }
   if (name.length > 1024) {
      throw new ZipEntryNameError(
         `zip entry name exceeds 1024 bytes: ${name.slice(0, 64)}…`,
      );
   }
   const norm = name.replace(/\\/g, "/");
   if (/^[A-Za-z]:/.test(norm)) {
      throw new ZipEntryNameError(
         `zip entry name refused (Windows drive prefix): ${JSON.stringify(name)}`,
      );
   }
   if (norm.startsWith("/")) {
      throw new ZipEntryNameError(
         `zip entry name refused (absolute path): ${JSON.stringify(name)}`,
      );
   }
   for (const ch of norm) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
         throw new ZipEntryNameError(
            `zip entry name refused (control character U+${code
               .toString(16)
               .toUpperCase()
               .padStart(4, "0")}): ${JSON.stringify(name)}`,
         );
      }
   }
   const segments = norm.split("/");
   for (const segment of segments) {
      if (segment.length === 0) {
         throw new ZipEntryNameError(
            `zip entry name refused (empty path segment): ${JSON.stringify(name)}`,
         );
      }
      if (segment === "." || segment === "..") {
         throw new ZipEntryNameError(
            `zip entry name refused (path traversal segment "${segment}"): ${JSON.stringify(name)}`,
         );
      }
   }
   return norm;
}

/**
 * Creates a standard PKZIP zip buffer in pure Node.js (no external dependencies).
 * Uses standard DEFLATE compression via zlib.deflateRawSync and zlib.crc32.
 *
 * [74] hardening (format + safety, behavior-preserving for already-valid inputs):
 * - Every entry name passes resolveZipEntryName: path traversal, absolute paths, drive
 *   prefixes and control characters are REFUSED (throw) — never rewritten into the archive.
 * - Duplicate entry names (after canonicalization) are refused: duplicate members are
 *   undefined behavior across extractors.
 * - The UTF-8 filename flag (general-purpose bit 11) is set on BOTH the local and the
 *   central header exactly when the name is not pure ASCII, so non-ASCII (e.g. Vietnamese)
 *   names decode as UTF-8 instead of CP437.
 * - Entry count / entry size / total size caps (see the constants above) fail closed before
 *   any byte is emitted (no Zip64 is written; oversize would corrupt the UInt32 fields).
 * - Determinism: no timestamps (mod time/date are zero), insertion order preserved, and
 *   zlib DEFLATE is deterministic for fixed input — identical inputs yield identical bytes.
 * - Sizes are known before headers are written, so NO data descriptor is used (general
 *   purpose bit 3 stays 0 and crc/sizes live in the local header itself).
 * - CRC-32 (zlib.crc32) is written identically into the local header and the central
 *   directory entry; both headers carry the same name bytes, sizes and flags (local ==
 *   central consistency is asserted by the __tests__ parser).
 */
export function createZipBuffer(
   files: ZipFileInput[],
   limits: ZipLimits = ZIP_DEFAULT_LIMITS,
): Buffer {
   if (!Array.isArray(files)) {
      throw new TypeError("createZipBuffer expects an array of ZipFileInput");
   }
   if (files.length > limits.maxEntries) {
      throw new Error(
         `zip bundle refused: ${files.length} entries exceeds the ${limits.maxEntries}-entry cap (no Zip64 is written; oversize output would corrupt the archive)`,
      );
   }

   const localHeaders: Buffer[] = [];
   const centralHeaders: Buffer[] = [];
   const seenNames = new Set<string>();
   let offset = 0;
   let totalUncompressed = 0;

   for (const file of files) {
      const normName = resolveZipEntryName(file.name);
      if (seenNames.has(normName)) {
         throw new ZipEntryNameError(
            `zip bundle refused: duplicate entry name "${normName}"`,
         );
      }
      seenNames.add(normName);

      const nameBuf = Buffer.from(normName, "utf8");
      const dataBuf = file.content;
      if (!Buffer.isBuffer(dataBuf)) {
         throw new TypeError(
            `zip entry "${normName}" content must be a Buffer`,
         );
      }
      if (dataBuf.length > limits.maxEntryBytes) {
         throw new Error(
            `zip bundle refused: entry "${normName}" is ${dataBuf.length} bytes, above the ${limits.maxEntryBytes}-byte per-entry cap`,
         );
      }
      totalUncompressed += dataBuf.length;
      if (totalUncompressed > limits.maxTotalBytes) {
         throw new Error(
            `zip bundle refused: total uncompressed size exceeds the ${limits.maxTotalBytes}-byte cap at entry "${normName}"`,
         );
      }

      const compressed = zlib.deflateRawSync(dataBuf);
      const crc = zlib.crc32(dataBuf) >>> 0;
      const flags = /^[\x20-\x7e]*$/.test(normName) ? 0 : GENERAL_FLAG_UTF8;

      // Local file header (30 bytes + filename)
      const lh = Buffer.alloc(30 + nameBuf.length);
      lh.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
      lh.writeUInt16LE(20, 4); // version needed (2.0)
      lh.writeUInt16LE(flags, 6); // general flags (bit 11 = UTF-8 name when non-ASCII)
      lh.writeUInt16LE(8, 8); // compression method 8 = deflate
      lh.writeUInt16LE(0, 10); // file mod time
      lh.writeUInt16LE(0, 12); // file mod date
      lh.writeUInt32LE(crc, 14); // crc-32
      lh.writeUInt32LE(compressed.length, 18); // compressed size
      lh.writeUInt32LE(dataBuf.length, 22); // uncompressed size
      lh.writeUInt16LE(nameBuf.length, 26); // filename length
      lh.writeUInt16LE(0, 28); // extra field length
      nameBuf.copy(lh, 30);

      localHeaders.push(lh, compressed);

      // Central directory header (46 bytes + filename)
      const ch = Buffer.alloc(46 + nameBuf.length);
      ch.writeUInt32LE(0x02014b50, 0); // signature PK\x01\x02
      // version made by: host Unix (3), spec 2.0 — some extractors (Info-ZIP 6.0) IGNORE
      // the UTF-8 name flag when the host is FAT/MS-DOS and would CP437-mangle non-ASCII
      // names; declaring a Unix origin keeps the UTF-8 contract honored everywhere.
      ch.writeUInt16LE((3 << 8) | 20, 4);
      ch.writeUInt16LE(20, 6); // version needed (2.0)
      ch.writeUInt16LE(flags, 8); // general flags — MUST equal the local header's
      ch.writeUInt16LE(8, 10); // compression method 8 = deflate
      ch.writeUInt16LE(0, 12); // file mod time
      ch.writeUInt16LE(0, 14); // file mod date
      ch.writeUInt32LE(crc, 16); // crc-32
      ch.writeUInt32LE(compressed.length, 20); // compressed size
      ch.writeUInt32LE(dataBuf.length, 24); // uncompressed size
      ch.writeUInt16LE(nameBuf.length, 28); // filename length
      ch.writeUInt16LE(0, 30); // extra field length
      ch.writeUInt16LE(0, 32); // comment length
      ch.writeUInt16LE(0, 34); // disk number start
      ch.writeUInt16LE(0, 36); // internal file attributes
      // external attributes: Unix mode 100644 (-rw-r--r--) in the high 16 bits — a readable
      // regular file after extraction, never a mode-000 or executable surprise.
      ch.writeUInt32LE((0o100644 << 16) >>> 0, 38);
      ch.writeUInt32LE(offset, 42); // relative offset of local header
      nameBuf.copy(ch, 46);

      centralHeaders.push(ch);
      offset += lh.length + compressed.length;
   }

   const centralDirOffset = offset;
   const centralDirBuf = Buffer.concat(centralHeaders);
   const centralDirSize = centralDirBuf.length;

   // End of central directory record (22 bytes)
   const eocd = Buffer.alloc(22);
   eocd.writeUInt32LE(0x06054b50, 0); // signature PK\x05\x06
   eocd.writeUInt16LE(0, 4); // number of this disk
   eocd.writeUInt16LE(0, 6); // number of disk with start of central directory
   eocd.writeUInt16LE(files.length, 8); // total number of entries in central dir on this disk
   eocd.writeUInt16LE(files.length, 10); // total number of entries in central dir
   eocd.writeUInt32LE(centralDirSize, 12); // size of central directory
   eocd.writeUInt32LE(centralDirOffset, 16); // offset of start of central directory
   eocd.writeUInt16LE(0, 20); // zipfile comment length

   return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

/**
 * Scans a run directory and packages all Magento CMS installation bundle files into a ZIP buffer.
 * Includes:
 * - install-homepage.php
 * - pagebuilder-content.html
 * - build-manifest.json
 * - mapping-and-gaps.json
 * - README.md
 * - all assets in media/ (recursive)
 *
 * [74] notes: entry names derive from the on-disk tree via path.relative, and every name is
 * still re-validated by createZipBuffer's traversal/control-char gate before it can reach the
 * archive. Symbolic links inside the run directory are NOT followed and NOT packed (a symlink
 * dirent is neither isFile() nor isDirectory(), so it is skipped — a symlink can never smuggle
 * out-of-tree content into the bundle). Missing optional files are simply absent; the function
 * refuses a run directory with nothing packable.
 */
export function packRunBundleZip(runDir: string): Buffer {
   if (!fs.existsSync(runDir)) {
      throw new Error(`Run directory not found: ${runDir}`);
   }

   const filesToPack: ZipFileInput[] = [];

   // Root files to include
   const rootFiles = [
      "install-homepage.php",
      "pagebuilder-content.html",
      "build-manifest.json",
      "mapping-and-gaps.json",
      "README.md",
   ];

   for (const fileName of rootFiles) {
      const filePath = path.join(runDir, fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
         filesToPack.push({
            name: fileName,
            content: fs.readFileSync(filePath),
         });
      }
   }

   // Recursive media directory
   const mediaDir = path.join(runDir, "media");
   if (fs.existsSync(mediaDir) && fs.statSync(mediaDir).isDirectory()) {
      const collectMedia = (dir: string) => {
         const entries = fs.readdirSync(dir, { withFileTypes: true });
         for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isSymbolicLink()) {
               // Never follow or pack symlinks: the bundle carries regular files only.
               continue;
            }
            if (entry.isDirectory()) {
               collectMedia(fullPath);
            } else if (entry.isFile()) {
               const relName = path.relative(runDir, fullPath);
               filesToPack.push({
                  name: relName,
                  content: fs.readFileSync(fullPath),
               });
            }
         }
      };
      collectMedia(mediaDir);
   }

   if (filesToPack.length === 0) {
      throw new Error(`No bundle files found in run directory: ${runDir}`);
   }

   return createZipBuffer(filesToPack);
}
