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
