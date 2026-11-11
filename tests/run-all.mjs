#!/usr/bin/env node
// Design Engineering Toolkit — contract test gate (issue #5 architecture pass).
// Runs the 14-case negative/semantic test plan from specs/ISSUE-5-converter-architecture.md §7:
// schema validation (positive + negative), semantic checks, determinism, neutrality guard,
// and the two-family portability check. Exits non-zero on any failure.
import fs from "node:fs";
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
// Issue #9: the production core graduated from tests/lib to src/core (TypeScript, compiled to
// dist/). The harness now tests the real production modules — parity was proven by these
// checks passing unchanged against the ported implementation.
import { canonicalStringify, contentHash, sha256Hex } from "../dist/src/core/canonical.js";
import { resolveProjectSource, checkAdapterApplicable } from "../dist/src/core/preflight.js";
import { validateBindingMap, resolveStructure, canonicalReportHash } from "../dist/src/core/resolver.js";
import { validateRegistry } from "../dist/src/core/semantic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "tests", "fixtures");
const results = [];
let failed = 0;
// Issue #9: async checks (the CLI is promise-based; adapters are out-of-process). They run
// after the sync suite and count into the same gate.
const asyncChecks = [];
const checkAsync = (id, name, fn) => asyncChecks.push({ id, name, fn });

function check(id, name, fn) {
  try {
    const detail = fn();
    results.push({ id, name, ok: true, detail: detail ?? "" });
  } catch (e) {
    failed++;
    results.push({ id, name, ok: false, detail: String(e.message || e) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
const load = (p) => JSON.parse(readFileSync(p, "utf8"));

// ---- Ajv instance with the whole converter family + V1 family loaded -------------------
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
// Both schema families declare "format": "date-time"; register a strict-enough checker
// (ajv core has no built-in formats without ajv-formats, which we deliberately do not add).
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
const SCHEMA_DIRS = [path.join(ROOT, "schemas", "converter"), ROOT];
const schemaFiles = SCHEMA_DIRS.flatMap((dir) =>
  readdirSync(dir).filter((f) => f.endsWith(".schema.json") || f === "common.defs.json").map((f) => path.join(dir, f))
);
// Each schema carries its own absolute $id, so relative refs inside the converter family
// (common.defs.json#/$defs/...) resolve against those ids once every file is registered.
for (const f of schemaFiles) ajv.addSchema(load(f));
const compile = (basename) =>
  ajv.getSchema(`https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/${basename}`) ?? ajv.compile(load(path.join(ROOT, "schemas", "converter", basename)));
const v1Compile = (basename) => ajv.getSchema(`https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/${basename}`) ?? ajv.compile(load(path.join(ROOT, "schemas", basename)));

const registry = load(`${FIX}/synthetic-flatcms/registry.fixture.json`);
const bindings = load(`${FIX}/synthetic-flatcms/bindings.fixture.json`);
const structure = load(`${FIX}/synthetic-flatcms/structure.fixture.json`);
const magentoRegistry = load(path.join(ROOT, "examples/converter/capability-registry.magento-pagebuilder.example.json"));
const syntheticProfile = load(`${FIX}/negative/profile-synthetic-flatcms.fixture.json`);

// ---- T-07 / T-10: schema validation ----------------------------------------------------
check("T-10a", "synthetic registry validates against capability-registry schema", () => {
  const v = compile("capability-registry.schema.json");
  const ok = v(registry);
  assert(ok, "fixture registry must validate: " + JSON.stringify(v.errors));
  return `${registry.capabilities.length} capabilities, 5 categories`;
});
check("T-10b", "corrupted registry twin fails schema with precise paths", () => {
  const v = compile("capability-registry.schema.json");
  const ok = v(load(`${FIX}/negative/registry-corrupted.fixture.json`));
  assert(!ok, "corrupted twin must fail");
  const text = JSON.stringify(v.errors);
  assert(text.includes("appearanceId") && text.includes("evidence"), "errors must name appearanceId and evidence: " + text);
  return `${v.errors.length} ajv errors incl. appearanceId/evidence`;
});
for (const [file, label] of [
  ["registry-schema-version-2.fixture.json", "schemaVersion: 2 rejected"],
  ["registry-schema-version-missing.fixture.json", "missing schemaVersion rejected"],
  ["registry-schema-version-string.fixture.json", "string schemaVersion rejected"],
]) {
  check("T-07", label, () => {
    const v = compile("capability-registry.schema.json");
    assert(!v(load(`${FIX}/negative/${file}`)), `${file} must fail ajv`);
    return file;
  });
}
check("POS-a", "Magento example registry validates (real-payload sample)", () => {
  const v = compile("capability-registry.schema.json");
  const ok = v(magentoRegistry);
  assert(ok, "magento example must validate: " + JSON.stringify(v.errors?.slice(0, 5)));
  return `${magentoRegistry.capabilities.length} capabilities`;
});
check("POS-b", "synthetic binding map validates", () => {
  const v = compile("component-binding-map.schema.json");
  const ok = v(bindings);
  assert(ok, "bindings fixture must validate: " + JSON.stringify(v.errors?.slice(0, 5)));
  return `${bindings.bindings.length} bindings`;
});
check("POS-c", "converter profile (synthetic, placeholder path) validates", () => {
  const v = compile("converter-profile.schema.json");
  const ok = v(syntheticProfile);
  assert(ok, "profile fixture must validate: " + JSON.stringify(v.errors?.slice(0, 5)));
  return "placeholder path accepted by schema; preflight gates it (T-06)";
});

// ---- Semantic cases ---------------------------------------------------------------------
check("T-01", "unknown capability id -> UNSUPPORTED_CAPABILITY, section blocked", () => {
  const { valid, diagnostics } = validateBindingMap(registry, load(`${FIX}/negative/bindings-unknown-target.fixture.json`));
  assert(!valid, "map with unknown target must be invalid");
  assert(diagnostics.some((x) => x.code === "UNSUPPORTED_CAPABILITY" && x.severity === "error"), "expected UNSUPPORTED_CAPABILITY: " + JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("T-02", "undeclared appearance -> UNSUPPORTED_APPEARANCE (no default guessing)", () => {
  const { valid, diagnostics } = validateBindingMap(registry, load(`${FIX}/negative/bindings-bad-appearance.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "UNSUPPORTED_APPEARANCE"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("T-03", "missing variant mapping -> VARIANT_NOT_MAPPED, section blocked", () => {
  const report = resolveStructure(registry, bindings, load(`${FIX}/negative/structure-variant-unmapped.fixture.json`));
  assert(report.diagnostics.some((x) => x.code === "VARIANT_NOT_MAPPED" && x.severity === "error"), JSON.stringify(report.diagnostics.map((x) => x.code)));
  assert(report.sections[0].status === "blocked", "section must be blocked");
  assert(report.coverage.total === 0, "no silently synthesized coverage");
  return `status=${report.sections[0].status}`;
});
check("T-04", "wrong nesting -> INCOMPATIBLE_NESTING", () => {
  const report = resolveStructure(registry, bindings, load(`${FIX}/negative/structure-illegal-nesting.fixture.json`));
  assert(report.diagnostics.some((x) => x.code === "INCOMPATIBLE_NESTING" && x.severity === "error"), JSON.stringify(report.diagnostics.map((x) => x.code)));
  return report.diagnostics.filter((x) => x.code === "INCOMPATIBLE_NESTING").length + " error(s)";
});
check("T-05a", "overlapping conditions, different targets -> AMBIGUOUS_BINDING", () => {
  const { valid, diagnostics } = validateBindingMap(registry, load(`${FIX}/negative/bindings-ambiguous.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "AMBIGUOUS_BINDING"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("T-05b", "exact duplicate tuple -> DUPLICATE_BINDING", () => {
  const { valid, diagnostics } = validateBindingMap(registry, load(`${FIX}/negative/bindings-duplicate.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "DUPLICATE_BINDING"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("T-11", "tampered summary -> count-mismatch error", () => {
  const tampered = load(`${FIX}/synthetic-flatcms/registry.fixture.json`);
  tampered.summary.byCategory.native += 1;
  const { valid, diagnostics } = validateRegistry(tampered);
  assert(!valid && diagnostics.some((x) => x.subject.id === "summary.byCategory"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.subject.id).join(",");
});
check("T-12", "proof overclaim (registered w/o config-declaration) -> EVIDENCE_MISSING", () => {
  const { valid, diagnostics } = validateRegistry(load(`${FIX}/negative/registry-bad-proof.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "EVIDENCE_MISSING" && x.subject.id === "flatcms/heading"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("T-12b", "G1 payload claiming admin-roundtrip-verified -> hard reject", () => {
  const { valid, diagnostics } = validateRegistry(load(`${FIX}/negative/registry-overclaim-roundtrip.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "EVIDENCE_MISSING"), "G1/G2 payloads cannot justify roundtrip claims");
  return "later-stage claim rejected";
});
check("T-13", "binding to disabled capability -> CAPABILITY_DISABLED", () => {
  const { valid, diagnostics } = validateBindingMap(registry, load(`${FIX}/negative/bindings-disabled-target.fixture.json`));
  assert(!valid && diagnostics.some((x) => x.code === "CAPABILITY_DISABLED"), JSON.stringify(diagnostics));
  return diagnostics.map((x) => x.code).join(",");
});
check("POS-d", "positive fixtures resolve clean (1 advisory warning only)", () => {
  const report = resolveStructure(registry, bindings, structure);
  const errors = report.diagnostics.filter((x) => x.severity === "error");
  assert(errors.length === 0, "positive set must have zero errors: " + JSON.stringify(errors));
  assert(report.sections.every((s) => s.status === "mapped"), "both sections mapped");
  assert(report.coverage.total === 5 && report.coverage.native === 3 && report.coverage.widget === 1 && report.coverage["custom-required"] === 1, JSON.stringify(report.coverage));
  assert(report.diagnostics.some((x) => x.code === "RESPONSIVE_UNCERTAIN" && x.severity === "warning"), "responsive advisory expected");
  // The committed example must equal a fresh deterministic run (minus generatedAt).
  const committed = load(path.join(ROOT, "examples/converter/resolution-report.synthetic-flatcms.example.json"));
  const fresh = { ...report, generatedAt: committed.generatedAt };
  assert(JSON.stringify(fresh, null, 2) + "\n" === JSON.stringify(committed, null, 2) + "\n", "committed example drifts from a fresh resolver run");
  return `coverage=${JSON.stringify(report.coverage)} warnings=${report.counts.warnings}`;
});
check("POS-e", "committed resolution-report example validates", () => {
  const v = compile("resolution-report.schema.json");
  const ok = v(load(path.join(ROOT, "examples/converter/resolution-report.synthetic-flatcms.example.json")));
  assert(ok, "committed report example must validate: " + JSON.stringify(v.errors?.slice(0, 5)));
  return "valid";
});

// ---- T-08: determinism -------------------------------------------------------------------
check("T-08", "deterministic output: shuffled sorted arrays -> identical hash", () => {
  const a = canonicalReportHash(resolveStructure(registry, bindings, structure));
  // Document-order arrays (structure sections/elements) are semantic and stay fixed;
  // association arrays (registry capabilities, bindings) may arrive in any order and
  // the resolver must restore canonical order (schemas/converter/README.md rule 1).
  const shuffledRegistry = { ...registry, capabilities: [...registry.capabilities].reverse() };
  const shuffledBindings = { ...bindings, bindings: [...bindings.bindings].reverse() };
  const b = canonicalReportHash(resolveStructure(shuffledRegistry, shuffledBindings, structure));
  assert(a === b, `hashes differ: ${a} vs ${b}`);
  const c = canonicalReportHash(resolveStructure(registry, bindings, structure));
  assert(a === c, "double run differs");
  return a.slice(0, 16) + "…";
});
check("T-08b", "magento example registry is in canonical key order", () => {
  const raw = readFileSync(path.join(ROOT, "examples/converter/capability-registry.magento-pagebuilder.example.json"), "utf8");
  const parsed = JSON.parse(raw);
  assert(JSON.stringify(parsed, null, 2) + "\n" === raw, "file serialization must be 2-space canonical form");
  const capOrder = parsed.capabilities.map((c) => c.id + "\u241F" + c.appearanceId);
  const sorted = [...capOrder].sort();
  assert(JSON.stringify(capOrder) === JSON.stringify(sorted), "capabilities must be sorted by (id, appearanceId)");
  return `${parsed.capabilities.length} entries in canonical order`;
});

// ---- T-06: preflight / missing project source -------------------------------------------
check("T-06a", "placeholder sentinel path -> PROJECT_SOURCE_NOT_CONFIGURED, no audit", () => {
  const { source, diagnostic } = resolveProjectSource(syntheticProfile);
  assert(source === null, "no source may be resolved from a placeholder");
  assert(diagnostic?.code === "PROJECT_SOURCE_NOT_CONFIGURED", JSON.stringify(diagnostic));
  return diagnostic.code;
});
check("T-06b", "unconfigured path -> PROJECT_SOURCE_NOT_FOUND", () => {
  const p = load(`${FIX}/negative/profile-synthetic-flatcms.fixture.json`);
  p.profile.projectSources[0].path = "/definitely/not/present";
  const { source, diagnostic } = resolveProjectSource(p, { stat: () => ({ exists: false, readable: false }) });
  assert(source === null && diagnostic?.code === "PROJECT_SOURCE_NOT_FOUND", JSON.stringify(diagnostic));
  return diagnostic.code;
});
check("T-06c", "unreadable source -> PROJECT_SOURCE_NOT_READABLE", () => {
  const p = load(`${FIX}/negative/profile-synthetic-flatcms.fixture.json`);
  p.profile.projectSources[0].path = "/definitely/not/present";
  const { source, diagnostic } = resolveProjectSource(p, { stat: () => ({ exists: true, readable: false }) });
  assert(source === null && diagnostic?.code === "PROJECT_SOURCE_NOT_READABLE", JSON.stringify(diagnostic));
  return diagnostic.code;
});
check("T-06d", "empty projectSources -> PROJECT_SOURCE_NOT_CONFIGURED (core runs without any checkout)", () => {
  const p = load(`${FIX}/negative/profile-synthetic-flatcms.fixture.json`);
  p.profile.projectSources = [];
  const { source, diagnostic } = resolveProjectSource(p);
  assert(source === null && diagnostic?.code === "PROJECT_SOURCE_NOT_CONFIGURED", JSON.stringify(diagnostic));
  return "generic core runs with zero sources";
});
check("T-06e", "mismatched probe -> ADAPTER_NOT_APPLICABLE", () => {
  const diagnostic = checkAdapterApplicable(syntheticProfile, ["some-other-platform"]);
  assert(diagnostic?.code === "ADAPTER_NOT_APPLICABLE", JSON.stringify(diagnostic));
  assert(checkAdapterApplicable(syntheticProfile, ["synthetic-flatcms", "magento-pagebuilder"]) === null, "matching platform passes");
  return "adapter scope enforced";
});

// ---- T-09: core-neutrality grep guard ----------------------------------------------------
check("T-09", "neutrality guard: no platform literals/paths/figma-ids in neutral surfaces", () => {
  // Neutral surfaces: schemas/converter/**, schemas/cli/** and the synthetic-flatcms fixtures.
  // V1 schemas are legitimately Figma-typed — scanned separately, only for non-Figma platform leakage.
  // The synthetic-magento-like fixture tree is deliberately magento-shaped (it is the adapter
  // fixture) and is covered by T-18b's owner-path/licensing scans instead.
  const neutralTerms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\/|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
  const v1Terms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\//i;
  const hits = [];
  const scanFile = (relPath, text, re) => {
    const m = text.match(new RegExp(re.source, "gi"));
    if (m) hits.push(`${relPath}: ${[...new Set(m)].join(",")}`);
  };
  const convDir = path.join(ROOT, "schemas", "converter");
  for (const f of readdirSync(convDir).filter((f) => f.endsWith(".json"))) scanFile(`schemas/converter/${f}`, readFileSync(path.join(convDir, f), "utf8"), neutralTerms);
  const cliDir = path.join(ROOT, "schemas", "cli");
  for (const f of readdirSync(cliDir).filter((f) => f.endsWith(".json"))) scanFile(`schemas/cli/${f}`, readFileSync(path.join(cliDir, f), "utf8"), neutralTerms);
  const fixDir = path.join(ROOT, "tests", "fixtures", "synthetic-flatcms");
  for (const f of readdirSync(fixDir)) scanFile(`tests/fixtures/synthetic-flatcms/${f}`, readFileSync(path.join(fixDir, f), "utf8"), neutralTerms);
  for (const f of readdirSync(path.join(ROOT, "schemas")).filter((f) => f.endsWith(".schema.json"))) {
    scanFile(`schemas/${f}`, readFileSync(path.join(ROOT, "schemas", f), "utf8"), v1Terms);
  }
  assert(hits.length === 0, "neutrality violations:\n" + hits.join("\n"));
  return "0 matches across schemas/** and synthetic fixtures";
});

// ---- T-14: two-family portability --------------------------------------------------------
check("T-14a", "V1 profile family still validates independently", () => {
  const v = v1Compile("project-profile.schema.json");
  const ok = v(load(path.join(ROOT, "profiles/luxury-editorial.example.json")));
  assert(ok, "V1 profile must validate: " + JSON.stringify(v.errors?.slice(0, 3)));
  const ok2 = v(load(path.join(ROOT, "profiles/commerce-promotional.example.json")));
  assert(ok2, "V1 commerce profile must validate");
  return "both V1 profiles valid (family untouched)";
});
check("T-14b", "V1 examples validate against V1 schemas", () => {
  for (const [schema, example] of [
    ["source-manifest.schema.json", "manifest.secomm-fashion.example.json"],
    ["design-tokens.schema.json", "tokens.secomm-fashion.example.json"],
    ["component-defs.schema.json", "components.secomm-fashion.example.json"],
  ]) {
    const v = v1Compile(schema);
    const ok = v(load(path.join(ROOT, "examples", example)));
    assert(ok, `${example} must validate against ${schema}: ` + JSON.stringify(v.errors?.slice(0, 3)));
  }
  return "3/3 V1 examples valid";
});

// ---- Issue #9 CLI + adapter suite (async) ------------------------------------------------
const { default: registerCliSuite } = await import("./cli-suite.mjs");
await registerCliSuite(checkAsync);

// ---- Issue #14 G2 design-source extraction suite (async) ---------------------------------
const { default: registerG2Suite } = await import("./g2-suite.mjs");
await registerG2Suite(checkAsync);

// ---- Issue #15 Knowledge Engine MVP suite (async) ------------------------------------------
const { default: registerKbSuite } = await import("./kb-suite.mjs");
await registerKbSuite(checkAsync);

// ---- Issue #23 G3 native content composition suite (async) ---------------------------------
const { default: registerG3Suite } = await import("./g3-suite.mjs");
await registerG3Suite(checkAsync);

// ---- Issue #25 G4 two-column native composition suite (async) -------------------------------
const { default: registerG4Suite } = await import("./g4-suite.mjs");
await registerG4Suite(checkAsync);

// ---- Issue #28 full-root homepage composition suite (async) ---------------------------------
const { default: registerG28Suite } = await import("./g28-suite.mjs");
await registerG28Suite(checkAsync);

// ---- Issue #28 one-shot build orchestrator suite (async) ------------------------------------
const { default: registerBuildSuite } = await import("./build-suite.mjs");
await registerBuildSuite(checkAsync);

// ---- Issue #41 schema registry SSOT suite (async) --------------------------------------------
const { default: registerRegistrySuite } = await import("./registry-suite.mjs");
await registerRegistrySuite(checkAsync);

// [56] the first real-source Studio build project: provenance + honesty locks over
// examples/build/slaunchpad-home-real-derived (depends on build-suite's committed example
// checks having registered; runs its own bundles in isolated temp dirs).
const { default: registerRealDerivedSuite } = await import("./real-derived-suite.mjs");
await registerRealDerivedSuite(checkAsync);

// [58] single-root startup: cwd-independent launcher resolution, in-place canonical
// catalogue shape, no-write guarantee for the committed example, root script wiring.
const { default: registerStudioStartupSuite } = await import("./studio-startup-suite.mjs");
await registerStudioStartupSuite(checkAsync);

// ---- Issue #19 M4 real-source KB gate suites (async) -----------------------------------------
const { default: registerKbM4LicenseSuite } = await import("./kb-m4-license-suite.mjs");
await registerKbM4LicenseSuite(checkAsync);
const { default: registerKbM4SafetySuite } = await import("./kb-m4-safety-suite.mjs");
await registerKbM4SafetySuite(checkAsync);
// ---- Issue #19 M4 read-only source-extract orchestrator suite (async) ------------------------
const { default: registerM4ExtractSuite } = await import("./kb-m4-extract-suite.mjs");
await registerM4ExtractSuite(checkAsync);
// ---- Issue #19 M4 KB source scanner adapter suite (async) ----------------------------------
const { default: registerM4Suite } = await import("./kb-m4-adapter-suite.mjs");
await registerM4Suite(checkAsync);
for (const { id, name, fn } of asyncChecks) {
  try {
    const detail = await fn();
    results.push({ id, name, ok: true, detail: detail ?? "" });
  } catch (e) {
    failed++;
    results.push({ id, name, ok: false, detail: String(e.message || e) });
  }
}

// ---- Report ------------------------------------------------------------------------------
console.log("Design Engineering Toolkit — contract test gate");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(6)} ${r.name}${r.ok ? `  [${r.detail}]` : `  !! ${r.detail}`}`);
}
const passed = results.length - failed;
console.log(`\n${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
