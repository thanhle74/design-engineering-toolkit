// Knowledge Engine (issue #15) — the KB path gateway.
// One module, one code path to ingest inputs: explicit paths only (manifest alias-relative or
// manifest-relative, resolved per run), realpath resolution, and the structural baseline
// deny-list evaluated BEFORE any file is opened (knowledge-foundation CONTRACTS.md §8.1).
// Denials are per-file fail-open (DENIED_PATH_SKIPPED diagnostic) and per-run fail-closed
// (a run whose inputs are all denied is an error). No defaults, no owner paths, no guessing.
import fs from "node:fs";
import path from "node:path";
import type { KbDiagnostic, ManifestInput } from "./types.js";

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

// Resolve the root aliases a manifest actually uses. Precedence: explicit roots (CLI --root
// alias=path) > DET_KB_ROOT_<ALIAS> env > unresolved (fail closed). No default path ever exists.
export function resolveRootAliases(aliases: string[], explicitRoots: Record<string, string>, env: NodeJS.ProcessEnv): RootAliasResolution {
  const roots: Record<string, string> = {};
  const diagnostics: KbDiagnostic[] = [];
  for (const alias of [...aliases].sort()) {
    const fromFlag = explicitRoots[alias];
    const fromEnv = env[`DET_KB_ROOT_${alias.toUpperCase().replace(/-/g, "_")}`];
    const raw = fromFlag ?? fromEnv;
    if (!raw) {
      diagnostics.push({
        code: "ROOT_ALIAS_NOT_RESOLVED",
        severity: "error",
        message: `Root alias '${alias}' is not resolved: supply --root ${alias}=<absolute-path> or DET_KB_ROOT_${alias.toUpperCase().replace(/-/g, "_")}. Nothing is read from an unresolved alias.`,
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
