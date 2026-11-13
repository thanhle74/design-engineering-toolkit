// [72] card-grid.ts unit contract — peer repeated card groups (collection tiles). Fixtures are
// synthesized from the VERIFIED declaration shapes (row>column-group>column-line>column) and the
// observed tile structure (media + display heading + card copy; slot-frame groups) — no machine
// paths, no section-name branching.
import { describe, expect, it } from "vitest";
import type { NodeIRNode } from "../../../../../core/types.js";
import { cardGridHandler } from "../card-grid.js";
import {
   buttonsElementHtml,
   imageElementHtml,
   pbStyleKey,
   textElementHtml,
} from "../../elements.js";
import {
   headingElementHtml,
   columnCloseHtml,
   columnGroupCloseHtml,
   columnGroupOpenHtml,
   columnLineCloseHtml,
   columnLineFlexRule,
   columnLineOpenHtml,
   columnOpenHtml,
   columnWidthRule,
   rowContainedCloseHtml,
   rowContainedOpenHtml,
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   styleBlockHtml,
} from "../../elements-editorial.js";
import {
   fixtureNode,
   fixtureSection,
   makeCtx,
} from "./handler-test-support.js";

const SECTION_ID = "section-node";

// A tile group + its content children, optionally carrying a fixed-width constraint.
function tileNodes(
   id: string,
   spec: { media?: boolean; texts: { id: string; name: string }[] },
   width?: string,
): NodeIRNode[] {
   const childIds = [
      ...(spec.media ? [`${id}-m`] : []),
      ...spec.texts.map((t) => t.id),
   ];
   const group = fixtureNode(id, "container", `Tile/${id}`, {
      childrenNodeIds: childIds,
      ...(width
         ? {
              layout: {
                 direction: "column",
                 positioning: "static",
                 constraints: [{ axis: "width", type: "fixed", value: width }],
                 relativeSizes: [],
                 overflow: "visible",
              },
           }
         : {}),
   });
   const rest: NodeIRNode[] = [];
   if (spec.media) rest.push(fixtureNode(`${id}-m`, "media", `${id} Image`));
   for (const t of spec.texts) rest.push(fixtureNode(t.id, "text", t.name));
   return [group, ...rest];
}

describe("card-grid section-shape handler", () => {
   it("composes 3 peer tiles as row > column-group > ONE column-line > 3 columns in exact bytes", () => {
      const t1 = tileNodes("tile1", {
         media: true,
         texts: [
            { id: "t1", name: "SLOT/Heading" },
            { id: "t1b", name: "SLOT/Body" },
         ],
      });
      const t2 = tileNodes("tile2", {
         media: true,
         texts: [
            { id: "t2", name: "SLOT/Heading" },
            { id: "t2b", name: "SLOT/Body" },
         ],
      });
      const t3 = tileNodes("tile3", {
         media: true,
         texts: [
            { id: "t3", name: "SLOT/Heading" },
            { id: "t3b", name: "SLOT/Body" },
         ],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tile1", "tile2", "tile3"],
      });
      const nodes = [section, ...t1, ...t2, ...t3];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/t1": "Tile One",
            "design://fixture/t1b": "24 pieces",
            "design://fixture/t2": "Tile Two",
            "design://fixture/t2b": "Ceramic",
            "design://fixture/t3": "Tile Three",
            "design://fixture/t3b": "Linen",
         },
         media: {
            "design://fixture/tile1-m": { mediaUrl: "{{media url=tile1.jpg}}" },
            "design://fixture/tile2-m": { mediaUrl: "{{media url=tile2.jpg}}" },
            "design://fixture/tile3-m": { mediaUrl: "{{media url=tile3.jpg}}" },
         },
      });
      const html = cardGridHandler.compose(
         fixtureSection("SECTION/Tiles", [{ axis: "height", value: "300" }]),
         SECTION_ID,
         ctx,
      );
      // Equal apportionment of unconstrained widths: largest remainder over [1,1,1] = [34,33,33].
      const innerKey = pbStyleKey(`${SECTION_ID}:inner`);
      const lineKey = pbStyleKey(`${SECTION_ID}:line-0`);
      const expected =
         styleBlockHtml([
            rowInnerMinHeightRule(innerKey, 300),
            columnLineFlexRule(lineKey),
            columnWidthRule(pbStyleKey("tile1"), 34),
            columnWidthRule(pbStyleKey("tile2"), 33),
            columnWidthRule(pbStyleKey("tile3"), 33),
         ]) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(innerKey) +
         columnGroupOpenHtml() +
         columnLineOpenHtml(lineKey) +
         columnOpenHtml(pbStyleKey("tile1")) +
         imageElementHtml("{{media url=tile1.jpg}}") +
         headingElementHtml(2, "Tile One") +
         textElementHtml([{ role: "body", text: "24 pieces" }]) +
         columnCloseHtml() +
         columnOpenHtml(pbStyleKey("tile2")) +
         imageElementHtml("{{media url=tile2.jpg}}") +
         headingElementHtml(2, "Tile Two") +
         textElementHtml([{ role: "body", text: "Ceramic" }]) +
         columnCloseHtml() +
         columnOpenHtml(pbStyleKey("tile3")) +
         imageElementHtml("{{media url=tile3.jpg}}") +
         headingElementHtml(2, "Tile Three") +
         textElementHtml([{ role: "body", text: "Linen" }]) +
         columnCloseHtml() +
         columnLineCloseHtml() +
         columnGroupCloseHtml() +
         rowContainedCloseHtml();
      expect(html).toBe(expected);
      const dispositions = Object.fromEntries(
         ctx.mapping.map((m) => [m.sourceNodeId, m.disposition]),
      );
      expect(dispositions).toEqual({
         [SECTION_ID]: "mapped",
         tile1: "mapped",
         tile2: "mapped",
         tile3: "mapped",
         "tile1-m": "mapped",
         "tile2-m": "mapped",
         "tile3-m": "mapped",
         t1: "mapped",
         t2: "mapped",
         t3: "mapped",
         t1b: "mapped",
         t2b: "mapped",
         t3b: "mapped",
      });
      expect(
         ctx.mapping.find((m) => m.sourceNodeId === "t1")?.target?.capabilityId,
      ).toBe("magento_pagebuilder/heading");
      expect(
         ctx.mapping.find((m) => m.sourceNodeId === "t1b")?.target
            ?.capabilityId,
      ).toBe("magento_pagebuilder/text");
      // Honest fidelity records: the unconstrained-width fallback + the media aspect limit.
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("no fixed-width constraints"),
         ),
      ).toBe(true);
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("no native aspect/crop field"),
         ),
      ).toBe(true);
      expect(ctx.diagnostics.filter((d) => d.severity === "error").length).toBe(
         0,
      );
   });

   it("apportions observed fixed widths (largest remainder) and skip the equal-fallback warning", () => {
      const ta = tileNodes(
         "tileA",
         {
            media: true,
            texts: [{ id: "ta1", name: "Wide Tile" }],
         },
         "400",
      );
      const tb = tileNodes(
         "tileB",
         {
            media: true,
            texts: [{ id: "tb1", name: "Narrow Tile" }],
         },
         "200",
      );
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ta1": "Wide Tile",
            "design://fixture/tb1": "Narrow Tile",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      const html = cardGridHandler.compose(
         fixtureSection("SECTION/Tiles"), // no fixed height -> no min-height rule
         SECTION_ID,
         ctx,
      );
      const lineKey = pbStyleKey(`${SECTION_ID}:line-0`);
      expect(html).toContain(
         styleBlockHtml([
            columnLineFlexRule(lineKey),
            columnWidthRule(pbStyleKey("tileA"), 67), // 400/600 -> floor 66 + remainder
            columnWidthRule(pbStyleKey("tileB"), 33),
         ]),
      );
      expect(html).toContain(rowInnerOpenHtml(undefined)); // no height -> unkeyed inner
      expect(html).not.toContain(rowInnerMinHeightRule(lineKey, 0));
      expect(
         ctx.diagnostics.some((d) =>
            d.message.includes("no fixed-width constraints"),
         ),
      ).toBe(false);
   });

   it("composes through ONE intermediate container with pure-chrome siblings folded", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "SLOT/Heading" }],
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [{ id: "tb1", name: "SLOT/Heading" }],
      });
      const icon = fixtureNode("ic", "icon", "DECOR/Dot");
      const chromeWrap = fixtureNode("chrome", "container", "ChromeWrap", {
         childrenNodeIds: ["ic"],
      });
      const grid = fixtureNode("grid", "container", "TileSet", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["chrome", "grid"],
      });
      const nodes = [section, chromeWrap, icon, grid, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tb1": "Tile Two",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      const html = cardGridHandler.compose(
         fixtureSection("SECTION/Tiles"),
         SECTION_ID,
         ctx,
      );
      expect(html).not.toBeNull();
      expect(html).toContain('data-content-type="column-line"');
      const dispositions = Object.fromEntries(
         ctx.mapping.map((m) => [m.sourceNodeId, m.disposition]),
      );
      expect(dispositions).toEqual({
         [SECTION_ID]: "mapped",
         grid: "mapped", // card-group container folded into the column-group
         chrome: "mapped", // pure structural chrome folded
         ic: "gap", // decoration record inside the folded chrome
         tileA: "mapped",
         tileB: "mapped",
         "tileA-m": "mapped",
         "tileB-m": "mapped",
         ta1: "mapped",
         tb1: "mapped",
      });
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" && d.message.includes("Decoration"),
         ),
      ).toBe(true);
   });

   it("shape-miss: a content-bearing non-tile child declines the shape silently", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "SLOT/Heading" }],
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [{ id: "tb1", name: "SLOT/Heading" }],
      });
      const tail = fixtureNode("tail", "text", "TrailingNote");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB", "tail"],
      });
      const nodes = [section, ...ta, ...tb, tail];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tb1": "Tile Two",
            "design://fixture/tail": "Shop the full collection",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      expect(
         cardGridHandler.compose(
            fixtureSection("SECTION/Tiles"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("shape-miss: structurally unequal tile sequences decline the shape silently", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "SLOT/Heading" }],
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [
            { id: "tb1", name: "SLOT/Heading" },
            { id: "tb2", name: "SLOT/Body" },
         ],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tb1": "Tile Two",
            "design://fixture/tb2": "Copy",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      expect(
         cardGridHandler.compose(
            fixtureSection("SECTION/Tiles"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("shape-miss: a projected decision role anywhere in the subtree declines silently", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "SLOT/Heading" }],
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [{ id: "tb1", name: "SLOT/Heading" }],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         roles: { "design://fixture/tileB": "grid-column" },
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tb1": "Tile Two",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      expect(
         cardGridHandler.compose(
            fixtureSection("SECTION/Tiles"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("registry absence: a missing column-line cap fires the typed diagnostic and nothing composes", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "SLOT/Heading" }],
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [{ id: "tb1", name: "SLOT/Heading" }],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         deniedCaps: ["magento_pagebuilder/column-line#default"],
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tb1": "Tile Two",
         },
         media: {
            "design://fixture/tileA-m": { mediaUrl: "{{media url=a.jpg}}" },
            "design://fixture/tileB-m": { mediaUrl: "{{media url=b.jpg}}" },
         },
      });
      expect(
         cardGridHandler.compose(
            fixtureSection("SECTION/Tiles"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(
         ctx.diagnostics.some((d) => d.code === "UNSUPPORTED_CAPABILITY"),
      ).toBe(true);
      expect(ctx.mapping).toEqual([]);
   });

   it("honest gaps: media and text without manifest entries compose explicit gaps, never invented content", () => {
      const ta = tileNodes("tileA", {
         media: true,
         texts: [{ id: "ta1", name: "CardLabel" }], // no SLOT role, no manifest
      });
      const tb = tileNodes("tileB", {
         media: true,
         texts: [{ id: "tb1", name: "CardLabel" }],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {}); // empty manifest
      const html = cardGridHandler.compose(
         fixtureSection("SECTION/Tiles"),
         SECTION_ID,
         ctx,
      );
      expect(html).not.toBeNull();
      expect(html).toContain('data-content-type="column-line"');
      expect(html).not.toContain("<img");
      expect(html).not.toContain('data-content-type="text"');
      expect(html).not.toContain('data-content-type="heading"');
      const dispositions = Object.fromEntries(
         ctx.mapping.map((m) => [m.sourceNodeId, m.disposition]),
      );
      expect(dispositions["tileA-m"]).toBe("gap");
      expect(dispositions["ta1"]).toBe("gap");
      expect(dispositions["tileB-m"]).toBe("gap");
      expect(dispositions["tb1"]).toBe("gap");
      expect(
         ctx.diagnostics.filter((d) => d.code === "EVIDENCE_MISSING").length,
      ).toBe(4);
   });

   it("conditional gates: a role-resolved heading requires the heading cap; consecutive CTAs merge into ONE buttons container", () => {
      // Tile A: heading + two CTAs; tile B: heading + two copy texts — identical [text,text,text].
      const ta = tileNodes("tileA", {
         texts: [
            { id: "ta1", name: "SLOT/Heading" },
            { id: "tac1", name: "SLOT/CtaLabel" },
            { id: "tac2", name: "SLOT/CtaLabel" },
         ],
      });
      const tb = tileNodes("tileB", {
         texts: [
            { id: "tb1", name: "SLOT/Heading" },
            { id: "tbb1", name: "SLOT/Body" },
            { id: "tbb2", name: "CardNote" },
         ],
      });
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Tiles", {
         childrenNodeIds: ["tileA", "tileB"],
      });
      const nodes = [section, ...ta, ...tb];
      const ctx = makeCtx(nodes, {
         deniedCaps: ["magento_pagebuilder/heading#default"],
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tac1": "Shop",
            "design://fixture/tac2": "Details",
            "design://fixture/tb1": "Tile Two",
            "design://fixture/tbb1": "Soft weave",
            "design://fixture/tbb2": "Natural dye",
         },
         links: {
            "design://fixture/tac1": { linkUrl: "{{store url='shop'}}" },
            "design://fixture/tac2": { linkUrl: "{{store url='details'}}" },
         },
      });
      // Role-resolved card headings gate the heading cap: denied -> null + typed record.
      expect(
         cardGridHandler.compose(
            fixtureSection("SECTION/Tiles"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(
         ctx.diagnostics.some((d) => d.code === "UNSUPPORTED_CAPABILITY"),
      ).toBe(true);

      // Same tree, heading cap present: consecutive CTAs merge into ONE buttons container.
      const ctx2 = makeCtx(nodes, {
         texts: {
            "design://fixture/ta1": "Tile One",
            "design://fixture/tac1": "Shop",
            "design://fixture/tac2": "Details",
            "design://fixture/tb1": "Tile Two",
            "design://fixture/tbb1": "Soft weave",
            "design://fixture/tbb2": "Natural dye",
         },
         links: {
            "design://fixture/tac1": { linkUrl: "{{store url='shop'}}" },
            "design://fixture/tac2": { linkUrl: "{{store url='details'}}" },
         },
      });
      const html = cardGridHandler.compose(
         fixtureSection("SECTION/Tiles"),
         SECTION_ID,
         ctx2,
      );
      expect(html).not.toBeNull();
      expect(
         (html as string).match(/data-content-type="buttons"/g)?.length,
      ).toBe(1);
      expect(html).toContain(
         buttonsElementHtml("tileA:card-buttons", [
            {
               keySource: "tac1",
               label: "Shop",
               linkUrl: "{{store url='shop'}}",
               variant: undefined,
            },
            {
               keySource: "tac2",
               label: "Details",
               linkUrl: "{{store url='details'}}",
               variant: undefined,
            },
         ]),
      );
      expect(html).toContain(
         textElementHtml([
            { role: "body", text: "Soft weave" },
            { role: "body", text: "Natural dye" },
         ]),
      );
   });
});
