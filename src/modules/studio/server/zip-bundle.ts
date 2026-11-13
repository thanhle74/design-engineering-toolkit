import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export interface ZipFileInput {
   name: string;
   content: Buffer;
}

/**
 * Creates a standard PKZIP zip buffer in pure Node.js (no external dependencies).
 * Uses standard DEFLATE compression via zlib.deflateRawSync and zlib.crc32.
 */
export function createZipBuffer(files: ZipFileInput[]): Buffer {
   const localHeaders: Buffer[] = [];
   const centralHeaders: Buffer[] = [];
   let offset = 0;

   for (const file of files) {
      // Normalize path separators to forward slashes for zip compatibility
      const normName = file.name.replace(/\\/g, "/").replace(/^\/+/, "");
      const nameBuf = Buffer.from(normName, "utf8");
      const dataBuf = file.content;
      const compressed = zlib.deflateRawSync(dataBuf);
      const crc = zlib.crc32(dataBuf);

      // Local file header (30 bytes + filename)
      const lh = Buffer.alloc(30 + nameBuf.length);
      lh.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
      lh.writeUInt16LE(20, 4); // version needed (2.0)
      lh.writeUInt16LE(0, 6); // general flags
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
      ch.writeUInt16LE(20, 4); // version made by
      ch.writeUInt16LE(20, 6); // version needed (2.0)
      ch.writeUInt16LE(0, 8); // general flags
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
      ch.writeUInt32LE(0, 38); // external file attributes
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
