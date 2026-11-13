// [72] heading.ts unit contract — the native-heading section-shape handler.
// Fixtures are synthesized from the VERIFIED declaration shapes (no machine paths).
import { describe, expect, it } from "vitest";
import { headingSectionHandler } from "../heading.js";
import { pbStyleKey } from "../../elements.js";
import {
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   rowContainedOpenHtml,
   rowContainedCloseHtml,
   styleBlockHtml,
} from "../../elements-editorial.js";
import {
   fixtureNode,
   fixtureSection,
   makeCtx,
} from "./handler-test-support.js";

const SECTION_ID = "section-node";

function singleHeadingTree(withHeight = true) {
   const heading = fixtureNode("h1", "text", "SLOT/Heading");
   const wrap = fixtureNode("wrap", "container", "SLOT/BandWrap", {
      childrenNodeIds: ["h1"],
   });
   const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
      childrenNodeIds: ["wrap"],
   });
   const nodes = [section, wrap, heading];
   const sec = fixtureSection(
      "SECTION/Only",
      withHeight ? [{ axis: "height", value: "240" }] : [],
   );
   return {
      nodes,
      section: sec,
      heading,
      ctx: makeCtx(nodes, {
         texts: { "design://fixture/h1": "The Quiet Grandeur" },
      }),
   };
}

describe("heading section-shape handler", () => {
   it("composes the verified heading bytes in a contained row with the keyed min-height", () => {
      const { nodes, section, ctx } = singleHeadingTree(true);
      const html = headingSectionHandler.compose(section, SECTION_ID, ctx);
      const innerKey = pbStyleKey(`${SECTION_ID}:inner`);
      const expected =
         styleBlockHtml([rowInnerMinHeightRule(innerKey, 240)]) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(innerKey) +
         '<h2 data-content-type="heading" data-appearance="default" data-element="main">The Quiet Grandeur</h2>' +
         rowContainedCloseHtml();
      expect(html).toBe(expected);
      // Accountability: section mapped (row chain), wrapper folded, heading mapped native.
      const dispositions = Object.fromEntries(
         ctx.mapping.map((m) => [m.sourceNodeId, m.disposition]),
      );
      expect(dispositions).toEqual({
         [SECTION_ID]: "mapped",
         wrap: "mapped",
         h1: "mapped",
      });
      const headingEntry = ctx.mapping.find((m) => m.sourceNodeId === "h1");
      expect(headingEntry?.target?.capabilityId).toBe(
         "magento_pagebuilder/heading",
      );
      expect(headingEntry?.target?.appearanceId).toBe("default");
      expect(ctx.diagnostics.filter((d) => d.severity === "error").length).toBe(
         0,
      );
   });

   it("records the missing height constraint as NOT_VERIFIED and omits the style block", () => {
      const { nodes, section, ctx } = singleHeadingTree(false);
      void nodes;
      const html = headingSectionHandler.compose(section, SECTION_ID, ctx);
      expect(html).toContain('<div data-content-type="row"');
      expect(html).not.toContain("<style>");
      expect(html).toContain(
         '<h2 data-content-type="heading" data-appearance="default" data-element="main">The Quiet Grandeur</h2>',
      );
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("no fixed height constraint"),
         ),
      ).toBe(true);
   });

   it("shape-miss: two role-resolved headings return null with NO diagnostics and NO mapping", () => {
      const h1 = fixtureNode("h1", "text", "SLOT/Heading");
      const h2 = fixtureNode("h2b", "text", "SLOT/Heading");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["h1", "h2b"],
      });
      const nodes = [section, h1, h2];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/h1": "One",
            "design://fixture/h2b": "Two",
         },
      });
      const sec = fixtureSection("SECTION/Only");
      expect(headingSectionHandler.compose(sec, SECTION_ID, ctx)).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("shape-miss: a media node or a second text role disqualifies the shape silently", () => {
      const h1 = fixtureNode("h1", "text", "SLOT/Heading");
      const img = fixtureNode("img1", "media", "HeroImage");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["h1", "img1"],
      });
      const nodes = [section, h1, img];
      const ctx = makeCtx(nodes, {
         texts: { "design://fixture/h1": "One" },
      });
      const sec = fixtureSection("SECTION/Only");
      expect(headingSectionHandler.compose(sec, SECTION_ID, ctx)).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);

      const overline = fixtureNode("ov", "text", "SLOT/Overline");
      const section2 = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["h1", "ov"],
      });
      const nodes2 = [section2, h1, overline];
      const ctx2 = makeCtx(nodes2, {
         texts: {
            "design://fixture/h1": "One",
            "design://fixture/ov": "Eyebrow",
         },
      });
      expect(
         headingSectionHandler.compose(
            fixtureSection("SECTION/Only"),
            SECTION_ID,
            ctx2,
         ),
      ).toBeNull();
      expect(ctx2.diagnostics).toEqual([]);
      expect(ctx2.mapping).toEqual([]);
   });

   it("shape-miss: a projected decision role (grid-column) is declined silently", () => {
      const h1 = fixtureNode("h1", "text", "SLOT/Heading");
      const slot = fixtureNode("slot1", "container", "SLOT/Whatever");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["h1", "slot1"],
      });
      const nodes = [section, h1, slot];
      const ctx = makeCtx(nodes, {
         texts: { "design://fixture/h1": "One" },
         roles: { "design://fixture/slot1": "grid-column" },
      });
      expect(
         headingSectionHandler.compose(
            fixtureSection("SECTION/Only"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("registry absence: the typed UNSUPPORTED_CAPABILITY diagnostic fires and nothing composes", () => {
      const { nodes, section, ctx } = singleHeadingTree(true);
      const denied = makeCtx(nodes, {
         deniedCaps: ["magento_pagebuilder/heading#default"],
         texts: { "design://fixture/h1": "The Quiet Grandeur" },
      });
      expect(
         headingSectionHandler.compose(section, SECTION_ID, denied),
      ).toBeNull();
      expect(
         denied.diagnostics.some((d) => d.code === "UNSUPPORTED_CAPABILITY"),
      ).toBe(true);
      expect(denied.mapping).toEqual([]);
   });

   it("honest gap: a heading with no manifest text composes the row with an explicit gap", () => {
      const h1 = fixtureNode("h1", "text", "SLOT/Heading");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["h1"],
      });
      const nodes = [section, h1];
      const ctx = makeCtx(nodes, {});
      const html = headingSectionHandler.compose(
         fixtureSection("SECTION/Only"),
         SECTION_ID,
         ctx,
      );
      expect(html).not.toContain('data-content-type="heading"');
      expect(ctx.diagnostics.some((d) => d.code === "EVIDENCE_MISSING")).toBe(
         true,
      );
      const gap = ctx.mapping.find((m) => m.sourceNodeId === "h1");
      expect(gap?.disposition).toBe("gap");
   });
});
