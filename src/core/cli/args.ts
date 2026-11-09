// Tiny deterministic argument parser for det (no third-party CLI dependency — decision recorded
// in docs/converter/DECISIONS.md). Unknown flags and duplicate value flags are usage errors.
// Issue #15 (additive): the `kb` command takes a verb position (det kb ingest|sync|query|validate)
// and a small set of repeatable value flags (--root, --where, --include-lifecycle) which collect
// into arrays; every other value flag still rejects duplicates.
export interface ParsedArgs {
  command: string | null;
  flags: Record<string, string | boolean | string[]>;
  errors: string[];
}

const BOOL_FLAGS = new Set(["help", "h", "version", "json", "dry-run", "quiet"]);
const VALUE_FLAGS = new Set(["profile", "adapter", "project", "out", "input", "registry", "bindings", "design-file", "design-node", "manifest", "store", "root", "where", "text", "kb", "edge-type", "related-to", "include-lifecycle", "require-proof", "nodeir", "content", "projection"]);
const REPEATABLE_FLAGS = new Set(["root", "where", "include-lifecycle"]);
const COMMANDS = new Set(["validate", "inspect", "plan", "extract", "kb", "compose"]);
const KB_VERBS = new Set(["ingest", "sync", "query", "validate"]);

function storeFlag(out: ParsedArgs, name: string, value: string): void {
  if (REPEATABLE_FLAGS.has(name)) {
    const existing = out.flags[name];
    if (existing === undefined) out.flags[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out.flags[name] = [existing as string, value];
    return;
  }
  out.flags[name] = value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { command: null, flags: {}, errors: [] };
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i];
    if (tok === "--") {
      i++;
      continue;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      if (!BOOL_FLAGS.has(name) && !VALUE_FLAGS.has(name)) {
        out.errors.push(`unknown flag --${name}`);
        i++;
        continue;
      }
      if (BOOL_FLAGS.has(name)) {
        if (eq !== -1) out.errors.push(`flag --${name} does not take a value`);
        else out.flags[name] = true;
        i++;
        continue;
      }
      if (!REPEATABLE_FLAGS.has(name) && out.flags[name] !== undefined) out.errors.push(`duplicate flag --${name}`);
      if (eq !== -1) {
        storeFlag(out, name, tok.slice(eq + 1));
        i++;
      } else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          out.errors.push(`flag --${name} requires a value`);
          i++; // consume the flag token itself — never re-loop on it
        } else {
          storeFlag(out, name, value);
          i += 2;
        }
      }
      continue;
    }
    if (out.command === null) {
      if (COMMANDS.has(tok)) out.command = tok;
      else out.errors.push(`unknown command '${tok}' (expected validate|inspect|plan|extract|kb)`);
    } else if (out.command === "kb" && out.flags["kb-verb"] === undefined) {
      if (KB_VERBS.has(tok)) out.flags["kb-verb"] = tok;
      else out.errors.push(`unknown kb verb '${tok}' (expected ingest|sync|query|validate)`);
    } else {
      out.errors.push(`unexpected positional argument '${tok}'`);
    }
    i++;
  }
  return out;
}

export function requireValue(flags: Record<string, string | boolean | string[]>, name: string): string | null {
  const v = flags[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Per-command value-flag whitelists: a flag that parses but does not belong to the command is a
// usage error (the parser header's contract), not a silently ignored option.
const COMMAND_VALUE_FLAGS: Record<string, Set<string>> = {
  validate: new Set(["profile", "adapter", "project", "out"]),
  inspect: new Set(["profile", "adapter", "project", "out"]),
  plan: new Set(["profile", "registry", "bindings", "input", "out"]),
  extract: new Set(["profile", "adapter", "project", "out", "design-file", "design-node", "registry", "bindings"]),
  kb: new Set(["manifest", "store", "out", "root", "where", "text", "kb", "edge-type", "related-to", "include-lifecycle", "require-proof", "project"]),
  compose: new Set(["profile", "registry", "bindings", "input", "nodeir", "content", "projection", "adapter", "out"]),
};

export function unexpectedFlagsForCommand(command: string, flags: Record<string, string | boolean | string[]>): string[] {
  const allowed = COMMAND_VALUE_FLAGS[command];
  if (!allowed) return [];
  const unexpected: string[] = [];
  for (const name of Object.keys(flags)) {
    if (name === "kb-verb") continue;
    if (BOOL_FLAGS.has(name)) continue; // global boolean flags stay shared
    if (!allowed.has(name)) unexpected.push(name);
  }
  return unexpected;
}
