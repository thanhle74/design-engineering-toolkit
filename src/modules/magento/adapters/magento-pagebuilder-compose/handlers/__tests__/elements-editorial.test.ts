// [72] elements-editorial byte contract — the native heading declaration (VERIFIED-REAL-ROW:
// real admin-saved cms_page rows carry exactly `data-content-type="heading"`
// `data-appearance="default"` `data-element="main"` with the text as element content) and the
// structural chain openers, which must stay byte-identical to the legacy composers in
// ../compose.ts (one canonical definition per element shape, issue #72 Commit A contract).
import { describe, expect, it } from "vitest";
import {
   columnGroupCloseHtml,
   columnGroupOpenHtml,
   columnLineCloseHtml,
   columnLineFlexRule,
   columnLineOpenHtml,
   columnOpenHtml,
   columnWidthRule,
   columnCloseHtml,
   headingElementHtml,
   rowContainedCloseHtml,
   rowContainedOpenHtml,
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   styleBlockHtml,
} from "../../elements-editorial.js";

describe("elements-editorial byte contract", () => {
   it("emits the verified native heading declaration at every heading level", () => {
      expect(headingElementHtml(1, "H")).toBe(
         '<h1 data-content-type="heading" data-appearance="default" data-element="main">H</h1>',
      );
      expect(headingElementHtml(2, "H")).toBe(
         '<h2 data-content-type="heading" data-appearance="default" data-element="main">H</h2>',
      );
      expect(headingElementHtml(3, "H")).toBe(
         '<h3 data-content-type="heading" data-appearance="default" data-element="main">H</h3>',
      );
      expect(headingElementHtml(4, "H")).toBe(
         '<h4 data-content-type="heading" data-appearance="default" data-element="main">H</h4>',
      );
      expect(headingElementHtml(5, "H")).toBe(
         '<h5 data-content-type="heading" data-appearance="default" data-element="main">H</h5>',
      );
      expect(headingElementHtml(6, "H")).toBe(
         '<h6 data-content-type="heading" data-appearance="default" data-element="main">H</h6>',
      );
   });

   it("escapes heading text content with the shared text escaper (never attribute-escapes)", () => {
      // escText leaves quotes alone (text content) and escapes & < > — the heading_text html
      // field rides the platform's tag-escaper converter, not the attribute escaper.
      expect(headingElementHtml(2, 'A & B <"q">')).toBe(
         '<h2 data-content-type="heading" data-appearance="default" data-element="main">A &amp; B &lt;"q"&gt;</h2>',
      );
   });

   it("emits the structural chain openers byte-identical to the legacy composers", () => {
      expect(rowContainedOpenHtml()).toBe(
         '<div data-content-type="row" data-appearance="contained" data-element="main">',
      );
      expect(rowInnerOpenHtml()).toBe(
         '<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">',
      );
      expect(rowInnerOpenHtml("PABCDEF")).toBe(
         '<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner" data-pb-style="PABCDEF">',
      );
      expect(rowContainedCloseHtml()).toBe("</div></div>");
      expect(columnGroupOpenHtml()).toBe(
         '<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">',
      );
      expect(columnGroupCloseHtml()).toBe("</div>");
      expect(columnLineOpenHtml("PABCDEF")).toBe(
         '<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="PABCDEF">',
      );
      expect(columnLineCloseHtml()).toBe("</div>");
      expect(columnOpenHtml("PABCDEF")).toBe(
         '<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="PABCDEF">',
      );
      expect(columnCloseHtml()).toBe("</div>");
   });

   it("emits the rehydratable style-block rules and no empty style block", () => {
      expect(rowInnerMinHeightRule("PABCDEF", 480)).toBe(
         "#html-body [data-pb-style=PABCDEF]{min-height:480px}",
      );
      expect(columnLineFlexRule("PABCDEF")).toBe(
         "#html-body [data-pb-style=PABCDEF]{display:flex;width:100%}",
      );
      expect(columnWidthRule("PABCDEF", 34)).toBe(
         "#html-body [data-pb-style=PABCDEF]{justify-content:flex-start;display:flex;flex-direction:column;width:34%;align-self:stretch}",
      );
      expect(styleBlockHtml([])).toBe("");
      expect(styleBlockHtml(["a", "b"])).toBe("<style>ab</style>");
   });
});
