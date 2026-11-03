// Shared command epilogue: build the tool-run envelope, write artifacts (no-write by default,
// --dry-run never writes), and print either the machine JSON or the human summary.
//
// Write-truth contract (Coordinator F1 fix): the persisted tool-run.json, the terminal JSON and
// the final exit code must agree about what was actually written. Output failures fail closed —
// they become machine-readable OUTPUT_NOT_WRITABLE runDiagnostics and force a nonzero exit —
// and partial writes are honestly surfaced, never reported as success.
import fs from "node:fs";
import path from "node:path";
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
  const writeIntent = params.outDir !== null && !params.dryRun;

  // Phase 1: envelope states the intended write outcome truthfully BEFORE serialization, so the
  // first-persisted receipt is already right on the success path.
  let envelope: ToolRunEnvelope = buildEnvelope({
    command: params.command,
    exitCode: params.exitCode,
    profileId: params.profileId,
    platformId: params.platformId,
    adapter: params.adapter,
    artifacts: params.artifacts,
    converterDiagnostics: params.converterDiagnostics,
    runDiagnostics: params.runDiagnostics,
    wroteFiles: writeIntent,
  });
  const files = [...(params.files ?? []), { name: "tool-run.json", content: serializeJson(envelope) }];
  let writeResult = writeOutFiles(params.outDir, files, params.dryRun);
  let writeDiagnostics = writeResult.diagnostics;

  // Phase 2: if any write failed, fail closed — nonzero exit, machine-readable diagnostics, and
  // a best-effort rewritten receipt that matches what actually happened on disk.
  if (writeDiagnostics.some((d) => d.severity === "error")) {
    const finalExit: ExitCode = envelope.exitCode === 0 ? 1 : envelope.exitCode;
    envelope = buildEnvelope({
      command: params.command,
      exitCode: finalExit,
      profileId: params.profileId,
      platformId: params.platformId,
      adapter: params.adapter,
      artifacts: params.artifacts,
      converterDiagnostics: params.converterDiagnostics,
      runDiagnostics: [...params.runDiagnostics, ...writeDiagnostics],
      wroteFiles: writeResult.wroteFiles,
    });
    // Best effort: rewrite the receipt so the persisted file (if its directory is writable)
    // agrees with reality. If even this fails, the terminal output remains the only receipt.
    if (writeResult.written.includes("tool-run.json")) {
      try {
        fs.writeFileSync(path.join(params.outDir as string, "tool-run.json"), serializeJson(envelope), "utf8");
      } catch {
        writeDiagnostics = [...writeDiagnostics, { code: "OUTPUT_NOT_WRITABLE", severity: "error", message: `Receipt rewrite under '${params.outDir}' failed; terminal output is the authoritative record.`, subject: { type: "output", id: "tool-run.json" } }];
      }
    }
  }
  for (const d of writeDiagnostics) io.err(renderDiagnosticLine(d));

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
    else if (writeDiagnostics.some((d) => d.severity === "error")) io.out(`output write FAILED (${writeResult.written.length} of ${files.length} file(s) written); see diagnostics above`);
    else if (params.outDir && writeResult.wroteFiles) io.out(`wrote: ${writeResult.written.join(", ")} under ${params.outDir}`);
  }
  return envelope.exitCode;
}
