// Issue #15 Knowledge Engine MVP suite. Registers async checks on the shared run-all runner:
// CLI contract for det kb ingest|sync|query|validate, the #9 registry bridge honesty, deny-list
// and secret/licensed content guards, KB-3 project isolation, digest-driven staleness, exact
// proof filtering, deterministic re-ingest/query, and the committed-store drift guard.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalStringify } from "../../../../dist/src/core/canonical.js";
import { validateContract } from "../../../../dist/src/core/schema-registry.js";
import { main } from "../../../../dist/src/core/cli/main.js";

import { REPO_ROOT as ROOT } from "../../../../src/core/__tests__/repo-root.mjs";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
// Shared contract fixtures (negative/, synthetic-*) are owned by the core suite home; KB-specific data lives beside this suite.
const CORE_FIXTURES = path.join(ROOT, "src", "core", "__tests__", "fixtures");
const EX_KB = path.join(ROOT, "examples", "kb");
const KB_STORE = path.join(ROOT, "kb");
const REG_ROOT = path.join(CORE_FIXTURES, "synthetic-magento-like");
const KB_NEG = path.join(FIX, "kb", "negative");
const KB_DIRTY = path.join(FIX, "kb", "dirty");

const SECRET_MARKERS = [
  "MAGENTO_LIKE_FIXTURE_SECRET_MARKER_9f3e1",
  "FIXTURE_AUTH_MARKER_do_not_leak_1c2b3",
  "DENIED_SURFACE_MARKER_never_read_5d4a2",
  "DIRTY_ENV_MARKER_4f8a2",
  "DIRTY_AUTH_MARKER_7c1d9",
  "HYVA_LICENSED_TEMPLATE_MARKER_2b6e4",
  "HYVA_LICENSED_EXCERPT_MARKER_9d2f1",
  "SuperSecret99",
];

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function parseJsonRun(result) {
  return JSON.parse(result.out).run;
}

function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `det-kb-${prefix}-`));
}

// Stage a mutable copy of examples/kb (manifest + inputs) into a temp dir.
function stageExamples(dest = mkTemp("examples")) {
  for (const f of fs.readdirSync(EX_KB)) fs.copyFileSync(path.join(EX_KB, f), path.join(dest, f));
  return dest;
}

function stageStore(dest = mkTemp("store")) {
  fs.cpSync(KB_STORE, dest, { recursive: true });
  fs.rmSync(path.join(dest, "tool-run.json"), { force: true });
  return dest;
}

function readJsonl(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  return raw.length ? raw.split("\n").map((l) => JSON.parse(l)) : [];
}

// All observation timestamps are stripped for cross-run comparisons (same rule the CLI uses
// for kb artifact volatile hashes).
const VOLATILE = new Set(["generatedAt", "scannedAt", "capturedAt", "recordedAt", "retrievedAt", "accessedAt"]);
function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!VOLATILE.has(k)) out[k] = stripVolatile(v);
    return out;
  }
  return value;
}

const REG_FLAG = `--root`;
const REG_VALUE = `reg=${REG_ROOT}`;

export default async function registerKbSuite(checkAsync) {
  // ---- CLI surface -----------------------------------------------------------------------
  await checkAsync("KB-01", "det --help documents the kb verbs; bare 'det kb' fails closed", async () => {
    const r = await runCli(["--help"]);
    assert.equal(r.code, 0, `help exit ${r.code}`);
    for (const word of ["det kb ingest", "det kb sync", "det kb query", "det kb validate", "DET_KB_ROOT_"]) assert.ok(r.out.includes(word), `help must mention '${word}'`);
    const bare = await runCli(["kb"]);
    assert.equal(bare.code, 2, "det kb without verb is a usage error");
    const badVerb = await runCli(["kb", "frobnicate"]);
    assert.equal(badVerb.code, 2, "unknown kb verb is a usage error");
    return "help + verb gate";
  });

  await checkAsync("KB-02", "kb ingest dry-run: exit 0, honest counts, writes nothing", async () => {
    const before = new Set(fs.readdirSync(EX_KB));
    const r = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
    const run = parseJsonRun(r);
    assert.equal(run.wroteFiles, false, "no-write default");
    assert.equal(run.command, "kb");
    const ingest = JSON.parse(r.out).output.ingest;
    assert.deepEqual(
      { platform: ingest.platform, ui: ingest.ui, project: ingest.project, relations: ingest.relations },
      { platform: 13, ui: 5, project: 10, relations: 9 },
      "synthetic example totals"
    );
    assert.deepEqual(ingest.projects, ["aurora-tea", "synthetic-fashion"]);
    assert.equal(fs.readdirSync(EX_KB).length, before.size, "examples untouched");
    return `${ingest.platform + ingest.ui + ingest.project + ingest.relations} records computed, 0 written`;
  });

  await checkAsync("KB-03", "ingest is deterministic: two runs produce identical volatile-stripped artifact hashes and id-sorted JSONL", async () => {
    const a = mkTemp("det-a");
    const b = mkTemp("det-b");
    const ra = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--out", a, "--json"]);
    const rb = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--out", b, "--json"]);
    assert.equal(ra.code, 0, ra.err);
    assert.equal(rb.code, 0, rb.err);
    const hashA = parseJsonRun(ra).artifacts.find((x) => x.role === "kb-records").volatileContentHash;
    const hashB = parseJsonRun(rb).artifacts.find((x) => x.role === "kb-records").volatileContentHash;
    assert.equal(hashA, hashB, `kb-records volatile hashes differ: ${hashA} vs ${hashB}`);
    for (const f of ["platform/records.jsonl", "ui/records.jsonl", "relations/records.jsonl", "project/synthetic-fashion/records.jsonl"]) {
      const ids = readJsonl(path.join(a, f)).map((x) => x.id);
      assert.deepEqual(ids, [...ids].sort(), `${f} must be id-sorted`);
    }
    return `stable hash ${hashA.slice(0, 12)}…`;
  });

  await checkAsync("KB-04", "committed kb/ store equals a fresh ingest (drift guard, volatile-stripped)", async () => {
    const fresh = mkTemp("fresh");
    const r = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--out", fresh, "--json"]);
    assert.equal(r.code, 0, r.err);
    for (const f of ["platform/records.jsonl", "ui/records.jsonl", "relations/records.jsonl", "project/synthetic-fashion/records.jsonl", "project/aurora-tea/records.jsonl"]) {
      const committed = readJsonl(path.join(KB_STORE, f)).map(stripVolatile);
      const regen = readJsonl(path.join(fresh, f)).map(stripVolatile);
      assert.equal(canonicalStringify(committed), canonicalStringify(regen), `${f} drifts from a fresh ingest — regenerate kb/ via det kb ingest`);
    }
    const committedDesc = JSON.parse(fs.readFileSync(path.join(KB_STORE, "store.json"), "utf8"));
    assert.deepEqual(committedDesc.counts, { platform: 13, ui: 5, project: 10, relations: 9 });
    return "5/5 partitions byte-equal (modulo observation timestamps)";
  });

  // ---- #9 registry bridge honesty ----------------------------------------------------------
  await checkAsync("KB-05", "bridge honesty: declaration-only proof, enablement as data, no runtime claims", async () => {
    const records = readJsonl(path.join(KB_STORE, "platform/records.jsonl"));
    assert.equal(records.length, 13, "13 bridged capabilities");
    const byId = new Map(records.map((r) => [r.id, r]));
    const disabled = byId.get("cap:example-disabledwidgets:widget-disabled-teaser");
    assert.equal(disabled.enablement.state, "disabled", "disabled module kept its distinct enablement fact");
    assert.equal(disabled.evidence.proofLevel, "DETECTED");
    // Converter 'discovered' is still declaration inspection -> DETECTED; AVAILABILITY unknown is
    // the honest distinct fact (enablement.state), never a proof downgrade.
    const unknownEnablement = records.filter((r) => r.enablement.state === "unknown");
    assert.equal(unknownEnablement.length, 2, "chrome capabilities carry enablement 'unknown'");
    assert.ok(records.every((r) => r.evidence.proofLevel === "DETECTED"), "declaration-only registry bridges to DETECTED, never TESTED");
    for (const r of records) {
      assert.ok(r.evidence.uncertainty.length >= 1, `${r.id} must state uncertainty`);
      assert.equal(r.evidence.method, "capability-registry-bridge");
      assert.ok(r.observed.inputDigests["reg:expected-registry.json"], `${r.id} must pin the registry digest`);
      assert.equal(r.enablement.source, r.enablement.state === "unknown" ? "declaration" : "config-scan");
    }
    const raw = fs.readFileSync(path.join(KB_STORE, "platform/records.jsonl"), "utf8");
    for (const banned of ["TESTED", "admin-roundtrip", "visually-verified", "runtime-check"]) {
      assert.ok(!raw.includes(banned), `KB-1 bridge must never claim '${banned}'`);
    }
    return "13 records; disabled=1, unknown=2, uncertainty everywhere";
  });

  await checkAsync("KB-06", "per-appearance identity: banner appearances are distinct records, nativeId preserved verbatim", async () => {
    const records = readJsonl(path.join(KB_STORE, "platform/records.jsonl"));
    const byId = new Map(records.map((r) => [r.id, r]));
    const fullWidth = byId.get("cap:magento-pagebuilder:banner-full-width");
    const minimal = byId.get("cap:magento-pagebuilder:banner-minimal");
    assert.ok(fullWidth && minimal, "both banner appearances bridged");
    assert.equal(fullWidth.nativeId, "magento_pagebuilder/banner@full-width");
    assert.equal(minimal.nativeId, "magento_pagebuilder/banner@minimal");
    const widget = byId.get("cap:example-customwidgets:component-banner-a");
    assert.equal(widget.nativeId, "example_customwidgets/component/banner_a");
    assert.equal(widget.origin, "custom", "developer-owned widget keeps its origin class");
    return "appearance suffixes stable, upstream ids verbatim";
  });

  // ---- deny-list / secret / licensed guards --------------------------------------------------
  function writeDirtyManifest(dir) {
    // dir must be a STAGED example dir: manifest-relative inputs resolve against the manifest's
    // own directory, so bare temp manifests would break every relative input.
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    manifest.manifestId = "dirty-deny-fixture";
    manifest.inputs.uiInventory = { path: "licensed/ui-inventory.json", rootAlias: "dirty", label: "denied licensed inventory" };
    manifest.inputs.projectRecords.push({ path: "app/etc/env.php", rootAlias: "dirty", label: "denied env.php" });
    manifest.denyGlobs = ["licensed/**"];
    const file = path.join(dir, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    return file;
  }

  await checkAsync("KB-07", "deny-list: baseline + manifest globs skip inputs, markers never leak, partial run is honest", async () => {
    const manifestDir = stageExamples();
    const manifest = writeDirtyManifest(manifestDir);
    const r = await runCli(["kb", "ingest", "--manifest", manifest, REG_FLAG, REG_VALUE, `--root`, `dirty=${KB_DIRTY}`, "--json"]);
    assert.equal(r.code, 0, `report-only partial run should warn, not fail: ${r.err}`);
    const run = parseJsonRun(r);
    const codes = run.runDiagnostics.map((d) => d.code);
    assert.ok(codes.includes("DENIED_PATH_SKIPPED"), `expected DENIED_PATH_SKIPPED, got ${codes.join(",")}`);
    assert.equal(codes.filter((c) => c === "DENIED_PATH_SKIPPED").length, 2, "env.php (baseline) + licensed inventory (manifest glob)");
    assert.ok(codes.includes("INGEST_PARTIAL_DENIAL"), "partial denial must be named");
    for (const marker of SECRET_MARKERS) assert.ok(!r.out.includes(marker) && !r.err.includes(marker), `marker '${marker}' leaked into output`);
    const ingest = JSON.parse(r.out).output.ingest;
    assert.equal(ingest.ui, 0, "denied inventory contributed nothing");
    assert.equal(ingest.platform, 13, "valid registry still bridged");
    return "2 denials, 0 marker leaks, partial named";
  });

  await checkAsync("KB-08", "fail closed: a run whose inputs are all denied is an error", async () => {
    const manifestDir = stageExamples();
    const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, "manifest.json"), "utf8"));
    manifest.manifestId = "deny-all-fixture";
    manifest.denyGlobs = ["*.json"];
    const file = path.join(manifestDir, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    const r = await runCli(["kb", "ingest", "--manifest", file, REG_FLAG, REG_VALUE, "--json"]);
    assert.equal(r.code, 1, "all-denied run exits 1");
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "INGEST_ALL_INPUTS_DENIED"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    return "INGEST_ALL_INPUTS_DENIED";
  });

  await checkAsync("KB-09", "partial denial refuses to regenerate a store with --out (no silent record loss)", async () => {
    const store = stageStore();
    const manifestDir = stageExamples();
    const manifest = writeDirtyManifest(manifestDir);
    const before = fs.readFileSync(path.join(store, "platform/records.jsonl"), "utf8");
    const r = await runCli(["kb", "ingest", "--manifest", manifest, REG_FLAG, REG_VALUE, `--root`, `dirty=${KB_DIRTY}`, "--out", store, "--json"]);
    assert.equal(r.code, 1, "write-intent partial denial exits 1");
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "INGEST_PARTIAL_DENIAL" && d.severity === "error"), "partial denial escalates under write intent");
    const after = fs.readFileSync(path.join(store, "platform/records.jsonl"), "utf8");
    assert.equal(before, after, "store partitions untouched on refusal");
    return "store preserved, exit 1";
  });

  async function ingestWithSwap(mutate) {
    const ex = stageExamples();
    mutate(ex);
    return runCli(["kb", "ingest", "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
  }

  await checkAsync("KB-10", "dangling relation endpoint -> exit 1 DANGLING_RELATION_ENDPOINT", async () => {
    const r = await ingestWithSwap((ex) => fs.copyFileSync(path.join(KB_NEG, "relations-dangling.jsonl"), path.join(ex, "relations.json")));
    assert.equal(r.code, 1, r.err);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "DANGLING_RELATION_ENDPOINT"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    return "write-time graph integrity";
  });

  await checkAsync("KB-11", "cross-class mapsTo -> exit 1 CLASS_BOUNDARY_EDGE_FORBIDDEN; same-class mapsTo stays legal", async () => {
    const r = await ingestWithSwap((ex) => fs.copyFileSync(path.join(KB_NEG, "relations-cross-class.jsonl"), path.join(ex, "relations.json")));
    assert.equal(r.code, 1, r.err);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "CLASS_BOUNDARY_EDGE_FORBIDDEN"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    // The clean example's mapsTo (secomm widget -> licensed upstream banner, same developer-owned
    // class) must keep passing — the rule is the class boundary, not the edge type.
    const clean = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    assert.equal(clean.code, 0);
    return "neighborOf across classes; mapsTo only within";
  });

  await checkAsync("KB-12", "oversized free text on a licensed record -> exit 1 LICENSED_FIELD_TOO_LARGE", async () => {
    const r = await ingestWithSwap((ex) => fs.copyFileSync(path.join(KB_NEG, "ui-inventory-oversize.json"), path.join(ex, "ui-inventory.json")));
    assert.equal(r.code, 1, r.err);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "LICENSED_FIELD_TOO_LARGE"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    for (const marker of SECRET_MARKERS) assert.ok(!r.out.includes(marker), `licensed excerpt marker '${marker}' leaked`);
    return "metadata-only enforced beyond schema shape";
  });

  await checkAsync("KB-13", "KB-3 id scope != projectId -> exit 1 PROJECT_SCOPE_MISMATCH", async () => {
    const r = await ingestWithSwap((ex) => fs.copyFileSync(path.join(KB_NEG, "project-records-wrong-scope.json"), path.join(ex, "project-records.synthetic-fashion.json")));
    assert.equal(r.code, 1, r.err);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "PROJECT_SCOPE_MISMATCH"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    return "external taxonomies can never hijack canonical ids";
  });

  await checkAsync("KB-14", "secret-bearing record -> exit 1 SECRET_PATTERN_DETECTED, value never echoed", async () => {
    const r = await ingestWithSwap((ex) => fs.copyFileSync(path.join(KB_NEG, "project-records-secret.json"), path.join(ex, "project-records.synthetic-fashion.json")));
    assert.equal(r.code, 1, r.err);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "SECRET_PATTERN_DETECTED"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    assert.ok(!r.out.includes("SuperSecret99"), "secret value itself must not appear in output");
    return "store carries metadata, never credentials";
  });

  // ---- query: isolation, honesty, acceptance queries ------------------------------------------
  await checkAsync("KB-15", "KB-3 query without --project is default-deny (exit 1 PROJECT_SCOPE_REQUIRED)", async () => {
    const r = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "project", "--json"]);
    assert.equal(r.code, 1);
    const run = parseJsonRun(r);
    assert.ok(run.runDiagnostics.some((d) => d.code === "PROJECT_SCOPE_REQUIRED"), JSON.stringify(run.runDiagnostics.map((d) => d.code)));
    const all = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "all", "--json"]);
    assert.equal(all.code, 1, "--kb all without --project also refuses");
    return "unset project scope is an error, never 'all projects'";
  });

  await checkAsync("KB-16", "cross-project isolation: leaked record excluded from both projects' queries; validate flags the partition", async () => {
    const store = stageStore();
    const leaked = {
      schemaVersion: 1, recordType: "requirement", id: "req:synthetic-fashion:leaked-note",
      projectId: "synthetic-fashion", tenantId: "tenant-synthetic", title: "Leaked", statement: "Placed in the wrong partition on purpose.",
      source: { kind: "spec", locator: "leaked", accessedAt: "2026-11-03T00:00:00Z" }, status: "draft",
      kind: "functional", traceStatus: "UNKNOWN", visibility: "example", createdAt: "2026-11-03T00:00:00Z",
      lifecycle: { state: "ACTIVE", reviewStatus: "unreviewed" }, observed: { scannedAt: "2026-11-03T00:00:00Z" },
    };
    const aurora = path.join(store, "project/aurora-tea/records.jsonl");
    fs.writeFileSync(aurora, fs.readFileSync(aurora, "utf8") + JSON.stringify(leaked) + "\n");
    const q = await runCli(["kb", "query", "--store", store, "--kb", "project", "--project", "aurora-tea", "--json"]);
    assert.equal(q.code, 0, "exclusion is a warning, not a failure");
    const result = JSON.parse(q.out).output;
    assert.ok(!result.hits.some((h) => h.record.id === "req:synthetic-fashion:leaked-note"), "leaked record must not surface in aurora scope");
    assert.ok(result.diagnostics.some((d) => d.code === "FOREIGN_PROJECT_RECORDS_EXCLUDED" && d.severity === "warning"), JSON.stringify(result.diagnostics.map((d) => d.code)));
    // K2: NO foreign identifiers anywhere in tenant A's whole output — hits, diagnostics, envelope.
    assert.ok(!q.out.includes("synthetic-fashion") && !q.out.includes("leaked-note"), `foreign identifiers leaked into tenant A output: ${q.out.slice(0, 400)}`);
    const other = await runCli(["kb", "query", "--store", store, "--kb", "project", "--project", "synthetic-fashion", "--json"]);
    assert.ok(!JSON.parse(other.out).output.hits.some((h) => h.record.id === "req:synthetic-fashion:leaked-note"), "partition isolation keeps it invisible from its own project too");
    // Corruption in ANOTHER tenant's partition must neither leak into nor break this query.
    const fashionFile = path.join(store, "project/synthetic-fashion/records.jsonl");
    fs.appendFileSync(fashionFile, "{not json at all\n");
    const q2 = await runCli(["kb", "query", "--store", store, "--kb", "project", "--project", "aurora-tea", "--json"]);
    assert.equal(q2.code, 0, "aurora query unaffected by synthetic-fashion corruption");
    assert.ok(!q2.out.includes("not json at all") && !q2.out.includes("synthetic-fashion/records.jsonl"), "foreign partition corruption never leaks into diagnostics");
    assert.ok(!JSON.parse(q2.out).run.runDiagnostics.some((d) => d.code === "STORE_LINE_INVALID"), "no foreign diagnostics");
    const v = await runCli(["kb", "validate", "--store", store, "--json"]);
    assert.equal(v.code, 1);
    assert.ok(parseJsonRun(v).runDiagnostics.some((d) => d.code === "PARTITION_PROJECT_MISMATCH"), JSON.stringify(parseJsonRun(v).runDiagnostics.map((d) => d.code)));
    return "excluded + diagnosed + validate error";
  });

  await checkAsync("KB-17", "query 1 (acceptance): registered banner components for this Magento PB project", async () => {
    const r = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--where", "category=content", "--text", "banner", "--json"]);
    assert.equal(r.code, 0, r.err);
    const result = JSON.parse(r.out).output;
    const ids = result.hits.map((h) => h.record.id);
    assert.deepEqual(ids, [
      "cap:example-customwidgets:component-banner-a",
      "cap:example-customwidgets:custombanner",
      "cap:magento-pagebuilder:banner-full-width",
      "cap:magento-pagebuilder:banner-minimal",
    ]);
    for (const h of result.hits) {
      assert.ok(h.record.evidence, "provenance on every hit");
      assert.ok(h.record.evidence.uncertainty.length >= 1, "uncertainty on every hit");
      assert.ok(h.file && h.line >= 1, "store location on every hit");
      assert.equal(h.record.enablement.state, "enabled");
    }
    return ids.length + " banner capabilities, evidence-carried";
  });

  await checkAsync("KB-18", "query 2 (acceptance): Hyvä UI hero variants with evidence and license boundary", async () => {
    const r = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "ui", "--where", "sourcePackage.kind=hyva-ui", "--text", "hero", "--json"]);
    assert.equal(r.code, 0, r.err);
    const result = JSON.parse(r.out).output;
    assert.equal(result.hits.length, 1);
    const rec = result.hits[0].record;
    assert.equal(rec.id, "uic:hyva-ui:hero");
    assert.deepEqual(rec.variants.map((v) => v.name), ["A-default", "B-overlay"]);
    assert.equal(rec.license.regime, "commercial", "license boundary named");
    assert.equal(rec.license.derivedArtifactPolicy, "metadata-only");
    assert.equal(rec.behavior.cmsEditable, false, "visual resemblance never implies editability");
    assert.ok(rec.evidence.uncertainty.length >= 1);
    assert.ok(rec.evidence.proofLevel === "DETECTED", "metadata inventory is DETECTED, never TESTED");
    return "hero variants + commercial metadata-only + evidence";
  });

  await checkAsync("KB-19", "query 3 (acceptance): what constrains the hero (relation traversal + constraint record)", async () => {
    // Project-scoped relation edges are KB-3 content: default-deny without --project...
    const unscoped = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "relations", "--edge-type", "constrains", "--related-to", "uxi:synthetic-fashion:homepage-hero", "--json"]);
    assert.equal(unscoped.code, 0);
    const unscopedResult = JSON.parse(unscoped.out).output;
    assert.equal(unscopedResult.hits.length, 0, "project-scoped edges never surface without a project scope");
    assert.ok(unscopedResult.diagnostics.some((d) => d.code === "FOREIGN_PROJECT_RECORDS_EXCLUDED" && d.severity === "warning"), JSON.stringify(unscopedResult.diagnostics.map((d) => d.code)));
    assert.ok(!unscopedResult.diagnostics.some((d) => JSON.stringify(d).includes("synthetic-fashion")), "aggregate exclusion must not name foreign ids");
    // ...while legitimate SHARED edges stay queryable unscoped.
    const shared = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "relations", "--edge-type", "adaptedFrom", "--json"]);
    assert.equal(shared.code, 0);
    const sharedHits = JSON.parse(shared.out).output.hits;
    assert.deepEqual(sharedHits.map((h) => h.record.id), ["rel:shared:adapted-banner-a-from-hyva"], "shared edges remain queryable");
    const r = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "relations", "--project", "synthetic-fashion", "--edge-type", "constrains", "--related-to", "uxi:synthetic-fashion:homepage-hero", "--json"]);
    assert.equal(r.code, 0, r.err);
    const result = JSON.parse(r.out).output;
    assert.equal(result.hits.length, 1);
    const rel = result.hits[0].record;
    assert.equal(rel.from.id, "con:synthetic-fashion:licensed-ui-no-embed");
    assert.equal(rel.to.id, "uxi:synthetic-fashion:homepage-hero");
    assert.equal(rel.projectId, "synthetic-fashion", "KB-3 edge carries project scope");
    const direct = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "project", "--project", "synthetic-fashion", "--where", "recordType=constraint", "--json"]);
    assert.equal(direct.code, 0);
    const constraint = JSON.parse(direct.out).output.hits[0].record;
    assert.equal(constraint.id, rel.from.id);
    assert.equal(constraint.strength, "invariant");
    assert.equal(constraint.enforcement, "fail-closed");
    // And another project's scope must not see it either.
    const other = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "relations", "--project", "aurora-tea", "--edge-type", "constrains", "--related-to", "uxi:synthetic-fashion:homepage-hero", "--json"]);
    assert.equal(JSON.parse(other.out).output.hits.length, 0, "cross-project scoped edge excluded");
    return "constrains edge resolves under its project scope only";
  });

  await checkAsync("KB-20", "query determinism: identical query twice -> identical JSON; exact proof filter never downgrades", async () => {
    const a = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--where", "category=content", "--text", "banner", "--json"]);
    const b = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--where", "category=content", "--text", "banner", "--json"]);
    assert.equal(JSON.parse(a.out).output.hits.length, JSON.parse(b.out).output.hits.length);
    assert.equal(canonicalStringify(stripVolatile(JSON.parse(a.out).output)), canonicalStringify(stripVolatile(JSON.parse(b.out).output)), "query output must be byte-stable");
    const tested = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--require-proof", "TESTED", "--json"]);
    assert.equal(tested.code, 0);
    assert.equal(JSON.parse(tested.out).output.hits.length, 0, "a TESTED query never returns DETECTED records");
    const detected = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--require-proof", "DETECTED", "--json"]);
    assert.equal(JSON.parse(detected.out).output.hits.length, 13, "exact DETECTED filter returns exactly the declaration-backed records");
    return "stable order + honest exact filtering";
  });

  await checkAsync("KB-21", "lifecycle honesty: STALE records are excluded by default, visible on explicit include", async () => {
    const store = stageStore();
    const ex = mkTemp("stale-ex");
    stageExamples(ex);
    // First sync on an unchanged staged store: no stale, no write.
    const clean = await runCli(["kb", "sync", "--store", store, "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    assert.equal(clean.code, 0, clean.err);
    const cleanReport = JSON.parse(clean.out).output.sync;
    assert.equal(cleanReport.stale, 0, "clean sync marks nothing");
    assert.equal(cleanReport.checked, 37, "every record is digest-pinned");
    assert.equal(parseJsonRun(clean).wroteFiles, false, "clean sync is a disk no-op");
    // Mutate a source: the five KB-2 records pinned to ui-inventory.json go STALE.
    fs.appendFileSync(path.join(ex, "ui-inventory.json"), "\n");
    const r = await runCli(["kb", "sync", "--store", store, "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--out", store, "--json"]);
    assert.equal(r.code, 0, r.err);
    const report = JSON.parse(r.out).output.sync;
    assert.equal(report.stale, 5, "only the dependents of the changed digest go stale");
    const uiRecords = readJsonl(path.join(store, "ui/records.jsonl"));
    assert.ok(uiRecords.every((x) => x.lifecycle.state === "STALE"), "changed-source records marked STALE on disk");
    const platformRecords = readJsonl(path.join(store, "platform/records.jsonl"));
    assert.ok(platformRecords.every((x) => x.lifecycle.state === "ACTIVE"), "unaffected records stay ACTIVE");
    const q = await runCli(["kb", "query", "--store", store, "--kb", "ui", "--where", "sourcePackage.kind=hyva-ui", "--text", "hero", "--json"]);
    assert.equal(JSON.parse(q.out).output.hits.length, 0, "fail closed: stale claims are not query answers");
    const qStale = await runCli(["kb", "query", "--store", store, "--kb", "ui", "--text", "hero", "--include-lifecycle", "STALE", "--json"]);
    assert.equal(JSON.parse(qStale.out).output.hits.length, 1, "explicit include surfaces them (still marked)");
    return "digest change -> STALE -> excluded by default";
  });

  await checkAsync("KB-22", "sync never upgrades: STALE records stay STALE on re-sync until a fresh ingest re-observes", async () => {
    const store = stageStore();
    const ex = stageExamples();
    fs.appendFileSync(path.join(ex, "ui-inventory.json"), "\n");
    await runCli(["kb", "sync", "--store", store, "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--out", store, "--json"]);
    const again = await runCli(["kb", "sync", "--store", store, "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    assert.equal(again.code, 0);
    const report = JSON.parse(again.out).output.sync;
    assert.equal(report.stale, 5, "still stale — never silently upgraded back to ACTIVE");
    const hero = readJsonl(path.join(store, "ui/records.jsonl")).find((x) => x.id === "uic:hyva-ui:hero");
    assert.equal(hero.lifecycle.state, "STALE");
    // Re-ingest is the only honest reset (fresh observation).
    const re = await runCli(["kb", "ingest", "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--out", store, "--json"]);
    assert.equal(re.code, 0, re.err);
    const heroAfter = readJsonl(path.join(store, "ui/records.jsonl")).find((x) => x.id === "uic:hyva-ui:hero");
    assert.equal(heroAfter.lifecycle.state, "ACTIVE", "fresh ingest re-observes with new digests");
    return "STALE persists across syncs; ingest resets honestly";
  });

  // ---- validate -------------------------------------------------------------------------------
  await checkAsync("KB-23", "kb validate: committed store passes clean", async () => {
    const r = await runCli(["kb", "validate", "--store", KB_STORE, "--json"]);
    assert.equal(r.code, 0, r.err);
    const run = parseJsonRun(r);
    assert.equal(run.wroteFiles, false);
    const out = JSON.parse(r.out).output.validate;
    assert.equal(out.valid, true);
    assert.equal(out.counts.records, 37);
    return "37 records, 0 errors";
  });

  await checkAsync("KB-24", "kb validate: schema-invalid record and descriptor drift fail closed", async () => {
    const store = stageStore();
    const file = path.join(store, "platform/records.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    const rec = JSON.parse(lines[0]);
    delete rec.lifecycle; // unified envelope is mandatory
    lines[0] = JSON.stringify(rec);
    fs.writeFileSync(file, lines.join("\n") + "\n");
    const r = await runCli(["kb", "validate", "--store", store, "--json"]);
    assert.equal(r.code, 1);
    assert.ok(parseJsonRun(r).runDiagnostics.some((d) => d.code === "RECORD_SCHEMA_INVALID"), JSON.stringify(parseJsonRun(r).runDiagnostics.map((d) => d.code)));
    const store2 = stageStore();
    const descFile = path.join(store2, "store.json");
    const desc = JSON.parse(fs.readFileSync(descFile, "utf8"));
    desc.counts.ui += 1;
    fs.writeFileSync(descFile, JSON.stringify(desc, null, 2) + "\n");
    const r2 = await runCli(["kb", "validate", "--store", store2, "--json"]);
    assert.equal(r2.code, 1);
    assert.ok(parseJsonRun(r2).runDiagnostics.some((d) => d.code === "STORE_COUNTS_DRIFT"));
    return "record shape + descriptor honesty enforced";
  });

  // ---- usage errors ----------------------------------------------------------------------------
  await checkAsync("KB-25", "kb usage errors: missing --store/--manifest, unknown filter key, bad proof level, unreadable manifest", async () => {
    assert.equal((await runCli(["kb", "query", "--kb", "platform", "--json"])).code, 2, "query without --store");
    assert.equal((await runCli(["kb", "ingest", "--json"])).code, 2, "ingest without --manifest");
    assert.equal((await runCli(["kb", "sync", "--store", KB_STORE, "--json"])).code, 2, "sync without --manifest");
    const unknownKey = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--where", "bogusField=x", "--json"]);
    assert.equal(unknownKey.code, 1, "unknown filter key is a blocking diagnostic, not a guess");
    assert.ok(parseJsonRun(unknownKey).runDiagnostics.some((d) => d.code === "QUERY_FILTER_UNKNOWN"));
    assert.equal((await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--require-proof", "probably-fine", "--json"])).code, 2, "bad proof level is usage");
    assert.equal((await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--include-lifecycle", "ACTIV", "--json"])).code, 2, "bad lifecycle value is usage");
    assert.equal((await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), "--root", "BadAlias=/tmp", "--json"])).code, 2, "malformed --root alias is usage");
    assert.equal((await runCli(["validate", "--store", KB_STORE, "--json"])).code, 2, "kb-only flag on a converter command is usage again");
    const unreadable = await runCli(["kb", "ingest", "--manifest", "/definitely/not/a/manifest.json", "--json"]);
    assert.equal(unreadable.code, 2, "unreadable manifest is usage error");
    return "fail-closed usage surface";
  });

  await checkAsync("KB-27", "engine output artifacts validate against kb-engine-output; schemaRef is honest", async () => {
    const ingest = await runCli(["kb", "ingest", "--manifest", path.join(EX_KB, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    const ing = JSON.parse(ingest.out);
    const recordsPayload = ing.output.records;
    const check1 = validateContract("kb-engine-output", recordsPayload);
    assert.ok(check1.valid, "records view must validate: " + (check1.errors[0] ?? ""));
    const q = await runCli(["kb", "query", "--store", KB_STORE, "--kb", "platform", "--where", "category=content", "--text", "banner", "--json"]);
    const qOut = JSON.parse(q.out).output;
    const check2 = validateContract("kb-engine-output", qOut);
    assert.ok(check2.valid, "query result must validate: " + (check2.errors[0] ?? ""));
    const ex = stageExamples();
    fs.appendFileSync(path.join(ex, "ui-inventory.json"), "\n");
    const store = stageStore();
    const sync = await runCli(["kb", "sync", "--store", store, "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--json"]);
    const syncReport = JSON.parse(sync.out).output.sync;
    const check3 = validateContract("kb-engine-output", syncReport);
    assert.ok(check3.valid, "sync report must validate: " + (check3.errors[0] ?? ""));
    const run = parseJsonRun(q);
    for (const art of run.artifacts) {
      if (art.role.startsWith("kb-")) {
        assert.ok(/schemas\/kb\//.test(art.schemaRef), `KB artifact ${art.role} must reference the KB family, got ${art.schemaRef}`);
      }
    }
    return "3/3 envelopes schema-valid; KB artifact refs honest";
  });

  await checkAsync("KB-28", "review carry-forward on re-ingest; digest-guarded reset on changed sources", async () => {
    const store = stageStore();
    const ex = stageExamples();
    // Approve one record in every lane that carries lifecycle review status.
    const approve = (file, id) => {
      const lines = fs.readFileSync(path.join(store, file), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      const rec = lines.find((x) => x.id === id);
      rec.lifecycle.reviewStatus = "approved";
      rec.lifecycle.reviewedBy = "Coordinator (role)";
      fs.writeFileSync(path.join(store, file), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    };
    approve("platform/records.jsonl", "cap:magento-pagebuilder:banner-full-width");
    approve("ui/records.jsonl", "uic:hyva-ui:hero");
    approve("project/synthetic-fashion/records.jsonl", "req:synthetic-fashion:hero-merchant-editable");
    // Relations carry lifecycle optionally — create it when approving.
    const relFile = path.join(store, "relations/records.jsonl");
    const relLines = fs.readFileSync(relFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const rel = relLines.find((x) => x.id === "rel:shared:neighbor-pb-banner-hyva-hero");
    rel.lifecycle = { ...(rel.lifecycle ?? {}), reviewStatus: "approved", reviewedBy: "Coordinator (role)" };
    fs.writeFileSync(relFile, relLines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    // Same inputs, same digests -> review carries forward on all four lanes.
    const r1 = await runCli(["kb", "ingest", "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--out", store, "--json"]);
    assert.equal(r1.code, 0, r1.err);
    const keep = (file, id) => JSON.parse(fs.readFileSync(path.join(store, file), "utf8").trim().split("\n").find((l) => JSON.parse(l).id === id));
    for (const [file, id] of [["platform/records.jsonl", "cap:magento-pagebuilder:banner-full-width"], ["ui/records.jsonl", "uic:hyva-ui:hero"], ["project/synthetic-fashion/records.jsonl", "req:synthetic-fashion:hero-merchant-editable"], ["relations/records.jsonl", "rel:shared:neighbor-pb-banner-hyva-hero"]]) {
      assert.equal(keep(file, id).lifecycle.reviewStatus, "approved", `${id} review must survive re-ingest`);
    }
    // Changed source -> re-observation resets review with an explicit diagnostic (an approval
    // is never inherited by content nobody reviewed).
    fs.appendFileSync(path.join(ex, "ui-inventory.json"), "\n");
    const r2 = await runCli(["kb", "ingest", "--manifest", path.join(ex, "manifest.json"), REG_FLAG, REG_VALUE, "--out", store, "--json"]);
    assert.equal(r2.code, 0, r2.err);
    assert.ok(parseJsonRun(r2).runDiagnostics.some((d) => d.code === "REVIEW_RESET_ON_CHANGED_SOURCE" && d.subject?.id === "uic:hyva-ui:hero"), JSON.stringify(parseJsonRun(r2).runDiagnostics.map((d) => d.code)));
    assert.equal(keep("ui/records.jsonl", "uic:hyva-ui:hero").lifecycle.reviewStatus, "unreviewed", "changed-source record resets to unreviewed");
    assert.equal(keep("platform/records.jsonl", "cap:magento-pagebuilder:banner-full-width").lifecycle.reviewStatus, "approved", "unchanged-source review untouched");
    return "4 lanes carry; changed source resets with diagnostic";
  });

  await checkAsync("KB-29", "query trust gate: unsafe records (schema-invalid, secret-bearing) and corrupt lines never surface, exit nonzero", async () => {
    const store = stageStore();
    // (a) strip the mandatory evidence block from a KB-1 record (schema-valid JSON, unsafe record)
    const platformFile = path.join(store, "platform/records.jsonl");
    const lines = fs.readFileSync(platformFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const victim = lines.find((x) => x.id === "cap:magento-pagebuilder:heading");
    delete victim.evidence;
    fs.writeFileSync(platformFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n" + "{corrupt line\n");
    // (b) plant a secret value into a KB-2 record's free text
    const uiFile = path.join(store, "ui/records.jsonl");
    const uiLines = fs.readFileSync(uiFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const hero = uiLines.find((x) => x.id === "uic:hyva-ui:hero");
    hero.notes = "deploy key api_key: \"AKIAIOSFOEXAMPLE9\"";
    fs.writeFileSync(uiFile, uiLines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    // platform query: unsafe record + corrupt line -> exit 1, named by id/kind, content withheld
    const qp = await runCli(["kb", "query", "--store", store, "--kb", "platform", "--json"]);
    assert.equal(qp.code, 1, "unsafe scope must exit nonzero");
    const qpRun = parseJsonRun(qp);
    assert.ok(qpRun.runDiagnostics.some((d) => d.code === "QUERY_RECORD_UNSAFE" && d.subject?.id === "cap:magento-pagebuilder:heading" && d.message.includes("schema")), JSON.stringify(qpRun.runDiagnostics.map((d) => d.code)));
    assert.ok(qpRun.runDiagnostics.some((d) => d.code === "STORE_LINE_INVALID"), "corrupt JSONL line is reported, never skipped");
    assert.ok(!qp.out.includes("corrupt line"), "raw corrupted line content must not echo");
    assert.ok(!JSON.parse(qp.out).output.hits.some((h) => h.record.id === "cap:magento-pagebuilder:heading"), "unsafe record excluded from hits");
    // ui query: secret-bearing record -> exit 1, secret VALUE never echoed
    const qu = await runCli(["kb", "query", "--store", store, "--kb", "ui", "--json"]);
    assert.equal(qu.code, 1);
    assert.ok(parseJsonRun(qu).runDiagnostics.some((d) => d.code === "QUERY_RECORD_UNSAFE" && d.subject?.id === "uic:hyva-ui:hero" && d.message.includes("secret-pattern")), JSON.stringify(parseJsonRun(qu).runDiagnostics.map((d) => d.code)));
    assert.ok(!qu.out.includes("AKIAIOSFOEXAMPLE9"), "secret value must never appear in output");
    assert.ok(!JSON.parse(qu.out).output.hits.some((h) => h.record.id === "uic:hyva-ui:hero"), "secret-bearing record excluded from hits");
    return "gate blocks unsafe scope; ids+kinds named, values withheld";
  });

  await checkAsync("KB-26", "portability scan: no owner paths, no real file keys, no secret markers in schemas/kb, examples/kb or kb/", async () => {
    const forbidden = [/\/home\/[a-z]/i, /slaunch/i, /vNPtfBRpYM3PsExirVqhmt/i, ...SECRET_MARKERS.map((m) => new RegExp(m))];
    const dirs = [path.join(ROOT, "schemas", "kb"), EX_KB, KB_STORE];
    const hits = [];
    const scan = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) scan(p);
        else if (/\.(json|jsonl|md)$/.test(ent.name) && ent.name !== "tool-run.json") {
          const text = fs.readFileSync(p, "utf8");
          for (const re of forbidden) if (re.test(text)) hits.push(`${path.relative(ROOT, p)}: ${re.source}`);
        }
      }
    };
    dirs.forEach(scan);
    assert.deepEqual(hits, [], "portability/licensing violations:\n" + hits.join("\n"));
    return "0 violations across KB surfaces";
  });
}
