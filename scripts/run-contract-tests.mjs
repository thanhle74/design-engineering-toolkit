#!/usr/bin/env node
// det contract-gate runner ([68] module-owned suites).
//
// Replaces the pre-#68 root tests/run-all.mjs harness: suites now live NEXT TO their owning
// module's code as src/**/__tests__/*-suite.mjs with their fixtures beside them. This script
// is DISCOVERY + HARNESS only — it contains NO test cases and no domain logic, and it never
// references the removed root tests/ directory. Suites export a default register(checkAsync)
// exactly as before; checks execute in deterministic discovery order (path-sorted), sync and
// async bodies alike, and the report format (PASS/FAIL lines + "N/M checks passed") is kept
// byte-identical to the pre-#68 gate so CI and receipts keep working. A per-suite summary is
// appended for the [68] before/after test-inventory receipts.
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const results = [];
let failed = 0;
const asyncChecks = [];
let currentSuite = "";
const suiteCounts = new Map(); // suite rel path -> registered count
const checkAsync = (id, name, fn) => {
   asyncChecks.push({ id, name, fn, suite: currentSuite });
   suiteCounts.set(currentSuite, (suiteCounts.get(currentSuite) ?? 0) + 1);
};

// Discover src/**/__tests__/*-suite.mjs (deterministic full-path sort). Generated/test-data
// trees are never descended for suites.
const SKIP_DIRS = new Set(["node_modules", "dist", "__fixtures__"]);
function discoverSuites() {
   const suites = [];
   const walk = (dir) => {
      let entries;
      try {
         entries = readdirSync(dir, { withFileTypes: true });
      } catch {
         return;
      }
      for (const ent of [...entries].sort((a, b) =>
         a.name.localeCompare(b.name),
      )) {
         const child = path.join(dir, ent.name);
         if (ent.isDirectory()) {
            if (ent.name === "__tests__") {
               for (const f of readdirSync(child).sort((a, b) =>
                  a.localeCompare(b),
               )) {
                  if (f.endsWith("-suite.mjs"))
                     suites.push(path.join(child, f));
               }
               continue;
            }
            if (SKIP_DIRS.has(ent.name)) continue;
            walk(child);
         }
      }
   };
   walk(path.join(ROOT, "src"));
   return suites;
}

const suites = discoverSuites();
if (suites.length === 0) {
   console.error(
      "run-contract-tests: no *-suite.mjs found under src/**/__tests__ — nothing to run",
   );
   process.exit(2);
}

for (const suite of suites) {
   currentSuite = path.relative(ROOT, suite);
   const mod = await import(pathToFileURL(suite).href);
   if (typeof mod.default !== "function") {
      console.error(
         `run-contract-tests: ${currentSuite} has no default register(checkAsync) export`,
      );
      process.exit(2);
   }
   await mod.default(checkAsync);
}
currentSuite = "";

for (const { id, name, fn } of asyncChecks) {
   try {
      const detail = await fn();
      results.push({ id, name, ok: true, detail: detail ?? "" });
   } catch (e) {
      failed++;
      results.push({ id, name, ok: false, detail: String(e.message || e) });
   }
}

// ---- Report ------------------------------------------------------------------------------
console.log("Design Engineering Toolkit — contract test gate");
for (const r of results) {
   console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(6)} ${r.name}${r.ok ? `  [${r.detail}]` : `  !! ${r.detail}`}`,
   );
}
const passed = results.length - failed;
console.log("");
console.log("Per-suite registered checks ([68] module-owned suites):");
for (const [suite, count] of [...suiteCounts.entries()].sort((a, b) =>
   a[0].localeCompare(b[0]),
)) {
   console.log(`  ${String(count).padStart(3)}  ${suite}`);
}
console.log(
   `\n${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}`,
);
process.exit(failed ? 1 : 0);
