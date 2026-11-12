// det validate — validate a converter profile against its contract and resolve its project
// source (read-only preflight). No audit runs here; this is the cheap deterministic gate.
// Exit 0 = valid/resolved; 1 = blocking diagnostics; 2 = usage error.
import { checkAdapterApplicable } from "../../preflight.js";
import { loadAdapters } from "../../adapter-runtime.js";
import { artifact } from "../../run-envelope.js";
import { REPO_ROOT } from "../../schema-registry.js";
import { requireValue } from "../args.js";
import type { CommandIO } from "../io.js";
import { emit } from "./emit.js";
import { isBlocking, loadProfile, resolveSource } from "./shared.js";
import type { Diagnostic } from "../../types.js";

export async function commandValidate(flags: Record<string, string | boolean | string[]>, io: CommandIO): Promise<0 | 1 | 2 | 3> {
  const adapterId = requireValue(flags, "adapter");
  const project = requireValue(flags, "project");
  const outDir = requireValue(flags, "out");
  const asJson = flags.json === true;
  const dryRun = flags["dry-run"] === true;

  const loaded = loadProfile(requireValue(flags, "profile"));
  if (!loaded.ok) {
    return emit(
      {
        command: "validate",
        exitCode: loaded.exitCode,
        converterDiagnostics: loaded.converterDiagnostics,
        runDiagnostics: loaded.runDiagnostics,
        artifacts: [],
        outDir: null,
        dryRun,
        asJson,
      },
      io
    );
  }
  const profile = loaded.profile;
  const converterDiagnostics: Diagnostic[] = [...loaded.converterDiagnostics];
  const runDiagnostics = [...loaded.runDiagnostics];

  // Optional adapter applicability check: does the requested adapter cover this platform?
  if (adapterId) {
    const { adapters, diagnostics: adapterDiags } = loadAdapters(REPO_ROOT);
    runDiagnostics.push(...adapterDiags);
    const desc = adapters.find((a) => a.id === adapterId);
    if (!desc) {
      runDiagnostics.push({
        code: "ADAPTER_NOT_FOUND",
        severity: "error",
        message: `No adapter registered with id '${adapterId}' (available: ${adapters.map((a) => a.id).join(", ") || "none"}).`,
        subject: { type: "adapter", id: adapterId },
      });
    } else {
      const inapplicable = checkAdapterApplicable(profile, desc.platformIds);
      if (inapplicable) converterDiagnostics.push(inapplicable);
    }
  }

  // Read-only source resolution (no audit, no walk).
  const { source, diagnostic } = resolveSource(profile, project, io.env);
  if (diagnostic) converterDiagnostics.push(diagnostic);

  return emit(
    {
      command: "validate",
      exitCode: isBlocking(converterDiagnostics, runDiagnostics) ? 1 : 0,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      converterDiagnostics,
      runDiagnostics,
      artifacts: [artifact("profile-input", profile)],
      outDir,
      dryRun,
      asJson,
      summaryLines: source
        ? [`source: '${source.sourceId}' (${source.kind}) resolved read-only — no audit performed by 'validate'.`]
        : ["source: none resolved (see diagnostics)."],
    },
    io
  );
}
