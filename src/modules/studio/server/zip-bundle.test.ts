import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createZipBuffer, packRunBundleZip } from "./zip-bundle";
import { execFileSync } from "node:child_process";

describe("zip-bundle", () => {
   it("creates a valid zip buffer that can be read with unzip", () => {
      const zip = createZipBuffer([
         { name: "test.txt", content: Buffer.from("hello world", "utf8") },
         {
            name: "sub/sample.json",
            content: Buffer.from('{"status":"ok"}', "utf8"),
         },
      ]);

      expect(zip.length).toBeGreaterThan(0);
      // PK signature
      expect(zip[0]).toBe(0x50);
      expect(zip[1]).toBe(0x4b);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-"));
      const zipPath = path.join(tmpDir, "test.zip");
      fs.writeFileSync(zipPath, zip);

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

      fs.rmSync(tmpDir, { recursive: true, force: true });
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
