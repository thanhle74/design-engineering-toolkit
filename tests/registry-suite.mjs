// Issue #41 registry suite: schemas/registry.json is the single source of truth for contract
// aliases. Every alias must resolve to a package-relative local schema file whose OWN $id is
// byte-for-byte identical to the historical Ajv key / serialized schemaRef (no URI migration),
// the run-envelope role refs must stay byte-for-byte (including the documented '#native-content'
// fragment and the G1 harness pseudo-ref), and the shipped adapter descriptors must reference
// only registered contract $ids. Any missing or mismatched alias/path/$id fails loudly here —
// and at CLI startup via assertSchemasLoad.
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAjv, contractId, contractAliases, REPO_ROOT } from "../dist/src/core/schema-registry.js";
import { schemaRefFor } from "../dist/src/core/run-envelope.js";
import { validateRegistry } from "../dist/src/core/semantic.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "registry.json"), "utf8"));

// Golden compatibility pin (issue #41): these alias -> $id pairs ARE the byte-for-byte
// contract. A drift in any alias, path or $id fails this suite loudly — the $id URLs are
// Ajv registry keys and serialized schemaRefs, deliberately not migrated in this task.
const GOLDEN_IDS = {
  "capability-registry": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json",
  "component-binding-map": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/component-binding-map.schema.json",
  "converter-profile": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/converter-profile.schema.json",
  "resolution-report": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/resolution-report.schema.json",
  "adapter-descriptor": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/adapter-descriptor.schema.json",
  "adapter-input": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/adapter-input.schema.json",
  "tool-run": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/tool-run.schema.json",
  "node-ir": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/node-ir.schema.json",
  "page-structure": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/page-structure.schema.json",
  "source-review": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/source-review.schema.json",
  "design-source-snapshot": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/design-source-snapshot.schema.json",
  "content-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/content-manifest.schema.json",
  "compose-input": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/compose-input.schema.json",
  "compose-output": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/compose-output.schema.json",
  "semantic-projection": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/semantic-projection.schema.json",
  "build-config": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/build-config.schema.json",
  "build-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/build-manifest.schema.json",
  "kb-capability": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-capability.schema.json",
  "kb-ui-component": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ui-component.schema.json",
  "kb-project-record": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-project-record.schema.json",
  "kb-relations": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-relations.schema.json",
  "kb-ingest-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ingest-manifest.schema.json",
  "kb-extract-manifest": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-extract-manifest.schema.json",
  "kb-source-scan": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-source-scan.schema.json",
  "kb-source-scan-request": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-source-scan-request.schema.json",
  "kb-store": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-store.schema.json",
  "kb-engine-output": "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json",
};

// Golden artifact-role -> contract alias map (run-envelope.ts ROLE_CONTRACT must mirror this).
const GOLDEN_ROLE_ALIAS = {
  registry: "capability-registry",
  "resolution-report": "resolution-report",
  "profile-input": "converter-profile",
  "binding-map": "component-binding-map",
  "adapter-descriptor": "adapter-descriptor",
  "node-ir": "node-ir",
  "page-structure": "page-structure",
  "source-review": "source-review",
  "kb-ingest-manifest": "kb-ingest-manifest",
  "kb-records": "kb-engine-output",
  "kb-query-result": "kb-engine-output",
  "kb-sync-report": "kb-engine-output",
  "kb-store-descriptor": "kb-store",
  "compose-report": "compose-output",
  "native-content": "compose-output",
  "build-manifest": "build-manifest",
};

// G1 harness pseudo-ref (docs/converter/CONTRACTS.md §4): not a materialized schema file;
// kept byte-for-byte as the one envelope identifier outside the registry.
const HARNESS_REF =
  "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/CONTRACTS-harness-shape";

export default async function registerRegistrySuite(checkAsync) {
  checkAsync("REG-01", "schemas/registry.json is well-formed: version 1, package-relative alias paths that exist on disk", async () => {
    assert.equal(registry.version, 1, "registry version is 1");
    const aliases = registry.aliases;
    assert.ok(aliases && typeof aliases === "object", "registry declares an aliases map");
    const names = Object.keys(aliases);
    assert.ok(names.length >= 24, `registry declares ${names.length} aliases (expected the 24 contract families)`);
    assert.deepEqual(Object.keys(GOLDEN_IDS).sort(), names.sort(), "registry aliases match the golden alias set");
    for (const [alias, rel] of Object.entries(aliases)) {
      assert.equal(typeof rel, "string", `alias '${alias}' maps to a string path`);
      assert.match(rel, /^schemas\/[A-Za-z0-9._/-]+\.schema\.json$/, `alias '${alias}' path is package-relative under schemas/ and ends in .schema.json: ${rel}`);
      assert.ok(!rel.includes(".."), `alias '${alias}' path must not traverse up: ${rel}`);
      assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `alias '${alias}' file exists on disk (package-relative): ${rel}`);
    }
    return `${names.length} aliases, all package-relative + present`;
  });

  checkAsync("REG-02", "contractId resolves alias -> path -> the schema file's OWN $id (byte-for-byte identity)", async () => {
    for (const [alias, rel] of Object.entries(registry.aliases)) {
      const fileId = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"))["$id"];
      assert.equal(typeof fileId, "string", `alias '${alias}' -> ${rel} declares a string $id`);
      assert.ok(fileId.length > 0, `alias '${alias}' -> ${rel} declares a non-empty $id`);
      assert.equal(contractId(alias), fileId, `alias '${alias}' resolves to the file's own $id, not a second copy`);
    }
    assert.deepEqual(contractAliases().sort(), Object.keys(registry.aliases).sort(), "loader exposes exactly the registry aliases");
    return `${Object.keys(registry.aliases).length} aliases resolve to their files' own $id`;
  });

  checkAsync("REG-03", "golden pin: every alias keeps its exact historical $id — no URI migration", async () => {
    const resolved = Object.fromEntries(Object.keys(GOLDEN_IDS).map((a) => [a, contractId(a)]));
    assert.deepEqual(resolved, GOLDEN_IDS);
    return `${Object.keys(GOLDEN_IDS).length} $ids byte-for-byte`;
  });

  checkAsync("REG-04", "every contract $id is registered in the shared Ajv instance", async () => {
    const ajv = getAjv();
    let n = 0;
    for (const [alias, id] of Object.entries(GOLDEN_IDS)) {
      assert.ok(ajv.getSchema(id), `Ajv has the schema registered for '${alias}' (${id})`);
      n++;
    }
    assert.equal(REPO_ROOT, ROOT, "REPO_ROOT resolves to the checkout root ([63] single-application layout: schemas/ is a root dir, adapters live under src/modules/**/adapters/)");
    return `${n} $ids registered in Ajv`;
  });

  checkAsync("REG-05", "run-envelope schemaRefs stay byte-for-byte: roles map to registry contracts, native-content keeps its documented fragment, harness pseudo-ref unchanged", async () => {
    for (const [role, alias] of Object.entries(GOLDEN_ROLE_ALIAS)) {
      const expected = role === "native-content" ? `${GOLDEN_IDS[alias]}#native-content` : GOLDEN_IDS[alias];
      assert.equal(schemaRefFor(role), expected, `role '${role}' schemaRef stays byte-for-byte`);
    }
    assert.equal(schemaRefFor("structure-input"), HARNESS_REF, "structure-input keeps the G1 harness pseudo-ref byte-for-byte");
    assert.equal(schemaRefFor("native-content"), `${GOLDEN_IDS["compose-output"]}#native-content`, "native-content keeps the documented '#native-content' fragment suffix");
    return "17 artifact roles byte-for-byte (incl. fragment + harness pseudo-ref)";
  });

  checkAsync("REG-06", "shipped adapter descriptors reference only registered contract $ids", async () => {
    const ids = new Set(Object.values(GOLDEN_IDS));
    // [68] adapters are owned by their feature module: src/modules/**/adapters/<id>/descriptor.json.
    const skip = new Set(["__tests__", "__fixtures__", "node_modules", "dist"]);
    const descriptorFiles = [];
    const collectAdapters = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory() || skip.has(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.name === "adapters") {
          for (const a of fs.readdirSync(p, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
            if (a.isDirectory() && fs.existsSync(path.join(p, a.name, "descriptor.json"))) descriptorFiles.push(path.join(p, a.name, "descriptor.json"));
          }
          continue;
        }
        collectAdapters(p);
      }
    };
    collectAdapters(path.join(ROOT, "src", "modules"));
    assert.ok(descriptorFiles.length >= 3, `found ${descriptorFiles.length} adapter descriptors`);
    for (const p of descriptorFiles) {
      const rel = path.relative(ROOT, p);
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const key of ["inputContract", "outputContract"]) {
        assert.ok(ids.has(d[key]), `${rel} ${key} must be a registered contract $id, got ${d[key]}`);
      }
    }
    return `${descriptorFiles.length} descriptors checked against ${ids.size} registered $ids`;
  });

  checkAsync("REG-07", "registry resolves from the install/package root, not the process cwd", async () => {
    const modPath = path.join(ROOT, "dist", "src", "core", "schema-registry.js");
    const probe = `import { pathToFileURL } from "node:url";
const { contractId } = await import(pathToFileURL(${JSON.stringify(modPath)}));
process.stdout.write(contractId("build-manifest"));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: fs.mkdtempSync(path.join(os.tmpdir(), "det-cwd-")),
      encoding: "utf8",
    });
    assert.equal(out, GOLDEN_IDS["build-manifest"], "contractId resolves from a foreign cwd via the package root");
    return "resolves from a foreign cwd (install-root anchored)";
  });

  checkAsync("REG-08", "fail loud: unknown alias and unregistered $id are refused with precise registry errors", async () => {
    assert.throws(() => contractId("no-such-alias"), /Unknown contract alias 'no-such-alias' \(schemas\/registry\.json\)/);
    assert.throws(() => schemaRefFor("no-such-role"), /Unknown contract alias/);
    return "missing alias fails loudly at resolution";
  });

  // Issue #54 evidence gate: the shipped example registry must stay contract-valid (every
  // 'registered' entry carries config-declaration evidence from the platform's registration
  // surface; theme chrome honestly demoted to 'discovered') AND the exact committed plan inputs
  // must resolve the revision-pinned live-derived #18 PageStructure offline — coverage honestly
  // zero (no proven bindings), zero errors. Re-breaking the example registry fails CI loudly.
  checkAsync("REG-09", "example capability registry is evidence-valid and resolves the live-derived #18 PageStructure (coverage honestly 0)", async () => {
    const regPath = path.join(ROOT, "examples/converter/capability-registry.magento-pagebuilder.example.json");
    const registryJson = JSON.parse(fs.readFileSync(regPath, "utf8"));
    const verdict = validateRegistry(registryJson);
    assert.equal(verdict.valid, true, "example registry must pass validateRegistry: " + JSON.stringify(verdict.diagnostics.filter((d) => d.severity === "error").slice(0, 3)));
    assert.equal(verdict.diagnostics.filter((d) => d.severity === "error").length, 0, "zero error diagnostics expected");
    const registered = registryJson.capabilities.filter((c) => c.proofLevel === "registered");
    assert.equal(registered.length, 55, "55 native/widget entries stay registered on config-declaration evidence");
    assert.ok(registered.every((c) => c.evidence.some((e) => e.kind === "config-declaration")), "every registered entry carries config-declaration evidence");
    const chrome = registryJson.capabilities.filter((c) => c.category === "chrome");
    assert.ok(chrome.length > 0 && chrome.every((c) => c.proofLevel === "discovered"), "theme chrome stays honestly demoted to discovered");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-54-plan-"));
    const plan = execFileSync(
      process.execPath,
      [
        "bin/det.js",
        "plan",
        "--profile", path.join(ROOT, "profiles/slaunchpad-fashion.example.json"),
        "--registry", regPath,
        "--bindings", path.join(ROOT, "examples/converter/component-binding-map.slaunchpad-fashion.example.json"),
        "--input", path.join(ROOT, "evidence/issue-18/live-read-verified/page-structure.json"),
        "--out", outDir,
        "--json",
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const parsed = JSON.parse(plan.slice(plan.indexOf("{")));
    assert.equal(parsed.run.exitCode, 0, "plan exit 0 expected");
    assert.equal(parsed.run.converterDiagnostics.length, 0, "no converter diagnostics expected");
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "resolution-report.json"), "utf8"));
    assert.equal(report.sections.length, 12, "all 12 live-derived sections enter the report");
    assert.equal(report.coverage.total, 0, "coverage stays honestly 0 — no proven capability bindings exist");
    assert.equal(report.counts.errors, 0, "zero blocking diagnostics in the report");
    assert.ok(report.sections.every((s) => s.status === "unmapped"), "every section honestly reports unmapped");
    assert.equal(report.inputs.registryRevisionId, "66aff1ebd4cda9152a5e70635766b8030b10ff88", "report pins the registry revision");
    return "registry evidence-valid; live-derived plan resolves: 12 sections, coverage 0, 0 errors";
  });
}
