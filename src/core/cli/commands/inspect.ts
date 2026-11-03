// det inspect — read-only capability inspection: preflight the profile, spawn the matching
// adapter as an out-of-process subprocess (TECH-ADR ADR-4), validate the returned registry
// against its contract and the proof-ladder semantics, and emit it with a tool-run envelope.
// Exit 0 = registry produced with no blocking diagnostics; 1 = blocking diagnostics;
// 2 = usage error; 3 = adapter runtime/contract failure.
import fs from "node:fs";
import { loadAdapters, runAdapter, type RunDiagnostic } from "../../adapter-runtime.js";
import { validateRegistry } from "../../semantic.js";
import { artifact } from "../../run-envelope.js";
import { validateContract, REPO_ROOT } from "../../schema-registry.js";
import { serializeJson, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { emit } from "./emit.js";
import { isBlocking, loadProfile, resolveSource } from "./shared.js";
import type { CapabilityRegistry, Diagnostic } from "../../types.js";

export async function commandInspect(flags: Record<string, string | boolean>, io: CommandIO): Promise<0 | 1 | 2 | 3> {
  const adapterFlag = requireValue(flags, "adapter");
  const project = requireValue(flags, "project");
  const outDir = requireValue(flags, "out");
  const asJson = flags.json === true;
  const dryRun = flags["dry-run"] === true;

  const loaded = loadProfile(requireValue(flags, "profile"));
  if (!loaded.ok) {
    return emit({ command: "inspect", exitCode: loaded.exitCode, converterDiagnostics: loaded.converterDiagnostics, runDiagnostics: loaded.runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }
  const profile = loaded.profile;
  const converterDiagnostics: Diagnostic[] = [...loaded.converterDiagnostics];
  const runDiagnostics: RunDiagnostic[] = [...loaded.runDiagnostics];

  // 1. Preflight: resolve the source read-only (fail closed, never audit a guessed path).
  const { source, diagnostic } = resolveSource(profile, project, io.env);
  if (!source || diagnostic) {
    if (diagnostic) converterDiagnostics.push(diagnostic);
    return emit({ command: "inspect", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  // 2. Adapter selection by descriptor (data, never imports).
  const { adapters, diagnostics: adapterDiags } = loadAdapters(REPO_ROOT);
  runDiagnostics.push(...adapterDiags);
  let descriptor = null as (typeof adapters)[number] | null;
  if (adapterFlag) {
    descriptor = adapters.find((a) => a.id === adapterFlag) ?? null;
    if (!descriptor) {
      runDiagnostics.push({ code: "ADAPTER_NOT_FOUND", severity: "error", message: `No adapter registered with id '${adapterFlag}' (available: ${adapters.map((a) => a.id).join(", ") || "none"}).`, subject: { type: "adapter", id: adapterFlag } });
      return emit({ command: "inspect", exitCode: 2, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
    if (!descriptor.platformIds.includes(profile.profile.platformId)) {
      converterDiagnostics.push({
        code: "ADAPTER_NOT_APPLICABLE",
        severity: "error",
        message: `Adapter '${descriptor.id}' supports platforms (${descriptor.platformIds.join(", ")}), not '${profile.profile.platformId}'.`,
        subject: { type: "profile", id: profile.profile.id },
      });
      return emit({ command: "inspect", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
  } else {
    descriptor = adapters.find((a) => a.platformIds.includes(profile.profile.platformId)) ?? null;
    if (!descriptor) {
      converterDiagnostics.push({
        code: "ADAPTER_NOT_APPLICABLE",
        severity: "error",
        message: `No registered adapter supports platform '${profile.profile.platformId}'. Nothing will be audited.`,
        subject: { type: "profile", id: profile.profile.id },
      });
      return emit({ command: "inspect", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
  }

  // 3. Build the transport input (realpath, fail closed) and spawn the adapter.
  let sourcePath: string;
  try {
    sourcePath = fs.realpathSync(source.path);
  } catch {
    converterDiagnostics.push({ code: "PROJECT_SOURCE_NOT_READABLE", severity: "error", message: `Project source '${source.sourceId}' could not be resolved to a real path.`, subject: { type: "source", id: source.sourceId } });
    return emit({ command: "inspect", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }
  const profileScope = profile.profile.scopes?.find((s) => s.sourceId === source.sourceId);
  const adapterInput = {
    schemaVersion: 1,
    profileId: profile.profile.id,
    platformId: profile.profile.platformId,
    source: {
      sourceId: source.sourceId,
      kind: source.kind,
      path: sourcePath,
      ...(profileScope ? { scopes: { ...(profileScope.include ? { include: profileScope.include } : {}), ...(profileScope.exclude ? { exclude: profileScope.exclude } : {}) } } : {}),
    },
    options: {},
  };
  const inputCheck = validateContract("adapter-input", adapterInput);
  if (!inputCheck.valid) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_VIOLATION", severity: "error", message: `Constructed adapter input fails the transport contract: ${inputCheck.errors[0] ?? "unknown"}`, subject: { type: "adapter", id: descriptor.id } });
    return emit({ command: "inspect", exitCode: 2, profileId: profile.profile.id, platformId: profile.profile.platformId, adapter: { id: descriptor.id }, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  const run = await runAdapter(REPO_ROOT, descriptor, adapterInput);
  // Adapter stderr is terminal-only (F4): never embedded in diagnostics or persisted receipts.
  if (run.stderrTail) io.err(`[adapter stderr] ${run.stderrTail.split("\n").slice(-5).join(" | ")}`);
  if (!run.ok) {
    const timedOut = run.diagnostics.some((x) => x.code === "ADAPTER_TIMEOUT");
    return emit({
      command: "inspect",
      exitCode: 3,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      adapter: { id: descriptor.id, ...(descriptor.version ? { version: descriptor.version } : {}), ...(timedOut ? { timedOut: true } : {}) },
      converterDiagnostics,
      runDiagnostics: [...runDiagnostics, ...run.diagnostics],
      artifacts: [],
      outDir,
      dryRun,
      asJson,
    }, io);
  }
  runDiagnostics.push(...run.diagnostics);

  // 4. Post-validation: cross-consistency + proof-ladder semantics (the schema check already ran
  //    inside the runtime against the descriptor's outputContract).
  const registry = run.payload as CapabilityRegistry;
  if (registry.platformId !== profile.profile.platformId) {
    runDiagnostics.push({ code: "ADAPTER_CONTRACT_MISMATCH", severity: "error", message: `Adapter returned registry for platform '${registry.platformId}' but profile declares '${profile.profile.platformId}'.`, subject: { type: "adapter", id: descriptor.id } });
    return emit({
      command: "inspect",
      exitCode: 3,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      adapter: { id: descriptor.id, ...(descriptor.version ? { version: descriptor.version } : {}) },
      converterDiagnostics,
      runDiagnostics,
      artifacts: [artifact("registry", registry)],
      outDir,
      dryRun,
      asJson,
    }, io);
  }
  const semantic = validateRegistry(registry);
  converterDiagnostics.push(...semantic.diagnostics);

  const registryErrors = registry.diagnostics.filter((x) => x.severity === "error").length;
  const blocking = isBlocking(converterDiagnostics, runDiagnostics) || registryErrors > 0;

  // 5. Emit: registry artifact + envelope; no-write default.
  const files = [{ name: "capability-registry.json", content: serializeJson(registry) }];
  return emit(
    {
      command: "inspect",
      exitCode: blocking ? 1 : 0,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      adapter: { id: descriptor.id, ...(descriptor.version ? { version: descriptor.version } : {}) },
      converterDiagnostics,
      runDiagnostics,
      artifacts: [artifact("registry", registry, { file: "capability-registry.json" })],
      files,
      outDir,
      dryRun,
      asJson,
      extraOutput: asJson ? registry : undefined,
      summaryLines: [
        `registry: ${registry.capabilities.length} capabilities from '${registry.source.sourceId}' @ ${registry.source.revisionId}`,
        `platform: ${registry.platformId}${registry.platformVersion ? " " + registry.platformVersion : ""} · proof max claimed: ${maxProof(registry)}`,
        `registry diagnostics: ${registryErrors} error(s), ${registry.diagnostics.filter((x) => x.severity === "warning").length} warning(s)`,
      ],
    },
    io
  );
}

function maxProof(registry: CapabilityRegistry): string {
  const order = ["not-verified", "discovered", "registered", "structurally-mapped", "admin-roundtrip-verified", "visually-verified"];
  let max = 0;
  for (const c of registry.capabilities) max = Math.max(max, order.indexOf(c.proofLevel));
  return order[max];
}
