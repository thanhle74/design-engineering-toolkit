// Issue #56 suite: the first real-source Studio build project
// (examples/build/slaunchpad-home-real-derived). Locks the provenance chain from the
// committed #18 live-read evidence to the offline `det build` bundle the Studio /build page
// runs, plus the honesty invariants (no invented content, no machine paths, measured
// partial coverage). All checks run fully offline over committed artifacts — no provider
// access, no defaults.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { stableContentHash } from "../packages/core/dist/src/core/canonical.js";
import { validateContract } from "../packages/core/dist/src/core/schema-registry.js";
import { validateRegistry } from "../packages/core/dist/src/core/semantic.js";
import { main } from "../packages/core/dist/src/core/cli/main.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT = path.join(ROOT, "examples/build/slaunchpad-home-real-derived");
const LIVE = path.join(ROOT, "evidence/issue-18/live-read-verified");
const SOURCE_REVISION = "2417494580183108397";

async function runCli(args) {
  const out = [];
  const err = [];
  const code = await main(args, {}, { env: {}, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export default async function registerRealDerivedSuite(checkAsync) {
  checkAsync("R56-T1", "committed snapshot tree re-derives byte-for-byte from the committed #18 NodeIR via the committed tool", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-56-tree-"));
    const derived = path.join(outDir, "tree.json");
    execFileSync(
      process.execPath,
      [
        path.join(PROJECT, "tools/derive-snapshot-tree.mjs"),
        path.join(LIVE, "node-ir.json"),
        derived,
        "figma-home-desktop",
        SOURCE_REVISION,
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const committed = fs.readFileSync(path.join(PROJECT, "snapshot-project/figma-home-desktop.245-2.tree.json"), "utf8");
    assert.equal(fs.readFileSync(derived, "utf8"), committed, "re-derived tree must be byte-identical to the committed one");
    const parsed = JSON.parse(committed);
    assert.equal(parsed.revisionId, SOURCE_REVISION, "tree carries the pinned provider revision");
    assert.equal(parsed.nodes.length, 337, "all 337 live-read nodes are transported");
    return "byte-identical re-derivation; 337 nodes @ rev " + SOURCE_REVISION;
  });

  checkAsync("R56-T2", "offline extract over the committed tree reproduces the committed #18 artifacts' stable hashes", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-56-extract-"));
    const { code, err } = await runCli([
      "extract",
      "--profile", path.join(PROJECT, "profile.json"),
      "--project", path.join(PROJECT, "snapshot-project"),
      "--design-file", "figma-home-desktop.245-2.tree.json",
      "--design-node", "245:2",
      "--out", outDir,
      "--json",
    ]);
    assert.equal(code, 0, `extract exit ${code}: ${err.slice(0, 300)}`);
    // Without registry/bindings the extraction is pin-free — exactly the #18 run's shape, so
    // every artifact must reproduce the committed live-read evidence's stable content hash.
    for (const name of ["node-ir", "page-structure", "source-review"]) {
      const produced = stableContentHash(JSON.parse(fs.readFileSync(path.join(outDir, `${name}.json`), "utf8")));
      const committed = stableContentHash(JSON.parse(fs.readFileSync(path.join(LIVE, `${name}.json`), "utf8")));
      assert.equal(produced, committed, `${name} stable hash must equal the committed #18 ${name}`);
    }
    return "node-ir, page-structure and source-review stable hashes match the live-read evidence";
  });

  let bundleDir = null;

  checkAsync("R56-T3", "det build on the committed real-derived project: exit 0, revision-pinned manifest, honest partial composition", async () => {
    bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-56-build-"));
    const { code, out, err } = await runCli([
      "build",
      "--config", path.join(PROJECT, "build-config.json"),
      "--out", bundleDir,
      "--json",
    ]);
    assert.equal(code, 0, `build exit ${code}: ${err.slice(0, 300)}`);
    const manifest = JSON.parse(out.slice(out.indexOf("{"))).manifest;
    assert.deepEqual(
      { sourceId: manifest.source.sourceId, revisionId: manifest.source.revisionId },
      { sourceId: "figma-home-desktop", revisionId: SOURCE_REVISION },
      "bundle carries the real-derived revision pin"
    );
    assert.deepEqual(manifest.stages.map((s) => [s.stage, s.status, s.exitCode]), [
      ["capability-probe", "reused", 0],
      ["extraction", "completed", 0],
      ["composition", "completed", 0],
    ]);
    // The bundle's extraction inventory IS the committed live-read inventory (stable hash).
    const bundleNodeIr = stableContentHash(JSON.parse(fs.readFileSync(path.join(bundleDir, "02-extraction/node-ir.json"), "utf8")));
    const committedNodeIr = stableContentHash(JSON.parse(fs.readFileSync(path.join(LIVE, "node-ir.json"), "utf8")));
    assert.equal(bundleNodeIr, committedNodeIr, "bundle node-ir stable hash equals the committed #18 node-ir");
    // Composition honesty: exactly the two investigated candidate sections compose; every
    // other planned section carries an explicit skipped record.
    const report = JSON.parse(fs.readFileSync(path.join(bundleDir, "03-composition/compose-report.json"), "utf8"));
    const sectionEntries = report.mapping.filter((m) => (m.sourceName ?? "").startsWith("SECTION/"));
    const mappedSections = sectionEntries.filter((m) => m.disposition === "mapped").map((m) => m.sourceName).sort();
    const skippedSections = sectionEntries.filter((m) => m.disposition === "skipped");
    assert.deepEqual(mappedSections, ["SECTION/Craftsmanship", "SECTION/Hero/Primary"], "only the investigated candidates compose");
    assert.equal(skippedSections.length, 10, "the other 10 sections stay explicitly skipped");
    assert.ok(skippedSections.every((m) => (m.note ?? "").length > 0), "every skip carries its reason");
    const gapCodes = manifest.gaps.map((g) => g.code);
    const skipsGap = manifest.gaps.find((g) => g.code === "COMPOSITION_SKIPS_PRESENT");
    assert.ok(gapCodes.includes("COMPOSITION_GAPS_PRESENT"), "fidelity gaps recorded");
    assert.equal(skipsGap?.count, 10, "manifest summarizes the 10 skips");
    // Native targets: the reviewed composer shapes only (hero banner + two-column chain).
    const html = fs.readFileSync(path.join(bundleDir, "03-composition/native-content.html"), "utf8");
    for (const marker of ['data-content-type="banner"', 'data-appearance="poster"', 'data-content-type="column-group"', 'data-content-type="column-line"', 'data-content-type="column"', 'data-content-type="image"']) {
      assert.ok(html.includes(marker), `native content carries ${marker}`);
    }
    assert.ok(!html.includes("<script"), "no script content is ever emitted");
    return "2/12 sections composed (banner + two-column), 10 explicit skips, revision-pinned bundle";
  });

  checkAsync("R56-T4", "committed project pins are mutually consistent and machine-path-free", () => {
    const config = JSON.parse(fs.readFileSync(path.join(PROJECT, "build-config.json"), "utf8"));
    const cfgCheck = validateContract("build-config", config);
    assert.ok(cfgCheck.valid, `build-config must validate: ${cfgCheck.errors.slice(0, 2).join("; ")}`);
    assert.equal(config.designSource.mode, "snapshot", "offline snapshot mode only");
    assert.equal(config.designSource.designNode, "245:2", "caller-selected root pinned");
    const registry = JSON.parse(fs.readFileSync(path.join(PROJECT, "capability-registry.json"), "utf8"));
    const verdict = validateRegistry(registry);
    assert.equal(verdict.valid, true, "pinned registry must pass validateRegistry");
    const bindings = JSON.parse(fs.readFileSync(path.join(PROJECT, "component-bindings.json"), "utf8"));
    assert.equal(bindings.registry.registryRevisionId, registry.source.revisionId, "bindings pin the committed registry revision");
    assert.equal(bindings.bindings.length, 0, "zero bindings — nothing is provable beyond the composer's structural shapes");
    const content = JSON.parse(fs.readFileSync(path.join(PROJECT, "content-manifest.json"), "utf8"));
    const projection = JSON.parse(fs.readFileSync(path.join(PROJECT, "semantic-projection.json"), "utf8"));
    for (const [name, doc] of [["content", content], ["projection", projection]]) {
      assert.equal(doc.sourceRevisionId, SOURCE_REVISION, `${name} pinned to the live-read revision`);
    }
    // Portability: no machine-specific absolute paths and no provider file key anywhere in
    // the committed project (the registry's evidence locators are source-scoped by design).
    const offender = [];
    for (const rel of ["build-config.json", "profile.json", "capability-registry.json", "component-bindings.json", "content-manifest.json", "semantic-projection.json", "project.json", "README.md", "snapshot-project/figma-home-desktop.245-2.tree.json"]) {
      const text = fs.readFileSync(path.join(PROJECT, rel), "utf8");
      // Case-sensitive: Linux machine paths are lowercase, while the design's own layer
      // naming (e.g. `PAGE/Home/Desktop`) legitimately contains capitalized path-like text.
      if (/\/home\/[a-z0-9._-]+\//.test(text)) offender.push(`${rel}: absolute home path`);
      if (/vNPtfBRpYM3PsExirVqhmt/.test(text)) offender.push(`${rel}: provider file key`);
    }
    assert.deepEqual(offender, [], "project surfaces stay portable and provider-identifier-free:\n" + offender.join("\n"));
    return "config/registry/bindings/content/projection pins consistent; no machine paths, no provider ids";
  });

  checkAsync("R56-T5", "content manifest carries only observed evidence (locator exists; text equals the committed layer name)", () => {
    const nodeIr = JSON.parse(fs.readFileSync(path.join(LIVE, "node-ir.json"), "utf8"));
    const byLocator = new Map(nodeIr.nodes.map((n) => [n.sourceEvidence[0].locator, n]));
    const content = JSON.parse(fs.readFileSync(path.join(PROJECT, "content-manifest.json"), "utf8"));
    for (const entry of content.entries) {
      const node = byLocator.get(entry.valueRef);
      assert.ok(node, `content valueRef '${entry.valueRef}' must exist in the committed #18 NodeIR (no invented locators)`);
      if (entry.kind === "text") {
        assert.equal(entry.text, node.name, `text for '${entry.valueRef}' must be the observed design layer name, never authored copy`);
        assert.match(entry.note ?? "", /Observed as the design layer name/, "text provenance note present");
      }
      if (entry.kind === "media") {
        assert.match(entry.assetLabel ?? "", /placeholder/, "media entries stay labeled offline placeholders");
        assert.match(entry.mediaUrl, /^\{\{media url=/, "media URLs use the platform's own placeholder form");
      }
    }
    // The three hero text nodes observed in the committed evidence are exactly what ships.
    const texts = content.entries.filter((e) => e.kind === "text").map((e) => e.text).sort();
    assert.deepEqual(texts, ["CHAPTER 01 / AW 2026", "Refined tailoring, knitwear and leather for the season.", "The Quiet Grandeur"]);
    return `${content.entries.length} observed-only entries; text = committed layer names; media labeled placeholders`;
  });

  checkAsync("R56-T6", "plan over the committed chain resolves all 12 sections with honestly zero coverage", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-56-plan-"));
    const { code } = await runCli([
      "plan",
      "--profile", path.join(PROJECT, "profile.json"),
      "--registry", path.join(PROJECT, "capability-registry.json"),
      "--bindings", path.join(PROJECT, "component-bindings.json"),
      "--input", path.join(bundleDir, "02-extraction/page-structure.json"),
      "--out", outDir,
      "--json",
    ]);
    assert.equal(code, 0, "plan exit 0 over the committed chain");
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "resolution-report.json"), "utf8"));
    assert.equal(report.sections.length, 12, "all 12 real sections enter the report");
    assert.equal(report.coverage.total, 0, "coverage stays honestly 0 — no proven capability bindings exist");
    assert.ok(report.sections.every((s) => s.status === "unmapped"), "every section honestly reports unmapped");
    return "12 real sections resolved; coverage 0; zero proven bindings";
  });
}
