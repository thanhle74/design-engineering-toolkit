// Issue #72 W-B suite: the structural section-shape handlers (native heading / header-band /
// card-grid), end-to-end over the COMPILED dist compose adapter — the real stdin ComposeInput ->
// stdout ComposeOutput subprocess contract the det core drives (the vitest suites cover the
// source handlers; this proves the built dispatcher + registered registry compose real bytes).
//   WB-T1 — header-band end-to-end: overline + display heading + trailing CTA (SLOT-named, no
//           projection needed) composes the VERIFIED byte chain verbatim with honest accounting.
//   WB-T2 — card-grid end-to-end: three kind-sequence-parallel tiles compose row(contained) >
//           column-group(default) > ONE column-line(default) > column(full-height) x3, equal
//           width apportionment [34,33,33] recorded, media/text/heading composed per column.
//   WB-T3 — neutrality + precedence: a section RENAMED but structurally identical still composes
//           the identical band bytes (shape detection never branches on names), and a legacy
//           hero-shaped section in the SAME page composes through the UNCHANGED legacy banner
//           composer (native heading/banner accounting proves the structural handlers did not
//           steal the hero).
// Fixtures are synthesized from the observed declaration shapes; the pinned registry/bindings
// are the committed real-derived example (all composed capabilities 'enabled'); no machine
// paths, no live sources.
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
   sha256Hex,
   stableContentHash,
} from "../../../../dist/src/modules/core/canonical.js";
import { bindingMapPinHash } from "../../../../dist/src/modules/core/design-source/extract.js";
import {
   buttonsElementHtml,
   imageElementHtml,
   pbStyleKey,
   textElementHtml,
} from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/elements.js";
import {
   columnCloseHtml,
   columnGroupCloseHtml,
   columnGroupOpenHtml,
   columnLineCloseHtml,
   columnLineFlexRule,
   columnLineOpenHtml,
   columnOpenHtml,
   columnWidthRule,
   headingElementHtml,
   rowContainedCloseHtml,
   rowContainedOpenHtml,
   rowInnerMinHeightRule,
   rowInnerOpenHtml,
   styleBlockHtml,
} from "../../../../dist/src/modules/magento/adapters/magento-pagebuilder-compose/elements-editorial.js";

const ADAPTER_ENTRY =
   "dist/src/modules/magento/adapters/magento-pagebuilder-compose/compose.js";

// ---- hermetic ComposeInput synthesis (schema-valid: n-/s-/e- + 12-hex ids, design:// locators,
// the committed real-derived registry + its pinned empty binding map) -----------------------------

const REPO_ROOT = process.cwd();
const REGISTRY = JSON.parse(
   fs.readFileSync(
      path.join(
         REPO_ROOT,
         "resources/examples/build/slaunchpad-home-real-derived/capability-registry.json",
      ),
      "utf8",
   ),
);
const BINDINGS = JSON.parse(
   fs.readFileSync(
      path.join(
         REPO_ROOT,
         "resources/examples/build/slaunchpad-home-real-derived/component-bindings.json",
      ),
      "utf8",
   ),
);

const PROFILE_ID = "slaunchpad-fashion";
const PLATFORM_ID = "magento-pagebuilder";
const SOURCE_ID = "wb-fixture-source";
const REVISION_ID = "wb-rev-000000000001";
const T0 = "2026-01-01T00:00:00.000Z";
const EV_ID = "e-000000000000";

const loc = (suffix) => `design://${SOURCE_ID}/${suffix}`;
const layout = (constraints = []) => ({
   direction: "column",
   positioning: "static",
   constraints,
   relativeSizes: [],
   overflow: "visible",
});
const heightFixed = (px) => [
   { axis: "height", type: "fixed", value: String(px) },
];

function node(id, kind, name, locator, children = [], extra = {}) {
   return {
      kind,
      name,
      childrenNodeIds: children.map((c) => c.nodeId),
      ...extra,
      nodeId: id,
      parentNodeId: null,
      layout: layout(),
      sourceEvidence: [
         {
            evidenceId: EV_ID,
            kind: "document",
            locator,
            retrievedAt: T0,
         },
      ],
   };
}

// Wire parentNodeId over a flat node list (the root's stays null).
function withParents(nodes, rootId) {
   const byId = new Map(nodes.map((x) => [x.nodeId, x]));
   for (const x of nodes) {
      for (const childId of x.childrenNodeIds) {
         const child = byId.get(childId);
         if (child) child.parentNodeId = x.nodeId;
      }
   }
   assert.equal(nodes.filter((x) => x.parentNodeId === null).length >= 1, true);
   void rootId;
   return nodes;
}

function contentEntry(valueRef, kind, rest = {}) {
   return { valueRef, kind, ...rest };
}

// Build + spawn the compiled adapter; returns the parsed ComposeOutput payload.
function runComposeAdapter(nodeIr, pageStructure, content) {
   const composeInput = {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      platformId: PLATFORM_ID,
      registry: REGISTRY,
      bindings: BINDINGS,
      nodeIr,
      pageStructure,
      content,
   };
   const stdout = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, ADAPTER_ENTRY)],
      {
         input: JSON.stringify(composeInput),
         encoding: "utf8",
      },
   );
   return JSON.parse(stdout);
}

// NodeIR + PageStructure + content assembly with real pin hashes (the same canonical hashing
// the core and the adapter use — dist canonical functions, not a second variant).
function buildPayloads(rootNodeId, nodes, sections, entries) {
   const nodeIr = {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      generatedAt: T0,
      source: {
         sourceId: SOURCE_ID,
         revisionId: REVISION_ID,
         accessedAt: T0,
      },
      rootNodeId,
      nodes,
      diagnostics: [],
   };
   const pageStructure = {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      generatedAt: T0,
      source: {
         sourceId: SOURCE_ID,
         revisionId: REVISION_ID,
         accessedAt: T0,
      },
      inputs: {
         nodeIrContentHash: stableContentHash(nodeIr),
         registryRevisionId: REGISTRY.source.revisionId,
         bindingMapContentHash: bindingMapPinHash(BINDINGS),
      },
      sections,
      diagnostics: [],
   };
   const content = {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      sourceRevisionId: REVISION_ID,
      entries,
   };
   return { nodeIr, pageStructure, content };
}

// A planned section: the plan's evidence locator resolves the section's NodeIR node (the
// dispatcher's sectionNodeId seam — verified by G28/G3 suites, reused verbatim here).
function plannedSection(id, order, name, locator, constraints = []) {
   return {
      sectionId: id.replace(/^n-/, "s-"),
      order,
      name,
      layout: layout(constraints),
      elements: [],
      sourceEvidence: [
         {
            evidenceId: EV_ID,
            kind: "document",
            locator,
            retrievedAt: T0,
         },
      ],
   };
}

// The header-band fixture tree (component-instance wrap, SLOT-named band texts) — structurally
// IDENTICAL for WB-T1 and WB-T3's renamed variant except the ids/locators/names passed in.
function bandTree(ids, locators, sectionName, componentName, heightPx) {
   const overline = node(
      ids.overline,
      "text",
      "SLOT/Overline",
      loc(locators.overline),
   );
   const title = node(ids.title, "text", "SLOT/Heading", loc(locators.title));
   const viewAll = node(ids.cta, "text", "SLOT/CtaLabel", loc(locators.cta));
   const wrap = node(ids.wrap, "component", componentName, loc(locators.wrap), [
      overline,
      title,
      viewAll,
   ]);
   const section = node(
      ids.section,
      "page-section",
      sectionName,
      loc(locators.section),
      [wrap],
      { layout: layout(heightFixed(heightPx)) },
   );
   const nodes = withParents([section, wrap, overline, title, viewAll]);
   const entries = [
      contentEntry(loc(locators.overline), "text", { text: "NEW SEASON" }),
      contentEntry(loc(locators.title), "text", { text: "The Autumn Edit" }),
      contentEntry(loc(locators.cta), "text", { text: "View All" }),
      contentEntry(loc(locators.cta), "link", {
         linkUrl: "{{store url='collections'}}",
         linkTarget: "_blank",
      }),
   ];
   return { nodes, section, wrap, overline, title, viewAll, entries };
}

function bandExpectedBytes(sectionNodeId, ctaNodeId, heightPx) {
   const innerKey = pbStyleKey(`${sectionNodeId}:inner`);
   return (
      styleBlockHtml([rowInnerMinHeightRule(innerKey, heightPx)]) +
      rowContainedOpenHtml() +
      rowInnerOpenHtml(innerKey) +
      textElementHtml([{ role: "content-lead", text: "NEW SEASON" }]) +
      headingElementHtml(2, "The Autumn Edit") +
      buttonsElementHtml(`${sectionNodeId}:band-buttons`, [
         {
            keySource: ctaNodeId,
            label: "View All",
            linkUrl: "{{store url='collections'}}",
            linkTarget: "_blank",
            variant: undefined,
         },
      ]) +
      rowContainedCloseHtml()
   );
}

// ---- checks -------------------------------------------------------------------------------------

export default async function registerWbSuite(checkAsync) {
   checkAsync(
      "WB-T1",
      "header-band composes end-to-end through the COMPILED adapter (text WYSIWYG + native heading + buttons pair, byte-verbatim)",
      async () => {
         const ids = {
            section: "n-000000000001",
            wrap: "n-000000000002",
            overline: "n-000000000003",
            title: "n-000000000004",
            cta: "n-000000000005",
         };
         const locators = {
            section: "900:1",
            wrap: "900:2",
            overline: "900:3",
            title: "900:4",
            cta: "900:5",
         };
         const tree = bandTree(
            ids,
            locators,
            "SECTION/NewArrivals/Band",
            "Section Header",
            200,
         );
         const { nodeIr, pageStructure, content } = buildPayloads(
            ids.section,
            tree.nodes,
            [
               plannedSection(
                  ids.section,
                  0,
                  "SECTION/NewArrivals/Band",
                  loc(locators.section),
                  heightFixed(200),
               ),
            ],
            tree.entries,
         );
         const out = runComposeAdapter(nodeIr, pageStructure, content);
         const expected = bandExpectedBytes(ids.section, ids.cta, 200);
         assert.equal(
            out.content,
            expected,
            "band fragment must be byte-verbatim through the built dispatcher",
         );
         assert.equal(
            out.contentHash,
            `sha256:${sha256Hex(out.content)}`,
            "content hash echoes the emitted bytes",
         );
         assert.equal(
            out.inputs.nodeIrContentHash,
            stableContentHash(nodeIr),
            "nodeIr pin hash echoes the canonical core hash",
         );
         const dispositions = Object.fromEntries(
            out.mapping.map((m) => [m.sourceNodeId, m.disposition]),
         );
         assert.deepEqual(dispositions, {
            [ids.section]: "mapped",
            [ids.wrap]: "mapped", // transparency fold of the component instance
            [ids.overline]: "mapped",
            [ids.title]: "mapped",
            [ids.cta]: "mapped",
         });
         const headingEntry = out.mapping.find(
            (m) => m.sourceNodeId === ids.title,
         );
         assert.equal(
            headingEntry?.target?.capabilityId,
            "magento_pagebuilder/heading",
         );
         assert.equal(
            out.diagnostics.length,
            0,
            "no honest-gap records on the fully-resolved band",
         );
         return "byte-verbatim row>text+heading+buttons band over the compiled adapter; every node mapped";
      },
   );

   checkAsync(
      "WB-T2",
      "card-grid composes end-to-end through the COMPILED adapter (row > column-group > ONE column-line > 3 columns, equal apportionment)",
      async () => {
         const ids = {
            section: "n-200000000001",
            t1: "n-200000000002",
            t1m: "n-200000000003",
            t1h: "n-200000000004",
            t1b: "n-200000000005",
            t2: "n-200000000006",
            t2m: "n-200000000007",
            t2h: "n-200000000008",
            t2b: "n-200000000009",
            t3: "n-20000000000a",
            t3m: "n-20000000000b",
            t3h: "n-20000000000c",
            t3b: "n-20000000000d",
         };
         const tile = (n, m, h, b, l) => {
            const media = node(m, "media", `${n} Image`, loc(`${l}m`));
            const heading = node(h, "text", "SLOT/Heading", loc(`${l}h`));
            const body = node(b, "text", "SLOT/Body", loc(`${l}b`));
            const group = node(n, "container", `Tile/${n}`, loc(`${l}g`), [
               media,
               heading,
               body,
            ]);
            return { group, media, heading, body };
         };
         const a = tile(ids.t1, ids.t1m, ids.t1h, ids.t1b, "910:2");
         const b = tile(ids.t2, ids.t2m, ids.t2h, ids.t2b, "920:2");
         const c = tile(ids.t3, ids.t3m, ids.t3h, ids.t3b, "930:2");
         const section = node(
            ids.section,
            "page-section",
            "SECTION/Collection/Tiles",
            loc("940:1"),
            [a.group, b.group, c.group],
            { layout: layout(heightFixed(300)) },
         );
         const nodes = withParents([
            section,
            a.group,
            a.media,
            a.heading,
            a.body,
            b.group,
            b.media,
            b.heading,
            b.body,
            c.group,
            c.media,
            c.heading,
            c.body,
         ]);
         const entries = [
            contentEntry(loc("910:2m"), "media", {
               mediaUrl: "{{media url=tile-1.jpg}}",
            }),
            contentEntry(loc("910:2h"), "text", { text: "Tile One" }),
            contentEntry(loc("910:2b"), "text", { text: "24 pieces" }),
            contentEntry(loc("920:2m"), "media", {
               mediaUrl: "{{media url=tile-2.jpg}}",
            }),
            contentEntry(loc("920:2h"), "text", { text: "Tile Two" }),
            contentEntry(loc("920:2b"), "text", { text: "Ceramic" }),
            contentEntry(loc("930:2m"), "media", {
               mediaUrl: "{{media url=tile-3.jpg}}",
            }),
            contentEntry(loc("930:2h"), "text", { text: "Tile Three" }),
            contentEntry(loc("930:2b"), "text", { text: "Linen" }),
         ];
         const { nodeIr, pageStructure, content } = buildPayloads(
            ids.section,
            nodes,
            [
               plannedSection(
                  ids.section,
                  0,
                  "SECTION/Collection/Tiles",
                  loc("940:1"),
                  heightFixed(300),
               ),
            ],
            entries,
         );
         const out = runComposeAdapter(nodeIr, pageStructure, content);
         // Unconstrained tile widths -> equal largest-remainder apportionment [34,33,33].
         const innerKey = pbStyleKey(`${ids.section}:inner`);
         const lineKey = pbStyleKey(`${ids.section}:line-0`);
         const column = (tileId, mediaUrl, title, body) =>
            columnOpenHtml(pbStyleKey(tileId)) +
            imageElementHtml(mediaUrl) +
            headingElementHtml(2, title) +
            textElementHtml([{ role: "body", text: body }]) +
            columnCloseHtml();
         const expected =
            styleBlockHtml([
               rowInnerMinHeightRule(innerKey, 300),
               columnLineFlexRule(lineKey),
               columnWidthRule(pbStyleKey(ids.t1), 34),
               columnWidthRule(pbStyleKey(ids.t2), 33),
               columnWidthRule(pbStyleKey(ids.t3), 33),
            ]) +
            rowContainedOpenHtml() +
            rowInnerOpenHtml(innerKey) +
            columnGroupOpenHtml() +
            columnLineOpenHtml(lineKey) +
            column(
               ids.t1,
               "{{media url=tile-1.jpg}}",
               "Tile One",
               "24 pieces",
            ) +
            column(ids.t2, "{{media url=tile-2.jpg}}", "Tile Two", "Ceramic") +
            column(ids.t3, "{{media url=tile-3.jpg}}", "Tile Three", "Linen") +
            columnLineCloseHtml() +
            columnGroupCloseHtml() +
            rowContainedCloseHtml();
         assert.equal(
            out.content,
            expected,
            "card-grid fragment must be byte-verbatim through the built dispatcher",
         );
         assert.equal(
            out.content.match(/data-content-type="column-line"/g)?.length,
            1,
            "exactly ONE column-line (the pinned uncapped column-children policy)",
         );
         const dispositions = Object.fromEntries(
            out.mapping.map((m) => [m.sourceNodeId, m.disposition]),
         );
         assert.deepEqual(dispositions, {
            [ids.section]: "mapped",
            [ids.t1]: "mapped",
            [ids.t2]: "mapped",
            [ids.t3]: "mapped",
            [ids.t1m]: "mapped",
            [ids.t2m]: "mapped",
            [ids.t3m]: "mapped",
            [ids.t1h]: "mapped",
            [ids.t2h]: "mapped",
            [ids.t3h]: "mapped",
            [ids.t1b]: "mapped",
            [ids.t2b]: "mapped",
            [ids.t3b]: "mapped",
         });
         assert.equal(
            out.diagnostics.filter((d) => d.severity === "error").length,
            0,
         );
         assert.ok(
            out.diagnostics.some(
               (d) =>
                  d.code === "NOT_VERIFIED" &&
                  d.message.includes("no fixed-width constraints"),
            ),
            "the equal-apportionment fallback is recorded, not inferred",
         );
         assert.ok(
            out.diagnostics.some(
               (d) =>
                  d.code === "NOT_VERIFIED" &&
                  d.message.includes("no native aspect/crop field"),
            ),
            "the media fidelity limit is recorded",
         );
         return "byte-verbatim 3-tile column chain over the compiled adapter; 13/13 nodes mapped; fallback + fidelity recorded";
      },
   );

   checkAsync(
      "WB-T3",
      "renamed-but-identical band still composes; the legacy hero shape is untouched in the SAME page",
      async () => {
         // Section A: the WB-T1 band, renamed + re-id'd — shape detection is structural only.
         const bandIds = {
            section: "n-300000000001",
            wrap: "n-300000000002",
            overline: "n-300000000003",
            title: "n-300000000004",
            cta: "n-300000000005",
         };
         const bandLocators = {
            section: "950:1",
            wrap: "950:2",
            overline: "950:3",
            title: "950:4",
            cta: "950:5",
         };
         const band = bandTree(
            bandIds,
            bandLocators,
            "SECTION/Promos/Leaderboard-Renamed-9f3a",
            "Whatever Wrap",
            160,
         );
         // Section B: the legacy hero shape (background media + role-resolved overlaid text).
         const heroIds = {
            section: "n-300000000006",
            media: "n-300000000007",
            heading: "n-300000000008",
            body: "n-300000000009",
         };
         const heroMedia = node(
            heroIds.media,
            "media",
            "Hero Cover",
            loc("960:7"),
         );
         const heroHeading = node(
            heroIds.heading,
            "text",
            "SLOT/Heading",
            loc("960:8"),
         );
         const heroBody = node(heroIds.body, "text", "SLOT/Body", loc("960:9"));
         const heroSection = node(
            heroIds.section,
            "page-section",
            "SECTION/Hero/Primary",
            loc("960:1"),
            [heroMedia, heroHeading, heroBody],
            { layout: layout(heightFixed(480)) },
         );
         const nodes = withParents([
            ...band.nodes,
            heroSection,
            heroMedia,
            heroHeading,
            heroBody,
         ]);
         const entries = [
            ...band.entries,
            contentEntry(loc("960:7"), "media", {
               mediaUrl: "{{media url=wysiwyg/hero.jpg}}",
            }),
            contentEntry(loc("960:8"), "text", { text: "The Quiet Grandeur" }),
            contentEntry(loc("960:9"), "text", {
               text: "Refined tailoring, knitwear and leather.",
            }),
         ];
         const { nodeIr, pageStructure, content } = buildPayloads(
            bandIds.section,
            nodes,
            [
               plannedSection(
                  bandIds.section,
                  0,
                  "SECTION/Promos/Leaderboard-Renamed-9f3a",
                  loc(bandLocators.section),
                  heightFixed(160),
               ),
               plannedSection(
                  heroIds.section,
                  1,
                  "SECTION/Hero/Primary",
                  loc("960:1"),
                  heightFixed(480),
               ),
            ],
            entries,
         );
         const out = runComposeAdapter(nodeIr, pageStructure, content);
         const bandFragment = bandExpectedBytes(
            bandIds.section,
            bandIds.cta,
            160,
         );
         assert.ok(
            out.content.startsWith(bandFragment),
            "the renamed band composes byte-identically (shape detection never branches on names)",
         );
         assert.ok(
            out.content
               .slice(bandFragment.length)
               .includes('data-content-type="banner" data-appearance="poster"'),
            "the hero section composes through the UNCHANGED legacy banner composer",
         );
         const heroBg = out.mapping.find(
            (m) => m.sourceNodeId === heroIds.media,
         );
         assert.equal(
            heroBg?.target?.capabilityId,
            "magento_pagebuilder/banner",
         );
         assert.equal(heroBg?.target?.nativeElement, "wrapper");
         assert.equal(
            heroBg?.disposition,
            "mapped",
            "the hero's background media maps through the legacy banner shape",
         );
         const heroSlice = out.content.slice(bandFragment.length);
         assert.ok(
            !heroSlice.includes('data-content-type="heading"'),
            "the structural handlers did not steal the hero: no native heading in the hero fragment",
         );
         const heroSectionEntry = out.mapping.find(
            (m) => m.sourceNodeId === heroIds.section,
         );
         assert.equal(heroSectionEntry?.disposition, "mapped");
         assert.ok(
            (heroSectionEntry?.target?.nativeField ?? "").includes("banner"),
            "the hero section's mapping names the banner chain",
         );
         return "renamed band composes byte-identically; legacy hero composes banner through the unchanged composer";
      },
   );
}
