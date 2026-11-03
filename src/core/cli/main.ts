// det — Design Engineering Toolkit CLI entrypoint (dispatch, help, version, exit codes).
// Deterministic: same inputs + same tool version => same JSON artifacts, same exit code.
// No AI, no network, no default paths: project sources come from --project > DET_PROJECT_SOURCE
// > the supplied profile file (TECH-ADR ADR-5), and nothing is written without --out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, unexpectedFlagsForCommand } from "./args.js";
import { setToolVersion } from "../run-envelope.js";
import { assertSchemasLoad } from "../schema-registry.js";
import type { CommandIO } from "./io.js";
import { commandValidate } from "./commands/validate.js";
import { commandInspect } from "./commands/inspect.js";
import { commandPlan } from "./commands/plan.js";
import { commandKb } from "./commands/kb.js";

// This module compiles to dist/src/core/cli/main.js — four levels up to the repository root.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const HELP = `det — Design Engineering Toolkit CLI (deterministic, read-only core)

Usage:
  det validate --profile <file> [--adapter <id>] [--project <path>] [--out <dir>] [--json] [--dry-run]
      Validate a converter profile contract and resolve its project source (preflight only).

  det inspect --profile <file> [--adapter <id>] [--project <path>] [--out <dir>] [--json] [--dry-run]
      Run the read-only capability probe for the profile's platform via an out-of-process
      adapter and emit a schema-valid CapabilityRegistry with evidence locators.
      Probe proof is capped at source-backed DISCOVERED/REGISTERED levels — never runtime claims.

  det plan --profile <file> --registry <file> --bindings <file> --input <structure-file> [--out <dir>] [--dry-run] [--json]
      Deterministically resolve a pinned design structure against a pinned registry + binding
      map and emit a ResolutionReport. Pure computation: no source checkout, no adapter, no AI.

  det kb ingest --manifest <file> [--root <alias>=<path>]... [--out <store-dir>] [--dry-run] [--json]
      Deterministically ingest the manifest's inputs into KB records: read-only bridge from a
      det CapabilityRegistry to KB-1, manifest-driven KB-2 metadata inventory, KB-3 project
      records and relation records. Structural deny-list applies before any read; partial
      denials never regenerate a store.

  det kb sync --store <dir> --manifest <file> [--root <alias>=<path>]... [--out <dir>] [--dry-run] [--json]
      Digest-driven incremental sync: changed/unavailable sources mark their pinned records
      STALE (never silently re-derived or upgraded). Writes only when something went stale.

  det kb query --store <dir> [--kb platform|ui|project|relations|all] [--project <id>]
               [--where <key>=<value>]... [--text <substring>] [--require-proof <level>]
               [--edge-type <type>] [--related-to <recordId>] [--include-lifecycle <states>] [--json]
      Deterministic structured query; provenance on every hit. KB-3 is default-deny: --project
      is required to query project knowledge, and STALE/ARCHIVED records are excluded unless
      explicitly included. Proof filters are EXACT (no minimum, no downgrade).

  det kb validate --store <dir> [--json]
      Validate a store directory: per-record schemas, JSONL integrity, descriptor honesty,
      relation graph rules (dangling endpoints, class-boundary edges, cycles), KB-3 project
      isolation and the secret/licensed-content guards.

Global flags:
  --json        Machine-readable JSON on stdout (the human summary is a presentation of it).
  --out <dir>   Write artifacts (capability-registry.json / resolution-report.json / store
                files / tool-run.json). Default is NO-WRITE: results go to stdout only.
  --dry-run     Compute everything, write nothing.
  --help        This help.  --version  Print the tool version.

Source resolution precedence (never a default path): --project flag > DET_PROJECT_SOURCE env >
the profile's own projectSources[0].path; KB root aliases: --root <alias>=<path> > DET_KB_ROOT_<ALIAS>.
Placeholder paths ('/path/to/...') are reported as PROJECT_SOURCE_NOT_CONFIGURED — nothing is
audited from a placeholder.

Exit codes (deterministic):
  0  succeeded (warnings allowed)
  1  completed with blocking (error-severity) diagnostics
  2  usage error (unknown flag/command, missing required input, unreadable input file)
  3  adapter runtime failure (crash, timeout, or output contract violation)

Protected boundaries: this tool never writes to any connected platform (CMS/DB/storefront/
design source), and adapter probes are read-only by contract (the adapter-descriptor schema
enforces readOnly). The KB store holds metadata and digests — never secrets, never licensed
source bytes.`;

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env, io: CommandIO = { env, out: (l) => process.stdout.write(l + "\n"), err: (l) => process.stderr.write(l + "\n") }): Promise<number> {
  toolVersionString(); // every envelope carries the real tool version
  const parsed = parseArgs(argv);

  if (parsed.flags["version"] === true) {
    io.out(toolVersionString());
    return 0;
  }
  if (parsed.flags["help"] === true || argv.length === 0) {
    io.out(HELP);
    return parsed.flags["help"] === true ? 0 : argv.length === 0 && parsed.command === null ? 2 : 0;
  }

  if (parsed.errors.length > 0) {
    for (const e of parsed.errors) io.err(`det: ${e}`);
    io.err("Run 'det --help' for usage.");
    return 2;
  }
  if (parsed.command === null) {
    io.err("det: no command given (expected validate|inspect|plan|kb). Run 'det --help' for usage.");
    return 2;
  }
  const unexpectedFlags = unexpectedFlagsForCommand(parsed.command, parsed.flags);
  if (unexpectedFlags.length > 0) {
    for (const name of unexpectedFlags) io.err(`det: flag --${name} does not belong to command '${parsed.command}'`);
    io.err("Run 'det --help' for usage.");
    return 2;
  }

  try {
    // Fail loudly if the contract layer is broken rather than emitting unvalidated output.
    assertSchemasLoad();
  } catch (e) {
    io.err(`det: contract layer failed to load: ${(e as Error).message}`);
    return 2;
  }

  const flags = parsed.flags;
  switch (parsed.command) {
    case "validate":
      return commandValidate(flags, io);
    case "inspect":
      return commandInspect(flags, io);
    case "plan":
      return commandPlan(flags, io);
    case "kb":
      return commandKb(flags, io);
    default:
      io.err(`det: unknown command '${parsed.command}'`);
      return 2;
  }
}

function toolVersionString(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version?: string };
    if (pkg.version) setToolVersion(pkg.version);
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
