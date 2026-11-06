// Knowledge Engine (issue #15) — the KB path gateway.
// One module, one code path to ingest inputs: explicit paths only (manifest alias-relative or
// manifest-relative, resolved per run), realpath resolution, and the structural baseline
// deny-list evaluated BEFORE any file is opened (knowledge-foundation CONTRACTS.md §8.1).
// Denials are per-file fail-open (DENIED_PATH_SKIPPED diagnostic) and per-run fail-closed
// (a run whose inputs are all denied is an error). No defaults, no owner paths, no guessing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KbDiagnostic, ManifestInput } from "./types.js";

export const LOCAL_CONFIG_RELATIVE_PATH = path.join(".toolkit", "local.json");

// Baseline deny-set: profiles/manifests may ADD, never remove.
export const BASELINE_DENY_GLOBS: string[] = [
  "auth.json",
  "app/etc/env.php",
  ".env*",
  "*credentials*",
  "*.pem",
  "*.key",
  "var/**",
  "generated/**",
  "pub/media/**",
  "*.sql.gz",
  "*.dump*",
  "**/node_modules/**",
];

// Deterministic glob → RegExp: ** crosses directories, * stays in one segment, ? is one char.
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // consume the whole ** run (allow */ for the common "**/" form)
        let j = i + 2;
        if (glob[j] === "/") j++;
        re += ".*";
        i = j - 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function compileGlobs(globs: string[]): RegExp[] {
  return globs.map(globToRegExp);
}

function isDeniedPath(relPath: string, compiled: RegExp[]): boolean {
  const base = path.posix.basename(relPath);
  return compiled.some((re) => re.test(relPath) || re.test(base));
}

export interface RootAliasResolution {
  roots: Record<string, string>; // alias -> realpath
  diagnostics: KbDiagnostic[];
}

// `~`-leading paths from the local config file expand against the invoking user's home (never
// hardcoded; only a bare `~` or `~/...` prefix expands — `~user` is left alone).
export function expandTildePath(value: string, home: string = os.homedir()): string {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
}

function localConfigInvalid(reason: string): KbDiagnostic {
  return {
    code: "LOCAL_CONFIG_INVALID",
    severity: "error",
    message: `Local config '${LOCAL_CONFIG_RELATIVE_PATH}' (relative to the working directory) is ${reason}; its content is never echoed. Fix or remove the file to restore the config-file root-alias lane.`,
    subject: { type: "input", id: LOCAL_CONFIG_RELATIVE_PATH },
  };
}

// The gitignored local-config lane: `<cwd>/.toolkit/local.json`, shape {"roots": {"<alias>":
// "<path>"}}. Missing file = lane absent (never an error, never a default). Invalid JSON or a
// non-object (top level or `roots`) = blocking LOCAL_CONFIG_INVALID. The file's VALUES are
// machine-local aliases — they are used for resolution this run and are never echoed anywhere.
function readLocalConfigRoots(cwd: string): { config: Record<string, string>; diagnostic: KbDiagnostic | null } {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(cwd, ".toolkit", "local.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { config: {}, diagnostic: null };
    return { config: {}, diagnostic: localConfigInvalid("present but unreadable") };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: {}, diagnostic: localConfigInvalid("not valid JSON") };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { config: {}, diagnostic: localConfigInvalid("not a JSON object") };
  }
  const roots = (parsed as { roots?: unknown }).roots;
  if (roots === undefined) return { config: {}, diagnostic: null };
  if (!roots || typeof roots !== "object" || Array.isArray(roots)) {
    return { config: {}, diagnostic: localConfigInvalid("carrying a non-object 'roots' member") };
  }
  const config: Record<string, string> = {};
  for (const [alias, value] of Object.entries(roots as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > 0) config[alias] = value;
  }
  return { config, diagnostic: null };
}

// Resolve the root aliases a manifest actually uses. Precedence: explicit roots (CLI --root
// alias=path) > DET_KB_ROOT_<ALIAS> env > the gitignored local config `.toolkit/local.json`
// (issue #19 M4) > unresolved (fail closed). No default path ever exists. The config file is
// resolved against `cwd` (injected by tests; the real CLI uses process.cwd()).
export function resolveRootAliases(aliases: string[], explicitRoots: Record<string, string>, env: NodeJS.ProcessEnv, cwd: string = process.cwd()): RootAliasResolution {
  const roots: Record<string, string> = {};
  const diagnostics: KbDiagnostic[] = [];
  const localConfig = readLocalConfigRoots(cwd);
  if (localConfig.diagnostic) diagnostics.push(localConfig.diagnostic);
  for (const alias of [...aliases].sort()) {
    const fromFlag = explicitRoots[alias];
    const fromEnv = env[`DET_KB_ROOT_${alias.toUpperCase().replace(/-/g, "_")}`];
    let raw = fromFlag ?? fromEnv;
    let fromConfig = false;
    if (!raw) {
      const configValue = localConfig.config[alias];
      if (typeof configValue === "string") {
        raw = expandTildePath(configValue);
        fromConfig = true;
      }
    }
    if (!raw) {
      const envVar = `DET_KB_ROOT_${alias.toUpperCase().replace(/-/g, "_")}`;
      diagnostics.push({
        code: "ROOT_ALIAS_NOT_RESOLVED",
        severity: "error",
        message: `Root alias '${alias}' is not resolved: supply --root ${alias}=<absolute-path>, ${envVar}, or a '${LOCAL_CONFIG_RELATIVE_PATH}' roots entry (config values must be absolute after '~' expansion). Nothing is read from an unresolved alias.`,
        subject: { type: "manifest", id: alias },
      });
      continue;
    }
    if (fromConfig && !path.isAbsolute(raw)) {
      diagnostics.push({
        code: "ROOT_ALIAS_NOT_RESOLVED",
        severity: "error",
        message: `Root alias '${alias}' from '${LOCAL_CONFIG_RELATIVE_PATH}' is not an absolute path; config-file values must stay absolute after '~' expansion.`,
        subject: { type: "manifest", id: alias },
      });
      continue;
    }
    try {
      roots[alias] = fs.realpathSync(raw);
    } catch {
      diagnostics.push({
        code: "ROOT_ALIAS_NOT_RESOLVED",
        severity: "error",
        message: `Root alias '${alias}' points at '${raw}', which could not be resolved to a real path (symlink escape or missing directory).`,
        subject: { type: "manifest", id: alias },
      });
    }
  }
  return { roots, diagnostics };
}

export interface ResolvedInput {
  input: ManifestInput;
  key: string; // digest key: "alias:relative/path" or "relative/path"
  abs: string; // realpath
  relFromBase: string; // path relative to its base root (deny-list subject)
}

export type ResolveInputResult = { ok: true; resolved: ResolvedInput } | { ok: false; diagnostic: KbDiagnostic };

// Resolve one manifest input to a real file path and run the deny-list BEFORE any read.
export function resolveManifestInput(manifestDir: string, roots: Record<string, string>, input: ManifestInput, extraGlobs: string[]): ResolveInputResult {
  const subject = { type: "input" as const, id: input.rootAlias ? `${input.rootAlias}:${input.path}` : input.path };
  let base: string;
  let relFromBase: string;
  if (input.rootAlias) {
    const root = roots[input.rootAlias];
    if (!root) {
      return {
        ok: false,
        diagnostic: { code: "ROOT_ALIAS_NOT_RESOLVED", severity: "error", message: `Input '${subject.id}' names unresolved root alias '${input.rootAlias}'.`, subject },
      };
    }
    base = root;
    relFromBase = input.path;
  } else {
    base = manifestDir;
    relFromBase = input.path;
  }
  const joined = path.resolve(base, input.path);
  let abs: string;
  try {
    abs = fs.realpathSync(joined);
  } catch {
    return {
      ok: false,
      diagnostic: { code: "INPUT_PATH_NOT_RESOLVED", severity: "error", message: `Input '${subject.id}' does not resolve to a real file under its declared root (path traversal or missing file).`, subject },
    };
  }
  // Realpath containment: the resolved file must still live under the declared base.
  const baseReal = fs.realpathSync(base);
  const rel = path.relative(baseReal, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      ok: false,
      diagnostic: { code: "INPUT_PATH_ESCAPES_ROOT", severity: "error", message: `Input '${subject.id}' resolves outside its declared root via symlinks; refused.`, subject },
    };
  }
  const compiled = compileGlobs([...BASELINE_DENY_GLOBS, ...extraGlobs]);
  if (isDeniedPath(rel.split(path.sep).join("/"), compiled)) {
    return {
      ok: false,
      diagnostic: { code: "DENIED_PATH_SKIPPED", severity: "warning", message: `Input '${subject.id}' matches the deny-list and was skipped; its content was never read.`, subject },
    };
  }
  return { ok: true, resolved: { input, key: subject.id, abs, relFromBase: rel.split(path.sep).join("/") } };
}

// Deterministic high-signal secret-pattern guard over record string leaves (ingest + validate).
// This is an MVP-level content guard; the byte-level licensing audit remains the M4 gate.
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?:api[_-]?key|apikey|secret|password|passwd|token|auth[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i,
];

export function scanForSecrets(value: unknown, prefix = ""): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "string") {
      if (SECRET_PATTERNS.some((re) => re.test(v))) hits.push(p || "(root)");
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, p ? `${p}.${k}` : k);
    }
  };
  walk(value, prefix);
  return hits;
}

// Oversized-string audit (a coarse template-body/excerpt tripwire; pairs with the licensed-record
// field caps enforced by ingest). Returns dot-paths of strings over the limit.
export function scanForOversizedStrings(value: unknown, limit: number, prefix = ""): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "string") {
      if (v.length > limit) hits.push(p || "(root)");
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, p ? `${p}.${k}` : k);
    }
  };
  walk(value, prefix);
  return hits;
}
