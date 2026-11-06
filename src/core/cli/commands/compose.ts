// det compose — gated native content composition (G3, issue #23): deterministically compose
// persisted native platform content from a pinned PageStructure + NodeIR + caller-supplied
// content manifest against a pinned capability registry + binding map, via the platform's
// out-of-process compose adapter (TECH-ADR ADR-4 — the core stays platform-neutral and never
// imports adapter code).
//
// Division of responsibility (the G2 contract names this stage explicitly): the binding layer
// resolves component instances; structural containers without one are resolved HERE, by the
// platform adapter, behind these gates — never by prompt logic, never as arbitrary embeddable
// markup, never with invented content. The core's job is exactly: (1) schema-validate every
// input, (2) verify all cross-pins (project/platform identity, registry revision, binding-map
// hash, NodeIR hash, manifest revision) fail-closed, (3) select a compose-capable adapter by
// its declared output contract, (4) spawn it with the composite transport, and (5) re-verify
// the echoed input identities + content hash before emitting anything. Gaps come back as
// explicit diagnostics from the adapter; the core adds none of its own guesses.
//
// Proof discipline: a compose receipt is STRUCTURAL composition evidence only — it never
// claims Admin round-trip or visual verification.
// Exit 0 = content composed (gap warnings allowed); 1 = blocking diagnostics or nothing
// composed; 2 = usage error; 3 = adapter runtime/contract failure.
import { stableContentHash, sha256Hex } from "../../canonical.js";
import { loadAdapters, runAdapter, type AdapterDescriptor, type RunDiagnostic } from "../../adapter-runtime.js";
import { validateRegistry } from "../../semantic.js";
import { validateBindingMap } from "../../resolver.js";
import { bindingMapPinHash } from "../../design-source/extract.js";
import { artifact } from "../../run-envelope.js";
import { validateContract, REPO_ROOT } from "../../schema-registry.js";
import { readJsonFile, serializeJson, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { emit } from "./emit.js";
import { isBlocking, loadProfile } from "./shared.js";
import type { BindingMap, CapabilityRegistry, ConverterProfile, Diagnostic, NodeIR, PageStructure } from "../../types.js";

// The compose-capable adapters are identified by their declared output contract ($id).
export const COMPOSE_OUTPUT_CONTRACT = "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/compose-output.schema.json";

// Shared structural types for the G3 compose family (schemas/cli/{content-manifest,compose-output}, major 1).
export interface ContentManifestEntry {
  valueRef: string;
  kind: "text" | "media" | "link";
  text?: string;
  mediaUrl?: string;
  assetLabel?: string;
  linkUrl?: string;
  linkTarget?: string;
  note?: string;
}
export interface ContentManifest {
  schemaVersion: 1;
  profileId: string;
  sourceRevisionId: string;
  entries: ContentManifestEntry[];
}
export interface ComposeMappingEntry {
  sourceNodeId: string;
  sourceName?: string;
  sourceLocator?: string;
  disposition: "mapped" | "gap" | "decoration-merged" | "excluded" | "skipped";
  target?: { capabilityId: string; appearanceId: string; nativeElement?: string; nativeField?: string };
  note?: string;
}
export interface ComposeOutput {
  schemaVersion: 1;
  platformId: string;
  source: { sourceId: string; revisionId: string; accessedAt: string };
  inputs: {
    nodeIrContentHash: string;
    pageStructureContentHash: string;
    contentManifestContentHash: string;
    registryRevisionId: string;
    bindingMapContentHash: string;
  };
  content: string;
  contentHash: string;
  mapping: ComposeMappingEntry[];
  diagnostics: Diagnostic[];
}

export async function commandCompose(flags: Record<string, string | boolean>, io: CommandIO): Promise<0 | 1 | 2 | 3> {
  const asJson = flags.json === true;
  const dryRun = flags["dry-run"] === true;
  const outDir = typeof flags["out"] === "string" && flags["out"].length > 0 ? (flags["out"] as string) : null;

  const required = [
    ["--profile", requireValue(flags, "profile")],
    ["--registry", requireValue(flags, "registry")],
    ["--bindings", requireValue(flags, "bindings")],
    ["--input", requireValue(flags, "input")],
    ["--nodeir", requireValue(flags, "nodeir")],
    ["--content", requireValue(flags, "content")],
  ] as const;
  const missing = required.filter(([, v]) => !v);
  if (missing.length > 0) {
    return emit(
      {
        command: "compose",
        exitCode: 2,
        converterDiagnostics: [],
        runDiagnostics: [{ code: "INPUT_UNREADABLE", severity: "error", message: `compose requires ${missing.map(([f]) => f).join(", ")} — every pin must be explicit caller input, never a default.`, subject: { type: "input", id: "compose" } }],
        artifacts: [],
        outDir: null,
        dryRun,
        asJson,
      },
      io
    );
  }

  const converterDiagnostics: Diagnostic[] = [];
  const runDiagnostics: RunDiagnostic[] = [];

  // 1. Profile.
  const loaded = loadProfile(required[0][1] as string);
  if (!loaded.ok) {
    return emit({ command: "compose", exitCode: loaded.exitCode, converterDiagnostics: loaded.converterDiagnostics, runDiagnostics: loaded.runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }
  const profile = loaded.profile;
  converterDiagnostics.push(...loaded.converterDiagnostics);
  runDiagnostics.push(...loaded.runDiagnostics);

  // 2. Load + schema-validate the five pinned inputs.
  const regLoaded = readJsonFile(required[1][1] as string);
  if (!regLoaded.ok) return emitUsage(regLoaded.diagnostic, io, dryRun, asJson);
  const registry = regLoaded.data as CapabilityRegistry;
  const regCheck = validateContract("capability-registry", registry);
  if (!regCheck.valid) return emitSchemaInvalid("capability-registry", regCheck.errors, io, dryRun, asJson);

  const mapLoaded = readJsonFile(required[2][1] as string);
  if (!mapLoaded.ok) return emitUsage(mapLoaded.diagnostic, io, dryRun, asJson);
  const bindings = mapLoaded.data as BindingMap;
  const mapCheck = validateContract("component-binding-map", bindings);
  if (!mapCheck.valid) return emitSchemaInvalid("component-binding-map", mapCheck.errors, io, dryRun, asJson);

  const structureLoaded = readJsonFile(required[3][1] as string);
  if (!structureLoaded.ok) return emitUsage(structureLoaded.diagnostic, io, dryRun, asJson);
  const pageStructure = structureLoaded.data as PageStructure;
  const psCheck = validateContract("page-structure", pageStructure);
  if (!psCheck.valid) return emitSchemaInvalid("page-structure", psCheck.errors, io, dryRun, asJson);

  const nodeIrLoaded = readJsonFile(required[4][1] as string);
  if (!nodeIrLoaded.ok) return emitUsage(nodeIrLoaded.diagnostic, io, dryRun, asJson);
  const nodeIr = nodeIrLoaded.data as NodeIR;
  const irCheck = validateContract("node-ir", nodeIr);
  if (!irCheck.valid) return emitSchemaInvalid("node-ir", irCheck.errors, io, dryRun, asJson);

  const contentLoaded = readJsonFile(required[5][1] as string);
  if (!contentLoaded.ok) return emitUsage(contentLoaded.diagnostic, io, dryRun, asJson);
  const content = contentLoaded.data as ContentManifest;
  const contentCheck = validateContract("content-manifest", content);
  if (!contentCheck.valid) return emitSchemaInvalid("content-manifest", contentCheck.errors, io, dryRun, asJson);

  // 3. Cross-pins (fail closed) — the same consistency rules plan/extract enforce, extended with
  //    the content-manifest pins. A compose run may only ever consume mutually pinned artifacts.
  if (nodeIr.profileId !== profile.profile.id) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `NodeIR belongs to project '${nodeIr.profileId}' but the profile declares '${profile.profile.id}'.`, subject: { type: "input", id: "nodeir" } });
  }
  if (pageStructure.profileId !== profile.profile.id) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `PageStructure belongs to project '${pageStructure.profileId}' but the profile declares '${profile.profile.id}'.`, subject: { type: "input", id: "structure" } });
  }
  const expectedNodeIrHash = stableContentHash(nodeIr);
  if (pageStructure.inputs.nodeIrContentHash !== expectedNodeIrHash) {
    converterDiagnostics.push({
      code: "EVIDENCE_MISSING",
      severity: "error",
      message: `PageStructure input pin does not match the supplied NodeIR (hash mismatch); the structure was not derived from this inventory.`,
      subject: { type: "binding", id: bindings.profileId },
    });
  }
  if (pageStructure.inputs.registryRevisionId !== undefined && pageStructure.inputs.registryRevisionId !== registry.source.revisionId) {
    converterDiagnostics.push({
      code: "EVIDENCE_MISSING",
      severity: "error",
      message: `PageStructure is pinned to registry revision '${pageStructure.inputs.registryRevisionId}' but the supplied registry is revision '${registry.source.revisionId}'; re-pin before composing.`,
      subject: { type: "binding", id: bindings.profileId },
    });
  }
  if (pageStructure.inputs.bindingMapContentHash !== undefined && pageStructure.inputs.bindingMapContentHash !== bindingMapPinHash(bindings)) {
    converterDiagnostics.push({
      code: "EVIDENCE_MISSING",
      severity: "error",
      message: `PageStructure input pin does not match the supplied binding map (hash mismatch); the structure was not derived from this map.`,
      subject: { type: "binding", id: bindings.profileId },
    });
  }
  if (registry.platformId !== profile.profile.platformId) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `Registry platform '${registry.platformId}' != profile platform '${profile.profile.platformId}'.`, subject: { type: "input", id: "registry" } });
  }
  if (registry.profileId !== undefined && registry.profileId !== profile.profile.id) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `Registry is pinned to project '${registry.profileId}' but the profile declares '${profile.profile.id}'.`, subject: { type: "input", id: "registry" } });
  }
  if (bindings.profileId !== profile.profile.id) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `Binding map belongs to project '${bindings.profileId}' but the profile declares '${profile.profile.id}'.`, subject: { type: "input", id: "bindings" } });
  }
  if (bindings.platformId !== registry.platformId) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `Binding map platform '${bindings.platformId}' != registry platform '${registry.platformId}'.`, subject: { type: "input", id: "bindings" } });
  }
  if (bindings.registry.registryRevisionId !== registry.source.revisionId) {
    converterDiagnostics.push({
      code: "EVIDENCE_MISSING",
      severity: "error",
      message: `Binding map is pinned to registry revision '${bindings.registry.registryRevisionId}' but the supplied registry is revision '${registry.source.revisionId}'; re-pin before composing.`,
      subject: { type: "binding", id: bindings.profileId },
    });
  }
  if (content.profileId !== profile.profile.id) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_MISMATCH", severity: "error", message: `Content manifest belongs to project '${content.profileId}' but the profile declares '${profile.profile.id}'.`, subject: { type: "input", id: "content" } });
  }
  if (content.sourceRevisionId !== pageStructure.source.revisionId) {
    converterDiagnostics.push({
      code: "EVIDENCE_MISSING",
      severity: "error",
      message: `Content manifest is pinned to source revision '${content.sourceRevisionId}' but the PageStructure is pinned to '${pageStructure.source.revisionId}'; content is only valid for the revision it was observed against.`,
      subject: { type: "source", id: pageStructure.source.sourceId },
    });
  }
  // Duplicate (valueRef, kind) manifest entries are a caller error — the composer must never pick.
  const seenEntries = new Set<string>();
  for (const entry of content.entries) {
    const key = `${entry.valueRef}␟${entry.kind}`;
    if (seenEntries.has(key)) {
      runDiagnostics.push({ code: "INPUT_CONTRACT_VIOLATION", severity: "error", message: `Duplicate content manifest entry for '${entry.valueRef}' kind '${entry.kind}'; the composer refuses to choose.`, subject: { type: "input", id: "content" } });
    }
    seenEntries.add(key);
  }
  if (isBlocking(converterDiagnostics, runDiagnostics)) {
    return emit({ command: "compose", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  // 4. Semantic validation of the pinned registry + binding map (same rules as plan/extract).
  const semantic = validateRegistry(registry);
  converterDiagnostics.push(...semantic.diagnostics);
  const bindingCheck = validateBindingMap(registry, bindings);
  converterDiagnostics.push(...bindingCheck.diagnostics);
  if (isBlocking(converterDiagnostics, runDiagnostics)) {
    return emit({ command: "compose", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  // 5. Compose adapter selection: by output CONTRACT over platform identity — a capability
  //    probe or design-source reader is never a composer, even if it shares the platform id.
  const { adapters, diagnostics: adapterDiags } = loadAdapters(REPO_ROOT);
  runDiagnostics.push(...adapterDiags);
  const composeAdapters = adapters.filter((a) => a.outputContract === COMPOSE_OUTPUT_CONTRACT);
  const adapterFlag = requireValue(flags, "adapter");
  let descriptor: AdapterDescriptor | null = null;
  if (adapterFlag) {
    const named = adapters.find((a) => a.id === adapterFlag);
    if (!named) {
      runDiagnostics.push({ code: "ADAPTER_NOT_FOUND", severity: "error", message: `No adapter registered with id '${adapterFlag}' (available: ${adapters.map((a) => a.id).join(", ") || "none"}).`, subject: { type: "adapter", id: adapterFlag } });
      return emit({ command: "compose", exitCode: 2, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
    if (named.outputContract !== COMPOSE_OUTPUT_CONTRACT) {
      converterDiagnostics.push({ code: "ADAPTER_NOT_APPLICABLE", severity: "error", message: `Adapter '${named.id}' is not a compose adapter (output contract is not the compose output); composition cannot use it.`, subject: { type: "source", id: profile.profile.platformId } });
      return emit({ command: "compose", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
    descriptor = named;
  } else {
    descriptor = composeAdapters.find((a) => a.platformIds.includes(profile.profile.platformId)) ?? null;
    if (!descriptor) {
      converterDiagnostics.push({ code: "ADAPTER_NOT_APPLICABLE", severity: "error", message: `No registered compose adapter supports platform '${profile.profile.platformId}' (registered compose adapters: ${composeAdapters.map((a) => a.id).join(", ") || "none"}). Nothing can be composed.`, subject: { type: "source", id: profile.profile.platformId } });
      return emit({ command: "compose", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
    }
  }
  if (!descriptor.platformIds.includes(profile.profile.platformId)) {
    converterDiagnostics.push({ code: "ADAPTER_NOT_APPLICABLE", severity: "error", message: `Compose adapter '${descriptor.id}' supports platforms (${descriptor.platformIds.join(", ")}), not '${profile.profile.platformId}'.`, subject: { type: "source", id: profile.profile.platformId } });
    return emit({ command: "compose", exitCode: 1, profileId: profile.profile.id, platformId: profile.profile.platformId, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  // 6. Composite transport input (every payload was validated + pinned above; the adapter
  //    re-validates defensively against the same contracts).
  const composeInput = {
    schemaVersion: 1,
    profileId: profile.profile.id,
    platformId: profile.profile.platformId,
    registry,
    bindings,
    nodeIr,
    pageStructure,
    content,
  };
  const inputCheck = validateContract("compose-input", composeInput);
  if (!inputCheck.valid) {
    runDiagnostics.push({ code: "INPUT_CONTRACT_VIOLATION", severity: "error", message: `Constructed compose input fails the transport contract: ${inputCheck.errors[0] ?? "unknown"}`, subject: { type: "adapter", id: descriptor.id } });
    return emit({ command: "compose", exitCode: 2, profileId: profile.profile.id, platformId: profile.profile.platformId, adapter: { id: descriptor.id }, converterDiagnostics, runDiagnostics, artifacts: [], outDir: null, dryRun, asJson }, io);
  }

  const run = await runAdapter(REPO_ROOT, descriptor, composeInput);
  // Adapter stderr is terminal-only (F4): never embedded in diagnostics or persisted receipts.
  if (run.stderrTail) io.err(`[adapter stderr] ${run.stderrTail.split("\n").slice(-5).join(" | ")}`);
  if (!run.ok) {
    const timedOut = run.diagnostics.some((x) => x.code === "ADAPTER_TIMEOUT");
    return emit({
      command: "compose",
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
  const output = run.payload as ComposeOutput;

  // 7. Re-verify the adapter's echoed identities + content hash — trust the pins, verify the echo.
  const echo: { ok: boolean; message: string }[] = [];
  if (output.platformId !== profile.profile.platformId) echo.push({ ok: false, message: `platform '${output.platformId}' != profile platform '${profile.profile.platformId}'` });
  if (output.source.revisionId !== pageStructure.source.revisionId) echo.push({ ok: false, message: `source revision '${output.source.revisionId}' != PageStructure revision '${pageStructure.source.revisionId}'` });
  const expectedPageStructureHash = stableContentHash(pageStructure);
  const expectedContentHash = stableContentHash(content);
  const expectedContentSha = `sha256:${sha256Hex(output.content)}`;
  if (output.inputs.nodeIrContentHash !== expectedNodeIrHash) echo.push({ ok: false, message: "echoed nodeIrContentHash mismatch" });
  if (output.inputs.pageStructureContentHash !== expectedPageStructureHash) echo.push({ ok: false, message: "echoed pageStructureContentHash mismatch" });
  if (output.inputs.contentManifestContentHash !== expectedContentHash) echo.push({ ok: false, message: "echoed contentManifestContentHash mismatch" });
  if (output.inputs.registryRevisionId !== registry.source.revisionId) echo.push({ ok: false, message: "echoed registryRevisionId mismatch" });
  if (output.inputs.bindingMapContentHash !== bindingMapPinHash(bindings)) echo.push({ ok: false, message: "echoed bindingMapContentHash mismatch" });
  if (output.contentHash !== expectedContentSha) echo.push({ ok: false, message: "echoed contentHash does not match the emitted content bytes" });
  if (echo.some((x) => !x.ok)) {
    for (const bad of echo.filter((x) => !x.ok)) {
      runDiagnostics.push({ code: "ADAPTER_CONTRACT_MISMATCH", severity: "error", message: `Compose adapter '${descriptor.id}' echo verification failed: ${bad.message}.`, subject: { type: "adapter", id: descriptor.id } });
    }
    return emit({
      command: "compose",
      exitCode: 3,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      adapter: { id: descriptor.id, ...(descriptor.version ? { version: descriptor.version } : {}) },
      converterDiagnostics,
      runDiagnostics,
      artifacts: [],
      outDir: null,
      dryRun,
      asJson,
    }, io);
  }

  // 8. Compose findings are converter diagnostics (closed registry, validated by the output
  //    contract); an empty content document is a blocking failure even without error diagnostics.
  converterDiagnostics.push(...output.diagnostics);
  const empty = output.content.length === 0;
  if (empty) {
    runDiagnostics.push({ code: "COMPOSE_EMPTY_OUTPUT", severity: "error", message: `Compose adapter '${descriptor.id}' produced an empty content document — nothing was composed; composition is never silently skipped.`, subject: { type: "adapter", id: descriptor.id } });
  }
  const blocking = isBlocking(converterDiagnostics, runDiagnostics);
  const mapped = output.mapping.filter((m) => m.disposition === "mapped").length;
  const gaps = output.mapping.filter((m) => m.disposition === "gap").length;
  return emit(
    {
      command: "compose",
      exitCode: blocking || empty ? 1 : 0,
      profileId: profile.profile.id,
      platformId: profile.profile.platformId,
      adapter: { id: descriptor.id, ...(descriptor.version ? { version: descriptor.version } : {}) },
      converterDiagnostics,
      runDiagnostics,
      artifacts: [
        artifact("compose-report", output, { file: "compose-report.json" }),
        artifact("adapter-descriptor", descriptor),
      ],
      files: [
        { name: "compose-report.json", content: serializeJson(output) },
        { name: "native-content.html", content: output.content },
      ],
      outDir,
      dryRun,
      asJson,
      extraOutput: asJson ? { report: output } : undefined,
      summaryLines: [
        `source: '${output.source.sourceId}' @ ${output.source.revisionId}`,
        `mapping: ${mapped} mapped / ${gaps} gap(s) / ${output.mapping.length - mapped - gaps} other · content ${output.content.length} byte(s)`,
      ],
    },
    io
  );
}

function emitUsage(diagnostic: RunDiagnostic, io: CommandIO, dryRun: boolean, asJson: boolean): 0 | 1 | 2 | 3 {
  return emit({ command: "compose", exitCode: 2, converterDiagnostics: [], runDiagnostics: [diagnostic], artifacts: [], outDir: null, dryRun, asJson }, io);
}

function emitSchemaInvalid(name: string, errors: string[], io: CommandIO, dryRun: boolean, asJson: boolean): 0 | 1 | 2 | 3 {
  return emit(
    {
      command: "compose",
      exitCode: 1,
      converterDiagnostics: [],
      runDiagnostics: [{ code: "INPUT_SCHEMA_INVALID", severity: "error", message: `Input '${name}' fails its contract: ${errors[0] ?? "unknown"}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}`, subject: { type: "input", id: name } }],
      artifacts: [],
      outDir: null,
      dryRun,
      asJson,
    },
    io
  );
}
