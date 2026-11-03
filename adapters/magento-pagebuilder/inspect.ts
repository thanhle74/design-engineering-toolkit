// Magento Page Builder adapter — read-only capability probe (out-of-process subprocess).
//
// Contract: stdin = one AdapterInput JSON document (schemas/cli/adapter-input.schema.json),
// stdout = one CapabilityRegistry JSON payload (schemas/converter/capability-registry.schema.json).
// The det core never imports this file; it spawns it per the adapter descriptor.
//
// Evidence rules (audited against a real Magento CE 2.4.8-p5 checkout, issue #9):
// - Platform/module versions come from composer.lock (pinned truth), not composer.json.
// - Enablement comes from app/etc/config.php via a narrow PHP-array reader (single-quoted
//   'Module_Name' => 0|1 entries; no array_merge/require in observed files).
// - Content types are declared PER FILE under view/adminhtml/pagebuilder/content_type/*.xml —
//   scanning a legacy single etc/content_type.xml would silently find zero types.
// - The same <type>/<appearance> may be re-declared across modules (merge semantics); entries are
//   grouped by (type, appearance) with per-module evidence retained.
// - Everything is bounded allow-glob scanning + a deny list; denied/out-of-scope candidates are
//   never read and produce LOCATOR_OUT_OF_SCOPE diagnostics.
// - Proof ceiling: REGISTERED via config-declaration evidence when the declaring module is
//   enabled in config.php; otherwise DISCOVERED. Unknown stays unknown (NOT_VERIFIED) — never
//   installed=enabled=runtime-proven.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sortDiagnostics, sha256Hex } from "../../src/core/canonical.js";
import { validateContract } from "../../src/core/schema-registry.js";
import type { Availability, Capability, CapabilityRegistry, Diagnostic, EvidenceKind, ProofLevel, SourceEvidence, SourceRevision } from "../../src/core/types.js";

// ---- Input ----------------------------------------------------------------------------------
interface AdapterInput {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  source: { sourceId: string; kind?: string; path: string; scopes?: { include?: string[]; exclude?: string[] } };
  options?: Record<string, unknown>;
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

// ---- Bounded filesystem surfaces ------------------------------------------------------------
// Never-read surfaces (deny list). These are checked BEFORE any file is opened.
const DENY_RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /(^|\/)env\.php$/, label: "env.php" },
  { pattern: /(^|\/)auth\.json$/, label: "auth.json" },
  { pattern: /(^|\/)\.git(\/|$)/, label: ".git/" },
  { pattern: /(^|\/)var\//, label: "var/" },
  { pattern: /(^|\/)pub\//, label: "pub/" },
  { pattern: /(^|\/)generated\//, label: "generated/" },
  { pattern: /(^|\/)node_modules\//, label: "node_modules/" },
  { pattern: /\.(pem|key)$/, label: "key material" },
  { pattern: /(^|\/)id_rsa/, label: "private key" },
];

const deniedLabel = (rel: string): string | null => {
  for (const r of DENY_RULES) if (r.pattern.test(rel)) return r.label;
  return null;
};

// Scope selector semantics (adapter-defined): a selector matches a relative path when the path
// equals the selector or lives underneath it (prefix semantics). Deterministic and documented.
function scopeAllows(rel: string, scopes?: { include?: string[]; exclude?: string[] }): { allowed: boolean; reason?: string } {
  const norm = rel.split(path.sep).join("/");
  if (scopes?.exclude?.some((sel) => norm === sel || norm.startsWith(sel + "/"))) return { allowed: false, reason: `excluded by profile scope` };
  if (scopes?.include && scopes.include.length > 0 && !scopes.include.some((sel) => norm === sel || norm.startsWith(sel + "/"))) {
    return { allowed: false, reason: `outside profile include scopes` };
  }
  return { allowed: true };
}

// Expand one segment pattern (supports '*' within a segment) against a directory, deterministically.
function globOne(root: string, pattern: string): string[] {
  const segments = pattern.split("/");
  let current = [""];
  for (const seg of segments) {
    const next: string[] = [];
    for (const base of current) {
      const dir = path.join(root, base);
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dir).sort();
      } catch {
        continue;
      }
      if (seg === "*") next.push(...entries.map((e) => (base ? base + "/" : "") + e));
      else if (seg.includes("*")) {
        const re = new RegExp("^" + seg.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
        next.push(...entries.filter((e) => re.test(e)).map((e) => (base ? base + "/" : "") + e));
      } else {
        if (entries.includes(seg)) next.push((base ? base + "/" : "") + seg);
      }
    }
    current = next;
  }
  return current;
}

// ---- Narrow readers -------------------------------------------------------------------------

// config.php reader: returns the modules map. Observed shape:
//   <?php return ['modules' => [ 'Vendor_Module' => 1, ... ], 'system' => [...]];
// Reads ONLY the 'modules' block; returns null when absent/unparseable (never guesses).
function readConfigPhpModules(root: string, rel = "app/etc/config.php"): { modules: Record<string, number> | null; readable: boolean } {
  const abs = path.join(root, rel);
  if (deniedLabel(rel)) return { modules: null, readable: false };
  let text: string;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    return { modules: null, readable: false };
  }
  const start = text.indexOf("'modules'");
  if (start === -1) return { modules: null, readable: true };
  const end = text.indexOf("'system'", start);
  const block = end === -1 ? text.slice(start) : text.slice(start, end);
  const modules: Record<string, number> = {};
  const re = /'([A-Za-z0-9_]+)'\s*=>\s*([01])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) modules[m[1]] = Number(m[2]);
  return { modules, readable: true };
}

interface LockPackage {
  name: string;
  version: string;
}

function readComposerLockPackages(root: string): { packages: LockPackage[]; readable: boolean } {
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, "composer.lock"), "utf8");
  } catch {
    return { packages: [], readable: false };
  }
  try {
    const lock = JSON.parse(text) as { packages?: LockPackage[] };
    return { packages: lock.packages ?? [], readable: true };
  } catch {
    return { packages: [], readable: false };
  }
}

// composer package name -> Magento module name (convention: vendor/module-page-builder ->
// Magento_PageBuilder; secomm/module-uiwidget -> Secomm_UiWidget).
function composerNameToModuleName(composerName: string): string {
  const [vendor, pkg] = composerName.split("/");
  const pascal = (s: string) =>
    s
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
  return pascal(vendor) + "_" + pascal((pkg ?? "").replace(/^module-/, ""));
}

// app/code/<Vendor>/<Module> -> module name from etc/module.xml <module name="...">, else dir concat.
function readAppModuleName(root: string, moduleDir: string): string {
  const rel = path.join(moduleDir, "etc", "module.xml");
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return moduleDir.split(path.sep).join("_");
  }
  const m = /<module[^>]*name="([A-Za-z0-9_]+)"/.exec(text);
  return m ? m[1] : moduleDir.split(path.sep).join("_");
}

// XML bounded extraction helpers (declarations only — no deep template/AST parsing in this probe).
function extractTypeBlocks(text: string): { name: string; block: string }[] {
  const out: { name: string; block: string }[] = [];
  const re = /<type\b[^>]*\bname="([^"]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const close = text.indexOf("</type>", m.index);
    const block = text.slice(m.index, close === -1 ? Math.min(m.index + 4000, text.length) : close);
    out.push({ name: m[1], block });
  }
  return out;
}

function extractAppearanceNames(block: string): string[] {
  const names: string[] = [];
  const re = /<appearance\b[^>]*\bname="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) names.push(m[1]);
  return [...new Set(names)].sort();
}

function availabilityFor(moduleName: string, modules: Record<string, number> | null): Availability {
  if (modules === null || !(moduleName in modules)) return "unknown";
  return modules[moduleName] === 1 ? "enabled" : "disabled";
}

function proofFor(availability: Availability): ProofLevel {
  return availability === "enabled" ? "registered" : "discovered";
}

function makeEvidence(kind: EvidenceKind, sourceId: string, rel: string, fragment: string, revisionId: string, now: string, method: string): SourceEvidence {
  const locator = `source://${sourceId}/${rel.split(path.sep).join("/")}${fragment ? "#" + fragment : ""}`;
  const evidenceId = "e-" + sha256Hex([kind, locator, revisionId].join("␟")).slice(0, 12);
  return { evidenceId, kind, locator, sourceRevisionId: revisionId, retrievedAt: now, method };
}

// ---- Registry assembly ----------------------------------------------------------------------

interface RawEntry {
  id: string;
  appearanceId: string;
  provider: string;
  category: Capability["category"];
  displayName?: string;
  description?: string;
  evidence: SourceEvidence[];
  availability: Availability;
  requiresRuntimeData: boolean;
  dataSources?: string[];
  redeclaredBy?: string[];
}

export function buildRegistry(input: AdapterInput, root: string): CapabilityRegistry {
  const diags: Diagnostic[] = [];
  const now = new Date().toISOString();
  const sourceId = input.source.sourceId;
  const scopes = input.source.scopes;

  const denied: Record<string, number> = {};
  const outOfScope: Record<string, number> = {};
  const guard = (rel: string): boolean => {
    const label = deniedLabel(rel);
    if (label) {
      denied[label] = (denied[label] ?? 0) + 1;
      return false;
    }
    const s = scopeAllows(rel.split(path.sep).join("/"), scopes);
    if (!s.allowed) {
      outOfScope[s.reason ?? "out-of-scope"] = (outOfScope[s.reason ?? "out-of-scope"] ?? 0) + 1;
      return false;
    }
    return true;
  };

  // 1. Versions from composer.lock (pinned truth).
  const lock = readComposerLockPackages(root);
  const product = lock.packages.find((p) => p.name === "magento/product-community-edition" || p.name === "magento/product-enterprise-edition");
  const pbLock = lock.packages.find((p) => p.name === "magento/module-page-builder");

  // 2. Enablement from config.php (narrow reader).
  const config = readConfigPhpModules(root);
  if (!config.readable || config.modules === null) {
    diags.push({ code: "NOT_VERIFIED", severity: "warning", message: "app/etc/config.php could not be read or has no 'modules' block; module enablement is unknown — all proof levels stay at 'discovered'.", subject: { type: "source", id: sourceId } });
  }
  const modules = config.modules;

  // 3. Revision token: git HEAD when available (read-only query), else deterministic content hash.
  let revisionId = "";
  try {
    revisionId = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    const composerText = (() => {
      try {
        return fs.readFileSync(path.join(root, "composer.lock"), "utf8");
      } catch {
        try {
          return fs.readFileSync(path.join(root, "composer.json"), "utf8");
        } catch {
          return "";
        }
      }
    })();
    revisionId = "content:" + createHash("sha256").update(composerText).digest("hex").slice(0, 16);
  }
  const source: SourceRevision = { sourceId, revisionId, accessedAt: now };

  const raw: RawEntry[] = [];
  const noteRaw = (e: RawEntry) => raw.push(e);

  // app/code providers declaring a UI surface (their own content types, or a widget.xml) —
  // used to classify DI registry components below: UI-intent modules yield 'widget' entries;
  // any other module's internal Registry (e.g. an email-variables registry) is out of CMS-page
  // scope ('chrome'), discovered as metadata only.
  const uiIntentModules = new Set<string>();

  const pbModuleVersion = pbLock?.version;

  // Sensitive surfaces: report existence only (no content read) so runs and receipts can show
  // that credential-adjacent files were present but deny-listed out of the probe.
  for (const sensitive of ["app/etc/env.php", "auth.json"]) {
    try {
      if (fs.existsSync(path.join(root, sensitive))) {
        diags.push({ code: "LOCATOR_OUT_OF_SCOPE", severity: "info", message: `Sensitive surface '${sensitive}' exists and is deny-listed — never read by this probe.`, subject: { type: "source", id: sourceId } });
      }
    } catch {
      /* existence check only; unreadable = simply not reported */
    }
  }

  // 4. Content types: per-file declarations. Real Magento vendor layout nests packages as
  //    vendor/<vendor>/<package>/ (optionally with a src/ prefix, e.g. Hyvä), so the glob needs
  //    the intermediate segment — a pattern one level short silently finds zero types (the
  //    exact failure mode the #9 source audit flagged for the legacy single-file assumption).
  const contentTypePatterns = [
    "vendor/*/*/view/adminhtml/pagebuilder/content_type/*.xml",
    "vendor/*/*/src/view/adminhtml/pagebuilder/content_type/*.xml",
    "vendor/*/*/*/view/adminhtml/pagebuilder/content_type/*.xml",
    "vendor/*/*/*/src/view/adminhtml/pagebuilder/content_type/*.xml",
    "app/code/*/*/view/adminhtml/pagebuilder/content_type/*.xml",
  ];
  const byKey = new Map<string, RawEntry>();
  for (const pattern of contentTypePatterns) {
    for (const rel of globOne(root, pattern)) {
      if (!guard(rel)) continue;
      const abs = path.join(root, rel);
      let text: string;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      // Declaring provider module from the path.
      const segments = rel.split(path.sep);
      let provider: string;
      let namespace: string;
      if (segments[0] === "app" && segments[1] === "code") {
        provider = readAppModuleName(root, path.join(segments[0], segments[1], segments[2], segments[3]));
        namespace = provider.toLowerCase();
      } else if (segments[0] === "vendor") {
        // vendor/<vendor>/<pkg>/... (vendor dirs holding multiple packages handled by glob depth)
        const composerRel = path.join(segments[0], segments[1], segments[2], "composer.json");
        let composerName = `${segments[1]}/${segments[2]}`;
        try {
          composerName = (JSON.parse(fs.readFileSync(path.join(root, composerRel), "utf8")) as { name?: string }).name ?? composerName;
        } catch {
          /* fall back to directory naming */
        }
        provider = composerNameToModuleName(composerName);
        // Capability namespace = declaring module name lowercased (traceability beats renaming).
        namespace = provider.toLowerCase();
      } else {
        continue;
      }
      if (segments[0] === "app") uiIntentModules.add(provider);
      for (const { name: typeName, block } of extractTypeBlocks(text)) {
        const appearances = extractAppearanceNames(block);
        const appearanceList = appearances.length > 0 ? appearances : ["default"];
        const availability = availabilityFor(provider, modules);
        const runtimeData = typeName === "products" || typeName === "product";
        for (const appearanceName of appearanceList) {
          const id = `${namespace}/${typeName.toLowerCase()}`;
          const key = `${id}␟${appearanceName}`;
          const fragment = `type=${typeName}${appearanceName !== "default" ? `/appearance=${appearanceName}` : ""}`;
          const evidence = makeEvidence("config-declaration", sourceId, rel, fragment, source.revisionId, now, "xml-content-type-declaration-scan");
          const existing = byKey.get(key);
          if (existing) {
            existing.evidence.push(evidence);
            existing.redeclaredBy = existing.redeclaredBy ?? [existing.provider];
            if (!existing.redeclaredBy.includes(provider)) existing.redeclaredBy.push(provider);
            continue;
          }
          byKey.set(key, {
            id,
            appearanceId: appearanceName,
            provider,
            category: segments[0] === "app" ? "widget" : provider.startsWith("Magento_") ? "native" : "widget",
            displayName: typeName,
            description: `Page Builder content type '${typeName}' declared per-file${pbModuleVersion ? ` (Magento_PageBuilder module ${pbModuleVersion} on this checkout)` : ""}.`,
            evidence: [evidence],
            availability,
            requiresRuntimeData: runtimeData,
            dataSources: runtimeData ? [] : undefined,
            redeclaredBy: [provider],
          });
        }
      }
    }
  }
  for (const e of byKey.values()) noteRaw(e);

  // 5. Widgets: per-module etc/widget.xml under app/code.
  for (const rel of globOne(root, "app/code/*/*/etc/widget.xml")) {
    if (!guard(rel)) continue;
    const segments = rel.split(path.sep);
    const provider = readAppModuleName(root, path.join(segments[0], segments[1], segments[2], segments[3]));
    let text: string;
    try {
      text = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    const widgetRe = /<widget\b[^>]*\bid="([^"]+)"[^>]*>/g;
    let wm: RegExpExecArray | null;
    const availability = availabilityFor(provider, modules);
    uiIntentModules.add(provider);
    while ((wm = widgetRe.exec(text)) !== null) {
      const close = text.indexOf("</widget>", wm.index);
      const block = text.slice(wm.index, close === -1 ? Math.min(wm.index + 4000, text.length) : close);
      const props = parseWidgetParameters(block);
      noteRaw({
        id: `${provider.toLowerCase()}/widget/${wm[1].toLowerCase()}`,
        appearanceId: "default",
        provider,
        category: "widget",
        displayName: wm[1],
        description: `Magento widget registration (etc/widget.xml).`,
        evidence: [makeEvidence("config-declaration", sourceId, rel, `widget=${wm[1]}`, source.revisionId, now, "widget-xml-declaration-scan")],
        availability,
        requiresRuntimeData: /catalog|product/i.test(block),
        dataSources: /catalog|product/i.test(block) ? [] : undefined,
      });
      void props;
    }
  }

  // 6. DI component registries (e.g. a module's Registry class assembling named components).
  for (const rel of globOne(root, "app/code/*/*/etc/di.xml")) {
    if (!guard(rel)) continue;
    const segments = rel.split(path.sep);
    const provider = readAppModuleName(root, path.join(segments[0], segments[1], segments[2], segments[3]));
    let text: string;
    try {
      text = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    for (const { name: typeName, block } of extractTypeBlocks(text)) {
      if (!/(^|\\|\b)Registry$/.test(typeName)) continue;
      const itemRe = /<item\b[^>]*\bname="([^"]+)"/g;
      let im: RegExpExecArray | null;
      const availability = availabilityFor(provider, modules);
      // Precision guard: only modules that declare a UI surface contribute 'widget' entries;
      // other registries (email variables, import/export pools, ...) are 'chrome' — present in
      // the source, out of CMS-page scope, never a mapping target.
      const isUiIntent = uiIntentModules.has(provider);
      const seen = new Set<string>();
      while ((im = itemRe.exec(block)) !== null) {
        const item = im[1];
        if (seen.has(item)) continue;
        seen.add(item);
        noteRaw({
          id: `${provider.toLowerCase()}/component/${item.toLowerCase()}`,
          appearanceId: "default",
          provider,
          category: isUiIntent ? "widget" : "chrome",
          displayName: item,
          description: isUiIntent
            ? `DI-registered UI component in ${typeName} (registry-in-di.xml) — metadata only; behavior not audited.`
            : `DI-registered component in ${typeName} (registry-in-di.xml) — out of CMS-page scope (module declares no UI surface); metadata-only discovery.`,
          evidence: [makeEvidence("config-declaration", sourceId, rel, `type=${typeName}/item=${item}`, source.revisionId, now, "di-registry-scan")],
          availability,
          requiresRuntimeData: false,
        });
      }
    }
  }

  // 7. Assemble capabilities (schema-exact fields; honest "not audited" defaults).
  const capabilities: Capability[] = raw
    .map((e): Capability => {
      const redeclared = (e.redeclaredBy ?? []).length > 1;
      return {
        id: e.id,
        appearanceId: e.appearanceId,
        provider: e.provider,
        category: e.category,
        displayName: e.displayName,
        availability: e.availability,
        acceptedProps: [], // not audited by this declaration-only probe
        allowedChildren: [], // not audited
        responsiveDeterministic: false, // responsiveness NOT proven deterministic — honest default
        dataContext: {
          requiresRuntimeData: e.requiresRuntimeData,
          ...(e.dataSources ? { dataSources: e.dataSources } : {}),
          notes: e.requiresRuntimeData ? "Runtime catalog data implied by the type's declaration; data sources not audited." : undefined,
        },
        editorEditingMode: "unknown", // editor behavior not audited by this probe
        evidence: e.evidence.sort((a, b) => a.locator.localeCompare(b.locator) || a.evidenceId.localeCompare(b.evidenceId)),
        proofLevel: proofFor(e.availability),
        ...(redeclared ? { description: `${e.description ?? ""} Re-declared by: ${(e.redeclaredBy ?? []).sort().join(", ")}. Merge semantics apply; audit before relying on a single module's defaults.`.trim() } : e.description ? { description: e.description } : {}),
      };
    })
    .sort((a, b) => (a.id + "␟" + a.appearanceId < b.id + "␟" + b.appearanceId ? -1 : 1));

  // NOT_VERIFIED: one aggregated diagnostic per capability whose semantics this probe did not audit.
  for (const cap of capabilities) {
    diags.push({
      code: "NOT_VERIFIED",
      severity: "warning",
      message: `Capability '${cap.id}#${cap.appearanceId}' is declaration-evidence only: props, nesting, editor semantics and responsive behavior were NOT audited — do not treat as runtime-proven.`,
      subject: { type: "capability", id: `${cap.id}#${cap.appearanceId}` },
    });
  }
  // Multi-module redeclarations and unknown enablement.
  for (const e of raw) {
    if ((e.redeclaredBy ?? []).length > 1) {
      diags.push({
        code: "NOT_VERIFIED",
        severity: "warning",
        message: `'${e.id}#${e.appearanceId}' is re-declared by ${(e.redeclaredBy ?? []).sort().join(", ")}; which declaration wins depends on merge order — resolve before structural mapping.`,
        subject: { type: "capability", id: `${e.id}#${e.appearanceId}` },
      });
    }
    if (e.availability === "unknown") {
      diags.push({
        code: "NOT_VERIFIED",
        severity: "warning",
        message: `Declaring module '${e.provider}' of '${e.id}' is not present in app/etc/config.php (or the file was unreadable); enablement unknown, proof capped at 'discovered'.`,
        subject: { type: "capability", id: e.id },
      });
    }
  }
  // Deny/scope aggregates (bounded; never per-file spam).
  for (const [label, count] of Object.entries(denied).sort()) {
    diags.push({ code: "LOCATOR_OUT_OF_SCOPE", severity: "warning", message: `${count} candidate path(s) matched the deny list (${label}) and were never read.`, subject: { type: "source", id: sourceId } });
  }
  for (const [reason, count] of Object.entries(outOfScope).sort()) {
    diags.push({ code: "LOCATOR_OUT_OF_SCOPE", severity: "info", message: `${count} candidate path(s) were skipped: ${reason}.`, subject: { type: "source", id: sourceId } });
  }
  if (!lock.readable) {
    diags.push({ code: "NOT_VERIFIED", severity: "warning", message: "composer.lock unreadable; platform/module versions are unknown.", subject: { type: "source", id: sourceId } });
  }

  // Summary counts over ALL closed enum keys (schema requires every key, zero included).
  const byCategory: Record<Capability["category"], number> = { native: 0, widget: 0, chrome: 0, "custom-required": 0, unsupported: 0 };
  const byProofLevel: Record<ProofLevel, number> = { "not-verified": 0, discovered: 0, registered: 0, "structurally-mapped": 0, "admin-roundtrip-verified": 0, "visually-verified": 0 };
  const byAvailability: Record<Availability, number> = { enabled: 0, disabled: 0, deprecated: 0, unknown: 0 };
  for (const c of capabilities) {
    byCategory[c.category]++;
    byProofLevel[c.proofLevel]++;
    byAvailability[c.availability]++;
  }
  const summary = { byCategory, byProofLevel, byAvailability };

  const registry: CapabilityRegistry = {
    schemaVersion: 1,
    platformId: input.platformId,
    platformVersion: product?.version,
    profileId: input.profileId,
    generatedAt: now,
    source,
    generator: { tool: "det-adapter:magento-pagebuilder", toolVersion: "1.0.0" },
    capabilities,
    summary,
    diagnostics: sortDiagnostics(diags),
  };
  return registry;
}

function parseWidgetParameters(block: string): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  const re = /<parameter\b[^>]*\bname="([^"]+)"[^>]*\bxsi:type="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push({ name: m[1], type: m[2] });
  return out;
}
void parseWidgetParameters;

// ---- Subprocess entry -----------------------------------------------------------------------
function main(): void {
  let inputRaw: unknown;
  try {
    inputRaw = readStdinJson();
  } catch (e) {
    process.stderr.write(`adapter: stdin is not valid JSON: ${(e as Error).message}\n`);
    process.exit(2);
  }
  const check = validateContract("adapter-input", inputRaw);
  if (!check.valid) {
    process.stderr.write(`adapter: input fails adapter-input contract: ${check.errors[0] ?? "unknown"}\n`);
    process.exit(2);
  }
  const input = inputRaw as AdapterInput;
  const root = path.resolve(input.source.path);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    process.stderr.write(`adapter: project root '${input.source.path}' is not accessible\n`);
    process.exit(2);
  }
  if (!stat.isDirectory()) {
    process.stderr.write(`adapter: project root '${input.source.path}' is not a directory\n`);
    process.exit(2);
  }
  const registry = buildRegistry(input, root);
  // Emit with real 2-space serialization (not canonical single-line) for the committed artifact;
  // contentHash consumers canonicalize before hashing.
  process.stdout.write(JSON.stringify(registry, null, 2) + "\n");
}

main();
