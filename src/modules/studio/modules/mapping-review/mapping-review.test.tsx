import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEMO_RUN_FIXTURE } from "@/src/modules/studio/shared/fixtures/demo-run";
import {
  StudioRunViewSchema,
  type StudioRunView,
} from "@/src/modules/studio/shared/contracts";
import { MappingReview } from "./components/mapping-review";

afterEach(cleanup);

/** Tiny typed EMPTY run (no mappings, no diagnostics). */
const EMPTY_RUN: StudioRunView = StudioRunViewSchema.parse({
  runId: "empty-run-mapping-review-test",
  mode: "fixture",
  label: "DEMO — empty run for mapping-review tests",
  generatedAt: null,
  exitCode: null,
  toolCommand: null,
  profileId: null,
  platformId: null,
  source: { sourceId: null, revisionId: null, accessedAt: null },
  counts: { errors: null, warnings: null, infos: null },
  sections: [],
  mappings: [],
  diagnostics: [],
  artifacts: [],
  preview: {
    status: "unavailable",
    reason: "No verified preview exists for this empty test run.",
  },
});

describe("MappingReview — DEMO fixture table", () => {
  it("renders exactly one row per mapping entry", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    const rows = screen.getAllByTestId("mapping-row");
    expect(rows).toHaveLength(DEMO_RUN_FIXTURE.mappings.length);
    expect(rows).toHaveLength(18);
  });

  it("shows all five canonical compose dispositions verbatim", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    for (const disposition of [
      "mapped",
      "gap",
      "decoration-merged",
      "excluded",
      "skipped",
    ] as const) {
      expect(screen.getAllByText(disposition).length).toBeGreaterThan(0);
    }
  });

  it("highlights exactly one DERIVED needsReview row and keeps NEEDS_REVIEW out of the compose column", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    const rows = screen.getAllByTestId("mapping-row");

    const flagged = rows.filter((row) => row.dataset.needsReview === "true");
    expect(flagged).toHaveLength(1);
    expect(flagged[0].dataset.nodeId).toBe("n-7e8f9a0b1c2d");
    expect(within(flagged[0]).getByText("NEEDS_REVIEW")).toBeInTheDocument();

    // Every other row is explicitly unflagged, and none shows NEEDS_REVIEW.
    for (const row of rows) {
      expect(["true", "false"]).toContain(row.dataset.needsReview ?? "");
      if (row !== flagged[0]) {
        expect(within(row).queryByText("NEEDS_REVIEW")).not.toBeInTheDocument();
      }
    }
    // The flagged row's COMPOSE disposition stays the canonical engine value.
    expect(within(flagged[0]).getByText("skipped")).toBeInTheDocument();
  });

  it("renders review disposition badges when the run carries them", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    for (const disposition of [
      "MAPPED",
      "EXCLUDED_WITH_REASON",
      "DECORATION_MERGED",
      "REFERENCE_ONLY",
      "NEEDS_REVIEW",
    ] as const) {
      expect(screen.getAllByText(disposition).length).toBeGreaterThan(0);
    }
  });

  it("renders the mapped target (capability, appearance, native element/field)", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    const ctaRow = screen
      .getAllByTestId("mapping-row")
      .find((row) => row.dataset.nodeId === "n-3c4d5e6f7a8b");
    expect(ctaRow).toBeDefined();
    expect(within(ctaRow!).getByText("magento_pagebuilder/buttons")).toBeInTheDocument();
    expect(within(ctaRow!).getByText("buttons · item_text")).toBeInTheDocument();

    // A mapped row whose target is missing would render "unknown", never 0.
    const heroHeadingRow = screen
      .getAllByTestId("mapping-row")
      .find((row) => row.dataset.nodeId === "n-1a2b3c4d5e6f");
    expect(within(heroHeadingRow!).getByText("magento_pagebuilder/banner")).toBeInTheDocument();
  });

  it("keeps gap/excluded/skipped rows visible with their reasons", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    const overlayRow = screen
      .getAllByTestId("mapping-row")
      .find((row) => row.dataset.nodeId === "n-4d5e6f7a8b9c");
    expect(overlayRow).toBeDefined();
    expect(within(overlayRow!).getByText("gap")).toBeInTheDocument();
    expect(within(overlayRow!).getByText(/no native Page Builder equivalent/)).toBeInTheDocument();
  });
});

describe("MappingReview — diagnostics", () => {
  it("renders every diagnostic with severity and origin", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);
    const rows = screen.getAllByTestId("diagnostic-row");
    expect(rows).toHaveLength(5);

    const severities = rows.map((row) => row.dataset.severity);
    expect(severities.filter((s) => s === "warning")).toHaveLength(3);
    expect(severities.filter((s) => s === "info")).toHaveLength(2);
    expect(severities.filter((s) => s === "error")).toHaveLength(0);

    const origins = rows.map((row) => row.dataset.origin);
    expect(origins.filter((o) => o === "compose")).toHaveLength(3);
    expect(origins.filter((o) => o === "review")).toHaveLength(1);
    expect(origins.filter((o) => o === "run")).toHaveLength(1);

    expect(screen.getAllByText("NOT_VERIFIED")).toHaveLength(2);
    expect(screen.getByText("UNRESOLVED_COMPONENT")).toBeInTheDocument();
    expect(screen.getByText("DEMO_FIXTURE")).toBeInTheDocument();
    expect(screen.getByText("PLAN")).toBeInTheDocument();
  });

  it("reports an honest empty state when a run carries mappings but no diagnostics", () => {
    // Derived from the canonical fixture (same pattern as the contract tests):
    // only the diagnostics slice is emptied — no alternative fixture authored.
    const noDiagnosticsRun: StudioRunView = {
      ...DEMO_RUN_FIXTURE,
      diagnostics: [],
      counts: { errors: 0, warnings: 0, infos: 0 },
    };
    render(<MappingReview run={noDiagnosticsRun} />);
    expect(screen.getByTestId("diagnostics-empty")).toHaveTextContent(
      "Không có chẩn đoán nào được ghi cho lần chạy này."
    );
    expect(screen.getAllByTestId("mapping-row")).toHaveLength(18);
  });
});

describe("MappingReview — provenance", () => {
  it("shows the DEMO badge, revision and truthful counts for the fixture run", () => {
    render(<MappingReview run={DEMO_RUN_FIXTURE} />);

    expect(screen.getByTestId("studio-demo-badge")).toHaveTextContent("DEMO");
    expect(screen.getByTestId("provenance-source")).toHaveTextContent(
      "demo-fixture-source"
    );
    expect(screen.getByTestId("provenance-revision")).toHaveTextContent(
      "demo-fixture-rev-0001"
    );
    expect(screen.getByTestId("provenance-accessed")).toHaveTextContent(
      "2026-11-09T00:00:00.000Z"
    );
    const counts = screen.getByTestId("provenance-counts");
    expect(counts).toHaveTextContent("lỗi: 0");
    expect(counts).toHaveTextContent("cảnh báo: 3");
    expect(counts).toHaveTextContent("thông tin: 2");
    expect(screen.getByTestId("provenance-command")).toHaveTextContent(
      "det compose"
    );
    expect(screen.getByTestId("provenance-generated")).toHaveTextContent(
      "2026-11-09T00:00:00.000Z"
    );
  });
});

describe("MappingReview — empty run", () => {
  it("renders a truthful EMPTY state and keeps provenance visible", () => {
    render(<MappingReview run={EMPTY_RUN} />);

    expect(screen.getByTestId("mapping-review-empty")).toHaveTextContent(
      "Không có node mapping hay chẩn đoán"
    );
    expect(screen.queryByTestId("mapping-row")).not.toBeInTheDocument();

    // Provenance is mandatory even for an empty run.
    expect(screen.getByTestId("provenance-footer")).toBeInTheDocument();
    expect(screen.getByTestId("studio-demo-badge")).toHaveTextContent("DEMO");

    // Unknown facts stay unknown — never rendered as zero.
    expect(screen.getByTestId("provenance-source")).toHaveTextContent("không rõ");
    expect(screen.getByTestId("provenance-revision")).toHaveTextContent("không rõ");
    expect(screen.getByTestId("provenance-counts")).toHaveTextContent(
      "lỗi: không rõ"
    );
    expect(screen.queryByTestId("provenance-command")).not.toBeInTheDocument();
    expect(screen.queryByTestId("provenance-generated")).not.toBeInTheDocument();
  });
});
