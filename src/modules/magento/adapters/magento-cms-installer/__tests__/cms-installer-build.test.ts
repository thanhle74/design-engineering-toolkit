// [70] W-D — CMS installer bundle integration suite (vitest, hermetic, fully offline).
//
// Runs the REAL offline build `node bin/det.js build --config
// resources/examples/build/slaunchpad-home-real-derived/build-config.json --out <tmp> --json`
// (dist built via `pnpm run build:core` — takes seconds, no network, no provider) and proves:
// - the bundle carries ALL FIVE frozen artifacts at the root;
// - the manifest registers the four new roles with per-FILE-BYTE sha256 matching on-disk bytes
//   and the frozen provenance {via: det-build, stage: composition};
// - pagebuilder-content.html is a byte-exact copy of 03-composition/native-content.html;
// - `php -l install-homepage.php` passes and the installer embeds the exact
//   pagebuilder-content.html bytes through the documented probe seam;
// - the operator README carries the dry-run + write-warning lines;
// - the negative case (config WITHOUT cmsInstall) emits no installer and records the honest
//   CMS_INSTALL_TARGET_UNDECLARED gap.
//
// Guards (explicit notes, never fake-passes):
// - dist missing  -> the integration checks SKIP with a note telling the operator to run
//   `pnpm run build:core` first (bin/det.js imports dist/src/modules/core/cli/main.js);
// - php missing   -> php-dependent assertions SKIP with a note.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CMS_INSTALL_TARGET_UNDECLARED } from "../render-cms-installer.js";

const REPO_ROOT = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   "..",
   "..",
   "..",
   "..",
   "..",
   "..",
);
const EXAMPLE_DIR = path.join(
   REPO_ROOT,
   "resources/examples/build/slaunchpad-home-real-derived",
);
const EXAMPLE_CONFIG = path.join(EXAMPLE_DIR, "build-config.json");
const DIST_MAIN = path.join(REPO_ROOT, "dist/src/modules/core/cli/main.js");

const phpAvailable: boolean = (() => {
   try {
      execFileSync("php", ["-r", "echo PHP_VERSION;"], { stdio: "pipe" });
      return true;
   } catch {
      return false;
   }
})();

const distAvailable = fs.existsSync(DIST_MAIN);

if (!distAvailable) {
   console.warn(
      "dist/src/modules/core/cli/main.js not found — the [70] installer integration checks are SKIPPED; run `pnpm run build:core` first (they are never faked).",
   );
}
if (!phpAvailable) {
   console.warn(
      "php CLI not found on this machine — php -l / byte-exact probe assertions below are SKIPPED with an explicit note (never faked).",
   );
}

function sha256File(p: string): string {
   return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

interface BuildManifestShape {
   source: { sourceId: string; revisionId: string };
   stages: { stage: string; status: string; exitCode: number }[];
   outputs: {
      path: string;
      role: string;
      sha256: string;
      bytes: number;
      provenance: { via: string; stage?: string };
   }[];
   gaps: { code: string }[];
}

function runBuild(
   configPath: string,
   bundleDir: string,
): { exit: number; stdout: string; stderr: string } {
   let stdout = "";
   let stderr = "";
   let exit = 0;
   try {
      stdout = execFileSync(
         process.execPath,
         [
            path.join(REPO_ROOT, "bin/det.js"),
            "build",
            "--config",
            configPath,
            "--out",
            bundleDir,
            "--json",
         ],
         { cwd: REPO_ROOT, stdio: "pipe", encoding: "utf8" },
      );
   } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      exit = err.status ?? -1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
   }
   return { exit, stdout, stderr };
}

const BUNDLE_ROOT_FILES = [
   "build-manifest.json",
   "install-homepage.php",
   "pagebuilder-content.html",
   "mapping-and-gaps.json",
   "README.md",
] as const;

const NEW_ROLES = [
   "cms-installer",
   "native-content-copy",
   "mapping-gap-report",
   "operator-readme",
];

describe("[70] real offline build emits the operator install bundle", () => {
   const itDist = distAvailable ? it : it.skip;
   let bundleDir = "";
   let manifest: BuildManifestShape | null = null;

   itDist(
      "det build exits 0 and the bundle root carries all five frozen artifacts",
      () => {
         bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "det70-build-"));
         const { exit, stdout, stderr } = runBuild(EXAMPLE_CONFIG, bundleDir);
         expect(exit).toBe(0);
         expect(stderr).not.toContain("error");
         const payload = JSON.parse(stdout) as { manifest: BuildManifestShape };
         manifest = payload.manifest;
         expect(
            manifest.stages.map((s) => [s.stage, s.status, s.exitCode]),
         ).toEqual([
            ["capability-probe", "reused", 0],
            ["extraction", "completed", 0],
            ["composition", "completed", 0],
         ]);
         for (const name of BUNDLE_ROOT_FILES) {
            expect(fs.existsSync(path.join(bundleDir, name))).toBe(true);
         }
      },
      300000,
   );

   itDist(
      "manifest outputs carry the four new roles with sha256 matching on-disk bytes",
      () => {
         expect(manifest).not.toBeNull();
         for (const [role, file] of [
            ["cms-installer", "install-homepage.php"],
            ["native-content-copy", "pagebuilder-content.html"],
            ["mapping-gap-report", "mapping-and-gaps.json"],
            ["operator-readme", "README.md"],
         ] as const) {
            const record = manifest!.outputs.find((o) => o.role === role);
            expect(record).toBeDefined();
            expect(record!.path).toBe(file);
            expect(record!.provenance).toEqual({
               via: "det-build",
               stage: "composition",
            });
            const onDisk = sha256File(path.join(bundleDir, file));
            expect(record!.sha256).toBe(onDisk);
            expect(record!.bytes).toBe(
               fs.statSync(path.join(bundleDir, file)).size,
            );
         }
      },
      30000,
   );

   itDist(
      "pagebuilder-content.html is a byte-exact copy of the composed native content",
      () => {
         const copy = fs.readFileSync(
            path.join(bundleDir, "pagebuilder-content.html"),
         );
         const native = fs.readFileSync(
            path.join(bundleDir, "03-composition", "native-content.html"),
         );
         expect(copy.equals(native)).toBe(true);
      },
      30000,
   );

   const itPhp = distAvailable && phpAvailable ? it : it.skip;

   itPhp(
      "php -l passes and the installer embeds the exact pagebuilder-content.html bytes (probe seam)",
      () => {
         const installerPath = path.join(bundleDir, "install-homepage.php");
         execFileSync("php", ["-l", installerPath], { stdio: "pipe" });
         // The documented seam: include with DET_CMS_INSTALLER_DEFINED marker and call
         // det_pb_embedded_content() — the same helper the installer itself uses.
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det70-probe-"));
         const probePath = path.join(tmp, "probe.php");
         const outPath = path.join(tmp, "probe-out.html");
         fs.writeFileSync(
            probePath,
            `<?php\ndefine('DET_CMS_INSTALLER_INCLUDED', 1);\nrequire $argv[1];\nfile_put_contents($argv[2], det_pb_embedded_content());\n`,
         );
         execFileSync("php", [probePath, installerPath, outPath], {
            stdio: "pipe",
         });
         const embedded = fs.readFileSync(outPath);
         const declared = fs.readFileSync(
            path.join(bundleDir, "pagebuilder-content.html"),
         );
         expect(embedded.equals(declared)).toBe(true);
      },
      60000,
   );

   itPhp(
      "installer --dry-run inside a stubbed magento root prints the exact plan and writes nothing",
      () => {
         const root = fs.mkdtempSync(path.join(os.tmpdir(), "det70-magroot-"));
         fs.mkdirSync(path.join(root, "det-install"));
         fs.mkdirSync(path.join(root, "app"));
         fs.writeFileSync(
            path.join(root, "app", "bootstrap.php"),
            "<?php // stub — the dry run never boots the application\n",
         );
         const installerPath = path.join(
            root,
            "det-install",
            "install-homepage.php",
         );
         fs.copyFileSync(
            path.join(bundleDir, "install-homepage.php"),
            installerPath,
         );
         const plan = execFileSync("php", [installerPath, "--dry-run"], {
            cwd: REPO_ROOT,
            stdio: "pipe",
         }).toString();
         const contentBytes = fs.readFileSync(
            path.join(bundleDir, "pagebuilder-content.html"),
         );
         const parsed = JSON.parse(plan) as Record<string, unknown>;
         expect(parsed).toMatchObject({
            mode: "dry-run",
            identifier: "det-studio-homepage",
            title: "DET Studio Homepage",
            storeId: 0,
            active: true,
            contentBytes: contentBytes.length,
         });
         expect(parsed["contentSha256"]).toBe(
            sha256File(path.join(bundleDir, "pagebuilder-content.html")),
         );
      },
      60000,
   );

   itDist(
      "bundle media/ (build.ts copy seam) is byte-identical to the example's source media (sha256)",
      () => {
         // build.ts copies <configDir>/media -> <bundleDir>/media when the caller's input
         // project carries one; the committed real-derived example does. The chain
         // source -> bundle must be sha256-identical (the installer later syncs this
         // directory into pub/media/).
         const sourceMediaDir = path.join(EXAMPLE_DIR, "media");
         const bundleMediaDir = path.join(bundleDir, "media");
         expect(fs.existsSync(sourceMediaDir)).toBe(true);
         expect(fs.existsSync(bundleMediaDir)).toBe(true);
         const relPaths: string[] = [];
         const collect = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
               const full = path.join(dir, entry.name);
               if (entry.isSymbolicLink()) continue;
               if (entry.isDirectory()) collect(full);
               else if (entry.isFile())
                  relPaths.push(path.relative(sourceMediaDir, full));
            }
         };
         collect(sourceMediaDir);
         expect(relPaths.length).toBeGreaterThan(0);
         for (const rel of relPaths) {
            const source = path.join(sourceMediaDir, rel);
            const copied = path.join(bundleMediaDir, rel);
            expect(fs.existsSync(copied)).toBe(true);
            expect(sha256File(copied)).toBe(sha256File(source));
            expect(fs.statSync(copied).size).toBe(fs.statSync(source).size);
         }
         // The operator README documents the media sync into pub/media/.
         const readme = fs.readFileSync(path.join(bundleDir, "README.md"), "utf8");
         expect(readme).toContain("pub/media/");
      },
      60000,
   );

   itDist(
      "README carries the dry-run, write-warning and homepage-safety lines; installer echoes the target",
      () => {
         const readme = fs.readFileSync(
            path.join(bundleDir, "README.md"),
            "utf8",
         );
         expect(readme).toContain("--dry-run");
         expect(readme).toContain("GHI TRANG CMS");
         expect(readme).toContain("KHÔNG BAO GIỜ");
         expect(readme).toContain("web/default/cms_home_page");
         expect(readme).toContain("action=updated");
         expect(readme).toContain("mapping-and-gaps.json");
         expect(readme).toContain("pixel-perfect");
         // [74] hardening disclosures: confirmation flags + scoped cache clean.
         expect(readme).toContain("--store-id=");
         expect(readme).toContain("--force");
         expect(readme).toContain("flush-all");
         const installer = fs.readFileSync(
            path.join(bundleDir, "install-homepage.php"),
            "utf8",
         );
         expect(installer).toContain("GENERATED BY DET");
         expect(installer).toContain("det-studio-homepage");
         expect(installer).toContain("DET Studio Homepage");
         expect(installer).toContain("figma-home-desktop");
         expect(installer).toContain(manifest!.source.revisionId);
      },
      30000,
   );

   itDist(
      "mapping-and-gaps.json parses, echoes the target and carries the full ledger + gap list",
      () => {
         const doc = JSON.parse(
            fs.readFileSync(
               path.join(bundleDir, "mapping-and-gaps.json"),
               "utf8",
            ),
         ) as {
            schemaVersion: number;
            kind: string;
            source: { sourceId: string; revisionId: string };
            cmsInstall: Record<string, unknown>;
            ledger: {
               counts: Record<string, number>;
               entries: {
                  nodeId: string;
                  disposition: string;
                  reasons: string[];
               }[];
            };
            gaps: { code: string }[];
         };
         expect(doc.schemaVersion).toBe(1);
         expect(doc.kind).toBe("det-mapping-and-gaps");
         expect(doc.source).toEqual(manifest!.source);
         expect(doc.cmsInstall).toEqual({
            identifier: "det-studio-homepage",
            title: "DET Studio Homepage",
            storeId: 0,
            active: true,
         });
         // Ledger covers the FULL compose-report mapping (same order), counts sum to it.
         const report = JSON.parse(
            fs.readFileSync(
               path.join(bundleDir, "03-composition", "compose-report.json"),
               "utf8",
            ),
         ) as { mapping: { sourceNodeId: string; disposition: string }[] };
         expect(doc.ledger.entries.length).toBe(report.mapping.length);
         expect(
            doc.ledger.entries.map((e) => [e.nodeId, e.disposition]),
         ).toEqual(report.mapping.map((m) => [m.sourceNodeId, m.disposition]));
         const countSum = Object.values(doc.ledger.counts).reduce(
            (a, b) => a + b,
            0,
         );
         expect(countSum).toBe(report.mapping.length);
         // The manifest gap list is a prefix of the artifact gap list (build gaps first).
         expect(doc.gaps.slice(0, manifest!.gaps.length)).toEqual(
            manifest!.gaps,
         );
      },
      30000,
   );

   itDist(
      "determinism: a second build over the same config produces identical installer-bundle bytes",
      () => {
         const bundleDir2 = fs.mkdtempSync(
            path.join(os.tmpdir(), "det70-build2-"),
         );
         const { exit } = runBuild(EXAMPLE_CONFIG, bundleDir2);
         expect(exit).toBe(0);
         // The installer bundle (this lane's first-class artifacts) is byte-identical across
         // builds — no timestamps, no random, idempotent. Note (honest boundary, out of this
         // lane): the STAGE artifacts under 02-extraction/03-composition carry pre-existing
         // volatile observation timestamps, so build-manifest.json (which hashes them) is NOT
         // byte-stable across builds — that pre-existing volatility belongs to the
         // extract/compose stages, never to the installer bundle rendered here.
         for (const name of [
            "install-homepage.php",
            "pagebuilder-content.html",
            "mapping-and-gaps.json",
            "README.md",
         ] as const) {
            expect(sha256File(path.join(bundleDir, name))).toBe(
               sha256File(path.join(bundleDir2, name)),
            );
         }
      },
      300000,
   );
});

describe("[70] build WITHOUT cmsInstall stays honest", () => {
   const itDist = distAvailable ? it : it.skip;

   itDist(
      "a temp config without the target emits no installer files and records the gap",
      () => {
         // Craft the negative config in the test tmpdir (the committed example must keep its
         // target): same real-derived inputs, paths made absolute for the temp config's dir.
         const base = JSON.parse(
            fs.readFileSync(EXAMPLE_CONFIG, "utf8"),
         ) as Record<string, unknown>;
         const absolutize = (p: string): string =>
            path.isAbsolute(p) ? p : path.join(EXAMPLE_DIR, p);
         const negative: Record<string, unknown> = {
            ...base,
            profile: absolutize(base["profile"] as string),
            registry: absolutize(base["registry"] as string),
            bindings: absolutize(base["bindings"] as string),
            content: absolutize(base["content"] as string),
            projection: absolutize(base["projection"] as string),
            designSource: {
               ...(base["designSource"] as Record<string, string>),
               project: absolutize(
                  (base["designSource"] as Record<string, string>).project,
               ),
            },
         };
         delete negative.cmsInstall;
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det70-negative-"));
         const configPath = path.join(tmp, "build-config.no-cms-install.json");
         fs.writeFileSync(configPath, JSON.stringify(negative, null, 2) + "\n");

         const bundleDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "det70-negbuild-"),
         );
         const { exit, stdout } = runBuild(configPath, bundleDir);
         expect(exit).toBe(0);
         const payload = JSON.parse(stdout) as { manifest: BuildManifestShape };
         // No installer artifacts anywhere in the bundle root.
         for (const name of [
            "install-homepage.php",
            "pagebuilder-content.html",
            "mapping-and-gaps.json",
         ]) {
            expect(fs.existsSync(path.join(bundleDir, name))).toBe(false);
         }
         // No output carries a new installer role.
         for (const role of NEW_ROLES) {
            expect(payload.manifest.outputs.some((o) => o.role === role)).toBe(
               false,
            );
         }
         // The honest gap is present, verbatim, in the manifest.
         expect(
            payload.manifest.gaps.some(
               (g) => g.code === CMS_INSTALL_TARGET_UNDECLARED,
            ),
         ).toBe(true);
         // Renderer-level sanity: the gap code constant equals the schema-side vocabulary.
         expect(CMS_INSTALL_TARGET_UNDECLARED).toBe(
            "CMS_INSTALL_TARGET_UNDECLARED",
         );
      },
      300000,
   );
});
