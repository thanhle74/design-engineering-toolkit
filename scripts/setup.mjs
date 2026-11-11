#!/usr/bin/env node
// [58] One-time setup — `npm run setup` at the repository root.
//
// Installs BOTH committed lockfiles deterministically (root `npm ci` +
// apps/studio `npm ci` — the Studio app keeps its own lockfile, so the
// existing isolated Studio CI is untouched) and compiles the det core dist/.
// Afterwards the operator only ever needs `npm run dev` (see
// scripts/studio.mjs, which also self-installs when something is missing).

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const STUDIO_DIR = path.join(ROOT, "apps", "studio");
const MIN_NODE = [22, 13, 0];

function fail(message) {
  process.stderr.write(`det setup: ${message}\n`);
  process.exit(1);
}

function log(message) {
  process.stderr.write(`[det setup] ${message}\n`);
}

const [maj = 0, min = 0, pat = 0] = process.versions.node.split(".").map(Number);
const [rMaj, rMin, rPat] = MIN_NODE;
if (maj < rMaj || (maj === rMaj && (min < rMin || (min === rMin && pat < rPat)))) {
  fail(
    `Node.js >= ${MIN_NODE.join(".")} is required (found ${process.versions.node}); ` +
      "DET Studio (Next.js 16) needs it."
  );
}

function npmCi(cwd, label) {
  log(`${label} (npm ci in ${path.relative(ROOT, cwd) || "."}) …`);
  const result = spawnSync("npm", ["ci"], { cwd, stdio: "inherit" });
  if (result.error !== undefined) fail(`${label} could not start npm: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status ?? "signal"}.`);
}

npmCi(ROOT, "installing core dependencies");
npmCi(STUDIO_DIR, "installing Studio dependencies");

log("building the det core (npm run build in .) …");
const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
if (build.status !== 0) fail(`core build failed with exit code ${build.status ?? "signal"}.`);

log("setup complete.");
process.stderr.write(
  "\nNext step:  npm run dev        # starts DET Studio at http://localhost:3000/build\n" +
    "            (production mode:  npm run start)\n\n"
);
