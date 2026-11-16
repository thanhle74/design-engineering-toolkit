// [74] zip-bundle hardening suite (moved from src/modules/studio/server/zip-bundle.test.ts
// into the module-owned __tests__ lane; the three pre-existing cases are preserved verbatim).
//
// Covers the hand-rolled PKZIP writer's correctness AND its security surface:
// - real `unzip -t` / `unzip -l` / extraction with byte-for-byte member comparison;
// - a pure-Node ZIP parser asserting local/central consistency (flags, CRC-32, sizes,
//   name bytes, local-header offsets) and EOCD entry-count/offset/size correctness;
// - entry-name gate: traversal, absolute paths, drive prefixes, control chars, duplicate
//   entries — all REFUSED (fail closed), never rewritten into the archive;
// - the UTF-8 filename flag (general-purpose bit 11) set exactly for non-ASCII names;
// - determinism: identical inputs -> identical bytes (sha256);
// - entry-count / per-entry / total-size caps refuse oversize bundles before any byte is
//   written (no Zip64 exists in this writer; oversize would silently corrupt UInt32 fields);
// - no data descriptors (bit 3 unset): sizes are known before the local header is written;
// - packRunBundleZip: media recursion, symlink skipping, missing/empty run directories.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
   createZipBuffer,
   packRunBundleZip,
   ZIP_DEFAULT_LIMITS,
   ZIP_MAX_ENTRIES,
   type ZipFileInput,
} from "../zip-bundle";

const sha256 = (buf: Buffer): string =>
   crypto.createHash("sha256").update(buf).digest("hex");

/** One central-directory entry, with its local header cross-checked. */
interface ParsedEntry {
   name: string;
   flags: number;
   method: number;
   crc: number;
   compressedSize: number;
   size: number;
   localHeaderOffset: number;
   localNameBytes: Buffer;
}

/**
 * Minimal pure-Node PKZIP reader used to prove the writer's own byte-level contract:
 * EOCD counts/offsets, central-directory walk, and EVERY entry's local header consistency
 * (same flags, CRC, sizes, name bytes). Throws (via expect) on any inconsistency.
 */
function parseZip(buf: Buffer): {
   entryCount: number;
   cdSize: number;
   cdOffset: number;
   entries: ParsedEntry[];
} {
   const eocdOffset = buf.length - 22;
   expect(buf.readUInt32LE(eocdOffset)).toBe(0x06054b50); // EOCD signature
   expect(buf.readUInt16LE(eocdOffset + 4)).toBe(0); // this disk
   expect(buf.readUInt16LE(eocdOffset + 6)).toBe(0); // disk with CD
   const entryCount = buf.readUInt16LE(eocdOffset + 8);
   expect(buf.readUInt16LE(eocdOffset + 10)).toBe(entryCount);
   const cdSize = buf.readUInt32LE(eocdOffset + 12);
   const cdOffset = buf.readUInt32LE(eocdOffset + 16);
   expect(buf.readUInt16LE(eocdOffset + 20)).toBe(0); // comment length

   const entries: ParsedEntry[] = [];
   let p = cdOffset;
   for (let i = 0; i < entryCount; i++) {
      expect(buf.readUInt32LE(p)).toBe(0x02014b50); // central signature
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const crc = buf.readUInt32LE(p + 16);
      const compressedSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localHeaderOffset = buf.readUInt32LE(p + 42);
      const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
      const name = Buffer.from(nameBytes).toString("utf8");

      // Local header must exist at the recorded offset and agree with the central entry.
      expect(buf.readUInt32LE(localHeaderOffset)).toBe(0x04034b50);
      expect(buf.readUInt16LE(localHeaderOffset + 6)).toBe(flags);
      expect(buf.readUInt16LE(localHeaderOffset + 8)).toBe(method);
      expect(buf.readUInt32LE(localHeaderOffset + 14)).toBe(crc);
      expect(buf.readUInt32LE(localHeaderOffset + 18)).toBe(compressedSize);
      expect(buf.readUInt32LE(localHeaderOffset + 22)).toBe(size);
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      expect(localNameLen).toBe(nameLen);
      expect(buf.readUInt16LE(localHeaderOffset + 28)).toBe(0); // no extra field
      const localNameBytes = Buffer.from(
         buf.subarray(
            localHeaderOffset + 30,
            localHeaderOffset + 30 + localNameLen,
         ),
      );
      expect(localNameBytes.equals(nameBytes)).toBe(true);

      entries.push({
         name,
         flags,
         method,
         crc,
         compressedSize,
         size,
         localHeaderOffset,
         localNameBytes,
      });
      p += 46 + nameLen + extraLen + commentLen;
   }
   expect(p).toBe(cdOffset + cdSize); // central directory is exactly the declared size
   return { entryCount, cdSize, cdOffset, entries };
}

/** Decompress one parsed entry's payload from the archive buffer. */
function entryData(buf: Buffer, entry: ParsedEntry): Buffer {
   const dataStart = entry.localHeaderOffset + 30 + entry.localNameBytes.length;
   return zlib.inflateRawSync(
      buf.subarray(dataStart, dataStart + entry.compressedSize),
   );
}

/** Extract the archive with the real Info-ZIP tool and byte-compare every member. */
function extractAndCompare(zipPath: string, expected: ZipFileInput[]): void {
   const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-extract-"));
   try {
      const integrity = execFileSync("unzip", ["-t", zipPath], {
         stdio: "pipe",
      }).toString();
      expect(integrity).toMatch(/No errors detected/i);
      execFileSync("unzip", ["-o", "-q", zipPath, "-d", outDir], {
         stdio: "pipe",
      });
      for (const file of expected) {
         const extracted = fs.readFileSync(path.join(outDir, file.name));
         expect(extracted.equals(file.content)).toBe(true);
      }
   } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
   }
}

function writeTempZip(zip: Buffer, tag: string): string {
   const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tag));
   const zipPath = path.join(tmpDir, "bundle.zip");
   fs.writeFileSync(zipPath, zip);
   return zipPath;
}

// ---------------------------------------------------------------------------------------------

describe("zip-bundle", () => {
   it("creates a valid zip buffer that can be read with unzip", () => {
      const files: ZipFileInput[] = [
         { name: "test.txt", content: Buffer.from("hello world", "utf8") },
         {
            name: "sub/sample.json",
            content: Buffer.from('{"status":"ok"}', "utf8"),
         },
      ];
      const zip = createZipBuffer(files);

      expect(zip.length).toBeGreaterThan(0);
      // PK signature
      expect(zip[0]).toBe(0x50);
      expect(zip[1]).toBe(0x4b);

      const zipPath = writeTempZip(zip, "zip-test-");

      // Verify with unzip CLI
      const listing = execFileSync("unzip", ["-l", zipPath]).toString();
      expect(listing).toContain("test.txt");
      expect(listing).toContain("sub/sample.json");

      const extracted = execFileSync("unzip", [
         "-p",
         zipPath,
         "test.txt",
      ]).toString();
      expect(extracted).toBe("hello world");

      // [74] full integrity + byte-exact extraction of every member
      extractAndCompare(zipPath, files);

      fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
   });

   it("packRunBundleZip packages bundle files and media directory", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-test-"));
      fs.writeFileSync(
         path.join(tmpDir, "install-homepage.php"),
         "<?php echo 'ok';",
      );
      fs.writeFileSync(
         path.join(tmpDir, "pagebuilder-content.html"),
         "<div>content</div>",
      );
      fs.mkdirSync(path.join(tmpDir, "media", "wysiwyg"), { recursive: true });
      fs.writeFileSync(
         path.join(tmpDir, "media", "wysiwyg", "banner.jpg"),
         "banner-image-data",
      );

      const zip = packRunBundleZip(tmpDir);
      expect(zip.length).toBeGreaterThan(0);

      const zipPath = path.join(tmpDir, "bundle.zip");
      fs.writeFileSync(zipPath, zip);

      const listing = execFileSync("unzip", ["-l", zipPath]).toString();
      expect(listing).toContain("install-homepage.php");
      expect(listing).toContain("pagebuilder-content.html");
      expect(listing).toContain("media/wysiwyg/banner.jpg");

      fs.rmSync(tmpDir, { recursive: true, force: true });
   });

   it("packRunBundleZip throws when run directory is missing", () => {
      expect(() => packRunBundleZip("/nonexistent/path/here")).toThrow(
         "Run directory not found",
      );
   });
});

// ---- [74] entry-name security gate ------------------------------------------------------------

describe("zip-bundle entry-name security gate ([74])", () => {
   const REFUSED: { name: string; why: string }[] = [
      { name: "../escape.txt", why: "parent traversal" },
      { name: "a/../../escape.txt", why: "nested parent traversal" },
      { name: "media/../escape.txt", why: "dot-dot inside a media path" },
      { name: "/absolute/path.txt", why: "absolute path" },
      { name: "C:/drive/path.txt", why: "windows drive prefix" },
      { name: "C:\\drive\\path.txt", why: "drive prefix after backslash fold" },
      { name: "a\\..\\..\\escape.txt", why: "traversal via backslash fold" },
      { name: "a//double//slash.txt", why: "empty path segment" },
      { name: "./dot.txt", why: "dot segment" },
      { name: "trailing/", why: "directory-style trailing slash" },
      { name: "", why: "empty name" },
      { name: "nul\0byte.txt", why: "NUL control char" },
      { name: "line\nbreak.txt", why: "newline control char" },
      { name: "cr\rname.txt", why: "carriage return control char" },
      { name: "tab\tname.txt", why: "tab control char" },
      { name: "del\x7fname.txt", why: "DEL control char" },
      { name: "c1\x85name.txt", why: "C1 control char" },
   ];

   for (const { name, why } of REFUSED) {
      it(`refuses ${why}: ${JSON.stringify(name)}`, () => {
         expect(() =>
            createZipBuffer([{ name, content: Buffer.from("x", "utf8") }]),
         ).toThrow(/refused|non-empty string/);
         // Fail closed means REFUSE — the hostile name must never be rewritten and packed.
      });
   }

   it("refuses duplicates of the same name (exact and backslash-folded)", () => {
      const dup =
         (names: string[]): (() => void) =>
         () =>
            createZipBuffer(
               names.map((n) => ({
                  name: n,
                  content: Buffer.from("x", "utf8"),
               })),
            );
      expect(dup(["install-homepage.php", "install-homepage.php"])).toThrow(
         /duplicate entry name/,
      );
      // `a\b` folds to `a/b`, so it collides with an existing `a/b` entry.
      expect(dup(["a/b.txt", "a\\b.txt"])).toThrow(/duplicate entry name/);
   });

   it("still accepts legitimate names the gate must not over-reject", () => {
      const files: ZipFileInput[] = [
         {
            name: "install-homepage.php",
            content: Buffer.from("<?php", "utf8"),
         },
         { name: "README.md", content: Buffer.from("# x", "utf8") },
         {
            name: "media/wysiwyg/deep/nested/hero.jpg",
            content: Buffer.from("j"),
         },
         // Windows-style separators fold to canonical forward slashes (pre-existing behavior).
         { name: "media\\wysiwyg\\folded.jpg", content: Buffer.from("f") },
         { name: "dot.name.still.txt", content: Buffer.from("d") },
      ];
      const zip = createZipBuffer(files);
      const parsed = parseZip(zip);
      expect(parsed.entries.map((e) => e.name)).toEqual([
         "install-homepage.php",
         "README.md",
         "media/wysiwyg/deep/nested/hero.jpg",
         "media/wysiwyg/folded.jpg",
         "dot.name.still.txt",
      ]);
   });
});

// ---- [74] format correctness: CRC, central/local consistency, UTF-8 flag, descriptors ---------

describe("zip-bundle format correctness ([74])", () => {
   it("writes correct CRC-32 into BOTH local header and central directory; payloads round-trip", () => {
      const files: ZipFileInput[] = [
         { name: "a.txt", content: Buffer.from("hello det", "utf8") },
         { name: "m/binary.bin", content: crypto.randomBytes(4096) },
         { name: "empty.txt", content: Buffer.alloc(0) },
      ];
      const zip = createZipBuffer(files);
      const parsed = parseZip(zip);
      expect(parsed.entryCount).toBe(files.length);
      for (const [i, file] of files.entries()) {
         const entry = parsed.entries[i];
         expect(entry.name).toBe(file.name);
         expect(entry.crc).toBe(zlib.crc32(file.content) >>> 0);
         expect(entry.size).toBe(file.content.length);
         const data = entryData(zip, entry);
         expect(data.equals(file.content)).toBe(true);
      }
   });

   it("sets the UTF-8 name flag (bit 11) exactly for non-ASCII names — local and central", () => {
      const zip = createZipBuffer([
         { name: "ascii-only.txt", content: Buffer.from("a") },
         {
            name: "media/trang-chủ/ảnh-minh-họa.jpg",
            content: Buffer.from("vietnamese-name"),
         },
      ]);
      const parsed = parseZip(zip);
      const [ascii, utf8] = parsed.entries;
      expect(ascii.name).toBe("ascii-only.txt");
      expect(ascii.flags & 0x0800).toBe(0);
      expect(utf8.name).toBe("media/trang-chủ/ảnh-minh-họa.jpg");
      expect(utf8.flags & 0x0800).toBe(0x0800); // UTF-8 flag on the central header...
      // ...and the local header already proved equal via parseZip's consistency check.

      // The real Info-ZIP tool must both test and extract the UTF-8 names losslessly.
      const zipPath = writeTempZip(zip, "zip-utf8-");
      try {
         const listing = execFileSync("unzip", ["-l", zipPath], {
            encoding: "utf8",
         });
         expect(listing).toContain("trang-chủ");
         extractAndCompare(zipPath, [
            { name: "ascii-only.txt", content: Buffer.from("a") },
            {
               name: "media/trang-chủ/ảnh-minh-họa.jpg",
               content: Buffer.from("vietnamese-name"),
            },
         ]);
      } finally {
         fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
      }
   });

   it("uses no data descriptor (bit 3 unset): crc and sizes live in the local header", () => {
      const zip = createZipBuffer([
         { name: "x.bin", content: crypto.randomBytes(1024) },
      ]);
      const parsed = parseZip(zip);
      expect(parsed.entries[0].flags & 0x0008).toBe(0);
      // Descriptor-less archives must be self-contained: the stored CRC really matches the
      // payload (round-trip proven in the CRC test above; unzip -t proves it end-to-end).
   });

   it("determinism: identical inputs produce byte-identical archives (sha256 equal)", () => {
      const files: ZipFileInput[] = [
         {
            name: "install-homepage.php",
            content: Buffer.from("<?php echo 1;"),
         },
         { name: "README.md", content: Buffer.from("# bundle\n", "utf8") },
         {
            name: "media/wysiwyg/hero.jpg",
            content: crypto.randomBytes(64 * 1024),
         },
      ];
      const a = createZipBuffer(files);
      const b = createZipBuffer(files);
      expect(sha256(a)).toBe(sha256(b));
      // Fresh copies of the same content bytes (new Buffer identities) still match.
      const c = createZipBuffer(
         files.map((f) => ({ name: f.name, content: Buffer.from(f.content) })),
      );
      expect(sha256(c)).toBe(sha256(a));
   });
});

// ---- [74] fail-closed caps ---------------------------------------------------------------------

describe("zip-bundle oversize caps ([74])", () => {
   it(`refuses more entries than the ${ZIP_MAX_ENTRIES} cap (real default limits)`, () => {
      const tooMany: ZipFileInput[] = Array.from(
         { length: ZIP_MAX_ENTRIES + 1 },
         (_, i) => ({
            name: `f/${i}.txt`,
            content: Buffer.from("x"),
         }),
      );
      expect(() => createZipBuffer(tooMany)).toThrow(
         new RegExp(`exceeds the ${ZIP_MAX_ENTRIES}-entry cap`),
      );
      // Exactly at the cap still works.
      const atCap: ZipFileInput[] = Array.from(
         { length: ZIP_MAX_ENTRIES },
         (_, i) => ({
            name: `f/${i}.txt`,
            content: Buffer.from("x"),
         }),
      );
      const zip = createZipBuffer(atCap);
      expect(parseZip(zip).entryCount).toBe(ZIP_MAX_ENTRIES);
   }, 60000);

   it("refuses a single entry above the per-entry byte cap (real default limit)", () => {
      const oversized: ZipFileInput[] = [
         {
            name: "huge.bin",
            // Refusal happens BEFORE compression: the buffer is only length-checked.
            content: Buffer.alloc(ZIP_DEFAULT_LIMITS.maxEntryBytes + 1),
         },
      ];
      expect(() => createZipBuffer(oversized)).toThrow(/per-entry cap/);
   }, 60000);

   it("refuses a bundle whose TOTAL uncompressed size exceeds the cap (small test limits)", () => {
      const limits = {
         maxEntries: 10,
         maxEntryBytes: 100,
         maxTotalBytes: 150,
      };
      const files: ZipFileInput[] = [
         { name: "a.bin", content: Buffer.alloc(100) },
         { name: "b.bin", content: Buffer.alloc(100) }, // total 200 > 150
      ];
      expect(() => createZipBuffer(files, limits)).toThrow(
         /total uncompressed size exceeds/,
      );
      // Same files fit when the total cap allows them.
      const ok = createZipBuffer(files, { ...limits, maxTotalBytes: 200 });
      expect(parseZip(ok).entryCount).toBe(2);
   });

   it("refuses a single entry above a small per-entry cap before compressing it", () => {
      const limits = { maxEntries: 10, maxEntryBytes: 8, maxTotalBytes: 1000 };
      expect(() =>
         createZipBuffer(
            [{ name: "big.txt", content: Buffer.alloc(9) }],
            limits,
         ),
      ).toThrow(/per-entry cap/);
      expect(() =>
         createZipBuffer(
            [{ name: "ok.txt", content: Buffer.alloc(8) }],
            limits,
         ),
      ).not.toThrow();
   });
});

// ---- [74] packRunBundleZip hardening ------------------------------------------------------------

describe("packRunBundleZip [74] hardening", () => {
   it("throws on an empty run directory (nothing packable)", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-empty-"));
      try {
         expect(() => packRunBundleZip(tmpDir)).toThrow(
            /No bundle files found in run directory/,
         );
      } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
      }
   });

   it("never follows or packs symlinks inside the media tree", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-symlink-"));
      try {
         fs.writeFileSync(path.join(tmpDir, "README.md"), "# bundle");
         fs.mkdirSync(path.join(tmpDir, "media", "wysiwyg"), {
            recursive: true,
         });
         fs.writeFileSync(
            path.join(tmpDir, "media", "wysiwyg", "real.jpg"),
            "real",
         );
         const outsideSecret = path.join(tmpDir, "secret.txt");
         fs.writeFileSync(outsideSecret, "must-not-leak");
         fs.symlinkSync(
            outsideSecret,
            path.join(tmpDir, "media", "wysiwyg", "leak.jpg"),
         );
         const zip = packRunBundleZip(tmpDir);
         const zipPath = path.join(tmpDir, "bundle.zip");
         fs.writeFileSync(zipPath, zip);
         const listing = execFileSync("unzip", ["-l", zipPath], {
            encoding: "utf8",
         });
         expect(listing).toContain("media/wysiwyg/real.jpg");
         expect(listing).not.toContain("leak.jpg");
         extractAndCompare(zipPath, [
            { name: "README.md", content: Buffer.from("# bundle") },
            { name: "media/wysiwyg/real.jpg", content: Buffer.from("real") },
         ]);
      } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
      }
   });

   it("packs UTF-8 media names and every extracted member is byte-identical to its source", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-full-"));
      try {
         const files: { name: string; content: Buffer }[] = [
            {
               name: "install-homepage.php",
               content: Buffer.from("<?php echo 7;"),
            },
            {
               name: "pagebuilder-content.html",
               content: Buffer.from("<div data-content-type='row'></div>"),
            },
            { name: "build-manifest.json", content: Buffer.from('{"k":1}') },
            {
               name: "mapping-and-gaps.json",
               content: Buffer.from('{"gaps":[]}'),
            },
            { name: "README.md", content: Buffer.from("# op\n", "utf8") },
            {
               name: "media/wysiwyg/hero.jpg",
               content: crypto.randomBytes(2048),
            },
            {
               name: "media/wysiwyg/trang-chủ/ảnh-minh-họa.jpg",
               content: crypto.randomBytes(512),
            },
         ];
         for (const f of files) {
            const target = path.join(tmpDir, f.name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, f.content);
         }
         const zip = packRunBundleZip(tmpDir);
         const zipPath = path.join(tmpDir, "bundle.zip");
         fs.writeFileSync(zipPath, zip);

         // Determinism holds through the packing seam too.
         expect(sha256(packRunBundleZip(tmpDir))).toBe(sha256(zip));

         const listing = execFileSync("unzip", ["-t", zipPath], {
            encoding: "utf8",
         });
         expect(listing).toMatch(/No errors detected/i);
         extractAndCompare(zipPath, files);
      } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
      }
   });

   // [74 C74-1] a symlinked bundle ROOT file must be refused, never followed:
   // stat() would resolve the link and pack the OUTSIDE sentinel into the archive.
   it("refuses a symlinked bundle root file instead of packing the outside target", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-rootlink-"));
      const outsideDir = fs.mkdtempSync(
         path.join(os.tmpdir(), "zip-rootlink-outside-"),
      );
      try {
         const sentinel = path.join(outsideDir, "outside-secret.txt");
         fs.writeFileSync(sentinel, "TOP-SECRET-OUTSIDE");
         fs.writeFileSync(
            path.join(tmpDir, "pagebuilder-content.html"),
            "<div data-content-type='row'></div>",
         );
         fs.symlinkSync(sentinel, path.join(tmpDir, "README.md"));

         let refused = false;
         try {
            packRunBundleZip(tmpDir);
         } catch (e) {
            refused = true;
            expect((e as Error).message).toMatch(/symbolic link/);
            expect((e as Error).message).toMatch(/README\.md/);
         }
         expect(refused).toBe(true);
         // No archive can exist (packRunBundleZip threw), and the outside
         // sentinel bytes are untouched.
         expect(fs.readFileSync(sentinel, "utf8")).toBe("TOP-SECRET-OUTSIDE");
      } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
         fs.rmSync(outsideDir, { recursive: true, force: true });
      }
   });

   // [74 C74-1] a symlinked top-level media/ root must be refused: the child
   // Dirent guard never sees the root, and stat().isDirectory() would follow it.
   it("refuses a symlinked media root instead of packing the outside tree", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-mediaroot-"));
      const outsideDir = fs.mkdtempSync(
         path.join(os.tmpdir(), "zip-mediaroot-outside-"),
      );
      try {
         const sentinel = path.join(outsideDir, "hero.jpg");
         fs.writeFileSync(sentinel, "TOP-SECRET-MEDIA-TREE");
         fs.writeFileSync(
            path.join(tmpDir, "README.md"),
            "# bundle with linked media root",
         );
         fs.symlinkSync(outsideDir, path.join(tmpDir, "media"));

         let refused = false;
         try {
            const zip = packRunBundleZip(tmpDir);
            // Defense in depth: if a buffer were ever produced it must not
            // carry the sentinel bytes.
            expect(zip.includes(Buffer.from("TOP-SECRET-MEDIA-TREE"))).toBe(
               false,
            );
         } catch (e) {
            refused = true;
            expect((e as Error).message).toMatch(/symbolic link/);
            expect((e as Error).message).toMatch(/media/);
         }
         expect(refused).toBe(true);
         expect(fs.readFileSync(sentinel, "utf8")).toBe(
            "TOP-SECRET-MEDIA-TREE",
         );
      } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
         fs.rmSync(outsideDir, { recursive: true, force: true });
      }
   });
});
