/**
 * [29] W-D — artifact-access unit tests: path guards and allowlists.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
   MAX_ARTIFACT_BYTES,
   RUN_ID_PATTERN,
   downloadContentType,
   isDownloadableExtension,
   isInsideDir,
   isSafeRelativeArtifactPath,
   safeAttachmentFileName,
} from "../artifact-access";

describe("RUN_ID_PATTERN", () => {
   it.each(["run-001", "demo-run-245-2", "R1.a_b-c", "a"])(
      "accepts %s",
      (runId) => {
         expect(RUN_ID_PATTERN.test(runId)).toBe(true);
      },
   );

   it.each([
      "../evil",
      "a/b",
      "a\\b",
      ".hidden",
      "..",
      "",
      "a".repeat(65),
      "with space",
   ])("rejects %j", (runId) => {
      expect(RUN_ID_PATTERN.test(runId)).toBe(false);
   });
});

describe("isSafeRelativeArtifactPath", () => {
   it.each(["node-ir.json", "out/deep/node-ir.json", "styles.css"])(
      "accepts %s",
      (file) => {
         expect(isSafeRelativeArtifactPath(file)).toBe(true);
      },
   );

   it.each([
      "../escape.json",
      "/etc/passwd",
      "a/../../b.json",
      "a\\b.json",
      "",
      "./here.json",
      "a//b.json",
   ])("refuses %j", (file) => {
      expect(isSafeRelativeArtifactPath(file)).toBe(false);
   });
});

describe("download allowlist", () => {
   it("accepts allowlisted extensions", () => {
      for (const name of [
         "a.json",
         "b.xml",
         "c.css",
         "d.phtml",
         "e.svg",
         "f.txt",
         "g.html",
         "install-homepage.php",
         "README.md",
      ]) {
         expect(isDownloadableExtension(name)).toBe(true);
         expect(downloadContentType(name)).toBeDefined();
      }
   });

   it("refuses non-allowlisted extensions", () => {
      for (const name of ["a.exe", "c.sh", "d.mjs", "e"]) {
         expect(isDownloadableExtension(name)).toBe(false);
         expect(downloadContentType(name)).toBeUndefined();
      }
   });

   it("maps content types", () => {
      expect(downloadContentType("node-ir.json")).toBe("application/json");
      expect(downloadContentType("banner.phtml")).toBe(
         "text/plain; charset=utf-8",
      );
      expect(downloadContentType("preview.svg")).toBe("image/svg+xml");
      // [70] CMS installer bundle: .php is served as INERT octet-stream bytes
      // (never executed here); .md as markdown text.
      expect(downloadContentType("install-homepage.php")).toBe(
         "application/octet-stream",
      );
      expect(downloadContentType("README.md")).toBe(
         "text/markdown; charset=utf-8",
      );
   });
});

describe("isInsideDir + safeAttachmentFileName", () => {
   it("requires containment below the trusted dir", () => {
      expect(isInsideDir("/root/run-1", "/root")).toBe(true);
      expect(isInsideDir("/root", "/root")).toBe(true);
      expect(isInsideDir("/root-other/x", "/root")).toBe(false);
      expect(isInsideDir("/rootish", "/root")).toBe(false);
   });

   it("reduces names to a safe basename", () => {
      expect(safeAttachmentFileName("node-ir.json")).toBe("node-ir.json");
      expect(safeAttachmentFileName('we"ird')).toBe("we_ird");
      expect(safeAttachmentFileName("a/b/c.css")).toBe("c.css");
   });

   it("caps artifact size at 8 MiB", () => {
      expect(MAX_ARTIFACT_BYTES).toBe(8 * 1024 * 1024);
   });
});
