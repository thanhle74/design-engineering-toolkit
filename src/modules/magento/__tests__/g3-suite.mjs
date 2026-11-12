// Issue #23 G3 suite: native content composition (the gated platform-serializer stage).
// Registers async checks on the shared run-all runner: the capability probe over the trimmed
// fixture checkout (registered proof, honest NOT_VERIFIED), the hero extraction (inventory +
// accountability + slots), end-to-end composition into persisted native master format (byte
// determinism, no-write defaults, no arbitrary embeddable-markup content type), pin-failure
// negatives, honest gap reporting (decorations, missing manifest entries never invented around),
// the committed example parity, and the neutrality scans over the new surfaces.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../../../../dist/src/core/cli/main.js";
import { stableContentHash, canonicalStringify, stripVolatile } from "../../../../dist/src/core/canonical.js";
import { deriveNodeId } from "../../../../dist/src/core/design-source/extract.js";

import { REPO_ROOT as ROOT } from "../../../../src/core/__tests__/repo-root.mjs";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const G3 = path.join(FIX, "g3-hero-design-source");
const G3_CHECKOUT = path.join(FIX, "g3-magento-like");
const CORE_FIXTURES = path.join(ROOT, "src", "core", "__tests__", "fixtures");
const PROFILE = path.join(CORE_FIXTURES, "negative/profile-g3-hero-fixture.fixture.json");

// Expected accountability for the RAW-observed hero tree at the observed-not-pinned fixture
// revision (hand-derived from the observed kinds/names, asserted exact): 13 nodes inventoried;
// the two rounded-rectangle layers and the externally-defined button instance are honestly
// NEEDS_REVIEW; the DECOR-named scroll indicator group is merged by policy.
const NODE_COUNT = 13;
const EXPECTED_DISPOSITIONS = { MAPPED: 9, EXCLUDED_WITH_REASON: 0, DECORATION_MERGED: 1, REFERENCE_ONLY: 0, NEEDS_REVIEW: 3 };
const EXPECTED_CLASSES = { SITE_CHROME: 0, EDITORIAL_SECTION: 9, SHARED_COMPONENT: 1, PRESENTATIONAL: 1, UNKNOWN_OR_AMBIGUOUS: 2 };
const SECTION_NAME = "SECTION/Hero/Primary";

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function inTempRun(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
  const r = await runCli([...args, "--out", dir, "--json"]);
  return { dir, ...r };
}

export default async function registerG3Suite(checkAsync) {
  let registryPath; // produced once by the capability probe check, reused by later checks

  checkAsync("G3-T29a", "capability probe over the trimmed fixture checkout: registered proof, honest declaration-only warnings", async () => {
    const { dir, code, err } = await inTempRun(["inspect", "--profile", PROFILE, "--project", G3_CHECKOUT]);
    try {
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const out = JSON.parse(fs.readFileSync(path.join(dir, "capability-registry.json"), "utf8"));
      // Deterministic revision: the fixture checkout is not its own git toplevel, so the probe
      // must NOT inherit any enclosing repository's HEAD — the content digest is the truth.
      assert.match(out.source.revisionId, /^content:[0-9a-f]{16}$/, "revision must be the deterministic content digest, never an enclosing repo's HEAD");
      const caps = new Map(out.capabilities.map((c) => [`${c.id}#${c.appearanceId}`, c]));
      // Exactly the declared banner + row appearances; no appearance invented.
      const banner = ["collage-centered", "collage-left", "collage-right", "poster"];
      const row = ["contained", "full-bleed", "full-width"];
      assert.deepEqual([...out.capabilities.filter((c) => c.id === "magento_pagebuilder/banner").map((c) => c.appearanceId)].sort(), banner);
      assert.deepEqual([...out.capabilities.filter((c) => c.id === "magento_pagebuilder/row").map((c) => c.appearanceId)].sort(), row);
      for (const key of [...banner.map((a) => `magento_pagebuilder/banner#${a}`), ...row.map((a) => `magento_pagebuilder/row#${a}`)]) {
        const cap = caps.get(key);
        assert.ok(cap, `${key} declared`);
        assert.equal(cap.category, "native");
        assert.equal(cap.availability, "enabled", `${key} enabled via config.php`);
        assert.equal(cap.proofLevel, "registered", `${key} capped at declaration proof`);
        assert.deepEqual(cap.acceptedProps, [], "declaration-only probe leaves props honestly empty");
      }
      const warnings = out.diagnostics.filter((d) => d.code === "NOT_VERIFIED");
      assert.ok(warnings.length >= 7, "one aggregated NOT_VERIFIED per capability (declaration evidence only)");
      registryPath = path.join(dir, "capability-registry.json");
      return "7 native capabilities, registered proof, content-digest revision";
    } finally {
      if (!registryPath) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29b", "hero extraction: full inventory, exact accountability, section + slots planned", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const { dir, code, err } = await inTempRun([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
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
      assert.equal(ir.nodes.filter((n) => n.name === SECTION_NAME).length, 1);
      // Faithful source kinds: text layers named by content, button CTA as a component instance.
      assert.equal(ir.nodes.find((n) => n.name === "SLOT/HeroMedia").kind, "container", "observed media frame stays a frame (container), never rewritten to media");
      const cta = ir.nodes.find((n) => n.name === "Proto / Button/Primary");
      assert.equal(cta.kind, "component", "observed button instance stays a component instance");
      assert.equal(cta.componentRefNodeId, undefined, "external definition is not fabricated");
      // One planned section: the hero with its structural descendants; decor merged by policy.
      assert.deepEqual(ps.sections.map((s) => s.name), [SECTION_NAME]);
      assert.equal(ps.sections[0].sourceEvidence[0].locator, `design://g3-hero-fixture-source/245:5`);
      // Honest extraction: the two rounded-rectangle layers (unmapped kind) and the externally
      // defined button instance stay NEEDS_REVIEW — custom-required pending, never guessed.
      const needs = review.entries.filter((e) => e.disposition === "NEEDS_REVIEW");
      assert.equal(needs.length, 3);
      assert.ok(needs.every((e) => e.reason.includes("outside the mapped kind table") || e.reason.includes("does not resolve to an inventoried component definition")));
      assert.ok(needs.some((e) => e.provisionalTarget?.category === "custom-required"), "unresolved instance is custom-required pending");
      // Decorations are accountable (merged), never dropped; observed children inventoried.
      const merged = review.entries.filter((e) => e.disposition === "DECORATION_MERGED");
      assert.equal(merged.length, 1);
      assert.ok(ir.nodes.some((n) => n.name === "SCROLL"), "scroll-indicator children inventoried");
      // The plan pins the exact NodeIR hash the composer will later verify.
      assert.equal(ps.inputs.nodeIrContentHash, stableContentHash(ir));
      return `13 raw-observed nodes: 9 mapped / 1 merged / 3 honest NEEDS_REVIEW, section '${SECTION_NAME}' planned`;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29c", "compose: deterministic native master format, every node accounted, honest gaps", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const args = [
      "compose", "--profile", PROFILE, "--registry", registryPath,
      "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--content", path.join(G3, "hero-content.fixture.json"),
    ];
    // Produce the pinned inputs through the real extract first; the raw-observed source needs
    // the explicit reason-carrying projection (recorded human decision) to compose.
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
    const extractRun = await runCli([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--out", extractDir, "--json",
    ]);
    assert.equal(extractRun.code, 0, `extract exit ${extractRun.code}: ${extractRun.err.slice(0, 300)}`);
    const composeArgs = [
      ...args,
      "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
      "--projection", path.join(G3, "hero-projection.fixture.json"),
    ];
    try {
      const { dir, code, err } = await inTempRun(composeArgs);
      try {
        assert.equal(code, 0, `exit ${code}: ${err.slice(0, 400)}`);
        const report = JSON.parse(fs.readFileSync(path.join(dir, "compose-report.json"), "utf8"));
        const html = fs.readFileSync(path.join(dir, "native-content.html"), "utf8");
        assert.equal(html, report.content, "emitted file equals the report content");
        // Native master format invariants (declaration-backed names, the platform's own elements).
        assert.ok(html.includes('<div data-content-type="row" data-appearance="contained" data-element="main">'), "row(contained) is the top-level container");
        assert.ok(html.includes('<div data-content-type="banner" data-appearance="poster"'), "banner(poster) is the hero unit");
        for (const el of ["wrapper", "overlay", "content", "button", "link"]) {
          assert.ok(html.includes(`data-element="${el}"`), `declared banner element ${el} present`);
        }
        assert.ok(html.includes("{{media url=wysiwyg/g3-hero/hero-1440x880-placeholder.jpg}}"), "background image carries the manifest directive");
        assert.ok(html.includes("&quot;desktop_image&quot;"), "background-images JSON attribute is HTML-escaped like persisted content");
        assert.ok(html.includes(">The Quiet Grandeur</h2>"), "heading folded into the banner content field");
        assert.ok(html.includes(">Explore the Collection</button>"), "CTA folded into the banner button");
        assert.ok(html.includes('href="/collections"'), "CTA link from the manifest");
        // Styles persist via the platform's rehydratable style-block mechanism (issue #25 NaN
        // correction class, applied to the banner overlay): the Admin reader clobbers inline
        // style attributes, so the declaration-backed min-height lives in a keyed leading
        // <style> rule — never inline on the overlay element.
        assert.ok(html.startsWith("<style>#html-body [data-pb-style=P"), "leading keyed style block present");
        assert.ok(html.includes("]{min-height:880px}</style>"), "poster overlay min-height rule in the style block");
        assert.match(html, /data-element="overlay" data-pb-style="P[A-F0-9]{6}"/, "poster overlay keyed for rehydration");
        assert.ok(!/data-element="overlay" style="/.test(html), "no inline style attribute on the poster overlay");
        const pbKeys = [...html.matchAll(/data-pb-style="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(new Set(pbKeys).size, pbKeys.length, "style keys unique per element");
        // No arbitrary embeddable-markup content type; no invented URLs.
        assert.ok(!html.includes('data-content-type="html"'), "no arbitrary embeddable-markup content type");
        assert.ok(!/https?:\/\//.test(html), "no invented absolute URLs in the composed content");
        // Accountability: every planned node lands exactly once (observed names, raw kinds).
        const dispositions = Object.fromEntries(["mapped", "gap", "decoration-merged", "excluded", "skipped"].map((k) => [k, report.mapping.filter((m) => m.disposition === k).length]));
        assert.equal(report.mapping.length, 12, "section + 11 descendants accounted");
        assert.equal(dispositions.mapped, 8);
        assert.equal(dispositions.gap, 2);
        assert.equal(dispositions.excluded, 2);
        const gapNodes = report.mapping.filter((m) => m.disposition === "gap").map((m) => m.sourceName).sort();
        assert.deepEqual(gapNodes, ["DECOR/ScrollIndicator", "Overlay"], "projected decorations reported as gaps, never dropped");
        const excludedNodes = report.mapping.filter((m) => m.disposition === "excluded").map((m) => m.sourceName).sort();
        assert.deepEqual(excludedNodes, ["Rectangle", "SCROLL"], "decoration subtree members recorded as excluded");
        // The CTA is the observed button INSTANCE (external definition), projected explicitly.
        const ctaEntry = report.mapping.find((m) => m.sourceName === "Proto / Button/Primary");
        assert.equal(ctaEntry.disposition, "mapped");
        assert.equal(ctaEntry.target.nativeElement, "button");
        assert.ok(ctaEntry.note.includes("Explicitly projected"), "CTA mapping cites the explicit projection");
        const gapDiags = report.diagnostics.filter((d) => d.code === "NOT_VERIFIED");
        assert.ok(gapDiags.length >= 2, "gap diagnostics present");
        // Determinism: a second run is byte-identical (content + stable report hash).
        const firstHtml = html;
        const firstStable = stableContentHash(report);
        const second = await inTempRun(composeArgs);
        try {
          assert.equal(second.code, 0);
          const secondHtml = fs.readFileSync(path.join(second.dir, "native-content.html"), "utf8");
          const secondReport = JSON.parse(fs.readFileSync(path.join(second.dir, "compose-report.json"), "utf8"));
          assert.equal(secondHtml, firstHtml, "content byte-identical across runs");
          assert.equal(stableContentHash(secondReport), firstStable, "report stable hash identical across runs");
        } finally {
          fs.rmSync(second.dir, { recursive: true, force: true });
        }
        return "native row>banner master format: 8 mapped / 2 gaps / 2 excluded, byte-deterministic";
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29d", "compose no-write defaults: no --out and --dry-run write nothing", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
    await runCli([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--out", extractDir, "--json",
    ]);
    const composeArgs = [
      "compose", "--profile", PROFILE, "--registry", registryPath,
      "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
      "--content", path.join(G3, "hero-content.fixture.json"),
      "--projection", path.join(G3, "hero-projection.fixture.json"),
    ];
    try {
      // Fidelity guard: the RAW-observed source (no SLOT-role names, button instance) composes
      // NOTHING without the explicit projection — honest skip, empty content, exit 1.
      const noProjection = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G3, "hero-content.fixture.json"), "--json",
      ]);
      assert.equal(noProjection.code, 1, "raw source without projection must not compose");
      const npPayload = JSON.parse(noProjection.out);
      assert.equal(npPayload.output.report.content, "", "no content invented from unnamed raw layers");
      assert.ok(npPayload.output.report.mapping.some((m) => m.disposition === "skipped" && m.sourceName === SECTION_NAME));
      const noOut = await runCli([...composeArgs, "--json"]);
      assert.equal(noOut.code, 0);
      const noOutPayload = JSON.parse(noOut.out);
      assert.ok(noOutPayload.output.report.content.length > 0, "content computed without --out");
      assert.ok(!noOutPayload.run.wroteFiles, "no --out: nothing written");
      const dry = await runCli([...composeArgs, "--out", extractDir, "--dry-run", "--json"]);
      assert.equal(dry.code, 0);
      const dryPayload = JSON.parse(dry.out);
      assert.ok(!dryPayload.run.wroteFiles, "--dry-run: nothing written");
      assert.ok(!fs.existsSync(path.join(extractDir, "native-content.html")), "no native-content.html materialized");
      assert.ok(!fs.existsSync(path.join(extractDir, "compose-report.json")), "no compose-report.json materialized");
      return "no-projection refusal + stdout-only and dry-run truth enforced";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29e", "compose pin negatives: revision/hash/identity mismatches fail closed with explicit diagnostics", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
    await runCli([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--out", extractDir, "--json",
    ]);
    const composeBase = [
      "compose", "--profile", PROFILE, "--registry", registryPath,
      "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
      "--content", path.join(G3, "hero-content.fixture.json"),
      "--projection", path.join(G3, "hero-projection.fixture.json"),
    ];
    try {
      // Content manifest pinned to a different source revision -> EVIDENCE_MISSING, exit 1.
      const manifest = JSON.parse(fs.readFileSync(path.join(G3, "hero-content.fixture.json"), "utf8"));
      const drifted = { ...manifest, sourceRevisionId: "mcp-observed-unpinned-2026-11-05" };
      const driftedPath = path.join(extractDir, "manifest-drifted.json");
      fs.writeFileSync(driftedPath, JSON.stringify(drifted));
      const r1 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", driftedPath,
        "--projection", path.join(G3, "hero-projection.fixture.json"), "--json",
      ]);
      assert.equal(r1.code, 1);
      const d1 = JSON.parse(r1.out).run;
      assert.ok(d1.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "revision pin mismatch is blocking");
      // Tampered NodeIR (hash pin) -> EVIDENCE_MISSING, exit 1.
      const ir = JSON.parse(fs.readFileSync(path.join(extractDir, "node-ir.json"), "utf8"));
      ir.nodes[0].name = "Tampered";
      const irPath = path.join(extractDir, "node-ir-tampered.json");
      fs.writeFileSync(irPath, JSON.stringify(ir));
      const r2 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", irPath,
        "--content", path.join(G3, "hero-content.fixture.json"), "--json",
      ]);
      assert.equal(r2.code, 1);
      const d2 = JSON.parse(r2.out).run;
      assert.ok(d2.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "nodeIr hash pin mismatch is blocking");
      // Binding map pinned to another registry revision -> EVIDENCE_MISSING, exit 1.
      const bindings = JSON.parse(fs.readFileSync(path.join(G3, "g3-component-bindings.fixture.json"), "utf8"));
      bindings.registry.registryRevisionId = "content:0000000000000000";
      const bindingsPath = path.join(extractDir, "bindings-drifted.json");
      fs.writeFileSync(bindingsPath, JSON.stringify(bindings));
      const r3 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", bindingsPath,
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G3, "hero-content.fixture.json"), "--json",
      ]);
      assert.equal(r3.code, 1);
      const d3 = JSON.parse(r3.out).run;
      assert.ok(d3.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "binding map revision pin mismatch is blocking");
      // Projection pinned to another source revision -> EVIDENCE_MISSING, exit 1.
      const projection = JSON.parse(fs.readFileSync(path.join(G3, "hero-projection.fixture.json"), "utf8"));
      projection.sourceRevisionId = "mcp-observed-unpinned-2026-11-05";
      const projPath = path.join(extractDir, "projection-drifted.json");
      fs.writeFileSync(projPath, JSON.stringify(projection));
      const r5 = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G3, "hero-content.fixture.json"),
        "--projection", projPath, "--json",
      ]);
      assert.equal(r5.code, 1);
      const d5 = JSON.parse(r5.out).run;
      assert.ok(d5.converterDiagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "projection revision pin mismatch is blocking");
      // Wrong-platform adapter override -> ADAPTER_NOT_APPLICABLE, exit 1.
      const r4 = await runCli([...composeBase, "--adapter", "magento-pagebuilder", "--json"]);
      assert.equal(r4.code, 1);
      const d4 = JSON.parse(r4.out).run;
      assert.ok(d4.converterDiagnostics.some((x) => x.code === "ADAPTER_NOT_APPLICABLE"), "a capability probe is never a composer");
      return "5/5 pin violations blocked";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29f", "compose honesty: missing manifest entries become gaps, no invented content", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
    await runCli([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--out", extractDir, "--json",
    ]);
    const manifest = JSON.parse(fs.readFileSync(path.join(G3, "hero-content.fixture.json"), "utf8"));
    const sparse = { ...manifest, entries: manifest.entries.filter((e) => e.kind !== "media" && e.kind !== "link") };
    const sparsePath = path.join(extractDir, "manifest-sparse.json");
    fs.writeFileSync(sparsePath, JSON.stringify(sparse));
    try {
      const { dir, code, err } = await inTempRun([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", sparsePath,
        "--projection", path.join(G3, "hero-projection.fixture.json"),
      ]);
      try {
        assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
        const html = fs.readFileSync(path.join(dir, "native-content.html"), "utf8");
        const report = JSON.parse(fs.readFileSync(path.join(dir, "compose-report.json"), "utf8"));
        // Background missing: banner composes with an empty background attribute, gap recorded.
        assert.ok(html.includes('data-background-images="{}"'), "empty background attribute, no invented URL");
        const bgGap = report.mapping.find((m) => m.sourceName === "SLOT/HeroMedia");
        assert.equal(bgGap.disposition, "gap");
        assert.ok(report.diagnostics.some((d) => d.code === "EVIDENCE_MISSING" && d.message.includes("SLOT/HeroMedia")), "missing background entry diagnosed");
        assert.ok(!html.includes("{{media url="), "no asset URL invented");
        return "sparse manifest -> explicit gaps, content still structurally composed";
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29g", "committed compose example equals a fresh run (volatile timestamps stripped)", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "g3-suite-"));
    await runCli([
      "extract", "--profile", PROFILE, "--project", G3, "--design-file", "design-tree-hero.fixture.json", "--design-node", "245:2",
      "--registry", registryPath, "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
      "--out", extractDir, "--json",
    ]);
    try {
      const { code, out, err } = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G3, "g3-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G3, "hero-content.fixture.json"),
        "--projection", path.join(G3, "hero-projection.fixture.json"), "--json",
      ]);
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const fresh = JSON.parse(out).output.report;
      const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/examples/converter/compose-output.g3-hero.example.json"), "utf8"));
      assert.equal(canonicalStringify(stripVolatile(fresh)), canonicalStringify(stripVolatile(committed)), "committed example drifts from a fresh compose");
      // The example validates against its contract.
      const { validateContract } = await import("../../../../dist/src/core/schema-registry.js");
      const check = validateContract("compose-output", committed);
      assert.ok(check.valid, `committed example must validate: ${check.errors.slice(0, 3).join("; ")}`);
      const manifestCheck = validateContract("content-manifest", JSON.parse(fs.readFileSync(path.join(G3, "hero-content.fixture.json"), "utf8")));
      assert.ok(manifestCheck.valid, `content manifest fixture must validate: ${manifestCheck.errors.slice(0, 3).join("; ")}`);
      const projCheck = validateContract("semantic-projection", JSON.parse(fs.readFileSync(path.join(G3, "hero-projection.fixture.json"), "utf8")));
      assert.ok(projCheck.valid, `semantic projection fixture must validate: ${projCheck.errors.slice(0, 3).join("; ")}`);
      return "example reproducible + contract-valid";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G3-T29h", "id derivation + neutrality over the new G3 neutral surfaces", async () => {
    // Stable, kind-sensitive, locator-keyed ids carry into the compose mapping.
    const a = deriveNodeId("s", "245:5", "container");
    assert.equal(a, deriveNodeId("s", "245:5", "container"));
    assert.match(a, /^n-[0-9a-f]{12}$/);
    // Same neutrality policy as T-09/G2-T28, scoped to the NEUTRAL surfaces. Platform-shaped
    // registration data (the compose adapter descriptor, the profile's platformId, binding-map
    // platform values, capability ids inside the committed example payload) is the platform
    // layer's own data and stays exempt — the same exemption T-09 grants synthetic-magento-like.
    const neutralTerms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
    const hits = [];
    const scan = (rel, text) => {
      const m = text.match(new RegExp(neutralTerms.source, "gi"));
      if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
    };
    for (const f of ["content-manifest.schema.json", "compose-input.schema.json", "compose-output.schema.json", "semantic-projection.schema.json", "tool-run.schema.json"]) {
      scan(`resources/schemas/cli/${f}`, fs.readFileSync(path.join(ROOT, "resources/schemas/cli", f), "utf8"));
    }
    scan("dist/src/core/cli/commands/compose.js", fs.readFileSync(path.join(ROOT, "dist/src/core/cli/commands/compose.js"), "utf8"));
    for (const f of fs.readdirSync(G3).filter((x) => x.endsWith(".fixture.json") && x.startsWith("design-tree"))) scan(`src/modules/magento/__tests__/fixtures/g3-hero-design-source/${f}`, fs.readFileSync(path.join(G3, f), "utf8"));
    scan("src/modules/magento/__tests__/fixtures/g3-hero-design-source/hero-content.fixture.json", fs.readFileSync(path.join(G3, "hero-content.fixture.json"), "utf8"));
    assert.deepEqual(hits, [], "neutrality violations:\n" + hits.join("\n"));
    return "0 matches across resources/schemas/core/design-source surfaces";
  });
}
