// [72] W-C — native slider+slide section-shape handler (modular Page Builder composer).
//
// Signature (deterministic, role-evidence-driven — NEVER name/identity branching): a section
// subtree carrying >= 2 visible containers each EXPLICITLY projected role "slide"
// (ctx.roleByLocator). Carousel intent is never inferred from geometry or peer repetition — the
// projection vocabulary ("slide", committed in #72's v1.5.0 additive extension) carries the
// recorded human decision; fewer than 2 slide-projected containers -> silent null.
//
// Emitted chain: row(contained) > row inner > slider(default) > slide(poster) per projected
// container, in document order — the chain real admin-saved cms_page rows persist (W-A evidence:
// docs/evidence/issue-72/source/native-declarations-observed.md; byte receipt:
// wc-declarations.md). All emitted content type x appearance pairs pass ctx.requireCap FIRST
// (fail closed with the gate's UNSUPPORTED_CAPABILITY/CAPABILITY_DISABLED diagnostics); every
// consumed source node produces an accountable mapping entry; missing media/text/CTA link are
// per-slide typed gaps, never invented around.
//
// This handler is NOT wired into the compose dispatcher by this lane — the Integrator registers
// handlers/registry.ts after review (frozen contract rule 5).
import { pbStyleKey } from "../elements.js";
import {
   slidePosterHtml,
   slidePosterStyleRules,
   sliderHtml,
   type SlideContentRun,
   type SlidePosterInput,
} from "../elements-native.js";
import type {
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../../core/types.js";
import type {
   MappingEntry,
   SectionComposeContext,
   SectionShapeHandler,
} from "../handler-context.js";

const ROW_ID = "magento_pagebuilder/row";
const ROW_APPEARANCE = "contained";
const SLIDER_ID = "magento_pagebuilder/slider";
const SLIDER_APPEARANCE = "default";
const SLIDE_ID = "magento_pagebuilder/slide";
const SLIDE_APPEARANCE = "poster";

const locatorEntryBase = (
   node: NodeIRNode,
   ctx: SectionComposeContext,
): Pick<MappingEntry, "sourceNodeId" | "sourceName" | "sourceLocator"> => {
   const loc = ctx.locatorOf(node);
   return {
      sourceNodeId: node.nodeId,
      ...(node.name ? { sourceName: node.name } : {}),
      ...(loc ? { sourceLocator: loc } : {}),
   };
};

const diag = (message: string, nodeId: string): Diagnostic => ({
   code: "NOT_VERIFIED",
   severity: "warning",
   message,
   subject: { type: "node", id: nodeId },
});

/** Document-order slide-projected visible containers inside the section subtree. */
const collectSlideContainers = (
   sectionNodeId: string,
   ctx: SectionComposeContext,
): NodeIRNode[] => {
   const found: NodeIRNode[] = [];
   ctx.walkSubtree(sectionNodeId, (node) => {
      if (node.visible === false) return;
      const loc = ctx.locatorOf(node);
      if (loc !== null && ctx.roleByLocator.get(loc) === "slide")
         found.push(node);
   });
   return found;
};

interface ResolvedSlide {
   input: SlidePosterInput;
   /** slide subtree node ids already accounted (a mapping entry exists for each). */
   accounted: Set<string>;
}

/**
 * Compose one poster slide from its projected container subtree.
 *
 * Media resolution order (whichever wins is recorded in the mapping note): the slide container's
 * own locator manifest entry, then an explicit background-media projection inside the subtree,
 * then the first visible media-kind descendant. Text roles (heading/body/content-lead) fold into
 * the poster content field as h2/p; the FIRST labeled projected CTA becomes the skeleton's
 * single slide button (extra CTAs are declared gaps — banner/slide posters carry exactly one
 * button element).
 */
function resolveSlide(
   slideNode: NodeIRNode,
   ctx: SectionComposeContext,
): ResolvedSlide {
   const accounted = new Set<string>([slideNode.nodeId]);
   const contentRuns: SlideContentRun[] = [];
   const warnings: { message: string; nodeId: string }[] = [];

   // The slide container itself -> the native slide declaration (poster appearance).
   ctx.pushMapping({
      ...locatorEntryBase(slideNode, ctx),
      disposition: "mapped",
      target: {
         capabilityId: SLIDE_ID,
         appearanceId: SLIDE_APPEARANCE,
         nativeElement: "main",
         nativeField: "slide (slider > slide container)",
      },
      note: "Projected slide container composed as native slide(poster); data-slide-name carries the observed container name.",
   });

   // ---- media (resolution order above; the resolved manifest URL is kept verbatim) -------------
   const slideLocator = ctx.locatorOf(slideNode);
   const subtreeMediaCandidates: { node: NodeIRNode; via: string }[] = [];
   ctx.walkSubtree(slideNode.nodeId, (node) => {
      if (node.visible === false) return;
      const loc = ctx.locatorOf(node);
      if (loc !== null && ctx.roleByLocator.get(loc) === "background-media")
         subtreeMediaCandidates.push({
            node,
            via: "an explicit background-media projection inside the slide subtree",
         });
      else if (node.kind === "media")
         subtreeMediaCandidates.push({
            node,
            via: "the first visible media descendant of the slide container",
         });
   });
   let media: { node: NodeIRNode; url: string; via: string } | undefined;
   if (slideLocator !== null && ctx.mediaByRef.has(slideLocator)) {
      media = {
         node: slideNode,
         url: ctx.mediaByRef.get(slideLocator)!.mediaUrl,
         via: "the slide container's own locator manifest entry",
      };
   } else {
      const explicit = subtreeMediaCandidates.find(
         (c) =>
            ctx.locatorOf(c.node) !== null &&
            ctx.roleByLocator.get(ctx.locatorOf(c.node)!) ===
               "background-media",
      );
      const candidate = explicit ?? subtreeMediaCandidates[0];
      const candidateEntry = (() => {
         if (candidate === undefined) return undefined;
         const loc = ctx.locatorOf(candidate.node);
         return loc !== null ? ctx.mediaByRef.get(loc) : undefined;
      })();
      if (candidate !== undefined && candidateEntry !== undefined) {
         media = { ...candidate, url: candidateEntry.mediaUrl };
      } else {
         warnings.push({
            message: `Slide '${slideNode.name}' carries no content-manifest media entry${
               candidate
                  ? ` for its background candidate '${candidate.node.name}'`
                  : " and no background media candidate in its subtree"
            }; the slide background is left empty — no asset URL is invented.`,
            nodeId: candidate?.node.nodeId ?? slideNode.nodeId,
         });
         ctx.pushMapping({
            ...locatorEntryBase(candidate?.node ?? slideNode, ctx),
            disposition: "gap",
            note: "No manifest media entry for the slide background; background left empty.",
         });
         if (candidate !== undefined) accounted.add(candidate.node.nodeId);
      }
   }
   if (media !== undefined) {
      accounted.add(media.node.nodeId);
      ctx.pushMapping({
         ...locatorEntryBase(media.node, ctx),
         disposition: "mapped",
         target: {
            capabilityId: SLIDE_ID,
            appearanceId: SLIDE_APPEARANCE,
            nativeElement: "wrapper",
            nativeField: "data-background-images (desktop_image)",
         },
         note: `Slide background media resolved via ${media.via}; the manifest URL is kept verbatim.`,
      });
   }
   // Any further media candidates have no native slot (one background per poster slide).
   for (const extra of subtreeMediaCandidates.filter(
      (c) => !accounted.has(c.node.nodeId),
   )) {
      accounted.add(extra.node.nodeId);
      ctx.pushMapping({
         ...locatorEntryBase(extra.node, ctx),
         disposition: "gap",
         note: "Additional media beyond the slide background (one background per poster slide); not composed.",
      });
   }

   // ---- content + CTA (projected roles inside the slide subtree, document order) ---------------
   let button: SlidePosterInput["button"] | undefined;
   let linkUrl: string | undefined;
   let linkTarget: string | undefined;
   const subtreeNodes: NodeIRNode[] = [];
   ctx.walkSubtree(slideNode.nodeId, (node) => subtreeNodes.push(node));
   for (const node of subtreeNodes) {
      if (node.visible === false) continue;
      if (accounted.has(node.nodeId)) continue;
      const loc = ctx.locatorOf(node);
      const role = loc !== null ? ctx.roleByLocator.get(loc) : undefined;
      if (
         loc !== null &&
         ctx.excludedLocators.has(loc) &&
         role !== "heading" &&
         role !== "body" &&
         role !== "content-lead" &&
         role !== "cta" &&
         role !== "background-media"
      ) {
         accounted.add(node.nodeId);
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "excluded",
            note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
         });
         continue;
      }
      if (loc !== null && ctx.ctaSubtreeLocators.has(loc) && role !== "cta") {
         accounted.add(node.nodeId);
         ctx.pushMapping({
            ...locatorEntryBase(node, ctx),
            disposition: "excluded",
            note: "Inside a projected CTA instance that composes as the poster's native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
         });
         continue;
      }
      if (role === "heading" || role === "body" || role === "content-lead") {
         const text = loc !== null ? ctx.textByRef.get(loc) : undefined;
         if (text === undefined) {
            warnings.push({
               message: `No content-manifest text entry for slide text '${node.name}' (${
                  loc ?? "no locator"
               }); the ${role} field is left empty — no text is invented.`,
               nodeId: node.nodeId,
            });
            ctx.pushMapping({
               ...locatorEntryBase(node, ctx),
               disposition: "gap",
               note: "No manifest text entry for the projected slide content role.",
            });
         } else {
            contentRuns.push({ role, text });
            accounted.add(node.nodeId);
            ctx.pushMapping({
               ...locatorEntryBase(node, ctx),
               disposition: "mapped",
               target: {
                  capabilityId: SLIDE_ID,
                  appearanceId: SLIDE_APPEARANCE,
                  nativeElement: "content",
                  nativeField: "message",
               },
               note: `Projected slide text folded into the poster content field as ${
                  role === "heading" ? "<h2>" : "<p>"
               }; standalone per-field styling is not preserved (single WYSIWYG field).`,
            });
         }
         continue;
      }
      if (role === "cta") {
         resolveSlideCta(
            node,
            slideNode,
            ctx,
            accounted,
            warnings,
            (b, url, target) => {
               if (button === undefined) {
                  button = b;
                  linkUrl = url;
                  linkTarget = target;
               }
            },
         );
         continue;
      }
      // Every other visible node inside the slide subtree: no native slot in the poster skeleton.
      warnings.push({
         message: `Node '${node.name}' inside slide '${slideNode.name}' has no native slot in the poster slide skeleton; recorded, never silently dropped, never approximated.`,
         nodeId: node.nodeId,
      });
      ctx.pushMapping({
         ...locatorEntryBase(node, ctx),
         disposition: "gap",
         note: "No native slot in the poster slide skeleton.",
      });
   }

   for (const w of warnings) ctx.pushDiagnostic(diag(w.message, w.nodeId));

   return {
      input: {
         slideName: slideNode.name,
         ...(media !== undefined ? { backgroundImageUrl: media.url } : {}),
         contentRuns,
         ...(button !== undefined
            ? {
                 button,
                 ...(linkUrl !== undefined ? { linkUrl } : {}),
                 ...(linkTarget !== undefined ? { linkTarget } : {}),
              }
            : {}),
         wrapperKey: pbStyleKey(`${slideNode.nodeId}:wrapper`),
         overlayKey: pbStyleKey(`${slideNode.nodeId}:overlay`),
      },
      accounted,
   };
}

/**
 * One slide CTA instance: label from the CTA node's own manifest text or the first manifest text
 * inside the instance (button components carry their label on an inner text node); link from the
 * manifest entry keyed by the CTA node's locator. The first labeled CTA of a slide wins the
 * poster's single button slot (enforced by the caller via the once callback).
 */
function resolveSlideCta(
   ctaNode: NodeIRNode,
   slideNode: NodeIRNode,
   ctx: SectionComposeContext,
   accounted: Set<string>,
   warnings: { message: string; nodeId: string }[],
   once: (
      button: NonNullable<SlidePosterInput["button"]>,
      linkUrl: string | undefined,
      linkTarget: string | undefined,
   ) => void,
): void {
   // The CTA instance is fully accounted here (whatever its outcome) so the section-level
   // outside-walk never re-records it.
   accounted.add(ctaNode.nodeId);
   const loc = ctx.locatorOf(ctaNode);
   const innerLabelHits: { node: NodeIRNode; text: string }[] = [];
   let label = loc !== null ? ctx.textByRef.get(loc) : undefined;
   let labelNode: NodeIRNode | undefined =
      label !== undefined ? ctaNode : undefined;
   if (label === undefined) {
      ctx.walkSubtree(ctaNode.nodeId, (inner) => {
         if (innerLabelHits.length > 0) return;
         const innerLoc = ctx.locatorOf(inner);
         const text =
            innerLoc !== null ? ctx.textByRef.get(innerLoc) : undefined;
         if (text !== undefined) innerLabelHits.push({ node: inner, text });
      });
      if (innerLabelHits.length > 0) {
         label = innerLabelHits[0].text;
         labelNode = innerLabelHits[0].node;
      }
   }
   if (labelNode !== undefined && labelNode.nodeId !== ctaNode.nodeId) {
      // The label text lives on an inner node of the CTA instance — that node is consumed
      // (its manifest text becomes the button label) and gets its own accountable entry.
      accounted.add(labelNode.nodeId);
      ctx.pushMapping({
         ...locatorEntryBase(labelNode, ctx),
         disposition: "mapped",
         target: {
            capabilityId: SLIDE_ID,
            appearanceId: SLIDE_APPEARANCE,
            nativeElement: "button",
            nativeField: "button_text (label source)",
         },
         note: `CTA label text resolved from the CTA instance's inner text node (${labelNode.name}).`,
      });
   }
   const link = loc !== null ? ctx.linkByRef.get(loc) : undefined;
   if (label === undefined || labelNode === undefined) {
      warnings.push({
         message: `Projected slide CTA '${ctaNode.name}' carries no label text in the content manifest; the poster composes without a slide button — no label is invented.`,
         nodeId: ctaNode.nodeId,
      });
      ctx.pushMapping({
         ...locatorEntryBase(ctaNode, ctx),
         disposition: "gap",
         note: "No manifest text entry for the slide CTA label; no button composed.",
      });
      return;
   }
   if (loc !== null) {
      // CTA instance internals account through this entry (label aside).
      ctx.walkSubtree(ctaNode.nodeId, (inner) => {
         if (inner.nodeId === labelNode.nodeId) return;
         const innerLoc = ctx.locatorOf(inner);
         if (innerLoc !== null && ctx.ctaSubtreeLocators.has(innerLoc)) {
            accounted.add(inner.nodeId);
            ctx.pushMapping({
               ...locatorEntryBase(inner, ctx),
               disposition: "excluded",
               note: "Inside a projected CTA instance that composes as the poster's native button element; the label composes via the manifest entry, the rest is the button's visual chrome.",
            });
         }
      });
   }
   if (link === undefined) {
      warnings.push({
         message: `No content-manifest link entry for slide CTA '${ctaNode.name}'; the poster composes in the vendor empty_link variant (button present, no link target).`,
         nodeId: ctaNode.nodeId,
      });
   }
   ctx.pushMapping({
      ...locatorEntryBase(ctaNode, ctx),
      disposition: "mapped",
      target: {
         capabilityId: SLIDE_ID,
         appearanceId: SLIDE_APPEARANCE,
         nativeElement: "button",
         nativeField: "button_text",
      },
      note: `Projected slide CTA (${ctaNode.name}) — label text${
         link !== undefined
            ? " + link target"
            : " (no link target; empty_link variant)"
      } from the manifest.`,
   });
   once(
      {
         label,
         variant: link?.variant,
         key: pbStyleKey(`${slideNode.nodeId}:button`),
      },
      link?.linkUrl,
      link?.linkTarget,
   );
}

export const sliderSlideHandler: SectionShapeHandler = {
   id: "magento-pagebuilder/slider-slide",

   compose(
      section: PageStructureSection,
      sectionNodeId: string,
      ctx: SectionComposeContext,
   ): string | null {
      // ---- signature (silent null when it does not match) --------------------------------------
      const slideContainers = collectSlideContainers(sectionNodeId, ctx);
      if (slideContainers.length < 2) return null;

      // ---- registry gate, fail closed BEFORE any emission --------------------------------------
      if (
         !ctx.requireCap(ROW_ID, ROW_APPEARANCE) ||
         !ctx.requireCap(SLIDER_ID, SLIDER_APPEARANCE) ||
         !ctx.requireCap(SLIDE_ID, SLIDE_APPEARANCE)
      ) {
         return null;
      }

      const sectionNode = ctx.nodesById.get(sectionNodeId);
      const sectionLocator = sectionNode ? ctx.locatorOf(sectionNode) : null;

      // ---- accountable records ------------------------------------------------------------------
      ctx.pushMapping({
         sourceNodeId: sectionNodeId,
         ...(sectionNode?.name ? { sourceName: sectionNode.name } : {}),
         ...(sectionLocator ? { sourceLocator: sectionLocator } : {}),
         disposition: "mapped",
         target: {
            capabilityId: SLIDER_ID,
            appearanceId: SLIDER_APPEARANCE,
            nativeElement: "main",
            nativeField: "slider (row > slider container)",
         },
         note: `Section composed as native row(contained) > slider(default) > slide(poster) x${slideContainers.length} per the pinned declarations; the row provides the platform's standard top-level container.`,
      });

      // ---- slides (document order) + non-slide accounting ---------------------------------------
      const slides = slideContainers.map((s) => resolveSlide(s, ctx));
      const inSlide = new Set<string>([
         ...slideContainers.map((s) => s.nodeId),
         ...slides.flatMap((s) => [...s.accounted]),
      ]);
      const outsideWarnings: string[] = [];
      ctx.walkSubtree(sectionNodeId, (node) => {
         if (node.visible === false) return;
         if (inSlide.has(node.nodeId)) return;
         const loc = ctx.locatorOf(node);
         const base = locatorEntryBase(node, ctx);
         if (loc !== null && ctx.excludedLocators.has(loc)) {
            ctx.pushMapping({
               ...base,
               disposition: "excluded",
               note: "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            });
            return;
         }
         if (loc !== null && ctx.ctaSubtreeLocators.has(loc)) {
            ctx.pushMapping({
               ...base,
               disposition: "excluded",
               note: "Inside a projected CTA instance outside the slide group; nothing in the slider chain consumes it here.",
            });
            return;
         }
         outsideWarnings.push(`'${node.name}'`);
         ctx.pushMapping({
            ...base,
            disposition: "gap",
            note: "Outside the projected slide group; the slider chain composes the projected slides only.",
         });
      });
      if (outsideWarnings.length > 0) {
         const sectionLabel = sectionNode?.name ?? sectionNodeId;
         ctx.pushDiagnostic(
            diag(
               `Section '${sectionLabel}' carries nodes outside the projected slide group (${outsideWarnings.join(
                  ", ",
               )}); not composed — recorded, never silently dropped.`,
               sectionNodeId,
            ),
         );
      }

      // ---- emit (fixed attribute order; mirrors the platform's persisted master format) ---------
      const styleRules = slides.flatMap((s) => slidePosterStyleRules(s.input));
      const styleBlock =
         styleRules.length > 0 ? `<style>${styleRules.join("")}</style>` : "";
      return (
         styleBlock +
         `<div data-content-type="row" data-appearance="contained" data-element="main">` +
         `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner">` +
         sliderHtml(slides.map((s) => slidePosterHtml(s.input))) +
         `</div>` +
         `</div>`
      );
   },
};
