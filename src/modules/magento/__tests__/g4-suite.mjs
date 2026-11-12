// Issue #25 G4 suite: the SECOND bounded native composition shape — a two-column section
// (Figma-observed craftsmanship slot pair, raw-faithful fixture) composed as the
// declaration-backed chain row(contained) > column-group(default) > column-line > column
// (full-height) x2 with role-resolved text folded into one text WYSIWYG and projected
// inline-media slots as native image elements. Registers async checks on the shared run-all
// runner: the extended-fixture probe (column-group/column-line/column/image/text registered),
// the craftsmanship extraction (9-node inventory + accountability), end-to-end two-column
// composition (byte determinism, structural invariants, per-node accountability, explicit
// fidelity gaps for the non-declaration-backed side-by-side pair / gutter / aspect ratios),
// the no-projection fidelity guard, sparse-manifest honesty, and neutrality over the new
// fixture surfaces. The G3 hero suite keeps guarding the hero baseline in the same run.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT as ROOT } from "../../../../src/core/__tests__/repo-root.mjs";
import { main } from "../../../../dist/src/core/cli/main.js";
import { stableContentHash } from "../../../../dist/src/core/canonical.js";

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const G4 = path.join(FIX, "g4-craftsmanship-design-source");
const CHECKOUT = path.join(FIX, "g3-magento-like");
const PROFILE = path.join(G4, "profile-g4-craftsmanship-fixture.json");
const SECTION_NAME = "SECTION/Craftsmanship";

// Hand-derived from the raw-observed tree at the fixture revision: 9 nodes inventoried (page
// root + section + 2 slot containers + 3 texts + 2 detail-media frames), all frame/text kinds
// inside the mapped kind table, no component instances -> no NEEDS_REVIEW.
const NODE_COUNT = 9;
const EXPECTED_DISPOSITIONS = { MAPPED: 9, EXCLUDED_WITH_REASON: 0, DECORATION_MERGED: 0, REFERENCE_ONLY: 0, NEEDS_REVIEW: 0 };

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function inTempRun(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g4-suite-"));
  const r = await runCli([...args, "--out", dir, "--json"]);
  return { dir, ...r };
}

async function extractOnce(registryPath) {
  const { dir, code, err } = await inTempRun([
    "extract", "--profile", PROFILE, "--project", G4, "--design-file", "design-tree-craftsmanship.fixture.json", "--design-node", "245:2",
    "--registry", registryPath, "--bindings", path.join(G4, "g4-component-bindings.fixture.json"),
  ]);
  assert.equal(code, 0, `extract exit ${code}: ${err.slice(0, 300)}`);
  return dir;
}

const composeArgsFor = (extractDir, registryPath) => [
  "compose", "--profile", PROFILE, "--registry", registryPath,
  "--bindings", path.join(G4, "g4-component-bindings.fixture.json"),
  "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
  "--content", path.join(G4, "craftsmanship-content.fixture.json"),
  "--projection", path.join(G4, "craftsmanship-projection.fixture.json"),
];

export default async function registerG4Suite(checkAsync) {
  let registryPath; // produced once by the capability probe check, reused by later checks

  checkAsync("G4-T30a", "extended fixture probe: column-group/column-line/column/image/text registered declaration-backed", async () => {
    const { dir, code, err } = await inTempRun(["inspect", "--profile", PROFILE, "--project", CHECKOUT]);
    try {
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const out = JSON.parse(fs.readFileSync(path.join(dir, "capability-registry.json"), "utf8"));
      const ids = new Set(out.capabilities.map((c) => c.id));
      for (const expected of ["magento_pagebuilder/column-group", "magento_pagebuilder/column-line", "magento_pagebuilder/column", "magento_pagebuilder/image", "magento_pagebuilder/text"]) {
        assert.ok(ids.has(expected), `${expected} declared in the fixture checkout`);
      }
      const caps = new Map(out.capabilities.map((c) => [`${c.id}#${c.appearanceId}`, c]));
      // Exactly the declared appearances; nothing invented.
      assert.ok(caps.has("magento_pagebuilder/column-group#default"), "column-group default appearance");
      assert.ok(caps.has("magento_pagebuilder/column-line#default"), "column-line default appearance");
      assert.ok(caps.has("magento_pagebuilder/column#full-height"), "column full-height (declared default)");
      assert.ok(caps.has("magento_pagebuilder/image#full-width"), "image full-width (declared default)");
      assert.ok(caps.has("magento_pagebuilder/text#default"), "text default appearance");
      for (const key of ["magento_pagebuilder/column-group#default", "magento_pagebuilder/column-line#default", "magento_pagebuilder/column#full-height", "magento_pagebuilder/image#full-width", "magento_pagebuilder/text#default"]) {
        assert.equal(caps.get(key).category, "native", `${key} native`);
        assert.equal(caps.get(key).availability, "enabled", `${key} enabled via config.php`);
        assert.equal(caps.get(key).proofLevel, "registered", `${key} capped at declaration proof`);
      }
      registryPath = path.join(dir, "capability-registry.json");
      return "5 two-column chain capabilities registered, declaration proof";
    } finally {
      if (!registryPath) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30b", "craftsmanship extraction: full 9-node inventory, exact accountability, section planned", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const dir = await extractOnce(registryPath);
    try {
      const ir = JSON.parse(fs.readFileSync(path.join(dir, "node-ir.json"), "utf8"));
      const ps = JSON.parse(fs.readFileSync(path.join(dir, "page-structure.json"), "utf8"));
      const review = JSON.parse(fs.readFileSync(path.join(dir, "source-review.json"), "utf8"));
      assert.equal(ir.nodes.length, NODE_COUNT);
      assert.equal(review.counts.total, NODE_COUNT);
      assert.deepEqual(review.counts.byDisposition, EXPECTED_DISPOSITIONS);
      // Raw-faithful: media slots stay observed frames (containers), texts stay named as observed.
      assert.equal(ir.nodes.find((n) => n.name === "SLOT/CraftMedia").kind, "container", "media slot frame stays a container, never rewritten to media");
      assert.ok(ir.nodes.some((n) => n.name === "Overline"), "observed text names carried verbatim");
      // One planned section: the craftsmanship section with its structural descendants.
      assert.deepEqual(ps.sections.map((s) => s.name), [SECTION_NAME]);
      assert.equal(ps.sections[0].sourceEvidence[0].locator, `design://g4-craftsmanship-fixture-source/299:343`);
      assert.equal(ps.inputs.nodeIrContentHash, stableContentHash(ir));
      return `9 raw-observed nodes all MAPPED, section '${SECTION_NAME}' planned`;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30c", "two-column compose: declaration-backed chain, all 8 nodes mapped, explicit fidelity gaps, byte-deterministic", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const { dir, code, err } = await inTempRun(composeArgsFor(extractDir, registryPath));
      try {
        assert.equal(code, 0, `exit ${code}: ${err.slice(0, 400)}`);
        const report = JSON.parse(fs.readFileSync(path.join(dir, "compose-report.json"), "utf8"));
        const html = fs.readFileSync(path.join(dir, "native-content.html"), "utf8");
        assert.equal(html, report.content, "emitted file equals the report content");
        // Structural invariants: the declaration-backed chain, in order, with the mandated bridge.
        assert.ok(html.includes('<div data-content-type="row" data-appearance="contained" data-element="main">'), "row(contained) top-level");
        assert.ok(html.includes('<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">'), "column-group(default) with grid size");
        assert.ok(html.includes('<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style='), "column-line bridge present with style key");
        assert.equal((html.match(/<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="[^"]+">/g) ?? []).length, 2, "two full-height columns keyed for rehydration");
        assert.ok(html.includes("<style>"), "leading style block present");
        // Styles persist via the platform's rehydratable style-block mechanism (issue #25 NaN
        // correction): widths/min-height live in keyed rules, never inline — the Admin reader
        // clobbers inline style attributes and reads only data-pb-style-keyed block rules.
        assert.ok(html.includes("{min-height:780px}"), "row inner min-height rule in the style block");
        assert.ok(html.includes("{display:flex;width:100%}"), "column-line flex rule (side-by-side) in the style block");
        assert.equal((html.match(/\{justify-content:flex-start;display:flex;flex-direction:column;width:50%;align-self:stretch\}/g) ?? []).length, 2, "two 50% column rules in the style block");
        assert.ok(!/data-element="main" style="/.test(html), "no inline style attributes on composed structural elements");
        assert.ok(html.includes('data-element="inner" data-pb-style='), "row inner keyed for rehydration");
        const styleKeys = [...html.matchAll(/data-pb-style="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(new Set(styleKeys).size, styleKeys.length, "style keys unique per element");
        assert.ok(styleKeys.every((k) => /^P[A-F0-9]{6}$/.test(k)), "keys are deterministic 7-char ident-safe tokens");
        // Content: one text WYSIWYG folding overline/heading/body in document order; three
        // native image elements carrying the manifest directives.
        assert.equal((html.match(/<div data-content-type="text" data-appearance="default" data-element="main">/g) ?? []).length, 1, "exactly one text WYSIWYG in the right column");
        assert.ok(html.includes("<p>CRAFTSMANSHIP</p><h2>Materials, considered</h2>"), "overline + heading folded in document order");
        assert.equal((html.match(/<figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="/g) ?? []).length, 3, "three native image elements (media slot + 2 details)");
        assert.ok(html.includes("{{media url=wysiwyg/g4-craftsmanship/craft-media-620x620-placeholder.jpg}}"), "primary media directive from the manifest");
        // Declaration-conformance guards: no nesting the platform forbids, no arbitrary markup.
        assert.ok(!html.includes('data-content-type="html"'), "no arbitrary embeddable-markup content type");
        assert.ok(html.indexOf('data-content-type="column-group"', html.indexOf('data-content-type="column" data-appearance="full-height"')) === -1, "no column-group nested inside a column (declaration parents policy)");
        assert.ok(!/https?:\/\//.test(html), "no invented absolute URLs");
        // Accountability: every planned subtree node lands exactly once, all mapped.
        assert.equal(report.mapping.length, 8, "section + 7 descendants accounted");
        assert.equal(report.mapping.filter((m) => m.disposition === "mapped").length, 8);
        const primary = report.mapping.find((m) => m.sourceName === "SLOT/CraftMedia");
        assert.equal(primary.target.capabilityId, "magento_pagebuilder/column", "primary slot composes as the native column");
        assert.ok(primary.target.nativeField.includes("own media slot"), "primary slot's own media fill recorded");
        const detail = report.mapping.find((m) => m.sourceName === "SLOT/DetailStitch");
        assert.equal(detail.target.capabilityId, "magento_pagebuilder/image", "detail slot composes as a native image");
        // Explicit fidelity gaps: stacked side-by-side pair + gutter + aspect ratios, never CSS.
        const gapDiags = report.diagnostics.filter((d) => d.code === "NOT_VERIFIED").map((d) => d.message).join("\n");
        assert.ok(gapDiags.includes("stacked native image elements") && gapDiags.includes("not declaration-backed"), "side-by-side pair reported as a fidelity gap");
        assert.ok(gapDiags.includes("48px gutter"), "observed gutter reported as not composed");
        assert.ok(gapDiags.includes("aspect ratios"), "aspect-ratio fidelity reported");
        // Determinism: a second run is byte-identical (content + stable report hash).
        const firstHtml = html;
        const firstStable = stableContentHash(report);
        const second = await inTempRun(composeArgsFor(extractDir, registryPath));
        try {
          assert.equal(second.code, 0);
          assert.equal(fs.readFileSync(path.join(second.dir, "native-content.html"), "utf8"), firstHtml, "content byte-identical across runs");
          assert.equal(stableContentHash(JSON.parse(fs.readFileSync(path.join(second.dir, "compose-report.json"), "utf8"))), firstStable, "report stable hash identical across runs");
        } finally {
          fs.rmSync(second.dir, { recursive: true, force: true });
        }
        return "declaration-backed two-column chain: 8/8 mapped, 3 fidelity gaps, byte-deterministic";
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30d", "fidelity guard: the raw source composes NOTHING without the explicit projection", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const { code, out } = await runCli([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G4, "g4-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", path.join(G4, "craftsmanship-content.fixture.json"), "--json",
      ]);
      assert.equal(code, 1, "raw source without projection must not compose");
      const payload = JSON.parse(out);
      assert.equal(payload.output.report.content, "", "no content invented from unnamed raw layers");
      assert.ok(payload.output.report.mapping.some((m) => m.disposition === "skipped" && m.sourceName === SECTION_NAME), "section honestly skipped");
      return "no-projection refusal: honest skip, empty content, exit 1";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30e", "sparse manifest honesty: missing media entries become gaps, no invented assets, no misleading figures", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(G4, "craftsmanship-content.fixture.json"), "utf8"));
      const sparse = { ...manifest, entries: manifest.entries.filter((e) => e.kind !== "media") };
      const sparsePath = path.join(extractDir, "manifest-sparse.json");
      fs.writeFileSync(sparsePath, JSON.stringify(sparse));
      const { dir, code } = await inTempRun([
        "compose", "--profile", PROFILE, "--registry", registryPath,
        "--bindings", path.join(G4, "g4-component-bindings.fixture.json"),
        "--input", path.join(extractDir, "page-structure.json"), "--nodeir", path.join(extractDir, "node-ir.json"),
        "--content", sparsePath,
        "--projection", path.join(G4, "craftsmanship-projection.fixture.json"),
      ]);
      try {
        assert.equal(code, 0, `exit ${code}`);
        const html = fs.readFileSync(path.join(dir, "native-content.html"), "utf8");
        const report = JSON.parse(fs.readFileSync(path.join(dir, "compose-report.json"), "utf8"));
        assert.ok(!html.includes("{{media url="), "no asset URL invented");
        assert.ok(!html.includes("<figure"), "no src-less misleading image element");
        const mediaGaps = report.mapping.filter((m) => m.disposition === "gap" && ["SLOT/CraftMedia", "SLOT/DetailStitch", "SLOT/DetailFabric"].includes(m.sourceName));
        assert.equal(mediaGaps.length, 3, "all three media slots recorded as gaps");
        assert.ok(html.includes("<h2>Materials, considered</h2>"), "text content still composes structurally");
        return "sparse manifest -> explicit media gaps, text still composed, no invented assets";
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30f", "committed compose example equals a fresh run (volatile timestamps stripped) + fixtures contract-valid", async () => {
    assert.ok(registryPath, "probe check must have produced the registry");
    const extractDir = await extractOnce(registryPath);
    try {
      const { code, out, err } = await runCli([...composeArgsFor(extractDir, registryPath), "--json"]);
      assert.equal(code, 0, `exit ${code}: ${err.slice(0, 300)}`);
      const fresh = JSON.parse(out).output.report;
      const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "examples/converter/compose-output.g4-craftsmanship.example.json"), "utf8"));
      const { canonicalStringify, stripVolatile } = await import("../../../../dist/src/core/canonical.js");
      assert.equal(canonicalStringify(stripVolatile(fresh)), canonicalStringify(stripVolatile(committed)), "committed example drifts from a fresh compose");
      const { validateContract } = await import("../../../../dist/src/core/schema-registry.js");
      const check = validateContract("compose-output", committed);
      assert.ok(check.valid, `committed example must validate: ${check.errors.slice(0, 3).join("; ")}`);
      for (const [name, file, contract] of [
        ["content manifest", "craftsmanship-content.fixture.json", "content-manifest"],
        ["semantic projection", "craftsmanship-projection.fixture.json", "semantic-projection"],
      ]) {
        const doc = JSON.parse(fs.readFileSync(path.join(G4, file), "utf8"));
        const c = validateContract(contract, doc);
        assert.ok(c.valid, `${name} fixture must validate: ${c.errors.slice(0, 3).join("; ")}`);
      }
      return "example reproducible + contract-valid";
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  checkAsync("G4-T30g", "neutrality over the new G4 fixture surfaces", async () => {
    const neutralTerms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
    const hits = [];
    const scan = (rel, text) => {
      const m = text.match(new RegExp(neutralTerms.source, "gi"));
      if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
    };
    for (const f of fs.readdirSync(G4).filter((x) => x.endsWith(".fixture.json") && (x.startsWith("design-tree") || x.startsWith("craftsmanship-content")))) {
      scan(`src/modules/magento/__tests__/fixtures/g4-craftsmanship-design-source/${f}`, fs.readFileSync(path.join(G4, f), "utf8"));
    }
    assert.deepEqual(hits, [], "neutrality violations:\n" + hits.join("\n"));
    return "0 matches across the new design-source surfaces";
  });
}
