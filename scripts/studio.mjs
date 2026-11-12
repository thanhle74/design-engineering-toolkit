#!/usr/bin/env node
// [58] DET Studio root launcher — the ONE operator entrypoint ([63] single application).
//
//   pnpm run dev     → node scripts/studio.mjs dev    (Next dev server)
//   pnpm run start   → node scripts/studio.mjs start  (next build + next start)
//   pnpm run studio:build → node scripts/studio.mjs build (production build only)
//
// What it does, in order, all resolved from the REPOSITORY ROOT (this file's
// own location — never the caller's accidental cwd):
//   1. asserts Node >= 22.13 (Studio/Next 16 engine requirement);
//   2. installs dependencies once if missing (one root
//      `pnpm install --frozen-lockfile` against the single root pnpm lockfile
//      — [63] there is exactly one package/lockfile);
//   3. rebuilds the `det` dist/ when missing or stale vs src/core//src/modules engine sources/
//      (`pnpm run build:core`; the CLI that both `node bin/det.js` and the
//      Studio build runner use);
//   4. defaults STUDIO_DET_RUNS_DIR to <root>/out/studio-runs (created on
//      demand) ONLY when unset — every explicit STUDIO_* env value is passed
//      through untouched. The build-config catalogue needs no env at all:
//      committed examples are discovered in place by the Studio server;
//   5. runs `pnpm run app:dev|app:start` at the repository root in the
//      foreground with the merged environment (signals forwarded, exit code
//      propagated).
//
// `print-env` reports the resolved layout as one JSON line on stdout without
// installing, building or creating anything (used by tests/studio-startup-suite.mjs).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const STUDIO_MODULE_DIR = path.join(ROOT, "src", "modules", "studio");
const DET_DIST_ENTRY = path.join(ROOT, "dist", "src", "core", "cli", "main.js");
const RUNS_DIR_DEFAULT = path.join(ROOT, "out", "studio-runs");
// Node engines floor of the root package (Next 16); the headless core itself needs >=20.
const MIN_NODE = [22, 13, 0];

function fail(message) {
   process.stderr.write(`det studio: ${message}\n`);
   process.exit(1);
}

function log(message) {
   process.stderr.write(`[det studio] ${message}\n`);
}

function assertNodeVersion() {
   const parts = process.versions.node.split(".").map((n) => Number(n));
   const [maj = 0, min = 0, pat = 0] = parts;
   const [rMaj, rMin, rPat] = MIN_NODE;
   const tooOld =
      maj < rMaj ||
      (maj === rMaj && (min < rMin || (min === rMin && pat < rPat)));
   if (tooOld) {
      fail(
         `Node.js >= ${MIN_NODE.join(".")} is required (found ${process.versions.node}); ` +
            "DET Studio (Next.js 16) needs it. Install a newer Node and retry.",
      );
   }
}

/** Newest mtime (ms) of all matching files under the given dirs, recursively. */
function newestMtime(dirs, pattern) {
   let newest = 0;
   const walk = (dir) => {
      let infos;
      try {
         infos = readdirSync(dir, { withFileTypes: true });
      } catch {
         return;
      }
      for (const info of infos) {
         const full = path.join(dir, info.name);
         if (info.isDirectory()) {
            if (info.name === "node_modules" || info.name === ".next") continue;
            walk(full);
         } else if (info.isFile() && pattern.test(info.name)) {
            newest = Math.max(newest, statSync(full).mtimeMs);
         }
      }
   };
   for (const dir of dirs) walk(dir);
   return newest;
}

/** dist/ is stale when any engine source .ts is newer than every dist .js. */
function isCoreDistFresh() {
   if (!existsSync(DET_DIST_ENTRY)) return false;
   const srcNewest = newestMtime(
      [
         path.join(ROOT, "src", "core"),
         path.join(ROOT, "src", "modules", "figma"),
         path.join(ROOT, "src", "modules", "magento"),
         path.join(ROOT, "src", "modules", "knowledge"),
      ],
      /\.ts$/,
   );
   const distNewest = newestMtime([path.join(ROOT, "dist")], /\.js$/);
   if (srcNewest === 0) return true;
   return distNewest >= srcNewest;
}

function depsInstalled() {
   return existsSync(path.join(ROOT, "node_modules", "next", "package.json"));
}

function pnpmRun(args, label) {
   log(`${label} (pnpm ${args.join(" ")} at the repository root) …`);
   const result = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
   if (result.error !== undefined) {
      fail(`${label} could not start pnpm: ${result.error.message}`);
   }
   if (result.status !== 0) {
      fail(`${label} failed with exit code ${result.status ?? "signal"}.`);
   }
}

/**
 * Resolve the Studio environment: every STUDIO_* variable the operator set is
 * passed through untouched; only STUDIO_DET_RUNS_DIR gets a repository-root
 * default when unset (the directory is created lazily in run modes, never in
 * print-env). The build-config catalogue needs no env: the Studio server
 * discovers the committed resources/examples/build catalogue in place ([58]).
 */
function resolveEnv({ createDirs }) {
   const env = { ...process.env };
   const resolved = {};
   const runs = env.STUDIO_DET_RUNS_DIR;
   if (runs === undefined || runs.trim() === "") {
      if (createDirs) mkdirSync(RUNS_DIR_DEFAULT, { recursive: true });
      env.STUDIO_DET_RUNS_DIR = RUNS_DIR_DEFAULT;
      resolved.STUDIO_DET_RUNS_DIR = {
         value: RUNS_DIR_DEFAULT,
         source: "default",
      };
   } else {
      resolved.STUDIO_DET_RUNS_DIR = { value: runs, source: "env" };
   }
   for (const name of [
      "STUDIO_BUILD_PROJECTS_DIR",
      "STUDIO_DET_CLI",
      "STUDIO_DATA_DIR",
      "STUDIO_BUILD_TIMEOUT_MS",
   ]) {
      resolved[name] =
         env[name] === undefined
            ? { value: null, source: "unset" }
            : { value: env[name], source: "env" };
   }
   return { env, resolved };
}

function printEnv() {
   const { resolved } = resolveEnv({ createDirs: false });
   process.stdout.write(
      `${JSON.stringify({
         root: ROOT,
         studioDir: STUDIO_MODULE_DIR,
         coreDistEntry: DET_DIST_ENTRY,
         coreDistFresh: isCoreDistFresh(),
         studioDepsInstalled: depsInstalled(),
         env: resolved,
      })}\n`,
   );
}

function startStudio(mode) {
   assertNodeVersion();
   if (!depsInstalled()) {
      pnpmRun(
         ["install", "--frozen-lockfile"],
         "first run: installing dependencies (one root lockfile)",
      );
   }
   if (!isCoreDistFresh()) {
      pnpmRun(["run", "build:core"], "building the det core");
   }
   const { env, resolved } = resolveEnv({ createDirs: true });
   log(`repository root: ${ROOT}`);
   log(
      `runs dir: ${resolved.STUDIO_DET_RUNS_DIR.value} (${resolved.STUDIO_DET_RUNS_DIR.source === "default" ? "default — set STUDIO_DET_RUNS_DIR to override" : "from STUDIO_DET_RUNS_DIR"})`,
   );
   if (mode === "start" || mode === "build") {
      pnpmRun(["run", "build:app"], "building the Studio production bundle");
      if (mode === "build") return;
   }
   log(
      `starting Studio (${mode}) at the repository root — http://localhost:${env.PORT ?? 3000}${mode === "dev" ? "/build" : ""}`,
   );
   const child = spawn(
      "pnpm",
      ["run", mode === "dev" ? "app:dev" : "app:start"],
      {
         cwd: ROOT,
         env,
         stdio: "inherit",
      },
   );
   for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => child.kill(signal));
   }
   child.on("exit", (code, signal) => {
      process.exit(signal !== null ? 0 : (code ?? 1));
   });
   child.on("error", (error) =>
      fail(`could not start the Studio server: ${error.message}`),
   );
}

const mode = process.argv[2];
switch (mode) {
   case "dev":
   case "start":
   case "build":
      startStudio(mode);
      break;
   case "print-env":
      printEnv();
      break;
   default:
      fail("usage: node scripts/studio.mjs <dev|start|build|print-env>");
}
