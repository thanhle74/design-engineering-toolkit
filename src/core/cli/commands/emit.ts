// Shared command epilogue: build the tool-run envelope, write artifacts (no-write by default,
// --dry-run never writes), and print either the machine JSON or the human summary.
import { buildEnvelope, type ArtifactRecord, type CommandName, type ExitCode, type ToolRunEnvelope } from "../../run-envelope.js";
import type { RunDiagnostic } from "../../adapter-runtime.js";
import { renderCounts, renderDiagnosticLine, serializeJson, writeOutFiles, type CommandIO } from "../io.js";
import type { Diagnostic } from "../../types.js";

export interface EmitParams {
  command: CommandName;
  exitCode: ExitCode;
  profileId?: string;
  platformId?: string;
  adapter?: { id: string; version?: string; timedOut?: boolean };
  converterDiagnostics: Diagnostic[];
  runDiagnostics: RunDiagnostic[];
  artifacts: ArtifactRecord[];
  files?: { name: string; content: string }[];
  outDir: string | null;
  dryRun: boolean;
  asJson: boolean;
  extraOutput?: unknown;
  summaryLines?: string[];
}

export function emit(params: EmitParams, io: CommandIO): ExitCode {
  const envelope: ToolRunEnvelope = buildEnvelope({
    command: params.command,
    exitCode: params.exitCode,
    profileId: params.profileId,
    platformId: params.platformId,
    adapter: params.adapter,
    artifacts: params.artifacts,
    converterDiagnostics: params.converterDiagnostics,
    runDiagnostics: params.runDiagnostics,
    wroteFiles: false,
  });
  const files = [...(params.files ?? []), { name: "tool-run.json", content: serializeJson(envelope) }];
  const writeResult = writeOutFiles(params.outDir, files, params.dryRun);
  for (const d of writeResult.diagnostics) io.err(renderDiagnosticLine(d));
  envelope.wroteFiles = writeResult.wroteFiles;

  if (params.asJson) {
    const payload: Record<string, unknown> = { run: envelope };
    if (params.extraOutput !== undefined) payload.output = params.extraOutput;
    io.out(serializeJson(payload));
  } else {
    io.out(`det ${envelope.command} — exit ${envelope.exitCode}`);
    for (const line of params.summaryLines ?? []) io.out(line);
    io.out(renderCounts(envelope.counts));
    for (const d of envelope.converterDiagnostics) io.out(renderDiagnosticLine(d));
    for (const d of envelope.runDiagnostics) io.out(renderDiagnosticLine(d));
    if (params.dryRun) io.out("dry run: no files written");
    else if (params.outDir && writeResult.written.length > 0) io.out(`wrote: ${writeResult.written.join(", ")} under ${params.outDir}`);
  }
  return envelope.exitCode;
}
