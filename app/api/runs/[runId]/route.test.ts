/**
 * [29] W-D — GET /api/runs/[runId] route test (direct handler invocation
 * with mocked params; Next 16 params are a Promise).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "./route";

describe("GET /api/runs/[runId]", () => {
   it("returns the full DEMO StudioRunView in fixture mode", async () => {
      const response = await GET(
         new Request("http://localhost/api/runs/demo-run-245-2"),
         {
            params: Promise.resolve({ runId: "demo-run-245-2" }),
         },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
         runId: string;
         mode: string;
         mappings: unknown[];
      };
      expect(body).toMatchObject({ runId: "demo-run-245-2", mode: "fixture" });
      expect(body.mappings.length).toBeGreaterThan(0);
   });

   it("maps an unknown run id to 404 run-not-found", async () => {
      const response = await GET(
         new Request("http://localhost/api/runs/ghost"),
         {
            params: Promise.resolve({ runId: "ghost" }),
         },
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("run-not-found");
   });

   it("maps a traversal run id to 404 (never content, never a server path)", async () => {
      const response = await GET(new Request("http://localhost/api/runs/x"), {
         params: Promise.resolve({ runId: "../evil" }),
      });
      expect(response.status).toBe(404);
      const body = (await response.json()) as {
         error: { code: string; message: string };
      };
      expect(body.error.code).toBe("run-not-found");
      // no filesystem access happened: no absolute path can appear in the body
      expect(body.error.message).not.toMatch(/(^|[\s"'])\//);
      expect(body.error.message).not.toContain("/etc/");
   });
});
