// det build — one-shot validated build orchestrator (issue #28 coordinator correction C1).
//
// A THIN, validated driver over the ALREADY-SHIPPED commands (inspect -> extract -> compose):
// it introduces no engine, no parser, no mapping logic and no defaults. Every input comes from
// one schema'd BuildConfig document (schemas/cli/build-config.schema.json) whose paths resolve
// relative to the config file itself, so a project config is portable; the CLI --out flag (or
// config.outputDir) names the bundle directory. The bundle is the versioned inventory contract
// of schemas/cli/build-manifest.schema.json: per-FILE-BYTE sha256 over every generated artifact
// and consumed input (deliberately a different, documented notion from the converter family's
// canonical payload contentHash), exact stage provenance, and an honest gap list — the
// explicitly OPERATOR_GATED preview-installation steps are recorded as gaps, never claimed.
//
// Fail-closed rules honored here:
// - Major 1 builds run from OFFLINE snapshot/tree documents only (the schema's designSource.mode
//   is const "snapshot"); no live design-source path is representable, no provider is contacted.
// - No hardcoded projects, no hardcoded roots: a config without the caller's own paths fails its
//   contract before any stage runs.
// - Nothing is written outside the bundle directory. --dry-run validates the config, inventories
//   the declared inputs (byte hashes) and runs NO stage: the chained stages consume on-disk
//   stage outputs, so a truthful dry run executes nothing and says exactly that.
//
// Exit codes: 0 all stages completed; 1 blocking diagnostics (a stage failed or the manifest
// could not be written truthfully); 2 usage error (config missing/unreadable/invalid, missing
// bundle target); 3 passthrough of an adapter runtime failure from a stage.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalStringify } from "../../canonical.js";
import { artifact, buildEnvelope } from "../../run-envelope.js";
import { validateContract } from "../../schema-registry.js";
import { readJsonFile, serializeJson, writeOutFiles, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { loadProfile } from "./shared.js";
import { commandInspect } from "./inspect.js";
import { commandExtract } from "./extract.js";
import { commandCompose } from "./compose.js";
import { sortRunDiagnostics, type RunDiagnostic } from "../../adapter-runtime.js";
import type { Diagnostic } from "../../types.js";

interface BuildConfig {
  schemaVersion: 1;
  profileId: string;
  profile: string;
  designSource: { mode: "snapshot"; project: string; designFile: string; designNode: string };
  capabilityProbe?: { project: string };
  registry?: string;
  bindings: string;
  content: string;
  projection?: string;
  outputDir?: string;
}

interface StageRecord {
  stage: "capability-probe" | "extraction" | "composition";
  status: "completed" | "reused" | "failed" | "planned";
  exitCode: 0 | 1 | 2 | 3;
  outDir?: string;
}

interface FileRecord {
  path: string;
  role: "profile-input" | "registry" | "binding-map" | "content-manifest-input" | "projection-input" | "node-ir" | "page-structure" | "source-review" | "compose-report" | "native-content" | "tool-run-envelope" | "design-tree-input";
  sha256: string;
  bytes: number;
  provenance: { via: "det-inspect" | "det-extract" | "det-compose" | "det-build" | "caller-input"; stage?: string };
}

function sha256File(filePath: string): { sha256: string; bytes: number } | null {
  try {
    const buf = fs.readFileSync(filePath);
    return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
  } catch {
    return null;
  }
}

// Relative, portable form of a resolved path: config-relative when the file lives inside the
// config's directory tree, otherwise absolute (a local bundle manifest may carry absolute local
// inputs — it is an output artifact, never a committed contract surface).
function displayPath(resolved: string, baseDir: string): string {
  const rel = path.relative(baseDir, resolved);
  return rel.startsWith("..") || path.isAbsolute(rel) ? resolved : rel;
}

export async function commandBuild(flags: Record<string, string | boolean>, io: CommandIO): Promise<0 | 1 | 2 | 3> {
  const asJson = flags.json === true;
  const dryRun = flags["dry-run"] === true;
  const runDiagnostics: RunDiagnostic[] = [];
  const converterDiagnostics: Diagnostic[] = [];

  const configPath = requireValue(flags, "config");
  if (!configPath) {
    return failBuild({ code: "INPUT_UNREADABLE", severity: "error", message: "build requires --config <build-config.json> — the one-shot orchestrator has no default project, no default source and no default output.", subject: { type: "input", id: "config" } }, converterDiagnostics, [], dryRun, asJson, io, 2);
  }
  const configResolved = path.resolve(configPath);
  const loaded = readJsonFile(configResolved);
  if (!loaded.ok) return failBuild(loaded.diagnostic, converterDiagnostics, [], dryRun, asJson, io, 2);
  const configCheck = validateContract("build-config", loaded.data);
  if (!configCheck.valid) {
    return failBuild({ code: "INPUT_SCHEMA_INVALID", severity: "error", message: `Build config '${configPath}' fails its contract: ${configCheck.errors[0] ?? "unknown"}${configCheck.errors.length > 1 ? ` (+${configCheck.errors.length - 1} more)` : ""}`, subject: { type: "input", id: "build-config" } }, converterDiagnostics, [], dryRun, asJson, io, 1);
  }
  const config = loaded.data as BuildConfig;
  const configDir = path.dirname(configResolved);
  const resolveFromConfig = (p: string): string => (path.isAbsolute(p) ? p : path.resolve(configDir, p));

  // Defensive live-source gate (the schema already pins mode to "snapshot"; this guard keeps the
  // fail-closed posture explicit even against a hand-edited validator bypass).
  if (config.designSource.mode !== "snapshot") {
    return failBuild({ code: "BUILD_LIVE_SOURCE_UNSUPPORTED", severity: "error", message: `Build config declares design-source mode '${config.designSource.mode}'; major-1 builds run from offline snapshot/tree documents only. A live design-source read requires its own authorized adapter and is never approximated by the build.`, subject: { type: "input", id: "designSource.mode" } }, converterDiagnostics, [], dryRun, asJson, io, 1);
  }

  // Profile first: its validated identity (profileId/platformId) is the manifest's identity.
  const profileLoaded = loadProfile(resolveFromConfig(config.profile));
  if (!profileLoaded.ok) {
    return failBuild({ code: "PROFILE_SCHEMA_INVALID", severity: "error", message: `Build config profile '${config.profile}' failed to load/validate: ${[...profileLoaded.runDiagnostics, ...profileLoaded.converterDiagnostics].map((d) => d.message).join(" | ").slice(0, 300)}`, subject: { type: "input", id: "profile" } }, converterDiagnostics, [], dryRun, asJson, io, profileLoaded.exitCode === 2 ? 2 : 1);
  }

  // Bundle target: --out wins over config.outputDir; exactly one is required — the build
  // materializes a file bundle, so stdout-only (the other commands' default) is not representable.
  const flagOut = requireValue(flags, "out");
  const bundleDir = flagOut ? path.resolve(flagOut) : config.outputDir ? path.resolve(configDir, config.outputDir) : null;
  if (!bundleDir) {
    return failBuild({ code: "INPUT_UNREADABLE", severity: "error", message: "det build materializes a file bundle: pass --out <dir> (or set outputDir in the build config); a stdout-only build is not representable.", subject: { type: "output", id: "out" } }, converterDiagnostics, [], dryRun, asJson, io, 2);
  }

  // ---- Input inventory (byte hashes of everything the build consumes) --------------------------
  const inputs: FileRecord[] = [];
  const recordInput = (resolvedPath: string, role: FileRecord["role"]): void => {
    const stat = sha256File(resolvedPath);
    if (!stat) return; // unreadable inputs fail inside their stage with precise diagnostics
    inputs.push({ path: displayPath(resolvedPath, configDir), role, sha256: stat.sha256, bytes: stat.bytes, provenance: { via: "caller-input" } });
  };
  const registryPath = config.capabilityProbe ? path.join(bundleDir, "01-capability-probe", "capability-registry.json") : resolveFromConfig(config.registry as string);
  recordInput(resolveFromConfig(config.profile), "profile-input");
  if (!config.capabilityProbe) recordInput(registryPath, "registry");
  recordInput(resolveFromConfig(config.bindings), "binding-map");
  recordInput(resolveFromConfig(config.content), "content-manifest-input");
  if (config.projection) recordInput(resolveFromConfig(config.projection), "projection-input");
  recordInput(path.join(resolveFromConfig(config.designSource.project), config.designSource.designFile), "design-tree-input");

  // ---- Dry run: validate + inventory, run NOTHING (the chained stages consume on-disk outputs) -
  if (dryRun) {
    const stages: StageRecord[] = [
      { stage: "capability-probe", status: config.capabilityProbe ? "planned" : "reused", exitCode: 0 },
      { stage: "extraction", status: "planned", exitCode: 0 },
      { stage: "composition", status: "planned", exitCode: 0 },
    ];
    const gaps = [
      { code: "MANIFEST_OUTPUTS_PARTIAL_DRY_RUN", message: "Dry run: the build validated the config and inventoried its inputs, but ran no stage — chained stages consume on-disk stage outputs, so a truthful dry run executes nothing; output hashes exist only in a real build." },
      { code: "PREVIEW_INSTALL_OPERATOR_GATED", message: "Theme installation and isolated-preview CMS import are operator steps outside this build's write boundary (see the toolkit's local-preview runbook); they are never performed or claimed by det build." },
      { code: "PREVIEW_ASSETS_NOT_GENERATED", message: "No media/theme assets are generated by the offline build; real assets come from the caller's own authorized local sources via the content manifest." },
    ];
    const manifest = {
      schemaVersion: 1,
      kind: "det-build-manifest",
      profileId: profileLoaded.profile.profile.id,
      platformId: profileLoaded.profile.profile.platformId,
      source: { sourceId: "unresolved-dry-run", revisionId: "unresolved-dry-run" },
      config: { contentHash: `sha256:${createHash("sha256").update(canonicalStringify({ ...config, outputDir: undefined }), "utf8").digest("hex")}` },
      stages,
      inputs: [...inputs].sort((a, b) => a.path.localeCompare(b.path)),
      outputs: [],
      gaps,
    };
    return emitBuild(runDiagnostics, converterDiagnostics, stages, manifest, bundleDir, true, asJson, io, 0);
  }

  // ---- Stage io: stages must not print their envelopes into the build's stdout (the build's
  // own envelope + manifest are the contract surface); stderr (adapter diagnostics) stays visible.
  const stageIo: CommandIO = { env: io.env, out: () => {}, err: io.err };
  const stageFlagsFor = (extra: Record<string, string | boolean>): Record<string, string | boolean> => ({ json: true, ...extra });
  const stages: StageRecord[] = [];
  const outputs: FileRecord[] = [];
  const collectStageOutputs = (dir: string, stage: string, via: FileRecord["provenance"]["via"], files: { name: string; role: FileRecord["role"] }[]): void => {
    for (const f of files) {
      const p = path.join(dir, f.name);
      const stat = sha256File(p);
      if (!stat) continue; // the stage did not emit this artifact — the manifest records only what exists
      outputs.push({ path: path.relative(bundleDir, p), role: f.role, sha256: stat.sha256, bytes: stat.bytes, provenance: { via, stage } });
    }
    const runEnvelopePath = path.join(dir, "tool-run.json");
    const stat = sha256File(runEnvelopePath);
    if (stat) outputs.push({ path: path.relative(bundleDir, runEnvelopePath), role: "tool-run-envelope", sha256: stat.sha256, bytes: stat.bytes, provenance: { via, stage } });
  };

  // ---- Stage 1: capability probe (or a caller-pinned registry) --------------------------------
  const probeDir = path.join(bundleDir, "01-capability-probe");
  if (config.capabilityProbe) {
    const exit = await commandInspect(stageFlagsFor({ profile: resolveFromConfig(config.profile), project: resolveFromConfig(config.capabilityProbe.project), out: probeDir }), stageIo);
    stages.push({ stage: "capability-probe", status: exit === 0 ? "completed" : "failed", exitCode: exit, outDir: path.relative(bundleDir, probeDir) });
    if (exit !== 0) return finishBuild(runDiagnostics, converterDiagnostics, stages, outputs, inputs, gapsFromOutputs(outputs), bundleDir, profileLoaded, config, stageExit(exit), dryRun, asJson, io);
  } else {
    stages.push({ stage: "capability-probe", status: "reused", exitCode: 0 });
  }

  // ---- Stage 2: extraction ---------------------------------------------------------------------
  const extractDir = path.join(bundleDir, "02-extraction");
  const extractExit = await commandExtract(
    stageFlagsFor({
      profile: resolveFromConfig(config.profile),
      project: resolveFromConfig(config.designSource.project),
      "design-file": config.designSource.designFile,
      "design-node": config.designSource.designNode,
      registry: registryPath,
      bindings: resolveFromConfig(config.bindings),
      out: extractDir,
    }),
    stageIo
  );
  stages.push({ stage: "extraction", status: extractExit === 0 ? "completed" : "failed", exitCode: extractExit, outDir: path.relative(bundleDir, extractDir) });
  if (extractExit !== 0) return finishBuild(runDiagnostics, converterDiagnostics, stages, outputs, inputs, gapsFromOutputs(outputs), bundleDir, profileLoaded, config, stageExit(extractExit), dryRun, asJson, io);
  collectStageOutputs(extractDir, "02-extraction", "det-extract", [
    { name: "node-ir.json", role: "node-ir" },
    { name: "page-structure.json", role: "page-structure" },
    { name: "source-review.json", role: "source-review" },
  ]);
  if (config.capabilityProbe) collectStageOutputs(probeDir, "01-capability-probe", "det-inspect", [{ name: "capability-registry.json", role: "registry" }]);

  // ---- Stage 3: composition --------------------------------------------------------------------
  const composeDir = path.join(bundleDir, "03-composition");
  const composeExit = await commandCompose(
    stageFlagsFor({
      profile: resolveFromConfig(config.profile),
      registry: registryPath,
      bindings: resolveFromConfig(config.bindings),
      input: path.join(extractDir, "page-structure.json"),
      nodeir: path.join(extractDir, "node-ir.json"),
      content: resolveFromConfig(config.content),
      ...(config.projection ? { projection: resolveFromConfig(config.projection) } : {}),
      out: composeDir,
    }),
    stageIo
  );
  stages.push({ stage: "composition", status: composeExit === 0 ? "completed" : "failed", exitCode: composeExit, outDir: path.relative(bundleDir, composeDir) });
  collectStageOutputs(composeDir, "03-composition", "det-compose", [
    { name: "compose-report.json", role: "compose-report" },
    { name: "native-content.html", role: "native-content" },
  ]);

  return finishBuild(runDiagnostics, converterDiagnostics, stages, outputs, inputs, gapsFromOutputs(outputs), bundleDir, profileLoaded, config, stageExit(composeExit), dryRun, asJson, io);
}

function stageExit(exit: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return exit === 0 ? 0 : exit === 3 ? 3 : 1;
}

function gapsFromOutputs(outputs: FileRecord[]): { code: string; message: string; count?: number }[] {
  // Composition mapping gaps/exclusions are summarized from the produced compose report by the
  // finish step (which reads the file); structural build-boundary gaps are constant and honest.
  return [
    { code: "PREVIEW_INSTALL_OPERATOR_GATED", message: "Theme installation and isolated-preview CMS import are operator steps outside this build's write boundary (see the toolkit's local-preview runbook); they are never performed or claimed by det build." },
    { code: "PREVIEW_ASSETS_NOT_GENERATED", message: "No media/theme assets are generated by the offline build; real assets come from the caller's own authorized local sources via the content manifest." },
    ...(outputs.some((o) => o.role === "compose-report") ? [] : [{ code: "COMPOSITION_REPORT_ABSENT", message: "No compose report in this bundle (the build stopped before composition) — the manifest inventories only what exists." }]),
  ];
}

function finishBuild(
  runDiagnostics: RunDiagnostic[],
  converterDiagnostics: Diagnostic[],
  stages: StageRecord[],
  outputs: FileRecord[],
  inputs: FileRecord[],
  gaps: { code: string; message: string; count?: number }[],
  bundleDir: string,
  profileLoaded: { profile: { profile: { id: string; platformId: string } } },
  config: BuildConfig,
  exitCode: 0 | 1 | 2 | 3,
  dryRun: boolean,
  asJson: boolean,
  io: CommandIO
): 0 | 1 | 2 | 3 {
  // Composition mapping honesty: summarize the produced report's ledger into the manifest gaps.
  const reportPath = path.join(bundleDir, "03-composition", "compose-report.json");
  const reportRead = readJsonFile(reportPath);
  if (reportRead.ok && reportRead.data && typeof reportRead.data === "object") {
    const mapping = (reportRead.data as { mapping?: { disposition: string }[] }).mapping;
    if (Array.isArray(mapping)) {
      const count = (d: string): number => mapping.filter((m) => m.disposition === d).length;
      if (count("gap") > 0) gaps.unshift({ code: "COMPOSITION_GAPS_PRESENT", message: `${count("gap")} composed source node(s) carry explicit fidelity gaps (see 03-composition/compose-report.json mapping) — recorded, never engineered around.`, count: count("gap") });
      if (count("excluded") > 0) gaps.unshift({ code: "COMPOSITION_EXCLUSIONS_PRESENT", message: `${count("excluded")} source node(s) excluded with an explicit record — never silently dropped.`, count: count("excluded") });
      if (count("skipped") > 0) gaps.unshift({ code: "COMPOSITION_SKIPS_PRESENT", message: `${count("skipped")} planned section(s) skipped by the composition table — measured partial coverage, never claimed complete.`, count: count("skipped") });
    }
  }
  const psRead = readJsonFile(path.join(bundleDir, "02-extraction", "page-structure.json"));
  let source: { sourceId: string; revisionId: string } = { sourceId: "unresolved", revisionId: "unresolved" };
  if (psRead.ok && psRead.data && typeof psRead.data === "object") {
    const src = (psRead.data as { source?: { sourceId?: string; revisionId?: string } }).source;
    if (src?.sourceId && src?.revisionId) source = { sourceId: src.sourceId, revisionId: src.revisionId };
  }
  const manifest = {
    schemaVersion: 1,
    kind: "det-build-manifest",
    profileId: profileLoaded.profile.profile.id,
    platformId: profileLoaded.profile.profile.platformId,
    source,
    config: { contentHash: `sha256:${createHash("sha256").update(canonicalStringify(config), "utf8").digest("hex")}` },
    stages: [...stages].map((s) => ({ ...s })),
    inputs: [...inputs].sort((a, b) => a.path.localeCompare(b.path)),
    outputs: [...outputs].sort((a, b) => a.path.localeCompare(b.path)),
    gaps: [...gaps],
  };
  return emitBuild(runDiagnostics, converterDiagnostics, stages, manifest, bundleDir, dryRun, asJson, io, exitCode);
}

function failBuild(
  diagnostic: RunDiagnostic,
  converterDiagnostics: Diagnostic[],
  stages: StageRecord[],
  dryRun: boolean,
  asJson: boolean,
  io: CommandIO,
  exitCode: 0 | 1 | 2 | 3
): 0 | 1 | 2 | 3 {
  return emitBuild([diagnostic], converterDiagnostics, stages, null, null, dryRun, asJson, io, exitCode);
}

function emitBuild(
  runDiagnostics: RunDiagnostic[],
  converterDiagnostics: Diagnostic[],
  stages: StageRecord[],
  manifest: Record<string, unknown> | null,
  bundleDir: string | null,
  dryRun: boolean,
  asJson: boolean,
  io: CommandIO,
  exitCode: 0 | 1 | 2 | 3
): 0 | 1 | 2 | 3 {
  let wroteFiles = false;
  const write = writeOutFiles(manifest && bundleDir ? bundleDir : null, manifest ? [{ name: "build-manifest.json", content: serializeJson(manifest) }] : [], dryRun);
  runDiagnostics.push(...write.diagnostics);
  wroteFiles = write.wroteFiles;
  const envelope = buildEnvelope({
    command: "build",
    exitCode,
    ...(manifest && typeof manifest.profileId === "string" ? { profileId: manifest.profileId } : {}),
    ...(manifest && typeof manifest.platformId === "string" ? { platformId: manifest.platformId } : {}),
    artifacts: manifest ? [artifact("build-manifest", manifest, { file: "build-manifest.json" })] : [],
    converterDiagnostics,
    runDiagnostics: sortRunDiagnostics(runDiagnostics),
    wroteFiles,
  });
  if (asJson) {
    const payload: Record<string, unknown> = { run: envelope };
    if (manifest) payload.manifest = manifest; // dry-run attaches the computed manifest without writing it
    io.out(JSON.stringify(payload, null, 2));
  } else {
    for (const s of stages) io.out(`stage ${s.stage}: ${s.status} (exit ${s.exitCode})${s.outDir ? ` -> ${s.outDir}` : ""}`);
    io.out(`bundle: ${bundleDir ?? "(none)"}`);
    io.out(`diagnostics: ${converterDiagnostics.filter((d) => d.severity === "error").length} error(s), ${converterDiagnostics.filter((d) => d.severity === "warning").length} warning(s)`);
  }
  return exitCode;
}
