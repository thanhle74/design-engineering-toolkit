// Issue #19 M4 suite (W-C part 1) — the byte-level licensed-source separation guard
// (scripts/kb-license-guard.mjs), the M4 exit-criteria gate for the private real-source store.
// Synthetic fixtures only: the "licensed" fixture content is invented acme-style sentences,
// never any real package text. Registers async checks on the shared run-all runner.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REPO_ROOT as ROOT } from "../../../../src/modules/core/__tests__/repo-root.mjs";
const GUARD = path.join(ROOT, "scripts", "kb-license-guard.mjs");

// Invented sentences (purely synthetic, acme-style). Long enough that a default 96-byte window
// at offset 0 lands wholly inside the sentence, so a full-sentence embed in a store is a hit.
const SENTENCES = [
   "The acme storefront hero renders a configurable promotion banner with layered callouts on every category landing page above the product grid.",
   "Acme checkout preserves the merchant configured payment step ordering and never rewrites a stored quote address without an explicit customer action.",
   "Acme navigation builds the category tree from the merchant curated structure and caches the resolved menu per store view until a merchant republishes it.",
];

function mkTemp(prefix) {
   return fs.mkdtempSync(path.join(os.tmpdir(), `det-m4-${prefix}-`));
}

function runGuard(storeDir, licensedRoot, extra = []) {
   const r = spawnSync(
      process.execPath,
      [GUARD, storeDir, licensedRoot, ...extra],
      { encoding: "utf8" },
   );
   return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// A fake "licensed" theme root: three text files (all whitelisted extensions), each starting
// with its distinctive sentence so the deterministic first window samples it. Sampling order is
// alphabetical by path: etc/config.xml < view/frontend/templates/hero.phtml <
// view/frontend/web/css/source.less (the last file carries SENTENCES[2], see KB-M4-L5).
function stageLicensedRoot() {
   const root = mkTemp("lic");
   const files = [
      [
         "etc/config.xml",
         SENTENCES[1],
         (s) =>
            `${s}\n<!-- acme synthetic config block -->\n<config><modules><Acme_StorefrontHero/></modules></config>\n`,
      ],
      [
         "view/frontend/templates/hero.phtml",
         SENTENCES[0],
         (s) =>
            `${s}\n<div class="acme-hero"><?= /* synthetic */ $block->getLabel() ?></div>\n`,
      ],
      [
         "view/frontend/web/css/source.less",
         SENTENCES[2],
         (s) =>
            `${s}\n.acme-hero { display: block; } /* synthetic style block */\n`,
      ],
   ];
   for (const [rel, sentence, render] of files) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, render(sentence));
   }
   return root;
}

function moduleRecordLine(notes) {
   return (
      JSON.stringify({
         schemaVersion: 1,
         recordType: "module",
         id: "mod:acme-storefront:hero-block",
         namespace: "acme-storefront",
         nativeId: "Acme_StorefrontHeroBlock",
         platform: "magento",
         platformVersion: "2.4.8-p5",
         origin: "custom",
         category: "platform-glue",
         title: "Acme storefront hero block",
         semantics:
            "Installed module declaration observed from synthetic registration records; platform inventory fact, not a capability claim.",
         installed: true,
         enablement: { state: "enabled", source: "config-scan" },
         sourceRef: {
            kind: "repo-file",
            locator: {
               rootAlias: "src",
               path: "app/code/Acme/StorefrontHero/etc/module.xml",
            },
         },
         evidence: {
            proofLevel: "DETECTED",
            confidence: "high",
            method: "module-declaration-scan",
            uncertainty: [
               "Declaration-only inventory; runtime enablement is a separate fact.",
            ],
         },
         lifecycle: { state: "ACTIVE", reviewStatus: "unreviewed" },
         observed: { scannedAt: "2026-11-06T00:00:00.000Z" },
         notes,
      }) + "\n"
   );
}

function stageStore(records) {
   const store = mkTemp("store");
   fs.mkdirSync(path.join(store, "platform"), { recursive: true });
   fs.writeFileSync(
      path.join(store, "platform", "records.jsonl"),
      records.join(""),
   );
   return store;
}

export default async function registerKbM4LicenseSuite(checkAsync) {
   await checkAsync(
      "KB-M4-L1",
      "license guard: licensed sentence embedded in a store record -> exit 1, content never echoed, store file + licensed path named",
      async () => {
         const lic = stageLicensedRoot();
         const store = stageStore([moduleRecordLine(SENTENCES[0])]);
         const r = runGuard(store, lic, ["--json"]);
         assert.equal(r.code, 1, `expected exit 1, got ${r.code}: ${r.stderr}`);
         const report = JSON.parse(r.stdout);
         assert.equal(report.clean, false);
         assert.equal(
            report.counts.findings >= 1,
            true,
            JSON.stringify(report.counts),
         );
         const hit = report.findings.find(
            (f) => f.kind === "LICENSED_WINDOW_HIT",
         );
         assert.ok(hit, "expected a LICENSED_WINDOW_HIT finding");
         assert.equal(hit.storeFile, "platform/records.jsonl");
         assert.equal(
            hit.line,
            1,
            "the poisoned record is the first store line",
         );
         assert.equal(hit.licensedPath, "view/frontend/templates/hero.phtml");
         assert.ok(
            /^hit:[0-9a-f]{16}$/.test(hit.match),
            `match must be a redacted hash prefix, got '${hit.match}'`,
         );
         // Content redaction: neither the sentence nor any long fragment of it may appear anywhere.
         for (const needle of [
            SENTENCES[0],
            SENTENCES[0].slice(0, 60),
            "layered callouts",
         ]) {
            assert.ok(
               !r.stdout.includes(needle) && !r.stderr.includes(needle),
               `licensed content fragment leaked into guard output ('${needle.slice(0, 30)}…')`,
            );
         }
         return `hit at ${hit.storeFile}:${hit.line} from ${hit.licensedPath}, redacted ${hit.match}`;
      },
   );

   await checkAsync(
      "KB-M4-L2",
      "license guard: clean store -> exit 0 with honest bounded-sampling counts",
      async () => {
         const lic = stageLicensedRoot();
         const store = stageStore([
            moduleRecordLine(
               "Synthetic inventory summary; no source bytes retained.",
            ),
            moduleRecordLine("Second synthetic module summary."),
         ]);
         const r = runGuard(store, lic, ["--json"]);
         assert.equal(
            r.code,
            0,
            `expected exit 0, got ${r.code}: ${r.stdout}${r.stderr}`,
         );
         const report = JSON.parse(r.stdout);
         assert.equal(report.clean, true);
         assert.deepEqual(report.findings, []);
         assert.equal(
            report.mode,
            "bounded-sampling",
            "receipt must state the bounded-sampling mode",
         );
         assert.equal(
            report.counts.licensedSampled,
            3,
            "all three licensed fixture files sampled",
         );
         assert.equal(report.counts.samplingTruncated, false);
         assert.ok(
            report.counts.windowsTested >= 3,
            `windows must be tested, got ${report.counts.windowsTested}`,
         );
         assert.ok(report.counts.windowsUnique >= 3);
         assert.ok(
            report.counts.storeFilesScanned >= 1,
            "store side must actually scan files",
         );
         // Guard output portability: no absolute path anywhere in the machine report.
         assert.ok(
            !r.stdout.includes(lic),
            "guard output must not carry the licensed root's absolute path",
         );
         assert.ok(
            !r.stdout.includes(store),
            "guard output must not carry the store's absolute path",
         );
         assert.ok(
            /not exhaustive proof/.test(report.note),
            "the honest-limit note must be present",
         );
         return `clean: ${report.counts.licensedSampled} sampled, ${report.counts.windowsTested} windows, ${report.counts.storeFilesScanned} store files`;
      },
   );

   await checkAsync(
      "KB-M4-L3",
      "license guard: absolute licensed-root path in a store JSON -> ABSOLUTE_LICENSED_PATH finding, path never echoed",
      async () => {
         const lic = stageLicensedRoot();
         const store = mkTemp("store-abs");
         fs.writeFileSync(
            path.join(store, "pointers.json"),
            JSON.stringify({
               sourcePointer: lic,
               note: "synthetic store descriptor stub",
            }) + "\n",
         );
         const r = runGuard(store, lic, ["--json"]);
         assert.equal(
            r.code,
            1,
            `expected exit 1, got ${r.code}: ${r.stdout}${r.stderr}`,
         );
         const report = JSON.parse(r.stdout);
         const finding = report.findings.find(
            (f) => f.kind === "ABSOLUTE_LICENSED_PATH",
         );
         assert.ok(
            finding,
            `expected ABSOLUTE_LICENSED_PATH, got ${JSON.stringify(report.findings)}`,
         );
         assert.equal(finding.storeFile, "pointers.json");
         assert.ok(
            /^abs:[0-9a-f]{16}$/.test(finding.match),
            `abs finding must be redacted, got '${finding.match}'`,
         );
         // Output portability: the absolute path itself must not appear anywhere in the guard output.
         assert.ok(
            !r.stdout.includes(lic) && !r.stderr.includes(lic),
            "absolute licensed path leaked into guard output",
         );
         return `ABSOLUTE_LICENSED_PATH at ${finding.storeFile}:${finding.line}, redacted`;
      },
   );

   await checkAsync(
      "KB-M4-L4",
      "license guard is deterministic: identical inputs -> byte-identical JSON report",
      async () => {
         const lic = stageLicensedRoot();
         const store = stageStore([moduleRecordLine(SENTENCES[1])]);
         const a = runGuard(store, lic, ["--json"]);
         const b = runGuard(store, lic, ["--json"]);
         assert.equal(a.code, b.code);
         assert.equal(
            a.stdout,
            b.stdout,
            "two runs on identical inputs must produce byte-identical reports",
         );
         const report = JSON.parse(a.stdout);
         assert.ok(
            report.findings.length >= 1,
            "determinism run must exercise the findings serialization too",
         );
         return `${report.counts.findings} finding(s), byte-identical across runs`;
      },
   );

   await checkAsync(
      "KB-M4-L5",
      "license guard --max-files bound: truncation is reported honestly and bounds the assertion",
      async () => {
         // Sentence order by sampled path: etc/config.xml < view/frontend/templates/hero.phtml <
         // view/frontend/web/css/source.less — the poisoned content (SENTENCES[2]) sorts LAST.
         const lic = stageLicensedRoot();
         const store = stageStore([moduleRecordLine(SENTENCES[2])]);
         const bounded = runGuard(store, lic, ["--json", "--max-files", "2"]);
         assert.equal(
            bounded.code,
            0,
            "with the poisoned file beyond the sample bound the run must be clean",
         );
         const boundedReport = JSON.parse(bounded.stdout);
         assert.equal(boundedReport.counts.licensedSampled, 2);
         assert.equal(
            boundedReport.counts.samplingTruncated,
            true,
            "truncation must be flagged, not hidden",
         );
         const full = runGuard(store, lic, ["--json"]);
         assert.equal(
            full.code,
            1,
            "the default bound must sample the poisoned file",
         );
         const fullReport = JSON.parse(full.stdout);
         assert.equal(fullReport.counts.samplingTruncated, false);
         assert.equal(
            fullReport.findings[0].licensedPath,
            "view/frontend/web/css/source.less",
         );
         return "bound limits sampling and is honestly reported (bounded assertion, not exhaustive)";
      },
   );

   await checkAsync(
      "KB-M4-L6",
      "license guard normalizes CRLF: LF licensed file is caught through a CRLF-serialized store",
      async () => {
         const lic = mkTemp("lic-crlf");
         const store = mkTemp("store-crlf");
         fs.mkdirSync(path.join(store, "platform"), { recursive: true });
         const lineA = `"Acme button block renders the merchant label through the configured template."`;
         const lineB = `{"note":"Synthetic continuation record so the first window crosses a line boundary."}`;
         const bodyLf = `${lineA}\n${lineB}\n`;
         fs.writeFileSync(path.join(lic, "note.txt"), bodyLf);
         fs.writeFileSync(
            path.join(store, "platform", "records.jsonl"),
            bodyLf.replace(/\n/g, "\r\n"),
         );
         const r = runGuard(store, lic, ["--json"]);
         assert.equal(
            r.code,
            1,
            `CRLF store bytes must still hit after normalization: ${r.stdout}`,
         );
         const report = JSON.parse(r.stdout);
         const hit = report.findings.find(
            (f) => f.kind === "LICENSED_WINDOW_HIT",
         );
         assert.ok(hit, "expected a window hit across the CRLF boundary");
         assert.equal(hit.licensedPath, "note.txt");
         assert.ok(
            !r.stdout.includes("Acme button block renders"),
            "matched content must stay redacted",
         );
         return `LF-licensed/CRLF-store hit at ${hit.storeFile}:${hit.line}`;
      },
   );

   await checkAsync(
      "KB-M4-L7",
      "license guard usage errors fail closed with exit 2",
      async () => {
         assert.equal(runGuard().code, 2, "no arguments is a usage error");
         assert.equal(
            runGuard(path.join(os.tmpdir())).code,
            2,
            "one argument is a usage error",
         );
         const missing = path.join(
            os.tmpdir(),
            "det-m4-definitely-absent",
            "x",
         );
         const lic = stageLicensedRoot();
         assert.equal(
            runGuard(missing, lic).code,
            2,
            "missing store dir is a usage error",
         );
         assert.equal(
            runGuard(lic, missing).code,
            2,
            "missing licensed root is a usage error",
         );
         const store = stageStore([moduleRecordLine("synthetic")]);
         const badFlag = spawnSync(
            process.execPath,
            [GUARD, store, lic, "--frobnicate"],
            { encoding: "utf8" },
         );
         assert.equal(badFlag.status, 2, "unknown flag is a usage error");
         assert.equal(
            runGuard(store, lic, ["--window-bytes", "0"]).code,
            2,
            "non-positive window bytes is a usage error",
         );
         assert.equal(
            runGuard(store, lic, ["--max-files", "abc"]).code,
            2,
            "non-integer max-files is a usage error",
         );
         return "usage errors exit 2, never scan";
      },
   );
}
