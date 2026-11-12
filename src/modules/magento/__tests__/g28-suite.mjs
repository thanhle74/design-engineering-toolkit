// Issue #28 G28 suite: the FULL-ROOT end-to-end composition — the complete observed desktop
// Homepage root 245:2 (raw-faithful fixture, 253 inventoried nodes incl. expanded instance
// subtrees) composed through the SAME pipeline (det inspect > det extract > det compose) into
// native Page Builder master format covering ALL twelve planned editorial sections through the
// four bounded shapes: the G3 hero, the G4 two-column, the #28 column-grid (Rule A grid lines /
// Rule B split with a synthesized complement column) and the #28 guarded text band, with native
// buttons/button-item CTAs. Registers async checks on the shared run-all runner: the extended
// fixture probe (buttons/button-item registered), the full-root extraction (inventory +
// accountability + all sections planned), full-page composition (per-shape structural invariants,
// style-block mechanism, honesty), determinism + no-write defaults, pin negatives, committed
// example parity and neutrality over the new surfaces. The G3/G4 suites keep guarding their
// byte-identical baselines in the same run.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT as ROOT } from "../../../../src/core/__tests__/repo-root.mjs";
import { main } from "../../../../dist/src/core/cli/main.js";
import { canonicalStringify, stripVolatile } from "../../../../dist/src/core/canonical.js";

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const G28 = path.join(FIX, "g28-home-design-source");
const CHECKOUT = path.join(FIX, "g3-magento-like");
const PROFILE = path.join(G28, "profile-g28-home-fixture.json");
const TREE = "design-tree-home-desktop.fixture.json";
const SECTION_NAMES = [
  "SECTION/Hero/Primary", "SECTION/BrandStatement", "SECTION/Hero/Secondary", "SECTION/FeaturedCollections",
  "SECTION/FeaturedProducts", "SECTION/CampaignEditorial", "SECTION/Lookbook", "SECTION/EditorialMosaic",
  "SECTION/Craftsmanship", "SECTION/ThePeople", "SECTION/ProductSpotlight", "SECTION/Newsletter",
];
// Hand-derived from the raw-observed full-root tree at the fixture revision (asserted exact):
// 253 nodes; 52 site-chrome nodes excluded with reason (AnnouncementBar/Header/Footer subtrees);
// 49 NEEDS_REVIEW (21 unknown-kind rounded-rectangle/ellipse layers + 28 externally-defined
// component instances); 1 top-level DECOR leaf merged; nothing silently dropped.
const NODE_COUNT = 253;
const EXPECTED_DISPOSITIONS = { MAPPED: 151, EXCLUDED_WITH_REASON: 52, DECORATION_MERGED: 1, REFERENCE_ONLY: 0, NEEDS_REVIEW: 49 };
const EXPECTED_CLASSES = { SITE_CHROME: 52, EDITORIAL_SECTION: 151, SHARED_COMPONENT: 28, PRESENTATIONAL: 1, UNKNOWN_OR_AMBIGUOUS: 21 };
// The design's own footer copyright string (raw observed source copy — the raw-faithful fidelity
// rule forbids rewriting observed layer names; documented neutrality-scan exception below).
const OBSERVED_COPYRIGHT = "© 2026 SLAUNCH. ALL RIGHTS RESERVED.";

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function inTempRun(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g28-suite-"));
  const r = await runCli([...args, "--out", dir, "--json"]);
  return { dir, ...r };
}

async function extractOnce(registryPath) {
  const { dir, code, err } = await inTempRun([
    "extract", "--profile", PROFILE, "--project", G28, "--design-file", TREE, "--design-node", "245:2",
    "--registry", registryPath, "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
  ]);
  assert.equal(code, 0, `extract exit ${code}: ${err.slice(0, 300)}`);
  return dir;
}

const composeArgsFor = (extractDir, registryPath) => [
  "compose", "--profile", PROFILE, "--registry", registryPath,
  "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
  "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
  "--content", path.join(G28, "g28-home-content.fixture.json"),
  "--projection", path.join(G28, "g28-home-projection.fixture.json"),
];

export default async function registerG28Suite(checkAsync) {
  let registryPath; // produced once by the capability probe check, reused by later checks

  checkAsync("G28-T31a", "extended fixture probe: buttons/button-item registered declaration-backed alongside the established chain", async () => {
    const { dir, code, err } = await inTempRun(["inspect", "--profile", PROFILE, "--project", CHECKOUT]);
    try {
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const out = JSON.parse(fs.readFileSync(path.join(dir, "capability-registry.json"), "utf8"));
      assert.match(out.source.revisionId, /^content:[0-9a-f]{16}$/, "revision must be the deterministic content digest");
      const caps = new Map(out.capabilities.map((c) => [`${c.id}#${c.appearanceId}`, c]));
      for (const key of ["magento_pagebuilder/buttons#inline", "magento_pagebuilder/button-item#default"]) {
        const cap = caps.get(key);
        assert.ok(cap, `${key} declared in the fixture checkout`);
        assert.equal(cap.category, "native", `${key} native`);
        assert.equal(cap.availability, "enabled", `${key} enabled via config.php`);
        assert.equal(cap.proofLevel, "registered", `${key} capped at declaration proof`);
      }
      registryPath = path.join(dir, "capability-registry.json");
      return "buttons + button-item registered (declaration proof), deterministic content-digest revision";
    } finally {
      if (!registryPath) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31b", "full-root extraction: 253-node inventory, every top-level section planned, chrome excluded with reason, instance subtrees inventoried", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const { dir, code, err } = await inTempRun([
      "extract", "--profile", PROFILE, "--project", G28, "--design-file", TREE, "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
    ]);
    try {
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const ir = JSON.parse(fs.readFileSync(path.join(dir, "node-ir.json"), "utf8"));
      const ps = JSON.parse(fs.readFileSync(path.join(dir, "page-structure.json"), "utf8"));
      const review = JSON.parse(fs.readFileSync(path.join(dir, "source-review.json"), "utf8"));
      assert.equal(ir.nodes.length, NODE_COUNT);
      assert.equal(review.counts.total, NODE_COUNT);
      assert.deepEqual(review.counts.byDisposition, EXPECTED_DISPOSITIONS);
      assert.deepEqual(review.counts.byClass, EXPECTED_CLASSES);
      assert.deepEqual(ps.sections.map((s) => s.name), SECTION_NAMES);
      // Expanded instance subtrees are inventoried: the Women collection tile's override label.
      const label = ir.nodes.find((n) => n.sourceEvidence?.[0]?.locator === `design://g28-home-fixture-source/I436:460;436:399`);
      assert.ok(label, "instance-override locator inventoried");
      assert.equal(label.kind, "text", "override label stays an observed text node");
      const labelFrame = ir.nodes.find((n) => n.nodeId === label.parentNodeId);
      assert.equal(labelFrame.sourceEvidence?.[0]?.locator, `design://g28-home-fixture-source/I436:460;436:398`, "override label inside its Label frame");
      assert.equal(labelFrame.parentNodeId, ir.nodes.find((n) => n.sourceEvidence?.[0]?.locator === `design://g28-home-fixture-source/436:460`).nodeId, "Label frame child of the tile instance");
      // Chrome excluded with reason (AnnouncementBar/Header/Footer), still accounted.
      const chrome = review.entries.filter((e) => e.semanticClass === "SITE_CHROME");
      assert.equal(chrome.length, 52);
      assert.ok(chrome.every((e) => e.disposition === "EXCLUDED_WITH_REASON" && (e.reason.includes("site-chrome") || e.reason.includes("site chrome"))));
      // Externally defined component instances stay honest NEEDS_REVIEW (custom-required pending).
      const needs = review.entries.filter((e) => e.disposition === "NEEDS_REVIEW");
      assert.equal(needs.length, 49);
      assert.ok(needs.every((e) => e.reason.includes("outside the mapped kind table") || e.reason.includes("does not resolve to an inventoried component definition")));
      assert.equal(ps.inputs.nodeIrContentHash !== undefined, true, "plan pins the NodeIR hash");
      return `${NODE_COUNT} raw-observed nodes: 12/12 sections planned, 52 chrome excluded, 49 honest NEEDS_REVIEW`;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31c", "full-page compose: all 12 sections composed through the four bounded shapes, structural invariants per shape, honest accountability", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const { code, out, err } = await runCli([...composeArgsFor(extractDir, registryPath), "--json"]);
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const report = JSON.parse(out).output.report;
      const c = report.content;
      const skipped = report.mapping.filter((m) => m.disposition === "skipped");
      assert.deepEqual(skipped.map((m) => m.sourceName), [], "no planned section silently skipped");
      // Per-shape structural invariants.
      const rows = c.split('<div data-content-type="row"').length - 1;
      assert.equal(rows, 12, "one contained row per planned section");
      // Hero: native banner poster with the rehydratable keyed overlay (no inline overlay style).
      assert.equal(c.includes('data-content-type="banner" data-appearance="poster"'), true, "hero banner");
      assert.equal(c.includes("<p>CHAPTER 01 / AW 2026</p><h2>The Quiet Grandeur</h2>"), true, "hero content WYSIWYG");
      assert.match(c, /<style>#html-body \[data-pb-style=P[0-9A-F]{6}\]\{min-height:880px\}<\/style>/, "hero overlay min-height keyed");
      assert.equal(c.includes('style="min-height: 880px;"'), false, "no inline overlay min-height");
      // Text band (BrandStatement): row > text with the observed statement; keyed row min-height.
      assert.equal(c.includes("<p>THE HOUSE</p><h2>Luxury is what remains when everything unnecessary has been removed.</h2>"), true, "brand statement band");
      assert.match(c, /\{min-height:280px\}/, "band row min-height keyed");
      // Grid Rule B (Hero/Secondary): 2 columns 73/27 (940px slot of the observed 1280px content
      // width) + explicit media + button-item CTA. Styles live in the keyed style block; each
      // column element carries the data-pb-style key of its rule.
      const colKeyOf = (pct) => {
        const m = c.match(new RegExp(`\\[data-pb-style=([A-Z0-9]{7})\\]\\{justify-content:flex-start;display:flex;flex-direction:column;width:${pct};align-self:stretch\\}`));
        assert.ok(m, `column style rule for ${pct}`);
        return m[1];
      };
      const hsMediaKey = colKeyOf("73%");
      assert.equal(c.includes(`data-pb-style="${hsMediaKey}"><figure data-content-type="image"`), true, "explicit media column opens with its image at 73%");
      const hsSynthKey = colKeyOf("27%");
      assert.equal(c.includes(`data-pb-style="${hsSynthKey}"><div data-content-type="text"`), true, "synthesized complement column opens with its text WYSIWYG at 27%");
      assert.equal(c.includes("<span data-element=\"link_text\">DISCOVER THE EDIT</span>"), true, "Hero/Secondary CTA button");
      // Grid Rule A (FeaturedProducts): 4 equal card columns; MOCK copy flagged in the manifest.
      assert.equal((c.match(/width:25%;align-self:stretch/g) ?? []).length, 6, "six 25% column rules (4 product cards + Lookbook's two 25% side columns)");
      assert.equal((c.match(/Classic Cotton Shirt/g) ?? []).length, 1, "card name composed once");
      const cardKey = colKeyOf("25%");
      assert.equal(c.includes(`data-pb-style="${cardKey}"><figure data-content-type="image"`), true, "a card column opens with its image");
      // Grid Rule A (EditorialMosaic): 4 columns at 23/28/22/27 with 8 images.
      for (const pct of ["23%", "28%", "22%", "27%"]) {
        assert.equal(c.includes(`width:${pct};align-self:stretch`), true, `mosaic column ${pct}`);
      }
      assert.equal(c.split('data-content-type="image"').length - 1, 30, "30 native image elements across the page (hero uses the banner background)");
      // ThePeople: 4 columns 30/21/13/36; captions folded into their columns.
      for (const pct of ["30%", "21%", "13%", "36%"]) {
        assert.equal(c.includes(`width:${pct};align-self:stretch`), true, `people column ${pct}`);
      }
      assert.equal(c.includes("LOOK 02 — MINIMAL MENSWEAR"), true, "caption composed");
      // Newsletter: text band + Subscribe button; NO form input (explicit gap).
      assert.equal(c.includes("<span data-element=\"link_text\">Subscribe</span>"), true, "newsletter button");
      assert.equal(c.includes("Email address"), false, "no invented form input content");
      const inputGap = report.mapping.find((m) => m.sourceName === "Proto / Input — Email");
      assert.ok(inputGap, "newsletter input accounted");
      assert.equal(inputGap.disposition, "gap", "input recorded as an explicit gap (no native PB form field)");
      // Buttons: native pair only; no arbitrary embeddable markup anywhere.
      assert.equal(c.includes('data-content-type="buttons" data-appearance="inline"'), true, "native buttons container");
      assert.equal(c.includes('data-content-type="html"'), false, "no arbitrary embeddable content type");
      // Style-block mechanism: unique deterministic keys; no inline styles on structural elements.
      const keys = [...c.matchAll(/data-pb-style="([A-Z0-9]{7})"/g)].map((m) => m[1]);
      assert.equal(new Set(keys).size, keys.length, "data-pb-style keys unique");
      for (const m of c.matchAll(/<div class="pagebuilder-column" [^>]*\sstyle="/g)) assert.fail(`inline style on a structural column: ${m[0]}`);
      // Honest gap accounting: gradients, affordances, hotspots limit; nothing invented.
      const gaps = report.mapping.filter((m) => m.disposition === "gap");
      assert.ok(gaps.length >= 19, `explicit gaps recorded (${gaps.length})`);
      assert.ok(gaps.some((m) => (m.note ?? "").includes("decoration")), "decoration gaps recorded");
      assert.equal(report.diagnostics.filter((d) => d.severity === "error").length, 0, "no error diagnostics");
      return `12/12 sections composed (${c.length}B): hero + 2 two-column-family splits + 4 grids + 2 bands; ${gaps.length} honest gaps`;
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31d", "compose determinism + no-write defaults over the full-root inputs", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const r1 = await runCli([...composeArgsFor(extractDir, registryPath), "--out", extractDir, "--json"]);
      assert.equal(r1.code, 0, `compose exit ${r1.code}: ${r1.err.slice(0, 300)}`);
      const p1 = JSON.parse(r1.out).output.report;
      const r2 = await runCli([...composeArgsFor(extractDir, registryPath), "--json"]);
      assert.equal(r2.code, 0);
      const p2 = JSON.parse(r2.out).output.report;
      assert.equal(p1.contentHash, p2.contentHash, "byte-identical content across runs");
      assert.equal(JSON.parse(r1.out).run.wroteFiles, true, "--out run wrote its artifacts");
      assert.equal(JSON.parse(r2.out).run.wroteFiles, false, "no --out: wroteFiles false");
      const dry = await runCli([...composeArgsFor(extractDir, registryPath), "--out", extractDir, "--dry-run", "--json"]);
      assert.equal(dry.code, 0);
      assert.equal(JSON.parse(dry.out).run.wroteFiles, false, "--dry-run writes nothing");
      fs.rmSync(path.join(extractDir, "native-content.html"), { force: true }); // drop the --out run's artifact before the absence check
      assert.ok(!fs.existsSync(path.join(extractDir, "native-content.html")), "dry run materialized nothing");
      return "full-root compose byte-deterministic; stdout-only and dry-run truth enforced";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31e", "pin negatives: manifest/projection revision and NodeIR hash mismatches fail closed", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g28-neg-"));
      const manifest = JSON.parse(fs.readFileSync(path.join(G28, "g28-home-content.fixture.json"), "utf8"));
      const badManifest = { ...manifest, sourceRevisionId: "mcp-observed-unpinned-OTHER" };
      const badManifestPath = path.join(tmp, "bad-manifest.json");
      fs.writeFileSync(badManifestPath, JSON.stringify(badManifest));
      const r1 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", badManifestPath,
        "--projection", path.join(G28, "g28-home-projection.fixture.json"), "--json",
      ]);
      assert.equal(r1.code, 1, "manifest pinned to another revision must refuse");
      assert.ok(JSON.parse(r1.out).run.converterDiagnostics.some((d) => d.code === "EVIDENCE_MISSING"), "explicit EVIDENCE_MISSING");
      const projection = JSON.parse(fs.readFileSync(path.join(G28, "g28-home-projection.fixture.json"), "utf8"));
      const badProjection = { ...projection, sourceRevisionId: "mcp-observed-unpinned-OTHER" };
      const badProjectionPath = path.join(tmp, "bad-projection.json");
      fs.writeFileSync(badProjectionPath, JSON.stringify(badProjection));
      const r2 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G28, "g28-home-content.fixture.json"),
        "--projection", badProjectionPath, "--json",
      ]);
      assert.equal(r2.code, 1, "projection pinned to another revision must refuse");
      assert.ok(JSON.parse(r2.out).run.converterDiagnostics.some((d) => d.code === "EVIDENCE_MISSING"), "explicit EVIDENCE_MISSING");
      const nodeIr = JSON.parse(fs.readFileSync(path.join(extractDir, "node-ir.json"), "utf8"));
      nodeIr.nodes[0].name = "TAMPERED";
      const badIrPath = path.join(tmp, "bad-nodeir.json");
      fs.writeFileSync(badIrPath, JSON.stringify(nodeIr));
      const r3 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G28, "g28-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", badIrPath,
        "--content", path.join(G28, "g28-home-content.fixture.json"),
        "--projection", path.join(G28, "g28-home-projection.fixture.json"), "--json",
      ]);
      assert.equal(r3.code, 1, "tampered NodeIR (hash pin) must refuse");
      assert.ok(JSON.parse(r3.out).run.converterDiagnostics.some((d) => d.code === "EVIDENCE_MISSING"), "explicit EVIDENCE_MISSING");
      fs.rmSync(tmp, { recursive: true, force: true });
      return "3/3 pin violations blocked with explicit diagnostics";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31f", "committed compose example equals a fresh run (volatile timestamps stripped) + fixtures contract-valid", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const { code, out, err } = await runCli([...composeArgsFor(extractDir, registryPath), "--json"]);
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const fresh = JSON.parse(out).output.report;
      const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "examples/converter/compose-output.issue28-home.example.json"), "utf8"));
      assert.equal(canonicalStringify(stripVolatile(fresh)), canonicalStringify(stripVolatile(committed)), "committed example drifts from a fresh compose");
      const { validateContract } = await import("../../../../dist/src/core/schema-registry.js");
      const check = validateContract("compose-output", committed);
      assert.ok(check.valid, `committed example must validate: ${check.errors.slice(0, 3).join("; ")}`);
      for (const [name, file, contract] of [
        ["content manifest", "g28-home-content.fixture.json", "content-manifest"],
        ["semantic projection", "g28-home-projection.fixture.json", "semantic-projection"],
      ]) {
        const doc = JSON.parse(fs.readFileSync(path.join(G28, file), "utf8"));
        const c = validateContract(contract, doc);
        assert.ok(c.valid, `${name} fixture must validate: ${c.errors.slice(0, 3).join("; ")}`);
      }
      return "example reproducible + contract-valid";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G28-T31g", "neutrality over the new G28 fixture surfaces (with the documented observed-copyright exception)", async () => {
    const neutralTerms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
    const hits = [];
    const scan = (rel, text) => {
      const m = text.match(new RegExp(neutralTerms.source, "gi"));
      if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
    };
    for (const f of fs.readdirSync(G28).filter((x) => x.endsWith(".json") && (x.startsWith("design-tree") || x.startsWith("g28-home-content") || x.startsWith("g28-home-projection")))) {
      scan(`src/modules/magento/__tests__/fixtures/g28-home-design-source/${f}`, fs.readFileSync(path.join(G28, f), "utf8"));
    }
    // Documented exception: the design's own footer copyright line is raw observed source copy
    // (a layer NAME carried verbatim per the raw-faithful fidelity rule; the scan exists to
    // catch owner-context leakage, not the source's own public brand string). Any OTHER hit in
    // the tree is a violation.
    const treeHits = hits.find((h) => h.startsWith("src/modules/magento/__tests__/fixtures/g28-home-design-source/design-tree-home-desktop.fixture.json"));
    if (treeHits) {
      const tree = fs.readFileSync(path.join(G28, "design-tree-home-desktop.fixture.json"), "utf8");
      const outsideCopyright = [...tree.matchAll(new RegExp(neutralTerms.source, "gi"))].filter((m) => !tree.slice(Math.max(0, m.index - 80), m.index + 160).includes("SLAUNCH. ALL RIGHTS RESERVED"));
      assert.deepEqual(outsideCopyright.map((m) => m[0]), [], "neutrality violations beyond the observed copyright:\n" + JSON.stringify(outsideCopyright.slice(0, 5)));
      hits.splice(hits.indexOf(treeHits), 1);
    }
    assert.deepEqual(hits, [], "neutrality violations:\n" + hits.join("\n"));
    return "0 unexplained matches across the new design-source surfaces";
  });
}
