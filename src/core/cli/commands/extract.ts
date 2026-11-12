// det extract — read-only design-source structural extraction (G2, issue #14): preflight the
// profile, spawn the design-source adapter for the profile's source kind as an out-of-process
// subprocess (TECH-ADR ADR-4 — the core never talks to any design-source provider itself),
// validate the returned snapshot, run the deterministic extraction and emit NodeIR +
// PageStructure + SourceReview with a tool-run envelope. The selected root comes ONLY from
// --design-file/--design-node; credentials, if a provider ever needs them, come only from the
// caller's environment and are never accepted on the command line, in the profile or in receipts.
// Exit 0 = extraction with no blocking diagnostics; 1 = blocking diagnostics; 2 = usage error;
// 3 = adapter runtime/contract failure.
import fs from "node:fs";
import {
   loadAdapters,
   runAdapter,
   type AdapterDescriptor,
   type RunDiagnostic,
} from "../../adapter-runtime.js";
import { validateRegistry } from "../../semantic.js";
import { validateBindingMap } from "../../resolver.js";
import { extractStructures } from "../../design-source/extract.js";
import { SnapshotDesignSourcePort } from "../../design-source/port.js";
import { artifact } from "../../run-envelope.js";
import {
   validateContract,
   REPO_ROOT,
   contractId,
} from "../../schema-registry.js";
import { readJsonFile, serializeJson, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { emit } from "./emit.js";
import { isBlocking, loadProfile, resolveSource } from "./shared.js";
import type {
   BindingMap,
   CapabilityRegistry,
   ConverterProfile,
   DesignSourceSnapshot,
   Diagnostic,
} from "../../types.js";

// Snapshot-emitting adapters are identified by their declared output contract ($id),
// resolved from resources/schemas/registry.json + the schema file's own $id (issue #41).
const SNAPSHOT_CONTRACT = contractId("design-source-snapshot");

export async function commandExtract(
   flags: Record<string, string | boolean>,
   io: CommandIO,
): Promise<0 | 1 | 2 | 3> {
   const adapterFlag = requireValue(flags, "adapter");
   const project = requireValue(flags, "project");
   const outDir = requireValue(flags, "out");
   const asJson = flags.json === true;
   const dryRun = flags["dry-run"] === true;
   const designFile = requireValue(flags, "design-file");
   const designNode = requireValue(flags, "design-node");
   const registryPath = requireValue(flags, "registry");
   const bindingsPath = requireValue(flags, "bindings");

   const missing = [
      ["--profile", requireValue(flags, "profile")],
      ["--design-file", designFile],
      ["--design-node", designNode],
   ].filter(([, v]) => !v);
   if (missing.length > 0) {
      return emit(
         {
            command: "extract",
            exitCode: 2,
            converterDiagnostics: [],
            runDiagnostics: [
               {
                  code: "INPUT_UNREADABLE",
                  severity: "error",
                  message: `extract requires ${missing.map(([f]) => f).join(", ")} — the selected design root is always explicit caller input, never a default.`,
                  subject: { type: "input", id: "extract" },
               },
            ],
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }
   // designFile/designNode are non-null from here on — the missing-input guard above covers them.
   const selectedFile = designFile as string;
   const selectedNode = designNode as string;

   if (bindingsPath && !registryPath) {
      return emit(
         {
            command: "extract",
            exitCode: 2,
            converterDiagnostics: [],
            runDiagnostics: [
               {
                  code: "INPUT_CONTRACT_VIOLATION",
                  severity: "error",
                  message:
                     "--bindings requires --registry: binding maps are only valid relative to a pinned registry revision.",
                  subject: { type: "input", id: "bindings" },
               },
            ],
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   const converterDiagnostics: Diagnostic[] = [];
   const runDiagnostics: RunDiagnostic[] = [];

   // 1. Profile + project source preflight (fail closed, never audit a guessed path).
   const loaded = loadProfile(requireValue(flags, "profile"));
   if (!loaded.ok) {
      return emit(
         {
            command: "extract",
            exitCode: loaded.exitCode,
            converterDiagnostics: loaded.converterDiagnostics,
            runDiagnostics: loaded.runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }
   const profile = loaded.profile;
   converterDiagnostics.push(...loaded.converterDiagnostics);
   runDiagnostics.push(...loaded.runDiagnostics);
   const { source, diagnostic } = resolveSource(profile, project, io.env);
   if (!source || diagnostic) {
      if (diagnostic) converterDiagnostics.push(diagnostic);
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }
   if (!source.kind) {
      converterDiagnostics.push({
         code: "PROJECT_SOURCE_NOT_CONFIGURED",
         severity: "error",
         message: `Project source '${source.sourceId}' declares no kind; design-source adapter selection requires one.`,
         subject: { type: "source", id: source.sourceId },
      });
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   // 2. Optional pinned registry + binding map — validated exactly like det plan (one set of
   //    consistency rules, no parallel validation logic).
   let registry: CapabilityRegistry | undefined;
   let bindings: BindingMap | undefined;
   if (registryPath) {
      const regLoaded = readJsonFile(registryPath);
      if (!regLoaded.ok)
         return emitUsage(regLoaded.diagnostic, io, dryRun, asJson, profile);
      registry = regLoaded.data as CapabilityRegistry;
      const regCheck = validateContract("capability-registry", registry);
      if (!regCheck.valid)
         return emitSchemaInvalid(
            "capability-registry",
            regCheck.errors,
            io,
            dryRun,
            asJson,
            profile,
         );
      const semantic = validateRegistry(registry);
      converterDiagnostics.push(...semantic.diagnostics);
      if (registry.platformId !== profile.profile.platformId) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `Registry platform '${registry.platformId}' != profile platform '${profile.profile.platformId}'.`,
            subject: { type: "input", id: "registry" },
         });
      }
      if (
         registry.profileId !== undefined &&
         registry.profileId !== profile.profile.id
      ) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `Registry is pinned to project '${registry.profileId}' but the profile declares '${profile.profile.id}'.`,
            subject: { type: "input", id: "registry" },
         });
      }
   }
   if (bindingsPath && registry) {
      const mapLoaded = readJsonFile(bindingsPath);
      if (!mapLoaded.ok)
         return emitUsage(mapLoaded.diagnostic, io, dryRun, asJson, profile);
      bindings = mapLoaded.data as BindingMap;
      const mapCheck = validateContract("component-binding-map", bindings);
      if (!mapCheck.valid)
         return emitSchemaInvalid(
            "component-binding-map",
            mapCheck.errors,
            io,
            dryRun,
            asJson,
            profile,
         );
      if (bindings.profileId !== profile.profile.id) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `Binding map belongs to project '${bindings.profileId}' but the profile declares '${profile.profile.id}'.`,
            subject: { type: "input", id: "bindings" },
         });
      }
      if (bindings.platformId !== registry.platformId) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `Binding map platform '${bindings.platformId}' != registry platform '${registry.platformId}'.`,
            subject: { type: "input", id: "bindings" },
         });
      }
      if (bindings.registry.registryRevisionId !== registry.source.revisionId) {
         converterDiagnostics.push({
            code: "EVIDENCE_MISSING",
            severity: "error",
            message: `Binding map is pinned to registry revision '${bindings.registry.registryRevisionId}' but the supplied registry is revision '${registry.source.revisionId}'; re-pin before extracting.`,
            subject: { type: "binding", id: bindings.profileId },
         });
      }
      const bindingCheck = validateBindingMap(registry, bindings);
      converterDiagnostics.push(...bindingCheck.diagnostics);
   }
   if (isBlocking(converterDiagnostics, runDiagnostics)) {
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   // 3. Design-source adapter selection: by source KIND over the snapshot-contract adapters.
   const { adapters, diagnostics: adapterDiags } = loadAdapters(REPO_ROOT);
   runDiagnostics.push(...adapterDiags);
   const sourceAdapters = adapters.filter(
      (a) => a.outputContract === SNAPSHOT_CONTRACT,
   );
   let descriptor: AdapterDescriptor | null = null;
   if (adapterFlag) {
      const named = adapters.find((a) => a.id === adapterFlag);
      if (!named) {
         runDiagnostics.push({
            code: "ADAPTER_NOT_FOUND",
            severity: "error",
            message: `No adapter registered with id '${adapterFlag}' (available: ${adapters.map((a) => a.id).join(", ") || "none"}).`,
            subject: { type: "adapter", id: adapterFlag },
         });
         return emit(
            {
               command: "extract",
               exitCode: 2,
               profileId: profile.profile.id,
               platformId: profile.profile.platformId,
               converterDiagnostics,
               runDiagnostics,
               artifacts: [],
               outDir: null,
               dryRun,
               asJson,
            },
            io,
         );
      }
      if (named.outputContract !== SNAPSHOT_CONTRACT) {
         converterDiagnostics.push({
            code: "ADAPTER_NOT_APPLICABLE",
            severity: "error",
            message: `Adapter '${named.id}' is not a design-source reader (output contract is not the design-source snapshot); extraction cannot use it.`,
            subject: { type: "source", id: source.sourceId },
         });
         return emit(
            {
               command: "extract",
               exitCode: 1,
               profileId: profile.profile.id,
               platformId: profile.profile.platformId,
               converterDiagnostics,
               runDiagnostics,
               artifacts: [],
               outDir: null,
               dryRun,
               asJson,
            },
            io,
         );
      }
      descriptor = named;
   } else {
      descriptor =
         sourceAdapters.find((a) => a.platformIds.includes(source.kind)) ??
         null;
      if (!descriptor) {
         converterDiagnostics.push({
            code: "ADAPTER_NOT_APPLICABLE",
            severity: "error",
            message: `No registered design-source adapter supports source kind '${source.kind}' (registered: ${sourceAdapters.map((a) => a.platformIds.join("/")).join(", ") || "none"}). Nothing will be extracted.`,
            subject: { type: "source", id: source.sourceId },
         });
         return emit(
            {
               command: "extract",
               exitCode: 1,
               profileId: profile.profile.id,
               platformId: profile.profile.platformId,
               converterDiagnostics,
               runDiagnostics,
               artifacts: [],
               outDir: null,
               dryRun,
               asJson,
            },
            io,
         );
      }
   }
   if (!descriptor.platformIds.includes(source.kind)) {
      converterDiagnostics.push({
         code: "ADAPTER_NOT_APPLICABLE",
         severity: "error",
         message: `Adapter '${descriptor.id}' supports design sources (${descriptor.platformIds.join(", ")}), not kind '${source.kind}'.`,
         subject: { type: "source", id: source.sourceId },
      });
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   // 4. Transport input (realpath, fail closed) + spawn.
   let sourcePath: string;
   try {
      sourcePath = fs.realpathSync(source.path);
   } catch {
      converterDiagnostics.push({
         code: "PROJECT_SOURCE_NOT_READABLE",
         severity: "error",
         message: `Design source '${source.sourceId}' could not be resolved to a real path.`,
         subject: { type: "source", id: source.sourceId },
      });
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }
   const profileScope = profile.profile.scopes?.find(
      (s) => s.sourceId === source.sourceId,
   );
   const adapterInput = {
      schemaVersion: 1,
      profileId: profile.profile.id,
      platformId: source.kind,
      source: {
         sourceId: source.sourceId,
         kind: source.kind,
         path: sourcePath,
         ...(profileScope
            ? {
                 scopes: {
                    ...(profileScope.include
                       ? { include: profileScope.include }
                       : {}),
                    ...(profileScope.exclude
                       ? { exclude: profileScope.exclude }
                       : {}),
                 },
              }
            : {}),
      },
      options: { designFile: selectedFile, designNode: selectedNode },
   };
   const inputCheck = validateContract("adapter-input", adapterInput);
   if (!inputCheck.valid) {
      runDiagnostics.push({
         code: "INPUT_CONTRACT_VIOLATION",
         severity: "error",
         message: `Constructed adapter input fails the transport contract: ${inputCheck.errors[0] ?? "unknown"}`,
         subject: { type: "adapter", id: descriptor.id },
      });
      return emit(
         {
            command: "extract",
            exitCode: 2,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            adapter: { id: descriptor.id },
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   const run = await runAdapter(REPO_ROOT, descriptor, adapterInput);
   // Adapter stderr is terminal-only (F4): never embedded in diagnostics or persisted receipts.
   if (run.stderrTail)
      io.err(
         `[adapter stderr] ${run.stderrTail.split("\n").slice(-5).join(" | ")}`,
      );
   if (!run.ok) {
      const timedOut = run.diagnostics.some(
         (x) => x.code === "ADAPTER_TIMEOUT",
      );
      return emit(
         {
            command: "extract",
            exitCode: 3,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            adapter: {
               id: descriptor.id,
               ...(descriptor.version ? { version: descriptor.version } : {}),
               ...(timedOut ? { timedOut: true } : {}),
            },
            converterDiagnostics,
            runDiagnostics: [...runDiagnostics, ...run.diagnostics],
            artifacts: [],
            outDir,
            dryRun,
            asJson,
         },
         io,
      );
   }
   runDiagnostics.push(...run.diagnostics);

   // 5. Snapshot identity: the adapter must return exactly the requested project + root.
   const snapshot = run.payload as DesignSourceSnapshot;
   if (snapshot.sourceId !== source.sourceId) {
      runDiagnostics.push({
         code: "ADAPTER_CONTRACT_MISMATCH",
         severity: "error",
         message: `Adapter returned a snapshot for source '${snapshot.sourceId}' but the profile resolves '${source.sourceId}'.`,
         subject: { type: "adapter", id: descriptor.id },
      });
      return emit(
         {
            command: "extract",
            exitCode: 3,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            adapter: {
               id: descriptor.id,
               ...(descriptor.version ? { version: descriptor.version } : {}),
            },
            converterDiagnostics,
            runDiagnostics,
            artifacts: [artifact("adapter-descriptor", descriptor)],
            outDir,
            dryRun,
            asJson,
         },
         io,
      );
   }
   if (snapshot.rootLocator !== selectedNode) {
      converterDiagnostics.push({
         code: "LOCATOR_OUT_OF_SCOPE",
         severity: "error",
         message: `Adapter snapshot is rooted at '${snapshot.rootLocator}' but the caller selected '${selectedNode}' — a source scope escape, fail closed.`,
         subject: { type: "node", id: selectedNode },
      });
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            adapter: {
               id: descriptor.id,
               ...(descriptor.version ? { version: descriptor.version } : {}),
            },
            converterDiagnostics,
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }

   // 6. Deterministic extraction over the snapshot-backed port.
   const port = new SnapshotDesignSourcePort(
      snapshot,
      profileScope
         ? { include: profileScope.include, exclude: profileScope.exclude }
         : {},
      `root ${snapshot.rootLocator} selected by the caller`,
   );
   const outcome = extractStructures({
      port,
      rootLocator: selectedNode,
      profileId: profile.profile.id,
      now: new Date().toISOString(),
      registry,
      bindings,
   });
   if (!outcome.ok) {
      return emit(
         {
            command: "extract",
            exitCode: 1,
            profileId: profile.profile.id,
            platformId: profile.profile.platformId,
            adapter: {
               id: descriptor.id,
               ...(descriptor.version ? { version: descriptor.version } : {}),
            },
            converterDiagnostics: [
               ...converterDiagnostics,
               ...outcome.diagnostics,
            ],
            runDiagnostics,
            artifacts: [],
            outDir: null,
            dryRun,
            asJson,
         },
         io,
      );
   }
   converterDiagnostics.push(...outcome.review.diagnostics);

   // 7. Emit: three artifacts + envelope; no-write default, --dry-run writes nothing.
   const files = [
      { name: "node-ir.json", content: serializeJson(outcome.nodeIr) },
      {
         name: "page-structure.json",
         content: serializeJson(outcome.pageStructure),
      },
      { name: "source-review.json", content: serializeJson(outcome.review) },
   ];
   const blocking = isBlocking(converterDiagnostics, runDiagnostics);
   return emit(
      {
         command: "extract",
         exitCode: blocking ? 1 : 0,
         profileId: profile.profile.id,
         platformId: profile.profile.platformId,
         adapter: {
            id: descriptor.id,
            ...(descriptor.version ? { version: descriptor.version } : {}),
         },
         converterDiagnostics,
         runDiagnostics,
         artifacts: [
            artifact("node-ir", outcome.nodeIr, { file: "node-ir.json" }),
            artifact("page-structure", outcome.pageStructure, {
               file: "page-structure.json",
            }),
            artifact("source-review", outcome.review, {
               file: "source-review.json",
            }),
         ],
         files,
         outDir,
         dryRun,
         asJson,
         extraOutput: asJson
            ? {
                 nodeIr: outcome.nodeIr,
                 pageStructure: outcome.pageStructure,
                 review: outcome.review,
              }
            : undefined,
         summaryLines: [
            `source: '${source.sourceId}' @ ${snapshot.revisionId} · root ${snapshot.rootLocator} · ${outcome.nodeIr.nodes.length} node(s) inventoried`,
            `review: ${outcome.review.counts.byDisposition.MAPPED} mapped / ${outcome.review.counts.byDisposition.EXCLUDED_WITH_REASON} excluded / ${outcome.review.counts.byDisposition.DECORATION_MERGED} decoration-merged / ${outcome.review.counts.byDisposition.REFERENCE_ONLY} reference-only / ${outcome.review.counts.byDisposition.NEEDS_REVIEW} needs-review`,
            `plan: ${outcome.pageStructure.sections.length} section(s), ${outcome.pageStructure.sections.reduce((n, s) => n + s.elements.length, 0)} element(s)`,
         ],
      },
      io,
   );
}

function emitUsage(
   diagnostic: RunDiagnostic,
   io: CommandIO,
   dryRun: boolean,
   asJson: boolean,
   profile: ConverterProfile,
): 0 | 1 | 2 | 3 {
   return emit(
      {
         command: "extract",
         exitCode: 2,
         converterDiagnostics: [],
         runDiagnostics: [diagnostic],
         artifacts: [],
         outDir: null,
         dryRun,
         asJson,
         profileId: profile.profile.id,
      },
      io,
   );
}

function emitSchemaInvalid(
   name: string,
   errors: string[],
   io: CommandIO,
   dryRun: boolean,
   asJson: boolean,
   profile: ConverterProfile,
): 0 | 1 | 2 | 3 {
   return emit(
      {
         command: "extract",
         exitCode: 1,
         converterDiagnostics: [],
         runDiagnostics: [
            {
               code: "INPUT_SCHEMA_INVALID",
               severity: "error",
               message: `Input '${name}' fails its contract: ${errors[0] ?? "unknown"}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}`,
               subject: { type: "input", id: name },
            },
         ],
         artifacts: [],
         outDir: null,
         dryRun,
         asJson,
         profileId: profile.profile.id,
      },
      io,
   );
}
