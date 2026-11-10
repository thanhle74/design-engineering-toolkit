/**
 * [29] W-D — getDetRunReader factory tests: env contract.
 *
 *   unset            → FixtureDetRunReader (labeled DEMO run)
 *   set + valid dir  → DirectoryDetRunReader
 *   set + invalid    → DetRunReaderError("not-configured")
 *
 * The env VALUE must never leak into the not-configured message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DetRunReaderError } from "@/src/shared/contracts";

import { DirectoryDetRunReader } from "./directory-det-run-reader";
import { STUDIO_DET_RUNS_DIR_ENV, getDetRunReader } from "./det-run-reader-factory";
import { FixtureDetRunReader } from "./fixture-det-run-reader";

const ENV_KEY = STUDIO_DET_RUNS_DIR_ENV;
const savedEnv = process.env[ENV_KEY];

beforeEach(() => {
  delete process.env[ENV_KEY];
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe("getDetRunReader", () => {
  it("returns the fixture reader when the env var is unset", async () => {
    const reader = await getDetRunReader();
    expect(reader).toBeInstanceOf(FixtureDetRunReader);
    const runs = await reader.listRuns();
    expect(runs[0]?.runId).toBe("demo-run-245-2");
    expect(runs[0]?.mode).toBe("fixture");
  });

  it("returns a DirectoryDetRunReader for a valid directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "det-studio-factory-"));
    try {
      process.env[ENV_KEY] = root;
      const reader = await getDetRunReader();
      expect(reader).toBeInstanceOf(DirectoryDetRunReader);
      expect(await reader.listRuns()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws not-configured (never fabricates) for a missing directory", async () => {
    process.env[ENV_KEY] = path.join(os.tmpdir(), "det-studio-factory-does-not-exist-9f3a");
    let caught: unknown;
    try {
      await getDetRunReader();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DetRunReaderError);
    const error = caught as DetRunReaderError;
    expect(error.code).toBe("not-configured");
    expect(error.message).not.toContain(process.env[ENV_KEY]);
  });

  it("throws not-configured when the env var points at a file", async () => {
    const file = path.join(os.tmpdir(), `det-studio-factory-file-${Date.now()}.txt`);
    await writeFile(file, "not a dir", "utf8");
    try {
      process.env[ENV_KEY] = file;
      let caught: unknown;
      try {
        await getDetRunReader();
      } catch (error) {
        caught = error;
      }
      expect((caught as DetRunReaderError).code).toBe("not-configured");
    } finally {
      await rm(file, { force: true });
    }
  });

  it("throws not-configured when the env var is set but empty", async () => {
    process.env[ENV_KEY] = "";
    let caught: unknown;
    try {
      await getDetRunReader();
    } catch (error) {
      caught = error;
    }
    expect((caught as DetRunReaderError).code).toBe("not-configured");
  });
});
