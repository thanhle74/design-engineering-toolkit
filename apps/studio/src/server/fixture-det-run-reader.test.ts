/**
 * [29] W-D — FixtureDetRunReader tests: the labeled DEMO run is served
 * honestly (mode "fixture") and fixture artifacts are NEVER downloadable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEMO_RUN_FIXTURE } from "@/src/shared/fixtures/demo-run";
import { DetRunReaderError, type DetRunReaderErrorCode } from "@/src/shared/contracts";

import { FixtureDetRunReader } from "./fixture-det-run-reader";

async function expectReaderError(promise: Promise<unknown>, code: DetRunReaderErrorCode): Promise<DetRunReaderError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DetRunReaderError);
  const readerError = caught as DetRunReaderError;
  expect(readerError.code).toBe(code);
  return readerError;
}

describe("FixtureDetRunReader", () => {
  let reader: FixtureDetRunReader;

  beforeEach(() => {
    reader = new FixtureDetRunReader();
  });

  it("lists exactly the labeled DEMO run", async () => {
    const runs = await reader.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: DEMO_RUN_FIXTURE.runId,
      mode: "fixture",
      label: expect.stringContaining("DEMO"),
      sourceId: DEMO_RUN_FIXTURE.source.sourceId,
      revisionId: DEMO_RUN_FIXTURE.source.revisionId,
    });
  });

  it("returns the validated fixture run for its id (mode fixture)", async () => {
    const run = await reader.getRun(DEMO_RUN_FIXTURE.runId);
    expect(run.mode).toBe("fixture");
    expect(run.runId).toBe("demo-run-245-2");
    expect(run.preview.status).toBe("unavailable");
    expect(run.artifacts.every((artifact) => artifact.downloadable === false)).toBe(true);
  });

  it("throws run-not-found for any other run id", async () => {
    const error = await expectReaderError(reader.getRun("no-such-run"), "run-not-found");
    expect(error.message).not.toMatch(/\//);
  });

  it("never serves artifact bytes — artifact-not-downloadable, always", async () => {
    await expectReaderError(
      reader.readArtifact(DEMO_RUN_FIXTURE.runId, "node-ir/node-ir.json"),
      "artifact-not-downloadable"
    );
    await expectReaderError(reader.readArtifact(DEMO_RUN_FIXTURE.runId, "made-up"), "artifact-not-downloadable");
    await expectReaderError(reader.readArtifact("unknown-run", "x.json"), "artifact-not-downloadable");
  });
});
