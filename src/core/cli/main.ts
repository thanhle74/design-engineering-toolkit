// det — Design Engineering Toolkit CLI entrypoint (dispatch, help, version, exit codes).
// Deterministic: same inputs + same tool version => same JSON artifacts, same exit code.
// No AI, no network, no default paths: project sources come from --project > DET_PROJECT_SOURCE
// > the supplied profile file (TECH-ADR ADR-5), and nothing is written without --out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { setToolVersion } from "../run-envelope.js";
import { assertSchemasLoad } from "../schema-registry.js";
import type { CommandIO } from "./io.js";
import { commandValidate } from "./commands/validate.js";
import { commandInspect } from "./commands/inspect.js";
import { commandPlan } from "./commands/plan.js";
import { commandExtract } from "./commands/extract.js";

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
      Accepts the G1 harness structure shape or a schema-valid PageStructure payload.

  det extract --profile <file> --design-file <id> --design-node <locator> [--adapter <id>] [--registry <file>] [--bindings <file>] [--project <path>] [--out <dir>] [--dry-run] [--json]
      Read-only design-source extraction (G2): spawn the design-source adapter for the profile's
      source kind, inventory the caller-selected subtree and emit NodeIR + PageStructure +
      SourceReview. The selected root comes ONLY from these two flags — never a default. The
      core never talks to any design-source provider itself; adapters are out-of-process and
      read-only by descriptor contract.

Global flags:
  --json        Machine-readable JSON on stdout (the human summary is a presentation of it).
  --out <dir>   Write artifacts (capability-registry.json / resolution-report.json / tool-run.json).
                Default is NO-WRITE: results go to stdout only.
  --dry-run     Compute everything, write nothing.
  --help        This help.  --version  Print the tool version.

Source resolution precedence (never a default path): --project flag > DET_PROJECT_SOURCE env >
the profile's own projectSources[0].path. Placeholder paths ('/path/to/...') are reported as
PROJECT_SOURCE_NOT_CONFIGURED — nothing is audited from a placeholder.

Exit codes (deterministic):
  0  succeeded (warnings allowed)
  1  completed with blocking (error-severity) diagnostics
  2  usage error (unknown flag/command, missing required input, unreadable input file)
  3  adapter runtime failure (crash, timeout, or output contract violation)

Protected boundaries: this tool never writes to any connected platform (CMS/DB/storefront/
design source), and adapter probes are read-only by contract (the adapter-descriptor schema
enforces readOnly).`;

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
    io.err("det: no command given (expected validate|inspect|plan|extract). Run 'det --help' for usage.");
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
    case "extract":
      return commandExtract(flags, io);
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
