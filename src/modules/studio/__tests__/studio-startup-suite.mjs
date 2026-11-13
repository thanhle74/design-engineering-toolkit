// [58] suite: single-root startup — one operator entrypoint and the in-place
// canonical project catalogue. Locks the [58] operator contract offline:
// cwd-independent root resolution with explicit-env passthrough (launcher),
// the committed resources/examples/build catalogue shape (single canonical entry, no
// stale/duplicate configs), a real in-place `det build` that writes NOTHING
// into the committed project, and the root script wiring. All checks are
// deterministic, fully offline, and never touch Figma/Magento.
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../../../../dist/src/modules/core/cli/main.js";

import { REPO_ROOT as ROOT } from "../../../../src/modules/core/__tests__/repo-root.mjs";
const STUDIO_SCRIPT = path.join(ROOT, "scripts", "studio.mjs");
const SETUP_SCRIPT = path.join(ROOT, "scripts", "setup.mjs");
const PROJECT = path.join(
   ROOT,
   "resources",
   "examples",
   "build",
   "slaunchpad-home-real-derived",
);
const CANONICAL_ID = "slaunchpad-home-real-derived";
// [#72] the deliberate SECOND committed build project: same pinned source, extended recorded
// projection/manifest proving the #72 generalized handlers; store-5 isolated installer target.
const EXTENDED_ID = "slaunchpad-home-72-extended";
// src/modules/studio/server/artifact-access.ts RUN_ID_PATTERN (same id space).
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function runLauncher(args, opts = {}) {
   return spawnSync(process.execPath, [STUDIO_SCRIPT, ...args], {
      encoding: "utf8",
      ...opts,
   });
}

/** relPath → `${sha256} ${mtimeMs}` for every file under dir (recursive). */
function snapshot(dir) {
   const out = new Map();
   const walk = (current) => {
      for (const info of fs.readdirSync(current, { withFileTypes: true })) {
         const full = path.join(current, info.name);
         if (info.isDirectory()) walk(full);
         else if (info.isFile()) {
            const stat = fs.statSync(full);
            const sha = createHash("sha256")
               .update(fs.readFileSync(full))
               .digest("hex");
            out.set(path.relative(dir, full), `${sha} ${stat.mtimeMs}`);
         }
      }
   };
   walk(dir);
   return out;
}

export default async function registerStudioStartupSuite(checkAsync) {
   checkAsync(
      "R58-T1",
      "root launcher resolves the repository layout cwd-independently (print-env)",
      async () => {
         const fromTmp = runLauncher(["print-env"], { cwd: os.tmpdir() });
         assert.equal(
            fromTmp.status,
            0,
            `launcher failed from tmp cwd: ${fromTmp.stderr}`,
         );
         const tmp = JSON.parse(fromTmp.stdout);
         assert.equal(tmp.root, ROOT);
         assert.equal(
            tmp.studioDir,
            path.join(ROOT, "src", "modules", "studio"),
         );
         assert.equal(
            tmp.env.STUDIO_DET_RUNS_DIR.value,
            path.join(ROOT, "out", "studio-runs"),
         );
         assert.equal(tmp.env.STUDIO_DET_RUNS_DIR.source, "default");
         assert.equal(tmp.env.STUDIO_BUILD_PROJECTS_DIR.source, "unset");
         // same resolution from the repo root (no cd games anywhere in the flow)
         const fromRoot = runLauncher(["print-env"], { cwd: ROOT });
         assert.equal(fromRoot.status, 0, fromRoot.stderr);
         assert.deepEqual(JSON.parse(fromRoot.stdout).root, ROOT);
      },
   );

   checkAsync(
      "R58-T2",
      "explicit STUDIO_* env values pass through the launcher untouched",
      async () => {
         const tmpRuns = fs.mkdtempSync(path.join(os.tmpdir(), "det58-runs-"));
         const result = runLauncher(["print-env"], {
            cwd: os.tmpdir(),
            env: {
               ...process.env,
               STUDIO_DET_RUNS_DIR: tmpRuns,
               STUDIO_BUILD_PROJECTS_DIR: tmpRuns,
               STUDIO_DET_CLI: "/opt/det/det.js",
            },
         });
         assert.equal(result.status, 0, result.stderr);
         const parsed = JSON.parse(result.stdout);
         assert.deepEqual(parsed.env.STUDIO_DET_RUNS_DIR, {
            value: tmpRuns,
            source: "env",
         });
         assert.deepEqual(parsed.env.STUDIO_BUILD_PROJECTS_DIR, {
            value: tmpRuns,
            source: "env",
         });
         assert.deepEqual(parsed.env.STUDIO_DET_CLI, {
            value: "/opt/det/det.js",
            source: "env",
         });
      },
   );

   checkAsync(
      "R58-T3",
      "canonical catalogue shape: the committed build-catalogue entries, id-safe, no stale duplicates",
      () => {
         const entries = fs
            .readdirSync(path.join(ROOT, "resources", "examples", "build"), {
               withFileTypes: true,
            })
            .filter(
               (d) =>
                  d.isDirectory() &&
                  fs.existsSync(
                     path.join(
                        ROOT,
                        "resources",
                        "examples",
                        "build",
                        d.name,
                        "build-config.json",
                     ),
                  ),
            )
            .map((d) => d.name)
            .sort();
         assert.deepEqual(entries, [EXTENDED_ID, CANONICAL_ID]);
         assert.match(CANONICAL_ID, RUN_ID_PATTERN);
         assert.match(EXTENDED_ID, RUN_ID_PATTERN);
         // the committed config stays self-contained/in place (config-relative paths)
         const config = JSON.parse(
            fs.readFileSync(path.join(PROJECT, "build-config.json"), "utf8"),
         );
         assert.equal(config.profile, "profile.json");
         assert.equal(config.designSource.project, "snapshot-project");
      },
   );

   checkAsync(
      "R58-T4",
      "in-place det build over the committed project writes NOTHING into it",
      async () => {
         const before = snapshot(PROJECT);
         const out = fs.mkdtempSync(path.join(os.tmpdir(), "det58-build-"));
         const code = await main(
            [
               "build",
               "--config",
               path.join(PROJECT, "build-config.json"),
               "--out",
               out,
               "--json",
            ],
            {},
            { env: {}, out: () => {}, err: () => {} },
         );
         assert.equal(code, 0, "in-place det build must exit 0");
         const after = snapshot(PROJECT);
         assert.deepEqual(
            [...after.entries()].sort(),
            [...before.entries()].sort(),
            "committed project files (content + mtime) must be untouched by an in-place build",
         );
      },
   );

   checkAsync(
      "R58-T5",
      "root scripts wired: setup once, then pnpm run dev/start at the repository root",
      () => {
         const pkg = JSON.parse(
            fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
         );
         assert.equal(pkg.scripts.setup, "node scripts/setup.mjs");
         assert.equal(pkg.scripts.dev, "node scripts/studio.mjs dev");
         assert.equal(pkg.scripts.start, "node scripts/studio.mjs start");
         assert.equal(
            pkg.scripts["studio:build"],
            "node scripts/studio.mjs build",
         );
         assert.equal(fs.existsSync(SETUP_SCRIPT), true);
         assert.equal(fs.existsSync(STUDIO_SCRIPT), true);
      },
   );
}
