// det plan — deterministic structural mapping: resolve a pinned design structure against a
// pinned capability registry + binding map, producing a ResolutionReport. Pure computation on
// the supplied JSON inputs — no source checkout, no adapter, no AI (manual CLI proof surface).
// Exit 0 = report produced with no error diagnostics; 1 = blocking diagnostics; 2 = usage error.
import { validateBindingMap, resolveStructure } from "../../resolver.js";
import { validateRegistry } from "../../semantic.js";
import { bindingMapPinHash } from "../../design-source/extract.js";
import { artifact } from "../../run-envelope.js";
import { validateContract } from "../../schema-registry.js";
import { readJsonFile, serializeJson, type CommandIO } from "../io.js";
import { requireValue } from "../args.js";
import { emit } from "./emit.js";
import { isBlocking, loadProfile } from "./shared.js";
import type { RunDiagnostic } from "../../adapter-runtime.js";
import type {
   BindingMap,
   CapabilityRegistry,
   Diagnostic,
   PageStructure,
   PageStructureHarness,
} from "../../types.js";

export async function commandPlan(
   flags: Record<string, string | boolean | string[]>,
   io: CommandIO,
): Promise<0 | 1 | 2 | 3> {
   const outDir = requireValue(flags, "out");
   const asJson = flags.json === true;
   const dryRun = flags["dry-run"] === true;

   const converterDiagnostics: Diagnostic[] = [];
   const runDiagnostics: RunDiagnostic[] = [];

   const profilePath = requireValue(flags, "profile");
   const registryPath = requireValue(flags, "registry");
   const bindingsPath = requireValue(flags, "bindings");
   const structurePath = requireValue(flags, "input");
   const missing = [
      ["--profile", profilePath],
      ["--registry", registryPath],
      ["--bindings", bindingsPath],
      ["--input", structurePath],
   ].filter(([, v]) => !v);
   if (missing.length > 0) {
      return emit(
         {
            command: "plan",
            exitCode: 2,
            converterDiagnostics: [],
            runDiagnostics: [
               {
                  code: "INPUT_UNREADABLE",
                  severity: "error",
                  message: `plan requires ${missing.map(([f]) => f).join(", ")}.`,
                  subject: { type: "input", id: "plan" },
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

   // Load + schema-validate the three schema'd inputs.
   const loaded = loadProfile(profilePath as string);
   if (!loaded.ok) {
      return emit(
         {
            command: "plan",
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

   const regLoaded = readJsonFile(registryPath as string);
   if (!regLoaded.ok)
      return emitUsage(regLoaded.diagnostic, io, dryRun, asJson);
   const registry = regLoaded.data as CapabilityRegistry;
   const regCheck = validateContract("capability-registry", registry);
   if (!regCheck.valid)
      return emitSchemaInvalid(
         "capability-registry",
         regCheck.errors,
         io,
         dryRun,
         asJson,
      );

   const mapLoaded = readJsonFile(bindingsPath as string);
   if (!mapLoaded.ok)
      return emitUsage(mapLoaded.diagnostic, io, dryRun, asJson);
   const map = mapLoaded.data as BindingMap;
   const mapCheck = validateContract("component-binding-map", map);
   if (!mapCheck.valid)
      return emitSchemaInvalid(
         "component-binding-map",
         mapCheck.errors,
         io,
         dryRun,
         asJson,
      );

   // Structure input: EITHER the materialized PageStructure contract (G2, issue #14) OR the G1
   // harness shape (docs/converter/CONTRACTS.md §4 — still accepted additively until its staged
   // retirement; the existing #9 tests depend on it). Both normalize onto the same resolver input.
   const structLoaded = readJsonFile(structurePath as string);
   if (!structLoaded.ok)
      return emitUsage(structLoaded.diagnostic, io, dryRun, asJson);
   const rawStructure = structLoaded.data;
   const psCheck = validateContract("page-structure", rawStructure);
   let structure: PageStructureHarness;
   if (psCheck.valid) {
      const ps = rawStructure as PageStructure;
      // Identity + provenance pins (fail closed): a PageStructure from another project or pinned
      // to a different registry revision must never resolve here (cross-project/cross-revision).
      if (ps.profileId !== profile.profile.id) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `PageStructure belongs to project '${ps.profileId}' but the profile declares '${profile.profile.id}'.`,
            subject: { type: "input", id: "structure" },
         });
      }
      if (
         ps.inputs.registryRevisionId !== undefined &&
         ps.inputs.registryRevisionId !== registry.source.revisionId
      ) {
         converterDiagnostics.push({
            code: "EVIDENCE_MISSING",
            severity: "error",
            message: `PageStructure is pinned to registry revision '${ps.inputs.registryRevisionId}' but the supplied registry is revision '${registry.source.revisionId}'; re-extract or re-pin before resolving.`,
            subject: { type: "binding", id: map.profileId },
         });
      }
      if (
         ps.inputs.bindingMapContentHash !== undefined &&
         ps.inputs.bindingMapContentHash !== bindingMapPinHash(map)
      ) {
         converterDiagnostics.push({
            code: "EVIDENCE_MISSING",
            severity: "error",
            message: `PageStructure input pin does not match the supplied binding map (hash mismatch); the structure was not derived from this map.`,
            subject: { type: "binding", id: map.profileId },
         });
      }
      if (isBlocking(converterDiagnostics, runDiagnostics)) {
         return emit(
            {
               command: "plan",
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
      structure = pageStructureToHarness(ps, profile.profile.platformId);
   } else {
      structure = rawStructure as PageStructureHarness;
      // Harness shape: enforce the subset of constraints the ResolutionReport depends on.
      const structureDiags = checkStructureShape(structure);
      if (structureDiags.length > 0)
         return emit(
            {
               command: "plan",
               exitCode: 1,
               profileId: profile.profile.id,
               platformId: profile.profile.platformId,
               converterDiagnostics: [],
               runDiagnostics: structureDiags,
               artifacts: [],
               outDir: null,
               dryRun,
               asJson,
            },
            io,
         );
      if (
         structure.profileId !== profile.profile.id ||
         structure.platformId !== profile.profile.platformId
      ) {
         runDiagnostics.push({
            code: "INPUT_CONTRACT_MISMATCH",
            severity: "error",
            message: `Structure identifies '${(structure as PageStructureHarness).profileId}'/'${(structure as PageStructureHarness).platformId}' but the profile declares '${profile.profile.id}'/'${profile.profile.platformId}'.`,
            subject: { type: "input", id: "structure" },
         });
      }
      if (isBlocking(converterDiagnostics, runDiagnostics)) {
         return emit(
            {
               command: "plan",
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

   // Cross-consistency: pinned revisions AND project/platform identity must line up (fail closed).
   // A schema-valid binding map or registry from ANOTHER project must never be resolvable here
   // (Coordinator F3 — project isolation is enforced structurally, not by convention).
   if (map.profileId !== profile.profile.id) {
      runDiagnostics.push({
         code: "INPUT_CONTRACT_MISMATCH",
         severity: "error",
         message: `Binding map belongs to project '${map.profileId}' but the profile declares '${profile.profile.id}'.`,
         subject: { type: "input", id: "bindings" },
      });
   }
   if (map.platformId !== registry.platformId) {
      runDiagnostics.push({
         code: "INPUT_CONTRACT_MISMATCH",
         severity: "error",
         message: `Binding map platform '${map.platformId}' != registry platform '${registry.platformId}'.`,
         subject: { type: "input", id: "bindings" },
      });
   }
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
   if (map.registry.registryRevisionId !== registry.source.revisionId) {
      converterDiagnostics.push({
         code: "EVIDENCE_MISSING",
         severity: "error",
         message: `Binding map is pinned to registry revision '${map.registry.registryRevisionId}' but the supplied registry is revision '${registry.source.revisionId}'; re-pin before resolving.`,
         subject: { type: "binding", id: map.profileId },
      });
   }
   if (isBlocking(converterDiagnostics, runDiagnostics)) {
      return emit(
         {
            command: "plan",
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

   // Deterministic resolution (the tested resolver — no reimplemented mapping logic anywhere).
   const semantic = validateRegistry(registry);
   converterDiagnostics.push(...semantic.diagnostics);
   const bindingCheck = validateBindingMap(registry, map);
   converterDiagnostics.push(...bindingCheck.diagnostics);
   if (isBlocking(converterDiagnostics, runDiagnostics)) {
      return emit(
         {
            command: "plan",
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

   const report = resolveStructure(registry, map, structure, {
      gates: profile.profile.gates,
   });

   const files = [
      { name: "resolution-report.json", content: serializeJson(report) },
   ];
   return emit(
      {
         command: "plan",
         exitCode: report.counts.errors > 0 ? 1 : 0,
         profileId: profile.profile.id,
         platformId: profile.profile.platformId,
         converterDiagnostics,
         runDiagnostics,
         artifacts: [
            artifact("resolution-report", report, {
               file: "resolution-report.json",
            }),
         ],
         files,
         outDir,
         dryRun,
         asJson,
         extraOutput: asJson ? report : undefined,
         summaryLines: [
            `report: ${report.sections.length} section(s), coverage total=${report.coverage.total} (${report.coverage.native} native / ${report.coverage.widget} widget / ${report.coverage["custom-required"]} custom-required)`,
            `proof: claimed=${report.proofStatus.maxClaimedProofLevel} justified=${report.proofStatus.maxJustifiedProofLevel}`,
         ],
      },
      io,
   );
}

// Normalize a materialized PageStructure onto the resolver's harness input. Only elements with a
// component identity are converted — the binding layer resolves component instances; structural
// containers without one are represented in the PageStructure/NodeIR artifacts and resolved by
// the later gated platform-serializer stage, not here.
function pageStructureToHarness(
   ps: PageStructure,
   platformId: string,
): PageStructureHarness {
   return {
      profileId: ps.profileId,
      platformId,
      source: ps.source,
      sections: ps.sections.map((section) => {
         const flat = (
            elements: NonNullable<
               PageStructure["sections"][number]["elements"]
            >,
         ): PageStructureHarness["sections"][number]["elements"] => {
            const out: PageStructureHarness["sections"][number]["elements"] =
               [];
            for (const el of elements) {
               if (!el.sourceComponentId) continue;
               out.push({
                  elementId: el.elementId,
                  sourceComponentId: el.sourceComponentId,
                  ...(el.variantAssignment
                     ? { variantAssignment: el.variantAssignment }
                     : {}),
                  childrenElementIds: (el.childrenElementIds ?? []).filter(
                     () => true,
                  ),
               });
            }
            return out;
         };
         return {
            sectionId: section.sectionId,
            order: section.order,
            name: section.name,
            elements: flat(section.elements),
         };
      }),
   };
}

function checkStructureShape(structure: PageStructureHarness): RunDiagnostic[] {
   const diags: RunDiagnostic[] = [];
   const bad = (id: string, message: string) =>
      diags.push({
         code: "INPUT_CONTRACT_VIOLATION",
         severity: "error",
         message,
         subject: { type: "input", id },
      });
   if (
      !structure ||
      typeof structure !== "object" ||
      !Array.isArray((structure as { sections?: unknown }).sections)
   ) {
      bad(
         "structure",
         "Structure must be an object with a sections array (G1 harness shape).",
      );
      return diags;
   }
   if (
      typeof structure.profileId !== "string" ||
      typeof structure.platformId !== "string" ||
      !structure.source?.revisionId
   ) {
      bad(
         "structure",
         "Structure requires profileId, platformId and source.revisionId.",
      );
   }
   for (const section of structure.sections) {
      if (!/^s-[0-9a-f]{12}$/.test(section.sectionId ?? ""))
         bad(
            section.sectionId ?? "?",
            `Section id '${section.sectionId}' must match ^s-[0-9a-f]{12}$ (report schema requirement).`,
         );
      if (!Array.isArray(section.elements))
         bad(section.sectionId, "Section elements must be an array.");
      else
         for (const el of section.elements) {
            if (!/^n-[0-9a-f]{12}$/.test(el.elementId ?? ""))
               bad(
                  el.elementId ?? "?",
                  `Element id '${el.elementId}' must match ^n-[0-9a-f]{12}$ (harness identity rule).`,
               );
            if (typeof el.sourceComponentId !== "string")
               bad(el.elementId ?? "?", "Element requires sourceComponentId.");
         }
   }
   return diags;
}

function emitUsage(
   diagnostic: RunDiagnostic,
   io: CommandIO,
   dryRun: boolean,
   asJson: boolean,
): 0 | 1 | 2 | 3 {
   return emit(
      {
         command: "plan",
         exitCode: 2,
         converterDiagnostics: [],
         runDiagnostics: [diagnostic],
         artifacts: [],
         outDir: null,
         dryRun,
         asJson,
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
): 0 | 1 | 2 | 3 {
   return emit(
      {
         command: "plan",
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
      },
      io,
   );
}
