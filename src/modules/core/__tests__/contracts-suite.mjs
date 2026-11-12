// Core contract suite ([68] module-owned: the checks that lived inline in the pre-#68 root
// tests/run-all.mjs harness). Runs the 14-case negative/semantic test plan from
// docs/converter + docs/specs/ISSUE-5-converter-architecture.md §7: schema validation (positive +
// negative), semantic checks, determinism, neutrality guard, and the two-family portability
// check. Issue #9 note preserved: the production core graduated from test libs to src/modules/core
// (TypeScript, compiled to dist/) and this suite tests the real production modules.
// NOTE: checks register through the shared harness (scripts/run-contract-tests.mjs); the
// bodies are synchronous — the harness awaits them like any other check.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import {
   canonicalStringify,
   contentHash,
   sha256Hex,
} from "../../../../dist/src/modules/core/canonical.js";
import {
   resolveProjectSource,
   checkAdapterApplicable,
} from "../../../../dist/src/modules/core/preflight.js";
import {
   validateBindingMap,
   resolveStructure,
   canonicalReportHash,
} from "../../../../dist/src/modules/core/resolver.js";
import { validateRegistry } from "../../../../dist/src/modules/core/semantic.js";
import { REPO_ROOT as ROOT } from "./repo-root.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const assert = (cond, msg) => {
   if (!cond) throw new Error(msg || "assertion failed");
};

export default async function registerContractsSuite(checkAsync) {
   // ---- Ajv instance with the whole converter family + V1 family loaded -------------------
   const ajv = new Ajv({
      strict: true,
      allErrors: true,
      allowUnionTypes: true,
   });
   // Both schema families declare "format": "date-time"; register a strict-enough checker
   // (ajv core has no built-in formats without ajv-formats, which we deliberately do not add).
   ajv.addFormat(
      "date-time",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
   );
   const SCHEMA_DIRS = [
      path.join(ROOT, "resources", "schemas", "converter"),
      path.join(ROOT, "resources", "schemas"),
   ];
   const schemaFiles = SCHEMA_DIRS.flatMap((dir) =>
      readdirSync(dir)
         .filter((f) => f.endsWith(".schema.json") || f === "common.defs.json")
         .map((f) => path.join(dir, f)),
   );
   // Each schema carries its own absolute $id, so relative refs inside the converter family
   // (common.defs.json#/$defs/...) resolve against those ids once every file is registered.
   for (const f of schemaFiles) ajv.addSchema(load(f));
   const compile = (basename) =>
      ajv.getSchema(
         `https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/${basename}`,
      ) ??
      ajv.compile(
         load(path.join(ROOT, "resources", "schemas", "converter", basename)),
      );
   const v1Compile = (basename) =>
      ajv.getSchema(
         `https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/${basename}`,
      ) ?? ajv.compile(load(path.join(ROOT, "resources", "schemas", basename)));

   const registry = load(`${FIX}/synthetic-flatcms/registry.fixture.json`);
   const bindings = load(`${FIX}/synthetic-flatcms/bindings.fixture.json`);
   const structure = load(`${FIX}/synthetic-flatcms/structure.fixture.json`);
   const magentoRegistry = load(
      path.join(
         ROOT,
         "resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json",
      ),
   );
   const syntheticProfile = load(
      `${FIX}/negative/profile-synthetic-flatcms.fixture.json`,
   );

   // ---- T-07 / T-10: schema validation ----------------------------------------------------
   checkAsync(
      "T-10a",
      "synthetic registry validates against capability-registry schema",
      () => {
         const v = compile("capability-registry.schema.json");
         const ok = v(registry);
         assert(
            ok,
            "fixture registry must validate: " + JSON.stringify(v.errors),
         );
         return `${registry.capabilities.length} capabilities, 5 categories`;
      },
   );
   checkAsync(
      "T-10b",
      "corrupted registry twin fails schema with precise paths",
      () => {
         const v = compile("capability-registry.schema.json");
         const ok = v(load(`${FIX}/negative/registry-corrupted.fixture.json`));
         assert(!ok, "corrupted twin must fail");
         const text = JSON.stringify(v.errors);
         assert(
            text.includes("appearanceId") && text.includes("evidence"),
            "errors must name appearanceId and evidence: " + text,
         );
         return `${v.errors.length} ajv errors incl. appearanceId/evidence`;
      },
   );
   for (const [file, label] of [
      ["registry-schema-version-2.fixture.json", "schemaVersion: 2 rejected"],
      [
         "registry-schema-version-missing.fixture.json",
         "missing schemaVersion rejected",
      ],
      [
         "registry-schema-version-string.fixture.json",
         "string schemaVersion rejected",
      ],
   ]) {
      checkAsync("T-07", label, () => {
         const v = compile("capability-registry.schema.json");
         assert(!v(load(`${FIX}/negative/${file}`)), `${file} must fail ajv`);
         return file;
      });
   }
   checkAsync(
      "POS-a",
      "Magento example registry validates (real-payload sample)",
      () => {
         const v = compile("capability-registry.schema.json");
         const ok = v(magentoRegistry);
         assert(
            ok,
            "magento example must validate: " +
               JSON.stringify(v.errors?.slice(0, 5)),
         );
         return `${magentoRegistry.capabilities.length} capabilities`;
      },
   );
   checkAsync("POS-b", "synthetic binding map validates", () => {
      const v = compile("component-binding-map.schema.json");
      const ok = v(bindings);
      assert(
         ok,
         "bindings fixture must validate: " +
            JSON.stringify(v.errors?.slice(0, 5)),
      );
      return `${bindings.bindings.length} bindings`;
   });
   checkAsync(
      "POS-c",
      "converter profile (synthetic, placeholder path) validates",
      () => {
         const v = compile("converter-profile.schema.json");
         const ok = v(syntheticProfile);
         assert(
            ok,
            "profile fixture must validate: " +
               JSON.stringify(v.errors?.slice(0, 5)),
         );
         return "placeholder path accepted by schema; preflight gates it (T-06)";
      },
   );

   // ---- Semantic cases ---------------------------------------------------------------------
   checkAsync(
      "T-01",
      "unknown capability id -> UNSUPPORTED_CAPABILITY, section blocked",
      () => {
         const { valid, diagnostics } = validateBindingMap(
            registry,
            load(`${FIX}/negative/bindings-unknown-target.fixture.json`),
         );
         assert(!valid, "map with unknown target must be invalid");
         assert(
            diagnostics.some(
               (x) =>
                  x.code === "UNSUPPORTED_CAPABILITY" && x.severity === "error",
            ),
            "expected UNSUPPORTED_CAPABILITY: " + JSON.stringify(diagnostics),
         );
         return diagnostics.map((x) => x.code).join(",");
      },
   );
   checkAsync(
      "T-02",
      "undeclared appearance -> UNSUPPORTED_APPEARANCE (no default guessing)",
      () => {
         const { valid, diagnostics } = validateBindingMap(
            registry,
            load(`${FIX}/negative/bindings-bad-appearance.fixture.json`),
         );
         assert(
            !valid &&
               diagnostics.some((x) => x.code === "UNSUPPORTED_APPEARANCE"),
            JSON.stringify(diagnostics),
         );
         return diagnostics.map((x) => x.code).join(",");
      },
   );
   checkAsync(
      "T-03",
      "missing variant mapping -> VARIANT_NOT_MAPPED, section blocked",
      () => {
         const report = resolveStructure(
            registry,
            bindings,
            load(`${FIX}/negative/structure-variant-unmapped.fixture.json`),
         );
         assert(
            report.diagnostics.some(
               (x) => x.code === "VARIANT_NOT_MAPPED" && x.severity === "error",
            ),
            JSON.stringify(report.diagnostics.map((x) => x.code)),
         );
         assert(
            report.sections[0].status === "blocked",
            "section must be blocked",
         );
         assert(
            report.coverage.total === 0,
            "no silently synthesized coverage",
         );
         return `status=${report.sections[0].status}`;
      },
   );
   checkAsync("T-04", "wrong nesting -> INCOMPATIBLE_NESTING", () => {
      const report = resolveStructure(
         registry,
         bindings,
         load(`${FIX}/negative/structure-illegal-nesting.fixture.json`),
      );
      assert(
         report.diagnostics.some(
            (x) => x.code === "INCOMPATIBLE_NESTING" && x.severity === "error",
         ),
         JSON.stringify(report.diagnostics.map((x) => x.code)),
      );
      return (
         report.diagnostics.filter((x) => x.code === "INCOMPATIBLE_NESTING")
            .length + " error(s)"
      );
   });
   checkAsync(
      "T-05a",
      "overlapping conditions, different targets -> AMBIGUOUS_BINDING",
      () => {
         const { valid, diagnostics } = validateBindingMap(
            registry,
            load(`${FIX}/negative/bindings-ambiguous.fixture.json`),
         );
         assert(
            !valid && diagnostics.some((x) => x.code === "AMBIGUOUS_BINDING"),
            JSON.stringify(diagnostics),
         );
         return diagnostics.map((x) => x.code).join(",");
      },
   );
   checkAsync("T-05b", "exact duplicate tuple -> DUPLICATE_BINDING", () => {
      const { valid, diagnostics } = validateBindingMap(
         registry,
         load(`${FIX}/negative/bindings-duplicate.fixture.json`),
      );
      assert(
         !valid && diagnostics.some((x) => x.code === "DUPLICATE_BINDING"),
         JSON.stringify(diagnostics),
      );
      return diagnostics.map((x) => x.code).join(",");
   });
   checkAsync("T-11", "tampered summary -> count-mismatch error", () => {
      const tampered = load(`${FIX}/synthetic-flatcms/registry.fixture.json`);
      tampered.summary.byCategory.native += 1;
      const { valid, diagnostics } = validateRegistry(tampered);
      assert(
         !valid &&
            diagnostics.some((x) => x.subject.id === "summary.byCategory"),
         JSON.stringify(diagnostics),
      );
      return diagnostics.map((x) => x.subject.id).join(",");
   });
   checkAsync(
      "T-12",
      "proof overclaim (registered w/o config-declaration) -> EVIDENCE_MISSING",
      () => {
         const { valid, diagnostics } = validateRegistry(
            load(`${FIX}/negative/registry-bad-proof.fixture.json`),
         );
         assert(
            !valid &&
               diagnostics.some(
                  (x) =>
                     x.code === "EVIDENCE_MISSING" &&
                     x.subject.id === "flatcms/heading",
               ),
            JSON.stringify(diagnostics),
         );
         return diagnostics.map((x) => x.code).join(",");
      },
   );
   checkAsync(
      "T-12b",
      "G1 payload claiming admin-roundtrip-verified -> hard reject",
      () => {
         const { valid, diagnostics } = validateRegistry(
            load(`${FIX}/negative/registry-overclaim-roundtrip.fixture.json`),
         );
         assert(
            !valid && diagnostics.some((x) => x.code === "EVIDENCE_MISSING"),
            "G1/G2 payloads cannot justify roundtrip claims",
         );
         return "later-stage claim rejected";
      },
   );
   checkAsync(
      "T-13",
      "binding to disabled capability -> CAPABILITY_DISABLED",
      () => {
         const { valid, diagnostics } = validateBindingMap(
            registry,
            load(`${FIX}/negative/bindings-disabled-target.fixture.json`),
         );
         assert(
            !valid && diagnostics.some((x) => x.code === "CAPABILITY_DISABLED"),
            JSON.stringify(diagnostics),
         );
         return diagnostics.map((x) => x.code).join(",");
      },
   );
   checkAsync(
      "POS-d",
      "positive fixtures resolve clean (1 advisory warning only)",
      () => {
         const report = resolveStructure(registry, bindings, structure);
         const errors = report.diagnostics.filter(
            (x) => x.severity === "error",
         );
         assert(
            errors.length === 0,
            "positive set must have zero errors: " + JSON.stringify(errors),
         );
         assert(
            report.sections.every((s) => s.status === "mapped"),
            "both sections mapped",
         );
         assert(
            report.coverage.total === 5 &&
               report.coverage.native === 3 &&
               report.coverage.widget === 1 &&
               report.coverage["custom-required"] === 1,
            JSON.stringify(report.coverage),
         );
         assert(
            report.diagnostics.some(
               (x) =>
                  x.code === "RESPONSIVE_UNCERTAIN" && x.severity === "warning",
            ),
            "responsive advisory expected",
         );
         // The committed example must equal a fresh deterministic run (minus generatedAt).
         const committed = load(
            path.join(
               ROOT,
               "resources/examples/converter/resolution-report.synthetic-flatcms.example.json",
            ),
         );
         const fresh = { ...report, generatedAt: committed.generatedAt };
         assert(
            JSON.stringify(fresh, null, 2) + "\n" ===
               JSON.stringify(committed, null, 2) + "\n",
            "committed example drifts from a fresh resolver run",
         );
         return `coverage=${JSON.stringify(report.coverage)} warnings=${report.counts.warnings}`;
      },
   );
   checkAsync("POS-e", "committed resolution-report example validates", () => {
      const v = compile("resolution-report.schema.json");
      const ok = v(
         load(
            path.join(
               ROOT,
               "resources/examples/converter/resolution-report.synthetic-flatcms.example.json",
            ),
         ),
      );
      assert(
         ok,
         "committed report example must validate: " +
            JSON.stringify(v.errors?.slice(0, 5)),
      );
      return "valid";
   });

   // ---- T-08: determinism -------------------------------------------------------------------
   checkAsync(
      "T-08",
      "deterministic output: shuffled sorted arrays -> identical hash",
      () => {
         const a = canonicalReportHash(
            resolveStructure(registry, bindings, structure),
         );
         // Document-order arrays (structure sections/elements) are semantic and stay fixed;
         // association arrays (registry capabilities, bindings) may arrive in any order and
         // the resolver must restore canonical order (resources/schemas/converter/README.md rule 1).
         const shuffledRegistry = {
            ...registry,
            capabilities: [...registry.capabilities].reverse(),
         };
         const shuffledBindings = {
            ...bindings,
            bindings: [...bindings.bindings].reverse(),
         };
         const b = canonicalReportHash(
            resolveStructure(shuffledRegistry, shuffledBindings, structure),
         );
         assert(a === b, `hashes differ: ${a} vs ${b}`);
         const c = canonicalReportHash(
            resolveStructure(registry, bindings, structure),
         );
         assert(a === c, "double run differs");
         return a.slice(0, 16) + "…";
      },
   );
   checkAsync(
      "T-08b",
      "magento example registry is in canonical key order",
      () => {
         const raw = readFileSync(
            path.join(
               ROOT,
               "resources/knowledge/magento/pagebuilder/capability-registry.magento-pagebuilder.example.json",
            ),
            "utf8",
         );
         const parsed = JSON.parse(raw);
         assert(
            JSON.stringify(parsed, null, 2) + "\n" === raw,
            "file serialization must be 2-space canonical form",
         );
         const capOrder = parsed.capabilities.map(
            (c) => c.id + "∥" + c.appearanceId,
         );
         const sorted = [...capOrder].sort();
         assert(
            JSON.stringify(capOrder) === JSON.stringify(sorted),
            "capabilities must be sorted by (id, appearanceId)",
         );
         return `${parsed.capabilities.length} entries in canonical order`;
      },
   );

   // ---- T-06: preflight / missing project source -------------------------------------------
   checkAsync(
      "T-06a",
      "placeholder sentinel path -> PROJECT_SOURCE_NOT_CONFIGURED, no audit",
      () => {
         const { source, diagnostic } = resolveProjectSource(syntheticProfile);
         assert(
            source === null,
            "no source may be resolved from a placeholder",
         );
         assert(
            diagnostic?.code === "PROJECT_SOURCE_NOT_CONFIGURED",
            JSON.stringify(diagnostic),
         );
         return diagnostic.code;
      },
   );
   checkAsync("T-06b", "unconfigured path -> PROJECT_SOURCE_NOT_FOUND", () => {
      const p = load(`${FIX}/negative/profile-synthetic-flatcms.fixture.json`);
      p.profile.projectSources[0].path = "/definitely/not/present";
      const { source, diagnostic } = resolveProjectSource(p, {
         stat: () => ({ exists: false, readable: false }),
      });
      assert(
         source === null && diagnostic?.code === "PROJECT_SOURCE_NOT_FOUND",
         JSON.stringify(diagnostic),
      );
      return diagnostic.code;
   });
   checkAsync(
      "T-06c",
      "unreadable source -> PROJECT_SOURCE_NOT_READABLE",
      () => {
         const p = load(
            `${FIX}/negative/profile-synthetic-flatcms.fixture.json`,
         );
         p.profile.projectSources[0].path = "/definitely/not/present";
         const { source, diagnostic } = resolveProjectSource(p, {
            stat: () => ({ exists: true, readable: false }),
         });
         assert(
            source === null &&
               diagnostic?.code === "PROJECT_SOURCE_NOT_READABLE",
            JSON.stringify(diagnostic),
         );
         return diagnostic.code;
      },
   );
   checkAsync(
      "T-06d",
      "empty projectSources -> PROJECT_SOURCE_NOT_CONFIGURED (core runs without any checkout)",
      () => {
         const p = load(
            `${FIX}/negative/profile-synthetic-flatcms.fixture.json`,
         );
         p.profile.projectSources = [];
         const { source, diagnostic } = resolveProjectSource(p);
         assert(
            source === null &&
               diagnostic?.code === "PROJECT_SOURCE_NOT_CONFIGURED",
            JSON.stringify(diagnostic),
         );
         return "generic core runs with zero sources";
      },
   );
   checkAsync("T-06e", "mismatched probe -> ADAPTER_NOT_APPLICABLE", () => {
      const diagnostic = checkAdapterApplicable(syntheticProfile, [
         "some-other-platform",
      ]);
      assert(
         diagnostic?.code === "ADAPTER_NOT_APPLICABLE",
         JSON.stringify(diagnostic),
      );
      assert(
         checkAdapterApplicable(syntheticProfile, [
            "synthetic-flatcms",
            "magento-pagebuilder",
         ]) === null,
         "matching platform passes",
      );
      return "adapter scope enforced";
   });

   // ---- T-09: core-neutrality grep guard ----------------------------------------------------
   checkAsync(
      "T-09",
      "neutrality guard: no platform literals/paths/figma-ids in neutral surfaces",
      () => {
         // Neutral surfaces: resources/schemas/converter/**, resources/schemas/cli/** and the synthetic-flatcms fixtures.
         // V1 schemas are legitimately Figma-typed — scanned separately, only for non-Figma platform leakage.
         // The synthetic-magento-like fixture tree is deliberately magento-shaped (it is the adapter
         // fixture) and is covered by T-18b's owner-path/licensing scans instead.
         const neutralTerms =
            /magento|secomm|pagebuilder|hyva|slaunch|\/home\/|figma|filekey|vNPtfBRpYM3PsExirVqhmt/i;
         const v1Terms = /magento|secomm|pagebuilder|hyva|slaunch|\/home\//i;
         const hits = [];
         const scanFile = (relPath, text, re) => {
            const m = text.match(new RegExp(re.source, "gi"));
            if (m) hits.push(`${relPath}: ${[...new Set(m)].join(",")}`);
         };
         const convDir = path.join(ROOT, "resources", "schemas", "converter");
         for (const f of readdirSync(convDir).filter((f) =>
            f.endsWith(".json"),
         ))
            scanFile(
               `resources/schemas/converter/${f}`,
               readFileSync(path.join(convDir, f), "utf8"),
               neutralTerms,
            );
         const cliDir = path.join(ROOT, "resources", "schemas", "cli");
         for (const f of readdirSync(cliDir).filter((f) => f.endsWith(".json")))
            scanFile(
               `resources/schemas/cli/${f}`,
               readFileSync(path.join(cliDir, f), "utf8"),
               neutralTerms,
            );
         const fixDir = path.join(FIX, "synthetic-flatcms");
         for (const f of readdirSync(fixDir))
            scanFile(
               `src/modules/core/__tests__/fixtures/synthetic-flatcms/${f}`,
               readFileSync(path.join(fixDir, f), "utf8"),
               neutralTerms,
            );
         for (const f of readdirSync(
            path.join(ROOT, "resources", "schemas"),
         ).filter((f) => f.endsWith(".schema.json"))) {
            scanFile(
               `resources/schemas/${f}`,
               readFileSync(path.join(ROOT, "resources", "schemas", f), "utf8"),
               v1Terms,
            );
         }
         assert(
            hits.length === 0,
            "neutrality violations:\n" + hits.join("\n"),
         );
         return "0 matches across resources/schemas/** and synthetic fixtures";
      },
   );

   // ---- T-14: two-family portability --------------------------------------------------------
   checkAsync(
      "T-14a",
      "V1 profile family still validates independently",
      () => {
         const v = v1Compile("project-profile.schema.json");
         const ok = v(
            load(
               path.join(
                  ROOT,
                  "resources/profiles/luxury-editorial.example.json",
               ),
            ),
         );
         assert(
            ok,
            "V1 profile must validate: " +
               JSON.stringify(v.errors?.slice(0, 3)),
         );
         const ok2 = v(
            load(
               path.join(
                  ROOT,
                  "resources/profiles/commerce-promotional.example.json",
               ),
            ),
         );
         assert(ok2, "V1 commerce profile must validate");
         return "both V1 profiles valid (family untouched)";
      },
   );
   checkAsync("T-14b", "V1 examples validate against V1 schemas", () => {
      for (const [schema, example] of [
         [
            "source-manifest.schema.json",
            "manifest.secomm-fashion.example.json",
         ],
         ["design-tokens.schema.json", "tokens.secomm-fashion.example.json"],
         [
            "component-defs.schema.json",
            "components.secomm-fashion.example.json",
         ],
      ]) {
         const v = v1Compile(schema);
         const ok = v(load(path.join(ROOT, "resources", "examples", example)));
         assert(
            ok,
            `${example} must validate against ${schema}: ` +
               JSON.stringify(v.errors?.slice(0, 3)),
         );
      }
      return "3/3 V1 examples valid";
   });
}
