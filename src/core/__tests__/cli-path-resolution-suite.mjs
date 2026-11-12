// [63] CLI foreign-cwd / root path-resolution suite. This is the [60] packed-package
// portability contract migrated to the single-application layout: there is no @det/core
// workspace package and no `npm pack --workspace` artifact anymore (issue #63 supersedes
// the #60 workspace layout; a distributable root CLI package is NOT a supported artifact
// and is deliberately not claimed). What must stay portable INSIDE the checkout is the
// committed `node <root>/bin/det.js` entrypoint: invoked from a foreign cwd it resolves
// its schema registry (resources/schemas/), adapter descriptors (src/modules/**/adapters/ + dist entries) and
// version from the REPOSITORY ROOT — never from the caller's cwd — and it fails closed
// with structured diagnostics on bad input. Closest prior art: REG-07 (foreign-cwd
// import probe), [60] foreign-cwd CLI checks, REG-09 (committed plan inputs).
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { REPO_ROOT as ROOT } from "./repo-root.mjs";
const DET_CLI = path.join(ROOT, "bin", "det.js");

export default async function registerCliPathResolutionSuite(checkAsync) {
  checkAsync("T-63-1", "root CLI runs from a foreign cwd: --help exit 0, --version is the root package version (no 0.0.0 fallback)", () => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det63-cwd-"));
    try {
      const help = execFileSync(process.execPath, [DET_CLI, "--help"], { cwd: foreign, encoding: "utf8" });
      assert.ok(help.includes("det"), "foreign-cwd --help prints usage");
      const version = execFileSync(process.execPath, [DET_CLI, "--version"], {
        cwd: foreign,
        encoding: "utf8",
      }).trim();
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      assert.equal(version, pkg.version, `--version must equal the root package version (got '${version}')`);
      assert.notEqual(version, "0.0.0", "0.0.0 means the version anchor read failed — REPO_ROOT landed on the wrong dir");
      return `foreign-cwd --help/--version exit 0, version ${version} anchored to the checkout root`;
    } finally {
      fs.rmSync(foreign, { recursive: true, force: true });
    }
  });

  checkAsync("T-63-2", "root CLI resolves resources/schemas/registry.json + adapters from the checkout root from a foreign cwd: committed #54 plan inputs resolve offline", () => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det63-plan-"));
    const outDir = path.join(foreign, "plan-out");
    const plan = execFileSync(
      process.execPath,
      [
        DET_CLI,
        "plan",
        "--profile", path.join(ROOT, "resources/profiles/slaunchpad-fashion.example.json"),
        "--registry", path.join(ROOT, "resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json"),
        "--bindings", path.join(ROOT, "resources/knowledge/magento/pagebuilder/component-binding-map.slaunchpad-fashion.example.json"),
        "--input", path.join(ROOT, "docs/evidence/issue-18/live-read-verified/page-structure.json"),
        "--out", outDir,
        "--json",
      ],
      { cwd: foreign, encoding: "utf8" }
    );
    const parsed = JSON.parse(plan.slice(plan.indexOf("{")));
    assert.equal(parsed.run.exitCode, 0, "foreign-cwd plan exit 0 expected");
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "resolution-report.json"), "utf8"));
    assert.equal(report.sections.length, 12, "all 12 live-derived sections enter the report");
    assert.equal(report.counts.errors, 0, "zero blocking diagnostics");
    return "root CLI resolved the registry + schemas from the checkout root (12 sections, 0 errors)";
  });

  checkAsync("T-63-3", "root CLI loads src/modules/**/adapters/<id>/descriptor.json + their dist entries from the checkout root from a foreign cwd", () => {
    // Static half: the five committed adapters are owned by their feature modules under
    // src/modules/**/adapters/<id>/ ([68]) and every declared entry compiles to <root>/dist/...
    // and resolves against the checkout root (the [60] portability contract, now asserted in
    // place — [63] kept descriptors+dist byte-preserved, [68] moved them under src/modules).
    const skip = new Set(["__tests__", "__fixtures__", "node_modules", "dist"]);
    const found = [];
    const walkModules = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory() || skip.has(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.name === "adapters") {
          for (const a of fs.readdirSync(p, { withFileTypes: true })) {
            if (a.isDirectory() && fs.existsSync(path.join(p, a.name, "descriptor.json"))) found.push({ id: a.name, file: path.join(p, a.name, "descriptor.json") });
          }
          continue;
        }
        walkModules(p);
      }
    };
    walkModules(path.join(ROOT, "src", "modules"));
    found.sort((x, y) => x.id.localeCompare(y.id));
    assert.equal(found.length, 5, `five committed adapters: ${found.map((f) => f.id).join(",")}`);
    for (const { id, file } of found) {
      const desc = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(
        fs.existsSync(path.join(ROOT, desc.entry)),
        `${id} entry ${desc.entry} resolves against the checkout root`
      );
    }
    // Runtime half: from a foreign cwd, inspect discovers the descriptors at <root>/adapters,
    // spawns the magento-pagebuilder adapter via its root-relative entry, and exits 0.
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det63-inspect-"));
    const outDir = path.join(foreign, "inspect-out");
    const inspect = execFileSync(
      process.execPath,
      [
        DET_CLI,
        "inspect",
        "--profile", path.join(ROOT, "src/core/__tests__/fixtures/negative/profile-synthetic-magento-like.fixture.json"),
        "--project", path.join(ROOT, "src/core/__tests__/fixtures/synthetic-magento-like"),
        "--out", outDir,
        "--json",
      ],
      { cwd: foreign, encoding: "utf8" }
    );
    const parsed = JSON.parse(inspect.slice(inspect.indexOf("{")));
    assert.equal(parsed.run.exitCode, 0, "foreign-cwd inspect exit 0 expected");
    const toolRun = JSON.parse(fs.readFileSync(path.join(outDir, "tool-run.json"), "utf8"));
    assert.equal(
      toolRun.adapter?.id,
      "magento-pagebuilder",
      `the descriptor-declared adapter ran out-of-process: ${JSON.stringify(toolRun.adapter)}`
    );
    const registry = JSON.parse(fs.readFileSync(path.join(outDir, "capability-registry.json"), "utf8"));
    assert.ok(Array.isArray(registry.capabilities) && registry.capabilities.length > 0, "registry audited capabilities");
    return `5 descriptors + entries resolved against the checkout root; inspect ran magento-pagebuilder (${registry.capabilities.length} capabilities) from a foreign cwd`;
  });

  checkAsync("T-63-4", "root CLI fails closed from a foreign cwd on a missing profile (structured diagnostic, non-zero exit)", () => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "det63-neg-"));
    try {
      let code = 0;
      let stdout = "";
      const argv = [
        DET_CLI,
        "plan",
        "--profile", path.join(foreign, "no-such-profile.json"),
        "--registry", path.join(ROOT, "resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json"),
        "--bindings", path.join(ROOT, "resources/knowledge/magento/pagebuilder/component-binding-map.slaunchpad-fashion.example.json"),
        "--input", path.join(ROOT, "docs/evidence/issue-18/live-read-verified/page-structure.json"),
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
    }
  });
}
