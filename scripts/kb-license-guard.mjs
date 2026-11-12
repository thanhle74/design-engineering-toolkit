#!/usr/bin/env node
// Knowledge Engine M4 (issue #19) — byte-level licensed-source separation guard.
//
// The M4 exit-criteria gate: a private local-kb/ real-source store must carry ZERO bytes of the
// licensed source tree (e.g. a commercial Hyvä package). This guard samples deterministic text
// windows from the licensed root and scans every *.json/*.jsonl file of the store for them.
// It is deliberately a BOUNDED SAMPLING assertion (documented in the report): a clean run is
// strong evidence of separation, not an exhaustive proof of zero licensed bytes.
//
// Usage:
//   node scripts/kb-license-guard.mjs <storeDir> <licensedRoot> \
//     [--max-files N] [--window-bytes B] [--windows-per-file K] [--json]
//
// Semantics:
//   - Licensed walk is deterministic (code-unit path sort). Skipped: deny-list-shaped paths
//     (.git/, node_modules/, var/, generated/, pub/media/), binary-ish files (extension not in
//     the sampling whitelist), and files > 2 MiB are sampled at the FIRST window only.
//   - Windows: up to K disjoint windows of B bytes (defaults B=96, K=3) at deterministic
//     offsets (start, 1/K, 2/K, ... of the file length), CRLF-normalized; windows whose
//     alphanumeric content share is <= 75% are skipped (trivial whitespace/punctuation filler).
//   - Findings never echo matched content: matches are redacted to hit:<sha256-prefix>.
//   - Separate finding class ABSOLUTE_LICENSED_PATH: the store must never contain the licensed
//     root's absolute path string — path pointers in a store are alias-relative by contract.
//   - The guard's own output never carries an absolute path either (basename refs only), so a
//     receipt can be pasted anywhere without leaking an owner path.
//
// Exit codes: 0 clean, 1 findings, 2 usage error.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MAX_SAMPLE_FILE_BYTES = 2 * 1024 * 1024; // files above this size: first window only
const FINDINGS_CAP = 200; // deterministic cap; further occurrences set findingsTruncated
const HASH_HEX = 16;
const TEXT_EXTENSIONS = new Set([
   ".php",
   ".phtml",
   ".html",
   ".css",
   ".js",
   ".ts",
   ".jsx",
   ".tsx",
   ".json",
   ".xml",
   ".md",
   ".txt",
   ".less",
   ".scss",
   ".yml",
   ".yaml",
   ".graphql",
]);
const DENY_SEGMENTS = new Set([".git", "node_modules", "var", "generated"]);
const STORE_EXTENSIONS = new Set([".json", ".jsonl"]);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Hex = (buf) =>
   crypto.createHash("sha256").update(buf).digest("hex");
const extensionOf = (rel) => {
   const base = rel.slice(rel.lastIndexOf("/") + 1);
   const dot = base.lastIndexOf(".");
   return dot === -1 ? "" : base.slice(dot).toLowerCase();
};

function usageError(message) {
   console.error(`kb-license-guard: ${message}`);
   console.error(
      "usage: kb-license-guard.mjs <storeDir> <licensedRoot> [--max-files N] [--window-bytes B] [--windows-per-file K] [--json]",
   );
   process.exit(2);
}

function parseArgs(argv) {
   const positional = [];
   const opts = {
      maxFiles: 400,
      windowBytes: 96,
      windowsPerFile: 3,
      json: false,
   };
   for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--json") opts.json = true;
      else if (
         a === "--max-files" ||
         a === "--window-bytes" ||
         a === "--windows-per-file"
      ) {
         const value = Number(argv[++i]);
         if (!Number.isInteger(value) || value < 1)
            usageError(`${a} expects a positive integer, got '${argv[i]}'`);
         if (a === "--max-files") opts.maxFiles = Math.min(value, 100000);
         if (a === "--window-bytes") opts.windowBytes = Math.min(value, 65536);
         if (a === "--windows-per-file")
            opts.windowsPerFile = Math.min(value, 16);
      } else if (a.startsWith("--")) usageError(`unknown flag '${a}'`);
      else positional.push(a);
   }
   if (positional.length !== 2)
      usageError(
         "exactly two positional arguments are required: <storeDir> <licensedRoot>",
      );
   return { storeDir: positional[0], licensedRoot: positional[1], opts };
}

function isDeniedRel(rel) {
   const segs = rel.split("/");
   for (let i = 0; i < segs.length; i++) {
      if (DENY_SEGMENTS.has(segs[i])) return true;
      if (segs[i] === "pub" && i + 1 < segs.length && segs[i + 1] === "media")
         return true;
   }
   return false;
}

// Deterministic recursive walk. Deny-list-shaped subtrees are never descended; files under them
// are counted as denied-skipped (never read). Symlinks are neither followed nor sampled.
function walkTree(rootAbs) {
   const files = [];
   let deniedFiles = 0;
   let deniedDirs = 0;
   const visit = (abs, rel, underDenied) => {
      let entries;
      try {
         entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch {
         return;
      }
      for (const ent of entries.sort((a, b) => cmp(a.name, b.name))) {
         const childRel = rel ? `${rel}/${ent.name}` : ent.name;
         const childAbs = path.join(abs, ent.name);
         if (ent.isDirectory()) {
            const denied = underDenied || isDeniedRel(childRel);
            if (denied) deniedDirs++;
            visit(childAbs, childRel, denied);
         } else if (ent.isFile()) {
            if (underDenied || isDeniedRel(childRel)) {
               deniedFiles++;
               continue;
            }
            let size = 0;
            try {
               size = fs.statSync(childAbs).size;
            } catch {
               continue;
            }
            files.push({ rel: childRel, abs: childAbs, size });
         }
      }
   };
   visit(rootAbs, "", false);
   return { files, deniedFiles, deniedDirs };
}

// CRLF -> LF normalization (byte-level; \r bytes before \n are dropped, others kept).
function normalizeCrlf(buf) {
   if (!buf.includes(13)) return buf;
   const out = Buffer.allocUnsafe(buf.length);
   let n = 0;
   for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 13 && i + 1 < buf.length && buf[i + 1] === 10) continue;
      out[n++] = buf[i];
   }
   return out.subarray(0, n);
}

// A window must be predominantly alphanumeric (or non-ASCII text) to be worth testing:
// >25% whitespace/punctuation-only content is skipped so trivial filler never matches.
function isContentBearing(buf) {
   if (buf.length === 0) return false;
   let content = 0;
   for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (
         (b >= 97 && b <= 122) ||
         (b >= 65 && b <= 90) ||
         (b >= 48 && b <= 57) ||
         b >= 128
      )
         content++;
   }
   return content / buf.length >= 0.75;
}

// Deterministic windows for one file. Oversized files are sampled at the first window only
// (bounded IO via readSync of exactly B bytes); regular files are read whole (<= 2 MiB).
function windowsForFile(file, opts) {
   if (file.size > MAX_SAMPLE_FILE_BYTES) {
      const len = Math.min(opts.windowBytes, file.size);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(file.abs, "r");
      try {
         fs.readSync(fd, buf, 0, len, 0);
      } finally {
         fs.closeSync(fd);
      }
      return [{ offset: 0, bytes: buf }];
   }
   const full = fs.readFileSync(file.abs);
   const offsets = [];
   for (let i = 0; i < opts.windowsPerFile; i++)
      offsets.push(Math.floor((full.length * i) / opts.windowsPerFile));
   return offsets.map((offset) => ({
      offset,
      bytes: full.subarray(
         offset,
         Math.min(offset + opts.windowBytes, full.length),
      ),
   }));
}

function lineAt(buf, idx) {
   let line = 1;
   for (let i = 0; i < idx; i++) if (buf[i] === 10) line++;
   return line;
}

function main() {
   const { storeDir, licensedRoot, opts } = parseArgs(process.argv.slice(2));
   const statOrUsage = (p, label) => {
      let st;
      try {
         st = fs.statSync(p);
      } catch {
         usageError(`${label} '${p}' does not exist or is not accessible`);
      }
      if (!st.isDirectory()) usageError(`${label} '${p}' is not a directory`);
      return fs.realpathSync(p);
   };
   const storeReal = statOrUsage(storeDir, "store directory");
   const licensedReal = statOrUsage(licensedRoot, "licensed root");
   if (
      storeReal === licensedReal ||
      storeReal.startsWith(licensedReal + path.sep) ||
      licensedReal.startsWith(storeReal + path.sep)
   ) {
      usageError("store directory and licensed root must be disjoint trees");
   }

   // ---- sample the licensed root -------------------------------------------------------------
   const licensedWalk = walkTree(licensedReal);
   const textCandidates = licensedWalk.files
      .filter((f) => TEXT_EXTENSIONS.has(extensionOf(f.rel)))
      .sort((a, b) => cmp(a.rel, b.rel));
   const binarySkipped = licensedWalk.files.length - textCandidates.length;
   const sampled = textCandidates.slice(0, opts.maxFiles);
   const samplingTruncated = textCandidates.length > sampled.length;

   const windows = [];
   const seenWindowHashes = new Set();
   let windowsTested = 0;
   for (const file of sampled) {
      let acceptedEnd = -1;
      for (const w of windowsForFile(file, opts)) {
         if (w.offset <= acceptedEnd) continue; // windows within a file stay disjoint
         const buf = normalizeCrlf(w.bytes);
         if (!isContentBearing(buf)) continue;
         windowsTested++;
         const hash = sha256Hex(buf);
         if (seenWindowHashes.has(hash)) continue; // identical window already tested
         seenWindowHashes.add(hash);
         acceptedEnd = w.offset + buf.length;
         windows.push({ licensedPath: file.rel, bytes: buf, hash });
      }
   }

   // Absolute-path needles: as passed, resolved, and realpath variants (deduped).
   const pathVariants = [
      ...new Set([licensedRoot, path.resolve(licensedRoot), licensedReal]),
   ]
      .filter((p) => path.isAbsolute(p))
      .sort(cmp);

   // ---- scan the store -----------------------------------------------------------------------
   const storeWalk = walkTree(storeReal);
   const storeFiles = storeWalk.files
      .filter((f) => STORE_EXTENSIONS.has(extensionOf(f.rel)))
      .sort((a, b) => cmp(a.rel, b.rel));

   const findings = [];
   let findingsTruncated = false;
   const addFinding = (kind, storeRel, line, licensedPath, match) => {
      if (findings.length >= FINDINGS_CAP) {
         findingsTruncated = true;
         return;
      }
      findings.push({
         kind,
         storeFile: storeRel,
         line,
         ...(licensedPath ? { licensedPath } : {}),
         match,
      });
   };
   const scanNeedle = (storeRel, buf, needle, kind, licensedPath, match) => {
      let idx = buf.indexOf(needle);
      while (idx !== -1) {
         addFinding(kind, storeRel, lineAt(buf, idx), licensedPath, match);
         if (findingsTruncated) return;
         idx = buf.indexOf(needle, idx + needle.length);
      }
   };
   for (const sf of storeFiles) {
      const buf = normalizeCrlf(fs.readFileSync(sf.abs));
      for (const w of windows) {
         scanNeedle(
            sf.rel,
            buf,
            w.bytes,
            "LICENSED_WINDOW_HIT",
            w.licensedPath,
            `hit:${w.hash.slice(0, HASH_HEX)}`,
         );
         if (findingsTruncated) break;
      }
      for (const variant of pathVariants) {
         const needle = Buffer.from(variant, "utf8");
         scanNeedle(
            sf.rel,
            buf,
            needle,
            "ABSOLUTE_LICENSED_PATH",
            undefined,
            `abs:${sha256Hex(needle).slice(0, HASH_HEX)}`,
         );
      }
   }
   findings.sort(
      (a, b) =>
         cmp(a.storeFile, b.storeFile) ||
         a.line - b.line ||
         cmp(a.kind, b.kind) ||
         cmp(a.match, b.match) ||
         cmp(a.licensedPath ?? "", b.licensedPath ?? ""),
   );

   const report = {
      guard: "kb-license-guard",
      mode: "bounded-sampling",
      bounded: true,
      note: `Bounded sampling of the licensed tree: first ${opts.maxFiles} text files by path (${textCandidates.length} candidates), up to ${opts.windowsPerFile} disjoint ${opts.windowBytes}-byte windows each, oversized files first window only. A clean run is a bounded assertion, not exhaustive proof of zero licensed bytes. Matched bytes are never echoed; findings carry redacted hashes and alias-relative paths only.`,
      storeRef: path.basename(storeReal),
      licensedRootRef: path.basename(licensedReal),
      options: {
         maxFiles: opts.maxFiles,
         windowBytes: opts.windowBytes,
         windowsPerFile: opts.windowsPerFile,
         maxSampleFileBytes: MAX_SAMPLE_FILE_BYTES,
      },
      counts: {
         storeFilesScanned: storeFiles.length,
         licensedCandidates: textCandidates.length,
         licensedSampled: sampled.length,
         samplingTruncated,
         licensedDeniedSkipped: licensedWalk.deniedFiles,
         licensedBinarySkipped: binarySkipped,
         windowsTested,
         windowsUnique: windows.length,
         findings: findings.length,
         findingsTruncated,
      },
      findings,
      clean: findings.length === 0,
   };

   if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
   } else {
      console.log(
         `kb-license-guard (bounded sampling): store '${report.storeRef}' vs licensed root '${report.licensedRootRef}'`,
      );
      console.log(
         `licensed: ${textCandidates.length} text candidates, ${sampled.length} sampled (max ${opts.maxFiles}${samplingTruncated ? ", TRUNCATED" : ""}), ${windowsTested} windows tested (${windows.length} unique)`,
      );
      console.log(`store: ${storeFiles.length} json/jsonl files scanned`);
      if (report.clean) {
         console.log(
            "clean: no sampled licensed-source bytes and no absolute licensed-root paths found in the store (bounded assertion, not exhaustive proof)",
         );
      } else {
         for (const f of findings) {
            console.log(
               `VIOLATION ${f.kind} ${f.storeFile}:${f.line}${f.licensedPath ? ` licensed=${f.licensedPath}` : ""} match=${f.match}`,
            );
         }
         if (findingsTruncated)
            console.log(`VIOLATION list truncated at ${FINDINGS_CAP} findings`);
      }
   }
   process.exit(report.clean ? 0 : 1);
}

main();
