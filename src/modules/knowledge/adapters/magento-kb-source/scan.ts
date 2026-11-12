// Magento KB source scanner adapter (issue #19, M4) — read-only, out-of-process.
//
// Contract: stdin = one scan request JSON document
//   { schemaVersion: 1,
//     scan: { scanId, kind, rootAlias, root, subPath?, options?, denyGlobs[] },
//     platform: { id, version? } }
//   root is the caller's gateway-resolved ABSOLUTE scan root; rootAlias is the declared alias
//   name (digest keys + payload identity); denyGlobs is the FULL merged additive glob list.
// stdout = exactly one KbSourceScanPayload JSON document
// (resources/schemas/kb/kb-source-scan.schema.json). The det core never imports this file; the extract
// orchestrator spawns it per adapters/magento-kb-source/descriptor.json.
//
// One kind per payload; four kinds:
//   magento-platform   — KB-1 module inventory from app/etc/config.php ('modules' block ONLY)
//                        + per-module etc/module.xml declarations (version, <sequence> deps,
//                        declaration-file presence). Other config.php sections are never parsed
//                        and never echoed (diagnostics included).
//   pagebuilder-native — KB-2 metadata records from per-file content-type XML declarations.
//   secomm-uiwidget    — KB-2 metadata records from the module's DI component registry
//                        (etc/di.xml *Registry types) + BOUNDED metadata-only text parses of
//                        the definition PHP files (named scalar properties + field name/type
//                        pairs). Definition bodies, widget.xml label text and any code content
//                        are never emitted; field names are capped per item.
//   hyva-ui            — KB-2 metadata records from directory-name census ONLY (component and
//                        variant dir names). composer.json is the only file opened. Licensed
//                        package: template/style/script bytes are never read, hashed or stored.
//
// Safety gateway (mirrors the #9 adapter's central-gateway pattern, Coordinator F2):
// - Deny-list = structural baseline (path-gateway BASELINE_DENY_GLOBS, imported for parity)
//   plus the caller's additive denyGlobs. Evaluated BEFORE any read, on the full alias-relative
//   path AND the basename, case-insensitively. Denied candidate paths are counted
//   (scanMetadata.deniedCount) and diagnosed (DENIED_PATH_SKIPPED — path names only, no content).
// - Realpath containment under the resolved root: a symlink escape is skipped BEFORE access
//   with LOCATOR_OUT_OF_SCOPE (never followed).
// - Every file actually opened is hashed (sha256) into digests keyed "<rootAlias>:<relPath>".
// - Bounded metadata exception (documented, deny+containment still enforced): the enablement
//   fact app/etc/config.php, the vendor/composer/installed.json package map and the declaring
//   module's etc/module.xml + composer.json may be read although they sit outside a module
//   subPath; the pagebuilder-native and hyva-ui kinds may consult the checkout-root
//   composer.json/composer.lock for version/license truth. No other out-of-subPath read exists.
// - Unsupported/malformed declaration shapes are skipped with an UNSUPPORTED_SHAPE diagnostic
//   and UNKNOWN evidence — never guessed.
// - Declared options set is EMPTY for adapter version 1.x: any option key is a scan error
//   payload (UNKNOWN_SCAN_OPTION), never silently ignored.
// Read-only by construction: this process opens files and directories, never writes.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BASELINE_DENY_GLOBS, globToRegExp } from "../../path-gateway.js";
import { slugify } from "../../ids.js";
import { getAjv } from "../../../../core/schema-registry.js";

// Output contract $id (resources/schemas/kb/kb-source-scan.schema.json). Validated by $id — the schema
// file is registered in the shared ajv instance by the schema-registry directory scan.
const KB_SOURCE_SCAN_ID =
   "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-source-scan.schema.json";

// ---- Input -----------------------------------------------------------------------------------
type ScanKind =
   "magento-platform" | "pagebuilder-native" | "secomm-uiwidget" | "hyva-ui";

interface ScanInput {
   schemaVersion: number;
   scan: {
      scanId: string;
      kind: ScanKind;
      rootAlias: string;
      root: string;
      subPath?: string;
      options?: Record<string, string | number | boolean>;
      denyGlobs?: string[];
   };
   platform: { id: string; version?: string };
}

interface PayloadDiagnostic {
   code: string;
   severity: "info" | "warning" | "error";
   message: string;
   sourceRef?: { kind: string; locator: Record<string, string> };
}

// Deterministic payload diagnostic order: (code, severity rank, message, locator).
const SEV_RANK: Record<string, number> = { info: 0, warning: 1, error: 2 };
function sortPayloadDiagnostics(
   diags: PayloadDiagnostic[],
): PayloadDiagnostic[] {
   const locator = (d: PayloadDiagnostic): string =>
      d.sourceRef
         ? Object.entries(d.sourceRef.locator)
              .map(([k, v]) => `${k}=${v}`)
              .sort()
              .join("&")
         : "";
   return [...diags].sort(
      (a, b) =>
         a.code.localeCompare(b.code) ||
         (SEV_RANK[a.severity] ?? 0) - (SEV_RANK[b.severity] ?? 0) ||
         a.message.localeCompare(b.message) ||
         locator(a).localeCompare(locator(b)),
   );
}

// Declared per-kind options for adapter 1.x: none. Any option key the caller sends is unknown.
const KNOWN_OPTIONS: ReadonlySet<string> = new Set<string>([]);

// Bounds (documented honesty caps — exceeded shapes are counted/diagnosed, never invented).
const MAX_APPEARANCES_LISTED = 24;
const MAX_FIELDS_LISTED = 32;
const MAX_FIELD_NAME_CHARS = 80;
const MAX_DEFINITION_FILE_BYTES = 512 * 1024;
const MAX_WALK_ENTRIES = 2000;
const MAX_VENDOR_PACKAGE_PROBES = 400;
const MAX_DIAGNOSTICS = 400;

// Small deterministic concept mapping (documented): exact declaration/dir name -> the frozen
// kb-ui-component concept enum. Unmapped names use "other" (the schema's escape hatch — there
// is no "generic-content" or "popup" value in the enum) with a description naming the
// declaration verbatim. No invented semantics.
const CONCEPT_MAP: Record<string, string> = {
   hero: "hero",
   banner: "hero",
   slider: "slider",
   carousel: "slider",
   gallery: "slider",
   accordion: "accordion",
   tabs: "tabs",
   menu: "navigation",
   navigation: "navigation",
   breadcrumbs: "navigation",
   minicart: "navigation",
   footer: "footer",
   search: "search",
   "search-form": "search",
   products: "product-grid",
   "product-grid": "product-grid",
   "product-card": "product-card",
   categories: "category-collection",
   testimonial: "testimonial",
   usp: "usp",
   modal: "modal",
};
// Lookup rule (documented): the exact declaration/dir name first, else the name's FIRST
// hyphen-delimited segment when that segment is itself a mapped key (a type named "banner-like"
// shares the banner concept; an unhyphenated name that merely starts with a key, e.g.
// "bannerofdoom", is NOT mapped). Anything else is "other".
function conceptFor(name: string): string {
   const lower = name.toLowerCase();
   if (CONCEPT_MAP[lower]) return CONCEPT_MAP[lower];
   const hyphen = lower.indexOf("-");
   if (hyphen > 0 && CONCEPT_MAP[lower.slice(0, hyphen)])
      return CONCEPT_MAP[lower.slice(0, hyphen)];
   return "other";
}

function normalizeRel(p: string): string {
   return p
      .split(path.sep)
      .join("/")
      .replace(/^\.\/+/, "")
      .replace(/\/+$/, "");
}

function readStdinJson(): unknown {
   // Synchronous stdin read until EOF (subprocess contract: one small JSON document on stdin;
   // stdin is a pipe, so size must not be taken from fstat).
   const chunks: Buffer[] = [];
   const buf = Buffer.alloc(65536);
   for (;;) {
      let read = 0;
      try {
         read = fs.readSync(0, buf, 0, buf.length, null);
      } catch (e) {
         if ((e as NodeJS.ErrnoException)?.code === "EAGAIN") continue;
         break;
      }
      if (read === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, read)));
   }
   return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// ---- Scan context: the single filesystem entry point -------------------------------------------
class ScanContext {
   readonly rootReal: string;
   readonly rootAlias: string;
   readonly kind: ScanKind;
   readonly scanId: string;
   readonly baseRel: string; // subPath, alias-relative posix ("" = the root itself)
   private readonly denyRes: RegExp[];
   readonly digests: Record<string, string> = {};
   readonly diagnostics: PayloadDiagnostic[] = [];
   fileCount = 0;
   deniedCount = 0;
   unknownShapes = 0;

   constructor(input: ScanInput, rootReal: string) {
      this.rootReal = rootReal;
      this.rootAlias = input.scan.rootAlias;
      this.kind = input.scan.kind;
      this.scanId = input.scan.scanId;
      this.baseRel = normalizeRel(input.scan.subPath ?? "");
      this.denyRes = [
         ...BASELINE_DENY_GLOBS,
         ...(input.scan.denyGlobs ?? []),
      ].map((g) => globToRegExp(g.toLowerCase()));
   }

   private denyReason(rel: string): string | null {
      const norm = rel.toLowerCase();
      const base = path.posix.basename(norm);
      for (const re of this.denyRes) {
         if (re.test(norm) || re.test(base)) return re.source;
      }
      return null;
   }

   private diag(
      code: string,
      severity: PayloadDiagnostic["severity"],
      message: string,
      rel?: string,
   ): void {
      if (this.diagnostics.length >= MAX_DIAGNOSTICS) return; // bounded diagnostics channel
      this.diagnostics.push({
         code,
         severity,
         message,
         ...(rel
            ? {
                 sourceRef: {
                    kind: "repo-file",
                    locator: { rootAlias: this.rootAlias, path: rel },
                 },
              }
            : {}),
      });
   }

   // Under-subPath check for enumerated candidates (metadata reads pass scope: false).
   private inScope(rel: string): boolean {
      return (
         this.baseRel === "" ||
         rel === this.baseRel ||
         rel.startsWith(this.baseRel + "/")
      );
   }

   // THE file open path. Deny (textual, before any fs access) -> realpath containment -> read.
   // Returns null and records the outcome when the open is refused; `missing` is silent because
   // candidates are legitimately optional (module.xml tries, entrypoint existence).
   openFile(
      rel: string,
      opts: { scope: boolean; required?: boolean },
   ): { bytes: Buffer; text: string; rel: string } | null {
      const norm = normalizeRel(rel);
      if (this.denyReason(norm) !== null) {
         this.deniedCount += 1;
         this.diag(
            "DENIED_PATH_SKIPPED",
            "warning",
            `Candidate path '${this.rootAlias}:${norm}' matches the deny-list and was never read.`,
            norm,
         );
         return null;
      }
      if (opts.scope && !this.inScope(norm)) {
         this.diag(
            "LOCATOR_OUT_OF_SCOPE",
            "warning",
            `Candidate path '${this.rootAlias}:${norm}' lies outside this scan's subPath and was not read.`,
            norm,
         );
         return null;
      }
      let real: string;
      try {
         real = fs.realpathSync(path.join(this.rootReal, norm));
      } catch {
         if (opts.required)
            this.diag(
               "LOCATOR_OUT_OF_SCOPE",
               "warning",
               `Candidate path '${this.rootAlias}:${norm}' does not resolve under the scan root; skipped.`,
               norm,
            );
         return null;
      }
      const relToRoot = path.relative(this.rootReal, real);
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
         this.diag(
            "LOCATOR_OUT_OF_SCOPE",
            "warning",
            `Candidate path '${this.rootAlias}:${norm}' resolves outside the scan root via symlinks; never followed.`,
            norm,
         );
         return null;
      }
      let bytes: Buffer;
      try {
         bytes = fs.readFileSync(real);
      } catch {
         if (opts.required)
            this.diag(
               "LOCATOR_OUT_OF_SCOPE",
               "warning",
               `Candidate path '${this.rootAlias}:${norm}' could not be read; skipped.`,
               norm,
            );
         return null;
      }
      this.fileCount += 1;
      const key = `${this.rootAlias}:${relToRoot.split(path.sep).join("/")}`;
      this.digests[key] = createHash("sha256").update(bytes).digest("hex");
      return {
         bytes,
         text: bytes.toString("utf8"),
         rel: relToRoot.split(path.sep).join("/"),
      };
   }

   // Existence-only check (stat, no content read) with the same textual deny + containment gates.
   // A deny-listed or escaping candidate is reported as absent AND surfaced as a diagnostic.
   exists(rel: string): boolean {
      const norm = normalizeRel(rel);
      if (this.denyReason(norm) !== null) {
         this.deniedCount += 1;
         this.diag(
            "DENIED_PATH_SKIPPED",
            "warning",
            `Candidate path '${this.rootAlias}:${norm}' matches the deny-list; existence was not probed and it was never read.`,
            norm,
         );
         return false;
      }
      let real: string;
      try {
         real = fs.realpathSync(path.join(this.rootReal, norm));
      } catch {
         return false;
      }
      const relToRoot = path.relative(this.rootReal, real);
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
         this.diag(
            "LOCATOR_OUT_OF_SCOPE",
            "warning",
            `Candidate path '${this.rootAlias}:${norm}' resolves outside the scan root via symlinks; never followed.`,
            norm,
         );
         return false;
      }
      try {
         fs.statSync(real);
         return true;
      } catch {
         return false;
      }
   }

   // Deterministic bounded directory walk under a base (alias-relative). Returns FILE relpaths
   // (sorted). Directory entries are enumerated by name only — no file is opened here.
   walkFiles(base: string, filterExt?: string): string[] {
      const normBase = normalizeRel(base);
      const out: string[] = [];
      const visit = (relDir: string): void => {
         if (out.length >= MAX_WALK_ENTRIES) return;
         let entries: fs.Dirent[] = [];
         try {
            entries = fs.readdirSync(path.join(this.rootReal, relDir), {
               withFileTypes: true,
            });
         } catch {
            return;
         }
         entries.sort((a, b) => a.name.localeCompare(b.name));
         for (const ent of entries) {
            if (out.length >= MAX_WALK_ENTRIES) {
               this.diag(
                  "WALK_CAP_REACHED",
                  "warning",
                  `Directory enumeration stopped at the ${MAX_WALK_ENTRIES}-entry bound; results below the bound are not inventoried.`,
                  relDir,
               );
               return;
            }
            const rel = normalizeRel(`${relDir}/${ent.name}`);
            if (ent.isDirectory()) visit(rel);
            else if (ent.isFile() || ent.isSymbolicLink()) {
               // Symlinked entries become candidates too: the central openFile gateway resolves
               // realpaths and refuses escapes with LOCATOR_OUT_OF_SCOPE (enumeration never reads).
               if (!filterExt || ent.name.toLowerCase().endsWith(filterExt))
                  out.push(rel);
            }
         }
      };
      visit(normBase === "" ? "." : normBase);
      return out.sort();
   }

   // Deterministic bounded one-level directory listing (names only — the hyva-ui census).
   listDirs(base: string): { name: string; rel: string }[] {
      let entries: fs.Dirent[] = [];
      try {
         entries = fs.readdirSync(
            path.join(this.rootReal, normalizeRel(base)),
            { withFileTypes: true },
         );
      } catch {
         return [];
      }
      return entries
         .filter((e) => e.isDirectory())
         .sort((a, b) => a.name.localeCompare(b.name))
         .map((e) => ({
            name: e.name,
            rel: normalizeRel(`${base}/${e.name}`),
         }));
   }
}

// ---- Shared record scaffolding ------------------------------------------------------------------
const NOW = (): string => new Date().toISOString();

interface SourceRef {
   kind: "repo-file";
   locator: { rootAlias: string; path: string };
   digest?: string;
}

function sourceRefFor(ctx: ScanContext, rel: string): SourceRef {
   const key = `${ctx.rootAlias}:${rel}`;
   return {
      kind: "repo-file",
      locator: { rootAlias: ctx.rootAlias, path: rel },
      ...(ctx.digests[key] ? { digest: ctx.digests[key] } : {}),
   };
}

function inputDigestsFor(
   ctx: ScanContext,
   rels: string[],
): Record<string, string> {
   const out: Record<string, string> = {};
   for (const rel of [...rels].sort()) {
      const key = `${ctx.rootAlias}:${rel}`;
      if (ctx.digests[key]) out[key] = ctx.digests[key];
   }
   // Rebuild in sorted key order for deterministic serialization.
   const sorted: Record<string, string> = {};
   for (const k of Object.keys(out).sort()) sorted[k] = out[k];
   return sorted;
}

const LIFECYCLE = {
   state: "ACTIVE" as const,
   reviewStatus: "unreviewed" as const,
};

function truncate(text: string, max: number): string {
   return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---- kind=magento-platform ---------------------------------------------------------------------
// Narrow config.php reader: extracts ONLY the 'modules' block ('Name' => 0|1 entries). The
// block is bounded by bracket depth from the '[' after the 'modules' key, so the rest of the
// file (system/scopes/...) is never parsed, never echoed — including in diagnostics.
function readConfigPhpModules(text: string): Record<string, number> | null {
   const keyIdx = text.indexOf("'modules'");
   if (keyIdx === -1) return null;
   const open = text.indexOf("[", keyIdx);
   if (open === -1) return null;
   let depth = 0;
   let end = -1;
   for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === "[") depth++;
      else if (c === "]") {
         depth--;
         if (depth === 0) {
            end = i;
            break;
         }
      }
   }
   if (end === -1) return null;
   const block = text.slice(open, end + 1);
   const modules: Record<string, number> = {};
   const re = /'([A-Za-z0-9_]+)'\s*=>\s*([01])/g;
   let m: RegExpExecArray | null;
   while ((m = re.exec(block)) !== null) modules[m[1]] = Number(m[2]);
   return modules;
}

// module.xml reader: <module name="..." version/setup_version="..."> + <sequence> names.
function parseModuleXml(text: string): {
   name: string | null;
   version: string | null;
   sequence: string[];
} {
   const mod = /<module\b[^>]*\bname="([A-Za-z0-9_]+)"([^>]*)>/.exec(text);
   if (!mod) return { name: null, version: null, sequence: [] };
   const attrs = mod[2];
   const ver = /\b(?:setup_)?version="([^"]+)"/.exec(attrs);
   const sequence: string[] = [];
   const seqMatch = /<sequence>([\s\S]*?)<\/sequence>/.exec(text);
   if (seqMatch) {
      const nameRe = /<name>([A-Za-z0-9_]+)<\/name>/g;
      let nm: RegExpExecArray | null;
      while ((nm = nameRe.exec(seqMatch[1])) !== null) sequence.push(nm[1]);
   }
   return { name: mod[1], version: ver ? ver[1] : null, sequence };
}

function readComposerJson(
   text: string,
): { name?: string; version?: string; license?: string } | null {
   try {
      const parsed = JSON.parse(text) as {
         name?: string;
         version?: string;
         license?: string | string[];
      };
      return {
         ...(parsed.name ? { name: parsed.name } : {}),
         ...(parsed.version ? { version: parsed.version } : {}),
         ...(parsed.license
            ? {
                 license: Array.isArray(parsed.license)
                    ? parsed.license.join(", ")
                    : parsed.license,
              }
            : {}),
      };
   } catch {
      return null;
   }
}

function pascalToKebab(s: string): string {
   return slugify(s.replace(/([a-z0-9])([A-Z])/g, "$1-$2"));
}

// vendor/composer/installed.json map (fix round, issue #19): declaredModuleName -> composer
// package facts. Accepts both composer shapes — v1 root array and v2 {packages, packages-dev}.
// One installed.json read + one module.xml read per package entry (b); module.xml facts are
// reused so record assembly never re-opens a mapped file. Deny-gated like every read.
interface InstalledEntry {
   composerName: string;
   composerVersion: string | null;
   installPath: string;
   moduleXmlRel: string;
   parsed: { name: string | null; version: string | null; sequence: string[] };
}

function buildInstalledJsonMap(ctx: ScanContext): Map<string, InstalledEntry> {
   const map = new Map<string, InstalledEntry>();
   const opened = ctx.openFile("vendor/composer/installed.json", {
      scope: false,
   });
   if (!opened) return map; // absent or denied: resolution falls back to path candidates
   let raw: unknown;
   try {
      raw = JSON.parse(opened.text);
   } catch {
      ctx.diagnostics.push({
         code: "UNSUPPORTED_SHAPE",
         severity: "warning",
         message:
            "vendor/composer/installed.json is not parseable JSON; composer-package resolution is skipped.",
      });
      ctx.unknownShapes += 1;
      return map;
   }
   let list: unknown[] = [];
   if (Array.isArray(raw)) list = raw;
   else if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { packages?: unknown[] }).packages)
   ) {
      const obj = raw as { packages?: unknown[]; "packages-dev"?: unknown[] };
      list = [
         ...(obj.packages ?? []),
         ...(Array.isArray(obj["packages-dev"])
            ? (obj["packages-dev"] as unknown[])
            : []),
      ];
   }
   for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const pkg = entry as {
         name?: unknown;
         version?: unknown;
         "install-path"?: unknown;
      };
      if (
         typeof pkg.name !== "string" ||
         typeof pkg["install-path"] !== "string"
      )
         continue;
      // Composer v2 writes install paths relative to vendor/composer/ (e.g. "../magento/module-store");
      // bare "vendor/..." spellings (fixtures, some v1 writers) are kept as-is. Either way the path
      // must be root-relative — the gateway's containment check rejects anything else.
      const rawPath = pkg["install-path"];
      const installPath = normalizeRel(
         rawPath.startsWith("../")
            ? path.posix.join("vendor/composer", rawPath)
            : rawPath,
      );
      const moduleXmlRel = `${installPath}/etc/module.xml`;
      const modOpened = ctx.openFile(moduleXmlRel, { scope: false });
      const parsed = modOpened
         ? parseModuleXml(modOpened.text)
         : { name: null, version: null, sequence: [] };
      if (!parsed.name) continue;
      if (!map.has(parsed.name)) {
         map.set(parsed.name, {
            composerName: pkg.name,
            composerVersion:
               typeof pkg.version === "string" ? pkg.version : null,
            installPath,
            moduleXmlRel,
            parsed,
         });
      }
   }
   return map;
}

// Resolve a module's on-disk directory + origin. Order (fix round): app/code direct (custom) ->
// installed.json map (native when composerName starts "magento/", else third-party) -> direct
// vendor candidates -> bounded declared-name fallback. A config.php entry that is NOT under
// app/code is vendor-supplied by construction, so a genuinely-absent module is native only for
// Magento core naming and third-party otherwise (composer vendor dirs need not follow the PHP
// vendor prefix — e.g. Hyva_* packages under vendor/hyva-themes/magento2-*).
interface ResolvedModule {
   dir: string | null;
   origin: "custom" | "native" | "third-party";
   onDisk: boolean;
   viaMap?: InstalledEntry;
}

function resolveModuleDir(
   ctx: ScanContext,
   nativeName: string,
   installed: Map<string, InstalledEntry>,
): ResolvedModule {
   const parts = nativeName.split("_");
   const mapEntry = installed.get(nativeName);
   if (parts.length < 2) {
      // Single-segment declaration: never app/code shaped; vendor-supplied by construction.
      if (mapEntry)
         return {
            dir: mapEntry.installPath,
            origin: mapEntry.composerName.startsWith("magento/")
               ? "native"
               : "third-party",
            onDisk: true,
            viaMap: mapEntry,
         };
      return {
         dir: null,
         origin: /^Magento_/i.test(nativeName) ? "native" : "third-party",
         onDisk: false,
      };
   }
   const vendor = parts[0];
   const pkg = parts.slice(1).join("_");
   const appCodeDir = `app/code/${vendor}/${pkg}`;
   if (ctx.exists(appCodeDir))
      return { dir: appCodeDir, origin: "custom", onDisk: true };
   if (mapEntry)
      return {
         dir: mapEntry.installPath,
         origin: mapEntry.composerName.startsWith("magento/")
            ? "native"
            : "third-party",
         onDisk: true,
         viaMap: mapEntry,
      };
   const vendorKebab = pascalToKebab(vendor);
   const pkgKebab = pascalToKebab(pkg);
   const vendorDir = `vendor/${vendorKebab}`;
   const vendorCandidates = [
      `vendor/${vendorKebab}/${pkgKebab}`,
      `vendor/${vendorKebab}/module-${pkgKebab}`,
   ];
   for (const cand of vendorCandidates) {
      if (ctx.exists(cand)) {
         return {
            dir: cand,
            origin: vendorKebab === "magento" ? "native" : "third-party",
            onDisk: true,
         };
      }
   }
   // Fallback: enumerate vendor/<vendor>/*/etc/module.xml (bounded) and match the DECLARED
   // module name exactly — directory spelling may contain extra hyphens the name does not.
   const packages = ctx.listDirs(vendorDir).slice(0, MAX_VENDOR_PACKAGE_PROBES);
   for (const pkgDir of packages) {
      const modRel = `${pkgDir.rel}/etc/module.xml`;
      const opened = ctx.openFile(modRel, { scope: false });
      if (!opened) continue;
      const parsed = parseModuleXml(opened.text);
      if (parsed.name === nativeName) {
         return {
            dir: pkgDir.rel,
            origin: vendorKebab === "magento" ? "native" : "third-party",
            onDisk: true,
         };
      }
   }
   // Genuinely absent on disk: origin inferred from the declaration name (Magento core naming
   // -> native, else third-party — a non-app/code entry is vendor-supplied by construction).
   return {
      dir: null,
      origin: /^Magento_/i.test(nativeName) ? "native" : "third-party",
      onDisk: false,
   };
}

// Declaration-file presence inventory (existence checks ONLY — no content reads). Kinds use the
// frozen kb-capability entrypoints.kind enum: webapi.xml -> api, widget.xml -> admin-widget-form
// (widget.xml registers admin CMS widget forms), layout dirs -> template. etc/di.xml has no
// enum member (it is dependency-injection configuration, not an entrypoint surface) — its
// presence is recorded in the record's notes instead of forcing a wrong enum value.
function entrypointsFor(
   ctx: ScanContext,
   dir: string,
): { entrypoints: { kind: string; ref: string }[]; notes: string[] } {
   const checks: { rel: string; kind?: string }[] = [
      { rel: `${dir}/etc/webapi.xml`, kind: "api" },
      { rel: `${dir}/etc/frontend/layout`, kind: "template" },
      { rel: `${dir}/etc/adminhtml/layout`, kind: "template" },
      { rel: `${dir}/etc/widget.xml`, kind: "admin-widget-form" },
      { rel: `${dir}/etc/di.xml` }, // notes-only presence (no entrypoints.kind enum member)
   ];
   const entrypoints: { kind: string; ref: string }[] = [];
   const notes: string[] = [];
   for (const c of checks) {
      if (!ctx.exists(c.rel)) continue;
      if (c.kind)
         entrypoints.push({
            kind: c.kind,
            ref: normalizeRel(c.rel).slice(dir.length + 1),
         });
      else notes.push(`${normalizeRel(c.rel).slice(dir.length + 1)} present`);
   }
   entrypoints.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref),
   );
   return { entrypoints, notes };
}

function scanMagentoPlatform(
   ctx: ScanContext,
   platform: { id: string; version?: string },
): {
   capabilities: Record<string, unknown>[];
   observedPlatformVersion?: string;
} {
   const capabilities: Record<string, unknown>[] = [];

   const composerRel = "composer.json";
   const composerOpened = ctx.openFile(composerRel, { scope: false });
   const composer = composerOpened
      ? readComposerJson(composerOpened.text)
      : null;
   if (!composer?.version) {
      ctx.diagnostics.push({
         code: "PLATFORM_VERSION_UNDECLARED",
         severity: "info",
         message:
            "composer.json is absent or declares no version field; the payload platform version is omitted rather than guessed.",
      });
   }
   const platformVersion = composer?.version;
   // composer.lock is read + digested (pinning per the scan contract) but only composer.json's
   // own version field feeds platform.version — the lock file content is not parsed here.
   ctx.openFile("composer.lock", { scope: false });

   const configOpened = ctx.openFile("app/etc/config.php", {
      scope: false,
      required: true,
   });
   if (!configOpened) {
      ctx.diagnostics.push({
         code: "CONFIG_PHP_UNREADABLE",
         severity: "warning",
         message:
            "app/etc/config.php could not be read through the scan gateway; no module records are emitted rather than partial guesses.",
      });
      return { capabilities };
   }
   const modules = readConfigPhpModules(configOpened.text);
   if (modules === null) {
      ctx.diagnostics.push({
         code: "CONFIG_PHP_UNREADABLE",
         severity: "warning",
         message:
            "app/etc/config.php carries no parseable 'modules' block; no module records are emitted.",
      });
      return { capabilities };
   }

   // One vendor/composer/installed.json read up front (declared module name -> composer facts);
   // record assembly reuses the mapped module.xml facts instead of re-opening those files.
   const installed = buildInstalledJsonMap(ctx);

   for (const nativeName of Object.keys(modules)) {
      const enabled = modules[nativeName] === 1;
      const resolved = resolveModuleDir(ctx, nativeName, installed);
      const mapEntry = installed.get(nativeName);
      const uncertainty: string[] = ["runtime DB enablement state not scanned"];
      if (!resolved.onDisk) {
         uncertainty.push(
            "module directory not found under app/code, vendor/composer/installed.json or vendor candidates; declaration present in config.php only",
         );
         uncertainty.push(
            `origin inferred from the declaration name (${resolved.origin}); no on-disk module dir confirms it`,
         );
      }
      let sequence: string[] = [];
      let entrypoints: { kind: string; ref: string }[] = [];
      const notes: string[] = [];
      const digestRels = ["app/etc/config.php"];
      let declared: string | undefined;
      let modXmlRel: string | null = null;
      let parsedMod: {
         name: string | null;
         version: string | null;
         sequence: string[];
      } | null = null;
      if (resolved.viaMap) {
         // The map build already opened + digested this module.xml; reuse its facts (one read per
         // package, per the scan budget).
         modXmlRel = resolved.viaMap.moduleXmlRel;
         parsedMod = resolved.viaMap.parsed;
      } else if (resolved.dir) {
         modXmlRel = `${resolved.dir}/etc/module.xml`;
         const opened = ctx.openFile(modXmlRel, { scope: false });
         parsedMod = opened ? parseModuleXml(opened.text) : null;
      }
      if (parsedMod && parsedMod.name === nativeName) {
         digestRels.push(modXmlRel as string);
         if (parsedMod.version) declared = parsedMod.version;
         else
            uncertainty.push(
               "module.xml declares no version attribute; declared version unknown",
            );
         sequence = parsedMod.sequence;
      } else if (parsedMod) {
         uncertainty.push(
            "module.xml declares a different module name than config.php; version and dependencies not taken from it",
         );
         modXmlRel = null;
         parsedMod = null;
      } else {
         uncertainty.push("module.xml absent: version unknown");
      }
      if (mapEntry) digestRels.push("vendor/composer/installed.json");
      const locked = mapEntry?.composerVersion ?? undefined;
      const versionSource =
         declared && locked
            ? "module-xml+composer-lock"
            : declared
              ? "module-xml"
              : locked
                ? "composer-lock"
                : undefined;
      const version =
         declared || locked
            ? {
                 ...(declared ? { declared } : {}),
                 ...(locked ? { locked } : {}),
                 ...(versionSource ? { source: versionSource } : {}),
              }
            : undefined;
      if (resolved.dir) {
         const ep = entrypointsFor(ctx, resolved.dir);
         entrypoints = ep.entrypoints;
         notes.push(...ep.notes);
      }
      if (sequence.length > 0)
         notes.push(`module.xml <sequence>: ${sequence.join(", ")}`);

      const record: Record<string, unknown> = {
         schemaVersion: 1,
         recordType: "module",
         id: `mod:magento:${slugify(nativeName)}`,
         nativeId: nativeName,
         namespace: "magento-platform",
         platform: platform.id,
         ...(platformVersion ? { platformVersion } : {}),
         origin: resolved.origin,
         category: "platform-glue",
         title: nativeName,
         // Honest inventory language: a module declaration implies NO capability semantics.
         semantics:
            "Installed Magento module declaration; capability semantics are NOT implied.",
         ...(entrypoints.length > 0 ? { entrypoints } : {}),
         ...(sequence.length > 0 ? { dependencies: { hard: sequence } } : {}),
         enablement: {
            state: enabled ? "enabled" : "disabled",
            source: "config-scan",
         },
         installed: resolved.onDisk,
         ...(version ? { version } : {}),
         sourceRef: sourceRefFor(ctx, "app/etc/config.php"),
         evidence: {
            proofLevel: "DETECTED",
            sources: [
               sourceRefFor(ctx, "app/etc/config.php"),
               ...(modXmlRel && digestRels.includes(modXmlRel)
                  ? [sourceRefFor(ctx, modXmlRel)]
                  : []),
            ],
            method: "declaration-scan",
            confidence: "high",
            uncertainty,
         },
         lifecycle: LIFECYCLE,
         observed: {
            scannedAt: NOW(),
            inputDigests: inputDigestsFor(ctx, digestRels),
         },
         ...(notes.length > 0 ? { notes: notes.join("; ") } : {}),
      };
      capabilities.push(record);
   }
   return {
      capabilities,
      ...(platformVersion ? { observedPlatformVersion: platformVersion } : {}),
   };
}

// ---- kind=pagebuilder-native -------------------------------------------------------------------
function extractAppearanceNames(text: string): {
   names: string[];
   truncated: boolean;
} {
   const names: string[] = [];
   const re = /<appearance\b[^>]*\bname="([^"]+)"/g;
   let m: RegExpExecArray | null;
   let truncated = false;
   while ((m = re.exec(text)) !== null) {
      if (names.includes(m[1])) continue;
      if (names.length >= MAX_APPEARANCES_LISTED) {
         truncated = true;
         break;
      }
      names.push(m[1]);
   }
   return { names, truncated };
}

function scanPagebuilderNative(
   ctx: ScanContext,
   platform: { id: string; version?: string },
): { uiComponents: Record<string, unknown>[] } {
   const uiComponents: Record<string, unknown>[] = [];
   if (ctx.baseRel === "") {
      ctx.diagnostics.push({
         code: "SCAN_SUBPATH_UNRESOLVED",
         severity: "error",
         message:
            "The pagebuilder-native scan requires a subPath bounding the content-type directory; without it nothing is enumerated.",
      });
      return { uiComponents };
   }
   const baseReal = path.join(ctx.rootReal, ctx.baseRel);
   let stat: fs.Stats;
   try {
      stat = fs.statSync(fs.realpathSync(baseReal));
   } catch {
      ctx.diagnostics.push({
         code: "SCAN_SUBPATH_UNRESOLVED",
         severity: "error",
         message: `subPath '${ctx.rootAlias}:${ctx.baseRel}' does not resolve to a directory under the scan root; nothing is enumerated.`,
      });
      return { uiComponents };
   }
   if (!stat.isDirectory()) {
      ctx.diagnostics.push({
         code: "SCAN_SUBPATH_UNRESOLVED",
         severity: "error",
         message: `subPath '${ctx.rootAlias}:${ctx.baseRel}' is not a directory; nothing is enumerated.`,
      });
      return { uiComponents };
   }

   // Cheap version truth: root composer.lock name->version map (documented metadata exception),
   // consulted only when a declaring module.xml is absent.
   const lockVersions = new Map<string, string>();
   const lockOpened = ctx.openFile("composer.lock", { scope: false });
   if (lockOpened) {
      try {
         const lock = JSON.parse(lockOpened.text) as {
            packages?: { name: string; version: string }[];
         };
         for (const p of lock.packages ?? [])
            lockVersions.set(p.name, p.version);
      } catch {
         ctx.diagnostics.push({
            code: "UNSUPPORTED_SHAPE",
            severity: "warning",
            message:
               "composer.lock is not parseable JSON; lockfile version lookups are skipped.",
         });
         ctx.unknownShapes += 1;
      }
   }

   for (const rel of ctx.walkFiles(ctx.baseRel, ".xml")) {
      const opened = ctx.openFile(rel, { scope: true, required: true });
      if (!opened) continue;
      const typeName = path.posix.basename(rel).replace(/\.xml$/i, "");
      const appearances = extractAppearanceNames(opened.text);
      if (appearances.truncated) {
         ctx.diagnostics.push({
            code: "APPEARANCES_TRUNCATED",
            severity: "warning",
            message: `Content type '${typeName}' declares more than ${MAX_APPEARANCES_LISTED} appearances; only the first ${MAX_APPEARANCES_LISTED} are listed.`,
            sourceRef: {
               kind: "repo-file",
               locator: { rootAlias: ctx.rootAlias, path: rel },
            },
         });
      }

      // Declaring module root: nearest ANCESTOR whose path has a module-root shape
      // (app/code/<V>/<M> or vendor/<vendor>/<pkg>[/extra]) AND whose etc/module.xml declares a
      // module name. Deeper-shaped candidates win; shape-bounded so the walk never reads
      // arbitrary ancestor metadata.
      const segments = rel.split("/");
      const rootCandidates: string[] = [];
      for (let i = segments.length - 1; i >= 1; i--) {
         const cand = segments.slice(0, i).join("/");
         if (
            /^app\/code\/[^/]+\/[^/]+$/.test(cand) ||
            /^vendor\/[^/]+\/[^/]+(\/[^/]+)?$/.test(cand)
         )
            rootCandidates.push(cand);
      }
      let moduleRoot: string | null = null;
      let moduleXmlRel: string | null = null;
      let moduleXml: {
         name: string | null;
         version: string | null;
         sequence: string[];
      } | null = null;
      for (const cand of rootCandidates) {
         const modRel = `${cand}/etc/module.xml`;
         const openedMod = ctx.openFile(modRel, { scope: false });
         if (openedMod) {
            const parsed = parseModuleXml(openedMod.text);
            if (parsed.name) {
               moduleRoot = cand;
               moduleXmlRel = modRel;
               moduleXml = parsed;
               break;
            }
         }
      }

      let version = moduleXml?.version ?? null;
      let composerName: string | null = null;
      let licenseRef = "Magento OSL-3.0/AFL-3.0 (composer.json license field)";
      let regime = "osl";
      const uncertainty: string[] = [
         "appearance rendering behavior not runtime-verified",
      ];
      const digestRels = [rel];
      if (moduleRoot) {
         const composerRel = `${moduleRoot}/composer.json`;
         const compOpened = ctx.openFile(composerRel, { scope: false });
         if (compOpened) {
            const comp = readComposerJson(compOpened.text);
            if (comp?.name) composerName = comp.name;
            if (comp?.license) {
               licenseRef = `Magento ${comp.license} (composer.json license field)`;
               regime =
                  /AFL-3\.0/i.test(comp.license) &&
                  !/OSL-3\.0/i.test(comp.license)
                     ? "afl"
                     : "osl";
            }
            if (comp?.version && !version) version = comp.version;
            if (comp?.name && !version) {
               const locked = lockVersions.get(comp.name);
               if (locked) version = locked;
            }
         }
      }
      if (moduleXmlRel && moduleXml?.version) digestRels.push(moduleXmlRel);
      if (!version) {
         version = "unknown";
         uncertainty.push(
            "declaring module version not determinable from module.xml, composer.json or composer.lock; sourcePackage.version is the literal string 'unknown'",
         );
      }
      if (!composerName)
         uncertainty.push(
            "declaring package name not determinable; sourcePackage.name is the literal string 'unknown'",
         );

      const record: Record<string, unknown> = {
         schemaVersion: 1,
         recordType: "ui-component",
         id: `uic:magento-pagebuilder:${slugify(typeName)}`,
         nativeId: typeName,
         sourcePackage: {
            kind: "page-builder-native",
            name: composerName ?? "unknown",
            version,
         },
         title: slugify(typeName),
         uxSemantics: {
            concept: conceptFor(typeName),
            // Honest, no invention: mapped concepts keep neutral vocabulary; 'other' names the type.
            description:
               conceptFor(typeName) === "other"
                  ? `Page Builder content type declaration '${typeName}' (appearance names only); UX semantics are not inferred beyond the declaration.`
                  : `Page Builder content type declaration '${typeName}', mapped to the '${conceptFor(typeName)}' concept by the adapter's documented name-mapping table; rendering behavior is not verified.`,
         },
         availability: { state: "editable-in-page-builder" },
         variants: appearances.names.map((n) => ({ name: n })),
         behavior: { cmsEditable: true },
         license: { status: "confirmed", regime, licenseRef },
         sourceRef: sourceRefFor(ctx, rel),
         evidence: {
            proofLevel: "DETECTED",
            sources: [
               sourceRefFor(ctx, rel),
               ...(moduleXmlRel && moduleXml?.version
                  ? [sourceRefFor(ctx, moduleXmlRel)]
                  : []),
            ],
            method: "xml-content-type-declaration-scan",
            confidence: "high",
            uncertainty,
         },
         lifecycle: LIFECYCLE,
         observed: {
            scannedAt: NOW(),
            inputDigests: inputDigestsFor(ctx, digestRels),
         },
      };
      uiComponents.push(record);
   }
   return { uiComponents };
}

// ---- kind=secomm-uiwidget ----------------------------------------------------------------------
// Bounded metadata-only definition parse. Supported shapes (documented, style-blind):
// (a) constructor parameter defaults — `$label = '...'`, `$schemaVersion = N`, ...
// (b) named arguments — `parent::__construct( id: 'banner_a', label: '...', template:
//     'Vendor_Module::path', group: '...', schemaVersion: 1, fields: $this->method(),
//     sourceComponent: '...', sourceVersion: '...', sortOrder: N )` — scalar keys are read by
//     distinctive whole-file patterns; `template` (a theme path POINTER, never a template's
//     content) / `sortOrder` / `id` are captured as bounded facts and ride on the notes.
// `fields` is either an inline `'name' => 'type'` array OR a `$this->method()` reference whose
// first array literal in the SAME file supplies the pairs. Caps unchanged: 32 names, 80 chars
// per name, 4000-char extraction slice, 512 KiB file cap. Anything unparseable stays
// UNSUPPORTED_SHAPE + UNKNOWN evidence (never guessed).
interface DefinitionMeta {
   id?: string;
   label?: string;
   group?: string;
   template?: string;
   sortOrder?: number;
   schemaVersion?: number;
   sourceComponent?: string;
   sourceVersion?: string;
   enabled?: boolean;
   fields: { name: string; type: string }[];
   fieldCount: number;
   parseable: boolean;
}

function parseDefinitionMeta(text: string): DefinitionMeta {
   const meta: DefinitionMeta = { fields: [], fieldCount: 0, parseable: false };
   const quoted = (name: string): string | undefined => {
      // Style (a) `$param = '...'` first, then style (b) `param: '...'` (named arguments).
      const a = new RegExp(`\\$(?:${name})\\s*=\\s*'([^']*)'`).exec(text);
      if (a) return a[1];
      const b = new RegExp(`\\b(?:${name})\\s*:\\s*'([^']*)'`).exec(text);
      return b ? b[1] : undefined;
   };
   const numbered = (name: string): number | undefined => {
      const a = new RegExp(`\\$(?:${name})\\s*=\\s*(\\d+)`).exec(text);
      if (a) return Number(a[1]);
      const b = new RegExp(`\\b(?:${name})\\s*:\\s*(\\d+)`).exec(text);
      return b ? Number(b[1]) : undefined;
   };
   const booleaned = (name: string): boolean | undefined => {
      const a = new RegExp(`\\$(?:${name})\\s*=\\s*(true|false)`).exec(text);
      if (a) return a[1] === "true";
      const b = new RegExp(`\\b(?:${name})\\s*:\\s*(true|false)`).exec(text);
      return b ? b[1] === "true" : undefined;
   };
   const label = quoted("label");
   const group = quoted("group");
   const template = quoted("template");
   const id = quoted("id");
   const sourceComponent = quoted("sourceComponent|source_component");
   const sourceVersion = quoted("sourceVersion|source_version");
   const schemaVersion = numbered("schemaVersion");
   const sortOrder = numbered("sortOrder");
   const enabled = booleaned("enabled");
   if (label !== undefined) meta.label = label;
   if (group !== undefined) meta.group = group;
   if (template !== undefined) meta.template = template;
   if (id !== undefined) meta.id = id;
   if (sourceComponent !== undefined) meta.sourceComponent = sourceComponent;
   if (sourceVersion !== undefined) meta.sourceVersion = sourceVersion;
   if (schemaVersion !== undefined) meta.schemaVersion = schemaVersion;
   if (sortOrder !== undefined) meta.sortOrder = sortOrder;
   if (enabled !== undefined) meta.enabled = enabled;

   // fields: inline `'name' => 'type'` array, or a `$this->method()` reference whose first array
   // literal in the same file supplies the field schema (bounded slice, same caps). The schema is
   // either a FLAT name=>type map or a LIST OF PER-FIELD ROWS (`[ 'name' => ..., 'type' => ..., ... ]`
   // each nested one bracket level deeper). Rows group into ONE logical field each — emitting raw
   // key/value pairs would overcount logical fields by the per-row metadata keys.
   const extractPairs = (slice: string): void => {
      const pairRe =
         /'([A-Za-z0-9_.-]{1,80})'\s*=>\s*'([A-Za-z0-9_.-]{1,40})'/g;
      const emit = (name: string, type: string, extras: string[]) => {
         meta.fieldCount += 1;
         if (meta.fields.length < MAX_FIELDS_LISTED) {
            const note =
               extras.length > 0
                  ? `other declared keys: ${extras.slice(0, 4).join(", ")}`
                  : "";
            meta.fields.push({
               name: name.slice(0, MAX_FIELD_NAME_CHARS),
               type: type.slice(0, 40),
               ...(note ? { note } : {}),
            });
         }
      };
      // Split the slice into depth-1 bracket groups (rows). No groups ⇒ flat map shape.
      const rows: string[] = [];
      let depth = 0;
      let start = -1;
      for (let i = 0; i < Math.min(slice.length, 4000); i++) {
         const c = slice[i];
         if (c === "[") {
            depth++;
            if (depth === 2 && start === -1) start = i;
         } else if (c === "]") {
            if (depth === 2 && start !== -1) {
               rows.push(slice.slice(start, i + 1));
               start = -1;
            }
            depth--;
         }
      }
      if (rows.length === 0) {
         // flat map: every top-level pair is one logical field (name => type)
         let pm: RegExpExecArray | null;
         while ((pm = pairRe.exec(slice)) !== null) emit(pm[1], pm[2], []);
         return;
      }
      for (const row of rows) {
         const pairs: { key: string; val: string }[] = [];
         let pm: RegExpExecArray | null;
         pairRe.lastIndex = 0;
         while ((pm = pairRe.exec(row)) !== null)
            pairs.push({ key: pm[1], val: pm[2] });
         if (pairs.length === 0) continue;
         const name = pairs.find((p) => p.key === "name")?.val;
         const type = pairs.find((p) => p.key === "type")?.val;
         if (name === undefined) continue; // row without a declared name is not a named field
         const extras = pairs
            .filter((p) => p.key !== "name" && p.key !== "type")
            .map((p) => `${p.key}=${p.val}`);
         emit(name, type ?? "unknown", extras);
      }
   };
   const fieldsRef = /\bfields\s*:\s*\$this->(\w+)\s*\(/.exec(text);
   if (fieldsRef) {
      const fnRe = new RegExp(`function\\s+${fieldsRef[1]}\\s*\\([^)]*\\)`);
      const fm = fnRe.exec(text);
      if (fm) {
         const open = text.indexOf("[", fm.index);
         if (open !== -1) {
            let depth = 0;
            let end = -1;
            for (let i = open; i < Math.min(text.length, open + 4000); i++) {
               const c = text[i];
               if (c === "[") depth++;
               else if (c === "]") {
                  depth--;
                  if (depth === 0) {
                     end = i;
                     break;
                  }
               }
            }
            if (end !== -1) extractPairs(text.slice(open, end + 1));
         }
      }
   } else {
      const fieldsIdx = text.search(/\$\s*fields\s*=|\bfields\s*:\s*\[/);
      if (fieldsIdx !== -1)
         extractPairs(text.slice(fieldsIdx, fieldsIdx + 4000));
   }
   const anyFact =
      meta.label !== undefined ||
      meta.group !== undefined ||
      meta.sourceComponent !== undefined ||
      meta.schemaVersion !== undefined ||
      meta.template !== undefined ||
      meta.id !== undefined ||
      meta.fieldCount > 0;
   meta.parseable = anyFact;
   return meta;
}

function extractRegistryItems(
   text: string,
): { componentId: string; definitionClass: string }[] {
   const out: { componentId: string; definitionClass: string }[] = [];
   const typeRe =
      /<type\b[^>]*\bname="([^"]*Registry)"[^>]*>([\s\S]*?)<\/type>/g;
   let tm: RegExpExecArray | null;
   while ((tm = typeRe.exec(text)) !== null) {
      const itemRe =
         /<item\b[^>]*\bname="([^"]+)"[^>]*xsi:type="object"[^>]*>([^<]*)<\/item>/g;
      let im: RegExpExecArray | null;
      while ((im = itemRe.exec(tm[2])) !== null) {
         const classCand = im[2].trim();
         const last = classCand.split("\\").pop() ?? "";
         if (!/^[A-Za-z0-9_]+$/.test(last) || classCand.includes("<")) continue; // unsupported item body
         out.push({ componentId: im[1], definitionClass: last });
      }
   }
   const seen = new Set<string>();
   return out
      .filter((x) => {
         if (seen.has(x.componentId)) return false;
         seen.add(x.componentId);
         return true;
      })
      .sort((a, b) => a.componentId.localeCompare(b.componentId));
}

function scanSecommUiwidget(
   ctx: ScanContext,
   platform: { id: string; version?: string },
): {
   uiComponents: Record<string, unknown>[];
   relations: Record<string, unknown>[];
} {
   const uiComponents: Record<string, unknown>[] = [];
   const relations: Record<string, unknown>[] = [];
   if (ctx.baseRel === "") {
      ctx.diagnostics.push({
         code: "SCAN_SUBPATH_UNRESOLVED",
         severity: "error",
         message:
            "The secomm-uiwidget scan requires a subPath bounding the module directory; without it nothing is enumerated.",
      });
      return { uiComponents, relations };
   }

   // Module declaration facts (within subPath).
   const modXmlRel = `${ctx.baseRel}/etc/module.xml`;
   const modOpened = ctx.openFile(modXmlRel, { scope: true });
   const modParsed = modOpened ? parseModuleXml(modOpened.text) : null;
   if (!modOpened || !modParsed?.name) {
      ctx.diagnostics.push({
         code: "MODULE_XML_UNREADABLE",
         severity: "warning",
         message: `etc/module.xml under '${ctx.rootAlias}:${ctx.baseRel}' is absent or unparseable; sourcePackage.name/version are 'unknown'.`,
         sourceRef: {
            kind: "repo-file",
            locator: { rootAlias: ctx.rootAlias, path: modXmlRel },
         },
      });
   }
   const packageName = modParsed?.name ?? "unknown";
   const packageVersion = modParsed?.version ?? "unknown";

   // Widget declarations: KB-1-side facts only — counted, digested, never emitted as KB-2
   // records and their label text never enters the payload.
   const widgetXmlRel = `${ctx.baseRel}/etc/widget.xml`;
   const widgetOpened = ctx.openFile(widgetXmlRel, { scope: true });
   let widgetCount = 0;
   if (widgetOpened) {
      const widgetRe = /<widget\b[^>]*\bid="([^"]+)"/g;
      let wm: RegExpExecArray | null;
      while ((wm = widgetRe.exec(widgetOpened.text)) !== null) widgetCount += 1;
      ctx.diagnostics.push({
         code: "UIWIDGET_WIDGETS_DECLARED",
         severity: "info",
         message: `etc/widget.xml declares ${widgetCount} CMS widget registration(s); widget declarations are KB-1-side facts and are not emitted as KB-2 records.`,
         sourceRef: {
            kind: "repo-file",
            locator: { rootAlias: ctx.rootAlias, path: widgetXmlRel },
         },
      });
   }

   // Enablement fact: app/etc/config.php under the scan ROOT (documented bounded metadata
   // exception — outside subPath, deny + containment still enforced, config-scan proves file
   // state only).
   let enablementKnown = false;
   let enabled = false;
   const configOpened = ctx.openFile("app/etc/config.php", { scope: false });
   if (configOpened) {
      const modules = readConfigPhpModules(configOpened.text);
      if (modules && packageName in modules) {
         enablementKnown = true;
         enabled = modules[packageName] === 1;
      }
   }
   if (!enablementKnown) {
      ctx.diagnostics.push({
         code: "ENABLEMENT_UNKNOWN",
         severity: "info",
         message: `Module enablement for '${packageName}' is not detectable (config.php unreadable, absent, or lacks the module); availability stays 'eligible-for-widget'.`,
      });
   }

   const diXmlRel = `${ctx.baseRel}/etc/di.xml`;
   const diOpened = ctx.openFile(diXmlRel, { scope: true, required: true });
   if (!diOpened) {
      ctx.diagnostics.push({
         code: "UNSUPPORTED_SHAPE",
         severity: "warning",
         message: `etc/di.xml under '${ctx.rootAlias}:${ctx.baseRel}' could not be read; no component records are emitted.`,
      });
      ctx.unknownShapes += 1;
      return { uiComponents, relations };
   }
   const items = extractRegistryItems(diOpened.text);

   for (const item of items) {
      const kebab = slugify(item.componentId);
      const defRel = `${ctx.baseRel}/Model/Component/${item.definitionClass}.php`;
      const defOpened = ctx.openFile(defRel, { scope: true });
      let meta: DefinitionMeta | null = null;
      let shapeSupported = true;
      if (!defOpened) {
         shapeSupported = false;
         ctx.diagnostics.push({
            code: "UNSUPPORTED_SHAPE",
            severity: "warning",
            message: `Registry component '${item.componentId}': definition class '${item.definitionClass}' has no readable file at Model/Component/${item.definitionClass}.php; the component record carries UNKNOWN evidence.`,
            sourceRef: {
               kind: "repo-file",
               locator: { rootAlias: ctx.rootAlias, path: defRel },
            },
         });
         ctx.unknownShapes += 1;
      } else if (defOpened.bytes.length > MAX_DEFINITION_FILE_BYTES) {
         shapeSupported = false;
         ctx.diagnostics.push({
            code: "UNSUPPORTED_SHAPE",
            severity: "warning",
            message: `Registry component '${item.componentId}': definition file exceeds the ${MAX_DEFINITION_FILE_BYTES}-byte metadata-parse bound; treated as an unsupported shape.`,
            sourceRef: {
               kind: "repo-file",
               locator: { rootAlias: ctx.rootAlias, path: defRel },
            },
         });
         ctx.unknownShapes += 1;
      } else {
         meta = parseDefinitionMeta(defOpened.text);
         if (!meta.parseable) {
            shapeSupported = false;
            ctx.diagnostics.push({
               code: "UNSUPPORTED_SHAPE",
               severity: "warning",
               message: `Registry component '${item.componentId}': definition file carries none of the documented named scalar metadata; the component record carries UNKNOWN evidence (body never emitted).`,
               sourceRef: {
                  kind: "repo-file",
                  locator: { rootAlias: ctx.rootAlias, path: defRel },
               },
            });
            ctx.unknownShapes += 1;
         }
      }

      const cmsEditable = widgetCount > 0;
      const uncertainty: string[] = [
         "definition facts are bounded metadata extracted from declarations; rendering behavior is not verified",
         "editable via CMS widget placement, not Page Builder canvas",
      ];
      if (!enablementKnown)
         uncertainty.push(
            "module enablement not detectable from config.php in this scan; availability is capped at 'eligible-for-widget'",
         );
      if (meta?.sourceVersion)
         uncertainty.push(
            `version pinned by the definition's sourceVersion '${meta.sourceVersion}'; upstream drift is not tracked by this scan`,
         );
      const notes: string[] = [];
      if (shapeSupported && meta?.id && meta.id !== item.componentId)
         notes.push(
            `definition declares id '${truncate(meta.id, MAX_FIELD_NAME_CHARS)}' differing from the registry key '${item.componentId}'`,
         );
      if (shapeSupported && meta?.template)
         notes.push(
            `template pointer: ${truncate(meta.template, MAX_FIELD_NAME_CHARS)}`,
         );
      if (shapeSupported && meta?.sortOrder !== undefined)
         notes.push(`sortOrder: ${meta.sortOrder}`);
      if (shapeSupported && meta?.sourceVersion)
         notes.push(
            `Adapted from licensed upstream component '${meta.sourceComponent ?? "unknown"}' (sourceVersion ${meta.sourceVersion}).`,
         );

      const record: Record<string, unknown> = {
         schemaVersion: 1,
         recordType: "ui-component",
         id: `uic:secomm-uiwidget:${kebab}`,
         nativeId: item.componentId,
         sourcePackage: {
            kind: "secomm-uiwidget",
            name: packageName,
            version: packageVersion,
         },
         title: meta?.label
            ? truncate(meta.label, MAX_FIELD_NAME_CHARS)
            : kebab,
         uxSemantics: {
            concept: "other",
            description: meta?.label
               ? `DI-registered widget component '${item.componentId}' (declared label: ${truncate(meta.label, MAX_FIELD_NAME_CHARS)}); metadata-only record. Merchant-editable through the CMS widget system, not the Page Builder canvas.`
               : `DI-registered widget component '${item.componentId}'; metadata-only record with UNKNOWN-shape evidence (declaration metadata not parseable).`,
         },
         availability: {
            state:
               enablementKnown && enabled
                  ? "imported-runtime"
                  : "eligible-for-widget",
         },
         variants: [],
         behavior: { cmsEditable },
         license: {
            status: "confirmed",
            regime: "proprietary",
            licenseRef:
               "Owner-authorized client module (issue #19 GO-2); metadata-only",
            derivedArtifactPolicy: "metadata-only",
         },
         sourceRef:
            shapeSupported && defOpened
               ? sourceRefFor(ctx, defOpened.rel)
               : sourceRefFor(ctx, diXmlRel),
         evidence: {
            proofLevel: shapeSupported ? "DETECTED" : "UNKNOWN",
            sources:
               shapeSupported && defOpened
                  ? [
                       sourceRefFor(ctx, diXmlRel),
                       sourceRefFor(ctx, defOpened.rel),
                    ]
                  : [sourceRefFor(ctx, diXmlRel)],
            method: shapeSupported
               ? "registry-metadata"
               : "registry-metadata-unsupported-shape",
            confidence: shapeSupported ? "high" : "low",
            uncertainty,
         },
         lifecycle: LIFECYCLE,
         observed: {
            scannedAt: NOW(),
            inputDigests: inputDigestsFor(
               ctx,
               shapeSupported && defOpened
                  ? [diXmlRel, defOpened.rel]
                  : [diXmlRel],
            ),
         },
         ...(shapeSupported && meta
            ? {
                 configOptions: [
                    ...(meta.group
                       ? [
                            {
                               name: "group",
                               kind: "variant-prop",
                               notes: truncate(
                                  meta.group,
                                  MAX_FIELD_NAME_CHARS,
                               ),
                            },
                         ]
                       : []),
                    ...(meta.schemaVersion !== undefined
                       ? [
                            {
                               name: "schemaVersion",
                               kind: "behavior",
                               notes: String(meta.schemaVersion),
                            },
                         ]
                       : []),
                    ...meta.fields.map((f) => ({
                       name: f.name,
                       kind: "field",
                       notes: `type: ${f.type}`,
                    })),
                 ],
              }
            : {}),
         ...(notes.length > 0 ? { notes: notes.join("; ") } : {}),
      };
      uiComponents.push(record);

      // adaptedFrom edge: ONLY when the definition's sourceComponent resolves to a name.
      // Target = the hyva-ui CENSUS record id, which is per-component (uic:hyva-ui:<component>):
      // variants are fields of that record, never top-level ids (CONTRACTS §1.1), so the edge
      // resolves to the first sourceComponent path segment and the full variant path stays in
      // the edge note for traceability.
      if (shapeSupported && meta?.sourceComponent) {
         const targetComponent = slugify(
            meta.sourceComponent.split("/")[0] ?? meta.sourceComponent,
         );
         const relRecord: Record<string, unknown> = {
            schemaVersion: 1,
            recordType: "relation",
            id: `rel:secomm-uiwidget:adaptedfrom-${kebab}`,
            edgeType: "adaptedFrom",
            from: { kb: "KB2", id: `uic:secomm-uiwidget:${kebab}` },
            to: { kb: "KB2", id: `uic:hyva-ui:${targetComponent}` },
            authority: "confirmed",
            evidence: {
               proofLevel: "DETECTED",
               sources: [
                  sourceRefFor(ctx, diXmlRel),
                  sourceRefFor(ctx, defOpened?.rel ?? diXmlRel),
               ],
               confidence: "high",
               method: "registry-metadata",
               uncertainty: [
                  "Edge is declaration-level (di.xml registry item + definition sourceComponent); rendering equivalence is not verified.",
                  ...(meta.sourceVersion
                     ? [
                          `Version pinned by the definition's sourceVersion '${meta.sourceVersion}'.`,
                       ]
                     : []),
               ],
            },
            recordedAt: NOW(),
            observed: {
               scannedAt: NOW(),
               inputDigests: inputDigestsFor(ctx, [
                  diXmlRel,
                  defOpened?.rel ?? diXmlRel,
               ]),
            },
            note: `Adapted from upstream source component '${meta.sourceComponent}'${meta.sourceVersion ? ` at '${meta.sourceVersion}'` : ""} (variant path pinned here; the endpoint record is the component-level census id). Both endpoints are developer-owned (KB-2): the imported widget and the licensed upstream composition it was adapted from. Cross-class edges to Page Builder native are neighborOf, never adaptedFrom — none are emitted by this scan.`,
         };
         relations.push(relRecord);
      }
   }
   return { uiComponents, relations };
}

// ---- kind=hyva-ui ------------------------------------------------------------------------------
function scanHyvaUi(
   ctx: ScanContext,
   platform: { id: string; version?: string },
): { uiComponents: Record<string, unknown>[] } {
   const uiComponents: Record<string, unknown>[] = [];
   if (ctx.baseRel === "") {
      ctx.diagnostics.push({
         code: "SCAN_SUBPATH_UNRESOLVED",
         severity: "error",
         message:
            "The hyva-ui scan requires a subPath bounding the licensed package root; without it nothing is enumerated.",
      });
      return { uiComponents };
   }

   const composerRel = `${ctx.baseRel}/composer.json`;
   const compOpened = ctx.openFile(composerRel, {
      scope: true,
      required: true,
   });
   let pkgName = "unknown";
   let pkgVersion: string | null = null;
   let licenseRef = "HYVÄ SOFTWARE USER LICENSE (LICENSE.md pointer)";
   const composerUncertainty: string[] = [];
   if (compOpened) {
      const comp = readComposerJson(compOpened.text);
      if (!comp) {
         // UNSUPPORTED_SHAPE means unparseable — never "a field is missing".
         ctx.diagnostics.push({
            code: "UNSUPPORTED_SHAPE",
            severity: "warning",
            message: `composer.json under '${ctx.rootAlias}:${ctx.baseRel}' is not parseable JSON; sourcePackage facts are 'unknown'.`,
            sourceRef: {
               kind: "repo-file",
               locator: { rootAlias: ctx.rootAlias, path: composerRel },
            },
         });
         ctx.unknownShapes += 1;
      } else {
         if (comp.name) pkgName = comp.name;
         else
            composerUncertainty.push(
               "composer.json declares no name; sourcePackage.name is the literal string 'unknown'",
            );
         // Version often lives only in composer.lock (real Hyvä packages ship no version field).
         if (comp.version) pkgVersion = comp.version;
         else
            composerUncertainty.push("composer.json declares no version field");
         // License pointer strings (e.g. "See LICENSE.md or https://…") are fine metadata: keep
         // them verbatim in licenseRef only.
         if (comp.license) licenseRef = truncate(comp.license, 200);
      }
   }
   let lockPinned = false;
   if (!pkgVersion && pkgName !== "unknown") {
      // One bounded read at the checkout root (documented metadata exception, deny-gated).
      const lockOpened = ctx.openFile("composer.lock", { scope: false });
      if (lockOpened) {
         try {
            const lock = JSON.parse(lockOpened.text) as {
               packages?: { name: string; version: string }[];
               "packages-dev"?: { name: string; version: string }[];
            };
            const hit = [
               ...(lock.packages ?? []),
               ...(lock["packages-dev"] ?? []),
            ].find((p) => p.name === pkgName);
            if (hit?.version) {
               pkgVersion = hit.version;
               lockPinned = true;
            }
         } catch {
            ctx.diagnostics.push({
               code: "UNSUPPORTED_SHAPE",
               severity: "warning",
               message:
                  "composer.lock is not parseable JSON; lockfile version lookups are skipped.",
            });
            ctx.unknownShapes += 1;
         }
      }
   }
   const pkgVersionStr = pkgVersion ?? "unknown";
   if (!pkgVersion)
      composerUncertainty.push(
         pkgName !== "unknown"
            ? "no composer.lock entry pins a version; sourcePackage.version is the literal string 'unknown'"
            : "sourcePackage.version is the literal string 'unknown'",
      );
   else if (lockPinned)
      composerUncertainty.push(
         "sourcePackage.version pinned from composer.lock; composer.json declares no version field",
      );

   // Census by directory NAMES only. plugins/ subdirs are not components — their names are
   // emitted as ONE aggregate info diagnostic (names are metadata; the receipt may cite them).
   const pluginDirs = ctx.listDirs(`${ctx.baseRel}/plugins`);
   if (pluginDirs.length > 0) {
      ctx.diagnostics.push({
         code: "HYVA_UI_PLUGINS_DETECTED",
         severity: "info",
         message: `Licensed package plugins detected (names only): ${pluginDirs.map((p) => p.name).join(", ")}.`,
      });
   }

   const uncertainty = [
      ...composerUncertainty,
      "licensed package: metadata-only; consumption state in themes not scanned by this scan",
      "census is directory-name evidence only; no upstream file content was opened",
   ];
   for (const compDir of ctx.listDirs(`${ctx.baseRel}/components`)) {
      const variants = ctx.listDirs(compDir.rel).map((v) => ({ name: v.name }));
      const concept = conceptFor(compDir.name);
      const record: Record<string, unknown> = {
         schemaVersion: 1,
         recordType: "ui-component",
         id: `uic:hyva-ui:${slugify(compDir.name)}`,
         nativeId: compDir.name,
         sourcePackage: {
            kind: "hyva-ui",
            name: pkgName,
            version: pkgVersionStr,
         },
         title: compDir.name,
         uxSemantics: {
            concept,
            // Neutral census language ONLY — no invented behavior or styling claims.
            description:
               concept === "other"
                  ? `Licensed Hyvä UI component '${compDir.name}' present upstream; metadata-only record; no source bytes stored.`
                  : `Licensed Hyvä UI component '${compDir.name}' present upstream, mapped to the '${concept}' concept by the adapter's documented name table; metadata-only record; no source bytes stored.`,
         },
         availability: { state: "available-upstream" },
         variants,
         behavior: { cmsEditable: false },
         license: {
            status: "confirmed",
            regime: "commercial",
            licenseRef,
            derivedArtifactPolicy: "metadata-only",
         },
         sourceRef: {
            kind: "repo-file",
            locator: { rootAlias: ctx.rootAlias, path: compDir.rel },
         },
         evidence: {
            proofLevel: "DETECTED",
            sources: [sourceRefFor(ctx, composerRel)],
            method: "directory-census-metadata-only",
            confidence: "high",
            uncertainty,
         },
         lifecycle: LIFECYCLE,
         observed: {
            scannedAt: NOW(),
            inputDigests: inputDigestsFor(ctx, [composerRel]),
         },
         notes: "Variants are immediate subdirectory names of components/<component>/; plugin names, when present, ride on the scan payload diagnostics.",
      };
      uiComponents.push(record);
   }
   return { uiComponents };
}

// ---- Envelope ----------------------------------------------------------------------------------
function buildPayload(
   ctx: ScanContext,
   platform: { id: string; version?: string },
   records: {
      capabilities: Record<string, unknown>[];
      uiComponents: Record<string, unknown>[];
      relations: Record<string, unknown>[];
   },
): Record<string, unknown> {
   const sortedDigests: Record<string, string> = {};
   for (const k of Object.keys(ctx.digests).sort())
      sortedDigests[k] = ctx.digests[k];
   const capabilities = [...records.capabilities].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
   );
   const uiComponents = [...records.uiComponents].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
   );
   const relations = [...records.relations].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
   );
   // counts.modules = the number of capabilities[] entries with recordType 'module' (the
   // orchestrator enforces this equality for the magento-platform kind).
   const moduleCount = capabilities.filter(
      (c) => c.recordType === "module",
   ).length;
   return {
      schemaVersion: 1,
      adapterId: "magento-kb-source",
      scanId: ctx.scanId,
      kind: ctx.kind,
      rootAlias: ctx.rootAlias,
      platform,
      capabilities,
      uiComponents,
      relations,
      digests: sortedDigests,
      scanMetadata: {
         scannedAt: NOW(),
         fileCount: ctx.fileCount,
         deniedCount: ctx.deniedCount,
         unknownShapes: ctx.unknownShapes,
      },
      diagnostics: sortPayloadDiagnostics(ctx.diagnostics),
      counts: {
         capabilities: capabilities.length,
         modules: moduleCount,
         uiComponents: uiComponents.length,
         relations: relations.length,
      },
   };
}

function scanErrorPayload(
   scanId: string,
   kind: ScanKind,
   rootAlias: string,
   platform: { id: string; version?: string },
   code: string,
   message: string,
): Record<string, unknown> {
   return {
      schemaVersion: 1,
      adapterId: "magento-kb-source",
      scanId,
      kind,
      rootAlias,
      platform,
      capabilities: [],
      uiComponents: [],
      relations: [],
      digests: {},
      scanMetadata: {
         scannedAt: NOW(),
         fileCount: 0,
         deniedCount: 0,
         unknownShapes: 0,
      },
      diagnostics: [{ code, severity: "error", message }],
      counts: { capabilities: 0, modules: 0, uiComponents: 0, relations: 0 },
   };
}

// ---- Subprocess entry --------------------------------------------------------------------------
function failStderr(message: string): never {
   process.stderr.write(`adapter: ${message}\n`);
   process.exit(2);
}

function main(): void {
   let inputRaw: unknown;
   try {
      inputRaw = readStdinJson();
   } catch (e) {
      failStderr(`stdin is not valid JSON: ${(e as Error).message}`);
   }
   const input = inputRaw as ScanInput;
   if (!input || typeof input !== "object")
      failStderr("stdin payload is not an object");
   if (input.schemaVersion !== 1)
      failStderr("scan request schemaVersion must be 1");
   const scan = input.scan;
   if (!scan || typeof scan !== "object")
      failStderr("scan request is missing the 'scan' object");
   if (!/^[a-z0-9][a-z0-9-]*$/.test(scan.scanId ?? ""))
      failStderr("scan.scanId must match ^[a-z0-9][a-z0-9-]*$");
   if (
      ![
         "magento-platform",
         "pagebuilder-native",
         "secomm-uiwidget",
         "hyva-ui",
      ].includes(scan.kind)
   )
      failStderr(
         "scan.kind must be one of magento-platform|pagebuilder-native|secomm-uiwidget|hyva-ui",
      );
   if (!/^[a-z][a-z0-9-]*$/.test(scan.rootAlias ?? ""))
      failStderr(
         "scan.rootAlias must match ^[a-z][a-z0-9-]*$ (digest keys + payload identity depend on it)",
      );
   if (typeof scan.root !== "string" || scan.root.length === 0)
      failStderr(
         "scan.root must be the caller's absolute gateway-resolved scan root",
      );
   if (scan.subPath !== undefined && typeof scan.subPath !== "string")
      failStderr("scan.subPath must be a string when present");
   if (scan.denyGlobs !== undefined && !Array.isArray(scan.denyGlobs))
      failStderr(
         "scan.denyGlobs must be an array of glob strings when present",
      );
   if (!input.platform || typeof input.platform.id !== "string")
      failStderr("platform.id is required");
   for (const g of scan.denyGlobs ?? []) {
      if (typeof g !== "string" || g.length === 0)
         failStderr("scan.denyGlobs entries must be non-empty strings");
   }

   let rootReal: string;
   try {
      rootReal = fs.realpathSync(scan.root);
   } catch {
      failStderr(`scan root '${scan.root}' could not be canonicalized`);
   }
   const stat = fs.statSync(rootReal);
   if (!stat.isDirectory())
      failStderr(`scan root '${scan.root}' is not a directory`);

   const unknownOptions = Object.keys(scan.options ?? {}).filter(
      (k) => !KNOWN_OPTIONS.has(k),
   );
   if (unknownOptions.length > 0) {
      const payload = scanErrorPayload(
         scan.scanId,
         scan.kind,
         scan.rootAlias,
         input.platform,
         "UNKNOWN_SCAN_OPTION",
         `Scan declares no options for adapter version 1.x; unknown option key(s) ${unknownOptions.map((o) => `'${o}'`).join(", ")} are a scan error, never silently ignored. Declared options: none.`,
      );
      emitPayload(payload);
      return;
   }

   const ctx = new ScanContext(input, rootReal);
   let records: {
      capabilities: Record<string, unknown>[];
      uiComponents: Record<string, unknown>[];
      relations: Record<string, unknown>[];
   };
   let platform = input.platform;
   switch (scan.kind) {
      case "magento-platform": {
         const scanned = scanMagentoPlatform(ctx, input.platform);
         records = {
            capabilities: scanned.capabilities,
            uiComponents: [],
            relations: [],
         };
         // The payload platform version is the OBSERVED composer.json declaration, not the
         // caller's expected pin — the orchestrator compares the two and diagnoses divergence.
         if (scanned.observedPlatformVersion)
            platform = {
               ...input.platform,
               version: scanned.observedPlatformVersion,
            };
         break;
      }
      case "pagebuilder-native":
         records = {
            capabilities: [],
            ...scanPagebuilderNative(ctx, input.platform),
            relations: [],
         };
         break;
      case "secomm-uiwidget":
         records = {
            capabilities: [],
            ...scanSecommUiwidget(ctx, input.platform),
         };
         break;
      case "hyva-ui":
         records = {
            capabilities: [],
            ...scanHyvaUi(ctx, input.platform),
            relations: [],
         };
         break;
   }
   emitPayload(buildPayload(ctx, platform, records));
}

function emitPayload(payload: Record<string, unknown>): void {
   // Self-check before emitting: a contract-violating payload must never reach stdout.
   const validate = getAjv().getSchema(KB_SOURCE_SCAN_ID);
   if (!validate) {
      process.stderr.write(
         `adapter: output contract '${KB_SOURCE_SCAN_ID}' is not registered\n`,
      );
      process.exit(3);
   }
   const ok = validate(payload);
   if (!ok) {
      const first = (validate.errors ?? [
         { instancePath: "/", message: "unknown" },
      ])[0];
      process.stderr.write(
         `adapter: payload fails kb-source-scan contract: ${first.instancePath || "/"} ${first.message ?? ""}`.trim() +
            "\n",
      );
      process.exit(3);
   }
   process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

main();
