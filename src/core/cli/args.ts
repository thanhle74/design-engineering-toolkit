// Tiny deterministic argument parser for det (no third-party CLI dependency — decision recorded
// in docs/converter/DECISIONS.md). Unknown flags and duplicate value flags are usage errors.
export interface ParsedArgs {
  command: string | null;
  flags: Record<string, string | boolean>;
  errors: string[];
}

const BOOL_FLAGS = new Set(["help", "h", "version", "json", "dry-run", "quiet"]);
const VALUE_FLAGS = new Set(["profile", "adapter", "project", "out", "input", "registry", "bindings"]);
const COMMANDS = new Set(["validate", "inspect", "plan"]);

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
      if (out.flags[name] !== undefined) out.errors.push(`duplicate flag --${name}`);
      if (eq !== -1) {
        out.flags[name] = tok.slice(eq + 1);
        i++;
      } else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          out.errors.push(`flag --${name} requires a value`);
          i++; // consume the flag token itself — never re-loop on it
        } else {
          out.flags[name] = value;
          i += 2;
        }
      }
      continue;
    }
    if (out.command !== null) out.errors.push(`unexpected positional argument '${tok}'`);
    else if (COMMANDS.has(tok)) out.command = tok;
    else out.errors.push(`unknown command '${tok}' (expected validate|inspect|plan)`);
    i++;
  }
  return out;
}

export function requireValue(flags: Record<string, string | boolean>, name: string): string | null {
  const v = flags[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}
