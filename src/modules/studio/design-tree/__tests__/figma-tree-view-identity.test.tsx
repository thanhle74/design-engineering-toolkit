/**
 * [74] FigmaTreeView — tree-key identity regression tests (AG-011 follow-up).
 *
 * The old tree keys were positional per FILTERED group
 * (`${sectionId}::${nodeId}::${idx}`), so a node's key changed whenever the
 * search/disposition filter changed, and the inspector's nodeId-only
 * `mappingMap` fallback could bind to the WRONG occurrence of a duplicated
 * nodeId (AG-009 saw `n-f18f7c3e5cd3` twice in one run). These tests pin:
 *  - duplicate nodeIds render as distinct selectable nodes, and the
 *    inspector shows the EXACT occurrence clicked (locator/target facts);
 *  - selection survives search and disposition filtering — including a
 *    filter that hides the selected node (exact-occurrence fallback, not a
 *    last-write-wins nodeId lookup).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
   StudioMappingView,
   StudioSectionView,
} from "@/src/modules/studio/shared/contracts";
import { FigmaTreeView } from "../components/figma-tree-view";

afterEach(cleanup);

const DUP_NODE = "n-f18f7c3e5cd3";
const SECTION: StudioSectionView = {
   sectionId: "s-0a1b2c3d4e5f",
   order: 0,
   name: "Hero",
   elementCount: 2,
   sourceLocators: ["design://x/1:0"],
};

const MAPPINGS: StudioMappingView[] = [
   {
      nodeId: DUP_NODE,
      sourceName: "Caption",
      sourceLocator: "design://x/10:1",
      composeDisposition: "gap",
      sectionId: SECTION.sectionId,
      note: "gap assessment one",
      reasons: [],
      needsReview: false,
   },
   {
      nodeId: DUP_NODE,
      sourceName: "Caption",
      sourceLocator: "design://x/10:2",
      composeDisposition: "mapped",
      sectionId: SECTION.sectionId,
      target: {
         capabilityId: "magento_pagebuilder/text",
         appearanceId: "default",
      },
      reasons: [],
      needsReview: false,
   },
   {
      nodeId: "n-000000000005",
      sourceName: "Scroll band",
      sourceLocator: "design://x/10:5",
      composeDisposition: "skipped",
      // No sectionId — an unassigned entry (optional in the contract).
      reasons: [],
      needsReview: false,
   },
];

function treeNodesFor(nodeId: string): HTMLElement[] {
   return screen
      .queryAllByText(nodeId)
      .map(
         (el) =>
            el.closest(".ant-tree-treenode") as HTMLElement | null,
      )
      .filter((el): el is HTMLElement => el !== null);
}

function clickOccurrence(nodeId: string, badgeText: string): void {
   const node = treeNodesFor(nodeId).find((el) =>
      within(el).queryByText(badgeText),
   );
   expect(node).toBeDefined();
   fireEvent.click(within(node!).getByText(nodeId));
}

describe("FigmaTreeView — duplicate nodeIds bind the exact occurrence", () => {
   it("renders both occurrences as separate selectable nodes", () => {
      render(
         <FigmaTreeView
            sections={[SECTION]}
            mappings={MAPPINGS}
            unassigned={[MAPPINGS[2]!]}
         />,
      );
      expect(treeNodesFor(DUP_NODE)).toHaveLength(2);
      expect(treeNodesFor("n-000000000005")).toHaveLength(1);
   });

   it("shows the clicked occurrence's facts in the inspector", () => {
      render(
         <FigmaTreeView
            sections={[SECTION]}
            mappings={MAPPINGS}
            unassigned={[MAPPINGS[2]!]}
         />,
      );

      clickOccurrence(DUP_NODE, "gap");
      expect(screen.getByText("design://x/10:1")).toBeInTheDocument();
      expect(screen.getByText("gap assessment one")).toBeInTheDocument();

      clickOccurrence(DUP_NODE, "mapped");
      expect(screen.getByText("design://x/10:2")).toBeInTheDocument();
      expect(
         screen.getByText("magento_pagebuilder/text"),
      ).toBeInTheDocument();
      expect(screen.queryByText("gap assessment one")).toBeNull();
   });
});

describe("FigmaTreeView — selection survives filtering", () => {
   it("keeps the exact selected occurrence when a search hides every node", () => {
      render(
         <FigmaTreeView
            sections={[SECTION]}
            mappings={MAPPINGS}
            unassigned={[MAPPINGS[2]!]}
         />,
      );
      clickOccurrence(DUP_NODE, "gap");
      expect(screen.getByText("design://x/10:1")).toBeInTheDocument();

      // Search that matches nothing: every mapping node leaves the tree
      // (the section group stays, now childless), and the inspector keeps
      // the exact occurrence via the stable-key identity lookup.
      fireEvent.change(
         screen.getByPlaceholderText("Tìm kiếm node Figma (tên, ID, loại)..."),
         { target: { value: "zzz-no-match" } },
      );
      expect(treeNodesFor(DUP_NODE)).toHaveLength(0);
      expect(treeNodesFor("n-000000000005")).toHaveLength(0);
      expect(screen.getByText("design://x/10:1")).toBeInTheDocument();
      expect(screen.getByText("gap assessment one")).toBeInTheDocument();

      // Clearing the search restores the tree with the same node selected.
      fireEvent.change(
         screen.getByPlaceholderText("Tìm kiếm node Figma (tên, ID, loại)..."),
         { target: { value: "" } },
      );
      expect(treeNodesFor(DUP_NODE)).toHaveLength(2);
      expect(screen.getByText("design://x/10:1")).toBeInTheDocument();
   });

   it("keeps selection exact when the disposition filter keeps only one occurrence", () => {
      render(
         <FigmaTreeView
            sections={[SECTION]}
            mappings={MAPPINGS}
            unassigned={[MAPPINGS[2]!]}
         />,
      );
      // Select the mapped occurrence, then filter to gaps: the selected node
      // is hidden, and the inspector must NOT fall back to a wrong
      // same-nodeId occurrence (the old nodeId-only map did).
      clickOccurrence(DUP_NODE, "mapped");
      expect(screen.getByText("design://x/10:2")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Khoảng trống (Gap)"));
      expect(treeNodesFor(DUP_NODE)).toHaveLength(1);
      // The hidden mapped occurrence stays bound — no wrong-occurrence swap.
      expect(screen.getByText("design://x/10:2")).toBeInTheDocument();
      expect(screen.queryByText("design://x/10:1")).toBeNull();
   });
});
