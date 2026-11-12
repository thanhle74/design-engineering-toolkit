// [#72] W-D lane — deterministic role-hint helper tests (vitest, studio gate).
//
// Two layers of evidence:
//  1. synthesized NodeIR trees (small, in-test builders) pin each detector's predicate,
//     including the negatives and the never-slide invariant;
//  2. ONE source-grounded suite runs the helper over the committed issue-#18 live-read
//     artifacts (docs/evidence/issue-18/live-read-verified/{node-ir,page-structure}.json)
//     and pins the exact hints for the real Slaunchpad Homepage observation.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { deriveRoleHints } from "../semantic/role-hints.js";
import type {
   NodeIR,
   NodeIRNode,
   PageStructure,
   PageStructureSection,
} from "../../core/types.js";

// ---- Synthesized-tree builders -----------------------------------------------------------------

// The committed #18 artifacts live under docs/; locate the repo root by walking up from
// the working directory to the vitest config (import.meta.url is not file-scheme under
// the jsdom vitest environment).
function findRepoRoot(): string {
   let dir = process.cwd();
   for (let i = 0; i < 10; i += 1) {
      if (fs.existsSync(path.join(dir, "vitest.config.ts"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
   }
   return process.cwd();
}

const REPO_ROOT = findRepoRoot();

interface BuildSpec {
   kind?: NodeIRNode["kind"];
   name?: string;
   visible?: boolean;
   locator?: string | null;
   direction?: NodeIRNode["layout"]["direction"];
   children?: BuildSpec[];
}

let idCounter = 0;

function buildTree(
   spec: BuildSpec,
   parentNodeId: string | null,
   nodes: NodeIRNode[],
): string {
   idCounter += 1;
   const nodeId = `n-${String(idCounter).padStart(4, "0")}`;
   const childrenIds = (spec.children ?? []).map((c) =>
      buildTree(c, nodeId, nodes),
   );
   nodes.push({
      nodeId,
      kind: spec.kind ?? "container",
      name: spec.name ?? "Node",
      visible: spec.visible ?? true,
      childrenNodeIds: childrenIds,
      parentNodeId,
      layout: {
         direction: spec.direction ?? "column",
         positioning: "static",
         constraints: [],
         relativeSizes: [],
         overflow: "unknown",
      },
      sourceEvidence:
         spec.locator === null
            ? []
            : [
                 {
                    evidenceId: `ev-${nodeId}`,
                    kind: "document",
                    locator: spec.locator ?? `design://synthetic/${nodeId}`,
                    retrievedAt: "2026-11-12T00:00:00.000Z",
                 },
              ],
   });
   return nodeId;
}

function buildSection(
   rootLocator: string,
   elementIds: string[],
): PageStructureSection {
   return {
      sectionId: `s-${rootLocator}`,
      order: 0,
      name: "SECTION/Synthetic",
      role: "SECTION",
      layout: {
         direction: "column",
         positioning: "static",
         constraints: [],
         relativeSizes: [],
         overflow: "unknown",
      },
      elements: elementIds.map((elementId) => ({
         elementId,
         resolution: {
            status: "MAPPED",
            mappingConfidence: "high",
            diagnostics: [],
         },
      })),
      sourceEvidence: [
         {
            evidenceId: `ev-${rootLocator}`,
            kind: "document",
            locator: rootLocator,
            retrievedAt: "2026-11-12T00:00:00.000Z",
         },
      ],
   } as unknown as PageStructureSection;
}

function run(spec: BuildSpec) {
   idCounter = 0;
   const nodes: NodeIRNode[] = [];
   const rootId = buildTree(spec, null, nodes);
   // Mirror the real extraction: the PageStructure elements list names the section's SLOT
   // containers, which is exactly the composer's peer-group detection scope.
   const elementIds = nodes
      .filter((n) => n.name.startsWith("SLOT/") && n.childrenNodeIds.length > 0)
      .map((n) => n.nodeId);
   return deriveRoleHints(nodes, [
      buildSection(`design://synthetic/${rootId}`, elementIds),
   ]);
}

// A section-header band: section > headerComponent > wrapper > [lead, title] (+ optional extras).
function headerBandTree(extraLeadName?: string): BuildSpec {
   return {
      kind: "container",
      name: "SECTION/Synthetic",
      children: [
         {
            kind: "component",
            name: "Section Header",
            children: [
               {
                  kind: "container",
                  name: "Left",
                  children: [
                     { kind: "text", name: extraLeadName ?? "OVERLINE" },
                     { kind: "text", name: "Section Title" },
                  ],
               },
            ],
         },
         {
            kind: "container",
            name: "SLOT/Body",
            children: [
               {
                  kind: "component",
                  name: "Card",
                  children: [
                     {
                        kind: "container",
                        name: "Image",
                        children: [{ kind: "media", name: "Img" }],
                     },
                     {
                        kind: "container",
                        name: "Label",
                        children: [{ kind: "text", name: "Name" }],
                     },
                  ],
               },
            ],
         },
      ],
   };
}

/** Three identical card components (media + text descendant) under one container. */
function cardGridTree(
   siblingNames: string[],
   cardContent: BuildSpec[],
   cardsContainerName = "SLOT/Cards",
): BuildSpec {
   return {
      kind: "container",
      name: "SECTION/Synthetic",
      children: [
         {
            kind: "container",
            name: cardsContainerName,
            children: siblingNames.map((name) => ({
               kind: "component" as const,
               name,
               children: cardContent,
            })),
         },
      ],
   };
}

const mediaTextCard: BuildSpec[] = [
   {
      kind: "container",
      name: "Image",
      children: [{ kind: "media", name: "Img" }],
   },
   {
      kind: "container",
      name: "Label",
      children: [{ kind: "text", name: "Tile Name" }],
   },
];

// ---- 1. Detector predicates on synthesized trees ------------------------------------------------

describe("role-hints header-band detector", () => {
   it("proposes content-lead + heading for a leading text-only component band", () => {
      const { assignments, hints } = run(headerBandTree());
      expect(assignments.map((a) => [a.role, a.confidence])).toEqual([
         ["content-lead", "conjecture"],
         ["heading", "conjecture"],
      ]);
      expect(assignments[0].sourceLocator).toMatch(/design:\/\/synthetic\//);
      // the pair cites the two leading texts, in document order
      expect(assignments[0].reason).toContain("leading loose-text cluster");
      expect(assignments[1].reason).toContain(
         "directly under the proposed content-lead",
      );
      // the single trailing card does not form a peer group (N < 2)
      expect(hints).toEqual([]);
   });

   it("resolves confidence 'observed' when the SLOT naming-contract table carries the role", () => {
      const spec = headerBandTree();
      // rename the band texts to SLOT-prefixed role names, same shape
      spec.children![0].children![0].children![0].name = "SLOT/Overline";
      spec.children![0].children![0].children![1].name = "SLOT/Heading";
      const { assignments } = run(spec);
      expect(assignments.map((a) => [a.role, a.confidence])).toEqual([
         ["content-lead", "observed"],
         ["heading", "observed"],
      ]);
      expect(assignments[0].reason).toContain("SLOT naming-contract table");
   });

   it("suppresses the pair when the leading cluster overflows the 2..3 bound", () => {
      const spec = headerBandTree();
      spec.children![0].children![0].children!.splice(1, 0, {
         kind: "text",
         name: "Extra",
      });
      spec.children![0].children![0].children!.splice(1, 0, {
         kind: "text",
         name: "Extra 2",
      });
      const { assignments } = run(spec);
      expect(assignments).toEqual([]);
   });

   it("suppresses the pair when media precedes or bounds the band", () => {
      const spec = headerBandTree();
      spec.children!.unshift({
         kind: "container",
         name: "SLOT/Media",
         children: [{ kind: "media", name: "Bg" }],
      });
      expect(run(spec).assignments).toEqual([]);
   });

   it("suppresses the pair when only one loose text leads", () => {
      const spec = headerBandTree();
      spec.children![0].children![0].children = [
         { kind: "text", name: "Only One" },
      ];
      expect(run(spec).assignments).toEqual([]);
   });

   it("suppresses the pair when the first text is long and carries no SLOT role", () => {
      const long =
         "A first band text that is far too long to be an overline marker";
      expect(long.length).toBeGreaterThan(32);
      const { assignments } = run(headerBandTree(long));
      expect(assignments).toEqual([]);
   });

   it("suppresses the pair when the naming contract names the first text body", () => {
      const spec = headerBandTree();
      spec.children![0].children![0].children![0].name = "SLOT/Body";
      expect(run(spec).assignments).toEqual([]);
   });
});

describe("role-hints peer-card-group detector", () => {
   it("emits a card-grid hint for identical sibling cards and no role for them", () => {
      const { assignments, hints } = run(
         cardGridTree(["Card A", "Card B", "Card C"], mediaTextCard),
      );
      expect(assignments).toEqual([]); // card containers get NO new role
      expect(hints).toHaveLength(1);
      const hint = hints[0];
      if (hint.kind !== "card-grid") throw new Error("expected card-grid");
      expect(hint.columnCount).toBe(3);
      expect(hint.containers).toHaveLength(3);
      expect(hint.confidence).toBe("observed");
   });

   it("emits no card-grid hint for non-parallel (structurally different) siblings", () => {
      const spec = cardGridTree(["Card A", "Card B"], mediaTextCard);
      // second sibling loses its text label -> sequences differ -> no group
      spec.children![0].children![1].children = [
         {
            kind: "container",
            name: "Image",
            children: [{ kind: "media", name: "Img" }],
         },
      ];
      const { hints } = run(spec);
      expect(hints).toEqual([]);
   });

   it("suppresses an empty SLOT-named pair (the two-column signature) but accepts three", () => {
      const emptyFrames = (n: number): BuildSpec => ({
         kind: "container",
         name: "SECTION/Synthetic",
         children: Array.from({ length: n }, (_, i) => ({
            kind: "container" as const,
            name: `SLOT/CardFrame/${i + 1}`,
         })),
      });
      expect(run(emptyFrames(2)).hints).toEqual([]);
      const { hints } = run(emptyFrames(3));
      expect(hints).toHaveLength(1);
      expect(hints[0].kind).toBe("card-grid");
      if (hints[0].kind === "card-grid") expect(hints[0].columnCount).toBe(3);
   });

   it("emits a products-candidate conjecture (never a products role) for product-named groups", () => {
      const { assignments, hints } = run(
         cardGridTree(
            ["Card A", "Card B", "Card C"],
            mediaTextCard,
            "SLOT/ProductCards",
         ),
      );
      expect(assignments).toEqual([]); // products-grid/products-carousel NEVER auto-assigned
      const candidate = hints.find((h) => h.kind === "products-candidate");
      expect(candidate).toBeDefined();
      if (candidate?.kind === "products-candidate") {
         expect(candidate.confidence).toBe("conjecture");
         expect(candidate.reason).toContain("never");
      }
      // and the card-grid hint still stands alongside it
      expect(hints.some((h) => h.kind === "card-grid")).toBe(true);
   });

   it("does not emit a products-candidate for groups without contract product naming", () => {
      const { hints } = run(
         cardGridTree(
            [
               "Proto / Collection Tile",
               "Proto / Collection Tile",
               "Proto / Collection Tile",
            ],
            mediaTextCard,
         ),
      );
      expect(hints.some((h) => h.kind === "products-candidate")).toBe(false);
   });

   it("detects sibling groups through the PageStructure elements scope", () => {
      idCounter = 0;
      const nodes: NodeIRNode[] = [];
      const rootId = buildTree(
         cardGridTree(["Card A", "Card B"], mediaTextCard),
         null,
         nodes,
      );
      // find the SLOT/Cards container id and pass it as the section element
      const cardsContainer = nodes.find((n) => n.name === "SLOT/Cards");
      expect(cardsContainer).toBeDefined();
      const { hints } = deriveRoleHints(nodes, [
         buildSection(`design://synthetic/${rootId}`, [cardsContainer!.nodeId]),
      ]);
      expect(
         hints.some((h) => h.kind === "card-grid" && h.columnCount === 2),
      ).toBe(true);
   });
});

// ---- 2. Invariants ------------------------------------------------------------------------------

describe("role-hints invariants", () => {
   it("is deterministic in output order and independent of node inventory order", () => {
      const first = run(cardGridTree(["A", "B", "C"], mediaTextCard));
      const second = run(cardGridTree(["A", "B", "C"], mediaTextCard));
      expect(second).toEqual(first);
   });

   it("never proposes slide or products roles under any synthesized configuration", () => {
      // a carousel-looking configuration: 5 identical absolute siblings — still a card-grid
      const spec = cardGridTree(
         ["Look 1", "Look 2", "Look 3", "Look 4", "Look 5"],
         mediaTextCard,
      );
      spec.children![0].direction = "absolute";
      const { assignments, hints } = run(spec);
      for (const a of assignments) {
         expect(["content-lead", "heading"]).toContain(a.role);
      }
      for (const h of hints) {
         expect(["card-grid", "products-candidate"]).toContain(h.kind);
      }
      expect(
         hints.some((h) => h.kind === "card-grid" && h.columnCount === 5),
      ).toBe(true);
   });
});

// ---- 3. Source-grounded suite (committed issue-#18 live-read artifacts) -------------------------

describe("role-hints against the committed #18 Slaunchpad Homepage artifacts", () => {
   const irPath = `${REPO_ROOT}/docs/evidence/issue-18/live-read-verified/node-ir.json`;
   const psPath = `${REPO_ROOT}/docs/evidence/issue-18/live-read-verified/page-structure.json`;

   const ir = JSON.parse(fs.readFileSync(irPath, "utf8")) as NodeIR;
   const ps = JSON.parse(fs.readFileSync(psPath, "utf8")) as PageStructure;
   const result = deriveRoleHints(ir.nodes, ps.sections);

   const sectionNameByLocator = new Map<string, string>();
   for (const section of ps.sections) {
      const loc = section.sourceEvidence?.[0]?.locator;
      if (loc) sectionNameByLocator.set(loc, section.name);
   }

   it("proposes exactly the expected header-band pairs, all position-based", () => {
      for (let i = 0; i + 1 < result.assignments.length; i += 2) {
         expect(result.assignments[i].role).toBe("content-lead");
         expect(result.assignments[i + 1].role).toBe("heading");
      }
      expect(result.assignments).toHaveLength(20);
      expect(new Set(result.assignments.map((a) => a.sourceLocator)).size).toBe(
         20,
      );
      // every assignment is position-only (conjecture): no committed name carries the
      // SLOT role vocabulary on this source
      expect(
         result.assignments.every((a) => a.confidence === "conjecture"),
      ).toBe(true);
      // the four repeated Section Header bands are all detected
      for (const loc of [
         "design://figma-home-desktop/I256:96;250:28", // FeaturedCollections
         "design://figma-home-desktop/I254:62;250:28", // FeaturedProducts
         "design://figma-home-desktop/I299:312;250:28", // Lookbook
         "design://figma-home-desktop/I256:139;250:28", // EditorialMosaic
      ]) {
         expect(result.assignments.some((a) => a.sourceLocator === loc)).toBe(
            true,
         );
      }
      // the wide flat sections do NOT produce bands (4-text overflow / 1-text cluster)
      expect(
         result.assignments.some(
            (a) => a.sourceLocator === "design://figma-home-desktop/522:543",
         ),
      ).toBe(false); // ThePeople "THE PEOPLE"
      expect(
         result.assignments.some(
            (a) => a.sourceLocator === "design://figma-home-desktop/257:124",
         ),
      ).toBe(false); // ProductSpotlight "N°1"
   });

   it("emits card-grid hints with the observed peer-group counts", () => {
      const grids = result.hints.filter(
         (
            h,
         ): h is Extract<
            (typeof result.hints)[number],
            { kind: "card-grid" }
         > => h.kind === "card-grid",
      );
      expect(grids).toHaveLength(5);
      const byFirst = new Map(grids.map((g) => [g.containers[0], g]));
      expect(
         byFirst.get("design://figma-home-desktop/436:460")?.columnCount,
      ).toBe(3); // FeaturedCollections tiles
      expect(
         byFirst.get("design://figma-home-desktop/254:72")?.columnCount,
      ).toBe(4); // FeaturedProducts cards
      expect(
         byFirst.get("design://figma-home-desktop/299:322")?.columnCount,
      ).toBe(3); // Lookbook looks
      expect(
         byFirst.get("design://figma-home-desktop/284:407")?.columnCount,
      ).toBe(4); // EditorialMosaic columns
      expect(
         byFirst.get("design://figma-home-desktop/522:547")?.columnCount,
      ).toBe(4); // ThePeople looks
      // ThePeople: exactly the four PeopleLook frames, interleaved captions notwithstanding
      expect(
         byFirst.get("design://figma-home-desktop/522:547")?.containers,
      ).toEqual([
         "design://figma-home-desktop/522:547",
         "design://figma-home-desktop/522:549",
         "design://figma-home-desktop/522:551",
         "design://figma-home-desktop/522:553",
      ]);
      // FeaturedCollections: the trailing SLOT/EditorialFabricDetail is NOT in the group
      expect(
         byFirst.get("design://figma-home-desktop/436:460")?.containers,
      ).toEqual([
         "design://figma-home-desktop/436:460",
         "design://figma-home-desktop/436:472",
         "design://figma-home-desktop/436:484",
      ]);
   });

   it("emits exactly one products-candidate (FeaturedProducts) and never a products/slide role", () => {
      const candidates = result.hints.filter(
         (h) => h.kind === "products-candidate",
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe("conjecture");
      if (candidates[0].kind === "products-candidate") {
         expect(candidates[0].container).toBe(
            "design://figma-home-desktop/254:71",
         );
      }
      // no products-grid / products-carousel / slide role is EVER auto-proposed
      for (const a of result.assignments) {
         expect(["content-lead", "heading"]).toContain(a.role);
      }
      // CampaignEditorial's two empty SLOT media frames do NOT become a card-grid pair
      expect(
         result.hints.some(
            (h) =>
               h.kind === "card-grid" &&
               h.containers.includes("design://figma-home-desktop/299:301"),
         ),
      ).toBe(false);
   });

   it("is deterministic: identical result for a reversed node inventory", () => {
      const reversed = [...ir.nodes].reverse();
      expect(deriveRoleHints(reversed, ps.sections)).toEqual(result);
      expect(deriveRoleHints(ir.nodes, ps.sections)).toEqual(result);
   });
});
