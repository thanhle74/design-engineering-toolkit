// [72] W-C — slider+slide handler unit suite (vitest, hermetic fixtures).
//
// Asserts the VERBATIM emitted bytes of the composed master-format fragments against
// hand-derived expectations built from the VERIFIED-REAL-ROW slide shapes (docs/evidence/
// issue-72/source/wc-declarations.md), plus the honest-accounting negatives: missing media,
// short signatures, and the fail-closed registry gate. No machine paths, no timestamps.
import { describe, expect, it } from "vitest";

import { pbStyleKey } from "../../elements.js";
import { sliderHtml } from "../../elements-native.js";
import { sliderSlideHandler } from "../slider-slide.js";
import type {
   MappingEntry,
   SectionComposeContext,
} from "../../handler-context.js";
import type { ComposerRole } from "../../handler-context.js";
import type {
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../../../core/types.js";

// ---- hermetic fixtures ------------------------------------------------------------------------

type Spec = {
   nodeId: string;
   kind: NodeIRNode["kind"];
   name: string;
   locator?: string;
   visible?: boolean;
   children?: Spec[];
};

const buildNode = (spec: Spec, parentId: string | null): NodeIRNode => ({
   nodeId: spec.nodeId,
   kind: spec.kind,
   name: spec.name,
   childrenNodeIds: (spec.children ?? []).map((c) => c.nodeId),
   parentNodeId: parentId,
   layout: {
      direction: "column",
      positioning: "static",
      constraints: [],
      relativeSizes: [],
      overflow: "unknown",
   },
   sourceEvidence: spec.locator
      ? [
           {
              evidenceId: `e-${spec.nodeId}`,
              kind: "runtime-observation",
              locator: spec.locator,
              retrievedAt: "2026-01-01T00:00:00.000Z",
           },
        ]
      : [],
});

const flatten = (spec: Spec, parentId: string | null = null): NodeIRNode[] => [
   buildNode(spec, parentId),
   ...(spec.children ?? []).flatMap((c) => flatten(c, spec.nodeId)),
];

interface CtxCapture {
   diagnostics: Diagnostic[];
   mapping: MappingEntry[];
}

interface CtxOptions {
   roles?: Record<string, ComposerRole>;
   texts?: Record<string, string>;
   media?: Record<string, string>;
   links?: Record<
      string,
      {
         linkUrl: string;
         linkTarget?: string;
         variant?: "primary" | "secondary";
      }
   >;
   enabledCaps?: Record<string, boolean>;
}

/** Hand-built SectionComposeContext mirroring the dispatcher's construction semantics. */
function makeCtx(
   root: Spec,
   opts: CtxOptions = {},
): SectionComposeContext & CtxCapture {
   const nodes = flatten(root);
   const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
   const locatorOf = (n: NodeIRNode) => n.sourceEvidence[0]?.locator ?? null;
   const walkSubtree = (rootId: string, visit: (n: NodeIRNode) => void) => {
      const visitChildren = (id: string) => {
         for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
            const child = nodesById.get(childId);
            if (!child) continue;
            visit(child);
            visitChildren(childId);
         }
      };
      visitChildren(rootId);
   };
   const roleByLocator = new Map(
      Object.entries(opts.roles ?? {}) as [string, ComposerRole][],
   );
   // Mirror the dispatcher: subtrees of projected CTA instances account through their entry.
   const ctaSubtreeLocators = new Set<string>();
   const locatorToNode = new Map(
      nodes.filter((n) => locatorOf(n) !== null).map((n) => [locatorOf(n)!, n]),
   );
   for (const [loc, role] of roleByLocator) {
      if (role !== "cta") continue;
      const rootId = locatorToNode.get(loc)?.nodeId;
      if (!rootId) continue;
      walkSubtree(rootId, (n) => {
         const l = locatorOf(n);
         if (l) ctaSubtreeLocators.add(l);
      });
   }
   const capture: CtxCapture = { diagnostics: [], mapping: [] };
   const enabled = opts.enabledCaps ?? {};
   return {
      nodesById,
      locatorOf,
      walkSubtree,
      requireCap: (id, appearanceId) => {
         const key = `${id}#${appearanceId}`;
         if (enabled[key] ?? true) return true;
         capture.diagnostics.push({
            code: "UNSUPPORTED_CAPABILITY",
            severity: "error",
            message: `Capability '${id}#${appearanceId}' absent/disabled; fail closed.`,
            subject: { type: "capability", id },
         });
         return false;
      },
      textByRef: new Map(Object.entries(opts.texts ?? {})),
      mediaByRef: new Map(
         Object.entries(opts.media ?? {}).map(([k, mediaUrl]) => [
            k,
            { mediaUrl },
         ]),
      ),
      linkByRef: new Map(Object.entries(opts.links ?? {})),
      roleByLocator,
      selectionByLocator: new Map(), // products-only seam; the slider tests are unbound.
      excludedLocators: new Set<string>(),
      ctaSubtreeLocators,
      pushDiagnostic: (d) => capture.diagnostics.push(d),
      pushMapping: (m) => capture.mapping.push(m),
      ...capture,
   };
}

const sectionFixture = (name: string): PageStructureSection => ({
   sectionId: "s-test",
   order: 0,
   name,
   layout: {
      direction: "column",
      positioning: "static",
      constraints: [],
      relativeSizes: [],
      overflow: "unknown",
   },
   elements: [],
   sourceEvidence: [],
});

// The two fixtures share one shape: a section with two slide-projected containers.
const SLIDE_A = "s-aaaa";
const SLIDE_B = "s-bbbb";

function sliderSectionSpec(): Spec {
   return {
      nodeId: "s-root",
      kind: "page-section",
      name: "SECTION/Hero/Slider",
      locator: "900:1",
      children: [
         {
            nodeId: SLIDE_A,
            kind: "container",
            name: "Made for Living",
            locator: "900:2",
            children: [
               {
                  nodeId: "s-a-media",
                  kind: "media",
                  name: "Hero 1",
                  locator: "900:3",
               },
               {
                  nodeId: "s-a-heading",
                  kind: "text",
                  name: "The Quiet Grandeur",
                  locator: "900:4",
               },
               {
                  nodeId: "s-a-body",
                  kind: "text",
                  name: "Refined tailoring",
                  locator: "900:5",
               },
               {
                  nodeId: "s-a-cta",
                  kind: "component",
                  name: "Proto / CTA — Arrow",
                  locator: "900:6",
                  children: [
                     {
                        nodeId: "s-a-cta-label",
                        kind: "text",
                        name: "Explore",
                        locator: "900:7",
                     },
                  ],
               },
            ],
         },
         {
            nodeId: SLIDE_B,
            kind: "container",
            name: "Built to Last",
            locator: "910:2",
            children: [
               {
                  nodeId: "s-b-cta",
                  kind: "component",
                  name: "Proto / Button/Primary",
                  locator: "910:5",
               },
            ],
         },
      ],
   };
}

function happyCtx(): SectionComposeContext & CtxCapture {
   return makeCtx(sliderSectionSpec(), {
      roles: {
         "900:2": "slide",
         "910:2": "slide",
         "900:4": "heading",
         "900:5": "body",
         "900:6": "cta",
         "910:5": "cta",
      },
      media: { "900:3": "{{media url=wysiwyg/hero-1.jpg}}" },
      texts: {
         "900:4": "The Quiet Grandeur",
         "900:5": "Refined tailoring, knitwear and leather.",
         "900:7": "Explore",
         "910:5": "Mua Ngay",
      },
      links: { "900:6": { linkUrl: "/collections", variant: "primary" } },
   });
}

const run = (ctx: SectionComposeContext, name = "SECTION/Hero/Slider") =>
   sliderSlideHandler.compose(sectionFixture(name), "s-root", ctx);

// ---- tests -------------------------------------------------------------------------------------

describe("[72] W-C slider-slide handler", () => {
   it("composes two projected slides byte-verbatim (linked + empty_link variants)", () => {
      const ctx = happyCtx();
      const out = run(ctx);
      expect(out).not.toBeNull();
      const wrapKeyA = pbStyleKey(`${SLIDE_A}:wrapper`);
      const overlayKeyA = pbStyleKey(`${SLIDE_A}:overlay`);
      const buttonKeyA = pbStyleKey(`${SLIDE_A}:button`);
      const wrapKeyB = pbStyleKey(`${SLIDE_B}:wrapper`);
      const overlayKeyB = pbStyleKey(`${SLIDE_B}:overlay`);
      const buttonKeyB = pbStyleKey(`${SLIDE_B}:button`);

      const expectedStyleBlock =
         `<style>` +
         `#html-body [data-pb-style=${wrapKeyA}]{background-position:left top;background-size:cover}` +
         `#html-body [data-pb-style=${overlayKeyA}]{background-color:transparent}` +
         `#html-body [data-pb-style=${buttonKeyA}]{opacity:1;visibility:visible}` +
         `#html-body [data-pb-style=${wrapKeyB}]{background-position:left top;background-size:cover}` +
         `#html-body [data-pb-style=${overlayKeyB}]{background-color:transparent}` +
         `#html-body [data-pb-style=${buttonKeyB}]{opacity:1;visibility:visible}` +
         `</style>`;

      const slideA =
         `<div data-content-type="slide" data-slide-name="Made for Living" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main">` +
         `<a href="/collections" target="" data-link-type="default" title="" data-element="link">` +
         `<div class="pagebuilder-slide-wrapper" data-background-images="{&quot;desktop_image&quot;:&quot;{{media url=wysiwyg/hero-1.jpg}}&quot;}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-background-lazy-load="false" data-element="wrapper" data-pb-style="${wrapKeyA}">` +
         `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay" data-pb-style="${overlayKeyA}">` +
         `<div class="pagebuilder-poster-content">` +
         `<div data-element="content"><h2>The Quiet Grandeur</h2><p>Refined tailoring, knitwear and leather.</p></div>` +
         `<button type="button" class="pagebuilder-slide-button pagebuilder-button-primary" data-element="button" data-pb-style="${buttonKeyA}">Explore</button>` +
         `</div></div></div></a></div>`;

      const slideB =
         `<div data-content-type="slide" data-slide-name="Built to Last" data-appearance="poster" data-show-button="always" data-show-overlay="never" data-element="main">` +
         `<div data-element="empty_link">` +
         `<div class="pagebuilder-slide-wrapper" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-background-lazy-load="false" data-element="wrapper" data-pb-style="${wrapKeyB}">` +
         `<div class="pagebuilder-overlay pagebuilder-poster-overlay" data-overlay-color="" aria-label="" title="" data-element="overlay" data-pb-style="${overlayKeyB}">` +
         `<div class="pagebuilder-poster-content">` +
         `<div data-element="content"></div>` +
         `<button type="button" class="pagebuilder-slide-button pagebuilder-button-primary" data-element="button" data-pb-style="${buttonKeyB}">Mua Ngay</button>` +
         `</div></div></div></div></div>`;

      const expected =
         expectedStyleBlock +
         `<div data-content-type="row" data-appearance="contained" data-element="main">` +
         `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
         sliderHtml([slideA, slideB]) +
         `</div></div>`;

      expect(out).toBe(expected);

      // Honest accounting: exactly the consumed nodes mapped, the one real gap recorded.
      const mapped = ctx.mapping.filter((m) => m.disposition === "mapped");
      const gaps = ctx.mapping.filter((m) => m.disposition === "gap");
      const excluded = ctx.mapping.filter((m) => m.disposition === "excluded");
      expect(mapped).toHaveLength(9); // section + 2 slide containers + bg + 2 texts + CTA root+label + B CTA
      expect(
         mapped.filter(
            (m) => m.target?.capabilityId === "magento_pagebuilder/slide",
         ).length,
      ).toBe(8);
      expect(
         mapped.some(
            (m) => m.target?.capabilityId === "magento_pagebuilder/slider",
         ),
      ).toBe(true);
      expect(gaps).toHaveLength(1); // slide B media gap
      expect(gaps[0]?.sourceNodeId).toBe(SLIDE_B);
      expect(excluded).toHaveLength(0);
      expect(
         ctx.mapping.find((m) => m.sourceNodeId === SLIDE_A)?.note,
      ).toContain("data-slide-name carries the observed container name");
      expect(
         ctx.mapping.find((m) => m.sourceNodeId === "s-a-media")?.note,
      ).toContain("kept verbatim");
      expect(
         ctx.mapping.find((m) => m.sourceNodeId === "s-a-media")?.note,
      ).toContain("the first visible media descendant");
      // Warnings: slide B's missing background + its unlinked CTA (empty_link variant).
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes(
                  "'Built to Last' carries no content-manifest media entry",
               ),
         ),
      ).toBe(true);
      expect(
         ctx.diagnostics.some(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("vendor empty_link variant"),
         ),
      ).toBe(true);
      expect(ctx.diagnostics).toHaveLength(2);
   });

   it("records a typed NOT_VERIFIED gap when a slide has no media (background left empty)", () => {
      const ctx = makeCtx(sliderSectionSpec(), {
         roles: { "900:2": "slide", "910:2": "slide" },
      });
      const out = run(ctx);
      expect(out).not.toBeNull();
      expect(out).toContain('data-background-images="{}"');
      const mediaGaps = ctx.mapping.filter(
         (m) =>
            m.disposition === "gap" &&
            m.note ===
               "No manifest media entry for the slide background; background left empty.",
      );
      expect(mediaGaps).toHaveLength(2); // both slides lack manifest media
      expect(
         ctx.diagnostics.filter(
            (d) =>
               d.code === "NOT_VERIFIED" &&
               d.message.includes("slide background is left empty"),
         ).length,
      ).toBe(2);
      // No invented media, no invented text.
      expect(out).not.toContain("{{media url=");
      expect(out).toContain('<div data-element="content"></div>');
   });

   it("returns silent null for fewer than two projected slides", () => {
      const spec: Spec = {
         nodeId: "s-root",
         kind: "page-section",
         name: "SECTION/Single",
         locator: "920:1",
         children: [
            {
               nodeId: "s-one",
               kind: "container",
               name: "Only Slide",
               locator: "920:2",
               children: [],
            },
         ],
      };
      const ctx = makeCtx(spec, { roles: { "920:2": "slide" } });
      const out = run(ctx, spec.name);
      expect(out).toBeNull();
      expect(ctx.diagnostics).toHaveLength(0);
      expect(ctx.mapping).toHaveLength(0);
   });

   it("fails closed with UNSUPPORTED_CAPABILITY when the slider capability is absent", () => {
      const gated = makeCtx(sliderSectionSpec(), {
         roles: { "900:2": "slide", "910:2": "slide" },
         enabledCaps: {
            "magento_pagebuilder/slider#default": false,
            "magento_pagebuilder/slide#poster": true,
            "magento_pagebuilder/row#contained": true,
         },
      });
      const out = run(gated);
      expect(out).toBeNull();
      expect(
         gated.diagnostics.some(
            (d) =>
               d.code === "UNSUPPORTED_CAPABILITY" &&
               d.subject?.id === "magento_pagebuilder/slider",
         ),
      ).toBe(true);
      expect(gated.mapping).toHaveLength(0);
   });
});
