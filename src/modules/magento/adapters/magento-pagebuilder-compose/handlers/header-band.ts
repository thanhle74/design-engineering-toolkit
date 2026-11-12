// [72] Header-band section-shape handler (W-A evidence: the repeated "section header band" —
// one overline + one display heading + a "view all"-style trailing CTA, media-free, no column
// structure).
//
// Signature (deterministic, structural only — shapes, never names):
//   - the section subtree carries NO projected decision role (background-media / column-* /
//     grid-column / slide / products-*), NO media node (kind or manifest entry), and NO body
//     role — body-bearing loose text stays with the legacy guarded text-band shape;
//   - the role-resolved content is EXACTLY one band: >=1 content-lead (the overline), exactly
//     ONE heading (the display title), >=1 CTA (the trailing "view all"-style link instance).
//     The trailing CTA is REQUIRED in the signature: a content-lead+heading pair with no
//     trailing CTA composes through the legacy text-band shape unchanged (deterministic guard
//     against claiming the plain two-text statement band, whose bytes are pinned). Texts may
//     sit loose or inside transparent structural containers (component instances fold, the
//     same policy as every legacy shape).
//
// Emission: row(contained) > inner > one text(default) WYSIWYG with the overline run(s) > the
// VERIFIED-REAL-ROW native heading declaration > one native buttons(inline) > button-item pair
// ONLY for CTAs whose manifest label AND link resolve (a CTA without a link is an explicit
// gap — never an unlinked pseudo-button). The section's fixed height persists as the row inner
// min-height via the platform's rehydratable style-block mechanism.
import {
   rowContainedCloseHtml,
   rowContainedOpenHtml,
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   styleBlockHtml,
} from "../elements-editorial.js";
import {
   buttonsElementHtml,
   pbStyleKey,
   textElementHtml,
   type TextRun,
} from "../elements.js";
import type {
   NodeIRNode,
   PageStructureSection,
} from "../../../../core/types.js";
import {
   accountDecoration,
   accountExcluded,
   accountMissingManifest,
   accountStructuralFold,
   accountUnsupported,
   BUTTONS_APPEARANCE,
   BUTTONS_ID,
   BUTTON_ITEM_APPEARANCE,
   BUTTON_ITEM_ID,
   entryBaseOf,
   hasDecisionRole,
   HEADING_APPEARANCE,
   HEADING_ID,
   ROW_APPEARANCE,
   ROW_ID,
   TEXT_APPEARANCE,
   TEXT_ID,
   visibleDescendants,
   type HandlerContext,
} from "../shapes/handler-support.js";
import { composeHeadingElement } from "./heading.js";

export const HANDLER_LABEL = "header-band";

export const headerBandHandler = {
   id: "wb-header-band",
   compose(
      section: PageStructureSection,
      sectionNodeId: string,
      ctx: HandlerContext,
   ): string | null {
      // ---- Silent shape predicate (no records on a shape miss) ------------------------------------
      if (hasDecisionRole(ctx, sectionNodeId)) return null;
      const scope = visibleDescendants(ctx, sectionNodeId);
      const leads: NodeIRNode[] = [];
      const heads: NodeIRNode[] = [];
      const ctas: NodeIRNode[] = [];
      for (const node of scope) {
         const loc = ctx.locatorOf(node);
         if (
            loc &&
            (ctx.excludedLocators.has(loc) || ctx.ctaSubtreeLocators.has(loc))
         )
            continue; // pre-excluded subtree; accounted below
         if (node.kind === "media") return null;
         if (loc && ctx.mediaByRef.has(loc)) return null;
         const role = ctx.resolveComposerRole(node);
         if (role === "content-lead") leads.push(node);
         else if (role === "heading") heads.push(node);
         else if (role === "cta") ctas.push(node);
         else if (role !== undefined) return null; // body/grid-caption/inline-media -> other shapes
      }
      if (leads.length < 1 || heads.length !== 1 || ctas.length < 1)
         return null;

      // ---- Silent manifest resolution (drives the buttons gate + gap expectations) -----------------
      const headingNode = heads[0] as NodeIRNode;
      const headingLocator = ctx.locatorOf(headingNode);
      let leadTexts = 0;
      for (const lead of leads) {
         const loc = ctx.locatorOf(lead);
         if (loc !== null && ctx.textByRef.has(loc)) leadTexts += 1;
      }
      const resolvedCtas: {
         node: NodeIRNode;
         locator: string | null;
         label: string;
         link: {
            linkUrl: string;
            linkTarget?: string;
            variant?: "primary" | "secondary";
         };
      }[] = [];
      for (const cta of ctas) {
         const loc = ctx.locatorOf(cta);
         const label = loc ? ctx.textByRef.get(loc) : undefined;
         const link = loc ? ctx.linkByRef.get(loc) : undefined;
         if (label !== undefined && link !== undefined)
            resolvedCtas.push({
               node: cta,
               locator: loc,
               label,
               link: {
                  linkUrl: link.linkUrl,
                  ...(link.linkTarget ? { linkTarget: link.linkTarget } : {}),
                  ...(link.variant ? { variant: link.variant } : {}),
               },
            });
      }

      // ---- Registry gate (the shape matched; refusals are typed diagnostics) -----------------------
      const shapeReady =
         ctx.requireCap(ROW_ID, ROW_APPEARANCE) &&
         ctx.requireCap(HEADING_ID, HEADING_APPEARANCE) &&
         ctx.requireCap(TEXT_ID, TEXT_APPEARANCE) &&
         (resolvedCtas.length > 0
            ? ctx.requireCap(BUTTONS_ID, BUTTONS_APPEARANCE) &&
              ctx.requireCap(BUTTON_ITEM_ID, BUTTON_ITEM_APPEARANCE)
            : true);
      if (!shapeReady) return null;

      // ---- Composition: overline text WYSIWYG, native heading, buttons pair ------------------------
      const leadFragment = (): string => {
         const runs: TextRun[] = [];
         for (const lead of leads) {
            const loc = ctx.locatorOf(lead);
            const text = loc ? ctx.textByRef.get(loc) : undefined;
            if (text === undefined) {
               accountMissingManifest(
                  ctx,
                  lead,
                  loc,
                  "text (content-lead)",
                  "No manifest text entry for the overline field.",
               );
               continue;
            }
            runs.push({ role: "content-lead", text });
            ctx.pushMapping({
               ...entryBaseOf(lead, loc),
               disposition: "mapped",
               target: {
                  capabilityId: TEXT_ID,
                  appearanceId: TEXT_APPEARANCE,
                  nativeElement: "text",
                  nativeField: "content (WYSIWYG HTML)",
               },
               note: "Overline composed as a <p> run in the band's leading text WYSIWYG; standalone per-field styling is not preserved (single WYSIWYG field).",
            });
         }
         return runs.length > 0 ? textElementHtml(runs) : "";
      };
      const leadHtml = leadTexts > 0 ? leadFragment() : "";
      if (leadTexts === 0) {
         for (const lead of leads) {
            const loc = ctx.locatorOf(lead);
            accountMissingManifest(
               ctx,
               lead,
               loc,
               "text (content-lead)",
               "No manifest text entry for the overline field.",
            );
         }
      }

      const headingHtml = composeHeadingElement(
         ctx,
         headingNode,
         headingLocator,
         "Role-resolved display heading composed as the native heading declaration (level 2 = the composer's established heading convention; heading_type stays Admin-editable).",
      );

      const buttonSpecs = resolvedCtas.map((s) => ({
         keySource: s.node.nodeId,
         label: s.label,
         linkUrl: s.link.linkUrl,
         ...(s.link.linkTarget ? { linkTarget: s.link.linkTarget } : {}),
         variant: s.link.variant,
      }));
      for (const s of resolvedCtas) {
         ctx.pushMapping({
            ...entryBaseOf(s.node, s.locator),
            disposition: "mapped",
            target: {
               capabilityId: BUTTON_ITEM_ID,
               appearanceId: BUTTON_ITEM_APPEARANCE,
               nativeElement: "button-item",
               nativeField: "button_text + link (button_link)",
            },
            note: `Trailing band CTA composed as a native button-item in the band buttons container (label "${s.label}", link target from the manifest${s.link.variant ? `, ${s.link.variant} variant` : ""}).`,
         });
      }
      for (const cta of ctas) {
         if (resolvedCtas.some((s) => s.node.nodeId === cta.nodeId)) continue;
         const loc = ctx.locatorOf(cta);
         const label = loc ? ctx.textByRef.get(loc) : undefined;
         accountMissingManifest(
            ctx,
            cta,
            loc,
            label === undefined ? "text (CTA label)" : "link (CTA target)",
            "Trailing band CTA without a manifest label/link entry; no button composed — never an unlinked pseudo-button.",
         );
      }
      const buttonsHtml =
         buttonSpecs.length > 0
            ? buttonsElementHtml(`${sectionNodeId}:band-buttons`, buttonSpecs)
            : "";

      // ---- Section height: the one layout primitive (row inner min-height, rehydratable) -----------
      const sectionNode = ctx.nodesById.get(sectionNodeId) as NodeIRNode;
      const heightConstraint = section.layout.constraints.find(
         (c) => c.axis === "height" && c.type === "fixed",
      );
      let rowMinHeight: number | undefined;
      if (heightConstraint) {
         const px = Number(heightConstraint.value);
         if (Number.isFinite(px) && px > 0) rowMinHeight = px;
         else
            ctx.pushDiagnostic({
               code: "NOT_VERIFIED",
               severity: "warning",
               message: `Section height constraint '${heightConstraint.value}' is not a positive number; row min-height not composed.`,
               subject: { type: "node", id: sectionNodeId },
            });
      } else {
         ctx.pushDiagnostic({
            code: "NOT_VERIFIED",
            severity: "warning",
            message: `Section '${section.name}' carries no fixed height constraint; row min-height not composed (Admin default applies).`,
            subject: { type: "node", id: sectionNodeId },
         });
      }
      const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
      const rules: string[] = [];
      if (rowMinHeight !== undefined)
         rules.push(rowInnerMinHeightRule(innerKey, rowMinHeight));

      // ---- Accounting: every visible node lands exactly once ----------------------------------------
      // Reverse document order (children before parents): a structural container folds when its
      // WHOLE visible subtree is already accounted as composed band content, excluded records or
      // decoration gaps — transparency proven by construction, never assumed. A container holding
      // anything unsupported is itself unsupported (recorded, never a silent flatten).
      const accounted = new Set<string>([
         headingNode.nodeId,
         ...leads.map((l) => l.nodeId),
         ...ctas.map((c) => c.nodeId),
      ]);
      const foldBlocked = new Set<string>();
      const sectionLocator = ctx.locatorOf(sectionNode);
      for (const node of [...scope].reverse()) {
         if (accounted.has(node.nodeId)) continue;
         const loc = ctx.locatorOf(node);
         if (loc && ctx.excludedLocators.has(loc)) {
            accounted.add(node.nodeId);
            accountExcluded(
               ctx,
               node,
               loc,
               "Inside a subtree explicitly projected as decoration; recorded, never silently dropped.",
            );
            continue;
         }
         if (loc && ctx.ctaSubtreeLocators.has(loc)) {
            accounted.add(node.nodeId);
            accountExcluded(
               ctx,
               node,
               loc,
               "Inside a projected CTA instance that composed through its manifest label; the rest is the CTA's visual chrome.",
            );
            continue;
         }
         if (
            (loc && ctx.roleByLocator.get(loc) === "decoration") ||
            node.role === "DECOR" ||
            node.kind === "icon"
         ) {
            accounted.add(node.nodeId);
            accountDecoration(ctx, node, loc);
            continue;
         }
         if (node.kind === "container" || node.kind === "component") {
            const descendants = visibleDescendants(ctx, node.nodeId);
            const transparent =
               descendants.length > 0 &&
               descendants.every(
                  (d) => accounted.has(d.nodeId) && !foldBlocked.has(d.nodeId),
               );
            accounted.add(node.nodeId);
            if (transparent) {
               accountStructuralFold(
                  ctx,
                  node,
                  loc,
                  {
                     capabilityId: ROW_ID,
                     appearanceId: ROW_APPEARANCE,
                     nativeElement: "row (contained)",
                     nativeField: "structural container folded",
                  },
                  "Structural container folded into the band row; its whole visible subtree composes in the band elements or is explicitly recorded (decoration); no separate native container.",
               );
            } else {
               foldBlocked.add(node.nodeId);
               accountUnsupported(ctx, node, loc, HANDLER_LABEL);
            }
            continue;
         }
         accounted.add(node.nodeId);
         foldBlocked.add(node.nodeId);
         accountUnsupported(ctx, node, loc, HANDLER_LABEL);
      }

      ctx.pushMapping({
         ...entryBaseOf(sectionNode, sectionLocator ?? null),
         disposition: "mapped",
         target: {
            capabilityId: ROW_ID,
            appearanceId: ROW_APPEARANCE,
            nativeElement: "main",
            nativeField:
               "row(contained) > text(default) WYSIWYG + heading(default) [+ buttons(inline)]",
         },
         note: "Header-band section composed as a contained row: one overline text WYSIWYG, the native heading declaration for the display heading, and — only for CTAs with a manifest label AND link — one native buttons container; the section's fixed height persists as the row inner min-height via the platform's rehydratable style-block mechanism; mobile breakpoint not composed.",
      });
      return (
         styleBlockHtml(rules) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(rowMinHeight !== undefined ? innerKey : undefined) +
         leadHtml +
         (headingHtml ?? "") +
         buttonsHtml +
         rowContainedCloseHtml()
      );
   },
};
