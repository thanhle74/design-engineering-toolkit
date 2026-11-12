// [72] Card-grid section-shape handler — peer repeated card groups (W-A evidence: collection
// tiles, product cards, people looks).
//
// Signature (deterministic, structural only — shapes, never names):
//   - the section subtree carries NO projected decision role (background-media / column-primary /
//     column-secondary / grid-column / slide / products-grid / products-carousel): a recorded
//     projection always owns the section through the dispatcher's projected legacy shapes, and
//     this guard keeps the two orders in agreement;
//   - the section's visible content is EXACTLY N >= 2 STRUCTURALLY PARALLEL card groups —
//     either every visible direct child is a group, or the section has exactly one visible
//     intermediate container child (itself carrying no manifest media) whose visible children
//     are all the groups, with every OTHER visible direct child pure chrome (no media or text
//     kind anywhere in its subtree, no manifest media) — decoration/empty-structure only.
//     This "groups are the whole visible content" bound is the deterministic tightening that
//     keeps sections carrying additional composable content (a section header band beside the
//     tiles, trailing captions/CTAs) with the dedicated shapes or an honest skip — never a
//     silent flatten.
//   - a group is a container or component whose ordered visible-descendant KIND SEQUENCE is
//     identical across all groups (parallel internal composition) and which carries content:
//     >=1 visible media-kind or text-kind descendant, or its OWN locator carries a manifest
//     media entry (the observed media-slot-frame pattern — the same evidence class the legacy
//     two-column shape composes).
//
// Emission: the declaration-backed chain row(contained) > column-group(default) >
// column-line(default) > column(full-height) xN — ONE column-line for all N (the pinned
// column-line declaration allows column children with NO count cap; vendor
// content_type/column-line.xml). Per column, in document order: the group's own media slot
// fill / media descendants -> image(full-width) elements; text descendants -> ONE text(default)
// WYSIWYG per contiguous run (the canonical card = image + one text element); the group's
// FIRST role-resolved heading -> the native heading declaration (level 2, the composer's
// established convention), later heading-role texts fold as <h2> WYSIWYG runs, and raw
// unprojected card copy folds as <p> runs (peer-card copy is card copy — the locator + manifest
// entry carries it, never a naming guess); CTAs with a manifest label AND link -> the native
// buttons pair. Column widths apportion from observed fixed widths (largest remainder, integer
// percents, sum 100) or fall back to an equal apportionment with a recorded NOT_VERIFIED
// warning. Styles persist via the platform's rehydratable style-block mechanism.
import {
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
} from "../elements-editorial.js";
import {
   buttonsElementHtml,
   imageElementHtml,
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
   COLUMN_APPEARANCE,
   COLUMN_GROUP_APPEARANCE,
   COLUMN_GROUP_ID,
   COLUMN_ID,
   COLUMN_LINE_APPEARANCE,
   COLUMN_LINE_ID,
   entryBaseOf,
   fixedWidthOf,
   hasDecisionRole,
   normalizeComposerRole,
   HEADING_APPEARANCE,
   HEADING_ID,
   IMAGE_APPEARANCE,
   IMAGE_ID,
   percentSplitOf,
   ROW_APPEARANCE,
   ROW_ID,
   TEXT_APPEARANCE,
   TEXT_ID,
   visibleChildren,
   visibleDescendants,
   visibleKindSequence,
   type HandlerContext,
} from "../shapes/handler-support.js";
import { composeHeadingElement } from "./heading.js";

export const HANDLER_LABEL = "card-grid";

// A valid card group: a container/component carrying content (media/text descendant or own
// manifest media slot), whose kind sequence the caller compares for parallelism.
function isCardGroup(ctx: HandlerContext, node: NodeIRNode): boolean {
   if (node.kind !== "container" && node.kind !== "component") return false;
   const seq = visibleKindSequence(ctx, node);
   if (seq.includes("media") || seq.includes("text")) return true;
   const loc = ctx.locatorOf(node);
   return loc !== null && ctx.mediaByRef.has(loc);
}

// Every visible node in the subtree carries no media/text content (pure structural chrome).
function isPureChromeSubtree(ctx: HandlerContext, root: NodeIRNode): boolean {
   if (root.kind === "media" || root.kind === "text") return false;
   const rootLoc = ctx.locatorOf(root);
   if (rootLoc && ctx.mediaByRef.has(rootLoc)) return false;
   let pure = true;
   ctx.walkSubtree(root.nodeId, (n) => {
      if (n.visible === false) return;
      if (n.kind === "media" || n.kind === "text") pure = false;
      const l = ctx.locatorOf(n);
      if (l && ctx.mediaByRef.has(l)) pure = false;
   });
   return pure;
}

interface GroupSet {
   groupsParent: NodeIRNode;
   groups: NodeIRNode[];
   chrome: NodeIRNode[];
}

// The deterministic group-set detection; null when the section is not a pure card grid.
function detectGroupSet(
   ctx: HandlerContext,
   sectionNodeId: string,
): GroupSet | null {
   const direct = visibleChildren(ctx, sectionNodeId);
   if (direct.length < 2) return null;
   const sequenceOf = (nodes: NodeIRNode[]): string[] | null => {
      if (nodes.length === 0) return null;
      const seq = visibleKindSequence(ctx, nodes[0] as NodeIRNode);
      for (const n of nodes.slice(1)) {
         const s = visibleKindSequence(ctx, n);
         if (s.length !== seq.length) return null;
         for (let i = 0; i < s.length; i++) if (s[i] !== seq[i]) return null;
      }
      return seq;
   };
   // The claimed set carries content when the shared sequence contains media/text kinds, or when
   // every group carries its own manifest media slot (the empty-sequence slot-frame pattern).
   const carriesContent = (nodes: NodeIRNode[]): boolean => {
      const seq = sequenceOf(nodes);
      if (seq !== null && (seq.includes("media") || seq.includes("text")))
         return true;
      return nodes.every((n) => {
         const loc = ctx.locatorOf(n);
         return loc !== null && ctx.mediaByRef.has(loc);
      });
   };
   // (a) every visible direct child is a parallel group.
   if (direct.every((n) => isCardGroup(ctx, n))) {
      if (sequenceOf(direct) !== null && carriesContent(direct))
         return {
            groupsParent: ctx.nodesById.get(sectionNodeId) as NodeIRNode,
            groups: direct,
            chrome: [],
         };
   }
   // (b) exactly one intermediate container whose children are the parallel groups; every other
   // direct child is pure chrome.
   for (const child of direct) {
      if (child.kind !== "container" && child.kind !== "component") continue;
      const childLoc = ctx.locatorOf(child);
      if (childLoc && ctx.mediaByRef.has(childLoc)) continue;
      const candidates = visibleChildren(ctx, child.nodeId);
      if (candidates.length < 2) continue;
      if (!candidates.every((n) => isCardGroup(ctx, n))) continue;
      if (sequenceOf(candidates) === null || !carriesContent(candidates))
         continue;
      const chrome = direct.filter((n) => n.nodeId !== child.nodeId);
      if (!chrome.every((n) => isPureChromeSubtree(ctx, n))) continue;
      return { groupsParent: child, groups: candidates, chrome };
   }
   return null;
}

export const cardGridHandler = {
   id: "wb-card-grid",
   compose(
      section: PageStructureSection,
      sectionNodeId: string,
      ctx: HandlerContext,
   ): string | null {
      // ---- Silent shape predicate ------------------------------------------------------------------
      if (hasDecisionRole(ctx, sectionNodeId)) return null;
      const set = detectGroupSet(ctx, sectionNodeId);
      if (!set || set.groups.length < 2) return null;
      const { groupsParent, groups, chrome } = set;

      // ---- Silent manifest resolution (drives the conditional gates) --------------------------------
      let groupHasHeading = false;
      let composableCta = 0;
      let mediaCount = 0;
      const groupScan = (group: NodeIRNode): void => {
         const gloc = ctx.locatorOf(group);
         if (gloc && ctx.mediaByRef.has(gloc)) mediaCount += 1;
         for (const node of visibleDescendants(ctx, group.nodeId)) {
            const loc = ctx.locatorOf(node);
            if (
               loc &&
               (ctx.excludedLocators.has(loc) ||
                  ctx.ctaSubtreeLocators.has(loc))
            )
               continue;
            const role = normalizeComposerRole(ctx.resolveComposerRole(node));
            if (role === "heading") groupHasHeading = true;
            if (role === "cta") {
               const label = loc ? ctx.textByRef.get(loc) : undefined;
               const link = loc ? ctx.linkByRef.get(loc) : undefined;
               if (label !== undefined && link !== undefined)
                  composableCta += 1;
            }
            if (node.kind === "media" || role === "inline-media") {
               if (loc && ctx.mediaByRef.has(loc)) mediaCount += 1;
            }
         }
      };
      for (const g of groups) groupScan(g);

      // ---- Registry gate (the shape matched; refusals are typed diagnostics) ------------------------
      const shapeReady =
         ctx.requireCap(ROW_ID, ROW_APPEARANCE) &&
         ctx.requireCap(COLUMN_GROUP_ID, COLUMN_GROUP_APPEARANCE) &&
         ctx.requireCap(COLUMN_LINE_ID, COLUMN_LINE_APPEARANCE) &&
         ctx.requireCap(COLUMN_ID, COLUMN_APPEARANCE) &&
         ctx.requireCap(IMAGE_ID, IMAGE_APPEARANCE) &&
         ctx.requireCap(TEXT_ID, TEXT_APPEARANCE) &&
         (groupHasHeading
            ? ctx.requireCap(HEADING_ID, HEADING_APPEARANCE)
            : true) &&
         (composableCta > 0
            ? ctx.requireCap(BUTTONS_ID, BUTTONS_APPEARANCE) &&
              ctx.requireCap(BUTTON_ITEM_ID, BUTTON_ITEM_APPEARANCE)
            : true);
      if (!shapeReady) return null;

      // ---- Column widths (observed fixed widths, else recorded equal apportionment) -----------------
      const widths = groups.map((g) => fixedWidthOf(g));
      const widthNote = widths.every((w) => w !== null)
         ? `observed fixed widths apportioned to integer percents (largest remainder, sum 100)`
         : `card groups carry no fixed-width constraints; widths fall back to an equal integer apportionment (largest remainder) — recorded, not inferred`;
      if (!widths.every((w) => w !== null)) {
         ctx.pushDiagnostic({
            code: "NOT_VERIFIED",
            severity: "warning",
            message: `Section '${section.name}' card groups carry no fixed-width constraints; column widths fall back to the equal integer apportionment — recorded, not inferred.`,
            subject: { type: "node", id: sectionNodeId },
         });
      }
      const pcts = percentSplitOf(widths.map((w) => w ?? 1));

      // ---- Per-column composition -------------------------------------------------------------------
      const accounted = new Set<string>();
      const columnHtmls: string[] = [];
      for (const [gi, group] of groups.entries()) {
         const items: string[] = [];
         let runs: TextRun[] = [];
         let buttons: {
            keySource: string;
            label: string;
            linkUrl: string;
            linkTarget?: string;
            variant: "primary" | "secondary" | undefined;
         }[] = [];
         let groupHeadingUsed = false;
         const flushRuns = (): void => {
            if (runs.length > 0) items.push(textElementHtml(runs));
            runs = [];
         };
         const flushButtons = (): void => {
            if (buttons.length > 0)
               items.push(
                  buttonsElementHtml(`${group.nodeId}:card-buttons`, buttons),
               );
            buttons = [];
         };

         // The group's OWN media slot fill composes first (the observed slot-frame pattern).
         const groupLocator = ctx.locatorOf(group);
         const ownMedia = groupLocator
            ? ctx.mediaByRef.get(groupLocator)
            : undefined;
         if (ownMedia) {
            accounted.add(group.nodeId);
            items.push(imageElementHtml(ownMedia.mediaUrl));
            ctx.pushMapping({
               ...entryBaseOf(group, groupLocator),
               disposition: "mapped",
               target: {
                  capabilityId: IMAGE_ID,
                  appearanceId: IMAGE_APPEARANCE,
                  nativeElement: "image",
                  nativeField: "desktop_image",
               },
               note: `Card group's own media slot fill composed as the column's leading native image element${ownMedia.assetLabel ? ` (${ownMedia.assetLabel})` : ""}.`,
            });
         }

         for (const node of visibleDescendants(ctx, group.nodeId)) {
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
                  "Inside a projected CTA instance that composes through its manifest label; the rest is the CTA's visual chrome.",
               );
               continue;
            }
            const role = normalizeComposerRole(ctx.resolveComposerRole(node));
            if (role === "cta") {
               flushRuns();
               accounted.add(node.nodeId);
               const label = loc ? ctx.textByRef.get(loc) : undefined;
               const link = loc ? ctx.linkByRef.get(loc) : undefined;
               if (label !== undefined && link !== undefined) {
                  buttons.push({
                     keySource: node.nodeId,
                     label,
                     linkUrl: link.linkUrl,
                     ...(link.linkTarget
                        ? { linkTarget: link.linkTarget }
                        : {}),
                     variant: link.variant,
                  });
                  ctx.pushMapping({
                     ...entryBaseOf(node, loc),
                     disposition: "mapped",
                     target: {
                        capabilityId: BUTTON_ITEM_ID,
                        appearanceId: BUTTON_ITEM_APPEARANCE,
                        nativeElement: "button-item",
                        nativeField: "button_text + link (button_link)",
                     },
                     note: `Card CTA composed as a native button-item in the column buttons container (label "${label}", link target from the manifest${link.variant ? `, ${link.variant} variant` : ""}).`,
                  });
               } else {
                  accountMissingManifest(
                     ctx,
                     node,
                     loc,
                     label === undefined
                        ? "text (CTA label)"
                        : "link (CTA target)",
                     "Card CTA without a manifest label/link entry; no button composed — never an unlinked pseudo-button.",
                  );
               }
               continue;
            }
            if (node.kind === "media" || role === "inline-media") {
               flushRuns();
               flushButtons();
               accounted.add(node.nodeId);
               const media = loc ? ctx.mediaByRef.get(loc) : undefined;
               if (media) {
                  items.push(imageElementHtml(media.mediaUrl));
                  ctx.pushMapping({
                     ...entryBaseOf(node, loc),
                     disposition: "mapped",
                     target: {
                        capabilityId: IMAGE_ID,
                        appearanceId: IMAGE_APPEARANCE,
                        nativeElement: "image",
                        nativeField: "desktop_image",
                     },
                     note: `Card media composed as a native image element (natural aspect to column width — no native crop field)${media.assetLabel ? ` (${media.assetLabel})` : ""}.`,
                  });
               } else {
                  accountMissingManifest(
                     ctx,
                     node,
                     loc,
                     "media",
                     "Card media has no manifest entry; the image element is left out rather than invented.",
                  );
               }
               continue;
            }
            if (node.kind === "text") {
               flushButtons();
               accounted.add(node.nodeId);
               const text = loc ? ctx.textByRef.get(loc) : undefined;
               if (text === undefined) {
                  accountMissingManifest(
                     ctx,
                     node,
                     loc,
                     "text",
                     "Card text has no manifest entry; the run is left out rather than invented.",
                  );
                  continue;
               }
               if (role === "heading" && !groupHeadingUsed) {
                  flushButtons();
                  flushRuns();
                  const headingHtml = composeHeadingElement(
                     ctx,
                     node,
                     loc,
                     `Card display heading composed as the native heading declaration (level 2 = the composer's established heading convention; heading_type stays Admin-editable); column ${gi + 1} of ${groups.length}.`,
                  );
                  if (headingHtml !== null) {
                     groupHeadingUsed = true;
                     items.push(headingHtml);
                  }
                  continue;
               }
               const runRole: TextRun["role"] =
                  role === "content-lead"
                     ? "content-lead"
                     : role === "heading"
                       ? "heading"
                       : "body";
               runs.push({ role: runRole, text });
               ctx.pushMapping({
                  ...entryBaseOf(node, loc),
                  disposition: "mapped",
                  target: {
                     capabilityId: TEXT_ID,
                     appearanceId: TEXT_APPEARANCE,
                     nativeElement: "text",
                     nativeField: "content (WYSIWYG HTML)",
                  },
                  note:
                     role === "grid-caption"
                        ? "Projected grid caption folded as a <p> run in its card column's text WYSIWYG (the group IS the column — no geometric containment needed); single WYSIWYG field, per-run styling not preserved."
                        : `${role === "heading" ? "Later heading-role text folded as an <h2> run" : role === "content-lead" ? "Content-lead folded as a <p> run" : role !== undefined ? "Role-resolved text folded as a <p> run" : "Card copy folded as a <p> run"} in the card column's text WYSIWYG; single WYSIWYG field, per-run styling not preserved.`,
               });
               continue;
            }
            if (
               (loc && ctx.roleByLocator.get(loc) === "decoration") ||
               node.role === "DECOR" ||
               node.kind === "icon"
            ) {
               flushRuns();
               flushButtons();
               accounted.add(node.nodeId);
               accountDecoration(ctx, node, loc);
               continue;
            }
            if (node.kind === "container" || node.kind === "component") {
               flushRuns();
               flushButtons();
               accounted.add(node.nodeId);
               ctx.pushMapping({
                  ...entryBaseOf(node, loc),
                  disposition: "mapped",
                  target: {
                     capabilityId: COLUMN_ID,
                     appearanceId: COLUMN_APPEARANCE,
                     nativeElement: "column (full-height)",
                     nativeField: "card structure (container folded)",
                  },
                  note: "Structural container folded into the card column; its composable descendants compose in document order; no separate native container.",
               });
               continue;
            }
            flushRuns();
            flushButtons();
            accounted.add(node.nodeId);
            accountUnsupported(ctx, node, loc, HANDLER_LABEL);
         }
         flushRuns();
         flushButtons();

         const columnKey = pbStyleKey(group.nodeId);
         columnHtmls.push(
            columnOpenHtml(columnKey) + items.join("") + columnCloseHtml(),
         );
         accounted.add(group.nodeId);
         ctx.pushMapping({
            ...entryBaseOf(group, groupLocator),
            disposition: "mapped",
            target: {
               capabilityId: COLUMN_ID,
               appearanceId: COLUMN_APPEARANCE,
               nativeElement: "column (full-height)",
               nativeField: `card group -> column (full-height) at ${pcts[gi]}% width`,
            },
            note: `Peer card group composed as one native column (full-height) at ${pcts[gi]}% width of the card line (observed proportion of the group set); content in document order.`,
         });
      }

      // ---- Chrome + parent accounting ------------------------------------------------------------------
      for (const node of chrome) {
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
               "Inside a projected CTA instance that composes through its manifest label; the rest is the CTA's visual chrome.",
            );
            continue;
         }
         accounted.add(node.nodeId);
         accountStructuralFold(
            ctx,
            node,
            loc,
            {
               capabilityId: ROW_ID,
               appearanceId: ROW_APPEARANCE,
               nativeElement: "row (contained)",
               nativeField: "structural chrome folded",
            },
            "Pure structural chrome (no media or text content) folded into the row; recorded, never silently dropped.",
         );
         for (const inner of visibleDescendants(ctx, node.nodeId)) {
            if (accounted.has(inner.nodeId)) continue;
            const iloc = ctx.locatorOf(inner);
            accounted.add(inner.nodeId);
            if (
               (iloc && ctx.roleByLocator.get(iloc) === "decoration") ||
               inner.role === "DECOR" ||
               inner.kind === "icon"
            )
               accountDecoration(ctx, inner, iloc);
            else accountUnsupported(ctx, inner, iloc, HANDLER_LABEL);
         }
      }
      if (groupsParent.nodeId !== sectionNodeId) {
         const parentLoc = ctx.locatorOf(groupsParent);
         accountStructuralFold(
            ctx,
            groupsParent,
            parentLoc,
            {
               capabilityId: COLUMN_GROUP_ID,
               appearanceId: COLUMN_GROUP_APPEARANCE,
               nativeElement: "column-group (default)",
               nativeField: "card-group container folded",
            },
            "Card-group container folded into the column-group; the groups are its children verbatim; no separate native container.",
         );
      }

      // ---- Section height: the one layout primitive ------------------------------------------------------
      const sectionNode = ctx.nodesById.get(sectionNodeId) as NodeIRNode;
      const sectionLocator = ctx.locatorOf(sectionNode);
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
      const lineKey = pbStyleKey(`${sectionNodeId}:line-0`);
      const rules: string[] = [];
      if (rowMinHeight !== undefined)
         rules.push(rowInnerMinHeightRule(innerKey, rowMinHeight));
      rules.push(columnLineFlexRule(lineKey));
      for (const [gi, group] of groups.entries())
         rules.push(
            columnWidthRule(pbStyleKey(group.nodeId), pcts[gi] as number),
         );

      // ---- Aggregated fidelity warning (once per section, from the observed inventory) -------------------
      if (mediaCount > 0) {
         ctx.pushDiagnostic({
            code: "NOT_VERIFIED",
            severity: "warning",
            message: `Observed media in '${section.name}' (${mediaCount} slot(s)) composes as native image elements at natural aspect to column width — no native aspect/crop field; the section's fixed height persists only as the row min-height. Card chrome (gradients, affordances, hotspot markers) has no native field. Recorded as fidelity limits, never custom CSS.`,
            subject: { type: "node", id: sectionNodeId },
         });
      }

      ctx.pushMapping({
         ...entryBaseOf(sectionNode, sectionLocator ?? null),
         disposition: "mapped",
         target: {
            capabilityId: ROW_ID,
            appearanceId: ROW_APPEARANCE,
            nativeElement: "main",
            nativeField: `row(contained) > column-group(default) > column-line > column(full-height) x${groups.length}`,
         },
         note: `Peer card groups composed as the declaration-backed column chain: ${groups.length} parallel groups in ONE column-line (the pinned column-line children policy allows column with no count cap); ${widthNote}; per-column text folds into one text WYSIWYG per contiguous run with the display heading as the native heading declaration; observed gutters/staggering are not native fields; mobile breakpoint not composed.`,
      });
      return (
         styleBlockHtml(rules) +
         rowContainedOpenHtml() +
         rowInnerOpenHtml(rowMinHeight !== undefined ? innerKey : undefined) +
         columnGroupOpenHtml() +
         columnLineOpenHtml(lineKey) +
         columnHtmls.join("") +
         columnLineCloseHtml() +
         columnGroupCloseHtml() +
         rowContainedCloseHtml()
      );
   },
};
