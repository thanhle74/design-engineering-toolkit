// [72] header-band.ts unit contract — the repeated "section header band" shape (overline +
// display heading + trailing view-all CTA). Fixtures synthesized from the observed band
// structure (component instance wraps, decoration ride-alongs) — no machine paths.
import { describe, expect, it } from "vitest";
import { headerBandHandler } from "../header-band.js";
import {
   pbStyleKey,
   textElementHtml,
   buttonsElementHtml,
} from "../../elements.js";
import {
   headingElementHtml,
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

function bandTree() {
   const overline = fixtureNode("ov", "text", "SLOT/Overline");
   const title = fixtureNode("ti", "text", "SLOT/Heading");
   const viewAll = fixtureNode("va", "text", "SLOT/CtaLabel");
   const icon = fixtureNode("ic", "icon", "DECOR/Arrow");
   const left = fixtureNode("left", "container", "Left", {
      childrenNodeIds: ["ov", "ti"],
   });
   const header = fixtureNode("hdr", "component", "Section Header", {
      childrenNodeIds: ["left", "va", "ic"],
   });
   const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Band", {
      childrenNodeIds: ["hdr"],
      layout: {
         direction: "column",
         positioning: "static",
         constraints: [{ axis: "height", type: "fixed", value: "200" }],
         relativeSizes: [],
         overflow: "visible",
      },
   });
   const nodes = [section, header, left, overline, title, viewAll, icon];
   const ctx = makeCtx(nodes, {
      texts: {
         "design://fixture/ov": "NEW SEASON",
         "design://fixture/ti": "The Autumn Edit",
         "design://fixture/va": "View All",
      },
      links: {
         "design://fixture/va": {
            linkUrl: "{{store url='collections'}}",
            linkTarget: "_blank",
            variant: "secondary",
         },
      },
   });
   return {
      nodes,
      ctx,
      section: fixtureSection("SECTION/Band", [
         { axis: "height", value: "200" },
      ]),
      viewAll,
      overline,
      title,
      icon,
   };
}

describe("header-band section-shape handler", () => {
   it("composes overline text WYSIWYG + native heading + buttons pair in exact order and bytes", () => {
      const { ctx, section, viewAll } = bandTree();
      const html = headerBandHandler.compose(section, SECTION_ID, ctx);
      const innerKey = pbStyleKey(`${SECTION_ID}:inner`);
      const expected =
         styleBlockHtml([rowInnerMinHeightRule(innerKey, 200)]) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(innerKey) +
         textElementHtml([{ role: "content-lead", text: "NEW SEASON" }]) +
         headingElementHtml(2, "The Autumn Edit") +
         buttonsElementHtml(`${SECTION_ID}:band-buttons`, [
            {
               keySource: viewAll.nodeId,
               label: "View All",
               linkUrl: "{{store url='collections'}}",
               linkTarget: "_blank",
               variant: "secondary",
            },
         ]) +
         rowContainedCloseHtml();
      expect(html).toBe(expected);
      const dispositions = Object.fromEntries(
         ctx.mapping.map((m) => [m.sourceNodeId, m.disposition]),
      );
      expect(dispositions).toEqual({
         [SECTION_ID]: "mapped",
         hdr: "mapped", // structural fold
         left: "mapped", // structural fold
         ov: "mapped",
         ti: "mapped",
         va: "mapped",
         ic: "gap", // decoration gap
      });
      const titleEntry = ctx.mapping.find((m) => m.sourceNodeId === "ti");
      expect(titleEntry?.target?.capabilityId).toBe(
         "magento_pagebuilder/heading",
      );
      expect(ctx.diagnostics.filter((d) => d.severity === "error").length).toBe(
         0,
      );
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" && d.message.includes("Decoration"),
         ),
      ).toBe(true);
   });

   it("shape-miss: lead + heading WITHOUT a trailing CTA stays null (legacy text-band territory)", () => {
      const overline = fixtureNode("ov", "text", "SLOT/Overline");
      const title = fixtureNode("ti", "text", "SLOT/Heading");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Only", {
         childrenNodeIds: ["ov", "ti"],
      });
      const nodes = [section, overline, title];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ov": "THE HOUSE",
            "design://fixture/ti": "Statement",
         },
      });
      expect(
         headerBandHandler.compose(
            fixtureSection("SECTION/Only"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("shape-miss: a body-role text disqualifies the band (legacy text-band composes those)", () => {
      const overline = fixtureNode("ov", "text", "SLOT/Overline");
      const title = fixtureNode("ti", "text", "SLOT/Heading");
      const body = fixtureNode("bo", "text", "SLOT/Body");
      const viewAll = fixtureNode("va", "text", "SLOT/CtaLabel");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/NL", {
         childrenNodeIds: ["ov", "ti", "bo", "va"],
      });
      const nodes = [section, overline, title, body, viewAll];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ov": "THE CIRCULAR",
            "design://fixture/ti": "Letters",
            "design://fixture/bo": "Body copy",
            "design://fixture/va": "Subscribe",
         },
         links: {
            "design://fixture/va": { linkUrl: "{{store url='newsletter'}}" },
         },
      });
      expect(
         headerBandHandler.compose(
            fixtureSection("SECTION/NL"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("shape-miss: any media (kind or manifest) disqualifies the band silently", () => {
      const overline = fixtureNode("ov", "text", "SLOT/Overline");
      const title = fixtureNode("ti", "text", "SLOT/Heading");
      const viewAll = fixtureNode("va", "text", "SLOT/CtaLabel");
      const media = fixtureNode("md", "container", "SLOT/MediaFrame");
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Band", {
         childrenNodeIds: ["ov", "ti", "va", "md"],
      });
      const nodes = [section, overline, title, viewAll, media];
      const ctx = makeCtx(nodes, {
         texts: {
            "design://fixture/ov": "A",
            "design://fixture/ti": "B",
            "design://fixture/va": "C",
         },
         links: { "design://fixture/va": { linkUrl: "x" } },
         media: { "design://fixture/md": { mediaUrl: "{{media url=m.jpg}}" } },
      });
      expect(
         headerBandHandler.compose(
            fixtureSection("SECTION/Band"),
            SECTION_ID,
            ctx,
         ),
      ).toBeNull();
      expect(ctx.diagnostics).toEqual([]);
      expect(ctx.mapping).toEqual([]);
   });

   it("a CTA without a manifest link composes NO button and records the gap; buttons caps not required", () => {
      const overline = fixtureNode("ov", "text", "SLOT/Overline");
      const title = fixtureNode("ti", "text", "SLOT/Heading");
      const viewAll = fixtureNode("va", "text", "SLOT/CtaLabel"); // text only, no link entry
      const section = fixtureNode(SECTION_ID, "page-section", "SECTION/Band", {
         childrenNodeIds: ["ov", "ti", "va"],
      });
      const nodes = [section, overline, title, viewAll];
      const ctx = makeCtx(nodes, {
         deniedCaps: [
            "magento_pagebuilder/buttons#inline",
            "magento_pagebuilder/button-item#default",
         ],
         texts: {
            "design://fixture/ov": "NEW SEASON",
            "design://fixture/ti": "The Autumn Edit",
            "design://fixture/va": "View All",
         },
      });
      const html = headerBandHandler.compose(
         fixtureSection("SECTION/Band"),
         SECTION_ID,
         ctx,
      );
      expect(html).not.toBeNull();
      expect(html).not.toContain('data-content-type="buttons"');
      const gap = ctx.mapping.find((m) => m.sourceNodeId === "va");
      expect(gap?.disposition).toBe("gap");
      expect(ctx.diagnostics.some((d) => d.code === "EVIDENCE_MISSING")).toBe(
         true,
      );
      expect(
         ctx.diagnostics.some((d) => d.code === "UNSUPPORTED_CAPABILITY"),
      ).toBe(false);
   });
});
