/**
 * [29] W-D — GET /api/runs/[runId]/artifacts/[artifactId] route test.
 *
 * Direct handler invocation against a real tmp DET output root: validated
 * download with attachment headers, plus the 400/403/404 error map. Fixture
 * mode never serves bytes (403).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { STUDIO_DET_RUNS_DIR_ENV } from "@/src/modules/studio/server/det-run-reader-factory";

import { GET } from "./route";

const savedEnv = process.env[STUDIO_DET_RUNS_DIR_ENV];
let root: string;

beforeEach(async () => {
   delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   root = await mkdtemp(path.join(os.tmpdir(), "det-studio-routes-"));
});

afterEach(async () => {
   if (savedEnv === undefined) delete process.env[STUDIO_DET_RUNS_DIR_ENV];
   else process.env[STUDIO_DET_RUNS_DIR_ENV] = savedEnv;
   await rm(root, { recursive: true, force: true });
});

async function writeRun(): Promise<void> {
   const runDir = path.join(root, "run-001");
   await mkdir(runDir, { recursive: true });
   await writeFile(
      path.join(runDir, "tool-run.json"),
      JSON.stringify({
         schemaVersion: 1,
         tool: { name: "det" },
         command: "compose",
         exitCode: 0,
         generatedAt: "2026-11-09T01:00:00.000Z",
         artifacts: [
            {
               role: "node-ir",
               file: "node-ir.json",
               schemaRef: "https://example.invalid/n.schema.json",
            },
         ],
         runDiagnostics: [],
      }),
      "utf8",
   );
   await writeFile(
      path.join(runDir, "node-ir.json"),
      JSON.stringify({ schemaVersion: 1 }),
      "utf8",
   );
}

function call(runId: string, artifactId: string): Promise<Response> {
   return GET(
      new Request(`http://localhost/api/runs/${runId}/artifacts/${artifactId}`),
      {
         params: Promise.resolve({ runId, artifactId }),
      },
   );
}

describe("GET /api/runs/[runId]/artifacts/[artifactId]", () => {
   it("serves a declared artifact as an attachment with an allowlisted content type", async () => {
      await writeRun();
      process.env[STUDIO_DET_RUNS_DIR_ENV] = root;
      const response = await call(
         "run-001",
         encodeURIComponent("node-ir/node-ir.json"),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Content-Disposition")).toBe(
         'attachment; filename="node-ir.json"',
      );
      const body = (await response.json()) as { schemaVersion: number };
      expect(body.schemaVersion).toBe(1);
   });

   it("serves the DEMO fixture as artifact-not-downloadable (403) when unconfigured", async () => {
      const response = await call(
         "demo-run-245-2",
         encodeURIComponent("node-ir/node-ir.json"),
      );
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("artifact-not-downloadable");
   });

   it("maps an unknown artifact to 404", async () => {
      await writeRun();
      process.env[STUDIO_DET_RUNS_DIR_ENV] = root;
      const response = await call(
         "run-001",
         encodeURIComponent("ghost/ghost.json"),
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("artifact-not-found");
   });

   it("maps a malformed encoded artifactId to 400", async () => {
      await writeRun();
      process.env[STUDIO_DET_RUNS_DIR_ENV] = root;
      const response = await call("run-001", "%zz");
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("bad-request");
   });

   it("maps a not-configured root to 503", async () => {
      await writeRun();
      process.env[STUDIO_DET_RUNS_DIR_ENV] = path.join(root, "missing");
      const response = await call(
         "run-001",
         encodeURIComponent("node-ir/node-ir.json"),
      );
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not-configured");
   });
});
