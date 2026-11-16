import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";
import { GET } from "@/app/api/runs/[runId]/download-bundle/route";

const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];
let root: string;

beforeEach(async () => {
   root = await mkdtemp(path.join(os.tmpdir(), "bundle-route-test-"));
   process.env[STUDIO_DET_RUNS_DIR_ENV] = root;
});

afterEach(async () => {
   if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
   await rm(root, { recursive: true, force: true });
});

describe("GET /api/runs/[runId]/download-bundle", () => {
   it("returns 400 on invalid runId", async () => {
      const res = await GET(
         new Request("http://localhost/api/runs/bad!id/download-bundle"),
         {
            params: Promise.resolve({ runId: "bad!id" }),
         },
      );
      expect(res.status).toBe(400);
   });

   it("returns 404 when run does not exist", async () => {
      const res = await GET(
         new Request("http://localhost/api/runs/run-999/download-bundle"),
         {
            params: Promise.resolve({ runId: "run-999" }),
         },
      );
      expect(res.status).toBe(404);
   });

   it("streams valid zip attachment when run exists with bundle files", async () => {
      const runDir = path.join(root, "run-100");
      await mkdir(path.join(runDir, "media", "wysiwyg"), { recursive: true });
      await writeFile(
         path.join(runDir, "install-homepage.php"),
         "<?php echo 'ok';",
      );
      await writeFile(
         path.join(runDir, "pagebuilder-content.html"),
         "<div>pb</div>",
      );
      await writeFile(
         path.join(runDir, "media", "wysiwyg", "sample.jpg"),
         "fake-jpg",
      );

      const res = await GET(
         new Request("http://localhost/api/runs/run-100/download-bundle"),
         {
            params: Promise.resolve({ runId: "run-100" }),
         },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/zip");
      expect(res.headers.get("Content-Disposition")).toContain(
         'attachment; filename="det-bundle-run-100.zip"',
      );

      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      // PK signature
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
   });
});
