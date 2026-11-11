// Issue #28 build suite (coordinator corrections C1/C2): the one-shot `det build --config`
// orchestrator over the SHIPPED commands, the versioned build bundle + per-FILE-BYTE manifest,
// the compose native-content artifact closure, and the fail-closed posture (offline-only,
// usage errors, honest dry run, failed-stage propagation). All checks run fully offline over
// the committed sample project (examples/build) — no MCP, no agent, no network, no defaults.
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../packages/core/dist/src/core/cli/main.js";
import { validateContract } from "../packages/core/dist/src/core/schema-registry.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const EXAMPLE_CONFIG = path.join(ROOT, "examples/build/project.example.json");
const COMMITTED_NATIVE = path.join(ROOT, "examples/converter/compose-output.issue28-home.example.json");

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export default async function registerBuildSuite(checkAsync) {
  let bundleDir = null; // produced once by T32a and reused by later checks

  checkAsync("G28-T32a", "one-shot det build --config: three shipped stages complete offline; bundle + byte-hash manifest verify", async () => {
    bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-build-"));
    const { code, out, err } = await runCli(["build", "--config", EXAMPLE_CONFIG, "--out", bundleDir, "--json"]);
    assert.equal(code, 0, `build exit ${code}: ${err.slice(0, 300)}`);
    const payload = JSON.parse(out);
    assert.equal(payload.run.wroteFiles, true, "build materializes the bundle");
    const manifest = payload.manifest;
    const mCheck = validateContract("build-manifest", manifest);
    assert.ok(mCheck.valid, `manifest must validate its contract: ${mCheck.errors.slice(0, 3).join("; ")}`);
    assert.deepEqual(manifest.stages.map((s) => [s.stage, s.status, s.exitCode]), [
      ["capability-probe", "completed", 0],
      ["extraction", "completed", 0],
      ["composition", "completed", 0],
    ]);
    assert.equal(manifest.kind, "det-build-manifest");
    assert.equal(manifest.platformId, "magento-pagebuilder");
    assert.ok(manifest.source.sourceId.length > 0 && manifest.source.revisionId.length > 0, "bundle carries the pinned source identity");
    // Per-FILE-BYTE hashes: every recorded output verifies against the bytes actually on disk.
    assert.ok(manifest.outputs.length >= 8, `bundle inventories its outputs (${manifest.outputs.length})`);
    for (const o of manifest.outputs) {
      const p = path.join(bundleDir, o.path);
      assert.ok(fs.existsSync(p), `recorded output exists: ${o.path}`);
      assert.equal(sha256File(p), o.sha256, `byte-hash mismatch for ${o.path}`);
      assert.equal(fs.statSync(p).size, o.bytes, `byte-size mismatch for ${o.path}`);
    }
    for (const i of manifest.inputs) assert.match(i.sha256, /^[0-9a-f]{64}$/, "inputs carry byte hashes");
    const gapCodes = manifest.gaps.map((g) => g.code);
    assert.ok(gapCodes.includes("COMPOSITION_GAPS_PRESENT"), "composition gaps recorded honestly");
    assert.ok(gapCodes.includes("PREVIEW_INSTALL_OPERATOR_GATED"), "preview install explicitly operator-gated");
    assert.ok(gapCodes.includes("PREVIEW_ASSETS_NOT_GENERATED"), "asset generation honestly absent");
    // Determinism: the composed native content equals the committed example's content bytes.
    const composed = fs.readFileSync(path.join(bundleDir, "03-composition", "native-content.html"), "utf8");
    const committed = JSON.parse(fs.readFileSync(COMMITTED_NATIVE, "utf8")).content;
    assert.equal(composed, committed, "one-shot build reproduces the committed composition byte-for-byte");
    // The manifest file itself sits in the bundle root and validates from disk.
    const fromDisk = JSON.parse(fs.readFileSync(path.join(bundleDir, "build-manifest.json"), "utf8"));
    assert.equal(validateContract("build-manifest", fromDisk).valid, true, "on-disk manifest validates");
    return `bundle verified: ${manifest.outputs.length} outputs byte-hashed, ${manifest.inputs.length} inputs, stages [${manifest.stages.map((s) => s.status).join(", ")}]`;
  });

  checkAsync("G28-T32b", "compose envelope carries the native-content artifact hashed over exact file bytes (C2 drift closed)", async () => {
    assert.ok(bundleDir, "T32a must have produced the bundle");
    const envelope = JSON.parse(fs.readFileSync(path.join(bundleDir, "03-composition", "tool-run.json"), "utf8"));
    const roles = envelope.artifacts.map((a) => a.role);
    assert.ok(roles.includes("compose-report"), "compose-report role present (run-envelope/schema drift closed)");
    assert.ok(roles.includes("native-content"), "native-content artifact present");
    const nc = envelope.artifacts.find((a) => a.role === "native-content");
    assert.equal(nc.file, "native-content.html");
    const bytes = fs.readFileSync(path.join(bundleDir, "03-composition", "native-content.html"));
    assert.equal(nc.contentHash, crypto.createHash("sha256").update(bytes).digest("hex"), "native-content contentHash is the EXACT file-byte sha256");
    // The closed tool-run contract itself carries the additive roles (schema/source parity).
    const toolRunSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/core/schemas/cli/tool-run.schema.json"), "utf8"));
    const roleEnum = toolRunSchema.properties.artifacts.items.properties.role.enum;
    for (const role of ["compose-report", "native-content", "build-manifest"]) assert.ok(roleEnum.includes(role), `tool-run role enum carries ${role}`);
    const commandEnum = toolRunSchema.properties.command.enum;
    assert.ok(commandEnum.includes("build"), "tool-run command enum carries build");
    return "compose envelope: [adapter-descriptor, compose-report, native-content]; schema enums in parity";
  });

  checkAsync("G28-T32c", "fail-closed: live-source configs, missing config and ambiguous registry inputs are refused", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-build-neg-"));
    // (1) A live design-source mode is not representable in major 1 -> refused before any stage.
    const liveConfig = path.join(tmp, "live.json");
    const base = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, "utf8"));
    fs.writeFileSync(liveConfig, JSON.stringify({ ...base, designSource: { ...base.designSource, mode: "live" } }));
    const r1 = await runCli(["build", "--config", liveConfig, "--out", path.join(tmp, "out1"), "--json"]);
    assert.equal(r1.code, 1, "live-source config must refuse (exit 1)");
    const p1 = JSON.parse(r1.out);
    const codes1 = p1.run.runDiagnostics.map((d) => d.code).join(",");
    assert.ok(codes1.includes("INPUT_SCHEMA_INVALID") || codes1.includes("BUILD_LIVE_SOURCE_UNSUPPORTED"), `fail-closed diagnostic present (${codes1})`);
    assert.ok(!fs.existsSync(path.join(tmp, "out1")), "refused build writes nothing");
    // (2) Missing --config -> usage error.
    const r2 = await runCli(["build", "--json"]);
    assert.equal(r2.code, 2, "missing --config is a usage error");
    // (3) Probe + pre-built registry together -> ambiguous, schema-invalid.
    const ambiguous = path.join(tmp, "ambiguous.json");
    fs.writeFileSync(ambiguous, JSON.stringify({ ...base, registry: "somewhere/registry.json" }));
    const r3 = await runCli(["build", "--config", ambiguous, "--out", path.join(tmp, "out3"), "--json"]);
    assert.equal(r3.code, 1, "probe+registry ambiguity must refuse");
    assert.ok(JSON.parse(r3.out).run.runDiagnostics.some((d) => d.code === "INPUT_SCHEMA_INVALID"));
    // (4) No bundle target at all -> usage error.
    const noOutConfig = path.join(tmp, "noout.json");
    fs.writeFileSync(noOutConfig, JSON.stringify(base));
    const r4 = await runCli(["build", "--config", noOutConfig, "--json"]);
    assert.equal(r4.code, 2, "stdout-only build is not representable -> usage error");
    fs.rmSync(tmp, { recursive: true, force: true });
    return "live-source/ambiguity/stdout-only/missing-config all refused with explicit diagnostics";
  });

  checkAsync("G28-T32d", "truthful dry run: validates + inventories inputs, runs no stage, writes nothing", async () => {
    const dryDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-build-dry-"));
    const { code, out } = await runCli(["build", "--config", EXAMPLE_CONFIG, "--out", dryDir, "--dry-run", "--json"]);
    assert.equal(code, 0);
    const payload = JSON.parse(out);
    assert.equal(payload.run.wroteFiles, false, "dry run writes nothing");
    assert.deepEqual(fs.readdirSync(dryDir), [], "no stage artifacts materialized");
    const manifest = payload.manifest;
    assert.deepEqual(manifest.stages.map((s) => s.status), ["planned", "planned", "planned"], "stages honestly not executed (the sample config probes capabilities)");
    assert.deepEqual(manifest.outputs, [], "no output hashes exist in a dry run");
    assert.ok(manifest.inputs.length >= 5, "declared inputs inventoried with byte hashes");
    assert.ok(manifest.gaps.some((g) => g.code === "MANIFEST_OUTPUTS_PARTIAL_DRY_RUN"), "the dry-run boundary is stated, never papered over");
    assert.equal(validateContract("build-manifest", manifest).valid, true, "even the dry-run manifest validates");
    fs.rmSync(dryDir, { recursive: true, force: true });
    return "dry run: config validated, inputs inventoried, stages planned, zero writes";
  });

  checkAsync("G28-T32e", "failed stages propagate honestly: a bad caller input stops the build with a failed-stage manifest", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-build-bad-"));
    // Paths in a build config resolve relative to the config file itself; a config written
    // outside the repo tree carries absolutized caller inputs (as any external project would).
    const base = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, "utf8"));
    const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, "examples/build", p));
    const configAbsolute = {
      ...base,
      profile: abs(base.profile),
      designSource: { ...base.designSource, project: abs(base.designSource.project) },
      capabilityProbe: { project: abs(base.capabilityProbe.project) },
      bindings: abs(base.bindings),
      content: abs(base.content),
      projection: abs(base.projection),
    };
    const badNode = path.join(tmp, "bad-node.json");
    fs.writeFileSync(badNode, JSON.stringify({ ...configAbsolute, designSource: { ...configAbsolute.designSource, designNode: "999:999" } }));
    const outDir = path.join(tmp, "out");
    const { code, out } = await runCli(["build", "--config", badNode, "--out", outDir, "--json"]);
    assert.notEqual(code, 0, "an unknown selected root must fail the build");
    const payload = JSON.parse(out);
    const manifest = payload.manifest;
    assert.ok(manifest, "the failing build still emits its manifest");
    assert.equal(validateContract("build-manifest", manifest).valid, true, "failing-build manifest validates");
    const extraction = manifest.stages.find((s) => s.stage === "extraction");
    assert.equal(extraction.status, "failed", "the failed stage is recorded as failed");
    assert.equal(manifest.outputs.filter((o) => o.role === "native-content").length, 0, "no native content claimed from a failed build");
    fs.rmSync(tmp, { recursive: true, force: true });
    return "bad root -> failed extraction stage recorded, no composition claimed, manifest still truthful";
  });

  checkAsync("G28-T32f", "neutrality over the new build surfaces", async () => {
    const neutralTerms = /secomm|hyva|slaunch|\/home\/thanhle|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
    const hits = [];
    const scan = (rel, text) => {
      const m = text.match(new RegExp(neutralTerms.source, "gi"));
      if (m) hits.push(`${rel}: ${[...new Set(m)].join(",")}`);
    };
    for (const f of ["build-config.schema.json", "build-manifest.schema.json"]) {
      scan(`schemas/cli/${f}`, fs.readFileSync(path.join(ROOT, "packages/core/schemas/cli", f), "utf8"));
    }
    scan("examples/build/project.example.json", fs.readFileSync(path.join(ROOT, "examples/build/project.example.json"), "utf8"));
    scan("examples/build/README.md", fs.readFileSync(path.join(ROOT, "examples/build/README.md"), "utf8"));
    // The build bundle manifest is a runtime OUTPUT artifact: its input records intentionally
    // carry the caller's resolved local paths (absolute when outside the config tree) — the
    // neutrality invariant governs COMMITTED surfaces, which are scanned above.
    assert.deepEqual(hits, [], "neutrality violations:\n" + hits.join("\n"));
    return "0 matches across the new build surfaces";
  });
}
