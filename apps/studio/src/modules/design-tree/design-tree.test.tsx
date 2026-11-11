import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEMO_RUN_FIXTURE } from "@/src/shared/fixtures/demo-run";
import {
  StudioRunViewSchema,
  type StudioRunView,
} from "@/src/shared/contracts";
import { DesignTree } from "./components/design-tree";

afterEach(cleanup);

/** Tiny typed EMPTY run (no sections, no mappings, no diagnostics). */
const EMPTY_RUN: StudioRunView = StudioRunViewSchema.parse({
  runId: "empty-run-design-tree-test",
  mode: "fixture",
  label: "DEMO — empty run for design-tree tests",
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

describe("DesignTree — DEMO fixture", () => {
  it("renders all 4 sections in engine order with correct element counts", () => {
    render(<DesignTree run={DEMO_RUN_FIXTURE} />);

    const cards = screen.getAllByTestId("design-tree-section");
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.dataset.sectionId)).toEqual([
      "s-0a1b2c3d4e5f",
      "s-1b2c3d4e5f6a",
      "s-2c3d4e5f6a7b",
      "s-3d4e5f6a7b8c",
    ]);
    expect(cards.map((card) => card.dataset.order)).toEqual(["0", "1", "2", "3"]);

    const names = cards.map((card) => card.querySelector("h3")?.textContent);
    expect(names).toEqual([
      "Hero — Quiet Grandeur",
      "Craftsmanship — Two Columns",
      "Editorial — Materials Story",
      "Journal Strip",
    ]);

    const counts = screen.getAllByTestId("design-tree-element-count");
    expect(counts.map((node) => node.textContent)).toEqual([
      "3 phần tử",
      "5 phần tử",
      "2 phần tử",
      "0 phần tử",
    ]);
  });

  it("marks the zero-element section with an explicit PARTIAL marker", () => {
    render(<DesignTree run={DEMO_RUN_FIXTURE} />);

    const partials = screen.getAllByTestId("design-tree-partial");
    expect(partials).toHaveLength(1);
    const journalCard = screen
      .getAllByTestId("design-tree-section")
      .find((card) => card.dataset.sectionId === "s-3d4e5f6a7b8c");
    expect(journalCard).toBeDefined();
    expect(partials[0]).toHaveTextContent("PARTIAL");
    expect(partials[0]).toHaveTextContent("không có phần tử nào được ghép");
    expect(journalCard).toContainElement(partials[0]);
  });

  it("groups node rows by mapping.sectionId and keeps every row visible", () => {
    render(<DesignTree run={DEMO_RUN_FIXTURE} />);

    // All 18 mappings survive rendering: 17 under sections + 1 unassigned.
    expect(screen.getAllByTestId("design-tree-node")).toHaveLength(18);

    const heroNodes = screen.getByTestId(
      "design-tree-section-nodes-s-0a1b2c3d4e5f"
    );
    // 6 of the 7 hero-area nodes carry this sectionId; SCROLL and SITE/Footer
    // have no sectionId and land in the explicit unassigned group.
    expect(within(heroNodes).getAllByTestId("design-tree-node")).toHaveLength(6);

    const unassigned = screen.getByTestId("design-tree-unassigned");
    expect(unassigned).toHaveTextContent("Chưa gán vào mục nào");
    // Nodes without a sectionId — SCROLL and SITE/Footer — stay visible here.
    expect(unassigned).toHaveTextContent("n-5e6f7a8b9c0d");
    expect(unassigned).toHaveTextContent("n-7a8b9c0d1e2f");
  });

  it("renders node ids verbatim and every canonical compose disposition", () => {
    render(<DesignTree run={DEMO_RUN_FIXTURE} />);

    expect(screen.getByText("n-0f1e2d3c4b5a")).toBeInTheDocument();
    expect(screen.getByText("s-0a1b2c3d4e5f")).toBeInTheDocument();

    for (const disposition of [
      "mapped",
      "gap",
      "decoration-merged",
      "excluded",
      "skipped",
    ] as const) {
      expect(
        screen.getAllByText(disposition).length
      ).toBeGreaterThan(0);
    }
  });
});

describe("DesignTree — empty run", () => {
  it("renders a truthful EMPTY state, not a fabricated tree", () => {
    render(<DesignTree run={EMPTY_RUN} />);

    expect(screen.getByTestId("design-tree-empty")).toHaveTextContent(
      "Chưa trích xuất được mục nào"
    );
    expect(screen.queryByTestId("design-tree-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("design-tree-partial")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("design-tree-unassigned")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("design-tree-node")).not.toBeInTheDocument();
  });
});
