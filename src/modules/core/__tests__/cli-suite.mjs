// Issue #9 CLI + adapter-runtime suite. Registers async checks on the shared run-all runner:
// every det command's exit codes/JSON contract, the out-of-process adapter runtime failure
// paths, determinism across runs, deny-list leakage, and source-resolution precedence.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT as ROOT } from "./repo-root.mjs";
import { main } from "../../../../dist/src/modules/core/cli/main.js";
import {
   runAdapter,
   validateAdapterEntry,
} from "../../../../dist/src/modules/core/adapter-runtime.js";
import { stableContentHash } from "../../../../dist/src/modules/core/canonical.js";

const FIX = path.join(
   path.dirname(new URL(import.meta.url).pathname),
   "fixtures",
);
const MAGENTO_LIKE = path.join(FIX, "synthetic-magento-like");

// One process-wide capture harness for the CLI: deterministic stdout/stderr strings.
async function runCli(args, env = {}) {
   const out = [];
   const err = [];
   const code = await main(
      args,
      { ...env },
      { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) },
   );
   return { code, out: out.join("\n"), err: err.join("\n") };
}

function parseJsonRun(result) {
   return JSON.parse(result.out).run;
}

const SECRET_MARKERS = [
   "MAGENTO_LIKE_FIXTURE_SECRET_MARKER_9f3e1",
   "FIXTURE_AUTH_MARKER_do_not_leak_1c2b3",
   "DENIED_SURFACE_MARKER_never_read_5d4a2",
   "should-never-appear",
   "ESCAPE_SECRET_MARKER_outside_root_77a3",
   "escapeleak",
   "escape_widget",
];

// Normalized projection for cross-commit comparison (timestamps and the containing repo's git
// revision are environment-dependent and excluded).
function normalizeRegistry(r) {
   return {
      platformId: r.platformId,
      platformVersion: r.platformVersion,
      capabilities: r.capabilities.map((c) => ({
         id: c.id,
         appearanceId: c.appearanceId,
         provider: c.provider,
         category: c.category,
         availability: c.availability,
         proofLevel: c.proofLevel,
         editorEditingMode: c.editorEditingMode,
         responsiveDeterministic: c.responsiveDeterministic,
         dataContext: c.dataContext,
      })),
      summary: r.summary,
   };
}

export default async function registerCliSuite(checkAsync) {
   checkAsync(
      "T-15a",
      "det --help exits 0 and names all three commands",
      async () => {
         const r = await runCli(["--help"]);
         assert.equal(r.code, 0, `help exit ${r.code}: ${r.err}`);
         for (const word of [
            "Usage:",
            "validate",
            "inspect",
            "plan",
            "Exit codes",
         ])
            assert.ok(r.out.includes(word), `help must contain '${word}'`);
         return "help rendered";
      },
   );

   checkAsync("T-15b", "det --version prints the package semver", async () => {
      const r = await runCli(["--version"]);
      assert.equal(r.code, 0);
      assert.match(r.out.trim(), /^\d+\.\d+\.\d+$/, "semver expected");
      return r.out.trim();
   });

   checkAsync(
      "T-15c",
      "unknown flag/command and missing value -> usage exit 2",
      async () => {
         assert.equal(
            (await runCli(["frobnicate"])).code,
            2,
            "unknown command",
         );
         assert.equal(
            (await runCli(["validate", "--profile"])).code,
            2,
            "missing flag value",
         );
         assert.equal(
            (await runCli(["validate", "--bogus", "x"])).code,
            2,
            "unknown flag",
         );
         return "3 usage errors -> exit 2";
      },
   );

   checkAsync(
      "T-15d",
      "validate: placeholder profile -> exit 1 PROJECT_SOURCE_NOT_CONFIGURED (CLI parity with T-06a)",
      async () => {
         const r = await runCli([
            "validate",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--json",
         ]);
         assert.equal(r.code, 1);
         const run = parseJsonRun(r);
         assert.ok(
            run.converterDiagnostics.some(
               (d) => d.code === "PROJECT_SOURCE_NOT_CONFIGURED",
            ),
            JSON.stringify(run.converterDiagnostics),
         );
         assert.equal(run.command, "validate");
         assert.equal(run.wroteFiles, false);
         assert.ok(
            run.artifacts.some(
               (a) =>
                  a.role === "profile-input" &&
                  /^[0-9a-f]{64}$/.test(a.contentHash),
            ),
            "profile artifact hashed",
         );
         return "exit 1 + structured diagnostic";
      },
   );

   checkAsync(
      "T-15e",
      "validate: schemaVersion 2 profile -> exit 1 SCHEMA_VERSION_UNSUPPORTED",
      async () => {
         const r = await runCli([
            "validate",
            "--profile",
            path.join(FIX, "negative/profile-schema-version-2.fixture.json"),
            "--json",
         ]);
         assert.equal(r.code, 1);
         const run = parseJsonRun(r);
         assert.ok(
            run.converterDiagnostics.some(
               (d) => d.code === "SCHEMA_VERSION_UNSUPPORTED",
            ),
            JSON.stringify(run.converterDiagnostics),
         );
         assert.ok(
            run.runDiagnostics.some((d) => d.code === "PROFILE_SCHEMA_INVALID"),
         );
         return "unknown major rejected, never best-effort parsed";
      },
   );

   checkAsync(
      "T-15f",
      "validate: mismatched adapter -> exit 1 ADAPTER_NOT_APPLICABLE",
      async () => {
         const r = await runCli([
            "validate",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--adapter",
            "magento-pagebuilder",
            "--json",
         ]);
         assert.equal(r.code, 1);
         const run = parseJsonRun(r);
         assert.ok(
            run.converterDiagnostics.some(
               (d) => d.code === "ADAPTER_NOT_APPLICABLE",
            ),
            JSON.stringify(run.converterDiagnostics),
         );
         return "adapter scope enforced at CLI level";
      },
   );

   checkAsync(
      "T-16a",
      "inspect: magento-like fixture -> exit 0, honest proof levels, no secret leakage",
      async () => {
         const r = await runCli([
            "inspect",
            "--profile",
            path.join(
               FIX,
               "negative/profile-synthetic-magento-like.fixture.json",
            ),
            "--project",
            MAGENTO_LIKE,
            "--json",
         ]);
         assert.equal(
            r.code,
            0,
            `exit ${r.code}: ${r.err || r.out.slice(0, 400)}`,
         );
         const parsed = JSON.parse(r.out);
         const run = parsed.run;
         const registry = parsed.output;
         assert.equal(
            registry.capabilities.length,
            13,
            "13 fixture capabilities (5 native, 6 widget, 2 chrome)",
         );
         assert.equal(
            registry.platformVersion,
            "2.4.8-p5",
            "composer.lock version truth",
         );
         assert.equal(registry.source.sourceId, "magento-like-fixtures");
         // Honest classification: enabled -> registered (config-declaration), disabled -> discovered. Never higher.
         const disabled = registry.capabilities.find(
            (c) => c.availability === "disabled",
         );
         assert.ok(
            disabled && disabled.proofLevel === "discovered",
            "disabled capability stays discovered",
         );
         assert.ok(
            registry.capabilities.every(
               (c) =>
                  !["admin-roundtrip-verified", "visually-verified"].includes(
                     c.proofLevel,
                  ),
            ),
            "no later-stage proof claims",
         );
         // Precision: a module-internal Registry without a UI surface is 'chrome', never a mapping target.
         const emailComponents = registry.capabilities.filter(
            (c) => c.provider === "Example_EmailOnly",
         );
         assert.equal(
            emailComponents.length,
            2,
            "email registry components discovered",
         );
         assert.ok(
            emailComponents.every((c) => c.category === "chrome"),
            "non-UI registry components are chrome (out of CMS-page scope)",
         );
         // Evidence locators: scheme-whitelisted, never absolute paths.
         for (const c of registry.capabilities)
            for (const e of c.evidence)
               assert.ok(
                  /^source:\/\//.test(e.locator),
                  `locator must be source:// got ${e.locator}`,
               );
         // Deny list: planted secrets and the denied content type must never appear.
         for (const marker of SECRET_MARKERS)
            assert.ok(!r.out.includes(marker), `leak: ${marker}`);
         assert.ok(
            registry.diagnostics.some(
               (d) =>
                  d.code === "LOCATOR_OUT_OF_SCOPE" &&
                  d.message.includes("deny-listed"),
            ),
            "env.php/auth.json reported as deny-listed",
         );
         assert.ok(
            registry.diagnostics.some((d) => d.code === "NOT_VERIFIED"),
            "NOT_VERIFIED present in the registry payload (declaration-only probe)",
         );
         assert.ok(
            run.artifacts[0].volatileContentHash,
            "volatile determinism hash present",
         );
         return `13 caps, proof max ${Math.max(...registry.capabilities.map((c) => ["not-verified", "discovered", "registered"].indexOf(c.proofLevel)))}/2`;
      },
   );

   checkAsync(
      "T-16b",
      "inspect: deterministic across runs (volatile hash + evidenceIds stable, matches committed expectation)",
      async () => {
         const args = [
            "inspect",
            "--profile",
            path.join(
               FIX,
               "negative/profile-synthetic-magento-like.fixture.json",
            ),
            "--project",
            MAGENTO_LIKE,
            "--json",
         ];
         const a = await runCli(args);
         const b = await runCli(args);
         const ra = JSON.parse(a.out);
         const rb = JSON.parse(b.out);
         const hashA = ra.run.artifacts[0].volatileContentHash;
         const hashB = rb.run.artifacts[0].volatileContentHash;
         assert.equal(
            hashA,
            hashB,
            "volatileContentHash must be equal across two runs",
         );
         const idsA = ra.output.capabilities
            .flatMap((c) => c.evidence.map((e) => e.evidenceId))
            .sort()
            .join(",");
         const idsB = rb.output.capabilities
            .flatMap((c) => c.evidence.map((e) => e.evidenceId))
            .sort()
            .join(",");
         assert.equal(idsA, idsB, "evidence ids stable across runs");
         // Committed expectation (environment-independent projection).
         const expected = JSON.parse(
            fs.readFileSync(
               path.join(MAGENTO_LIKE, "expected-registry.json"),
               "utf8",
            ),
         );
         assert.deepEqual(
            normalizeRegistry(ra.output),
            normalizeRegistry(expected),
            "adapter output drifts from committed expectation",
         );
         return hashA.slice(0, 16) + "… stable";
      },
   );

   checkAsync(
      "T-16c",
      "inspect: DET_PROJECT_SOURCE env precedence (no --project flag)",
      async () => {
         const r = await runCli(
            [
               "inspect",
               "--profile",
               path.join(
                  FIX,
                  "negative/profile-synthetic-magento-like.fixture.json",
               ),
               "--json",
            ],
            { DET_PROJECT_SOURCE: MAGENTO_LIKE },
         );
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
         assert.equal(JSON.parse(r.out).output.capabilities.length, 13);
         return "env var resolves the source (flag > env > profile)";
      },
   );

   checkAsync(
      "T-16d",
      "inspect: non-Magento profile -> exit 1 ADAPTER_NOT_APPLICABLE, nothing audited",
      async () => {
         // The flatcms profile's placeholder path would fail preflight first (T-15d covers that);
         // point the source at a real directory to reach the adapter-selection layer.
         const r = await runCli([
            "inspect",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--project",
            path.join(FIX, "synthetic-flatcms"),
            "--json",
         ]);
         assert.equal(r.code, 1);
         const run = parseJsonRun(r);
         assert.ok(
            run.converterDiagnostics.some(
               (d) => d.code === "ADAPTER_NOT_APPLICABLE",
            ),
            JSON.stringify(run.converterDiagnostics),
         );
         assert.equal(
            run.artifacts.filter((a) => a.role === "registry").length,
            0,
            "no registry produced",
         );
         return "second-platform profile fails closed";
      },
   );

   checkAsync(
      "T-17a",
      "plan: positive synthetic set -> exit 0, report hash equals committed example; files only with --out",
      async () => {
         const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-plan-out-"));
         const args = [
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(FIX, "synthetic-flatcms/registry.fixture.json"),
            "--bindings",
            path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
            "--input",
            path.join(FIX, "synthetic-flatcms/structure.fixture.json"),
            "--json",
         ];
         const r = await runCli(args);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.out.slice(0, 300)}`);
         const report = JSON.parse(r.out).output;
         assert.equal(report.coverage.total, 5);
         // Determinism: same canonical hash as the committed resolver example (hash excludes generatedAt).
         const committed = JSON.parse(
            fs.readFileSync(
               path.join(
                  ROOT,
                  "resources/examples/converter/resolution-report.synthetic-flatcms.example.json",
               ),
               "utf8",
            ),
         );
         const strip = (x) => JSON.stringify({ ...x, generatedAt: undefined });
         assert.equal(
            strip(report),
            strip(committed),
            "report drifts from committed example",
         );
         // No-write default.
         assert.equal(
            fs.readdirSync(outDir).length,
            0,
            "no --out -> nothing written",
         );
         // Explicit --out writes both artifacts; --dry-run writes nothing even with --out.
         const withOut = await runCli([...args, "--out", outDir]);
         assert.equal(withOut.code, 0);
         assert.ok(
            fs.readdirSync(outDir).includes("resolution-report.json") &&
               fs.readdirSync(outDir).includes("tool-run.json"),
         );
         const dryDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-plan-dry-"));
         const dry = await runCli([...args, "--out", dryDir, "--dry-run"]);
         assert.equal(dry.code, 0);
         assert.equal(
            fs.readdirSync(dryDir).length,
            0,
            "dry-run must write nothing",
         );
         return "report committed-parity + no-write/dry-run honored";
      },
   );

   checkAsync(
      "T-17b",
      "plan: unmapped variant -> exit 1 VARIANT_NOT_MAPPED; revision mismatch -> EVIDENCE_MISSING",
      async () => {
         const r = await runCli([
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(FIX, "synthetic-flatcms/registry.fixture.json"),
            "--bindings",
            path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
            "--input",
            path.join(FIX, "negative/structure-variant-unmapped.fixture.json"),
            "--json",
         ]);
         assert.equal(r.code, 1);
         const report = JSON.parse(r.out).output;
         assert.ok(
            report.diagnostics.some(
               (d) => d.code === "VARIANT_NOT_MAPPED" && d.severity === "error",
            ),
            JSON.stringify(report.diagnostics.map((d) => d.code)),
         );
         // Revision mismatch: re-pin bindings to a stale registry revision.
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-plan-rev-"));
         const bindings = JSON.parse(
            fs.readFileSync(
               path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
               "utf8",
            ),
         );
         bindings.registry.registryRevisionId = "stale-revision-0000";
         const stalePath = path.join(tmp, "bindings-stale.json");
         fs.writeFileSync(stalePath, JSON.stringify(bindings, null, 2) + "\n");
         const r2 = await runCli([
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(FIX, "synthetic-flatcms/registry.fixture.json"),
            "--bindings",
            stalePath,
            "--input",
            path.join(FIX, "synthetic-flatcms/structure.fixture.json"),
            "--json",
         ]);
         assert.equal(r2.code, 1, "stale revision pin must fail");
         const run2 = parseJsonRun(r2);
         assert.ok(
            run2.converterDiagnostics.some(
               (d) => d.code === "EVIDENCE_MISSING",
            ),
            JSON.stringify(run2.converterDiagnostics),
         );
         return "negative plan paths fail closed";
      },
   );

   checkAsync(
      "T-18a",
      "adapter runtime: crash -> ADAPTER_EXIT_NONZERO; hang -> ADAPTER_TIMEOUT; bad stdout -> contract diagnostics",
      async () => {
         const baseDescriptor = {
            schemaVersion: 1,
            id: "fake",
            platformIds: ["fake"],
            outputContract:
               "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json",
            permissions: { readOnly: true },
         };
         const input = {
            schemaVersion: 1,
            profileId: "t",
            platformId: "fake",
            source: { sourceId: "s", path: process.cwd() },
         };
         const crash = await runAdapter(
            process.cwd(),
            {
               ...baseDescriptor,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/crash.mjs",
            },
            input,
         );
         assert.ok(
            !crash.ok &&
               crash.diagnostics.some((d) => d.code === "ADAPTER_EXIT_NONZERO"),
            JSON.stringify(crash.diagnostics),
         );
         const timeout = await runAdapter(
            process.cwd(),
            {
               ...baseDescriptor,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/timeout.mjs",
            },
            input,
            { timeoutMs: 300 },
         );
         assert.ok(
            !timeout.ok &&
               timeout.diagnostics.some((d) => d.code === "ADAPTER_TIMEOUT"),
            JSON.stringify(timeout.diagnostics),
         );
         const bad = await runAdapter(
            process.cwd(),
            {
               ...baseDescriptor,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/badjson.mjs",
            },
            input,
         );
         assert.ok(
            !bad.ok &&
               bad.diagnostics.some(
                  (d) => d.code === "ADAPTER_OUTPUT_INVALID_JSON",
               ),
            JSON.stringify(bad.diagnostics),
         );
         const wrong = await runAdapter(
            process.cwd(),
            {
               ...baseDescriptor,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/wrongcontract.mjs",
            },
            input,
         );
         assert.ok(
            !wrong.ok &&
               wrong.diagnostics.some(
                  (d) => d.code === "ADAPTER_OUTPUT_CONTRACT_VIOLATION",
               ),
            JSON.stringify(wrong.diagnostics),
         );
         return "4 runtime failure paths explicit";
      },
   );

   checkAsync(
      "T-19a",
      "F1: --out writes a truthful receipt (wroteFiles:true readable from disk) and exit stays 0",
      async () => {
         const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-f1-out-"));
         const r = await runCli([
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(FIX, "synthetic-flatcms/registry.fixture.json"),
            "--bindings",
            path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
            "--input",
            path.join(FIX, "synthetic-flatcms/structure.fixture.json"),
            "--out",
            outDir,
            "--json",
         ]);
         assert.equal(r.code, 0, `exit ${r.code}: ${r.err}`);
         const persisted = JSON.parse(
            fs.readFileSync(path.join(outDir, "tool-run.json"), "utf8"),
         );
         assert.equal(
            persisted.wroteFiles,
            true,
            "persisted receipt must say wroteFiles:true when files were written",
         );
         assert.equal(persisted.exitCode, 0);
         const terminal = JSON.parse(r.out).run;
         assert.equal(
            terminal.wroteFiles,
            true,
            "terminal JSON must agree with the persisted receipt",
         );
         assert.deepEqual(fs.readdirSync(outDir).sort(), [
            "resolution-report.json",
            "tool-run.json",
         ]);
         return "persisted receipt == terminal JSON == disk truth";
      },
   );

   checkAsync(
      "T-19b",
      "F1: unwritable --out fails closed (nonzero + OUTPUT_NOT_WRITABLE), terminal JSON carries it",
      async () => {
         const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-f1-bad-"));
         const occupied = path.join(outDir, "occupied"); // a regular FILE where a directory is needed
         fs.writeFileSync(occupied, "not a directory\n");
         const r = await runCli([
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(FIX, "synthetic-flatcms/registry.fixture.json"),
            "--bindings",
            path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
            "--input",
            path.join(FIX, "synthetic-flatcms/structure.fixture.json"),
            "--out",
            occupied,
            "--json",
         ]);
         assert.ok(
            r.code !== 0,
            `unwritable --out must exit nonzero, got ${r.code}`,
         );
         assert.ok(
            r.err.includes("OUTPUT_NOT_WRITABLE"),
            `stderr must name the diagnostic: ${r.err}`,
         );
         const terminal = JSON.parse(r.out).run;
         assert.equal(terminal.exitCode, 1, "terminal envelope exit must be 1");
         assert.ok(
            terminal.runDiagnostics.some(
               (d) =>
                  d.code === "OUTPUT_NOT_WRITABLE" && d.severity === "error",
            ),
            JSON.stringify(terminal.runDiagnostics),
         );
         assert.equal(
            terminal.wroteFiles,
            false,
            "nothing written -> wroteFiles:false everywhere",
         );
         return `exit ${r.code}, diagnostic propagated to JSON`;
      },
   );

   checkAsync(
      "T-20a",
      "F2: symlink escapes are rejected before read (no leak, gateway diagnostic)",
      async () => {
         const r = await runCli([
            "inspect",
            "--profile",
            path.join(
               FIX,
               "negative/profile-synthetic-magento-like.fixture.json",
            ),
            "--project",
            MAGENTO_LIKE,
            "--json",
         ]);
         assert.equal(r.code, 0);
         const parsed = JSON.parse(r.out);
         const reg = parsed.output;
         const gateway = reg.diagnostics.filter((d) =>
            d.message.includes("symlink-escape"),
         );
         assert.ok(
            gateway.length >= 1 &&
               gateway.every((d) => d.severity === "warning"),
            JSON.stringify(gateway),
         );
         assert.ok(
            gateway[0].message.includes("2 candidate path(s)"),
            "both planted escapes counted",
         );
         for (const marker of SECRET_MARKERS)
            assert.ok(!r.out.includes(marker), `leak: ${marker}`);
         const ids = reg.capabilities.map((c) => c.id).join(",");
         assert.ok(
            !ids.includes("escapeleak") && !ids.includes("escape_widget"),
            "no capability from outside the project root",
         );
         return "2 escapes rejected, zero leakage";
      },
   );

   checkAsync(
      "T-20b",
      "F2: explicit exclude honored on scan surfaces; bounded metadata exception documented",
      async () => {
         const descriptor = {
            schemaVersion: 1,
            id: "magento-pagebuilder",
            platformIds: ["magento-pagebuilder"],
            entry: "dist/src/modules/magento/adapters/magento-pagebuilder/inspect.js",
            outputContract:
               "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json",
            permissions: { readOnly: true },
         };
         const input = {
            schemaVersion: 1,
            profileId: "synthetic-magento-like",
            platformId: "magento-pagebuilder",
            source: {
               sourceId: "magento-like-fixtures",
               path: MAGENTO_LIKE,
               scopes: {
                  include: ["app/code/Example"],
                  exclude: ["app/code/Example/EmailOnly"],
               },
            },
         };
         const run = await runAdapter(process.cwd(), descriptor, input);
         assert.ok(
            run.ok,
            `adapter run failed: ${JSON.stringify(run.diagnostics)}`,
         );
         const reg = run.payload;
         assert.ok(
            !reg.capabilities.some((c) => c.provider === "Example_EmailOnly"),
            "explicit exclude must remove the module's scan surfaces from the inventory",
         );
         assert.equal(
            reg.platformVersion,
            "2.4.8-p5",
            "documented metadata exception: composer.lock is version truth regardless of scan scopes",
         );
         return "exclude enforced; metadata exception explicit";
      },
   );

   checkAsync(
      "T-21",
      "F3: cross-project inputs fail closed with INPUT_CONTRACT_MISMATCH",
      async () => {
         // flatcms profile + a registry pinned to the magento-like project: identity must not resolve.
         const r = await runCli([
            "plan",
            "--profile",
            path.join(FIX, "negative/profile-synthetic-flatcms.fixture.json"),
            "--registry",
            path.join(MAGENTO_LIKE, "expected-registry.json"),
            "--bindings",
            path.join(FIX, "synthetic-flatcms/bindings.fixture.json"),
            "--input",
            path.join(FIX, "synthetic-flatcms/structure.fixture.json"),
            "--json",
         ]);
         assert.equal(r.code, 1, `exit ${r.code}`);
         const run = JSON.parse(r.out).run;
         const codes = run.runDiagnostics.map((d) => d.code);
         assert.ok(
            codes.includes("INPUT_CONTRACT_MISMATCH"),
            JSON.stringify(run.runDiagnostics),
         );
         assert.ok(
            run.runDiagnostics.some((d) =>
               d.message.includes(
                  "Registry platform 'magento-pagebuilder' != profile platform 'synthetic-flatcms'",
               ),
            ),
            "registry-vs-profile mismatch named",
         );
         return "project isolation enforced structurally";
      },
   );

   checkAsync(
      "T-22a",
      "F4: descriptor entry traversal rejected (schema pattern + runtime containment)",
      async () => {
         assert.equal(
            validateAdapterEntry(
               process.cwd(),
               "dist/src/modules/magento/adapters/magento-pagebuilder/inspect.js",
            ).ok,
            true,
            "legit entry accepted",
         );
         for (const bad of [
            "tests/../../malicious.js",
            "src/../evil.js",
            "a/b/../../c.js",
            "/abs/path.js",
         ]) {
            const res = validateAdapterEntry(process.cwd(), bad);
            assert.ok(
               !res.ok,
               `entry '${bad}' must be rejected: ${JSON.stringify(res)}`,
            );
         }
         const adapter = await runCli([
            "validate",
            "--profile",
            path.join(
               FIX,
               "negative/profile-synthetic-magento-like.fixture.json",
            ),
            "--adapter",
            "magento-pagebuilder",
            "--json",
         ]);
         assert.equal(
            adapter.code,
            1,
            "placeholder profile still fails preflight (no audit)",
         );
         return "traversal rejected in 3 shapes; legit entry accepted";
      },
   );

   checkAsync(
      "T-22b",
      "F4: stdout flood hits ADAPTER_OUTPUT_OVERFLOW; adapter stderr never enters diagnostics",
      async () => {
         const base = {
            schemaVersion: 1,
            id: "fake",
            platformIds: ["fake"],
            outputContract:
               "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json",
            permissions: { readOnly: true },
         };
         const input = {
            schemaVersion: 1,
            profileId: "t",
            platformId: "fake",
            source: { sourceId: "s", path: process.cwd() },
         };
         const flood = await runAdapter(
            process.cwd(),
            {
               ...base,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/flood.mjs",
            },
            input,
            { maxStdoutBytes: 50_000, timeoutMs: 10_000 },
         );
         assert.ok(
            !flood.ok &&
               flood.diagnostics.some(
                  (d) => d.code === "ADAPTER_OUTPUT_OVERFLOW",
               ),
            JSON.stringify(flood.diagnostics),
         );
         const crash = await runAdapter(
            process.cwd(),
            {
               ...base,
               entry: "src/modules/core/__tests__/fixtures/fake-adapter/crash.mjs",
            },
            input,
         );
         assert.ok(
            !crash.ok &&
               crash.diagnostics.some((d) => d.code === "ADAPTER_EXIT_NONZERO"),
            JSON.stringify(crash.diagnostics),
         );
         assert.ok(
            crash.stderrTail &&
               crash.stderrTail.includes("fake adapter crashed"),
            "stderr tail returned for the TERMINAL",
         );
         const receiptText = JSON.stringify(crash.diagnostics);
         assert.ok(
            !receiptText.includes("fake adapter crashed"),
            "raw adapter stderr must NOT be embedded in machine-readable diagnostics",
         );
         return "overflow bounded; stderr terminal-only";
      },
   );

   checkAsync(
      "T-18b",
      "core/adapters separation + no absolute owner paths anywhere in shipped surfaces",
      async () => {
         const { readdirSync, readFileSync, statSync } = fs;
         const hits = [];
         // The scan mirrors the COMMIT boundary: gitignored local overrides (*.local.*, local/ dirs)
         // are the sanctioned per-run mechanism and may legitimately hold real paths.
         const isLocalOverride = (name) =>
            name.includes(".local.") || name === "local";
         const scanDir = (dir, re, skip = new Set(), skipDts = false) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
               if (skip.has(e.name) || isLocalOverride(e.name)) continue;
               const p = path.join(dir, e.name);
               if (e.isDirectory()) scanDir(p, re, skip, skipDts);
               else if (
                  e.isFile() &&
                  /\.(js|ts|mjs|json|php|xml)$/.test(e.name)
               ) {
                  // [60] .d.ts mirrors TYPE-LEVEL literals (e.g. the design-source `kind` taxonomy)
                  // that the compiler erases from the runtime surface the guard has always scanned.
                  if (skipDts && e.name.endsWith(".d.ts")) continue;
                  const text = readFileSync(p, "utf8");
                  const m = text.match(re);
                  if (m)
                     hits.push(
                        `${p}: ${[...new Set(m)].slice(0, 3).join(",")}`,
                     );
               }
            }
         };
         // Neutral core: no platform literals in compiled core/KB-engine output or the bin shim.
         // ([68] compiled adapters under dist/src/modules/**/adapters/ are platform-owned by
         // design — magento/figma tokens are their purpose — and are guarded at their SOURCE by
         // the owner-path sweep and the theme-source ban below, as before the module move.)
         const neutralTerms =
            /magento|secomm|pagebuilder|hyva|slaunch|\/home\/thanhle|figma/i;
         scanDir(
            path.join(process.cwd(), "dist/src"),
            neutralTerms,
            new Set(["adapters"]),
            true,
         );
         scanDir(path.join(process.cwd(), "bin"), neutralTerms);
         scanDir(
            path.join(process.cwd(), "resources/schemas/cli"),
            neutralTerms,
         );
         // Shipped code and committed data must never embed the owner's machine path.
         const ownerPath = /\/home\/thanhle/;
         // [68] shipped surfaces: src (sources), resources (schemas/examples/profiles/projects/knowledge data), bin (launcher).
         for (const dir of ["src", "resources", "bin"])
            scanDir(path.join(process.cwd(), dir), ownerPath);
         // Adapters must not ship licensed Hyvä source: only thin declaration scanning exists.
         const adapterFiles = [];
         const collect = (d) => {
            for (const e of readdirSync(d, { withFileTypes: true })) {
               const p = path.join(d, e.name);
               if (e.isDirectory()) collect(p);
               else if (/\.(ts|js|json)$/.test(e.name)) adapterFiles.push(p);
            }
         };
         for (const m of ["figma", "magento", "knowledge"])
            collect(path.join(process.cwd(), "src", "modules", m, "adapters"));
         for (const f of adapterFiles) {
            const text = readFileSync(f, "utf8");
            assert.ok(
               !/\.phtml|tailwind\.config|alpine/i.test(
                  text.replace(/alpine\.js/i, ""),
               ),
               `${f} must not embed theme template/CSS/JS sources`,
            );
         }
         assert.deepEqual(
            hits,
            [],
            "neutrality/portability violations:\n" + hits.join("\n"),
         );
         return "core neutral, no owner paths, no licensed source";
      },
   );
}
