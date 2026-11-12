import { describe, expect, it } from "vitest";
import { DEMO_RUN_FIXTURE } from "../fixtures/demo-run";
import {
  assertStudioRunViewInvariants,
  STUDIO_COMPOSE_DISPOSITIONS,
  StudioRunViewSchema,
  type StudioRunView,
} from "./studio-run-view";

describe("StudioRunView contract", () => {
  it("validates and passes invariants for the DEMO fixture", () => {
    expect(() => StudioRunViewSchema.parse(DEMO_RUN_FIXTURE)).not.toThrow();
    expect(() => assertStudioRunViewInvariants(DEMO_RUN_FIXTURE)).not.toThrow();
  });

  it("keeps canonical compose dispositions exact (engine vocabulary, not UI invention)", () => {
    expect([...STUDIO_COMPOSE_DISPOSITIONS]).toEqual([
      "mapped",
      "gap",
      "decoration-merged",
      "excluded",
      "skipped",
    ]);
  });

  it("rejects NEEDS_REVIEW as a persisted compose disposition", () => {
    const bad = {
      ...DEMO_RUN_FIXTURE,
      mappings: [
        { ...DEMO_RUN_FIXTURE.mappings[0], composeDisposition: "needs-review" },
      ],
    };
    expect(() => StudioRunViewSchema.parse(bad)).toThrow();
  });

  it("rejects a mapped mapping without a target", () => {
    const bad = {
      ...DEMO_RUN_FIXTURE,
      mappings: [{ ...DEMO_RUN_FIXTURE.mappings[0], target: null }],
    };
    expect(() => assertStudioRunViewInvariants(bad)).toThrow(/without a target/);
  });

  it("rejects needsReview without a NEEDS_REVIEW review disposition", () => {
    const bad = {
      ...DEMO_RUN_FIXTURE,
      mappings: [{ ...DEMO_RUN_FIXTURE.mappings[0], needsReview: true }],
    };
    expect(() => assertStudioRunViewInvariants(bad)).toThrow(/needsReview/);
  });

  it("rejects an unverified available preview", () => {
    const bad = {
      ...DEMO_RUN_FIXTURE,
      preview: { status: "available", verified: false, url: "http://localhost", label: "x" },
      // Deliberately malformed input — verified:false must never type-check as a real run.
    } as unknown as StudioRunView;
    expect(() => assertStudioRunViewInvariants(bad)).toThrow(/verified/);
  });
});

describe("[40] additive optional build block", () => {
  it("keeps legacy runs parseable unchanged (no build block required)", () => {
    const parsed = StudioRunViewSchema.parse(DEMO_RUN_FIXTURE);
    expect(parsed.build).toBeUndefined();
  });

  it("accepts a valid build block on an otherwise legacy run", () => {
    const withBuild = {
      ...DEMO_RUN_FIXTURE,
      build: {
        manifestVerified: true,
        configContentHash: "sha256:" + "a".repeat(64),
        stages: [
          { stage: "capability-probe", status: "completed", exitCode: 0, outDir: "01-capability-probe" },
          { stage: "extraction", status: "completed", exitCode: 0, outDir: "02-extraction" },
          { stage: "composition", status: "completed", exitCode: 0, outDir: "03-composition" },
        ],
        gaps: [{ code: "PREVIEW_INSTALL_OPERATOR_GATED", message: "operator gated" }],
      },
    };
    expect(() => StudioRunViewSchema.parse(withBuild)).not.toThrow();
  });

  it("rejects unknown build stages, statuses and out-of-range exit codes", () => {
    const base = {
      manifestVerified: true,
      configContentHash: "sha256:" + "a".repeat(64),
      stages: [],
      gaps: [],
    };
    expect(() =>
      StudioRunViewSchema.parse({
        ...DEMO_RUN_FIXTURE,
        build: { ...base, stages: [{ stage: "deploy", status: "completed", exitCode: 0 }] },
      })
    ).toThrow();
    expect(() =>
      StudioRunViewSchema.parse({
        ...DEMO_RUN_FIXTURE,
        build: { ...base, stages: [{ stage: "extraction", status: "maybe", exitCode: 0 }] },
      })
    ).toThrow();
    expect(() =>
      StudioRunViewSchema.parse({
        ...DEMO_RUN_FIXTURE,
        build: { ...base, stages: [{ stage: "extraction", status: "failed", exitCode: 9 }] },
      })
    ).toThrow();
  });

  it("accepts an artifact row carrying the [40] per-FILE-BYTE sha256 field", () => {
    const artifact = {
      artifactId: "03-composition/native-content.html",
      role: "native-content",
      file: "03-composition/native-content.html",
      schemaRef: "resources/schemas/cli/compose-output.schema.json#native-content",
      sha256: "b".repeat(64),
      downloadable: true,
    };
    const parsed = StudioRunViewSchema.parse({ ...DEMO_RUN_FIXTURE, artifacts: [artifact] });
    expect(parsed.artifacts[0].sha256).toBe("b".repeat(64));
  });
});

describe("DEMO fixture honesty", () => {
  it("is visibly a fixture with no downloadable artifacts and no invented preview", () => {
    expect(DEMO_RUN_FIXTURE.mode).toBe("fixture");
    expect(DEMO_RUN_FIXTURE.label).toMatch(/DEMO/);
    expect(DEMO_RUN_FIXTURE.preview.status).toBe("unavailable");
    expect(DEMO_RUN_FIXTURE.artifacts.every((a) => a.downloadable === false)).toBe(true);
    expect(DEMO_RUN_FIXTURE.artifacts.every((a) => !a.file?.startsWith("/"))).toBe(true);
  });

  it("exercises every canonical disposition and the derived review flag", () => {
    const dispositions = new Set(DEMO_RUN_FIXTURE.mappings.map((m) => m.composeDisposition));
    expect([...dispositions].sort()).toEqual(
      ["decoration-merged", "excluded", "gap", "mapped", "skipped"].sort()
    );
    const reviewRows = DEMO_RUN_FIXTURE.mappings.filter((m) => m.needsReview);
    expect(reviewRows.length).toBeGreaterThan(0);
    expect(reviewRows.every((m) => m.reviewDisposition === "NEEDS_REVIEW")).toBe(true);
  });

  it("keeps diagnostics counts consistent with the diagnostics array", () => {
    const { counts } = DEMO_RUN_FIXTURE;
    expect(counts.errors).toBe(
      DEMO_RUN_FIXTURE.diagnostics.filter((d) => d.severity === "error").length
    );
    expect(counts.warnings).toBe(
      DEMO_RUN_FIXTURE.diagnostics.filter((d) => d.severity === "warning").length
    );
    expect(counts.infos).toBe(
      DEMO_RUN_FIXTURE.diagnostics.filter((d) => d.severity === "info").length
    );
  });
});
