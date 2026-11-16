/**
 * [74] MappingReviewTable — row-identity regression tests (AG-011 follow-up).
 *
 * The old implementation numbered row keys with a post-filter `idx++`, so a
 * row's key changed whenever the search/disposition filter changed (remounts,
 * lost state) and duplicate nodeIds could collide. These tests pin the fixed
 * behavior at the DOM level:
 *  - `data-row-key` of surviving rows is byte-identical across filter and
 *    search changes;
 *  - duplicate-nodeId entries render as distinct rows with distinct keys;
 *  - the drawer inspector shows the EXACT occurrence that was clicked.
 */
import {
   cleanup,
   fireEvent,
   render,
   screen,
   within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import { MappingReviewTable } from "../components/mapping-review-table";

afterEach(cleanup);

const DUP_NODE = "n-f18f7c3e5cd3";

const MAPPINGS: StudioMappingView[] = [
   {
      nodeId: "n-000000000001",
      sourceName: "Heading",
      sourceLocator: "design://x/1:1",
      composeDisposition: "mapped",
      sectionId: "s-0a1b2c3d4e5f",
      target: {
         capabilityId: "magento_pagebuilder/heading",
         appearanceId: "default",
      },
      reasons: [],
      needsReview: false,
   },
   {
      nodeId: DUP_NODE,
      sourceName: "Caption",
      sourceLocator: "design://x/10:1",
      composeDisposition: "gap",
      sectionId: "s-0a1b2c3d4e5f",
      note: "gap assessment one",
      reasons: ["no native equivalent"],
      needsReview: false,
   },
   {
      nodeId: DUP_NODE,
      sourceName: "Caption",
      sourceLocator: "design://x/10:2",
      composeDisposition: "mapped",
      sectionId: "s-0a1b2c3d4e5f",
      target: {
         capabilityId: "magento_pagebuilder/text",
         appearanceId: "default",
      },
      reasons: [],
      needsReview: false,
   },
   {
      nodeId: "n-000000000004",
      sourceName: "Footer",
      sourceLocator: "design://x/1:4",
      composeDisposition: "skipped",
      // No sectionId — an unassigned entry (optional in the contract).
      reasons: [],
      needsReview: false,
   },
];

function rowKeysByNodeId(container: HTMLElement): Map<string, string[]> {
   const map = new Map<string, string[]>();
   for (const row of Array.from(
      container.querySelectorAll<HTMLTableRowElement>(
         '[data-testid="mapping-row"]',
      ),
   )) {
      const nodeId = row.dataset.nodeId ?? "";
      const key = row.getAttribute("data-row-key") ?? "";
      map.set(nodeId, [...(map.get(nodeId) ?? []), key]);
   }
   return map;
}

function renderTable(mappings = MAPPINGS) {
   return render(<MappingReviewTable mappings={mappings} />);
}

describe("MappingReviewTable — stable row keys across filtering", () => {
   it("keeps surviving rows' data-row-key identical when the disposition filter changes", () => {
      const { container } = renderTable();
      const before = rowKeysByNodeId(container);
      expect(before.get(DUP_NODE)).toHaveLength(2);

      // Switch to the "Đã map" segmented filter: only mapped rows survive.
      fireEvent.click(screen.getByText("Đã map (2)"));
      const after = rowKeysByNodeId(container);
      expect(after.get(DUP_NODE)).toHaveLength(1);
      // The mapped duplicate keeps exactly the key it had unfiltered.
      expect(after.get(DUP_NODE)![0]).toBe(before.get(DUP_NODE)![1]);
      // And the other mapped row keeps its key too.
      expect(after.get("n-000000000001")![0]).toBe(
         before.get("n-000000000001")![0],
      );
      // The gap and skipped rows are hidden by the filter, not renumbered.
      expect(after.get("n-000000000004")).toBeUndefined();
   });

   it("keeps surviving rows' data-row-key identical when the search query changes", () => {
      const { container } = renderTable();
      const before = rowKeysByNodeId(container);

      fireEvent.change(
         screen.getByPlaceholderText(
            "Tìm Node ID, tên nguồn, locator, đích...",
         ),
         { target: { value: "Caption" } },
      );
      const after = rowKeysByNodeId(container);
      expect(after.get(DUP_NODE)).toEqual(before.get(DUP_NODE));
      expect(after.get("n-000000000004")).toBeUndefined();
   });

   it("gives duplicate-nodeId rows distinct, fact-based keys", () => {
      const { container } = renderTable();
      const keys = rowKeysByNodeId(container).get(DUP_NODE)!;
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
      // The identity carries the facts, not a filter-relative position.
      expect(keys[0]).toContain("design://x/10:1");
      expect(keys[1]).toContain("design://x/10:2");
   });
});

describe("MappingReviewTable — inspector binds to the clicked occurrence", () => {
   it("shows the exact duplicate-nodeId occurrence that was clicked", () => {
      renderTable();
      const rows = screen
         .getAllByTestId("mapping-row")
         .filter((row) => row.dataset.nodeId === DUP_NODE);
      expect(rows).toHaveLength(2);

      // First occurrence (gap, "gap assessment one").
      fireEvent.click(rows[0]!);
      let drawer = screen.getByRole("dialog");
      expect(
         within(drawer).getByText("gap assessment one"),
      ).toBeInTheDocument();
      expect(within(drawer).getByText("design://x/10:1")).toBeInTheDocument();

      // Second occurrence (mapped, no note) — same drawer, re-bound.
      fireEvent.click(rows[1]!);
      drawer = screen.getByRole("dialog");
      expect(within(drawer).getByText("design://x/10:2")).toBeInTheDocument();
      expect(
         within(drawer).getByText("magento_pagebuilder/text"),
      ).toBeInTheDocument();
      expect(within(drawer).queryByText("gap assessment one")).toBeNull();
   });
});
