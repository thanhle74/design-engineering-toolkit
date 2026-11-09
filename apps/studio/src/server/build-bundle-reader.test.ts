/**
 * [40] Build-bundle reader tests — driven through DirectoryDetRunReader (the
 * contract surface, including the [40] discovery dispatch) against a REAL
 * `det build` bundle (examples/build/project.example.json, offline) plus
 * synthetic manifests for guard/edge cases.
 *
 * Proven per issue #40: bundle vs legacy coexistence in the listing, stage
 * truth, gap list, verified downloads, tamper = hard refusal, manifest trust
 * anchor, relocation safety, invalid/missing manifests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("server-only", () => ({}));

import { DetRunReaderError, type DetRunReaderErrorCode } from "@/src/shared/contracts";

import { DirectoryDetRunReader } from "./directory-det-run-reader";
import { guardBuildManifest } from "./build-bundle-reader";
import { DET_ENTRY, exampleBuildConfigBody, requireDetCli, runExampleBuild } from "./test-helpers/det-cli";

const LEGACY_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "real-det-runs",
  "compose-run"
);

let runsRoot: string;

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

beforeEach(async () => {
  runsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-bundles-"));
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
});

/** Build one REAL bundle into the runs root under `runId`. */
async function makeRealBundle(runId: string): Promise<string> {
  requireDetCli();
  const exit = runExampleBuild(path.join(runsRoot, runId));
  expect(exit).toBe(0);
  return path.join(runsRoot, runId);
}

/** Minimal synthetic bundle: manifest + pinned page-structure only. */
async function makeSyntheticBundle(
  runId: string,
  manifestOverrides: Record<string, unknown> = {},
  options: { pageStructure?: boolean; manifest?: Record<string, unknown> } = {}
): Promise<string> {
  const runDir = path.join(runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    kind: "det-build-manifest",
    profileId: "g28-home-preview",
    platformId: "magento-pagebuilder",
    source: { sourceId: "g28-home-design-source", revisionId: "rev-1" },
    config: { contentHash: `sha256:${"c".repeat(64)}` },
    stages: [
      { stage: "capability-probe", status: "completed", exitCode: 0, outDir: "01-capability-probe" },
      { stage: "extraction", status: "completed", exitCode: 0, outDir: "02-extraction" },
      { stage: "composition", status: "completed", exitCode: 0, outDir: "03-composition" },
    ],
    inputs: [],
    outputs: [],
    gaps: [{ code: "PREVIEW_INSTALL_OPERATOR_GATED", message: "operator gated" }],
    ...manifestOverrides,
  };
  await writeJson(path.join(runDir, "build-manifest.json"), options.manifest ?? manifest);
  if (options.pageStructure !== false) {
    await writeJson(path.join(runDir, "02-extraction", "page-structure.json"), {
      schemaVersion: "1.0.0",
      source: { sourceId: "g28-home-design-source", revisionId: "rev-1" },
      sections: [],
    });
  }
  return runDir;
}

async function expectReaderError(
  code: DetRunReaderErrorCode,
  run: () => Promise<unknown>
): Promise<DetRunReaderError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(DetRunReaderError);
    const readerError = error as DetRunReaderError;
    expect(readerError.code).toBe(code);
    return readerError;
  }
  throw new Error(`Expected DetRunReaderError(${code}) but the call succeeded.`);
}

describe("[40] bundle vs legacy run discovery", () => {
  it("lists a real build bundle alongside a legacy run, each with its own shape", async () => {
    await makeRealBundle("build-real");
    // legacy fixture run copied from the committed real-det-runs fixture
    await mkdir(path.join(runsRoot, "compose-run"), { recursive: true });
    for (const f of ["tool-run.json", "compose-report.json", "native-content.html"]) {
      await writeFile(path.join(runsRoot, "compose-run", f), await readFile(path.join(LEGACY_FIXTURE_DIR, f)));
    }

    const reader = await DirectoryDetRunReader.open(runsRoot);
    const summaries = await reader.listRuns();
    const ids = summaries.map((s) => s.runId);
    expect(ids).toContain("build-real");
    expect(ids).toContain("compose-run");

    const bundle = summaries.find((s) => s.runId === "build-real")!;
    expect(bundle.mode).toBe("live");
    expect(bundle.label).toContain("det build");
    expect(bundle.label).toContain("g28-home-preview");
    expect(bundle.sourceId).toBe("g28-home-fixture-source");
    expect(bundle.revisionId).not.toBeNull();
    // the manifest records no timestamp: unknown stays unknown
    expect(bundle.generatedAt).toBeNull();
  });

  it("ignores dot-prefixed job journals in the listing", async () => {
    await mkdir(path.join(runsRoot, ".build-jobs"), { recursive: true });
    await writeJson(path.join(runsRoot, ".build-jobs", "build-x.json"), { runId: "build-x", state: "running" });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    expect(await reader.listRuns()).toHaveLength(0);
  });
});

describe("[40] bundle run view truth", () => {
  it("assembles stage table, gaps, verification and provenance from a real bundle", async () => {
    await makeRealBundle("build-real");
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const run = await reader.getRun("build-real");

    expect(run.mode).toBe("live");
    expect(run.toolCommand).toBe("det build");
    expect(run.profileId).toBe("g28-home-preview");
    expect(run.platformId).toBe("magento-pagebuilder");
    expect(run.source.sourceId).toBe("g28-home-fixture-source");
    expect(run.source.revisionId).not.toBeNull();
    expect(run.preview.status).toBe("unavailable");

    expect(run.build).toBeDefined();
    expect(run.build!.manifestVerified).toBe(true);
    expect(run.build!.configContentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(run.build!.stages).toHaveLength(3);
    expect(run.build!.stages.every((s) => s.status === "completed" && s.exitCode === 0)).toBe(true);
    const gapCodes = run.build!.gaps.map((g) => g.code);
    expect(gapCodes).toContain("PREVIEW_INSTALL_OPERATOR_GATED");
    expect(gapCodes.some((c) => c.startsWith("COMPOSITION_"))).toBe(true);

    // derived overall exit code from the stage table (engine semantics)
    expect(run.exitCode).toBe(0);
    // compose mappings and sections survived the bundle join
    expect(run.mappings.length).toBeGreaterThan(0);
    expect(run.sections.length).toBeGreaterThan(0);
  });

  it("marks manifest-declared outputs downloadable and serves exact bytes", async () => {
    await makeRealBundle("build-real");
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const run = await reader.getRun("build-real");

    const nativeContent = run.artifacts.find((a) => a.artifactId === "03-composition/native-content.html")!;
    expect(nativeContent.downloadable).toBe(true);
    expect(nativeContent.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(nativeContent.contentHash).toBeUndefined(); // canonical vs file-byte hashes stay distinct

    const manifestArtifact = run.artifacts.find((a) => a.artifactId === "build-manifest.json")!;
    expect(manifestArtifact.downloadable).toBe(true);

    const download = await reader.readArtifact("build-real", "03-composition/native-content.html");
    const onDisk = await readFile(path.join(runsRoot, "build-real", "03-composition", "native-content.html"));
    expect(Buffer.from(download.bytes).equals(onDisk)).toBe(true);
    expect(download.fileName).toBe("native-content.html");
    expect(download.contentType).toContain("text/html");

    const manifestDownload = await reader.readArtifact("build-real", "build-manifest.json");
    expect(manifestDownload.bytes.byteLength).toBeGreaterThan(0);
  });

  it("survives relocation of the whole runs tree (no absolute paths baked in)", async () => {
    await makeRealBundle("build-real");
    const movedRoot = `${runsRoot}-moved`;
    await rename(runsRoot, movedRoot);
    const reader = await DirectoryDetRunReader.open(movedRoot);
    const run = await reader.getRun("build-real");
    expect(run.build!.manifestVerified).toBe(true);
    const download = await reader.readArtifact("build-real", "03-composition/native-content.html");
    expect(download.bytes.byteLength).toBeGreaterThan(0);
    await rm(movedRoot, { recursive: true, force: true });
  });
});

describe("[40] tamper and hard refusal", () => {
  it("fails verification and refuses downloads after a byte flip", async () => {
    const runDir = await makeRealBundle("build-real");
    const target = path.join(runDir, "03-composition", "native-content.html");
    await appendFile(target, "<!-- tampered -->");

    const reader = await DirectoryDetRunReader.open(runsRoot);
    const run = await reader.getRun("build-real");
    expect(run.build!.manifestVerified).toBe(false);
    expect(run.artifacts.find((a) => a.artifactId === "03-composition/native-content.html")!.downloadable).toBe(false);

    const error = await expectReaderError("invalid-payload", () =>
      reader.readArtifact("build-real", "03-composition/native-content.html")
    );
    expect(error.message).toMatch(/sha256|bytes/i);

    // the trust anchor itself stays downloadable; the untampered outputs stay verifiable
    const manifestDownload = await reader.readArtifact("build-real", "build-manifest.json");
    expect(manifestDownload.bytes.byteLength).toBeGreaterThan(0);
    const registry = await reader.readArtifact("build-real", "01-capability-probe/capability-registry.json");
    expect(registry.bytes.byteLength).toBeGreaterThan(0);
  });

  it("treats a missing declared output as unverified and unservable", async () => {
    await makeSyntheticBundle("build-broken", {
      outputs: [
        {
          path: "03-composition/native-content.html",
          role: "native-content",
          sha256: `${"a".repeat(64)}`,
          bytes: 10,
          provenance: { via: "det-compose", stage: "03-composition" },
        },
      ],
    });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const run = await reader.getRun("build-broken");
    expect(run.build!.manifestVerified).toBe(false);
    expect(run.artifacts.find((a) => a.artifactId === "03-composition/native-content.html")!.downloadable).toBe(false);
    await expectReaderError("artifact-not-downloadable", () =>
      reader.readArtifact("build-broken", "03-composition/native-content.html")
    );
  });
});

describe("[40] manifest guards and failures", () => {
  it("rejects a manifest whose kind is not det-build-manifest", async () => {
    await makeSyntheticBundle("build-wrongkind", {}, { manifest: { kind: "something-else" } as Record<string, unknown> });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    await expectReaderError("invalid-payload", () => reader.getRun("build-wrongkind"));
  });

  it("rejects outputs with unsafe relative paths before any filesystem access", async () => {
    await makeSyntheticBundle("build-traversal", {
      outputs: [
        {
          path: "../escape/native-content.html",
          role: "native-content",
          sha256: `${"a".repeat(64)}`,
          bytes: 10,
        },
      ],
    });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    await expectReaderError("invalid-payload", () => reader.getRun("build-traversal"));
    await expectReaderError("invalid-payload", () =>
      reader.readArtifact("build-traversal", "../escape/native-content.html")
    );
  });

  it("refuses mixed design-source revisions between manifest and artifacts", async () => {
    await makeSyntheticBundle("build-mixed", { source: { sourceId: "g28-home-design-source", revisionId: "rev-2" } });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    const error = await expectReaderError("invalid-payload", () => reader.getRun("build-mixed"));
    expect(error.message).toMatch(/revision|identity/i);
  });

  it("reports run-not-found for a directory with neither root manifest", async () => {
    await mkdir(path.join(runsRoot, "empty-run"), { recursive: true });
    const reader = await DirectoryDetRunReader.open(runsRoot);
    expect(await reader.listRuns()).toHaveLength(0);
    await expectReaderError("run-not-found", () => reader.getRun("empty-run"));
  });

  it("does not follow a symlinked run directory out of the runs root", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "det40-outside-"));
    await writeJson(path.join(outside, "build-manifest.json"), {
      schemaVersion: 1,
      kind: "det-build-manifest",
      profileId: "g28-home-preview",
      platformId: "magento-pagebuilder",
      source: { sourceId: "s", revisionId: "r" },
      config: { contentHash: `sha256:${"c".repeat(64)}` },
      stages: [],
      inputs: [],
      outputs: [],
      gaps: [],
    });
    await symlink(outside, path.join(runsRoot, "linked"));
    const reader = await DirectoryDetRunReader.open(runsRoot);
    expect(await reader.listRuns()).toHaveLength(0);
    // realpath containment catches the escape as path-refused on direct access
    await expectReaderError("path-refused", () => reader.getRun("linked"));
    await rm(outside, { recursive: true, force: true });
  });

  it("guardBuildManifest rejects duplicate output paths", () => {
    const duplicateOutput = {
      schemaVersion: 1,
      kind: "det-build-manifest",
      profileId: "p",
      platformId: "m",
      source: { sourceId: "s", revisionId: "r" },
      config: { contentHash: `sha256:${"c".repeat(64)}` },
      stages: [],
      inputs: [],
      outputs: [
        { path: "a.json", role: "node-ir", sha256: `${"a".repeat(64)}`, bytes: 1 },
        { path: "a.json", role: "node-ir", sha256: `${"a".repeat(64)}`, bytes: 1 },
      ],
      gaps: [],
    };
    expect(() => guardBuildManifest(duplicateOutput)).toThrow();
    try {
      guardBuildManifest(duplicateOutput);
    } catch (error) {
      expect((error as DetRunReaderError).details).toMatch(/duplicate/i);
    }
  });
});

describe("[40] real bundle file facts", () => {
  it("writes a bundle whose root carries only build-manifest.json (no root tool-run)", async () => {
    const runDir = await makeRealBundle("build-real");
    expect(existsSync(path.join(runDir, "build-manifest.json"))).toBe(true);
    expect(existsSync(path.join(runDir, "tool-run.json"))).toBe(false);
    expect(existsSync(path.join(runDir, "03-composition", "native-content.html"))).toBe(true);
  });

  it("example config relocation: a runtime config with absolute paths builds identically", async () => {
    // Caller configs may carry absolute paths (schema allows both); prove a
    // runtime-generated config (outside the repo examples dir) builds offline.
    requireDetCli();
    const cfgDir = await mkdtemp(path.join(os.tmpdir(), "det40-cfg-"));
    const cfgPath = path.join(cfgDir, "build-config.json");
    await writeFile(cfgPath, exampleBuildConfigBody(), "utf8");
    const outDir = path.join(cfgDir, "out", "bundle");
    const proc = spawnSync(
      process.execPath,
      [DET_ENTRY, "build", "--config", cfgPath, "--out", outDir, "--json"],
      { encoding: "utf8", timeout: 60_000 }
    );
    expect(proc.status).toBe(0);
    expect(existsSync(path.join(outDir, "build-manifest.json"))).toBe(true);
    await rm(cfgDir, { recursive: true, force: true });
  });
});
