/**
 * [40] build-control error mapping — the single-slot busy case (409) plus the
 * inherited reader-code mapping for /api/builds/** and /api/build-configs.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import { buildControlErrorResponse } from "./api-error";
import { BuildBusyError, type BuildJobSnapshot } from "./build-runner";

const ACTIVE_JOB: BuildJobSnapshot = {
   runId: "build-1",
   configId: "g28-example",
   state: "running",
   cancelled: false,
   exitCode: null,
   signal: null,
   timedOut: false,
   startedAt: "2026-11-09T00:00:00.000Z",
   finishedAt: null,
   command: ["node", "det.js"],
   stdoutTail: "",
   stderrTail: "",
   manifestSummary: null,
   spawnError: null,
   pid: 1,
};

describe("buildControlErrorResponse", () => {
   it("maps BuildBusyError to 409 with the active job snapshot", async () => {
      const response = buildControlErrorResponse(
         new BuildBusyError(ACTIVE_JOB),
      );
      expect(response.status).toBe(409);
      const body = (await response.json()) as {
         error: { code: string; message: string };
         active: BuildJobSnapshot;
      };
      expect(body.error.code).toBe("build-busy");
      expect(body.error.message).toMatch(/one build at a time/i);
      expect(body.active.runId).toBe("build-1");
      expect(body.active.state).toBe("running");
   });

   it("inherits the reader-code status map (not-configured → 503, run-not-found → 404)", async () => {
      const notConfigured = buildControlErrorResponse(
         new DetRunReaderError(
            "not-configured",
            "Build control requires STUDIO_DET_RUNS_DIR to be set.",
         ),
      );
      expect(notConfigured.status).toBe(503);

      const notFound = buildControlErrorResponse(
         new DetRunReaderError(
            "run-not-found",
            'No build-config entry "x" in the configured catalog.',
         ),
      );
      expect(notFound.status).toBe(404);
   });

   it("strips control characters from surfaced messages", async () => {
      const response = buildControlErrorResponse(
         new DetRunReaderError("not-configured", "bad\u0000message\u001fhere"),
      );
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toBe("bad message here");
   });
});
