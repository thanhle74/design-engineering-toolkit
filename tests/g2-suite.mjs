// Issue #14 G2 suite: design-source structural extraction. Registers async checks on the shared
// run-all runner: the materialized NodeIR/PageStructure/SourceReview contracts (positive +
// committed-example parity), the every-node accountability ledger, chrome exclusion, stable
// hashed ids across revisions, determinism, no-write/dry-run truth, the negative graph cases
// (cycle / dangling child / duplicate locator), scope escapes, cross-project and cross-revision
// mixing, plan-on-PageStructure integration, the second design source (core neutrality), and the
// neutrality scans over the new surfaces.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../dist/src/core/cli/main.js";
import { stableContentHash, canonicalStringify, stripVolatile } from "../dist/src/core/canonical.js";
import { deriveNodeId } from "../dist/src/core/design-source/extract.js";
import { SnapshotDesignSourcePort } from "../dist/src/core/design-source/port.js";

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const G2 = path.join(FIX, "g2-design-source");
const PROFILE = path.join(FIX, "negative/profile-g2-design-fixture.fixture.json");
const PROFILE_B = path.join(FIX, "negative/profile-g2-design-secondary.fixture.json");
const REGISTRY = path.join(G2, "g2-capability-registry.fixture.json");
const BINDINGS = path.join(G2, "g2-component-bindings.fixture.json");
const ROOT_ARGS = ["--profile", PROFILE, "--project", G2, "--design-file", "design-tree-primary.fixture.json", "--design-node", "100:1"];

// Expected accountability for tree A at revision g2-fixture-rev-0001 (hand-derived, asserted exact).
const EXPECTED_DISPOSITIONS = { MAPPED: 11, EXCLUDED_WITH_REASON: 5, DECORATION_MERGED: 2, REFERENCE_ONLY: 3, NEEDS_REVIEW: 4 };
const EXPECTED_CLASSES = { SITE_CHROME: 3, EDITORIAL_SECTION: 11, SHARED_COMPONENT: 6, PRESENTATIONAL: 2, UNKNOWN_OR_AMBIGUOUS: 3 };
const NODE_COUNT = 25;
const SECTION_NAMES = ["SECTION/Hero/Primary", "SECTION/FeaturedProducts", "SECTION/CampaignWidget"];

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function extractArgs(extra = []) {
  return ["extract", ...ROOT_ARGS, ...extra];
}

export default async function registerG2Suite(checkAsync) {
  checkAsync("G2-T23a", "materialized G2 schemas validate their committed worked examples", async () => {
    const { validateContract } = await import("../dist/src/core/schema-registry.js");
    for (const [contract, file] of [
      ["node-ir", "node-ir.g2-fixture.example.json"],
      ["page-structure", "page-structure.g2-fixture.example.json"],
      ["source-review", "source-review.g2-fixture.example.json"],
    ]) {
      const payload = JSON.parse(fs.readFileSync(path.join(FIX, "..", "..", "examples/converter", file), "utf8"));
      const check = validateContract(contract, payload);
      assert.ok(check.valid, `${file} must validate: ${check.errors.slice(0, 3).join("; ")}`);
    }
    const snap = {
      schemaVersion: 1, sourceId: "s", revisionId: "r", accessedAt: "1970-01-01T00:00:00Z", rootLocator: "a:1",
      nodes: [{ locator: "a:1", kind: "page", name: "PAGE/X", children: [] }],
    };
    const snapCheck = validateContract("design-source-snapshot", snap);
    assert.ok(snapCheck.valid, `snapshot transport example must validate: ${snapCheck.errors.join("; ")}`);
    return "3 converter examples + snapshot transport valid";
  });

  checkAsync("G2-T23b", "committed G2 examples equal a fresh extract (all observation timestamps stripped)", async () => {
    const r = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]), "--json"]);
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
    const o = JSON.parse(r.out).output;
    for (const [key, file] of [
      ["nodeIr", "node-ir.g2-fixture.example.json"],
      ["pageStructure", "page-structure.g2-fixture.example.json"],
      ["review", "source-review.g2-fixture.example.json"],
    ]) {
      const committed = JSON.parse(fs.readFileSync(path.join(FIX, "..", "..", "examples/converter", file), "utf8"));
      assert.equal(canonicalStringify(stripVolatile(o[key])), canonicalStringify(stripVolatile(committed)), `${file} drifts from a fresh run`);
    }
    return "3/3 examples reproducible (deterministic extraction)";
  });

  checkAsync("G2-T24a", "extract (pinned registry+bindings): full inventory, exact accountability, chrome excluded from the plan", async () => {
    const r = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]), "--json"]);
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
    const o = JSON.parse(r.out).output;
    const { nodeIr, pageStructure, review } = o;
    // Full inventory: every descendant accounted for exactly once.
    assert.equal(nodeIr.nodes.length, NODE_COUNT);
    assert.equal(review.counts.total, NODE_COUNT);
    assert.deepEqual(review.counts.byDisposition, EXPECTED_DISPOSITIONS);
    assert.deepEqual(review.counts.byClass, EXPECTED_CLASSES);
    assert.equal(review.entries.length, nodeIr.nodes.length, "one review entry per node");
    // Document order preserved on the root; parent/children agreement.
    const byId = new Map(nodeIr.nodes.map((n) => [n.nodeId, n]));
    const root = byId.get(nodeIr.rootNodeId);
    assert.equal(root.name, "PAGE/Home/Desktop");
    assert.equal(root.parentNodeId, null);
    assert.equal(root.kind, "page-section", "the selected page root maps to page-section");
    for (const n of nodeIr.nodes) for (const c of n.childrenNodeIds) assert.equal(byId.get(c).parentNodeId, n.nodeId);
    // Chrome: present in the review, absent from the plan.
    const chrome = review.entries.filter((e) => e.semanticClass === "SITE_CHROME");
    assert.equal(chrome.length, EXPECTED_CLASSES.SITE_CHROME);
    assert.ok(chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON" && e.reason.includes("theme-owned")));
    const sectionNames = pageStructure.sections.map((s) => s.name);
    assert.deepEqual(sectionNames, SECTION_NAMES);
    assert.ok(sectionNames.every((s) => !s.startsWith("SITE/")), "no site chrome planned");
    // The bare 'Footer' is ambiguous: NEEDS_REVIEW, never excluded by label, never planned.
    const footer = review.entries.find((e) => e.reason.includes("undecidable"));
    assert.ok(footer && footer.semanticClass === "UNKNOWN_OR_AMBIGUOUS" && footer.disposition === "NEEDS_REVIEW");
    assert.ok(!sectionNames.includes("Footer"), "ambiguous footer must not be auto-planned");
    // Hidden node: inventoried, excluded with reason, not planned.
    const hidden = review.entries.find((e) => e.reason.includes("Hidden in the source"));
    assert.ok(hidden && hidden.disposition === "EXCLUDED_WITH_REASON");
    assert.ok(!nodeIr.nodes.find((n) => n.name === "SECTION/DraftBanner").visible === false ? false : true, "hidden flag carried");
    assert.equal(byId.get(nodeIr.nodes.find((n) => n.name === "SECTION/DraftBanner").nodeId).visible, false);
    // Unknown kind stays unknown + NOT_VERIFIED (never guessed into a near-miss bucket).
    const mystery = nodeIr.nodes.find((n) => n.name === "MysteryBox");
    assert.equal(mystery.kind, "unknown");
    assert.ok(nodeIr.diagnostics.some((x) => x.code === "NOT_VERIFIED" && x.subject?.id === mystery.nodeId));
    // 40/60 nested row layout preserved verbatim (sorted by target).
    const row = nodeIr.nodes.find((n) => n.name === "SECTION/HeroRow");
    assert.equal(row.layout.direction, "row");
    assert.deepEqual(row.layout.relativeSizes.map((r) => r.ratio), [0.4, 0.6].sort());
    // Instances resolve only via the pinned binding: exact target, never invented.
    const mappedInstances = review.entries.filter((e) => e.semanticClass === "SHARED_COMPONENT" && e.disposition === "MAPPED");
    assert.equal(mappedInstances.length, 2, "two instances bound through the single component binding");
    assert.ok(mappedInstances.every((e) => e.provisionalTarget?.capabilityIds?.[0] === "flatcms/teaser"));
    const section1 = pageStructure.sections.find((s) => s.name === "SECTION/FeaturedProducts");
    assert.equal(section1.elements.length, 2);
    assert.ok(section1.elements.every((e) => e.resolution.status === "mapped" && e.target?.capabilityId === "flatcms/teaser" && e.bindingId));
    // The external widget stays custom-required pending — no fake mapping.
    const external = review.entries.find((e) => e.reason.includes("does not resolve to an inventoried component definition"));
    assert.ok(external && external.semanticClass === "SHARED_COMPONENT" && external.disposition === "NEEDS_REVIEW");
    assert.deepEqual(external.provisionalTarget, { category: "custom-required" });
    // Evidence: scheme-whitelisted design:// locators at the pinned revision, on every node.
    for (const n of nodeIr.nodes) {
      assert.ok(n.sourceEvidence.length >= 1);
      for (const ev of n.sourceEvidence) assert.ok(/^design:\/\//.test(ev.locator) && ev.sourceRevisionId === "g2-fixture-rev-0001");
    }
    return `${NODE_COUNT} nodes, ${review.counts.byDisposition.NEEDS_REVIEW} needs-review, ${pageStructure.sections.length} planned sections`;
  });

  checkAsync("G2-T24b", "extract (no registry): unbound components stay custom-required, sections honestly unmapped", async () => {
    const r = await runCli(extractArgs(["--json"]));
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
    const o = JSON.parse(r.out).output;
    assert.deepEqual(o.review.counts.byDisposition, { MAPPED: 9, EXCLUDED_WITH_REASON: 5, DECORATION_MERGED: 2, REFERENCE_ONLY: 3, NEEDS_REVIEW: 6 });
    const pending = o.review.entries.filter((e) => e.provisionalTarget?.category === "custom-required");
    assert.equal(pending.length, 3, "two unbound instances + one invalid-ref instance pending custom-required");
    const featured = o.pageStructure.sections.find((s) => s.name === "SECTION/FeaturedProducts");
    assert.equal(featured.elements.length, 0, "unbound instances are not planned as mapped elements");
    assert.ok(!("registryRevisionId" in o.pageStructure.inputs), "no registry pin without a registry");
    return "6 needs-review, unbound sections honest";
  });

  checkAsync("G2-T25a", "no-write default, --dry-run, and truthful --out receipt (4 artifacts)", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-out-"));
    const plain = await runCli(extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS, "--json"]));
    assert.equal(plain.code, 0);
    assert.equal(fs.readdirSync(outDir).length, 0, "no --out -> nothing written");
    const dryDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-dry-"));
    const dry = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS, "--out", dryDir, "--dry-run"])]);
    assert.equal(dry.code, 0);
    assert.equal(fs.readdirSync(dryDir).length, 0, "dry-run writes nothing");
    const withOut = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS, "--out", outDir]), "--json"]);
    assert.equal(withOut.code, 0);
    assert.deepEqual(fs.readdirSync(outDir).sort(), ["node-ir.json", "page-structure.json", "source-review.json", "tool-run.json"]);
    const persisted = JSON.parse(fs.readFileSync(path.join(outDir, "tool-run.json"), "utf8"));
    assert.equal(persisted.wroteFiles, true);
    assert.equal(persisted.command, "extract");
    const terminal = JSON.parse(plain.out).run;
    assert.equal(terminal.wroteFiles, false);
    return "write truth agrees across receipt/terminal/disk";
  });

  checkAsync("G2-T25b", "determinism: two runs produce identical volatile hashes and stable node ids", async () => {
    const a = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]), "--json"]);
    const b = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]), "--json"]);
    assert.equal(a.code, 0, a.err);
    const ra = JSON.parse(a.out);
    const rb = JSON.parse(b.out);
    const roles = (x) => Object.fromEntries(x.run.artifacts.map((art) => [art.role, art.volatileContentHash]));
    assert.deepEqual(roles(ra), roles(rb), "volatileContentHash identical across runs");
    const ids = (x) => x.output.nodeIr.nodes.map((n) => n.nodeId).sort().join(",");
    assert.equal(ids(ra), ids(rb), "node ids stable");
    return "byte-stable across runs";
  });

  checkAsync("G2-T25c", "revision stability: a source revision bump keeps every node id, changes the payload hash + pins", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-rev-"));
    const tree = JSON.parse(fs.readFileSync(path.join(G2, "design-tree-primary.fixture.json"), "utf8"));
    tree.revisionId = "g2-fixture-rev-0002";
    fs.writeFileSync(path.join(tmp, "design-tree-primary.fixture.json"), JSON.stringify(tree, null, 2) + "\n");
    const before = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS]), "--json"]);
    const after = await runCli(["extract", "--profile", PROFILE, "--project", tmp, "--design-file", "design-tree-primary.fixture.json", "--design-node", "100:1", "--registry", REGISTRY, "--bindings", BINDINGS, "--json"]);
    assert.equal(after.code, 0, after.err);
    const A = JSON.parse(before.out).output;
    const B = JSON.parse(after.out).output;
    const idsA = A.nodeIr.nodes.map((n) => n.nodeId).sort().join(",");
    const idsB = B.nodeIr.nodes.map((n) => n.nodeId).sort().join(",");
    assert.equal(idsA, idsB, "locator-keyed ids are revision-independent");
    assert.notEqual(A.nodeIr.source.revisionId, B.nodeIr.source.revisionId, "revisions pinned and distinct");
    assert.notEqual(A.pageStructure.inputs.nodeIrContentHash, B.pageStructure.inputs.nodeIrContentHash, "payload hash moves with the revision");
    assert.notEqual(stableContentHash(A.nodeIr), stableContentHash(B.nodeIr));
    return "ids stable, revision tracked at payload level";
  });

  checkAsync("G2-T26a", "negative graphs fail closed with EVIDENCE_MISSING (cycle / dangling child / duplicate locator)", async () => {
    for (const [file, label] of [
      ["tree-neg-cycle.fixture.json", "cycle"],
      ["tree-neg-missing-child.fixture.json", "dangling child"],
      ["tree-neg-dup-locator.fixture.json", "duplicate locator"],
    ]) {
      const r = await runCli(["extract", "--profile", PROFILE, "--project", G2, "--design-file", file, "--design-node", "neg:1", "--json"]);
      assert.equal(r.code, 1, `${label} must exit 1, got ${r.code}`);
      const run = JSON.parse(r.out).run;
      assert.ok(run.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING" && x.severity === "error"), `${label}: ${JSON.stringify(run.converterDiagnostics)}`);
      assert.equal(run.artifacts.length, 0, `${label}: no artifacts from a broken graph`);
    }
    return "3 broken graphs rejected, nothing emitted";
  });

  checkAsync("G2-T26b", "scope escapes refused: unknown root locator (adapter) and out-of-scope port reads (core)", async () => {
    const r = await runCli(["extract", "--profile", PROFILE, "--project", G2, "--design-file", "design-tree-primary.fixture.json", "--design-node", "999:9", "--json"]);
    assert.equal(r.code, 3, "unknown root -> adapter runtime failure");
    const run = JSON.parse(r.out).run;
    assert.ok(run.runDiagnostics.some((x) => x.code === "ADAPTER_EXIT_NONZERO"));
    assert.equal(run.artifacts.length, 0);
    // Port-level: anything outside the extracted subtree is LOCATOR_OUT_OF_SCOPE, externally
    // indistinguishable from absent (no information leak).
    const snap = {
      schemaVersion: 1, sourceId: "s", revisionId: "r", accessedAt: "1970-01-01T00:00:00Z", rootLocator: "a:1",
      nodes: [
        { locator: "a:1", kind: "page", name: "PAGE/X", children: ["a:2"] },
        { locator: "a:2", kind: "text", name: "SLOT/T", children: [] },
        { locator: "a:9", kind: "frame", name: "OUTSIDE", children: [] },
      ],
    };
    const port = new SnapshotDesignSourcePort(snap);
    const present = port.readNode("a:9");
    const absent = port.readNode("zz:absent");
    assert.ok(!present.ok && present.diagnostic.code === "LOCATOR_OUT_OF_SCOPE");
    assert.ok(!absent.ok && absent.diagnostic.code === "LOCATOR_OUT_OF_SCOPE");
    assert.equal(JSON.stringify(present.diagnostic), JSON.stringify(absent.diagnostic), "outside-scope must be indistinguishable from absent");
    return "adapter + port scope gates enforced";
  });

  checkAsync("G2-T26c", "cross-project registry and stale binding pin fail closed (INPUT_CONTRACT_MISMATCH / EVIDENCE_MISSING)", async () => {
    const cross = await runCli([...extractArgs(["--registry", path.join(FIX, "..", "..", "examples/converter/capability-registry.magento-pagebuilder.example.json")]), "--json"]);
    assert.equal(cross.code, 1);
    const crossRun = JSON.parse(cross.out).run;
    assert.ok(crossRun.runDiagnostics.some((x) => x.code === "INPUT_CONTRACT_MISMATCH"), JSON.stringify(crossRun.runDiagnostics));
    assert.equal(crossRun.artifacts.length, 0);

    const stale = JSON.parse(fs.readFileSync(BINDINGS, "utf8"));
    stale.registry.registryRevisionId = "stale-rev-0000";
    const stalePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-stale-")), "bindings-stale.json");
    fs.writeFileSync(stalePath, JSON.stringify(stale, null, 2) + "\n");
    const r = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", stalePath]), "--json"]);
    assert.equal(r.code, 1);
    const run = JSON.parse(r.out).run;
    assert.ok(run.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING" && x.severity === "error"), JSON.stringify(run.converterDiagnostics));
    return "project/revision isolation enforced at extract time";
  });

  checkAsync("G2-T27a", "plan accepts a materialized PageStructure: mapped chain extract->plan; tampered pins fail", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-g2-chain-"));
    const x = await runCli([...extractArgs(["--registry", REGISTRY, "--bindings", BINDINGS, "--out", outDir]), "--json"]);
    assert.equal(x.code, 0, x.err);
    const planCli = (inputPath) => runCli(["plan", "--profile", PROFILE, "--registry", REGISTRY, "--bindings", BINDINGS, "--input", inputPath, "--json"]);
    const p = await planCli(path.join(outDir, "page-structure.json"));
    assert.equal(p.code, 0, `plan exit ${p.code}: ${p.err.slice(0, 400)}`);
    const report = JSON.parse(p.out).output;
    assert.equal(report.coverage.total, 2, "both bound instances resolve");
    const featured = report.sections.find((s) => s.name === "SECTION/FeaturedProducts");
    assert.equal(featured.status, "mapped");
    assert.equal(featured.proofLevel, "structurally-mapped");
    // Tampered provenance pins must never resolve.
    const ps = JSON.parse(fs.readFileSync(path.join(outDir, "page-structure.json"), "utf8"));
    ps.inputs.registryRevisionId = "stale-rev";
    const staleFile = path.join(outDir, "ps-stale.json");
    fs.writeFileSync(staleFile, JSON.stringify(ps, null, 2) + "\n");
    const stale = await planCli(staleFile);
    assert.equal(stale.code, 1);
    assert.ok(JSON.parse(stale.out).run.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "stale registry pin rejected pre-resolution");
    ps.inputs.registryRevisionId = "fixture-rev-0001";
    ps.inputs.bindingMapContentHash = "0".repeat(64);
    const tamperFile = path.join(outDir, "ps-tamper.json");
    fs.writeFileSync(tamperFile, JSON.stringify(ps, null, 2) + "\n");
    const tamper = await planCli(tamperFile);
    assert.equal(tamper.code, 1);
    assert.ok(JSON.parse(tamper.out).run.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "tampered binding pin rejected pre-resolution");
    return "extract->plan chain mapped; pins verified";
  });

  checkAsync("G2-T27b", "second design source: same core rules, invalid componentRef flagged, zero cross-source leakage", async () => {
    const r = await runCli(["extract", "--profile", PROFILE_B, "--project", G2, "--design-file", "design-tree-secondary.fixture.json", "--design-node", "landing-root", "--json"]);
    assert.equal(r.code, 0, r.err);
    const o = JSON.parse(r.out).output;
    assert.equal(o.nodeIr.nodes.length, 7);
    assert.equal(o.nodeIr.source.sourceId, "g2-fixture-source-b", "snapshot identity follows the profile's source");
    const bad = o.review.entries.find((e) => e.reason.includes("does not resolve to an inventoried component definition"));
    assert.ok(bad && bad.semanticClass === "SHARED_COMPONENT" && bad.disposition === "NEEDS_REVIEW", "componentRef to a non-component is flagged, never mapped");
    assert.ok(o.nodeIr.nodes.every((n) => n.nodeId.startsWith("n-")), "same id derivation for a different source");
    const defs = o.review.entries.filter((e) => e.disposition === "REFERENCE_ONLY");
    assert.ok(defs.length >= 2, "definition subtree recorded as reference-only");
    const sections = o.pageStructure.sections.map((s) => s.name);
    assert.deepEqual(sections, ["SECTION/Hero", "SECTION/Outro"]);
    for (const section of o.pageStructure.sections) for (const el of section.elements) assert.ok(!JSON.stringify(el).includes("g2-fixture-source/"), "no other-source leakage");
    return "7 nodes, 2 sections, invalid ref flagged";
  });

  checkAsync("G2-T29", "C1 regression: site chrome requires container evidence - spoofed SITE/ labels stay NEEDS_REVIEW, authentic chrome still excludes", async () => {
    const r = await runCli(["extract", "--profile", PROFILE, "--project", G2, "--design-file", "design-tree-spoofed-chrome.fixture.json", "--design-node", "300:1", "--json"]);
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
    const o = JSON.parse(r.out).output;
    const { nodeIr, pageStructure, review } = o;
    assert.equal(nodeIr.nodes.length, 10);
    assert.equal(review.counts.total, 10, "every node retained - nothing dropped by label");
    // Authentic chrome (top-level SITE/ container): still excluded, with container evidence named.
    const chrome = review.entries.filter((e) => e.semanticClass === "SITE_CHROME");
    assert.equal(chrome.length, 3, "SITE/Header + inherited subtree");
    assert.ok(chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON"), "all chrome excluded with reason");
    const topLevelChrome = chrome.find((e) => e.reason.includes("Top-level site chrome"));
    assert.ok(topLevelChrome && topLevelChrome.reason.includes("container evidence"), "authentic chrome excluded on hint + position + CONTAINER evidence");
    assert.ok(!pageStructure.sections.some((s) => s.name.startsWith("SITE/")), "authentic chrome not planned");
    // Spoofed labels (top-level non-containers named SITE/): ambiguous NEEDS_REVIEW, retained.
    const spoofed = review.entries.filter((e) => e.reason.includes("a label alone never excludes"));
    assert.equal(spoofed.length, 2, "SITE/BrandTagline (text) + SITE/BadgeInstance (instance)");
    assert.ok(spoofed.every((e) => e.semanticClass === "UNKNOWN_OR_AMBIGUOUS" && e.disposition === "NEEDS_REVIEW"));
    for (const name of ["SITE/BrandTagline", "SITE/BadgeInstance"]) {
      const node = nodeIr.nodes.find((n) => n.name === name);
      assert.ok(node, `${name} stays inventoried in the NodeIR`);
      assert.ok(review.entries.some((e) => e.nodeId === node.nodeId && e.disposition === "NEEDS_REVIEW"), `${name} retained as NEEDS_REVIEW`);
    }
    assert.equal(nodeIr.nodes.find((n) => n.name === "SITE/BrandTagline")?.visible, true, "spoofed nodes are NOT hidden-flagged - retained on merit");
    assert.deepEqual(review.counts.byDisposition, { MAPPED: 3, EXCLUDED_WITH_REASON: 3, DECORATION_MERGED: 0, REFERENCE_ONLY: 1, NEEDS_REVIEW: 3 });
    // Ambiguity inherits: a spoofed-chrome SUBTREE would also stay reviewable.
    return "authentic chrome excluded with container evidence; spoofed labels reviewed, retained";
  });

  checkAsync("G2-T30", "C1-final regression: a binding never promotes ambiguous ownership - same def+binding maps the editorial instance but not the spoofed SITE/ one", async () => {
    const r = await runCli(["extract", "--profile", PROFILE, "--project", G2, "--design-file", "design-tree-spoofed-chrome.fixture.json", "--design-node", "300:1", "--registry", REGISTRY, "--bindings", path.join(G2, "g2-spoofed-bindings.fixture.json"), "--json"]);
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err.slice(0, 400)}`);
    const o = JSON.parse(r.out).output;
    const { nodeIr, pageStructure, review } = o;
    assert.equal(nodeIr.nodes.length, 10);
    const idOf = (name) => nodeIr.nodes.find((n) => n.name === name).nodeId;
    // Spoofed top-level SITE/ instance WITH a resolving binding: stays ambiguous NEEDS_REVIEW,
    // keeps its label-conflict reason, and still reports the provisional capability.
    const spoofed = review.entries.find((e) => e.nodeId === idOf("SITE/BadgeInstance"));
    assert.equal(spoofed.semanticClass, "UNKNOWN_OR_AMBIGUOUS");
    assert.equal(spoofed.disposition, "NEEDS_REVIEW", "binding must NOT promote ambiguous ownership to MAPPED");
    assert.ok(spoofed.reason.includes("a label alone never excludes"), "label-conflict reason preserved");
    assert.deepEqual(spoofed.provisionalTarget?.capabilityIds, ["flatcms/heading"], "provisional capability still reported");
    // The SAME definition + SAME binding inside a real section: valid editorial instance -> MAPPED + planned.
    const valid = review.entries.find((e) => e.nodeId === idOf("INSTANCE/Badge/InSection"));
    assert.equal(valid.semanticClass, "SHARED_COMPONENT");
    assert.equal(valid.disposition, "MAPPED");
    const section = pageStructure.sections.find((s) => s.name === "SECTION/RealSection");
    const element = section.elements.find((e) => e.elementId === idOf("INSTANCE/Badge/InSection"));
    assert.ok(element && element.resolution.status === "mapped" && element.target?.capabilityId === "flatcms/heading");
    // Authentic chrome unchanged in the bound run.
    const chrome = review.entries.filter((e) => e.semanticClass === "SITE_CHROME");
    assert.equal(chrome.length, 3);
    assert.ok(chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON"));
    assert.deepEqual(review.counts.byDisposition, { MAPPED: 4, EXCLUDED_WITH_REASON: 3, DECORATION_MERGED: 0, REFERENCE_ONLY: 1, NEEDS_REVIEW: 2 });
    return "same binding: editorial instance mapped, spoofed SITE/ instance reviewed";
  });

  checkAsync("G2-T28", "id derivation + neutrality over the new G2 surfaces", async () => {
    // Stable, kind-sensitive, locator-keyed ids.
    const a = deriveNodeId("s", "loc", "container");
    assert.equal(a, deriveNodeId("s", "loc", "container"), "stable for identical identity inputs");
    assert.notEqual(a, deriveNodeId("s", "loc", "text"), "kind participates");
    assert.notEqual(a, deriveNodeId("s", "other", "container"), "locator participates");
    assert.ok(/^n-[0-9a-f]{12}$/.test(a));
    // Neutrality scan over the new surfaces (same term policy as T-09/T-18b).
    const neutralTerms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
    const hits = [];
    const scan = (rel, text) => {
      const m = text.match(new RegExp(neutralTerms.source, "gi"));
      if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
    };
    for (const f of ["node-ir.schema.json", "page-structure.schema.json", "source-review.schema.json"]) {
      scan(`schemas/converter/${f}`, fs.readFileSync(path.join(FIX, "..", "..", "schemas/converter", f), "utf8"));
    }
    scan("schemas/cli/design-source-snapshot.schema.json", fs.readFileSync(path.join(FIX, "..", "..", "schemas/cli/design-source-snapshot.schema.json"), "utf8"));
    scan("dist/src/core/design-source/extract.js", fs.readFileSync(path.join(FIX, "..", "..", "dist/src/core/design-source/extract.js"), "utf8"));
    scan("dist/src/core/design-source/port.js", fs.readFileSync(path.join(FIX, "..", "..", "dist/src/core/design-source/port.js"), "utf8"));
    scan("dist/src/core/cli/commands/extract.js", fs.readFileSync(path.join(FIX, "..", "..", "dist/src/core/cli/commands/extract.js"), "utf8"));
    for (const f of fs.readdirSync(G2)) if (f.endsWith(".json")) scan(`tests/fixtures/g2-design-source/${f}`, fs.readFileSync(path.join(G2, f), "utf8"));
    for (const f of ["descriptor.json"]) scan(`adapters/design-source-fixture/${f}`, fs.readFileSync(path.join(FIX, "..", "..", "adapters/design-source-fixture", f), "utf8"));
    for (const f of fs.readdirSync(path.join(FIX, "..", "..", "examples/converter")).filter((x) => x.includes("g2"))) {
      scan(`examples/converter/${f}`, fs.readFileSync(path.join(FIX, "..", "..", "examples/converter", f), "utf8"));
    }
    assert.deepEqual(hits, [], "neutrality violations:\n" + hits.join("\n"));
    return "0 matches across schemas/core/adapters/fixtures/examples";
  });
}
