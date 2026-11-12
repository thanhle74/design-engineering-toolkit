/**
 * [29] W-D — DirectoryDetRunReader tests.
 *
 * Payloads are small but shaped like the REAL engine artifacts
 * (schemas/cli/tool-run + compose-output, schemas/converter/source-review +
 * page-structure + node-ir). Security cases: traversal, absolute paths,
 * symlink escape, extension allowlist, size cap — a refused path must never
 * leak file content, and error messages must never contain server paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DetRunReaderError, type DetRunReaderErrorCode } from "@/src/modules/studio/shared/contracts";

import { DirectoryDetRunReader } from "./directory-det-run-reader";

const HEX64 = "a".repeat(64);
const HEX64_B = "b".repeat(64);

/* ------------------------------------------------------------------ */
/* Real-shaped payload builders                                        */
/* ------------------------------------------------------------------ */

function toolRunPayload(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    tool: { name: "det", toolVersion: "0.1.0" },
    command: "compose",
    exitCode: 0,
    generatedAt: "2026-11-09T01:00:00.000Z",
    profileId: "demo-fashion-storefront",
    platformId: "magento-pagebuilder",
    artifacts: [
      {
        role: "node-ir",
        file: "node-ir.json",
        schemaRef: "https://example.invalid/schemas/converter/node-ir.schema.json",
        contentHash: HEX64,
      },
      {
        role: "compose-report",
        file: "compose-report.json",
        schemaRef: "https://example.invalid/schemas/cli/compose-output.schema.json",
        contentHash: HEX64,
      },
      {
        role: "registry",
        file: "registry.json",
        schemaRef: "https://example.invalid/schemas/registry.schema.json",
        contentHash: HEX64,
      },
    ],
    runDiagnostics: [
      {
        code: "NO_FILES_WRITTEN_DRY_RUN",
        severity: "info",
        message: "Run-level info diagnostic from the envelope.",
        subject: { type: "run", id: "run-001" },
      },
    ],
    counts: { errors: 0, warnings: 1, infos: 1 },
    wroteFiles: true,
    ...extra,
  });
}

function composePayload(extraMapping: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    platformId: "magento-pagebuilder",
    source: { sourceId: "demo-source", revisionId: "rev-0001", accessedAt: "2026-11-09T01:00:00.000Z" },
    inputs: {
      nodeIrContentHash: HEX64,
      pageStructureContentHash: HEX64_B,
      contentManifestContentHash: HEX64,
      registryRevisionId: "reg-1",
      bindingMapContentHash: HEX64,
    },
    content: '<div data-content-type="row"></div>',
    contentHash: `sha256:${HEX64}`,
    mapping: [
      {
        sourceNodeId: "n-aaaaaaaaaaaa",
        sourceName: "Heading — Materials",
        sourceLocator: "design://demo-source/100:3",
        disposition: "mapped",
        target: {
          capabilityId: "magento_pagebuilder/heading",
          appearanceId: "default",
          nativeElement: "heading",
          nativeField: "content",
        },
        note: "Realized as a native heading.",
      },
      {
        sourceNodeId: "n-bbbbbbbbbbbb",
        sourceName: "DECOR/Mist",
        sourceLocator: "design://demo-source/100:7",
        disposition: "gap",
        note: "Decoration without a native equivalent.",
      },
      ...extraMapping,
    ],
    diagnostics: [
      {
        code: "NOT_VERIFIED",
        severity: "warning",
        message: "Compose gap diagnostic for DECOR/Mist — recorded, never silently dropped.",
        subject: { type: "node", id: "n-bbbbbbbbbbbb" },
      },
    ],
    ...extra,
  });
}

function sourceReviewPayload(): string {
  return JSON.stringify({
    schemaVersion: 1,
    profileId: "demo-fashion-storefront",
    generatedAt: "2026-11-09T01:00:00.000Z",
    source: { sourceId: "demo-source", revisionId: "rev-0001", accessedAt: "2026-11-09T01:00:00.000Z" },
    inputs: { nodeIrContentHash: HEX64 },
    counts: {
      total: 2,
      byClass: {
        SITE_CHROME: 0,
        EDITORIAL_SECTION: 1,
        SHARED_COMPONENT: 0,
        PRESENTATIONAL: 1,
        UNKNOWN_OR_AMBIGUOUS: 0,
      },
      byDisposition: {
        MAPPED: 1,
        EXCLUDED_WITH_REASON: 0,
        DECORATION_MERGED: 0,
        REFERENCE_ONLY: 0,
        NEEDS_REVIEW: 1,
      },
    },
    entries: [
      {
        nodeId: "n-aaaaaaaaaaaa",
        semanticClass: "EDITORIAL_SECTION",
        disposition: "MAPPED",
        reason: "Structural content within its section; naming hint weighed as evidence, not proof.",
        sectionId: "s-cccccccccccc",
        evidence: [
          {
            evidenceId: "e-aaaaaaaaaaaa",
            kind: "document",
            locator: "design://demo-source/100:3",
            retrievedAt: "2026-11-09T01:00:00.000Z",
            sourceRevisionId: "rev-0001",
            method: "design-source-adapter",
          },
        ],
      },
      {
        nodeId: "n-bbbbbbbbbbbb",
        semanticClass: "PRESENTATIONAL",
        disposition: "NEEDS_REVIEW",
        reason: "Ambiguous decoration — a human mapping decision is required.",
        evidence: [
          {
            evidenceId: "e-bbbbbbbbbbbb",
            kind: "document",
            locator: "design://demo-source/100:7",
            retrievedAt: "2026-11-09T01:00:00.000Z",
            sourceRevisionId: "rev-0001",
            method: "design-source-adapter",
          },
        ],
      },
    ],
    diagnostics: [
      {
        code: "EVIDENCE_MISSING",
        severity: "error",
        message: "Review diagnostic attached to the ambiguous node.",
        subject: { type: "node", id: "n-bbbbbbbbbbbb" },
      },
    ],
  });
}

function pageStructurePayload(): string {
  return JSON.stringify({
    schemaVersion: 1,
    profileId: "demo-fashion-storefront",
    generatedAt: "2026-11-09T01:00:00.000Z",
    source: { sourceId: "demo-source", revisionId: "rev-0001", accessedAt: "2026-11-09T01:00:00.000Z" },
    inputs: { nodeIrContentHash: HEX64, registryRevisionId: "reg-1" },
    sections: [
      {
        sectionId: "s-cccccccccccc",
        order: 0,
        name: "SECTION/Hero",
        role: "hero",
        layout: { direction: "column", positioning: "static", constraints: [], relativeSizes: [], overflow: "visible" },
        elements: [
          {
            elementId: "n-aaaaaaaaaaaa",
            childrenElementIds: [],
            resolution: { status: "mapped", mappingConfidence: "high", diagnostics: [] },
          },
          {
            elementId: "n-dddddddddddd",
            childrenElementIds: [],
            resolution: { status: "unmapped", mappingConfidence: "low", diagnostics: [] },
          },
        ],
        sourceEvidence: [
          {
            evidenceId: "e-cccccccccccc",
            kind: "document",
            locator: "design://demo-source/100:2",
            retrievedAt: "2026-11-09T01:00:00.000Z",
            sourceRevisionId: "rev-0001",
            method: "design-source-adapter",
          },
        ],
      },
    ],
    diagnostics: [],
  });
}

function nodeIrPayload(): string {
  return JSON.stringify({
    schemaVersion: 1,
    profileId: "demo-fashion-storefront",
    generatedAt: "2026-11-09T01:00:00.000Z",
    source: { sourceId: "demo-source", revisionId: "rev-0001", accessedAt: "2026-11-09T01:00:00.000Z" },
    rootNodeId: "n-aaaaaaaaaaaa",
    nodes: [
      {
        nodeId: "n-aaaaaaaaaaaa",
        kind: "text",
        name: "Heading — Materials",
        childrenNodeIds: ["n-bbbbbbbbbbbb"],
        parentNodeId: null,
        layout: { direction: "column", positioning: "static", constraints: [], relativeSizes: [], overflow: "visible" },
        sourceEvidence: [
          {
            evidenceId: "e-aaaaaaaaaaaa",
            kind: "document",
            locator: "design://demo-source/100:3",
            retrievedAt: "2026-11-09T01:00:00.000Z",
            sourceRevisionId: "rev-0001",
            method: "design-source-adapter",
          },
        ],
      },
      {
        nodeId: "n-bbbbbbbbbbbb",
        kind: "media",
        name: "DECOR/Mist",
        childrenNodeIds: [],
        parentNodeId: "n-aaaaaaaaaaaa",
        layout: { direction: "unknown", positioning: "absolute", constraints: [], relativeSizes: [], overflow: "unknown" },
        sourceEvidence: [
          {
            evidenceId: "e-bbbbbbbbbbbb",
            kind: "document",
            locator: "design://demo-source/100:7",
            retrievedAt: "2026-11-09T01:00:00.000Z",
            sourceRevisionId: "rev-0001",
            method: "design-source-adapter",
          },
        ],
      },
    ],
    diagnostics: [],
  });
}

/* ------------------------------------------------------------------ */
/* Harness                                                            */
/* ------------------------------------------------------------------ */

const createdRoots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "det-studio-runs-"));
  createdRoots.push(root);
  return root;
}

async function writeRun(root: string, runId: string, files: Record<string, string>): Promise<string> {
  const runDir = path.join(root, runId);
  await mkdir(runDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(runDir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return runDir;
}

function happyFiles(): Record<string, string> {
  return {
    "tool-run.json": toolRunPayload(),
    "compose-report.json": composePayload(),
    "source-review.json": sourceReviewPayload(),
    "page-structure.json": pageStructurePayload(),
    "node-ir.json": nodeIrPayload(),
    "registry.json": JSON.stringify({ schemaVersion: 1 }),
  };
}

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

afterEach(async () => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("DirectoryDetRunReader — assembly", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeRoot();
    await writeRun(root, "run-001", happyFiles());
  });

  it("lists the run dir as a live summary (newest first, counts from tool-run)", async () => {
    await writeRun(root, "run-000", {
      "tool-run.json": toolRunPayload({ generatedAt: "2026-11-09T00:00:00.000Z", counts: undefined }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const runs = await reader.listRuns();
    expect(runs.map((run) => run.runId)).toEqual(["run-001", "run-000"]);
    expect(runs[0]).toMatchObject({
      runId: "run-001",
      mode: "live",
      label: "run-001 · det compose · profile demo-fashion-storefront",
      generatedAt: "2026-11-09T01:00:00.000Z",
      sourceId: null,
      revisionId: null,
      counts: { errors: 0, warnings: 1, infos: 1 },
    });
  });

  it("silently skips dirs with invalid names, non-dirs and dirs without parseable tool-run.json", async () => {
    await writeFile(path.join(root, "notes.txt"), "not a run", "utf8");
    await mkdir(path.join(root, ".hidden"));
    await mkdir(path.join(root, "bad name"));
    await mkdir(path.join(root, "no-manifest"));
    await writeFile(path.join(root, "no-manifest", "compose-output.json"), "{}", "utf8");
    await mkdir(path.join(root, "corrupt-manifest"));
    await writeFile(path.join(root, "corrupt-manifest", "tool-run.json"), "{not json", "utf8");

    const reader = await DirectoryDetRunReader.open(root);
    const runs = await reader.listRuns();
    expect(runs.map((run) => run.runId)).toEqual(["run-001"]);
  });

  it("assembles the joined StudioRunView with derived needsReview and preview unavailable", async () => {
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-001");

    expect(run.mode).toBe("live");
    expect(run.runId).toBe("run-001");
    expect(run.label).toBe("run-001 · det compose · profile demo-fashion-storefront");
    expect(run.toolCommand).toBe("det compose");
    expect(run.exitCode).toBe(0);
    expect(run.profileId).toBe("demo-fashion-storefront");
    expect(run.platformId).toBe("magento-pagebuilder");
    expect(run.source).toEqual({
      sourceId: "demo-source",
      revisionId: "rev-0001",
      accessedAt: "2026-11-09T01:00:00.000Z",
    });

    // sections: elementCount + sourceLocators from page-structure
    expect(run.sections).toHaveLength(1);
    expect(run.sections[0]).toMatchObject({
      sectionId: "s-cccccccccccc",
      order: 0,
      name: "SECTION/Hero",
      role: "hero",
      elementCount: 2,
      sourceLocators: ["design://demo-source/100:2"],
    });

    // mappings: joins with source-review + node-ir
    expect(run.mappings).toHaveLength(2);
    const [mappedRow, gapRow] = run.mappings;
    expect(mappedRow).toMatchObject({
      nodeId: "n-aaaaaaaaaaaa",
      sourceName: "Heading — Materials",
      sourceLocator: "design://demo-source/100:3",
      composeDisposition: "mapped",
      reviewDisposition: "MAPPED",
      kind: "text",
      semanticClass: "EDITORIAL_SECTION",
      sectionId: "s-cccccccccccc",
      needsReview: false,
    });
    expect(mappedRow.target).toEqual({
      capabilityId: "magento_pagebuilder/heading",
      appearanceId: "default",
      nativeElement: "heading",
      nativeField: "content",
    });
    expect(gapRow).toMatchObject({
      nodeId: "n-bbbbbbbbbbbb",
      composeDisposition: "gap",
      reviewDisposition: "NEEDS_REVIEW",
      kind: "media",
      semanticClass: "PRESENTATIONAL",
      target: null,
      needsReview: true, // DERIVED only from reviewDisposition
    });
    // reasons: review reason first, then the node's gap diagnostics
    expect(gapRow.reasons).toEqual([
      "Ambiguous decoration — a human mapping decision is required.",
      "Compose gap diagnostic for DECOR/Mist — recorded, never silently dropped.",
    ]);

    // diagnostics merged: run → compose → review
    expect(run.diagnostics.map((diagnostic) => diagnostic.origin)).toEqual(["run", "compose", "review"]);

    // counts: verbatim from tool-run.counts
    expect(run.counts).toEqual({ errors: 0, warnings: 1, infos: 1 });

    // artifacts: manifest entries with derived downloadability
    const byId = new Map(run.artifacts.map((artifact) => [artifact.artifactId, artifact]));
    expect(byId.get("node-ir/node-ir.json")?.downloadable).toBe(true);
    expect(byId.get("compose-report/compose-report.json")?.downloadable).toBe(true);
    expect(byId.get("registry/registry.json")?.downloadable).toBe(true);
    expect(byId.get("registry/registry.json")?.file).toBe("registry.json");

    // preview: ALWAYS unavailable, with an honest reason
    expect(run.preview).toMatchObject({ status: "unavailable" });
    expect((run.preview as { reason: string }).reason.length).toBeGreaterThan(10);
  });

  it("derives downloadability honestly for missing files and file-less entries", async () => {
    await writeRun(root, "run-manifest", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "validate",
        exitCode: 0,
        generatedAt: "2026-11-09T02:00:00.000Z",
        artifacts: [
          { role: "node-ir", file: "node-ir.json", schemaRef: "https://example.invalid/n.schema.json" },
          { role: "binding-map", schemaRef: "https://example.invalid/b.schema.json" }, // no file
        ],
        runDiagnostics: [],
      }),
      "node-ir.json": nodeIrPayload(),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-manifest");
    const byId = new Map(run.artifacts.map((artifact) => [artifact.artifactId, artifact]));
    expect(byId.get("node-ir/node-ir.json")?.downloadable).toBe(true);
    expect(byId.has("binding-map")).toBe(true);
    expect(byId.get("binding-map")?.downloadable).toBe(false); // manifest entry without a file
    expect(byId.get("binding-map")?.file).toBeUndefined();

    const download = await reader.readArtifact("run-manifest", "node-ir/node-ir.json");
    expect(download.fileName).toBe("node-ir.json");
    expect(download.contentType).toBe("application/json");
    await expectReaderError(reader.readArtifact("run-manifest", "binding-map"), "artifact-not-downloadable");
  });

  it("computes counts from merged diagnostics when tool-run has none (null when nothing known)", async () => {
    await writeRun(root, "run-counts", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "inspect",
        exitCode: 0,
        generatedAt: "2026-11-09T03:00:00.000Z",
        runDiagnostics: [
          { code: "INPUT_UNREADABLE", severity: "error", message: "One error." },
          { code: "INPUT_INVALID_JSON", severity: "warning", message: "One warning." },
        ],
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-counts");
    expect(run.counts).toEqual({ errors: 1, warnings: 1, infos: 0 });

    await writeRun(root, "run-counts-empty", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "inspect",
        exitCode: 0,
        generatedAt: "2026-11-09T03:00:00.000Z",
        runDiagnostics: [],
      }),
    });
    const empty = await reader.getRun("run-counts-empty");
    expect(empty.counts).toEqual({ errors: null, warnings: null, infos: null });
  });

  it("enforces the frozen invariants: mapped without target → invalid-payload", async () => {
    await writeRun(root, "run-bad-invariant", {
      "tool-run.json": toolRunPayload(),
      "compose-report.json": composePayload([], {
        mapping: [
          {
            sourceNodeId: "n-aaaaaaaaaaaa",
            disposition: "mapped", // engine rule: mapped requires a target
          },
        ],
        diagnostics: [],
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    await expectReaderError(reader.getRun("run-bad-invariant"), "invalid-payload");
  });
});

describe("DirectoryDetRunReader — failures and security", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeRoot();
    await writeRun(root, "run-001", happyFiles());
  });

  it("missing tool-run.json → run-not-found", async () => {
    await mkdir(path.join(root, "empty-run"));
    const reader = await DirectoryDetRunReader.open(root);
    const error = await expectReaderError(reader.getRun("empty-run"), "run-not-found");
    expect(error.message).not.toContain(root);
  });

  it("invalid JSON payload → invalid-payload (message carries no server path)", async () => {
    await writeRun(root, "run-corrupt", {
      "tool-run.json": toolRunPayload(),
      "compose-report.json": "{oops",
    });
    const reader = await DirectoryDetRunReader.open(root);
    const error = await expectReaderError(reader.getRun("run-corrupt"), "invalid-payload");
    expect(error.message).not.toContain(root);
    expect(error.details).toContain("compose-report.json");
  });

  it.each(["../evil", "a/b", "a\\b", ".hidden", "", "sp ace"])("runId %j → run-not-found (never content)", async (runId) => {
    const reader = await DirectoryDetRunReader.open(root);
    await expectReaderError(reader.getRun(runId), "run-not-found");
    await expectReaderError(reader.readArtifact(runId, "node-ir.json"), "run-not-found");
  });

  it("unknown run id → run-not-found", async () => {
    const reader = await DirectoryDetRunReader.open(root);
    await expectReaderError(reader.getRun("ghost-run"), "run-not-found");
  });

  it("unknown artifactId → artifact-not-found", async () => {
    const reader = await DirectoryDetRunReader.open(root);
    await expectReaderError(reader.readArtifact("run-001", "node-ir/totally-absent.json"), "artifact-not-found");
    await expectReaderError(reader.readArtifact("run-001", "made-up-id"), "artifact-not-found");
  });

  it("manifest file with parent traversal → downloadable false + path-refused on read", async () => {
    const secret = path.join(root, "secret.txt");
    await writeFile(secret, "TOP SECRET", "utf8");
    await writeRun(root, "run-escape", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "compose",
        exitCode: 0,
        generatedAt: "2026-11-09T04:00:00.000Z",
        artifacts: [{ role: "escape", file: "../secret.txt", schemaRef: "https://example.invalid/e.schema.json" }],
        runDiagnostics: [],
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-escape");
    expect(run.artifacts[0].downloadable).toBe(false);
    // exact manifest id matches, but the declared file string is refused
    const error = await expectReaderError(
      reader.readArtifact("run-escape", "escape/../secret.txt"),
      "path-refused"
    );
    expect(error.message).not.toContain("TOP SECRET");
    expect(error.message).not.toContain(root);
    // an encoded variant never matches any manifest id
    await expectReaderError(reader.readArtifact("run-escape", "escape%2F..%2Fsecret.txt"), "artifact-not-found");
  });

  it("absolute manifest file path → downloadable false + path-refused", async () => {
    await writeRun(root, "run-abs", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "compose",
        exitCode: 0,
        generatedAt: "2026-11-09T04:00:00.000Z",
        artifacts: [{ role: "abs", file: "/etc/passwd", schemaRef: "https://example.invalid/a.schema.json" }],
        runDiagnostics: [],
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-abs");
    expect(run.artifacts[0].downloadable).toBe(false);
    // manifest id is `abs//etc/passwd` (role + "/" + "/etc/passwd"); the
    // absolute file string is refused before any filesystem access
    await expectReaderError(reader.readArtifact("run-abs", "abs//etc/passwd"), "path-refused");
  });

  it("symlink inside the run dir pointing outside → path-refused, no content leak", async () => {
    const outside = path.join(root, "outside-secret.json");
    await writeFile(outside, '{"secret":"TOP SECRET"}', "utf8");
    const runDir = await writeRun(root, "run-symlink", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "compose",
        exitCode: 0,
        generatedAt: "2026-11-09T05:00:00.000Z",
        artifacts: [{ role: "leak", file: "leak.json", schemaRef: "https://example.invalid/l.schema.json" }],
        runDiagnostics: [],
      }),
    });
    await symlink(outside, path.join(runDir, "leak.json"));

    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-symlink");
    expect(run.artifacts[0].downloadable).toBe(false);
    const error = await expectReaderError(reader.readArtifact("run-symlink", "leak/leak.json"), "path-refused");
    expect(error.message).not.toContain("TOP SECRET");
    expect(JSON.stringify(error)).not.toContain(root);
  });

  it("non-allowlisted extension → artifact-not-downloadable", async () => {
    await writeRun(root, "run-ext", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "compose",
        exitCode: 0,
        generatedAt: "2026-11-09T06:00:00.000Z",
        artifacts: [{ role: "binary", file: "blob.exe", schemaRef: "https://example.invalid/x.schema.json" }],
        runDiagnostics: [],
      }),
      "blob.exe": "MZ...",
    });
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-ext");
    expect(run.artifacts[0].downloadable).toBe(false);
    await expectReaderError(reader.readArtifact("run-ext", "binary/blob.exe"), "artifact-not-downloadable");
  });

  it("file over the 8 MiB cap → downloadable false + path-refused", async () => {
    await writeRun(root, "run-big", {
      "tool-run.json": JSON.stringify({
        schemaVersion: 1,
        tool: { name: "det" },
        command: "compose",
        exitCode: 0,
        generatedAt: "2026-11-09T07:00:00.000Z",
        artifacts: [{ role: "big", file: "big.css", schemaRef: "https://example.invalid/big.schema.json" }],
        runDiagnostics: [],
      }),
    });
    await writeFile(
      path.join(root, "run-big", "big.css"),
      Buffer.alloc(8 * 1024 * 1024 + 1, 0x61)
    );
    const reader = await DirectoryDetRunReader.open(root);
    const run = await reader.getRun("run-big");
    expect(run.artifacts[0].downloadable).toBe(false);
    await expectReaderError(reader.readArtifact("run-big", "big/big.css"), "path-refused");
  });

  it("reads a real declared artifact with attachment metadata", async () => {
    const reader = await DirectoryDetRunReader.open(root);
    const download = await reader.readArtifact("run-001", "registry/registry.json");
    expect(download.artifactId).toBe("registry/registry.json");
    expect(download.fileName).toBe("registry.json");
    expect(download.contentType).toBe("application/json");
    expect(new TextDecoder().decode(download.bytes)).toContain("schemaVersion");
  });
});

/**
 * Coordinator correction C1: interop against REAL `det compose` / `det extract`
 * output, checked in byte-for-byte under `__fixtures__/real-det-runs/` (the
 * compose run carries `compose-report.json` under manifest role
 * `compose-report`; the extract run carries the tree artifacts). The invented
 * name `compose-output.json` never existed on disk and is never read.
 */
describe("DirectoryDetRunReader — real det CLI output interop", () => {
  const realRunsRoot = path.resolve(process.cwd(), "src/modules/studio/server/__fixtures__/real-det-runs");

  it("assembles a REAL `det compose` run: 12 mappings, compose diagnostics, downloadable report", async () => {
    const reader = await DirectoryDetRunReader.open(realRunsRoot);
    const summaries = await reader.listRuns();
    expect(summaries.map((summary) => summary.runId).sort()).toEqual(["compose-run", "extract-run"]);

    const run = await reader.getRun("compose-run");
    expect(run.mode).toBe("live");
    expect(run.mappings).toHaveLength(12);
    const dispositions = new Map(
      ["mapped", "gap", "excluded"].map((d) => [d, run.mappings.filter((m) => m.composeDisposition === d).length])
    );
    expect(dispositions.get("mapped")).toBe(8);
    expect(dispositions.get("gap")).toBe(2);
    expect(dispositions.get("excluded")).toBe(2);
    expect(run.diagnostics.filter((d) => d.origin === "compose")).toHaveLength(2);
    expect(run.counts).toEqual({ errors: 0, warnings: 2, infos: 0 });
    expect(run.source).toEqual({
      sourceId: "g3-hero-fixture-source",
      revisionId: "mcp-observed-unpinned-2026-11-06",
      accessedAt: expect.any(String),
    });
    const byId = new Map(run.artifacts.map((a) => [a.artifactId, a]));
    expect(byId.get("compose-report/compose-report.json")?.downloadable).toBe(true);
    expect(byId.get("adapter-descriptor")?.downloadable).toBe(false);
    expect(run.preview.status).toBe("unavailable");

    const download = await reader.readArtifact("compose-run", "compose-report/compose-report.json");
    expect(download.fileName).toBe("compose-report.json");
    expect(download.bytes.byteLength).toBeGreaterThan(0);
  });

  it("assembles a REAL `det extract` run as a truthful partial: tree present, zero mappings", async () => {
    const reader = await DirectoryDetRunReader.open(realRunsRoot);
    const run = await reader.getRun("extract-run");
    expect(run.mode).toBe("live");
    expect(run.sections).toHaveLength(1);
    expect(run.sections[0]?.elementCount).toBe(2);
    expect(run.mappings).toHaveLength(0);
    expect(run.source?.sourceId).toBe("g3-hero-fixture-source");
    expect(run.counts).toEqual({ errors: 0, warnings: 1, infos: 0 });
    expect(run.preview.status).toBe("unavailable");
  });

  it("refuses to join artifacts from MIXED design source revisions (correction C2)", async () => {
    const root = await makeRoot();
    await writeRun(root, "mixed-run", {
      ...happyFiles(),
      "compose-report.json": composePayload([], {
        source: { sourceId: "demo-source", revisionId: "rev-OTHER", accessedAt: "2026-11-09T01:00:00.000Z" },
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const error = await expectReaderError(reader.getRun("mixed-run"), "invalid-payload");
    expect(error.message).toContain("mixed design source revisions");
    expect(error.message).toContain("rev-OTHER");
  });

  it("refuses a partially declared source identity (no revisionId) instead of guessing", async () => {
    const root = await makeRoot();
    await writeRun(root, "partial-identity", {
      ...happyFiles(),
      "compose-report.json": composePayload([], {
        source: { sourceId: "demo-source", accessedAt: "2026-11-09T01:00:00.000Z" },
      }),
    });
    const reader = await DirectoryDetRunReader.open(root);
    const error = await expectReaderError(reader.getRun("partial-identity"), "invalid-payload");
    expect(error.message).toContain("source identity incomplete");
  });
});
