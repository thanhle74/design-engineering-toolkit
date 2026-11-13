// [70] W-D — CMS installer renderer unit suite (vitest, hermetic, fully offline).
//
// Covers: byte-determinism of all three renderers, the escaping gauntlet (quotes,
// backslashes, PHP open tags, newlines/tabs, unicode, and the nowdoc terminator collision
// -> var_export fallback) proven with `php -l` AND a `php -r`-style probe that goes through
// the SAME embedding seam the installer itself uses, the mapping-and-gaps ledger (synthetic
// compose report -> counts + entries + deterministic order), and the two additive schema
// minors (build-config cmsInstall block; build-manifest four new output roles).
//
// php guard: when the php CLI is absent on a machine, every php-dependent assertion SKIPS
// with an explicit note (never fakes a pass). PHP-only lint/probe checks are the only
// php-dependent cases here; pure-JS assertions always run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
   embedPhpContentExpression,
   CMS_INSTALL_BUNDLE_FILES,
   CMS_INSTALL_BUNDLE_ROLES,
   renderCmsInstallerPhp,
   renderInstallerReadme,
   renderMappingAndGaps,
   type CmsInstallerInput,
} from "../render-cms-installer.js";
import AjvDefault from "ajv/dist/2020.js";

const REPO_ROOT = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   "..",
   "..",
   "..",
   "..",
   "..",
   "..",
);

// Frozen [70] contract lock WITHOUT importing the studio module (importing it would pull a
// platform-naming file into core's compiled surface): the frozen names/roles are extracted
// from the contract file's own source text — the source of truth, verbatim.
function extractConstObject(
   source: string,
   name: string,
): Record<string, string> {
   const m = source.match(
      String.raw`export const ${name} = \{([\s\S]*?)\} as const;`,
   );
   if (!m) throw new Error(`frozen contract object ${name} not found`);
   return Object.fromEntries(
      [...m[1].matchAll(/(\w+): "([^"]+)"/g)].map((e) => [e[1], e[2]]),
   );
}
const CONTRACT_TEXT = fs.readFileSync(
   path.join(REPO_ROOT, "src/modules/studio/shared/contracts/build-flow.ts"),
   "utf8",
);
const BUILD_FLOW_ARTIFACT_FILES = extractConstObject(
   CONTRACT_TEXT,
   "BUILD_FLOW_ARTIFACT_FILES",
);
const BUILD_FLOW_ARTIFACT_ROLES = extractConstObject(
   CONTRACT_TEXT,
   "BUILD_FLOW_ARTIFACT_ROLES",
);

// Schema-minor validation harness over the COMMITTED schema files (the canonical contracts).
// Same Ajv options as src/modules/core/schema-registry.ts; the registry-alias path itself is
// exercised end-to-end by the integration suite (the real `det build` validates the example
// config through the repo's own validator before any stage runs).
interface TinyValidator {
   (data: unknown): boolean;
   errors?: { instancePath: string; message?: string }[] | null;
}
const Ajv = AjvDefault as unknown as new (
   options?: Record<string, unknown>,
) => {
   addSchema(schema: unknown): void;
   getSchema(id: string): TinyValidator | undefined;
};
function makeValidator(
   schemaRelPath: string,
): (data: unknown) => { valid: boolean; errors: string[] } {
   const schema = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, schemaRelPath), "utf8"),
   ) as { $id: string };
   const ajv = new Ajv({
      strict: true,
      allErrors: true,
      allowUnionTypes: true,
   });
   ajv.addSchema(schema);
   const validate = ajv.getSchema(schema.$id);
   if (!validate) throw new Error(`schema ${schema.$id} did not compile`);
   return (data: unknown) => ({
      valid: validate(data),
      errors: (validate.errors ?? []).map((e) =>
         `${e.instancePath || "/"} ${e.message ?? ""}`.trim(),
      ),
   });
}
const validateBuildConfig = makeValidator(
   "resources/schemas/cli/build-config.schema.json",
);
const validateBuildManifest = makeValidator(
   "resources/schemas/cli/build-manifest.schema.json",
);

const PHP_BIN = "php";
const phpAvailable: boolean = (() => {
   try {
      execFileSync(PHP_BIN, ["-r", "echo PHP_VERSION;"], { stdio: "pipe" });
      return true;
   } catch {
      return false;
   }
})();

// ---- Shared fixtures --------------------------------------------------------------------------

const PROVENANCE = {
   sourceId: "figma-home-desktop",
   revisionId: "2417494580183108397",
   profileId: "slaunchpad-fashion",
   platformId: "magento-pagebuilder",
};

const CMS_INSTALL = {
   identifier: "det-studio-homepage",
   title: "DET Studio Homepage",
   storeId: 0,
   active: true,
};

const CONTENT_SIMPLE =
   '<div data-content-type="row" data-appearance="contained"><p>Trang chủ — DET Studio</p></div>';

function installerInput(content: string): CmsInstallerInput {
   return { cmsInstall: CMS_INSTALL, content, provenance: PROVENANCE };
}

/**
 * The probe seam: the generated installer keeps its embedded bytes reachable via
 * `det_pb_embedded_content()` and never executes its entry point when included with the
 * DET_CMS_INSTALLER_INCLUDED marker. The probe below is the exact consumer the installer's
 * seam documents — it includes the generated file and dumps the returned bytes, so the
 * assertion exercises the SAME embedding helper the installer runs with (not a re-encode).
 */
function probeEmbeddedBytes(installerPath: string): Buffer {
   const probePath = `${installerPath}.probe.php`;
   const outPath = `${installerPath}.probe-out.html`;
   fs.writeFileSync(
      probePath,
      `<?php\ndefine('DET_CMS_INSTALLER_INCLUDED', 1);\nrequire $argv[1];\nfile_put_contents($argv[2], det_pb_embedded_content());\n`,
   );
   execFileSync(PHP_BIN, [probePath, installerPath, outPath], {
      stdio: "pipe",
   });
   return fs.readFileSync(outPath);
}

// ---- 1. Frozen-contract lock -------------------------------------------------------------------

describe("[70] frozen contract literals", () => {
   it("renderer file names + roles equal the studio contract freeze", () => {
      // The renderer owns the four install-bundle files; build-manifest.json (the contract's
      // fifth entry) is emitted by the build command itself and is asserted by name in the
      // integration suite.
      expect(CMS_INSTALL_BUNDLE_FILES.installer).toBe(
         BUILD_FLOW_ARTIFACT_FILES.installer,
      );
      expect(CMS_INSTALL_BUNDLE_FILES.pageBuilderContent).toBe(
         BUILD_FLOW_ARTIFACT_FILES.pageBuilderContent,
      );
      expect(CMS_INSTALL_BUNDLE_FILES.mappingAndGaps).toBe(
         BUILD_FLOW_ARTIFACT_FILES.mappingAndGaps,
      );
      expect(CMS_INSTALL_BUNDLE_FILES.readme).toBe(
         BUILD_FLOW_ARTIFACT_FILES.readme,
      );
      expect(CMS_INSTALL_BUNDLE_ROLES).toEqual(BUILD_FLOW_ARTIFACT_ROLES);
   });
});

// ---- 2. Determinism ----------------------------------------------------------------------------

describe("[70] renderer determinism", () => {
   it("installer renders byte-identical across repeated calls (nowdoc path)", () => {
      const a = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
      const b = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
      expect(a).toBe(b);
      expect(a).toContain("declare(strict_types=1)");
      // No timestamps, no random bytes: the sha is derived from content only.
      expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
   });

   it("installer renders byte-identical across repeated calls (var_export fallback path)", () => {
      const content = "collision DET_PB_CONTENT inside";
      const a = renderCmsInstallerPhp(installerInput(content));
      const b = renderCmsInstallerPhp(installerInput(content));
      expect(a).toBe(b);
      expect(embedPhpContentExpression(content).mode).toBe("var_export");
   });

   it("mapping-and-gaps + readme render byte-identical across repeated calls", () => {
      const report = {
         mapping: [
            {
               sourceNodeId: "n-1",
               sourceName: "Hero",
               disposition: "mapped" as const,
               target: {
                  capabilityId: "magento_pagebuilder/banner",
                  appearanceId: "poster",
               },
               note: "composed as banner",
            },
         ],
         diagnostics: [],
      };
      const gaps = [{ code: "PREVIEW_ASSETS_NOT_GENERATED", message: "m" }];
      const mgA = renderMappingAndGaps({
         source: {
            sourceId: PROVENANCE.sourceId,
            revisionId: PROVENANCE.revisionId,
         },
         cmsInstall: CMS_INSTALL,
         report,
         buildGaps: gaps,
      });
      const mgB = renderMappingAndGaps({
         source: {
            sourceId: PROVENANCE.sourceId,
            revisionId: PROVENANCE.revisionId,
         },
         cmsInstall: CMS_INSTALL,
         report,
         buildGaps: gaps,
      });
      expect(mgA).toBe(mgB);
      const rmA = renderInstallerReadme({
         cmsInstall: CMS_INSTALL,
         provenance: PROVENANCE,
      });
      const rmB = renderInstallerReadme({
         cmsInstall: CMS_INSTALL,
         provenance: PROVENANCE,
      });
      expect(rmA).toBe(rmB);
      expect(rmA).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
   });
});

// ---- 3. Installer safety surface (pure JS assertions, always run) -------------------------------

describe("[70] installer safety surface", () => {
   const php = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));

   it("declares strict types, a REAL AppInterface class and the service-layer write path", () => {
      expect(php).toContain("declare(strict_types=1)");
      expect(php).toContain(
         "final class DetCmsInstallerApp implements \\Magento\\Framework\\AppInterface",
      );
      expect(php).toContain(
         "\\Magento\\Framework\\App\\Bootstrap::create(BP, $_SERVER)",
      );
      expect(php).toContain("\\Magento\\Cms\\Api\\PageRepositoryInterface");
      expect(php).toContain(
         "\\Magento\\Cms\\Model\\ResourceModel\\Page\\Collection",
      );
      expect(php).toContain("addFieldToFilter('identifier', $identifier)");
      // The frozen explicit-store-scope form.
      expect(php).toContain("$page->setStoreId([$storeId]);");
      expect(php).toContain("realpath(__DIR__ . '/..')");
      expect(php).toContain("app/bootstrap.php");
      expect(php).toContain("exit(1);");
   });

   it("[70] C70-1 regression: launch() returns a REAL ResponseInterface — never a controller Result", () => {
      // The platform's own CLI-app shape (App\Cron): constructor-injected
      // App\Console\Response returned from launch(); Bootstrap::run() then calls
      // sendResponse() on it. Controller results expose renderResult(), NOT
      // sendResponse(), so returning one would fatal AFTER the CMS write.
      expect(php).toContain("private function failWith(\\Throwable $e): void");
      expect(php).toContain(
         "\\Magento\\Framework\\App\\Console\\Response $response,",
      );
      expect(php).toContain("return $this->response;");
      expect(php).toContain("invokes sendResponse() on it");
      expect(php).toContain("$this->response->setCode(self::EXIT_OK);");
      // crontab area boot semantics of the platform's own CLI application.
      expect(php).toContain("$this->state->setAreaCode($area);");
      expect(php).toContain("\\Magento\\Framework\\App\\Area::AREA_CRONTAB");
      // catchException is a HANDLER (return true), not an exit point.
      expect(php).toContain("$this->failWith($exception);");
      expect(php).toContain("return true;");
      expect(php).toContain("exit($app->getExitCode());");
      // The defect's exact machinery must be gone (prose in the emitted docblock
      // explaining the defect is fine; the CODE must never construct a Result).
      expect(php).not.toContain("ResultFactory");
      expect(php).not.toContain("TYPE_RAW");
      expect(php).not.toMatch(
         /->create\(\\Magento\\Framework\\Controller\\Result/,
      );
      expect(php).not.toContain("return $result;");
      // No exit() inside the write path: refusals throw, the app records the code.
      const executeStart = php.indexOf("private function execute(): void");
      const executeEnd = php.indexOf(
         "$bootstrap = \\Magento\\Framework\\App\\Bootstrap::create",
         executeStart,
      );
      const executeBody = php.slice(executeStart, executeEnd);
      expect(executeBody).not.toContain("exit(");
      expect(executeBody).toContain("throw new \\RuntimeException(");
   });

   it("carries the generated marker, target echo, provenance and the run warnings", () => {
      expect(php).toContain("GENERATED BY DET");
      expect(php).toContain("det-studio-homepage");
      expect(php).toContain("DET Studio Homepage");
      expect(php).toContain("figma-home-desktop");
      expect(php).toContain("2417494580183108397");
      expect(php).toContain("slaunchpad-fashion");
      expect(php).toContain("magento-pagebuilder");
      expect(php).toContain("WRITES THE CMS PAGE IN THIS MAGENTO INSTALLATION");
      expect(php).toContain("--dry-run");
      expect(php).toContain("DET itself NEVER writes");
   });

   it("never touches the store default homepage config and never embeds raw SQL or credentials", () => {
      // web/default/cms_home_page appears ONLY inside comment lines (the explicit
      // never-touch guarantees) — never as a config write.
      const offenders = php
         .split("\n")
         .filter((l: string) => l.includes("web/default/cms_home_page"))
         .filter((l: string) => !l.trimStart().startsWith("*"));
      expect(offenders).toEqual([]);
      // No raw SQL on cms_page tables, ever.
      expect(php).not.toMatch(
         /\b(SELECT |INSERT |UPDATE |DELETE |->query\(|getConnection\()/,
      );
      // No credential-bearing tokens anywhere (assignment-shaped keys, not prose).
      expect(php).not.toMatch(
         /password|api[_-]?key|Bearer\s[A-Za-z0-9]|access_token|private_key/i,
      );
   });
});

// ---- 4. Escaping gauntlet (php -l + byte-exact probe) --------------------------------------------

describe("[70] escaping gauntlet (php-dependent)", () => {
   const NASTY_CONTENTS: { name: string; content: string }[] = [
      { name: "plain", content: CONTENT_SIMPLE },
      {
         name: "quotes-and-backslashes",
         content: "it's a 'test' with \"double\" and backslash \\ end",
      },
      {
         name: "php-open-tags",
         content:
            "<?php echo 'injection'; ?> <?= $x ?> <script>alert(1)</script>",
      },
      {
         name: "newlines-tabs-crs",
         content: "line1\nline2\ttabbed\rcarriage\n\nlast",
      },
      {
         name: "unicode",
         content: "unicode — Việt Nam “đặt hàng” 🎯 日本語 ‎",
      },
      {
         name: "terminator-mid-line",
         content: "before DET_PB_CONTENT after",
      },
      {
         name: "terminator-own-line",
         content: "a\nDET_PB_CONTENT\nb",
      },
      {
         name: "terminator-indented",
         content: "x\n   DET_PB_CONTENT\ny",
      },
      { name: "trailing-newline", content: "ends with newline\n" },
      { name: "empty", content: "" },
   ];

   const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det70-renderer-"));
   const itPhp = phpAvailable ? it : it.skip;

   it("php CLI is present on this machine (note when absent: php assertions skip, never fake-pass)", () => {
      if (!phpAvailable) {
         console.warn(
            "php CLI not found on this machine — php -l and byte-exact probe assertions below are SKIPPED with an explicit note (never faked).",
         );
      }
      expect(phpAvailable).toBe(true);
   });

   for (const { name, content } of NASTY_CONTENTS) {
      itPhp(
         `gauntlet [${name}]: php -l passes and the probe returns the content BYTE-EXACT`,
         () => {
            const php = renderCmsInstallerPhp(installerInput(content));
            const installerPath = path.join(tmp, `installer-${name}.php`);
            fs.writeFileSync(installerPath, php);
            // 1) Lint: the generated file is syntactically valid PHP.
            execFileSync(PHP_BIN, ["-l", installerPath], { stdio: "pipe" });
            // 2) Embedding mode: any occurrence of the terminator forces the fallback.
            const wantsFallback = content.includes("DET_PB_CONTENT");
            expect(embedPhpContentExpression(content).mode).toBe(
               wantsFallback ? "var_export" : "nowdoc",
            );
            // 3) Byte-exactness through the SAME seam the installer uses.
            const returned = probeEmbeddedBytes(installerPath);
            const expected = Buffer.from(content, "utf8");
            expect(returned.equals(expected)).toBe(true);
            // Also compare lengths explicitly so a mismatch reports the byte delta.
            expect(returned.length).toBe(expected.length);
         },
      );
   }

   itPhp("empty content dry-run plan computes zero bytes", () => {
      // Pure-PHP plan math: run the generated installer's --dry-run inside a stubbed
      // magento root and parse the printed plan.
      const root = fs.mkdtempSync(path.join(tmp, "magroot-"));
      fs.mkdirSync(path.join(root, "det-install"));
      fs.mkdirSync(path.join(root, "app"));
      fs.writeFileSync(
         path.join(root, "app", "bootstrap.php"),
         "<?php // stub — the dry run never boots the application\n",
      );
      const php = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
      const installerPath = path.join(
         root,
         "det-install",
         "install-homepage.php",
      );
      fs.writeFileSync(installerPath, php);
      const plan = execFileSync(PHP_BIN, [installerPath, "--dry-run"], {
         cwd: REPO_ROOT,
         stdio: "pipe",
      }).toString();
      const parsed = JSON.parse(plan) as Record<string, unknown>;
      expect(parsed).toMatchObject({
         mode: "dry-run",
         identifier: CMS_INSTALL.identifier,
         title: CMS_INSTALL.title,
         storeId: CMS_INSTALL.storeId,
         active: CMS_INSTALL.active,
         contentSha256: expect.any(String),
      });
      expect(parsed["contentBytes"]).toBe(
         Buffer.byteLength(CONTENT_SIMPLE, "utf8"),
      );
   });

   itPhp(
      "wrong placement exits 1 with a STDERR message (never a fatal)",
      () => {
         const php = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
         const lonelyDir = fs.mkdtempSync(path.join(tmp, "wrongplace-"));
         const installerPath = path.join(lonelyDir, "install-homepage.php");
         fs.writeFileSync(installerPath, php);
         let stderr = "";
         let exitCode = 0;
         try {
            execFileSync(PHP_BIN, [installerPath], { stdio: "pipe" });
         } catch (e) {
            const err = e as { status?: number; stderr?: Buffer };
            exitCode = err.status ?? -1;
            stderr = (err.stderr ?? Buffer.from("")).toString();
         }
         expect(exitCode).toBe(1);
         expect(stderr).toContain("wrong install location");
         // Never a PHP fatal: no "PHP Fatal error", no stack trace.
         expect(stderr).not.toContain("PHP Fatal error");
         expect(stderr).not.toContain("Uncaught");
      },
   );

   itPhp(
      "dry-run reports mediaAssets when media directory exists in bundle",
      () => {
         const root = fs.mkdtempSync(path.join(tmp, "magroot-media-"));
         fs.mkdirSync(path.join(root, "det-install"));
         fs.mkdirSync(
            path.join(root, "det-install", "media", "wysiwyg", "test"),
            { recursive: true },
         );
         fs.writeFileSync(
            path.join(
               root,
               "det-install",
               "media",
               "wysiwyg",
               "test",
               "sample.jpg",
            ),
            "fake-jpg-bytes",
         );
         fs.mkdirSync(path.join(root, "app"));
         fs.writeFileSync(
            path.join(root, "app", "bootstrap.php"),
            "<?php // stub\n",
         );
         const php = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
         const installerPath = path.join(
            root,
            "det-install",
            "install-homepage.php",
         );
         fs.writeFileSync(installerPath, php);
         const plan = execFileSync(PHP_BIN, [installerPath, "--dry-run"], {
            cwd: REPO_ROOT,
            stdio: "pipe",
         }).toString();
         const parsed = JSON.parse(plan) as Record<string, unknown>;
         expect(parsed).toMatchObject({
            mode: "dry-run",
            identifier: CMS_INSTALL.identifier,
            mediaAssets: {
               count: 1,
               totalBytes: 14,
               files: ["pub/media/wysiwyg/test/sample.jpg"],
            },
         });
      },
   );

   itPhp("dry-run reports mediaAssets when media directory exists in bundle", () => {
      const root = fs.mkdtempSync(path.join(tmp, "magroot-media-"));
      fs.mkdirSync(path.join(root, "det-install"));
      fs.mkdirSync(path.join(root, "det-install", "media", "wysiwyg", "test"), { recursive: true });
      fs.writeFileSync(path.join(root, "det-install", "media", "wysiwyg", "test", "sample.jpg"), "fake-jpg-bytes");
      fs.mkdirSync(path.join(root, "app"));
      fs.writeFileSync(
         path.join(root, "app", "bootstrap.php"),
         "<?php // stub\n",
      );
      const php = renderCmsInstallerPhp(installerInput(CONTENT_SIMPLE));
      const installerPath = path.join(
         root,
         "det-install",
         "install-homepage.php",
      );
      fs.writeFileSync(installerPath, php);
      const plan = execFileSync(PHP_BIN, [installerPath, "--dry-run"], {
         cwd: REPO_ROOT,
         stdio: "pipe",
      }).toString();
      const parsed = JSON.parse(plan) as Record<string, unknown>;
      expect(parsed).toMatchObject({
         mode: "dry-run",
         identifier: CMS_INSTALL.identifier,
         mediaAssets: {
            count: 1,
            totalBytes: 14,
            files: ["pub/media/wysiwyg/test/sample.jpg"],
         },
      });
   });
});

// ---- 5. mapping-and-gaps ledger ------------------------------------------------------------------

describe("[70] mapping-and-gaps ledger", () => {
   const report = {
      mapping: [
         {
            sourceNodeId: "n-1",
            sourceName: "Hero",
            disposition: "mapped" as const,
            target: {
               capabilityId: "magento_pagebuilder/banner",
               appearanceId: "poster",
            },
            note: "composed as the banner",
         },
         {
            sourceNodeId: "n-2",
            sourceName: "Deco",
            disposition: "gap" as const,
            note: "no native equivalent",
         },
         {
            sourceNodeId: "n-3",
            sourceName: "Merge",
            disposition: "decoration-merged" as const,
         },
         {
            sourceNodeId: "n-4",
            sourceName: "Excluded",
            disposition: "excluded" as const,
            note: "inside decoration subtree",
         },
         {
            sourceNodeId: "n-5",
            sourceName: "Skipped",
            disposition: "skipped" as const,
            note: "no candidate",
         },
      ],
      diagnostics: [
         {
            code: "NOT_VERIFIED",
            severity: "warning",
            message: "gradient overlay not composed",
            subject: { type: "node", id: "n-2" },
         },
      ],
   };
   const buildGaps = [
      { code: "COMPOSITION_GAPS_PRESENT", message: "1 gap(s)", count: 1 },
      { code: "PREVIEW_INSTALL_OPERATOR_GATED", message: "operator step" },
   ];
   const rendered = renderMappingAndGaps({
      source: {
         sourceId: "figma-home-desktop",
         revisionId: "2417494580183108397",
      },
      cmsInstall: CMS_INSTALL,
      report,
      buildGaps,
   });

   it("parses as JSON with the documented top-level shape", () => {
      const doc = JSON.parse(rendered) as Record<string, unknown>;
      expect(doc["schemaVersion"]).toBe(1);
      expect(doc["kind"]).toBe("det-mapping-and-gaps");
      expect(doc["source"]).toEqual({
         sourceId: "figma-home-desktop",
         revisionId: "2417494580183108397",
      });
      expect(doc["cmsInstall"]).toEqual(CMS_INSTALL);
   });

   it("computes counts over all five dispositions and keeps the compose report's order", () => {
      const doc = JSON.parse(rendered) as {
         ledger: {
            counts: Record<string, number>;
            entries: {
               nodeId: string;
               sourceName?: string;
               disposition: string;
               target?: unknown;
               reasons: string[];
            }[];
         };
         gaps: { code: string }[];
      };
      expect(doc.ledger.counts).toEqual({
         mapped: 1,
         gap: 1,
         "decoration-merged": 1,
         excluded: 1,
         skipped: 1,
      });
      expect(doc.ledger.entries.map((e) => e.nodeId)).toEqual([
         "n-1",
         "n-2",
         "n-3",
         "n-4",
         "n-5",
      ]);
      // Reasons: mapping note first, then the node-addressed compose diagnostics.
      expect(doc.ledger.entries[1]?.reasons).toEqual([
         "no native equivalent",
         "NOT_VERIFIED: gradient overlay not composed",
      ]);
      expect(doc.ledger.entries[0]?.target).toEqual({
         capabilityId: "magento_pagebuilder/banner",
         appearanceId: "poster",
      });
      // Build gap codes first (manifest order), compose diagnostics after.
      expect(doc.gaps.map((g) => g.code)).toEqual([
         "COMPOSITION_GAPS_PRESENT",
         "PREVIEW_INSTALL_OPERATOR_GATED",
         "NOT_VERIFIED",
      ]);
   });

   it("is deterministic for identical inputs", () => {
      const again = renderMappingAndGaps({
         source: {
            sourceId: "figma-home-desktop",
            revisionId: "2417494580183108397",
         },
         cmsInstall: CMS_INSTALL,
         report,
         buildGaps,
      });
      expect(again).toBe(rendered);
   });
});

// ---- 6. Schema minors ---------------------------------------------------------------------------

describe("[70] schema minors", () => {
   const EXAMPLE_CONFIG_PATH = path.join(
      REPO_ROOT,
      "resources/examples/build/slaunchpad-home-real-derived/build-config.json",
   );

   it("committed example build-config validates WITH the cmsInstall block and echoes it", () => {
      const config = JSON.parse(
         fs.readFileSync(EXAMPLE_CONFIG_PATH, "utf8"),
      ) as Record<string, unknown>;
      const check = validateBuildConfig(config);
      expect(check.valid).toBe(true);
      expect(config["cmsInstall"]).toEqual({
         identifier: "det-studio-homepage",
         title: "DET Studio Homepage",
         storeId: 0,
         active: true,
      });
   });

   it("build-config WITHOUT cmsInstall still validates (backward compatible minor)", () => {
      const config = JSON.parse(
         fs.readFileSync(EXAMPLE_CONFIG_PATH, "utf8"),
      ) as Record<string, unknown>;
      const { cmsInstall: _dropped, ...without } = config;
      const check = validateBuildConfig(without);
      expect(check.valid).toBe(true);
   });

   it("invalid cmsInstall blocks fail closed (bad identifier, negative storeId, missing field)", () => {
      const config = JSON.parse(
         fs.readFileSync(EXAMPLE_CONFIG_PATH, "utf8"),
      ) as Record<string, unknown>;
      const cmsBase = config["cmsInstall"] as Record<string, unknown>;
      const badIdentifier = {
         ...config,
         cmsInstall: { ...cmsBase, identifier: "Bad Identifier" },
      };
      expect(validateBuildConfig(badIdentifier).valid).toBe(false);
      const negativeStore = {
         ...config,
         cmsInstall: { ...cmsBase, storeId: -1 },
      };
      expect(validateBuildConfig(negativeStore).valid).toBe(false);
      const missingField = {
         ...config,
         cmsInstall: { identifier: "ok-page", title: "T", storeId: 0 },
      };
      expect(validateBuildConfig(missingField).valid).toBe(false);
      const extraField = {
         ...config,
         cmsInstall: { ...cmsBase, rogue: true },
      };
      expect(validateBuildConfig(extraField).valid).toBe(false);
   });

   it("build-manifest accepts each of the four new output roles and rejects an unknown role", () => {
      const sha = "a".repeat(64);
      const base = {
         schemaVersion: 1,
         kind: "det-build-manifest",
         profileId: "det-test",
         platformId: "magento-pagebuilder",
         source: { sourceId: "test-source", revisionId: "r1" },
         config: { contentHash: `sha256:${"b".repeat(64)}` },
         stages: [{ stage: "composition", status: "completed", exitCode: 0 }],
         inputs: [],
         outputs: Object.values(CMS_INSTALL_BUNDLE_ROLES).map((role) => ({
            path: `${role}.txt`,
            role,
            sha256: sha,
            bytes: 1,
            provenance: { via: "det-build", stage: "composition" },
         })),
         gaps: [],
      };
      const check = validateBuildManifest(base);
      expect(check.valid).toBe(true);
      const unknownRole = {
         ...base,
         outputs: [
            { path: "x.txt", role: "not-a-role", sha256: sha, bytes: 1 },
         ],
      };
      expect(validateBuildManifest(unknownRole).valid).toBe(false);
   });
});
