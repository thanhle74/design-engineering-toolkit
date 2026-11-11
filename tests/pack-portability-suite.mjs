// [60] npm-pack portability suite: the @det/core workspace package must stay consumable
// OUTSIDE the checkout. npm pack --workspace @det/core produces a tarball whose layout is
// the documented package contract (bin/, dist/, schemas/, adapters/*/descriptor.json — no
// src/, no tests/, no node_modules); extracting it to a foreign directory and running the
// packed CLI must resolve its schema registry from the package root (never the caller's
// cwd), report the real package version (the 0.0.0 fallback would mean the version anchor
// landed on the wrong directory), and resolve the committed #54 example plan offline.
// Closest prior art: REG-07 (foreign-cwd import probe) and REG-09 (committed plan inputs).
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ADAPTER_IDS = [
  "design-source-figma-live",
  "design-source-fixture",
  "magento-kb-source",
  "magento-pagebuilder-compose",
  "magento-pagebuilder",
];

export default async function registerPackPortabilitySuite(checkAsync) {
  let workDir; // shared scratch: pack destination + extraction + plan out (removed in T-60-4)
  const packJson = () => JSON.parse(fs.readFileSync(path.join(workDir, "pack.json"), "utf8"));
  const tarballPath = () => path.join(workDir, packJson()[0].filename);
  const pkgDir = () => path.join(workDir, "package");

  checkAsync("T-60-1", "npm pack --workspace @det/core ships exactly the portable package layout", () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "det60-pack-"));
    const out = execFileSync("npm", ["pack", "--workspace", "@det/core", "--pack-destination", workDir, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(path.join(workDir, "pack.json"), out);
    const manifest = packJson();
    assert.equal(manifest.length, 1, "exactly one tarball");
    assert.equal(manifest[0].name, "@det/core");
    const shipped = new Set(manifest[0].files.map((f) => f.path));
    const mustShip = [
      "package.json",
      "bin/det.js",
      "dist/src/core/cli/main.js",
      "dist/src/core/schema-registry.js",
      "schemas/registry.json",
      ...ADAPTER_IDS.map((id) => `adapters/${id}/descriptor.json`),
    ];
    for (const p of mustShip) assert.ok(shipped.has(p), `tarball must ship ${p}`);
    for (const p of shipped) {
      assert.ok(!p.startsWith("src/"), `tarball must NOT ship compiled-source twin ${p}`);
      assert.ok(!p.includes("node_modules/") && !p.startsWith("tests/"), `tarball must not ship ${p}`);
    }
    return `${shipped.size} files incl. bin + core dist + schemas + ${ADAPTER_IDS.length} descriptors`;
  });

  checkAsync("T-60-2", "packed CLI installs + runs from a foreign cwd: --help exit 0, --version is the package version (no 0.0.0 fallback)", () => {
    execFileSync("tar", ["-xzf", tarballPath()], { cwd: workDir, encoding: "utf8" });
    // The tarball is a plain npm package (no bundled node_modules — that is the point):
    // reproduce the consumer flow by installing its declared runtime deps (ajv) in place.
    execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
      cwd: pkgDir(),
      encoding: "utf8",
      timeout: 180_000,
    });
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det60-cwd-"));
    try {
      const help = execFileSync(process.execPath, [path.join(pkgDir(), "bin", "det.js"), "--help"], {
        cwd: foreign,
        encoding: "utf8",
      });
      assert.ok(help.includes("det"), "packed --help prints usage");
      const version = execFileSync(process.execPath, [path.join(pkgDir(), "bin", "det.js"), "--version"], {
        cwd: foreign,
        encoding: "utf8",
      }).trim();
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir(), "package.json"), "utf8"));
      assert.equal(version, pkg.version, `packed --version must equal the package version (got '${version}')`);
      assert.notEqual(version, "0.0.0", "0.0.0 means the version anchor read failed — REPO_ROOT landed on the wrong dir");
      return `packed CLI --help/--version exit 0, version ${version} from a foreign cwd`;
    } finally {
      fs.rmSync(foreign, { recursive: true, force: true });
    }
  });

  checkAsync("T-60-3", "packed CLI resolves schemas/registry.json from the package root: committed #54 plan inputs resolve offline", () => {
    const outDir = path.join(workDir, "plan-out");
    const plan = execFileSync(
      process.execPath,
      [
        path.join(pkgDir(), "bin", "det.js"),
        "plan",
        "--profile", path.join(ROOT, "profiles/slaunchpad-fashion.example.json"),
        "--registry", path.join(ROOT, "examples/converter/capability-registry.magento-pagebuilder.example.json"),
        "--bindings", path.join(ROOT, "examples/converter/component-binding-map.slaunchpad-fashion.example.json"),
        "--input", path.join(ROOT, "evidence/issue-18/live-read-verified/page-structure.json"),
        "--out", outDir,
        "--json",
      ],
      { cwd: fs.mkdtempSync(path.join(os.tmpdir(), "det60-plan-")), encoding: "utf8" }
    );
    const parsed = JSON.parse(plan.slice(plan.indexOf("{")));
    assert.equal(parsed.run.exitCode, 0, "packed plan exit 0 expected");
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "resolution-report.json"), "utf8"));
    assert.equal(report.sections.length, 12, "all 12 live-derived sections enter the report");
    assert.equal(report.counts.errors, 0, "zero blocking diagnostics");
    return "packed CLI resolved the registry + schemas from the package root (12 sections, 0 errors)";
  });

  checkAsync("T-60-4", "packed CLI fails closed on a missing profile (structured diagnostic, non-zero exit)", () => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det60-neg-"));
    try {
      let code = 0;
      let stdout = "";
      const argv = [
        path.join(pkgDir(), "bin", "det.js"),
        "plan",
        "--profile", path.join(foreign, "no-such-profile.json"),
        "--registry", path.join(ROOT, "examples/converter/capability-registry.magento-pagebuilder.example.json"),
        "--bindings", path.join(ROOT, "examples/converter/component-binding-map.slaunchpad-fashion.example.json"),
        "--input", path.join(ROOT, "evidence/issue-18/live-read-verified/page-structure.json"),
        "--json",
      ];
      try {
        execFileSync(process.execPath, argv, { cwd: foreign, encoding: "utf8" });
      } catch (e) {
        code = e.status ?? 1;
        stdout = String(e.stdout || "");
      }
      assert.notEqual(code, 0, "missing profile must exit non-zero");
      const envelope = JSON.parse(stdout.slice(stdout.indexOf("{"))).run;
      assert.ok(
        envelope.runDiagnostics.some((d) => d.severity === "error"),
        `a structured error diagnostic is reported: ${JSON.stringify(envelope.runDiagnostics)}`
      );
      return `exit ${code} with a structured error diagnostic (CLI contract: JSON on stdout, stderr silent)`;
    } finally {
      fs.rmSync(foreign, { recursive: true, force: true });
      fs.rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });
}
