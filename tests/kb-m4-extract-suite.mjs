// Issue #19 M4 suite — `det kb extract`: the read-only source-extract orchestrator.
// Covers the extract-manifest contract gates, the three-lane root-alias gateway (flag > env >
// gitignored .toolkit/local.json), out-inside-source-root refusal, adapter-runtime failures
// (exit 3), payload contract + record-safety + digest/counts fail-closed gates, report-only /
// dry-run behavior, the happy-path write with an INJECTED deterministic scan-runner double (the
// real scanner adapter lands separately in adapters/), dedupe/conflict merge rules, null output
// targets and byte-level determinism. Every failure assertion also checks "nothing was written".
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateContract } from "../dist/src/core/schema-registry.js";
import { resolveRootAliases, expandTildePath, BASELINE_DENY_GLOBS } from "../dist/src/core/kb/path-gateway.js";
import { runExtract, KB_SOURCE_SCAN_CONTRACT_ID } from "../dist/src/core/kb/extract.js";
import { main } from "../dist/src/core/cli/main.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIXED_SCANNED_AT = "2026-11-06T01:00:00.000Z";
const DIGEST = "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12"; // 64 hex
const SECRET_MARKER = "SuperSecret99";

function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `det-m4e-${prefix}-`));
}

// A synthetic checkout-shaped source root (files are never read by the injected runner double,
// but subPath containment needs them to really resolve).
function stageSourceRoot() {
  const src = mkTemp("src");
  for (const rel of ["app/etc/config.php", "app/code/Foo/etc/module.xml", "vendor/hyva/theme/Hero.php"]) {
    fs.mkdirSync(path.join(src, rel, ".."), { recursive: true });
    fs.writeFileSync(path.join(src, rel), `# synthetic fixture ${rel}\n`);
  }
  return src;
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  return file;
}

// ---- deterministic test-double records (exact adapter-emitted envelopes) --------------------
function moduleRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    recordType: "module",
    id: "mod:magento-framework:exception",
    namespace: "magento-framework",
    platform: "magento",
    origin: "native",
    category: "platform-glue",
    title: "Framework exception module",
    semantics: "Installed-module inventory record from declarations — platform glue, not a capability claim.",
    sourceRef: { kind: "repo-file", locator: { rootAlias: "src", path: "app/code/Foo/etc/module.xml" } },
    evidence: {
      proofLevel: "DETECTED",
      confidence: "high",
      method: "module-declaration-scan",
      uncertainty: ["Declaration-level evidence only; enablement is config state, never runtime proof."],
    },
    lifecycle: { state: "ACTIVE", reviewStatus: "unreviewed" },
    observed: { scannedAt: "2026-11-06T00:00:00.000Z", inputDigests: { "src:app/code/Foo/etc/module.xml": DIGEST } },
    ...overrides,
  };
}

function uiRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    recordType: "ui-component",
    id: "uic:hyva-ui:hero",
    nativeId: "hero/A-default",
    sourcePackage: { kind: "hyva-ui", name: "hyva-themes/hyva-ui", version: "2.8.0", locator: "vendor/hyva/theme" },
    title: "Hero (licensed upstream, metadata only)",
    uxSemantics: { concept: "hero", description: "Hero surface combining media, headline and CTA." },
    availability: { state: "available-upstream" },
    license: { status: "unconfirmed", regime: "commercial", derivedArtifactPolicy: "metadata-only" },
    sourceRef: { kind: "repo-file", locator: { rootAlias: "src", path: "vendor/hyva/theme/Hero.php" } },
    evidence: {
      proofLevel: "DETECTED",
      confidence: "medium",
      method: "theme-declaration-scan",
      uncertainty: ["Metadata-only inventory; licensed template content is never captured."],
    },
    lifecycle: { state: "ACTIVE", reviewStatus: "unreviewed" },
    observed: { scannedAt: "2026-11-06T00:00:00.000Z", inputDigests: { "src:vendor/hyva/theme/Hero.php": DIGEST } },
    ...overrides,
  };
}

function relationRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    recordType: "relation",
    id: "rel:shared:adapted-hero",
    edgeType: "adaptedFrom",
    from: { kb: "KB2", id: "uic:hyva-ui:hero" },
    to: { kb: "KB2", id: "uic:hyva-ui:banner" },
    authority: "probable",
    evidence: {
      proofLevel: "DETECTED",
      sources: [{ kind: "repo-file", locator: { rootAlias: "src", path: "vendor/hyva/theme/Hero.php" } }],
      confidence: "medium",
      uncertainty: ["Endpoint resolution happens at store ingest, not at extract."],
    },
    recordedAt: "2026-11-06T00:00:00.000Z",
    observed: { scannedAt: "2026-11-06T00:00:00.000Z" },
    ...overrides,
  };
}

// ---- kb-source-scan payload double -----------------------------------------------------------
function scanPayload(input, extra = {}) {
  return {
    schemaVersion: 1,
    adapterId: "magento-kb-source",
    scanId: input.scan.scanId,
    kind: input.scan.kind,
    rootAlias: input.scan.rootAlias,
    platform: { id: "magento", version: "2.4.8-p5" },
    capabilities: [],
    uiComponents: [],
    relations: [],
    digests: {},
    scanMetadata: { scannedAt: "2026-11-06T00:00:00.000Z", fileCount: 2, deniedCount: 1, unknownShapes: 0 },
    diagnostics: [],
    counts: { capabilities: 0, modules: 0, uiComponents: 0, relations: 0 },
    ...extra,
  };
}

// Runner double keyed by scanId; each handler returns a payload, or { fail: [...] } to simulate
// an adapter-runtime failure. All seen inputs are recorded for stdin-payload assertions.
function makeRunner(handlers) {
  const calls = [];
  const runner = async (input) => {
    calls.push(input);
    const h = handlers[input.scan.scanId];
    if (!h) return { ok: true, payload: scanPayload(input) };
    const out = h(input);
    if (out && out.fail) return { ok: false, diagnostics: out.fail };
    return { ok: true, payload: out };
  };
  return { runner, calls };
}

function happyHandlers() {
  return {
    "platform-modules": (input) =>
      scanPayload(input, {
        capabilities: [moduleRecord()],
        digests: { "src:app/code/Foo/etc/module.xml": DIGEST },
        counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 },
      }),
    "hyva-ui": (input) =>
      scanPayload(input, {
        uiComponents: [uiRecord()],
        relations: [relationRecord()],
        digests: { "src:vendor/hyva/theme/Hero.php": DIGEST },
        counts: { capabilities: 0, modules: 0, uiComponents: 1, relations: 1 },
      }),
  };
}

// The engine computes file payloads but never touches the disk (the CLI's emit owns writes).
// Tests replay result.files exactly like writeOutFiles does — only on runs that produced files,
// which by construction excludes every blocked/dry-run/report-only case.
function writeFiles(outDir, files) {
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(outDir, f.name)), { recursive: true });
    fs.writeFileSync(path.join(outDir, f.name), f.content, "utf8");
  }
}

// ---- extract manifest (plan) fixture ----------------------------------------------------------
function extractManifest(overrides = {}) {
  const base = {
    schemaVersion: 1,
    extractId: "m4-synthetic",
    platform: { id: "magento", version: "2.4.8-p5" },
    rootAliases: { src: { description: "Synthetic checkout-shaped root for the scanner double." } },
    scans: [
      { scanId: "platform-modules", kind: "magento-platform", rootAlias: "src" },
      { scanId: "hyva-ui", kind: "hyva-ui", rootAlias: "src", subPath: "vendor/hyva" },
    ],
    output: {
      platformRecords: "platform-records.json",
      uiRecords: "ui-records.json",
      relations: "relations.json",
      report: "extract-report.json",
    },
    denyGlobs: ["tests/**"],
    notes: "orchestrator test plan",
  };
  return { ...base, ...overrides };
}

function stagePlan(manifest) {
  const dir = mkTemp("plan");
  return writeJson(path.join(dir, "extract-manifest.json"), manifest);
}

function runExtractPlan(manifestFile, opts = {}) {
  return runExtract({
    manifestPath: manifestFile,
    out: opts.out ?? null,
    roots: opts.roots ?? {},
    env: opts.env ?? {},
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.dryRun ? { dryRun: true } : {}),
    scannedAt: opts.scannedAt ?? FIXED_SCANNED_AT,
    ...(opts.runner ? { runAdapterRunner: opts.runner } : {}),
  });
}

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const runEnvelope = (r) => JSON.parse(r.out).run;
const diagCodes = (result) => result.diagnostics.map((d) => d.code);
const hasDiag = (result, code) => result.diagnostics.some((d) => d.code === code);

export default async function registerM4ExtractSuite(checkAsync) {
  await checkAsync("M4E-01", "extract usage + manifest contract gates: missing/absent manifest → 2; bad kind / traversal output / undeclared alias → 1; nothing written", async () => {
    const noFlag = await runCli(["kb", "extract", "--json"]);
    assert.equal(noFlag.code, 2, "extract without --manifest is usage");
    const missing = await runCli(["kb", "extract", "--manifest", "/definitely/not/a/plan.json", "--json"]);
    assert.equal(missing.code, 2, "absent manifest is usage");
    const outDir = path.join(mkTemp("bad-out"), "out");

    const badKind = stagePlan(extractManifest({ scans: [{ scanId: "x", kind: "secrets-scan", rootAlias: "src" }] }));
    const r1 = await runCli(["kb", "extract", "--manifest", badKind, "--root", `src=${stageSourceRoot()}`, "--out", outDir, "--json"]);
    assert.equal(r1.code, 1, `bad kind must be blocking, got ${r1.code}`);
    assert.ok(runEnvelope(r1).runDiagnostics.some((d) => d.code === "MANIFEST_CONTRACT_VIOLATION"));
    assert.equal(runEnvelope(r1).artifacts.length, 0, "no schema-valid report → no artifact");

    const traversal = stagePlan(extractManifest({ output: { platformRecords: "../escape.json", uiRecords: "ui-records.json", relations: "relations.json", report: "extract-report.json" } }));
    const r2 = await runCli(["kb", "extract", "--manifest", traversal, "--root", `src=${stageSourceRoot()}`, "--json"]);
    assert.equal(r2.code, 1, "traversal output path is schema-rejected");
    assert.ok(runEnvelope(r2).runDiagnostics.some((d) => d.code === "MANIFEST_CONTRACT_VIOLATION"));

    const undeclared = stagePlan(extractManifest({ scans: [{ scanId: "ghost-scan", kind: "magento-platform", rootAlias: "ghost" }] }));
    const r3 = await runCli(["kb", "extract", "--manifest", undeclared, "--root", `src=${stageSourceRoot()}`, "--json"]);
    assert.equal(r3.code, 1, "undeclared scan alias blocks");
    assert.ok(runEnvelope(r3).runDiagnostics.some((d) => d.code === "ROOT_ALIAS_UNDECLARED"));
    // The det receipt convention still persists tool-run.json under --out; nothing else may land.
    assert.deepEqual(fs.readdirSync(outDir), ["tool-run.json"], "blocked runs write only the run receipt, never record outputs");
    return "2 usage + 3 blocking gates, receipt-only writes";
  });

  await checkAsync("M4E-02", "config-file lane: .toolkit/local.json resolves aliases; flag > env > config precedence; missing/relative values fail closed; LOCAL_CONFIG_INVALID on broken config; '~' expansion", async () => {
    const src = stageSourceRoot();
    const cfgDir = mkTemp("cfg");
    fs.mkdirSync(path.join(cfgDir, ".toolkit"));
    writeJson(path.join(cfgDir, ".toolkit", "local.json"), { roots: { src } });

    // Config-only resolution + realpath normalization.
    const viaConfig = resolveRootAliases(["src"], {}, {}, cfgDir);
    assert.deepEqual(viaConfig.diagnostics, [], "valid config lane resolves cleanly");
    assert.equal(viaConfig.roots.src, fs.realpathSync(src));

    // Precedence: flag beats env beats config.
    const flagRoot = stageSourceRoot();
    const envRoot = stageSourceRoot();
    const withFlag = resolveRootAliases(["src"], { src: flagRoot }, { DET_KB_ROOT_SRC: envRoot }, cfgDir);
    assert.equal(withFlag.roots.src, fs.realpathSync(flagRoot), "--root wins over env and config");
    const withEnv = resolveRootAliases(["src"], {}, { DET_KB_ROOT_SRC: envRoot }, cfgDir);
    assert.equal(withEnv.roots.src, fs.realpathSync(envRoot), "env wins over config");

    // Missing file = lane absent (never an error), alias just fails to resolve.
    const emptyDir = mkTemp("empty");
    const absent = resolveRootAliases(["src"], {}, {}, emptyDir);
    assert.ok(absent.diagnostics.some((d) => d.code === "ROOT_ALIAS_NOT_RESOLVED" && d.severity === "error"));

    // Invalid JSON / non-object / non-object roots → LOCAL_CONFIG_INVALID, never content echo.
    const broken = mkTemp("broken");
    fs.mkdirSync(path.join(broken, ".toolkit"));
    fs.writeFileSync(path.join(broken, ".toolkit", "local.json"), "{ not json ");
    const r1 = resolveRootAliases(["src"], {}, {}, broken);
    assert.ok(r1.diagnostics.some((d) => d.code === "LOCAL_CONFIG_INVALID" && d.severity === "error"));
    assert.ok(!r1.diagnostics.some((d) => d.message.includes("not json")), "config content never echoed");
    for (const body of [["array"], "null", 7, { roots: 3 }]) {
      writeJson(path.join(broken, ".toolkit", "local.json"), body);
      const r = resolveRootAliases(["src"], {}, {}, broken);
      assert.ok(r.diagnostics.some((d) => d.code === "LOCAL_CONFIG_INVALID"), `non-shape ${JSON.stringify(body)} is invalid`);
    }
    assert.ok(resolveRootAliases(["src"], {}, {}, broken).diagnostics.every((d) => !d.message.includes("3")), "config values never echoed");

    // Relative config value after '~' expansion is refused (absolute required).
    writeJson(path.join(broken, ".toolkit", "local.json"), { roots: { src: "./relative/place" } });
    const r2 = resolveRootAliases(["src"], {}, {}, broken);
    assert.ok(r2.diagnostics.some((d) => d.code === "ROOT_ALIAS_NOT_RESOLVED" && d.message.includes("absolute")));

    // '~' expansion (prefix only; no fake home dirs are written).
    assert.equal(expandTildePath("~"), os.homedir());
    assert.equal(expandTildePath("~/x/y"), path.join(os.homedir(), "x/y"));
    assert.equal(expandTildePath("/plain/path"), "/plain/path");
    assert.equal(expandTildePath("~user/place"), "~user/place", "only bare '~' expands");
    return "config lane + precedence + fail-closed shapes verified";
  });

  await checkAsync("M4E-03", "config lane flows through the CLI (cwd-injected): invalid config blocks before any scan; valid config resolves the alias end-to-end", async () => {
    const origCwd = process.cwd();
    try {
      const src = stageSourceRoot();
      const bad = mkTemp("cli-bad");
      fs.mkdirSync(path.join(bad, ".toolkit"));
      fs.writeFileSync(path.join(bad, ".toolkit", "local.json"), "{broken");
      const plan = stagePlan(extractManifest());
      process.chdir(bad);
      const rBad = await runCli(["kb", "extract", "--manifest", plan, "--json"]);
      assert.equal(rBad.code, 1);
      const badCodes = runEnvelope(rBad).runDiagnostics.map((d) => d.code);
      assert.ok(badCodes.includes("LOCAL_CONFIG_INVALID"), `expected LOCAL_CONFIG_INVALID, got ${badCodes.join(",")}`);
      assert.ok(!badCodes.includes("ADAPTER_NOT_FOUND"), "blocked before any adapter lookup");

      const good = mkTemp("cli-good");
      fs.mkdirSync(path.join(good, ".toolkit"));
      writeJson(path.join(good, ".toolkit", "local.json"), { roots: { src } });
      process.chdir(good);
      const rGood = await runCli(["kb", "extract", "--manifest", plan, "--json"]);
      assert.equal(rGood.code, 3, "valid config resolves the alias; the run then fails at the (absent) real adapter");
      const goodCodes = runEnvelope(rGood).runDiagnostics.map((d) => d.code);
      assert.ok(goodCodes.includes("ADAPTER_NOT_FOUND"), `expected ADAPTER_NOT_FOUND, got ${goodCodes.join(",")}`);
      assert.ok(!goodCodes.includes("ROOT_ALIAS_NOT_RESOLVED"), "alias resolved by the config lane");
      assert.ok(!goodCodes.includes("LOCAL_CONFIG_INVALID"));
    } finally {
      process.chdir(origCwd);
    }
    return "cwd-scoped local.json honored through the real CLI dispatch";
  });

  await checkAsync("M4E-04", "--out inside (or equal to, or symlinked into) a source root → OUT_PATH_WITHIN_SOURCE_ROOT; nothing written", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest());
    const { runner } = makeRunner(happyHandlers());

    for (const [label, out] of [["subdir of the root", path.join(src, "out")], ["the root itself", src]]) {
      const before = fs.readdirSync(src).sort().join("|");
      const r = await runExtractPlan(plan, { out, roots: { src }, runner });
      assert.equal(r.blocked, true, `out ${label} must block`);
      assert.ok(hasDiag(r, "OUT_PATH_WITHIN_SOURCE_ROOT"), `expected OUT_PATH_WITHIN_SOURCE_ROOT for ${label}`);
      assert.equal(r.files.length, 0);
      assert.equal(fs.readdirSync(src).sort().join("|"), before, "no output directory created inside the source root");
    }

    // Symlink trick: an outside path that resolves INTO the source root is still refused.
    const outer = mkTemp("outer");
    const link = path.join(outer, "link");
    fs.symlinkSync(path.join(src, "app"), link);
    const r = await runExtractPlan(plan, { out: link, roots: { src }, runner });
    assert.equal(r.blocked, true);
    assert.ok(hasDiag(r, "OUT_PATH_WITHIN_SOURCE_ROOT"), "symlinked out resolving inside the root is refused");
    return "3/3 out-inside-root variants refused, zero writes";
  });

  await checkAsync("M4E-05", "CLI with no registered scanner adapter → exit 3 (adapter runtime failure), ADAPTER_NOT_FOUND, nothing written; --dry-run accepted by the kb flag whitelist", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest());
    const out = path.join(mkTemp("m4e05-out"), "out");
    const r = await runCli(["kb", "extract", "--manifest", plan, "--root", `src=${src}`, "--out", out, "--json"]);
    assert.equal(r.code, 3, `adapter-missing must map to exit 3, got ${r.code}`);
    const codes = runEnvelope(r).runDiagnostics.map((d) => d.code);
    assert.ok(codes.includes("ADAPTER_NOT_FOUND"), `expected ADAPTER_NOT_FOUND, got ${codes.join(",")}`);
    assert.deepEqual(fs.readdirSync(out), ["tool-run.json"], "failed extract persists only the run receipt — no record outputs");
    const dry = await runCli(["kb", "extract", "--manifest", plan, "--root", `src=${src}`, "--dry-run", "--json"]);
    assert.equal(dry.code, 3, "--dry-run accepted (adapter failure, not a usage error)");
    assert.equal(runEnvelope(dry).wroteFiles, false);
    return "exit-3 mapping + no-write verified on the real runner seam";
  });

  await checkAsync("M4E-06", "injected runner: non-payload stdout → EXTRACT_SCAN_PAYLOAD_CONTRACT_VIOLATION; adapter-failure diagnostics → adapterFailure; payload answering for the wrong scan → EXTRACT_SCAN_MISMATCH; all blocked, nothing written", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest());
    const out = path.join(mkTemp("m4e06-out"), "out");

    const badPayload = makeRunner({ "platform-modules": () => "not-a-payload" });
    const r1 = await runExtractPlan(plan, { out, roots: { src }, runner: badPayload.runner });
    assert.equal(r1.blocked, true);
    assert.ok(hasDiag(r1, "EXTRACT_SCAN_PAYLOAD_CONTRACT_VIOLATION"));
    assert.equal(r1.files.length, 0);
    assert.ok(!fs.existsSync(out));

    const spawnFail = makeRunner({ "platform-modules": () => ({ fail: [{ code: "ADAPTER_EXIT_NONZERO", severity: "error", message: "adapter exited 1 (stderr omitted from receipts)", subject: { type: "scan", id: "platform-modules" } }] }) });
    const r2 = await runExtractPlan(plan, { out, roots: { src }, runner: spawnFail.runner });
    assert.equal(r2.adapterFailure, true, "adapter runtime failure maps to the exit-3 family");
    assert.equal(r2.blocked, true);
    assert.equal(r2.files.length, 0);

    const mismatch = makeRunner({ "platform-modules": (input) => scanPayload(input, { scanId: "someone-else" }) });
    const r3 = await runExtractPlan(plan, { roots: { src }, runner: mismatch.runner });
    assert.equal(r3.blocked, true);
    assert.ok(hasDiag(r3, "EXTRACT_SCAN_MISMATCH"));
    // The zeroed-scan report still validates against the engine-output envelope (scans non-empty).
    assert.equal(validateContract("kb-engine-output", r3.report).valid, true, "blocked-but-scanned report stays schema-valid");
    return "3/3 payload gates fail closed";
  });

  await checkAsync("M4E-07", "unsafe records refused: schema-invalid record and secret-shaped field both block; diagnostics name id + field PATH only, never values; nothing written", async () => {
    const src = stageSourceRoot();
    const out = path.join(mkTemp("m4e07-out"), "out");
    const noUncertainty = makeRunner({ "platform-modules": (input) => scanPayload(input, { capabilities: [moduleRecord({ evidence: { proofLevel: "DETECTED", confidence: "high", uncertainty: [] } })], digests: { "src:app/code/Foo/etc/module.xml": DIGEST }, counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 } }) });
    const r1 = await runExtractPlan(stagePlan(extractManifest()), { out, roots: { src }, runner: noUncertainty.runner });
    assert.equal(r1.blocked, true, "missing uncertainty fails the kb-capability gate");
    const schemaDiag = r1.diagnostics.find((d) => d.code === "RECORD_SCHEMA_INVALID");
    assert.ok(schemaDiag, "RECORD_SCHEMA_INVALID expected");
    assert.ok(schemaDiag.message.includes("mod:magento-framework:exception"), "diagnostic names the record id");
    assert.equal(r1.files.length, 0);
    assert.ok(!fs.existsSync(out), "refused run wrote nothing");

    const secret = makeRunner({ "platform-modules": (input) => scanPayload(input, { capabilities: [moduleRecord({ notes: `deploy password: '${SECRET_MARKER}'` })], digests: { "src:app/code/Foo/etc/module.xml": DIGEST }, counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 } }) });
    const r2 = await runExtractPlan(stagePlan(extractManifest()), { roots: { src }, runner: secret.runner });
    assert.equal(r2.blocked, true);
    const secretDiag = r2.diagnostics.find((d) => d.code === "SECRET_PATTERN_DETECTED");
    assert.ok(secretDiag, "secret-shaped field must be refused");
    assert.ok(secretDiag.message.includes("notes"), "field PATH named");
    assert.ok(!secretDiag.message.includes(SECRET_MARKER), "field VALUE withheld");
    assert.ok(!JSON.stringify(r2.diagnostics).includes(SECRET_MARKER), "no content leak anywhere in diagnostics");
    return "record safety gate holds at extract time; content withheld";
  });

  await checkAsync("M4E-08", "digest-pin and counts gates: unknown digest key and miscounted payload both block with dedicated codes; nothing written", async () => {
    const src = stageSourceRoot();
    const unknownKey = makeRunner({ "platform-modules": (input) => scanPayload(input, { capabilities: [moduleRecord()], digests: {}, counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 } }) });
    const r1 = await runExtractPlan(stagePlan(extractManifest()), { roots: { src }, runner: unknownKey.runner });
    assert.equal(r1.blocked, true);
    assert.ok(hasDiag(r1, "EXTRACT_DIGEST_KEY_UNKNOWN"), `expected digest-key error, got ${diagCodes(r1).join(",")}`);

    const miscounted = makeRunner({ "platform-modules": (input) => scanPayload(input, { capabilities: [moduleRecord()], digests: { "src:app/code/Foo/etc/module.xml": DIGEST }, counts: { capabilities: 2, modules: 1, uiComponents: 0, relations: 0 } }) });
    const r2 = await runExtractPlan(stagePlan(extractManifest()), { roots: { src }, runner: miscounted.runner });
    assert.equal(r2.blocked, true);
    assert.ok(hasDiag(r2, "EXTRACT_COUNTS_MISMATCH"));
    assert.equal(r2.files.length, 0);
    return "EXTRACT_DIGEST_KEY_UNKNOWN + EXTRACT_COUNTS_MISMATCH enforced";
  });

  await checkAsync("M4E-09", "report-only (no --out) and --dry-run compute everything, write nothing; the report validates against the kb-engine-output extract branch", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest());
    const { runner } = makeRunner(happyHandlers());

    const reportOnly = await runExtractPlan(plan, { roots: { src }, runner });
    assert.equal(reportOnly.blocked, false);
    assert.equal(reportOnly.files.length, 0, "no --out: nothing written");
    assert.equal(reportOnly.records.platform.length, 1);
    assert.equal(reportOnly.records.ui.length, 1);
    assert.equal(reportOnly.records.relations.length, 1);
    assert.deepEqual(reportOnly.report.outputs, { platformRecords: null, uiRecords: null, relations: null, report: null });
    const check = validateContract("kb-engine-output", reportOnly.report);
    assert.ok(check.valid, `report must validate: ${check.errors[0] ?? ""}`);
    assert.equal(reportOnly.reportSchemaValid, true);

    const out = path.join(mkTemp("m4e09-out"), "out");
    const dry = await runExtractPlan(plan, { out, roots: { src }, runner, dryRun: true });
    assert.equal(dry.files.length, 0, "dry-run computes but writes nothing");
    assert.deepEqual(dry.report.outputs, { platformRecords: null, uiRecords: null, relations: null, report: null });
    assert.ok(!fs.existsSync(out), "dry-run never creates the output directory");
    return "report-only + dry-run honest nulls, report schema-valid";
  });

  await checkAsync("M4E-10", "happy-path write via injected runner: 4 files, records kept exactly as emitted and id-sorted, report written + schema-valid, merged denyGlobs + resolved root + platform pinned on the stdin payload, artifact schemaRef honest", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest());
    const out = mkTemp("m4e10-out");
    const { runner, calls } = makeRunner(happyHandlers());
    const r = await runExtractPlan(plan, { out, roots: { src }, runner });
    assert.equal(r.blocked, false);
    assert.deepEqual(diagCodes(r), [], `clean run has no diagnostics, got ${diagCodes(r).join(",")}`);

    const names = r.files.map((f) => f.name).sort();
    assert.deepEqual(names, ["extract-report.json", "platform-records.json", "relations.json", "ui-records.json"]);
    writeFiles(out, r.files);
    const platformContent = fs.readFileSync(path.join(out, "platform-records.json"), "utf8");
    const uiContent = fs.readFileSync(path.join(out, "ui-records.json"), "utf8");
    const relationsContent = fs.readFileSync(path.join(out, "relations.json"), "utf8");
    for (const [content, expected] of [[platformContent, [moduleRecord()]], [uiContent, [uiRecord()]], [relationsContent, [relationRecord()]]]) {
      assert.ok(content.endsWith("\n"), "trailing newline");
      assert.ok(content.startsWith("[\n  {"), "pretty 2-space JSON array");
      assert.deepEqual(JSON.parse(content), expected, "records kept exactly as the adapter emitted them");
    }
    const report = JSON.parse(fs.readFileSync(path.join(out, "extract-report.json"), "utf8"));
    const reportCheck = validateContract("kb-engine-output", report);
    assert.ok(reportCheck.valid, `written report validates: ${reportCheck.errors[0] ?? ""}`);
    assert.deepEqual(report.outputs.platformRecords, { path: "platform-records.json", count: 1 });
    assert.deepEqual(report.outputs.report, { path: "extract-report.json", count: 1 });
    assert.equal(report.scans.length, 2);
    assert.equal(report.scans[0].digestCount, 1);

    // The stdin payload the runner received is the pinned contract shape.
    assert.equal(calls.length, 2, "one out-of-process call per declared scan");
    const [platformCall, uiCall] = calls;
    assert.equal(platformCall.schemaVersion, 1);
    assert.equal(platformCall.platform.id, "magento");
    assert.equal(platformCall.platform.version, "2.4.8-p5");
    assert.equal(platformCall.scan.rootAlias, "src", "alias name carried for digest keys + payload echo");
    assert.equal(platformCall.scan.root, fs.realpathSync(src), "resolved absolute root");
    assert.equal(uiCall.scan.subPath, "vendor/hyva");
    const expectedGlobs = [...BASELINE_DENY_GLOBS, "tests/**"];
    for (const call of calls) assert.deepEqual(call.scan.denyGlobs, expectedGlobs, "baseline + manifest denyGlobs merged");
    assert.equal(r.reportSchemaValid, true, "artifact-eligible report");
    return "happy path deterministic write + pinned stdin payload verified";
  });

  await checkAsync("M4E-11", "merge rules: identical duplicate record collapses (info); conflicting content for one id blocks with EXTRACT_CONFLICTING_RECORD and writes nothing", async () => {
    const src = stageSourceRoot();
    const out = mkTemp("m4e11-out");
    const twoPlatformScans = extractManifest({
      scans: [
        { scanId: "platform-a", kind: "magento-platform", rootAlias: "src" },
        { scanId: "platform-b", kind: "magento-platform", rootAlias: "src", subPath: "app/code" },
      ],
      output: { platformRecords: "platform-records.json", uiRecords: "ui-records.json", relations: "relations.json", report: "extract-report.json" },
    });
    const twinHandlers = (mutate) => ({
      "platform-a": (input) => scanPayload(input, { capabilities: [moduleRecord()], digests: { "src:app/code/Foo/etc/module.xml": DIGEST }, counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 } }),
      "platform-b": (input) => scanPayload(input, { capabilities: [mutate ? moduleRecord({ title: "Conflicting title for the same id" }) : moduleRecord()], digests: { "src:app/code/Foo/etc/module.xml": DIGEST }, counts: { capabilities: 1, modules: 1, uiComponents: 0, relations: 0 } }),
    });

    const twin = makeRunner(twinHandlers(false));
    const r1 = await runExtractPlan(stagePlan(twoPlatformScans), { out, roots: { src }, runner: twin.runner });
    assert.equal(r1.blocked, false);
    assert.equal(r1.records.platform.length, 1, "identical duplicate collapsed");
    assert.ok(r1.diagnostics.some((d) => d.code === "EXTRACT_DUPLICATE_RECORD_COLLAPSED" && d.severity === "info"));
    writeFiles(out, r1.files);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, "platform-records.json"), "utf8")).length, 1);

    const conflicting = makeRunner(twinHandlers(true));
    const r2 = await runExtractPlan(stagePlan(twoPlatformScans), { roots: { src }, runner: conflicting.runner });
    assert.equal(r2.blocked, true);
    assert.ok(hasDiag(r2, "EXTRACT_CONFLICTING_RECORD"));
    assert.equal(r2.files.length, 0, "conflicting content writes nothing");
    assert.ok(!JSON.stringify(r2.diagnostics).includes("Conflicting title"), "conflicting record content withheld from diagnostics");
    return "collapse-with-info + conflict-blocks verified";
  });

  await checkAsync("M4E-12", "null output target honored (relations lane skipped); two identical runs produce byte-identical outputs", async () => {
    const src = stageSourceRoot();
    const plan = stagePlan(extractManifest({ output: { platformRecords: "platform-records.json", uiRecords: "ui-records.json", relations: null, report: "extract-report.json" } }));
    const out = mkTemp("m4e12-out");
    const r = await runExtractPlan(plan, { out, roots: { src }, runner: makeRunner(happyHandlers()).runner });
    assert.equal(r.blocked, false);
    const names = r.files.map((f) => f.name).sort();
    assert.deepEqual(names, ["extract-report.json", "platform-records.json", "ui-records.json"], "null target never written");
    assert.equal(r.report.outputs.relations, null, "report honestly states the skipped artifact");

    // Determinism: same plan, same runner doubles, same caller scannedAt → byte-identical files
    // (even when the resolved roots live in different temp locations — outputs carry alias-
    // relative pointers only, never resolved root paths).
    const outA = mkTemp("m4e12-a");
    const outB = mkTemp("m4e12-b");
    const plan2 = stagePlan(extractManifest());
    const runA = await runExtractPlan(plan2, { out: outA, roots: { src: stageSourceRoot() }, runner: makeRunner(happyHandlers()).runner });
    const runB = await runExtractPlan(plan2, { out: outB, roots: { src: stageSourceRoot() }, runner: makeRunner(happyHandlers()).runner });
    writeFiles(outA, runA.files);
    writeFiles(outB, runB.files);
    for (const f of ["platform-records.json", "ui-records.json", "relations.json", "extract-report.json"]) {
      assert.equal(fs.readFileSync(path.join(outA, f), "utf8"), fs.readFileSync(path.join(outB, f), "utf8"), `${f} must be byte-identical across runs`);
    }
    return "null targets + cross-run byte determinism";
  });
}
