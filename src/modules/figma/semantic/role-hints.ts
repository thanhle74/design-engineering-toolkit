// Deterministic semantic role-hint helper (issue #72, W-D lane).
//
// Input: the pinned NodeIR node inventory + the PageStructure sections of one observed
// design source. Output: DETERMINISTIC candidate semantic-projection assignments plus a
// parallel structural-hints array — SUGGESTIONS ONLY. This helper never mutates anything
// and never decides: a recorded, reason-carrying semantic-projection document (the
// coordinator/operator decision) is what applies roles to a source.
//
// Detection is STRUCTURE-ONLY. The detectors below never branch on section or node names
// for their trigger; the only naming signal used is the documented design-source naming
// contract's SLOT/<segment> convention — a name carrying one of the table's convention
// prefixes (PAGE/SITE/SECTION/SLOT/DECOR) resolves its segment after the first slash,
// lowercased, reduced to [a-z0-9] (the composer's TEXT_ROLE_TABLE resolution). Raw layer
// content that merely contains a slash ('CHAPTER 01 / AW 2026') is NOT a contract signal.
// That signal only ever RAISES confidence or emits an explicitly conjectural candidate —
// it never invents an assignment.
//
// Detectors:
//
// 1. header-band — within a section, scan the leading region in document order,
//    descending through text-only containers/components (a child qualifies to descend
//    when it carries NO visible media descendant; components must additionally carry >=2
//    visible text descendants — a component with <2 texts is an action/instance, not band
//    copy) and collecting loose text nodes. The scan STOPS at the first visible media
//    node, the first container with a visible media descendant, the first member of a
//    detected peer-card run (parallel group), or the first non-descendable component.
//    The collected cluster must hold exactly 2..3 texts; the pair (first, second) is
//    proposed as content-lead + heading. Role words resolved through the SLOT table
//    (overline -> content-lead, heading -> heading) mark the assignment "observed";
//    position-only pairing is "conjecture". A first text whose SLOT segment resolves to
//    a conflicting role (body/bodycopy/cta/ctalabel) suppresses the pair entirely — the
//    naming contract is never overridden. A first text longer than 32 characters that
//    carries no SLOT role is not overline-shaped and suppresses the pair.
//
// 2. peer-card-group — for the section root and every slot container the section's
//    PageStructure `elements` list names (the composer's shape-detection scope), take the
//    visible sibling containers/components and group those whose visible descendant
//    kind-sequences are IDENTICAL (parallel composition). A group of N>=2 where every
//    member is content-bearing (carries a visible media descendant, a visible text
//    descendant, or is a SLOT-named content frame) emits a card-grid hint with the member
//    locators and columnCount N. The group containers get NO role: card-grid is
//    structural, so the hint carries {kind: "card-grid", containers, columnCount} in the
//    parallel hints array for the coordinator/mapper to apply. An N==2 group of
//    empty-but-SLOT-named frames is suppressed: two identical empty content frames are
//    the two-column signature, not a grid; three or more cannot be a two-column split.
//
// 3. products decision — NEVER auto-assigned. A peer-card group whose parent container,
//    any member, or any member's text descendant resolves a product-ish segment through
//    the SLOT table (product|products|productcard|productcards|productgrid|productlist)
//    emits {kind: "products-candidate", container, confidence: "conjecture"} — ALWAYS
//    conjecture. products-grid/products-carousel are recorded decisions only.
//
// 4. slide decision — NEVER emitted. Carousel intent is not decidable from NodeIR
//    geometry (peer-repeated groups are structurally identical to grids; NodeIR carries
//    no overlap evidence). The helper emits NO slide role and NO slide hint under any
//    structural configuration; a slide projection can only come from a recorded decision
//    document. A test asserts this invariant.
//
// Determinism: sections are visited in PageStructure order, children in document order;
// the output arrays are flattened in that order. Node inventory order is irrelevant
// (resolution is by id). Reasons cite locators and counts — never names — so identical
// structure under different layer names yields byte-identical output.

import type { NodeIRNode, PageStructureSection } from "../../core/types.js";

export type RoleHintConfidence = "observed" | "conjecture";

export interface RoleHintAssignment {
   /** design:// locator of the observed text node (sourceEvidence[0].locator). */
   sourceLocator: string;
   role: "content-lead" | "heading";
   /** Observed structural fact the suggestion rests on; never carries layer names. */
   reason: string;
   confidence: RoleHintConfidence;
}

export type RoleStructuralHint =
   | {
        kind: "card-grid";
        /** Locators of the peer group members, in document order. */
        containers: string[];
        columnCount: number;
        reason: string;
        confidence: "observed";
     }
   | {
        kind: "products-candidate";
        /** Locator of the group's parent container (or the section root). */
        container: string;
        reason: string;
        confidence: "conjecture";
     };

export interface RoleHintResult {
   /** Candidate projection assignments — suggestions; a recorded decision applies them. */
   assignments: RoleHintAssignment[];
   /** Parallel structural hints the coordinator/mapper may apply (card-grid) or review. */
   hints: RoleStructuralHint[];
}

// ---- SLOT naming-contract table (design-source naming spec / compose.ts TEXT_ROLE_TABLE) ------

/**
 * Naming-contract prefixes of the documented design-source naming table. Only names
 * carrying one of these prefixes speak the contract; raw layer content may itself
 * contain slashes ('CHAPTER 01 / AW 2026') and is never read as a contract signal.
 */
const CONVENTION_PREFIXES = new Set([
   "page",
   "site",
   "section",
   "slot",
   "decor",
]);

/**
 * The contract segment of a convention-prefixed name ('SLOT/Overline' -> 'overline'),
 * lowercased and reduced to [a-z0-9]; absent or non-convention prefix -> null.
 */
function contractSegment(name: string): string | null {
   const slash = name.indexOf("/");
   if (slash <= 0 || slash === name.length - 1) return null;
   const prefix = name
      .slice(0, slash)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
   if (!CONVENTION_PREFIXES.has(prefix)) return null;
   return name
      .slice(slash + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
}

const CONTENT_LEAD_SEGMENTS = new Set(["overline"]);
const HEADING_SEGMENTS = new Set(["heading"]);
const PRODUCTISH_SEGMENTS = new Set([
   "product",
   "products",
   "productcard",
   "productcards",
   "productgrid",
   "productlist",
]);

/** Leading loose-text cluster bound: the band is exactly 2..3 loose text nodes. */
const CLUSTER_MIN = 2;
const CLUSTER_MAX = 3;
/** An unprojected first band text longer than this is body copy, not an overline. */
const CONTENT_LEAD_MAX_NAME_LENGTH = 32;

// ---- Inventory helpers ------------------------------------------------------------------------

interface Inventory {
   byId: Map<string, NodeIRNode>;
   locatorOf(node: NodeIRNode): string | null;
}

function buildInventory(nodes: NodeIRNode[]): Inventory {
   const byId = new Map<string, NodeIRNode>();
   for (const n of nodes) byId.set(n.nodeId, n);
   return {
      byId,
      locatorOf: (n) => n.sourceEvidence?.[0]?.locator ?? null,
   };
}

function visibleChildren(inv: Inventory, id: string): NodeIRNode[] {
   const out: NodeIRNode[] = [];
   for (const childId of inv.byId.get(id)?.childrenNodeIds ?? []) {
      const child = inv.byId.get(childId);
      if (child && child.visible !== false) out.push(child);
   }
   return out;
}

/** Visible descendant kinds in document order (the node itself excluded). */
function descendantKindSequence(inv: Inventory, id: string): string[] {
   const seq: string[] = [];
   const walk = (nodeId: string): void => {
      for (const child of visibleChildren(inv, nodeId)) {
         seq.push(child.kind);
         walk(child.nodeId);
      }
   };
   walk(id);
   return seq;
}

function hasVisibleKindDescendant(
   inv: Inventory,
   id: string,
   kind: NodeIRNode["kind"],
): boolean {
   const walk = (nodeId: string): boolean => {
      for (const child of visibleChildren(inv, nodeId)) {
         if (child.kind === kind || walk(child.nodeId)) return true;
      }
      return false;
   };
   return walk(id);
}

function countVisibleTextDescendants(inv: Inventory, id: string): number {
   let count = 0;
   const walk = (nodeId: string): void => {
      for (const child of visibleChildren(inv, nodeId)) {
         if (child.kind === "text") count += 1;
         walk(child.nodeId);
      }
   };
   walk(id);
   return count;
}

function carriesVisibleMediaOrText(inv: Inventory, id: string): boolean {
   return (
      hasVisibleKindDescendant(inv, id, "media") ||
      hasVisibleKindDescendant(inv, id, "text")
   );
}

function isStructured(kind: NodeIRNode["kind"]): boolean {
   return kind === "container" || kind === "component";
}

// ---- Peer-card-group detection ----------------------------------------------------------------

interface CardGridGroup {
   members: NodeIRNode[];
   parent: NodeIRNode;
}

/**
 * Groups of >=2 visible sibling containers/components (section root children, then the
 * children of each PageStructure element container) whose visible descendant
 * kind-sequences are identical. Scan parents are deduplicated by node id and visited in
 * section-root-then-elements order, so group discovery order is deterministic.
 */
function detectCardGridGroups(
   inv: Inventory,
   sectionRootId: string,
   elementContainerIds: string[],
): CardGridGroup[] {
   const groups: CardGridGroup[] = [];
   const seenParents = new Set<string>();
   const parents: NodeIRNode[] = [];
   for (const id of [sectionRootId, ...elementContainerIds]) {
      if (seenParents.has(id)) continue;
      seenParents.add(id);
      const node = inv.byId.get(id);
      if (node) parents.push(node);
   }
   for (const parent of parents) {
      const firstIndexByKey = new Map<string, number>();
      const buckets: NodeIRNode[][] = [];
      for (const child of visibleChildren(inv, parent.nodeId)) {
         if (!isStructured(child.kind)) continue;
         const key = JSON.stringify(descendantKindSequence(inv, child.nodeId));
         const first = firstIndexByKey.get(key);
         if (first === undefined) {
            firstIndexByKey.set(key, buckets.length);
            buckets.push([child]);
         } else {
            buckets[first].push(child);
         }
      }
      for (const members of buckets) {
         if (members.length < 2) continue;
         const contentBearing = members.every(
            (m) =>
               carriesVisibleMediaOrText(inv, m.nodeId) ||
               contractSegment(m.name) !== null,
         );
         if (!contentBearing) continue;
         const allCarryContent = members.every((m) =>
            carriesVisibleMediaOrText(inv, m.nodeId),
         );
         // Two identical empty content frames are the two-column signature, not a grid.
         if (members.length < 3 && !allCarryContent) continue;
         groups.push({ members, parent });
      }
   }
   return groups;
}

// ---- Header-band detection --------------------------------------------------------------------

interface HeaderBandPair {
   lead: NodeIRNode;
   heading: NodeIRNode;
   clusterSize: number;
}

function detectHeaderBand(
   inv: Inventory,
   sectionRootId: string,
   peerMemberIds: Set<string>,
): HeaderBandPair | null {
   const cluster: NodeIRNode[] = [];
   let stopped = false;
   const visit = (id: string): void => {
      if (stopped) return;
      for (const child of visibleChildren(inv, id)) {
         if (stopped) return;
         if (child.kind === "text") {
            cluster.push(child);
            if (cluster.length > CLUSTER_MAX) stopped = true;
            continue;
         }
         if (
            child.kind === "icon" ||
            child.kind === "spacer" ||
            child.kind === "divider"
         )
            continue; // decoration never carries or bounds the band
         if (child.kind === "media") {
            stopped = true;
            return;
         }
         if (
            peerMemberIds.has(child.nodeId) ||
            hasVisibleKindDescendant(inv, child.nodeId, "media")
         ) {
            stopped = true;
            return;
         }
         // A component below the band-copy threshold is an action/CTA instance: the band
         // ends there. Containers without media always descend (empty slot frames and
         // text wrappers contribute their loose texts and nothing else).
         if (
            child.kind === "component" &&
            countVisibleTextDescendants(inv, child.nodeId) < 2
         ) {
            stopped = true;
            return;
         }
         visit(child.nodeId);
      }
   };
   visit(sectionRootId);
   if (cluster.length < CLUSTER_MIN || cluster.length > CLUSTER_MAX)
      return null;
   const lead = cluster[0];
   const heading = cluster[1];
   const leadSegment = contractSegment(lead.name);
   const headingSegment = contractSegment(heading.name);
   // The naming contract is never overridden: a named body/cta first text is not a band.
   if (leadSegment && !CONTENT_LEAD_SEGMENTS.has(leadSegment)) return null;
   if (headingSegment && !HEADING_SEGMENTS.has(headingSegment)) return null;
   // Position-only inference requires an overline-shaped (short) first text.
   if (!leadSegment && lead.name.length > CONTENT_LEAD_MAX_NAME_LENGTH)
      return null;
   return { lead, heading, clusterSize: cluster.length };
}

// ---- Entry point --------------------------------------------------------------------------------

/**
 * Derive deterministic candidate role assignments + structural hints from the pinned
 * node inventory and page structure. Pure: reads its inputs, mutates nothing.
 */
export function deriveRoleHints(
   nodes: NodeIRNode[],
   sections: PageStructureSection[],
): RoleHintResult {
   const inv = buildInventory(nodes);
   const nodeIdOfLocator = new Map<string, string>();
   for (const n of nodes) {
      const loc = inv.locatorOf(n);
      if (loc) nodeIdOfLocator.set(loc, n.nodeId);
   }

   const assignments: RoleHintAssignment[] = [];
   const hints: RoleStructuralHint[] = [];

   for (const section of sections) {
      const sectionLoc =
         section.sourceEvidence?.[0]?.locator ??
         `page-structure:${section.sectionId}`;
      const sectionRootId = section.sourceEvidence?.[0]?.locator
         ? nodeIdOfLocator.get(section.sourceEvidence[0].locator)
         : undefined;
      if (!sectionRootId) continue;

      const groups = detectCardGridGroups(
         inv,
         sectionRootId,
         section.elements
            .map((el) => el.elementId)
            .filter((id): id is string => typeof id === "string"),
      );
      const peerMemberIds = new Set<string>();
      for (const g of groups)
         for (const m of g.members) peerMemberIds.add(m.nodeId);

      // 1. header-band pair.
      const band = detectHeaderBand(inv, sectionRootId, peerMemberIds);
      if (band) {
         const leadLoc = inv.locatorOf(band.lead);
         const headingLoc = inv.locatorOf(band.heading);
         const leadSegment = contractSegment(band.lead.name);
         const headingSegment = contractSegment(band.heading.name);
         if (leadLoc && headingLoc) {
            const bandSuffix =
               " Role confirmed by the SLOT naming-contract table.";
            assignments.push({
               sourceLocator: leadLoc,
               role: "content-lead",
               reason:
                  `Header-band detector: first text of the leading loose-text cluster ` +
                  `(${band.clusterSize} texts) at the top of section ${sectionLoc}; ` +
                  `no media or parallel group precedes it.` +
                  (leadSegment ? bandSuffix : ""),
               confidence: leadSegment ? "observed" : "conjecture",
            });
            assignments.push({
               sourceLocator: headingLoc,
               role: "heading",
               reason:
                  `Header-band detector: second text of the leading loose-text cluster ` +
                  `(${band.clusterSize} texts) at the top of section ${sectionLoc}, ` +
                  `directly under the proposed content-lead.` +
                  (headingSegment ? bandSuffix : ""),
               confidence: headingSegment ? "observed" : "conjecture",
            });
         }
      }

      // 2./3. card-grid hints + (conjectural, never automatic) products candidates.
      for (const group of groups) {
         const memberLocators: string[] = [];
         let allLocated = true;
         for (const member of group.members) {
            const loc = inv.locatorOf(member);
            if (loc) memberLocators.push(loc);
            else allLocated = false;
         }
         const parentLoc = inv.locatorOf(group.parent);
         if (!allLocated || !parentLoc) continue;
         hints.push({
            kind: "card-grid",
            containers: memberLocators,
            columnCount: group.members.length,
            reason:
               `Peer-card detector: ${group.members.length} sibling containers with ` +
               `identical descendant kind sequences (parallel composition) under parent ` +
               `${parentLoc}; each member carries visible media/text descendants or a ` +
               `SLOT-named content frame.`,
            confidence: "observed",
         });
         const productish =
            (contractSegment(group.parent.name) !== null &&
               PRODUCTISH_SEGMENTS.has(
                  contractSegment(group.parent.name) as string,
               )) ||
            group.members.some((m) => {
               const seg = contractSegment(m.name);
               return seg !== null && PRODUCTISH_SEGMENTS.has(seg);
            }) ||
            group.members.some((m) =>
               descendantTextSegments(inv, m.nodeId).some((seg) =>
                  PRODUCTISH_SEGMENTS.has(seg),
               ),
            );
         if (productish) {
            hints.push({
               kind: "products-candidate",
               container: parentLoc,
               reason:
                  `Peer card group under parent ${parentLoc} resolves product-ish ` +
                  `naming through the SLOT naming-contract table; the helper never ` +
                  `auto-assigns a products role — a recorded decision is required.`,
               confidence: "conjecture",
            });
         }
      }
   }

   return { assignments, hints };
}

/** SLOT-table segments of every visible text descendant (may be empty). */
function descendantTextSegments(inv: Inventory, id: string): string[] {
   const segs: string[] = [];
   const walk = (nodeId: string): void => {
      for (const child of visibleChildren(inv, nodeId)) {
         if (child.kind === "text") {
            const seg = contractSegment(child.name);
            if (seg) segs.push(seg);
         }
         walk(child.nodeId);
      }
   };
   walk(id);
   return segs;
}
