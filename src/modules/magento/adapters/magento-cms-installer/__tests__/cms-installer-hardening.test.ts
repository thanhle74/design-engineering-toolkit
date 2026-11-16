// [74] W-C — CMS installer HARDENING suite (vitest, hermetic, fully offline).
//
// Executes the GENERATED installer END-TO-END against a FAKE Magento root built in the
// OS tmp dir (never a real installation): the fixture fake-magento-bootstrap.php fakes
// exactly the service surface the installer uses, so the [74] gates are proven by
// RUNNING them, not by grepping strings:
//   - --dry-run is NON-MUTATING (full-tree snapshot before/after: zero files created,
//     zero mtimes touched) and discloses writeMode, cacheFlush and required flags;
//   - a NON-DEFAULT store scope (store_id != 0) refuses a real run without the explicit
//     matching --store-id=<id> flag (and with a MISMATCHED flag);
//   - an EXISTING page under the declared scope refuses without --force; with --force it
//     updates in place with the same page id (idempotent);
//   - the bundle media tree refuses symlinks BEFORE any write;
//   - existing pub/media files with DIFFERENT bytes refuse without --force (and stay
//     byte-unchanged on disk); byte-identical files are SKIPPED (no rewrite); with
//     --force differing files are replaced byte-exactly;
//   - copied media lands ONLY inside pub/media with 0755 dir / 0644 file perms and is
//     byte-identical to the bundle source (sha256);
//   - the cache clean is SCOPED to exactly [full_page, block_html] (never flush-all).
//
// php guard: when the php CLI is absent, every php-dependent case SKIPS with an explicit
// note (never fakes a pass).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
   renderCmsInstallerPhp,
   type CmsInstallTarget,
   type CmsInstallerInput,
} from "../render-cms-installer.js";

const REPO_ROOT = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   "..",
   "..",
   "..",
   "..",
   "..",
   "..",
);
const FAKE_BOOTSTRAP = path.join(
   path.dirname(fileURLToPath(import.meta.url)),
   "fixtures",
   "fake-magento-bootstrap.php",
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
const itPhp = phpAvailable ? it : it.skip;

// ---- fixtures ----------------------------------------------------------------------------------

const PROVENANCE = {
   sourceId: "figma-home-desktop",
   revisionId: "2417494580183108397",
   profileId: "slaunchpad-fashion",
   platformId: "magento-pagebuilder",
};

const STORE0: CmsInstallTarget = {
   identifier: "det-store0-page",
   title: "Store Zero Page",
   storeId: 0,
   active: true,
};
const STORE5: CmsInstallTarget = {
   identifier: "det-store5-page",
   title: "Store Five Page",
   storeId: 5,
   active: true,
};

const CONTENT = '<div data-content-type="row"><p>DET hardening</p></div>';

function installerInput(target: CmsInstallTarget): CmsInstallerInput {
   return { cmsInstall: target, content: CONTENT, provenance: PROVENANCE };
}

const sha256Buf = (buf: Buffer): string =>
   crypto.createHash("sha256").update(buf).digest("hex");
const sha256File = (p: string): string => sha256Buf(fs.readFileSync(p));

/** Full-tree snapshot: relPath -> kind/size/mtime/mode, for the non-mutation proof. */
function snapshotTree(root: string): Map<string, string> {
   const snapshot = new Map<string, string>();
   const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
         const full = path.join(dir, entry.name);
         const rel = path.relative(root, full);
         if (entry.isSymbolicLink()) {
            snapshot.set(rel, `link:${fs.readlinkSync(full)}`);
            continue;
         }
         if (entry.isDirectory()) {
            const stat = fs.statSync(full);
            snapshot.set(rel, `dir:${stat.mtimeMs}:${stat.mode & 0o777}`);
            walk(full);
            continue;
         }
         const stat = fs.statSync(full);
         snapshot.set(
            rel,
            `file:${stat.size}:${stat.mtimeMs}:${stat.mode & 0o777}`,
         );
      }
   };
   walk(root);
   return snapshot;
}

interface FakeRootOptions {
   target: CmsInstallTarget;
   /** relative path inside the bundle -> content bytes */
   mediaFiles?: Record<string, Buffer | string>;
   /** rel path inside the bundle media tree -> symlink target (absolute path) */
   mediaSymlinks?: Record<string, string>;
   /** files already present under pub/media (rel path -> content) */
   pubMediaExisting?: Record<string, Buffer | string>;
   /** fake pre-existing cms pages visible to the fake service layer */
   existingPages?: { id: number; identifier: string; storeIds: number[] }[];
}

function makeFakeMagentoRoot(options: FakeRootOptions): string {
   const root = fs.mkdtempSync(path.join(os.tmpdir(), "det74-fake-magento-"));
   fs.mkdirSync(path.join(root, "app"), { recursive: true });
   fs.copyFileSync(FAKE_BOOTSTRAP, path.join(root, "app", "bootstrap.php"));
   const detInstall = path.join(root, "det-install");
   fs.mkdirSync(detInstall, { recursive: true });
   fs.writeFileSync(
      path.join(detInstall, "install-homepage.php"),
      renderCmsInstallerPhp(installerInput(options.target)),
   );
   for (const [rel, content] of Object.entries(options.mediaFiles ?? {})) {
      const target = path.join(detInstall, "media", rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
   }
   for (const [rel, linkTarget] of Object.entries(
      options.mediaSymlinks ?? {},
   )) {
      const target = path.join(detInstall, "media", rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(linkTarget, target);
   }
   for (const [rel, content] of Object.entries(
      options.pubMediaExisting ?? {},
   )) {
      const target = path.join(root, "pub", "media", rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
   }
   // The fake service layer reads its pre-existing pages from this file (via the
   // DET_FAKE_PAGES_JSON env var runInstaller sets for every run).
   fs.writeFileSync(
      path.join(root, "fake-pages.json"),
      JSON.stringify(options.existingPages ?? []),
   );
   return root;
}

interface RunResult {
   exit: number;
   stdout: string;
   stderr: string;
}

function runInstaller(
   root: string,
   args: string[] = [],
   env: Record<string, string> = {},
): RunResult {
   const installerPath = path.join(root, "det-install", "install-homepage.php");
   let stdout = "";
   let stderr = "";
   let exit = 0;
   try {
      stdout = execFileSync(PHP_BIN, [installerPath, ...args], {
         cwd: root,
         stdio: "pipe",
         encoding: "utf8",
         env: {
            ...process.env,
            // The fake service layer's configured pre-existing pages (per fake root).
            DET_FAKE_PAGES_JSON: path.join(root, "fake-pages.json"),
            ...env,
         },
      });
   } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      exit = err.status ?? -1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
   }
   return { exit, stdout, stderr };
}

const listTree = (dir: string): string[] => {
   if (!fs.existsSync(dir)) return [];
   const out: string[] = [];
   const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
         const full = path.join(d, entry.name);
         if (entry.isDirectory()) walk(full);
         else out.push(path.relative(dir, full));
      }
   };
   walk(dir);
   return out.sort();
};

// ---- the suite ---------------------------------------------------------------------------------

describe("[74] cms installer hardening (fake Magento root, hermetic)", () => {
   itPhp("the generated installer passes php -l (both store scopes)", () => {
      for (const target of [STORE0, STORE5]) {
         const root = makeFakeMagentoRoot({ target });
         try {
            execFileSync(
               PHP_BIN,
               ["-l", path.join(root, "det-install", "install-homepage.php")],
               { stdio: "pipe" },
            );
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      }
   });

   itPhp(
      "--dry-run is NON-MUTATING: full-tree snapshot is byte/mtime-identical before and after",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE5,
            mediaFiles: {
               "wysiwyg/banner.jpg": "banner-bytes",
               "wysiwyg/deep/nested/hero.jpg": "hero-bytes",
            },
            pubMediaExisting: { "wysiwyg/old-merchant-file.jpg": "merchant" },
         });
         try {
            const before = snapshotTree(root);
            const { exit, stdout } = runInstaller(root, ["--dry-run"]);
            const after = snapshotTree(root);
            expect(exit).toBe(0);
            // ZERO changes anywhere in the fake Magento root — no file created, no
            // mtime touched, no permission changed.
            expect([...after.entries()].sort()).toEqual(
               [...before.entries()].sort(),
            );
            const plan = JSON.parse(stdout) as Record<string, unknown>;
            // Honest disclosure of what a REAL run would do (never done by a dry run):
            expect(plan["writeMode"]).toMatch(/--force/);
            expect(plan["cacheFlush"]).toMatch(/\[full_page, block_html\]/);
            expect(plan["cacheFlush"]).toMatch(/never flush-all/);
            expect(plan["requiresFlags"]).toEqual(["--store-id=5"]);
            expect(plan["mediaAssets"]).toMatchObject({
               count: 2,
               totalBytes: 22,
            });
            expect(plan["contentSha256"]).toBe(sha256Buf(Buffer.from(CONTENT)));
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "store 0 (default scope) needs no confirmation flag and installs cleanly",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
         });
         const saveLog = path.join(root, "save.jsonl");
         const cacheLog = path.join(root, "cache.jsonl");
         try {
            const { exit, stdout } = runInstaller(root, [], {
               DET_FAKE_SAVE_LOG: saveLog,
               DET_FAKE_CACHE_LOG: cacheLog,
            });
            expect(exit).toBe(0);
            expect(stdout).toContain("action=created");
            expect(stdout).toContain(
               "media copy to pub/media/ — copied 1 file(s)",
            );
            expect(stdout).toContain(
               "cleaned cache types [full_page, block_html]",
            );
            const saves = fs
               .readFileSync(saveLog, "utf8")
               .trim()
               .split("\n")
               .map((l) => JSON.parse(l) as Record<string, unknown>);
            expect(saves).toHaveLength(1);
            expect(saves[0]["identifier"]).toBe(STORE0.identifier);
            expect(saves[0]["storeIds"]).toEqual([0]);
            // SCOPED cache clean: exactly the two types, never flush-all.
            expect(fs.readFileSync(cacheLog, "utf8").trim()).toBe(
               '["full_page","block_html"]',
            );
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "NON-DEFAULT store scope refuses a real run without the explicit matching flag",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE5,
            mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
            // Even a colliding page must not matter: the flag gate fires FIRST,
            // before any write.
            existingPages: [
               { id: 9, identifier: STORE5.identifier, storeIds: [5] },
            ],
         });
         try {
            const { exit, stdout, stderr } = runInstaller(root);
            expect(exit).toBe(1);
            expect(stderr).toContain(
               "must pass the explicit matching flag --store-id=5",
            );
            expect(stdout).not.toContain("action=");
            // NOTHING was written: no media copy, no page save.
            expect(listTree(path.join(root, "pub", "media"))).toEqual([]);
            expect(fs.existsSync(path.join(root, "save.jsonl"))).toBe(false);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "a MISMATCHED --store-id flag refuses (declared scope is the only scope)",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE5,
            mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
         });
         try {
            const { exit, stderr } = runInstaller(root, ["--store-id=6"]);
            expect(exit).toBe(1);
            expect(stderr).toContain("does not match the declared store_id=5");
            expect(listTree(path.join(root, "pub", "media"))).toEqual([]);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "the correct --store-id flag installs into the declared scope (both flag spellings)",
      () => {
         for (const args of [["--store-id=5"], ["--store-id", "5"]]) {
            const root = makeFakeMagentoRoot({
               target: STORE5,
               mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
            });
            const saveLog = path.join(root, "save.jsonl");
            const cacheLog = path.join(root, "cache.jsonl");
            try {
               const { exit, stdout } = runInstaller(root, args, {
                  DET_FAKE_SAVE_LOG: saveLog,
                  DET_FAKE_CACHE_LOG: cacheLog,
               });
               expect(exit).toBe(0);
               expect(stdout).toContain("action=created");
               const saves = fs
                  .readFileSync(saveLog, "utf8")
                  .trim()
                  .split("\n")
                  .map((l) => JSON.parse(l) as Record<string, unknown>);
               expect(saves[0]["storeIds"]).toEqual([5]);
               expect(fs.readFileSync(cacheLog, "utf8").trim()).toBe(
                  '["full_page","block_html"]',
               );
            } finally {
               fs.rmSync(root, { recursive: true, force: true });
            }
         }
      },
      60000,
   );

   itPhp(
      "an EXISTING page under the declared scope refuses without --force (nothing written)",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
            existingPages: [
               { id: 7, identifier: STORE0.identifier, storeIds: [0] },
            ],
         });
         try {
            const { exit, stdout, stderr } = runInstaller(root);
            expect(exit).toBe(1);
            expect(stderr).toContain("cms page id=7 already exists");
            expect(stderr).toContain("--force");
            expect(stderr).toContain("Nothing was written");
            expect(stdout).not.toContain("action=");
            // The refusal precedes the media copy too.
            expect(listTree(path.join(root, "pub", "media"))).toEqual([]);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "--force updates the EXISTING page in place with the SAME page id (idempotent)",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE0,
            existingPages: [
               { id: 7, identifier: STORE0.identifier, storeIds: [0] },
            ],
            mediaFiles: { "wysiwyg/banner.jpg": "banner-bytes" },
         });
         const saveLog = path.join(root, "save.jsonl");
         try {
            const { exit, stdout } = runInstaller(root, ["--force"], {
               DET_FAKE_SAVE_LOG: saveLog,
            });
            expect(exit).toBe(0);
            expect(stdout).toContain("action=updated page_id=7");
            const saves = fs
               .readFileSync(saveLog, "utf8")
               .trim()
               .split("\n")
               .map((l) => JSON.parse(l) as Record<string, unknown>);
            expect(saves).toHaveLength(1);
            expect(saves[0]["identifier"]).toBe(STORE0.identifier);
            expect(saves[0]["title"]).toBe(STORE0.title);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "media: existing pub/media file with DIFFERENT bytes refuses without --force and stays byte-unchanged",
      () => {
         const existing = "merchant-original-bytes";
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/banner.jpg": "new-bundle-bytes" },
            pubMediaExisting: { "wysiwyg/banner.jpg": existing },
         });
         const targetPath = path.join(
            root,
            "pub",
            "media",
            "wysiwyg",
            "banner.jpg",
         );
         try {
            const { exit, stderr } = runInstaller(root);
            expect(exit).toBe(1);
            expect(stderr).toContain(
               "REFUSING to overwrite existing pub/media file(s) with DIFFERENT bytes: wysiwyg/banner.jpg",
            );
            // The merchant file is untouched.
            expect(fs.readFileSync(targetPath, "utf8")).toBe(existing);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "media: --force replaces a differing pub/media file BYTE-EXACTLY (sha256 identity)",
      () => {
         const sourceBytes = "bundle-media-bytes-v2";
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/banner.jpg": sourceBytes },
            pubMediaExisting: { "wysiwyg/banner.jpg": "merchant-old" },
         });
         const targetPath = path.join(
            root,
            "pub",
            "media",
            "wysiwyg",
            "banner.jpg",
         );
         try {
            const { exit, stdout } = runInstaller(root, ["--force"]);
            expect(exit).toBe(0);
            expect(fs.readFileSync(targetPath, "utf8")).toBe(sourceBytes);
            expect(sha256File(targetPath)).toBe(
               sha256Buf(Buffer.from(sourceBytes)),
            );
            expect(stdout).toContain("copied 1 file(s)");
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "media: byte-identical pub/media file is SKIPPED, not rewritten (idempotent rerun)",
      () => {
         const sourceBytes = "same-bytes-everywhere";
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/banner.jpg": sourceBytes },
            pubMediaExisting: { "wysiwyg/banner.jpg": sourceBytes },
         });
         const targetPath = path.join(
            root,
            "pub",
            "media",
            "wysiwyg",
            "banner.jpg",
         );
         try {
            const before = fs.statSync(targetPath);
            const { exit, stdout } = runInstaller(root);
            expect(exit).toBe(0);
            expect(stdout).toContain("skipped 1 byte-identical file(s)");
            expect(stdout).not.toContain("copied 1 file(s)");
            const after = fs.statSync(targetPath);
            expect(after.mtimeMs).toBe(before.mtimeMs); // untouched on disk
            expect(fs.readFileSync(targetPath, "utf8")).toBe(sourceBytes);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "media: a SYMLINK inside the bundle media tree refuses the run BEFORE any copy",
      () => {
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: { "wysiwyg/real.jpg": "real-bytes" },
            mediaSymlinks: { "wysiwyg/leak.jpg": "/etc/passwd" },
         });
         try {
            const { exit, stdout, stderr } = runInstaller(root);
            expect(exit).toBe(1);
            expect(stderr).toContain(
               "symlink inside the bundle media tree (refused)",
            );
            expect(stdout).not.toContain("action=");
            // Nothing copied: even the legitimate sibling file is absent from pub/media.
            expect(listTree(path.join(root, "pub", "media"))).toEqual([]);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   itPhp(
      "media copy lands ONLY inside pub/media with 0755 dirs / 0644 files, byte-identical (sha256)",
      () => {
         const files: Record<string, string> = {
            "wysiwyg/banner.jpg": "banner-media",
            "wysiwyg/deep/nested/hero.jpg": "hero-media",
         };
         const root = makeFakeMagentoRoot({
            target: STORE0,
            mediaFiles: files,
         });
         try {
            const { exit } = runInstaller(root);
            expect(exit).toBe(0);
            for (const [rel, content] of Object.entries(files)) {
               const written = path.join(root, "pub", "media", rel);
               expect(fs.existsSync(written)).toBe(true);
               expect(sha256File(written)).toBe(
                  sha256Buf(Buffer.from(content)),
               );
               expect(fs.statSync(written).mode & 0o777).toBe(0o644);
               expect(fs.statSync(path.dirname(written)).mode & 0o777).toBe(
                  0o755,
               );
            }
            // Nothing outside pub/media was created in the fake Magento root
            // (only app/ and det-install/ pre-existed; det-install/media is the source).
            expect(listTree(path.join(root, "pub"))).toEqual([
               "media/wysiwyg/banner.jpg",
               "media/wysiwyg/deep/nested/hero.jpg",
            ]);
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
         }
      },
   );

   // [74 C74-2a] a PREEXISTING symlinked destination under pub/media used to be
   // classified via is_file() (which FOLLOWS the link) and — with --force — copied
   // THROUGH the link, overwriting its outside target, with the realpath
   // containment check only running AFTER the destructive write. The Gate 6.5
   // preflight must refuse the WHOLE run before the first mkdir/copy/CMS write.
   itPhp(
      "C74-2a: refuses a symlinked pub/media destination BEFORE any write even with --force (no partial copies, outside target untouched)",
      () => {
         const outsideDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "det74-c74a-outside-"),
         );
         const root = makeFakeMagentoRoot({
            target: STORE5,
            mediaFiles: {
               "wysiwyg/clean-first.jpg": "clean-media-bytes",
               "wysiwyg/hero.jpg": "different-bundle-bytes",
            },
         });
         try {
            const sentinel = path.join(outsideDir, "merchant-hero-outside.jpg");
            fs.writeFileSync(sentinel, "MERCHANT-OUTSIDE-BYTES");
            const heroTarget = path.join(
               root,
               "pub",
               "media",
               "wysiwyg",
               "hero.jpg",
            );
            fs.mkdirSync(path.dirname(heroTarget), { recursive: true });
            fs.symlinkSync(sentinel, heroTarget);

            const saveLog = path.join(root, "save.jsonl");
            const cacheLog = path.join(root, "cache.jsonl");
            const res = runInstaller(root, ["--force", "--store-id=5"], {
               DET_FAKE_SAVE_LOG: saveLog,
               DET_FAKE_CACHE_LOG: cacheLog,
            });
            expect(res.exit).not.toBe(0);
            const output = res.stdout + res.stderr;
            expect(output).toMatch(/symlinked destination file/);
            expect(output).toMatch(/hero\.jpg/);
            expect(output).toMatch(/Nothing was written/);
            // copy() never followed the link: outside bytes untouched.
            expect(fs.readFileSync(sentinel, "utf8")).toBe(
               "MERCHANT-OUTSIDE-BYTES",
            );
            expect(fs.lstatSync(heroTarget).isSymbolicLink()).toBe(true);
            expect(fs.readlinkSync(heroTarget)).toBe(sentinel);
            // No partial write: the clean sibling entry was refused too — the
            // preflight validates EVERY destination before the first write.
            expect(
               fs.existsSync(
                  path.join(root, "pub", "media", "wysiwyg", "clean-first.jpg"),
               ),
            ).toBe(false);
            // The CMS page write never happened.
            expect(
               fs.existsSync(saveLog) ? fs.readFileSync(saveLog, "utf8") : "",
            ).toBe("");
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
         }
      },
   );

   // [74 C74-2b] a symlinked bundle media ROOT is invisible to the entry-level
   // isLink() guard: the iterator would silently walk an OUTSIDE tree and copy
   // its files into pub/media. Both the real run and dry-run must refuse.
   itPhp(
      "C74-2b: refuses a symlinked bundle media root (real run and dry-run), nothing written",
      () => {
         const outsideDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "det74-c74b-outside-"),
         );
         const root = makeFakeMagentoRoot({ target: STORE5 });
         try {
            const sentinel = path.join(outsideDir, "outside.jpg");
            fs.writeFileSync(sentinel, "OUTSIDE-MEDIA-TREE");
            fs.symlinkSync(outsideDir, path.join(root, "det-install", "media"));

            const saveLog = path.join(root, "save.jsonl");
            const cacheLog = path.join(root, "cache.jsonl");
            const real = runInstaller(root, ["--store-id=5"], {
               DET_FAKE_SAVE_LOG: saveLog,
               DET_FAKE_CACHE_LOG: cacheLog,
            });
            expect(real.exit).not.toBe(0);
            expect(real.stdout + real.stderr).toMatch(
               /bundle media root \(media\/\) is a symbolic link/,
            );
            expect(fs.existsSync(path.join(root, "pub", "media"))).toBe(false);
            expect(
               fs.existsSync(saveLog) ? fs.readFileSync(saveLog, "utf8") : "",
            ).toBe("");

            // Dry-run validates the same condition and refuses loudly too.
            const dry = runInstaller(root, ["--dry-run"]);
            expect(dry.exit).not.toBe(0);
            expect(dry.stdout + dry.stderr).toMatch(/dry-run validation/);
            expect(fs.readFileSync(sentinel, "utf8")).toBe(
               "OUTSIDE-MEDIA-TREE",
            );
         } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
         }
      },
   );
});
