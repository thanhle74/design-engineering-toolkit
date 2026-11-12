// Issue #14 G2 suite: design-source structural extraction. Registers async checks on the shared
// run-all runner: the materialized NodeIR/PageStructure/SourceReview contracts (positive +
// committed-example parity), the every-node accountability ledger, chrome exclusion, stable
// hashed ids across revisions, determinism, no-write/dry-run truth, the negative graph cases
// (cycle / dangling child / duplicate locator), scope escapes, cross-project and cross-revision
// mixing, plan-on-PageStructure integration, the second design source (core neutrality), and the
// neutrality scans over the new surfaces.
import assert from "node:assert";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { main } from "../../../../dist/src/core/cli/main.js";
import {
   stableContentHash,
   canonicalStringify,
   stripVolatile,
} from "../../../../dist/src/core/canonical.js";
import { deriveNodeId } from "../../../../dist/src/core/design-source/extract.js";
import { SnapshotDesignSourcePort } from "../../../../dist/src/core/design-source/port.js";
import {
   loadAdapters,
   runAdapter,
} from "../../../../dist/src/core/adapter-runtime.js";
import {
   toSnapshotNodes,
   kindOf,
   MAX_NODES,
} from "../../../../dist/src/modules/figma/adapters/design-source-figma-live/figma-map.js";

const FIX = path.join(
   path.dirname(new URL(import.meta.url).pathname),
   "fixtures",
);
const G2 = path.join(FIX, "g2-design-source");
const LIVE = path.join(FIX, "g2-figma-live");
import { REPO_ROOT } from "../../../../src/core/__tests__/repo-root.mjs";
const REPO = REPO_ROOT;
// [63] the engine lives at the checkout root: src/core + src/modules/**/adapters/ + resources/schemas/ + dist/. ([68] module-owned adapters)
const CORE = REPO;
const CORE_FIXTURES = path.join(
   REPO_ROOT,
   "src",
   "core",
   "__tests__",
   "fixtures",
);
const PROFILE = path.join(
   CORE_FIXTURES,
   "negative/profile-g2-design-fixture.fixture.json",
);
const PROFILE_B = path.join(
   CORE_FIXTURES,
   "negative/profile-g2-design-secondary.fixture.json",
);
const REGISTRY = path.join(G2, "g2-capability-registry.fixture.json");
const BINDINGS = path.join(G2, "g2-component-bindings.fixture.json");
const ROOT_ARGS = [
   "--profile",
   PROFILE,
   "--project",
   G2,
   "--design-file",
   "design-tree-primary.fixture.json",
   "--design-node",
   "100:1",
];

// Expected accountability for tree A at revision g2-fixture-rev-0001 (hand-derived, asserted exact).
const EXPECTED_DISPOSITIONS = {
   MAPPED: 11,
   EXCLUDED_WITH_REASON: 5,
   DECORATION_MERGED: 2,
   REFERENCE_ONLY: 3,
   NEEDS_REVIEW: 4,
};
const EXPECTED_CLASSES = {
   SITE_CHROME: 3,
   EDITORIAL_SECTION: 11,
   SHARED_COMPONENT: 6,
   PRESENTATIONAL: 2,
   UNKNOWN_OR_AMBIGUOUS: 3,
};
const NODE_COUNT = 25;
const SECTION_NAMES = [
   "SECTION/Hero/Primary",
   "SECTION/FeaturedProducts",
   "SECTION/CampaignWidget",
];

async function runCli(args, env = {}) {
   const out = [];
   const err = [];
   const code = await main(
      args,
      { ...env },
      { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) },
   );
   return { code, out: out.join("\n"), err: err.join("\n") };
}

function extractArgs(extra = []) {
   return ["extract", ...ROOT_ARGS, ...extra];
}

export default async function registerG2Suite(checkAsync) {
   checkAsync(
      "G2-T23a",
      "materialized G2 schemas validate their committed worked examples",
      async () => {
         const { validateContract } =
            await import("../../../../dist/src/core/schema-registry.js");
         for (const [contract, file] of [
            ["node-ir", "node-ir.g2-fixture.example.json"],
            ["page-structure", "page-structure.g2-fixture.example.json"],
            ["source-review", "source-review.g2-fixture.example.json"],
         ]) {
            const payload = JSON.parse(
               fs.readFileSync(
                  path.join(REPO, "resources/examples/converter", file),
                  "utf8",
               ),
            );
            const check = validateContract(contract, payload);
            assert.ok(
               check.valid,
               `${file} must validate: ${check.errors.slice(0, 3).join("; ")}`,
            );
         }
         const snap = {
            schemaVersion: 1,
            sourceId: "s",
            revisionId: "r",
            accessedAt: "1970-01-01T00:00:00Z",
            rootLocator: "a:1",
            nodes: [
               { locator: "a:1", kind: "page", name: "PAGE/X", children: [] },
            ],
         };
         const snapCheck = validateContract("design-source-snapshot", snap);
         assert.ok(
            snapCheck.valid,
            `snapshot transport example must validate: ${snapCheck.errors.join("; ")}`,
         );
         return "3 converter examples + snapshot transport valid";
      },
   );

   checkAsync(
      "G2-T23b",
      "committed G2 examples equal a fresh extract (all observation timestamps stripped)",
      async () => {
         const r = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]),
            "--json",
         ]);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
         const o = JSON.parse(r.out).output;
         for (const [key, file] of [
            ["nodeIr", "node-ir.g2-fixture.example.json"],
            ["pageStructure", "page-structure.g2-fixture.example.json"],
            ["review", "source-review.g2-fixture.example.json"],
         ]) {
            const committed = JSON.parse(
               fs.readFileSync(
                  path.join(REPO, "resources/examples/converter", file),
                  "utf8",
               ),
            );
            assert.equal(
               canonicalStringify(stripVolatile(o[key])),
               canonicalStringify(stripVolatile(committed)),
               `${file} drifts from a fresh run`,
            );
         }
         return "3/3 examples reproducible (deterministic extraction)";
      },
   );

   checkAsync(
      "G2-T24a",
      "extract (pinned registry+bindings): full inventory, exact accountability, chrome excluded from the plan",
      async () => {
         const r = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]),
            "--json",
         ]);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
         const o = JSON.parse(r.out).output;
         const { nodeIr, pageStructure, review } = o;
         // Full inventory: every descendant accounted for exactly once.
         assert.equal(nodeIr.nodes.length, NODE_COUNT);
         assert.equal(review.counts.total, NODE_COUNT);
         assert.deepEqual(review.counts.byDisposition, EXPECTED_DISPOSITIONS);
         assert.deepEqual(review.counts.byClass, EXPECTED_CLASSES);
         assert.equal(
            review.entries.length,
            nodeIr.nodes.length,
            "one review entry per node",
         );
         // Document order preserved on the root; parent/children agreement.
         const byId = new Map(nodeIr.nodes.map((n) => [n.nodeId, n]));
         const root = byId.get(nodeIr.rootNodeId);
         assert.equal(root.name, "PAGE/Home/Desktop");
         assert.equal(root.parentNodeId, null);
         assert.equal(
            root.kind,
            "page-section",
            "the selected page root maps to page-section",
         );
         for (const n of nodeIr.nodes)
            for (const c of n.childrenNodeIds)
               assert.equal(byId.get(c).parentNodeId, n.nodeId);
         // Chrome: present in the review, absent from the plan.
         const chrome = review.entries.filter(
            (e) => e.semanticClass === "SITE_CHROME",
         );
         assert.equal(chrome.length, EXPECTED_CLASSES.SITE_CHROME);
         assert.ok(
            chrome.every(
               (e) =>
                  e.disposition === "EXCLUDED_WITH_REASON" &&
                  e.reason.includes("theme-owned"),
            ),
         );
         const sectionNames = pageStructure.sections.map((s) => s.name);
         assert.deepEqual(sectionNames, SECTION_NAMES);
         assert.ok(
            sectionNames.every((s) => !s.startsWith("SITE/")),
            "no site chrome planned",
         );
         // The bare 'Footer' is ambiguous: NEEDS_REVIEW, never excluded by label, never planned.
         const footer = review.entries.find((e) =>
            e.reason.includes("undecidable"),
         );
         assert.ok(
            footer &&
               footer.semanticClass === "UNKNOWN_OR_AMBIGUOUS" &&
               footer.disposition === "NEEDS_REVIEW",
         );
         assert.ok(
            !sectionNames.includes("Footer"),
            "ambiguous footer must not be auto-planned",
         );
         // Hidden node: inventoried, excluded with reason, not planned.
         const hidden = review.entries.find((e) =>
            e.reason.includes("Hidden in the source"),
         );
         assert.ok(hidden && hidden.disposition === "EXCLUDED_WITH_REASON");
         assert.ok(
            !nodeIr.nodes.find((n) => n.name === "SECTION/DraftBanner")
               .visible === false
               ? false
               : true,
            "hidden flag carried",
         );
         assert.equal(
            byId.get(
               nodeIr.nodes.find((n) => n.name === "SECTION/DraftBanner")
                  .nodeId,
            ).visible,
            false,
         );
         // Unknown kind stays unknown + NOT_VERIFIED (never guessed into a near-miss bucket).
         const mystery = nodeIr.nodes.find((n) => n.name === "MysteryBox");
         assert.equal(mystery.kind, "unknown");
         assert.ok(
            nodeIr.diagnostics.some(
               (x) =>
                  x.code === "NOT_VERIFIED" && x.subject?.id === mystery.nodeId,
            ),
         );
         // 40/60 nested row layout preserved verbatim (sorted by target).
         const row = nodeIr.nodes.find((n) => n.name === "SECTION/HeroRow");
         assert.equal(row.layout.direction, "row");
         assert.deepEqual(
            row.layout.relativeSizes.map((r) => r.ratio),
            [0.4, 0.6].sort(),
         );
         // Instances resolve only via the pinned binding: exact target, never invented.
         const mappedInstances = review.entries.filter(
            (e) =>
               e.semanticClass === "SHARED_COMPONENT" &&
               e.disposition === "MAPPED",
         );
         assert.equal(
            mappedInstances.length,
            2,
            "two instances bound through the single component binding",
         );
         assert.ok(
            mappedInstances.every(
               (e) =>
                  e.provisionalTarget?.capabilityIds?.[0] === "flatcms/teaser",
            ),
         );
         const section1 = pageStructure.sections.find(
            (s) => s.name === "SECTION/FeaturedProducts",
         );
         assert.equal(section1.elements.length, 2);
         assert.ok(
            section1.elements.every(
               (e) =>
                  e.resolution.status === "mapped" &&
                  e.target?.capabilityId === "flatcms/teaser" &&
                  e.bindingId,
            ),
         );
         // The external widget stays custom-required pending — no fake mapping.
         const external = review.entries.find((e) =>
            e.reason.includes(
               "does not resolve to an inventoried component definition",
            ),
         );
         assert.ok(
            external &&
               external.semanticClass === "SHARED_COMPONENT" &&
               external.disposition === "NEEDS_REVIEW",
         );
         assert.deepEqual(external.provisionalTarget, {
            category: "custom-required",
         });
         // Evidence: scheme-whitelisted design:// locators at the pinned revision, on every node.
         for (const n of nodeIr.nodes) {
            assert.ok(n.sourceEvidence.length >= 1);
            for (const ev of n.sourceEvidence)
               assert.ok(
                  /^design:\/\//.test(ev.locator) &&
                     ev.sourceRevisionId === "g2-fixture-rev-0001",
               );
         }
         return `${NODE_COUNT} nodes, ${review.counts.byDisposition.NEEDS_REVIEW} needs-review, ${pageStructure.sections.length} planned sections`;
      },
   );

   checkAsync(
      "G2-T24b",
      "extract (no registry): unbound components stay custom-required, sections honestly unmapped",
      async () => {
         const r = await runCli(extractArgs(["--json"]));
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
         const o = JSON.parse(r.out).output;
         assert.deepEqual(o.review.counts.byDisposition, {
            MAPPED: 9,
            EXCLUDED_WITH_REASON: 5,
            DECORATION_MERGED: 2,
            REFERENCE_ONLY: 3,
            NEEDS_REVIEW: 6,
         });
         const pending = o.review.entries.filter(
            (e) => e.provisionalTarget?.category === "custom-required",
         );
         assert.equal(
            pending.length,
            3,
            "two unbound instances + one invalid-ref instance pending custom-required",
         );
         const featured = o.pageStructure.sections.find(
            (s) => s.name === "SECTION/FeaturedProducts",
         );
         assert.equal(
            featured.elements.length,
            0,
            "unbound instances are not planned as mapped elements",
         );
         assert.ok(
            !("registryRevisionId" in o.pageStructure.inputs),
            "no registry pin without a registry",
         );
         return "6 needs-review, unbound sections honest";
      },
   );

   checkAsync(
      "G2-T25a",
      "no-write default, --dry-run, and truthful --out receipt (4 artifacts)",
      async () => {
         const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-out-"));
         const plain = await runCli(
            extractArgs([
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--json",
            ]),
         );
         assert.equal(plain.code, 0);
         assert.equal(
            fs.readdirSync(outDir).length,
            0,
            "no --out -> nothing written",
         );
         const dryDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-dry-"));
         const dry = await runCli([
            ...extractArgs([
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--out",
               dryDir,
               "--dry-run",
            ]),
         ]);
         assert.equal(dry.code, 0);
         assert.equal(
            fs.readdirSync(dryDir).length,
            0,
            "dry-run writes nothing",
         );
         const withOut = await runCli([
            ...extractArgs([
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--out",
               outDir,
            ]),
            "--json",
         ]);
         assert.equal(withOut.code, 0);
         assert.deepEqual(fs.readdirSync(outDir).sort(), [
            "node-ir.json",
            "page-structure.json",
            "source-review.json",
            "tool-run.json",
         ]);
         const persisted = JSON.parse(
            fs.readFileSync(path.join(outDir, "tool-run.json"), "utf8"),
         );
         assert.equal(persisted.wroteFiles, true);
         assert.equal(persisted.command, "extract");
         const terminal = JSON.parse(plain.out).run;
         assert.equal(terminal.wroteFiles, false);
         return "write truth agrees across receipt/terminal/disk";
      },
   );

   checkAsync(
      "G2-T25b",
      "determinism: two runs produce identical volatile hashes and stable node ids",
      async () => {
         const a = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]),
            "--json",
         ]);
         const b = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]),
            "--json",
         ]);
         assert.equal(a.code, 0, a.err);
         const ra = JSON.parse(a.out);
         const rb = JSON.parse(b.out);
         const roles = (x) =>
            Object.fromEntries(
               x.run.artifacts.map((art) => [
                  art.role,
                  art.volatileContentHash,
               ]),
            );
         assert.deepEqual(
            roles(ra),
            roles(rb),
            "volatileContentHash identical across runs",
         );
         const ids = (x) =>
            x.output.nodeIr.nodes
               .map((n) => n.nodeId)
               .sort()
               .join(",");
         assert.equal(ids(ra), ids(rb), "node ids stable");
         return "byte-stable across runs";
      },
   );

   checkAsync(
      "G2-T25c",
      "revision stability: a source revision bump keeps every node id, changes the payload hash + pins",
      async () => {
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-rev-"));
         const tree = JSON.parse(
            fs.readFileSync(
               path.join(G2, "design-tree-primary.fixture.json"),
               "utf8",
            ),
         );
         tree.revisionId = "g2-fixture-rev-0002";
         fs.writeFileSync(
            path.join(tmp, "design-tree-primary.fixture.json"),
            JSON.stringify(tree, null, 2) + "\n",
         );
         const before = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]),
            "--json",
         ]);
         const after = await runCli([
            "extract",
            "--profile",
            PROFILE,
            "--project",
            tmp,
            "--design-file",
            "design-tree-primary.fixture.json",
            "--design-node",
            "100:1",
            "--registry",
            REGISTRY,
            "--bindings",
            BINDINGS,
            "--json",
         ]);
         assert.equal(after.code, 0, after.err);
         const A = JSON.parse(before.out).output;
         const B = JSON.parse(after.out).output;
         const idsA = A.nodeIr.nodes
            .map((n) => n.nodeId)
            .sort()
            .join(",");
         const idsB = B.nodeIr.nodes
            .map((n) => n.nodeId)
            .sort()
            .join(",");
         assert.equal(idsA, idsB, "locator-keyed ids are revision-independent");
         assert.notEqual(
            A.nodeIr.source.revisionId,
            B.nodeIr.source.revisionId,
            "revisions pinned and distinct",
         );
         assert.notEqual(
            A.pageStructure.inputs.nodeIrContentHash,
            B.pageStructure.inputs.nodeIrContentHash,
            "payload hash moves with the revision",
         );
         assert.notEqual(
            stableContentHash(A.nodeIr),
            stableContentHash(B.nodeIr),
         );
         return "ids stable, revision tracked at payload level";
      },
   );

   checkAsync(
      "G2-T26a",
      "negative graphs fail closed with EVIDENCE_MISSING (cycle / dangling child / duplicate locator)",
      async () => {
         for (const [file, label] of [
            ["tree-neg-cycle.fixture.json", "cycle"],
            ["tree-neg-missing-child.fixture.json", "dangling child"],
            ["tree-neg-dup-locator.fixture.json", "duplicate locator"],
         ]) {
            const r = await runCli([
               "extract",
               "--profile",
               PROFILE,
               "--project",
               G2,
               "--design-file",
               file,
               "--design-node",
               "neg:1",
               "--json",
            ]);
            assert.equal(r.code, 1, `${label} must exit 1, got ${r.code}`);
            const run = JSON.parse(r.out).run;
            assert.ok(
               run.converterDiagnostics.some(
                  (x) =>
                     x.code === "EVIDENCE_MISSING" && x.severity === "error",
               ),
               `${label}: ${JSON.stringify(run.converterDiagnostics)}`,
            );
            assert.equal(
               run.artifacts.length,
               0,
               `${label}: no artifacts from a broken graph`,
            );
         }
         return "3 broken graphs rejected, nothing emitted";
      },
   );

   checkAsync(
      "G2-T26b",
      "scope escapes refused: unknown root locator (adapter) and out-of-scope port reads (core)",
      async () => {
         const r = await runCli([
            "extract",
            "--profile",
            PROFILE,
            "--project",
            G2,
            "--design-file",
            "design-tree-primary.fixture.json",
            "--design-node",
            "999:9",
            "--json",
         ]);
         assert.equal(r.code, 3, "unknown root -> adapter runtime failure");
         const run = JSON.parse(r.out).run;
         assert.ok(
            run.runDiagnostics.some((x) => x.code === "ADAPTER_EXIT_NONZERO"),
         );
         assert.equal(run.artifacts.length, 0);
         // Port-level: anything outside the extracted subtree is LOCATOR_OUT_OF_SCOPE, externally
         // indistinguishable from absent (no information leak).
         const snap = {
            schemaVersion: 1,
            sourceId: "s",
            revisionId: "r",
            accessedAt: "1970-01-01T00:00:00Z",
            rootLocator: "a:1",
            nodes: [
               {
                  locator: "a:1",
                  kind: "page",
                  name: "PAGE/X",
                  children: ["a:2"],
               },
               { locator: "a:2", kind: "text", name: "SLOT/T", children: [] },
               { locator: "a:9", kind: "frame", name: "OUTSIDE", children: [] },
            ],
         };
         const port = new SnapshotDesignSourcePort(snap);
         const present = port.readNode("a:9");
         const absent = port.readNode("zz:absent");
         assert.ok(
            !present.ok && present.diagnostic.code === "LOCATOR_OUT_OF_SCOPE",
         );
         assert.ok(
            !absent.ok && absent.diagnostic.code === "LOCATOR_OUT_OF_SCOPE",
         );
         assert.equal(
            JSON.stringify(present.diagnostic),
            JSON.stringify(absent.diagnostic),
            "outside-scope must be indistinguishable from absent",
         );
         return "adapter + port scope gates enforced";
      },
   );

   checkAsync(
      "G2-T26c",
      "cross-project registry and stale binding pin fail closed (INPUT_CONTRACT_MISMATCH / EVIDENCE_MISSING)",
      async () => {
         const cross = await runCli([
            ...extractArgs([
               "--registry",
               path.join(
                  REPO,
                  "resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json",
               ),
            ]),
            "--json",
         ]);
         assert.equal(cross.code, 1);
         const crossRun = JSON.parse(cross.out).run;
         assert.ok(
            crossRun.runDiagnostics.some(
               (x) => x.code === "INPUT_CONTRACT_MISMATCH",
            ),
            JSON.stringify(crossRun.runDiagnostics),
         );
         assert.equal(crossRun.artifacts.length, 0);

         const stale = JSON.parse(fs.readFileSync(BINDINGS, "utf8"));
         stale.registry.registryRevisionId = "stale-rev-0000";
         const stalePath = path.join(
            fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-stale-")),
            "bindings-stale.json",
         );
         fs.writeFileSync(stalePath, JSON.stringify(stale, null, 2) + "\n");
         const r = await runCli([
            ...extractArgs(["--registry", REGISTRY, "--bindings", stalePath]),
            "--json",
         ]);
         assert.equal(r.code, 1);
         const run = JSON.parse(r.out).run;
         assert.ok(
            run.converterDiagnostics.some(
               (x) => x.code === "EVIDENCE_MISSING" && x.severity === "error",
            ),
            JSON.stringify(run.converterDiagnostics),
         );
         return "project/revision isolation enforced at extract time";
      },
   );

   checkAsync(
      "G2-T27a",
      "plan accepts a materialized PageStructure: mapped chain extract->plan; tampered pins fail",
      async () => {
         const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-chain-"));
         const x = await runCli([
            ...extractArgs([
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--out",
               outDir,
            ]),
            "--json",
         ]);
         assert.equal(x.code, 0, x.err);
         const planCli = (inputPath) =>
            runCli([
               "plan",
               "--profile",
               PROFILE,
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--input",
               inputPath,
               "--json",
            ]);
         const p = await planCli(path.join(outDir, "page-structure.json"));
         assert.equal(p.code, 0, `plan exit ${p.code}: ${p.err.slice(0, 400)}`);
         const report = JSON.parse(p.out).output;
         assert.equal(report.coverage.total, 2, "both bound instances resolve");
         const featured = report.sections.find(
            (s) => s.name === "SECTION/FeaturedProducts",
         );
         assert.equal(featured.status, "mapped");
         assert.equal(featured.proofLevel, "structurally-mapped");
         // Tampered provenance pins must never resolve.
         const ps = JSON.parse(
            fs.readFileSync(path.join(outDir, "page-structure.json"), "utf8"),
         );
         ps.inputs.registryRevisionId = "stale-rev";
         const staleFile = path.join(outDir, "ps-stale.json");
         fs.writeFileSync(staleFile, JSON.stringify(ps, null, 2) + "\n");
         const stale = await planCli(staleFile);
         assert.equal(stale.code, 1);
         assert.ok(
            JSON.parse(stale.out).run.converterDiagnostics.some(
               (x) => x.code === "EVIDENCE_MISSING",
            ),
            "stale registry pin rejected pre-resolution",
         );
         ps.inputs.registryRevisionId = "fixture-rev-0001";
         ps.inputs.bindingMapContentHash = "0".repeat(64);
         const tamperFile = path.join(outDir, "ps-tamper.json");
         fs.writeFileSync(tamperFile, JSON.stringify(ps, null, 2) + "\n");
         const tamper = await planCli(tamperFile);
         assert.equal(tamper.code, 1);
         assert.ok(
            JSON.parse(tamper.out).run.converterDiagnostics.some(
               (x) => x.code === "EVIDENCE_MISSING",
            ),
            "tampered binding pin rejected pre-resolution",
         );
         return "extract->plan chain mapped; pins verified";
      },
   );

   checkAsync(
      "G2-T27b",
      "second design source: same core rules, invalid componentRef flagged, zero cross-source leakage",
      async () => {
         const r = await runCli([
            "extract",
            "--profile",
            PROFILE_B,
            "--project",
            G2,
            "--design-file",
            "design-tree-secondary.fixture.json",
            "--design-node",
            "landing-root",
            "--json",
         ]);
         assert.equal(r.code, 0, r.err);
         const o = JSON.parse(r.out).output;
         assert.equal(o.nodeIr.nodes.length, 7);
         assert.equal(
            o.nodeIr.source.sourceId,
            "g2-fixture-source-b",
            "snapshot identity follows the profile's source",
         );
         const bad = o.review.entries.find((e) =>
            e.reason.includes(
               "does not resolve to an inventoried component definition",
            ),
         );
         assert.ok(
            bad &&
               bad.semanticClass === "SHARED_COMPONENT" &&
               bad.disposition === "NEEDS_REVIEW",
            "componentRef to a non-component is flagged, never mapped",
         );
         assert.ok(
            o.nodeIr.nodes.every((n) => n.nodeId.startsWith("n-")),
            "same id derivation for a different source",
         );
         const defs = o.review.entries.filter(
            (e) => e.disposition === "REFERENCE_ONLY",
         );
         assert.ok(
            defs.length >= 2,
            "definition subtree recorded as reference-only",
         );
         const sections = o.pageStructure.sections.map((s) => s.name);
         assert.deepEqual(sections, ["SECTION/Hero", "SECTION/Outro"]);
         for (const section of o.pageStructure.sections)
            for (const el of section.elements)
               assert.ok(
                  !JSON.stringify(el).includes("g2-fixture-source/"),
                  "no other-source leakage",
               );
         return "7 nodes, 2 sections, invalid ref flagged";
      },
   );

   checkAsync(
      "G2-T29",
      "C1 regression: site chrome requires container evidence - spoofed SITE/ labels stay NEEDS_REVIEW, authentic chrome still excludes",
      async () => {
         const r = await runCli([
            "extract",
            "--profile",
            PROFILE,
            "--project",
            G2,
            "--design-file",
            "design-tree-spoofed-chrome.fixture.json",
            "--design-node",
            "300:1",
            "--json",
         ]);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
         const o = JSON.parse(r.out).output;
         const { nodeIr, pageStructure, review } = o;
         assert.equal(nodeIr.nodes.length, 10);
         assert.equal(
            review.counts.total,
            10,
            "every node retained - nothing dropped by label",
         );
         // Authentic chrome (top-level SITE/ container): still excluded, with container evidence named.
         const chrome = review.entries.filter(
            (e) => e.semanticClass === "SITE_CHROME",
         );
         assert.equal(chrome.length, 3, "SITE/Header + inherited subtree");
         assert.ok(
            chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON"),
            "all chrome excluded with reason",
         );
         const topLevelChrome = chrome.find((e) =>
            e.reason.includes("Top-level site chrome"),
         );
         assert.ok(
            topLevelChrome &&
               topLevelChrome.reason.includes("container evidence"),
            "authentic chrome excluded on hint + position + CONTAINER evidence",
         );
         assert.ok(
            !pageStructure.sections.some((s) => s.name.startsWith("SITE/")),
            "authentic chrome not planned",
         );
         // Spoofed labels (top-level non-containers named SITE/): ambiguous NEEDS_REVIEW, retained.
         const spoofed = review.entries.filter((e) =>
            e.reason.includes("a label alone never excludes"),
         );
         assert.equal(
            spoofed.length,
            2,
            "SITE/BrandTagline (text) + SITE/BadgeInstance (instance)",
         );
         assert.ok(
            spoofed.every(
               (e) =>
                  e.semanticClass === "UNKNOWN_OR_AMBIGUOUS" &&
                  e.disposition === "NEEDS_REVIEW",
            ),
         );
         for (const name of ["SITE/BrandTagline", "SITE/BadgeInstance"]) {
            const node = nodeIr.nodes.find((n) => n.name === name);
            assert.ok(node, `${name} stays inventoried in the NodeIR`);
            assert.ok(
               review.entries.some(
                  (e) =>
                     e.nodeId === node.nodeId &&
                     e.disposition === "NEEDS_REVIEW",
               ),
               `${name} retained as NEEDS_REVIEW`,
            );
         }
         assert.equal(
            nodeIr.nodes.find((n) => n.name === "SITE/BrandTagline")?.visible,
            true,
            "spoofed nodes are NOT hidden-flagged - retained on merit",
         );
         assert.deepEqual(review.counts.byDisposition, {
            MAPPED: 3,
            EXCLUDED_WITH_REASON: 3,
            DECORATION_MERGED: 0,
            REFERENCE_ONLY: 1,
            NEEDS_REVIEW: 3,
         });
         // Ambiguity inherits: a spoofed-chrome SUBTREE would also stay reviewable.
         return "authentic chrome excluded with container evidence; spoofed labels reviewed, retained";
      },
   );

   checkAsync(
      "G2-T30",
      "C1-final regression: a binding never promotes ambiguous ownership - same def+binding maps the editorial instance but not the spoofed SITE/ one",
      async () => {
         const r = await runCli([
            "extract",
            "--profile",
            PROFILE,
            "--project",
            G2,
            "--design-file",
            "design-tree-spoofed-chrome.fixture.json",
            "--design-node",
            "300:1",
            "--registry",
            REGISTRY,
            "--bindings",
            path.join(G2, "g2-spoofed-bindings.fixture.json"),
            "--json",
         ]);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
         const o = JSON.parse(r.out).output;
         const { nodeIr, pageStructure, review } = o;
         assert.equal(nodeIr.nodes.length, 10);
         const idOf = (name) =>
            nodeIr.nodes.find((n) => n.name === name).nodeId;
         // Spoofed top-level SITE/ instance WITH a resolving binding: stays ambiguous NEEDS_REVIEW,
         // keeps its label-conflict reason, and still reports the provisional capability.
         const spoofed = review.entries.find(
            (e) => e.nodeId === idOf("SITE/BadgeInstance"),
         );
         assert.equal(spoofed.semanticClass, "UNKNOWN_OR_AMBIGUOUS");
         assert.equal(
            spoofed.disposition,
            "NEEDS_REVIEW",
            "binding must NOT promote ambiguous ownership to MAPPED",
         );
         assert.ok(
            spoofed.reason.includes("a label alone never excludes"),
            "label-conflict reason preserved",
         );
         assert.deepEqual(
            spoofed.provisionalTarget?.capabilityIds,
            ["flatcms/heading"],
            "provisional capability still reported",
         );
         // The SAME definition + SAME binding inside a real section: valid editorial instance -> MAPPED + planned.
         const valid = review.entries.find(
            (e) => e.nodeId === idOf("INSTANCE/Badge/InSection"),
         );
         assert.equal(valid.semanticClass, "SHARED_COMPONENT");
         assert.equal(valid.disposition, "MAPPED");
         const section = pageStructure.sections.find(
            (s) => s.name === "SECTION/RealSection",
         );
         const element = section.elements.find(
            (e) => e.elementId === idOf("INSTANCE/Badge/InSection"),
         );
         assert.ok(
            element &&
               element.resolution.status === "mapped" &&
               element.target?.capabilityId === "flatcms/heading",
         );
         // Authentic chrome unchanged in the bound run.
         const chrome = review.entries.filter(
            (e) => e.semanticClass === "SITE_CHROME",
         );
         assert.equal(chrome.length, 3);
         assert.ok(
            chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON"),
         );
         assert.deepEqual(review.counts.byDisposition, {
            MAPPED: 4,
            EXCLUDED_WITH_REASON: 3,
            DECORATION_MERGED: 0,
            REFERENCE_ONLY: 1,
            NEEDS_REVIEW: 2,
         });
         return "same binding: editorial instance mapped, spoofed SITE/ instance reviewed";
      },
   );

   checkAsync(
      "G2-T28",
      "id derivation + neutrality over the new G2 surfaces",
      async () => {
         // Stable, kind-sensitive, locator-keyed ids.
         const a = deriveNodeId("s", "loc", "container");
         assert.equal(
            a,
            deriveNodeId("s", "loc", "container"),
            "stable for identical identity inputs",
         );
         assert.notEqual(
            a,
            deriveNodeId("s", "loc", "text"),
            "kind participates",
         );
         assert.notEqual(
            a,
            deriveNodeId("s", "other", "container"),
            "locator participates",
         );
         assert.ok(/^n-[0-9a-f]{12}$/.test(a));
         // Neutrality scan over the new surfaces (same term policy as T-09/T-18b).
         const neutralTerms =
            /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
         const hits = [];
         const scan = (rel, text) => {
            const m = text.match(new RegExp(neutralTerms.source, "gi"));
            if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
         };
         for (const f of [
            "node-ir.schema.json",
            "page-structure.schema.json",
            "source-review.schema.json",
         ]) {
            scan(
               `resources/schemas/converter/${f}`,
               fs.readFileSync(
                  path.join(REPO, "resources/schemas/converter", f),
                  "utf8",
               ),
            );
         }
         scan(
            "resources/schemas/cli/design-source-snapshot.schema.json",
            fs.readFileSync(
               path.join(
                  REPO,
                  "resources/schemas/cli/design-source-snapshot.schema.json",
               ),
               "utf8",
            ),
         );
         scan(
            "dist/src/core/design-source/extract.js",
            fs.readFileSync(
               path.join(REPO, "dist/src/core/design-source/extract.js"),
               "utf8",
            ),
         );
         scan(
            "dist/src/core/design-source/port.js",
            fs.readFileSync(
               path.join(REPO, "dist/src/core/design-source/port.js"),
               "utf8",
            ),
         );
         scan(
            "dist/src/core/cli/commands/extract.js",
            fs.readFileSync(
               path.join(REPO, "dist/src/core/cli/commands/extract.js"),
               "utf8",
            ),
         );
         for (const f of fs.readdirSync(G2))
            if (f.endsWith(".json"))
               scan(
                  `src/modules/figma/__tests__/fixtures/g2-design-source/${f}`,
                  fs.readFileSync(path.join(G2, f), "utf8"),
               );
         for (const f of ["descriptor.json"]) {
            const descText = fs.readFileSync(
               path.join(
                  REPO,
                  "src/modules/figma/adapters/design-source-fixture",
                  f,
               ),
               "utf8",
            );
            // [68] the `entry` value is the compiled location of the module-owned adapter (it names
            // src/modules/figma by construction), not a bundled identifier — redact it before the
            // neutrality match. The pre-[68] descriptor's entry named no module; the neutrality
            // property this scan protects (no platform/provider identifiers in the fixture
            // transport) is unchanged.
            scan(
               `src/modules/figma/adapters/design-source-fixture/${f}`,
               descText.replace(
                  /"entry":\s*"[^"]*"/,
                  `"entry": "<location-redacted>"`,
               ),
            );
         }
         for (const f of fs
            .readdirSync(path.join(REPO, "resources/examples/converter"))
            .filter((x) => x.includes("g2"))) {
            scan(
               `resources/examples/converter/${f}`,
               fs.readFileSync(
                  path.join(REPO, "resources/examples/converter", f),
                  "utf8",
               ),
            );
         }
         assert.deepEqual(
            hits,
            [],
            "neutrality violations:\n" + hits.join("\n"),
         );
         return "0 matches across resources/schemas/core/adapters/fixtures/examples";
      },
   );

   // ---- Issue #18 live read-only design-source adapter (offline gate over a stubbed provider API)
   // The provider is stubbed by a local HTTP server speaking the live wire shape; no network, no
   // credentials, no provider identifiers are committed. The real live read is a separate,
   // Owner-GOed local run documented in the issue-18 receipt.
   const CANNED = JSON.parse(
      fs.readFileSync(path.join(LIVE, "canned-file-nodes.json"), "utf8"),
   );
   const LIVE_KEY = "fixturefilekey1234567";
   const LIVE_PROFILE = path.join(LIVE, "profile-figma-live.fixture.json");
   const LIVE_ROOT_ARGS = [
      "--profile",
      LIVE_PROFILE,
      "--project",
      LIVE,
      "--adapter",
      "design-source-figma-live",
      "--design-file",
      LIVE_KEY,
      "--design-node",
      "1000:1",
   ];
   // Hand-derived accountability for the canned tree at revision 9001-fixture-rev (asserted exact).
   const LIVE_EXPECTED_DISPOSITIONS = {
      MAPPED: 8,
      EXCLUDED_WITH_REASON: 4,
      DECORATION_MERGED: 1,
      REFERENCE_ONLY: 2,
      NEEDS_REVIEW: 3,
   };
   const LIVE_EXPECTED_CLASSES = {
      SITE_CHROME: 2,
      EDITORIAL_SECTION: 10,
      SHARED_COMPONENT: 4,
      PRESENTATIONAL: 1,
      UNKNOWN_OR_AMBIGUOUS: 1,
   };
   const LIVE_NODE_COUNT = 18;

   let liveServerPromise = null;
   function liveServer() {
      if (!liveServerPromise) {
         liveServerPromise = new Promise((resolve) => {
            const s = http.createServer((req, res) => {
               const u = new URL(req.url ?? "/", "http://stub");
               const ids = u.searchParams.get("ids") ?? "";
               const json = (code, body, headers = {}) => {
                  res.writeHead(code, {
                     "Content-Type": "application/json",
                     ...headers,
                  });
                  res.end(
                     typeof body === "string" || Buffer.isBuffer(body)
                        ? body
                        : JSON.stringify(body),
                  );
               };
               if (ids === "1000:1") return json(200, CANNED);
               if (ids === "400:1")
                  return json(401, { status: 401, err: "Invalid token" });
               if (ids === "404:1")
                  return json(404, { status: 404, err: "File not found" });
               if (ids === "429:1")
                  return json(
                     429,
                     { err: "rate limited" },
                     { "Retry-After": "7" },
                  );
               if (ids === "500:1") {
                  res.writeHead(200, { "Content-Type": "application/json" });
                  return res.end(Buffer.alloc(32 * 1024 * 1024 + 1, 0x61));
               }
               if (ids === "600:1") return json(200, "{not-json");
               if (ids === "700:1")
                  return json(200, { error: "forbidden subtree" });
               if (ids === "800:1")
                  return json(302, "", {
                     Location: "http://127.0.0.1/redirected",
                  });
               if (ids === "900:1")
                  return json(200, {
                     name: "stub",
                     lastModified: "2026-01-01T00:00:00Z",
                     nodes: {},
                  });
               if (ids === "950:1")
                  return json(200, {
                     name: "stub",
                     nodes: {
                        "950:1": {
                           document: {
                              id: "950:1",
                              name: "PAGE/X",
                              type: "FRAME",
                              children: [],
                           },
                        },
                     },
                  });
               return json(404, { err: "unknown stub route" });
            });
            s.listen(0, "127.0.0.1", () =>
               resolve({
                  server: s,
                  base: `http://127.0.0.1:${s.address().port}`,
               }),
            );
         });
      }
      return liveServerPromise;
   }

   async function withLiveEnv(base, fn, { token = "stub-token" } = {}) {
      const savedBase = process.env.FIGMA_API_BASE;
      const savedToken = process.env.FIGMA_TOKEN;
      process.env.FIGMA_API_BASE = base;
      if (token) process.env.FIGMA_TOKEN = token;
      else delete process.env.FIGMA_TOKEN;
      try {
         return await fn();
      } finally {
         if (savedBase === undefined) delete process.env.FIGMA_API_BASE;
         else process.env.FIGMA_API_BASE = savedBase;
         if (savedToken === undefined) delete process.env.FIGMA_TOKEN;
         else process.env.FIGMA_TOKEN = savedToken;
      }
   }

   function liveAdapterInput(designNode, overrides = {}) {
      return {
         schemaVersion: 1,
         profileId: "g2-design-fixture",
         platformId: "figma",
         source: {
            sourceId: "figma-live-source",
            kind: "figma",
            path: LIVE,
            scopes: { include: ["1000:1"] },
         },
         options: { designFile: LIVE_KEY, designNode, ...overrides },
      };
   }

   checkAsync(
      "G2-T31a",
      "live adapter registers beside the fixture adapter under the same snapshot contract, read-only, no bundled identifiers",
      async () => {
         const { adapters } = loadAdapters(CORE);
         const live = adapters.find((a) => a.id === "design-source-figma-live");
         assert.ok(
            live,
            "design-source-figma-live must be registered (build first)",
         );
         assert.equal(live.permissions.readOnly, true);
         assert.deepEqual(live.platformIds, ["figma"]);
         assert.ok(
            live.outputContract.endsWith(
               "/schemas/cli/design-source-snapshot.schema.json",
            ),
            "same snapshot transport contract as the fixture adapter",
         );
         assert.ok(
            adapters.find((a) => a.id === "design-source-fixture"),
            "fixture adapter still registered",
         );
         const descText = fs.readFileSync(
            path.join(
               CORE,
               "src/modules/figma/adapters/design-source-figma-live/descriptor.json",
            ),
            "utf8",
         );
         const scrubbed = descText
            .replace(/https:\/\/[^"\s]+/g, "")
            .replace(
               /githubusercontent|design-engineering-toolkit|thanhle74/g,
               "",
            );
         assert.ok(
            !/[A-Za-z0-9]{22}/.test(scrubbed),
            "descriptor must not embed a file-key-shaped literal",
         );
         assert.ok(
            !/\b\d+:\d+\b/.test(scrubbed),
            "descriptor must not bundle any provider node id",
         );
         return "registered, snapshot contract, identifier-free descriptor";
      },
   );

   checkAsync(
      "G2-T31b",
      "provider normalization: documented kind table, verbatim layout primitives, variants, image-fill media, empty-name fallback, bounded walk",
      async () => {
         for (const [type, expected] of [
            ["FRAME", "frame"],
            ["SECTION", "frame"],
            ["GROUP", "group"],
            ["BOOLEAN_OPERATION", "group"],
            ["COMPONENT", "component"],
            ["COMPONENT_SET", "component"],
            ["INSTANCE", "instance"],
            ["TEXT", "text"],
            ["VECTOR", "vector"],
            ["LINE", "line"],
            ["SLICE", "slice"],
            ["RECTANGLE", "shape"],
            ["ROUNDED_RECTANGLE", "shape"],
            ["ELLIPSE", "shape"],
            ["REGULAR_POLYGON", "shape"],
            ["STAR", "shape"],
            ["MYSTERY_TYPE", "mystery_type"],
         ]) {
            assert.equal(kindOf(type, false), expected, `kind table ${type}`);
         }
         assert.equal(
            kindOf("RECTANGLE", true),
            "media",
            "image-fill leaf is honest media",
         );
         const subtree = toSnapshotNodes(CANNED.nodes["1000:1"].document);
         assert.equal(subtree.nodes.length, LIVE_NODE_COUNT);
         const byLocator = new Map(subtree.nodes.map((n) => [n.locator, n]));
         assert.deepEqual(
            subtree.nodes.map((n) => n.locator).slice(0, 3),
            ["1000:1", "1001:1", "1001:2"],
            "document order",
         );
         // 40/60 flow container: measured fill fractions carried verbatim; the hero row is the flow
         // container, its column children are static-positioned absolute-layout containers.
         const heroRow = byLocator.get("1002:1");
         assert.equal(heroRow.properties.layout.direction, "row");
         const headline = byLocator.get("1002:2");
         assert.equal(
            headline.properties.layout.direction,
            "absolute",
            "a non-flow container's children are absolutely positioned",
         );
         assert.equal(
            headline.properties.layout.positioning,
            "static",
            "a child of a flow parent is static",
         );
         assert.deepEqual(headline.properties.layout.relativeSizes, [
            { target: "parent-width", ratio: 0.4 },
         ]);
         const media = byLocator.get("1002:4");
         assert.deepEqual(media.properties.layout.relativeSizes, [
            { target: "parent-width", ratio: 0.6 },
         ]);
         // Image-fill leaf = media; a media node with children would stay its container kind.
         assert.equal(byLocator.get("1002:5").kind, "media");
         assert.equal(
            byLocator.get("1002:5").properties,
            undefined,
            "content-bearing leaves carry no properties beyond structure",
         );
         // Instance: definition reference verbatim (may be external), declared variant assignments carried.
         const inst = byLocator.get("1003:1");
         assert.equal(inst.componentRef, "999:9");
         assert.deepEqual(inst.properties.variants, { layout: "stacked" });
         // Hidden nodes transported, never dropped; empty names fall back to the provider type.
         assert.equal(byLocator.get("1006:1").visible, false);
         assert.equal(byLocator.get("1009:1").name, "TEXT");
         // Text content and fill values are never copied (the canned doc carries none on purpose).
         assert.ok(!JSON.stringify(subtree).includes("characters"));
         // Budget: a chain deeper than MAX_NODES fails the walk instead of exploding the stack.
         let deep = { id: "0:0", name: "leaf", type: "TEXT" };
         for (let i = 0; i <= MAX_NODES; i++)
            deep = { id: `${i}:0`, name: "n", type: "FRAME", children: [deep] };
         assert.throws(
            () => toSnapshotNodes(deep),
            /budget/,
            "over-budget subtree must fail closed",
         );
         return `18 nodes normalized; 40/60 fill fractions measured; budget enforced at ${MAX_NODES}`;
      },
   );

   checkAsync(
      "G2-T31c",
      "adapter end-to-end over the stubbed provider: revision-pinned, scope-bounded snapshot, credential never echoed",
      async () => {
         const { base } = await liveServer();
         await withLiveEnv(base, async () => {
            const { adapters } = loadAdapters(CORE);
            const live = adapters.find(
               (a) => a.id === "design-source-figma-live",
            );
            const run = await runAdapter(
               CORE,
               live,
               liveAdapterInput("1000:1"),
            );
            assert.equal(
               run.ok,
               true,
               `adapter run failed: ${JSON.stringify(run.diagnostics)}`,
            );
            const snap = run.payload;
            assert.equal(snap.sourceId, "figma-live-source");
            assert.equal(snap.providerId, "figma-rest-v1");
            assert.equal(
               snap.revisionId,
               "9001-fixture-rev",
               "provider version token pins the snapshot",
            );
            assert.equal(snap.rootLocator, "1000:1");
            assert.equal(snap.nodes.length, LIVE_NODE_COUNT);
            assert.ok(
               run.stderrTail === undefined ||
                  !run.stderrTail.includes("stub-token"),
               "no credential in surfaced stderr",
            );
            // The operator note is terminal-only stderr of a direct adapter run (the core run envelope
            // deliberately surfaces stderr tails only on failure paths). The direct child is awaited
            // (never sync) so the in-process stub server keeps serving while the adapter runs.
            const { spawn } = await import("node:child_process");
            const direct = await new Promise((resolve) => {
               const p = spawn(
                  process.execPath,
                  [
                     path.join(
                        CORE,
                        "dist/src/modules/figma/adapters/design-source-figma-live/extract.js",
                     ),
                  ],
                  { stdio: ["pipe", "pipe", "pipe"] },
               );
               let stdout = "";
               let stderr = "";
               p.stdout.on("data", (d) => (stdout += d));
               p.stderr.on("data", (d) => (stderr += d));
               p.on("close", (code) => resolve({ code, stdout, stderr }));
               p.stdin.end(JSON.stringify(liveAdapterInput("1000:1")));
            });
            assert.equal(
               direct.code,
               0,
               `direct adapter run failed: ${direct.stderr.slice(0, 300)}`,
            );
            assert.ok(
               direct.stderr.includes("pinned revision"),
               "operator note on terminal-only stderr",
            );
            assert.ok(
               !direct.stderr.includes("stub-token"),
               "the credential must never be echoed anywhere",
            );
         });
         return "revision 9001-fixture-rev pinned, 18 nodes, token never echoed";
      },
   );

   checkAsync(
      "G2-T31d",
      "adapter fails closed on every blocked path: missing token, auth, 404, 429, oversize, malformed, in-band error, absent node, no revision pin, redirect, scope escape, malformed inputs",
      async () => {
         const { base } = await liveServer();
         await withLiveEnv(base, async () => {
            const { adapters } = loadAdapters(CORE);
            const live = adapters.find(
               (a) => a.id === "design-source-figma-live",
            );
            const cases = [
               ["401 rejected token", liveAdapterInput("400:1"), {}],
               ["404 file/node", liveAdapterInput("404:1"), {}],
               ["429 rate limited", liveAdapterInput("429:1"), {}],
               ["response over cap", liveAdapterInput("500:1"), {}],
               ["malformed body", liveAdapterInput("600:1"), {}],
               ["in-band provider error", liveAdapterInput("700:1"), {}],
               ["redirect refused", liveAdapterInput("800:1"), {}],
               ["requested node absent", liveAdapterInput("900:1"), {}],
               ["no revision pin available", liveAdapterInput("950:1"), {}],
               ["root outside include scopes", liveAdapterInput("999:9"), {}],
               [
                  "file key with traversal",
                  liveAdapterInput("1000:1", { designFile: "../escape" }),
                  {},
               ],
               [
                  "non-numeric node id",
                  liveAdapterInput("1000:1", { designNode: "root-frame" }),
                  {},
               ],
            ];
            for (const [label, input] of cases) {
               const run = await runAdapter(CORE, live, input);
               assert.equal(run.ok, false, `${label} must fail closed`);
               assert.ok(
                  run.diagnostics.some(
                     (d) => d.code === "ADAPTER_EXIT_NONZERO",
                  ),
                  `${label}: ${JSON.stringify(run.diagnostics)}`,
               );
               assert.ok(
                  !JSON.stringify(run.diagnostics).includes("stub-token"),
                  `${label}: credential leaked into diagnostics`,
               );
               assert.ok(
                  !(run.stderrTail ?? "").includes("stub-token"),
                  `${label}: credential leaked into stderr tail`,
               );
            }
            await withLiveEnv(
               base,
               async () => {
                  const run = await runAdapter(
                     CORE,
                     live,
                     liveAdapterInput("1000:1"),
                  );
                  assert.equal(run.ok, false, "missing token must fail closed");
                  assert.ok(
                     run.diagnostics.some(
                        (d) => d.code === "ADAPTER_EXIT_NONZERO",
                     ),
                  );
                  assert.ok(
                     (run.stderrTail ?? "").includes("FIGMA_TOKEN"),
                     "exact blocker named: FIGMA_TOKEN missing",
                  );
               },
               { token: null },
            );
         });
         return "13 blocked paths fail closed with exact reasons; no credential leakage";
      },
   );

   checkAsync(
      "G2-T31e",
      "live extract through the CLI: full inventory, chrome excluded, media slot, honest custom-required instances, determinism",
      async () => {
         const { base } = await liveServer();
         await withLiveEnv(base, async () => {
            const r = await runCli([
               ...["extract", ...LIVE_ROOT_ARGS, "--json"],
            ]);
            assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
            const o = JSON.parse(r.out).output;
            const { nodeIr, pageStructure, review } = o;
            assert.equal(nodeIr.source.revisionId, "9001-fixture-rev");
            assert.equal(nodeIr.source.sourceId, "figma-live-source");
            assert.equal(nodeIr.nodes.length, LIVE_NODE_COUNT);
            assert.equal(review.counts.total, LIVE_NODE_COUNT);
            assert.deepEqual(
               review.counts.byDisposition,
               LIVE_EXPECTED_DISPOSITIONS,
            );
            assert.deepEqual(review.counts.byClass, LIVE_EXPECTED_CLASSES);
            // Chrome: inventoried + excluded with reason, never planned.
            const chrome = review.entries.filter(
               (e) => e.semanticClass === "SITE_CHROME",
            );
            assert.equal(chrome.length, 2);
            assert.ok(
               chrome.every(
                  (e) =>
                     e.disposition === "EXCLUDED_WITH_REASON" &&
                     e.reason.includes("theme-owned"),
               ),
            );
            assert.deepEqual(
               pageStructure.sections.map((s) => s.name),
               ["SECTION/Hero/Primary", "SECTION/EditorialMosaic"],
            );
            // Layout facts preserved: measured 40/60 fill fractions on the hero columns.
            const byName = new Map(nodeIr.nodes.map((n) => [n.name, n]));
            assert.deepEqual(byName.get("SLOT/Headline").layout.relativeSizes, [
               { target: "parent-width", ratio: 0.4 },
            ]);
            assert.deepEqual(byName.get("SLOT/Media").layout.relativeSizes, [
               { target: "parent-width", ratio: 0.6 },
            ]);
            // Media slot derived from the image-fill leaf; valueRef points at the design locator.
            const mediaNode = byName.get("SLOT/Media");
            assert.deepEqual(
               mediaNode.contentSlots.map((s) => ({
                  kind: s.kind,
                  valueRef: s.valueRef,
               })),
               [
                  {
                     kind: "media",
                     valueRef: "design://figma-live-source/1002:5",
                  },
               ],
            );
            // Instances at top level: the external one stays NEEDS_REVIEW custom-required (never
            // approximated), the resolving-but-unbound one is custom-required pending — the in-section
            // unresolvable-ref phrasing is covered by G2-T24a/T27b on the fixture trees.
            const external = review.entries.find((e) =>
               e.reason.includes(
                  "Shared component instance outside any planned section",
               ),
            );
            assert.ok(
               external &&
                  external.disposition === "NEEDS_REVIEW" &&
                  external.provisionalTarget?.category === "custom-required",
            );
            const pending = review.entries.filter(
               (e) => e.provisionalTarget?.category === "custom-required",
            );
            assert.equal(
               pending.length,
               2,
               "external + resolving-unbound instance pending custom-required",
            );
            assert.ok(
               review.entries.some((e) => e.disposition === "REFERENCE_ONLY"),
            );
            // Hidden subtree retained and excluded with reason.
            const hidden = review.entries.find((e) =>
               e.reason.includes("Hidden in the source"),
            );
            assert.ok(hidden && hidden.disposition === "EXCLUDED_WITH_REASON");
            // Every node carries design:// evidence at the pinned revision.
            for (const n of nodeIr.nodes) {
               for (const ev of n.sourceEvidence) {
                  assert.ok(
                     ev.locator.startsWith("design://figma-live-source/") &&
                        ev.sourceRevisionId === "9001-fixture-rev",
                  );
               }
            }
            // Determinism: a second run is byte-stable modulo volatile timestamps.
            const b = await runCli([
               ...["extract", ...LIVE_ROOT_ARGS, "--json"],
            ]);
            assert.equal(b.code, 0, b.err);
            const roles = (x) =>
               Object.fromEntries(
                  JSON.parse(x.out).run.artifacts.map((art) => [
                     art.role,
                     art.volatileContentHash,
                  ]),
               );
            assert.deepEqual(
               roles(r),
               roles(b),
               "live extraction deterministic across runs",
            );
            assert.deepEqual(
               JSON.parse(r.out).output.nodeIr.nodes.map((n) => n.nodeId),
               JSON.parse(b.out).output.nodeIr.nodes.map((n) => n.nodeId),
            );
         });
         return `18 nodes inventoried, 2 sections planned, ${LIVE_EXPECTED_DISPOSITIONS.NEEDS_REVIEW} needs-review, byte-stable`;
      },
   );

   checkAsync(
      "G2-T31f",
      "live extract->plan chain: registry+binding pins accepted, unmapped sections honestly reported",
      async () => {
         const { base } = await liveServer();
         const outDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "det-g2-live-chain-"),
         );
         await withLiveEnv(base, async () => {
            const x = await runCli([
               ...[
                  "extract",
                  ...LIVE_ROOT_ARGS,
                  "--registry",
                  REGISTRY,
                  "--bindings",
                  BINDINGS,
                  "--out",
                  outDir,
               ],
               "--json",
            ]);
            assert.equal(
               x.code,
               0,
               `extract exit ${x.code}: ${x.err.slice(0, 400)}`,
            );
            const o = JSON.parse(x.out).output;
            assert.equal(
               o.pageStructure.inputs.registryRevisionId,
               "fixture-rev-0001",
               "registry pin on the live-derived structure",
            );
            assert.ok(
               o.pageStructure.inputs.bindingMapContentHash,
               "binding pin present",
            );
            const p = await runCli([
               "plan",
               "--profile",
               LIVE_PROFILE,
               "--registry",
               REGISTRY,
               "--bindings",
               BINDINGS,
               "--input",
               path.join(outDir, "page-structure.json"),
               "--json",
            ]);
            assert.equal(
               p.code,
               0,
               `plan exit ${p.code}: ${p.err.slice(0, 400)}`,
            );
            const report = JSON.parse(p.out).output;
            assert.equal(
               report.sections.length,
               2,
               "both live sections enter the report",
            );
            assert.equal(
               report.coverage.total,
               0,
               "zero proven capability bindings exist yet - honestly reported",
            );
         });
         return "extract->plan chain green on live-derived structure; 0 bindings honestly reported";
      },
   );

   checkAsync(
      "G2-T31g",
      "new live surfaces stay free of secrets and owner identifiers (provider pins allowed only in docs/evidence/receipt)",
      async () => {
         const adapterBanned =
            /vNPtfBRpYM3PsExirVqhmt|figd_[A-Za-z0-9_-]{10,}|\/home\/thanhle|slaunch|secomm|\b245:2\b|\b245:16\b/i;
         const hits = [];
         const scan = (rel, text, banned) => {
            const m = text.match(new RegExp(banned.source, "gi"));
            if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
         };
         const walkDir = (dir, rel, banned) => {
            for (const f of fs.readdirSync(dir)) {
               const p = path.join(dir, f);
               if (fs.statSync(p).isDirectory())
                  walkDir(p, `${rel}/${f}`, banned);
               else scan(`${rel}/${f}`, fs.readFileSync(p, "utf8"), banned);
            }
         };
         walkDir(
            path.join(
               CORE,
               "src/modules/figma/adapters/design-source-figma-live",
            ),
            "src/modules/figma/adapters/design-source-figma-live",
            adapterBanned,
         );
         walkDir(
            path.join(LIVE, ""),
            "src/modules/figma/__tests__/fixtures/g2-figma-live",
            adapterBanned,
         );
         // Derived live evidence + receipt (when present): token-shaped secrets and absolute paths are
         // never committed; the source/revision provenance pins required by the issue are allowed.
         const evidenceBanned =
            /figd_[A-Za-z0-9_-]{10,}|-----BEGIN|\/home\/[a-z]+\//i;
         const evidenceDir = path.join(REPO, "docs/evidence/issue-18");
         if (fs.existsSync(evidenceDir))
            walkDir(evidenceDir, "docs/evidence/issue-18", evidenceBanned);
         const receipt = path.join(
            REPO,
            "docs/converter/RECEIPT-ISSUE18-G2-LIVE.md",
         );
         if (fs.existsSync(receipt))
            scan(
               "docs/converter/RECEIPT-ISSUE18-G2-LIVE.md",
               fs.readFileSync(receipt, "utf8"),
               evidenceBanned,
            );
         assert.deepEqual(
            hits,
            [],
            "secret/owner-identifier violations:\n" + hits.join("\n"),
         );
         const { server } = await liveServer();
         server.close();
         return "adapter + fixtures clean; docs/evidence/receipt secrets policy enforced";
      },
   );
}
