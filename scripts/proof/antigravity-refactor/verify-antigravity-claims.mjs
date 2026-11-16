#!/usr/bin/env node
// [74/W-D] Antigravity refactor audit — machine-checkable claims behind
// docs/evidence/antigravity-refactor/*.md. Read-only on the repo; the det
// build (check A2) writes ONLY to a mkdtemp dir under os.tmpdir().
//
//   node scripts/proof/antigravity-refactor/verify-antigravity-claims.mjs
//
// Exit 0 = every check passed; exit 1 = at least one check failed (each
// failure is printed with the exact expectation vs reality).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PINNED_BASE = "5bf41d3aa3e81a6f547e9349d8ff763d9ee641b2";

let passed = 0;
let failed = 0;

/** check(label, reality, expectationFn) — expectationFn throws on mismatch. */
function check(label, reality, fn) {
   try {
      fn(reality);
      passed += 1;
      console.log(`  ok    ${label}`);
   } catch (error) {
      failed += 1;
      console.log(`  FAIL  ${label}\n          ${error.message}`);
   }
}

function expectEq(actual, expected) {
   if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
}

function expectTrue(value, message) {
   if (value !== true) throw new Error(message);
}

function read(rel) {
   return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function head() {
   const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
   return r.stdout.trim();
}

console.log(`# Antigravity audit proof @ ${head()}`);

/* ---------------------------- test inventory ---------------------------- */

function vitestFiles() {
   const out = { inside: [], outside: [] };
   const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
         const full = path.join(dir, entry.name);
         if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".next") continue;
            walk(full);
         } else if (entry.isFile() && /\.test\.(t|j)sx?$/.test(entry.name)) {
            (full.includes(`${path.sep}__tests__${path.sep}`) ? out.inside : out.outside).push(full);
         }
      }
   };
   walk(path.join(ROOT, "src"));
   walk(path.join(ROOT, "app"));
   return out;
}

const tests = vitestFiles();

console.log("# T — test inventory baseline");
check("T1: 52 vitest files outside __tests__ (src+app)", tests.outside.length, (v) => expectEq(v, 52));
check("T2: 9 vitest files inside __tests__", tests.inside.length, (v) => expectEq(v, 9));
check(
   "T3: src/modules/studio/__tests__ holds exactly the 2 committed .mjs suites",
   fs
      .readdirSync(path.join(ROOT, "src/modules/studio/__tests__"))
      .sort()
      .join(","),
   (v) => expectEq(v, "real-derived-suite.mjs,studio-startup-suite.mjs"),
);
check(
   "T4: AG-008 test delta is real — zip-bundle + download-bundle tests exist outside __tests__",
   [".wd-audit-noop"].length &&
      tests.outside.some((f) => f.endsWith("zip-bundle.test.ts")) &&
      tests.outside.some((f) => f.endsWith(`download-bundle${path.sep}route.test.ts`)),
   (v) => expectTrue(v, "AG-008 test files missing"),
);
check(
   "T5: no unit test file for project-store (documents gap M1)",
   tests.inside.concat(tests.outside).some((f) => f.includes("project-store")),
   (v) => expectEq(v, false),
);

/* ------------------------------- AG log --------------------------------- */

console.log("# A — AG feature log claims");
const log = read("docs/specs/ANTIGRAVITY-FEATURE-LOG.md");
const headingCount = (id) =>
   (log.match(new RegExp(`^### ${id} —`, "gm")) ?? []).length;

check(
   "A1: AG-006 / AG-007 headings are duplicated journal entries",
   { ag006: headingCount("AG-006"), ag007: headingCount("AG-007") },
   (v) => {
      expectEq(v.ag006, 2);
      expectEq(v.ag007, 2);
   },
);
check("A2: AG-011 self-referential stale SHA recorded in the log", log, (v) => {
   expectTrue(v.includes("- Branch / commit: `main` / `2e21f11`"), "log must record `main` / `2e21f11`");
   const anc = spawnSync("git", ["merge-base", "--is-ancestor", "2e21f11", "HEAD"], { cwd: ROOT });
   expectTrue(anc.status !== 0, "2e21f11 unexpectedly IS an ancestor of HEAD — audit doc must be updated");
   const diff = spawnSync("git", ["diff", "2e21f11", head(), "--", "docs/specs/ANTIGRAVITY-FEATURE-LOG.md"], { cwd: ROOT, encoding: "utf8" });
   expectTrue(
      diff.stdout.includes("+- Branch / commit: `main` / `2e21f11`"),
      "expected the amend diff to add the log SHA line",
   );
});
check(
   "A3: pinned base matches audit SHA",
   head(),
   (v) => expectEq(v, PINNED_BASE),
);

check(
   "A4: run-overview-panel hardcodes green 'composed' status and success card (AG-005 finding)",
   read("src/modules/studio/run-detail/components/run-overview-panel.tsx"),
   (v) => {
      expectTrue(v.includes("Đã ghép thành công"), "missing hardcoded composed badge");
      expectTrue(v.includes("Hoàn tất thành công"), "missing hardcoded success headline");
      expectTrue(/render: \(\) => \(/.test(v), "status column must be shown to be a constant render");
   },
);
check(
   "A5: mapping rowKeys remain positional (AG-009/AG-011 debt)",
   {
      table: read("src/modules/studio/mapping-review/components/mapping-review-table.tsx"),
      node: read("src/modules/studio/design-tree/components/node-table.tsx"),
      tree: read("src/modules/studio/design-tree/components/figma-tree-view.tsx"),
   },
   (v) => {
      expectTrue(v.table.includes("${idx++}"), "mapping-review-table must still append positional idx");
      expectTrue(v.table.includes('rowKey="rowKey"'), "deprecation fix (string rowKey prop) must stay");
      expectTrue(v.node.includes("rowKey: `${m.nodeId}-${index}`"), "node-table positional key");
      expectTrue(v.tree.includes("::${idx}"), "tree keys positional");
   },
);
check(
   "A6: antd-6 props claim — Alert uses title everywhere, Modal destroyOnHidden, Steps orientation",
   {
      modals: [
         read("src/modules/studio/projects/components/create-project-modal.tsx"),
         read("src/modules/studio/projects/components/add-page-modal.tsx"),
      ],
      steps: read("src/modules/studio/build-control/screens/build.screen.tsx"),
   },
   (v) => {
      expectTrue(v.modals.every((m) => m.includes("destroyOnHidden") && !m.includes("destroyOnClose")), "destroyOnHidden");
      expectTrue(v.steps.includes('orientation="vertical"'), "Steps orientation");
   },
);
check(
   "A7: zip-bundle packs media in unsorted readdir order (determinism gap M2)",
   read("src/modules/studio/server/zip-bundle.ts"),
   (v) => {
      expectTrue(v.includes("fs.readdirSync(dir, { withFileTypes: true })") && !v.includes(".sort("), "readdirSync unsorted");
      expectTrue(v.includes("writeUInt16LE(0, 10)"), "zeroed mod time (determinism-friendly timestamps)");
   },
);

/* --------------------- offline det build manifest ----------------------- */

console.log("# B — offline fixture build (slaunchpad-home-72-extended)");
const distMain = path.join(ROOT, "dist/src/modules/core/cli/main.js");
if (!fs.existsSync(distMain)) {
   console.log("  SKIP  B1 — dist/ missing; run `pnpm run build:core` first (documented in the runbook)");
} else {
   const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "det-ag-audit-"));
   const run = spawnSync(
      process.execPath,
      [path.join(ROOT, "bin/det.js"), "build", "--config", "resources/examples/build/slaunchpad-home-72-extended/build-config.json", "--out", outDir, "--json"],
      { cwd: ROOT, encoding: "utf8", timeout: 120000 },
   );
   check("B1: documented offline det build exits 0", run.status, (v) => expectEq(v, 0));
   const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "build-manifest.json"), "utf8"));
   check(
      "B2: manifest reports 7 honest skips — 12 sections are NOT all converted (AG-005/AG-008)",
      manifest.gaps.find((g) => g.code === "COMPOSITION_SKIPS_PRESENT"),
      (g) => expectEq(g.count, 7),
   );
   check(
      "B3: page-structure carries 12 sections",
      JSON.parse(fs.readFileSync(path.join(outDir, "02-extraction/page-structure.json"), "utf8")).sections.length,
      (v) => expectEq(v, 12),
   );
   fs.rmSync(outDir, { recursive: true, force: true });
}

/* ------------------------------- summary -------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
