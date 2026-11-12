/**
 * [40] DET Studio — read-only build-config catalog (S1).
 *
 * Lists build-config entries from a set of flat catalog roots. Each entry is
 * a subdirectory `<configId>/build-config.json` (plus an optional
 * `<configId>/project.json` carrying `{label, description}`).
 *
 * Roots ([58]):
 *  - the CANONICAL repository catalogue `<repoRoot>/resources/examples/build` — the
 *    committed, revision-pinned examples discovered IN PLACE (never copied
 *    into `out/`; entries are read-only inputs, builds write only to the
 *    configured runs root). Located from this module's own layout with a
 *    cwd fallback, both validated against the checkout shape — a relocated
 *    Studio server simply has no repository catalogue.
 *  - ONE caller-configured directory named by `STUDIO_BUILD_PROJECTS_DIR`
 *    (optional since [58]: it ADDS the caller's own entries; a configured
 *    entry with the same id overrides the repository example).
 *
 * Boundaries:
 *  - Studio-side validation is a LIGHT mirror of BuildConfig v1 used ONLY to
 *    render the listing; authoritative validation stays with `det build`
 *    itself (exit 2 INPUT_SCHEMA_INVALID). The JSON Schema is never
 *    duplicated or re-implemented here, and a mirror-accepted config that
 *    det rejects still surfaces det's own diagnostics at build time.
 *  - No hardcoded project ids/paths, no defaults beyond the repository
 *    catalogue location, no network fetches. Provenance paths are shown AS
 *    DECLARED in the config (config-relative strings) — never resolved or
 *    echoed as absolute server paths.
 *  - Only directories that directly contain a `build-config.json` are
 *    entries; unrelated fixture/example directories are never promoted into
 *    the catalogue.
 *  - designSource.mode is schema-const "snapshot": the catalog can only ever
 *    list offline snapshot builds, and the UI must not offer anything else.
 */
import "server-only";

import { existsSync, statSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";

import { RUN_ID_PATTERN, isInsideDir } from "./artifact-access";
import { echoId, truncateDetail } from "./det-payload-parsing";

export const STUDIO_BUILD_PROJECTS_DIR_ENV = "STUDIO_BUILD_PROJECTS_DIR";

const BUILD_CONFIG_FILE = "build-config.json";
const PROJECT_META_FILE = "project.json";

/** The canonical repository catalogue, relative to the checkout root ([68] resources/ layout). */
const REPO_CATALOG_SEGMENTS = ["resources", "examples", "build"] as const;

/**
 * [58] Locate the checkout root for the canonical repository catalogue: from
 * this module's own location (`src/modules/studio/server` → checkout root, the same
 * bundler contract as the runner's STUDIO_APP_ROOT) with a cwd-based fallback
 * (Next runs with cwd = checkout root in the [63] single-application layout).
 * Every candidate is validated against the checkout shape (package.json +
 * resources/examples/build) so an accidental match can never promote an unrelated
 * directory. No match → `null` (a relocated Studio server lists only
 * configured entries).
 */
function findRepoCatalogRoot(): string | null {
   const moduleDir = path.dirname(fileURLToPath(import.meta.url));
   const candidates = [
      path.resolve(moduleDir, "..", "..", "..", ".."), // src/modules/studio/server → studio → modules → src → checkout root ([68] 4-ups now exact)
      path.resolve(process.cwd()), // next runs with cwd = checkout root in this layout
   ];
   for (const candidate of candidates) {
      if (!existsSync(path.join(candidate, "package.json"))) continue;
      const info = statSync(path.join(candidate, ...REPO_CATALOG_SEGMENTS), {
         throwIfNoEntry: false,
      });
      if (info !== undefined && info.isDirectory()) return candidate;
   }
   return null;
}

const REPO_ROOT = findRepoCatalogRoot();

/**
 * Light zod mirror of resources/schemas/cli/build-config.schema.json v1 — listing only
 * (display fields required; unknown keys ignored; the engine owns the
 * authoritative contract).
 */
const BuildConfigListingSchema = z.object({
   schemaVersion: z.literal(1),
   profileId: z.string().min(1),
   profile: z.string().min(1),
   designSource: z.object({
      mode: z.literal("snapshot"),
      project: z.string().min(1),
      designFile: z.string().min(1),
      designNode: z.string().min(1),
   }),
   capabilityProbe: z.object({ project: z.string().min(1) }).optional(),
   registry: z.string().min(1).optional(),
   bindings: z.string().min(1),
   content: z.string().min(1),
   projection: z.string().min(1).optional(),
   outputDir: z.string().optional(),
});

const ProjectMetaSchema = z.object({
   label: z.string().min(1).optional(),
   description: z.string().min(1).optional(),
});

export interface BuildConfigCatalogEntry {
   configId: string;
   /** project.json label, else the configId. */
   label: string;
   description?: string;
   profileId: string;
   designSource: {
      mode: "snapshot";
      project: string;
      designFile: string;
      designNode: string;
   };
   /** How the capability registry is provided, as declared in the config. */
   inputSource: "capability-probe" | "pinned-registry";
   /**
    * [58] Where the entry was discovered: a committed repository example
    * (`resources/examples/build`, read-only, in place) or the caller-configured dir.
    */
   origin: "repository" | "configured";
   /** Declared config-relative paths, shown verbatim as provenance. */
   declaredPaths: {
      profile: string;
      registry?: string;
      probeProject?: string;
      bindings: string;
      content: string;
      projection?: string;
   };
}

export interface BuildConfigCatalogInvalid {
   configId: string;
   /** Safe, truncated reason (field-scoped; no absolute paths echoed). */
   reason: string;
}

export interface BuildConfigCatalogListing {
   entries: BuildConfigCatalogEntry[];
   invalid: BuildConfigCatalogInvalid[];
}

interface CatalogRoot {
   origin: "repository" | "configured";
   /** Realpath'd directory this root was validated against. */
   resolved: string;
}

export class BuildConfigCatalog {
   /**
    * Configured root FIRST, repository catalogue second: the first root that
    * contains `<id>/build-config.json` owns the id, in both `list()` (as a
    * valid entry, or as an invalid notice when malformed — C58-2) and
    * `resolveConfigPath()`. Listing and resolution can therefore never
    * disagree about which file an id builds from.
    */
   private readonly roots: CatalogRoot[];

   private constructor(roots: CatalogRoot[]) {
      this.roots = roots;
   }

   /**
    * Open the catalog: the canonical repository catalogue (when this is a
    * checkout layout) plus — when set — the caller-configured
    * STUDIO_BUILD_PROJECTS_DIR directory. An explicitly set but unusable
    * configured dir still fails loudly (fail-closed); an unset one simply
    * means "repository examples only". Env values are never echoed into
    * error messages.
    */
   static async open(
      configuredRoot: string | undefined | null,
   ): Promise<BuildConfigCatalog> {
      const roots: CatalogRoot[] = [];
      const configured =
         typeof configuredRoot === "string" ? configuredRoot.trim() : "";
      if (configured !== "") {
         let resolved: string;
         try {
            resolved = await realpath(configured);
         } catch {
            throw new DetRunReaderError(
               "not-configured",
               `${STUDIO_BUILD_PROJECTS_DIR_ENV} is set but does not point to a readable directory.`,
            );
         }
         const info = await stat(resolved).catch(() => null);
         if (info === null || !info.isDirectory()) {
            throw new DetRunReaderError(
               "not-configured",
               `${STUDIO_BUILD_PROJECTS_DIR_ENV} is set but is not a directory.`,
            );
         }
         roots.push({ origin: "configured", resolved });
      }
      if (REPO_ROOT !== null) {
         // Validated at module init (isDirectory); realpath in case the checkout
         // itself is reached through a symlink.
         const resolved = await realpath(
            path.join(REPO_ROOT, ...REPO_CATALOG_SEGMENTS),
         );
         roots.push({ origin: "repository", resolved });
      }
      if (roots.length === 0) {
         throw new DetRunReaderError(
            "not-configured",
            "No build-config catalog is available: the repository catalogue is not reachable and STUDIO_BUILD_PROJECTS_DIR is not set.",
         );
      }
      return new BuildConfigCatalog(roots);
   }

   /**
    * List every entry; broken entries surface in `invalid` with a safe reason.
    * One consistent precedence rule for listing AND resolution (C58-2): the
    * first root (configured before repository) that contains
    * `<id>/build-config.json` OWNS the id — as a buildable entry when valid,
    * as an explicit invalid notice when malformed. A broken configured copy
    * therefore shadows the repository example instead of leaving the UI
    * advertising a repository build whose Build would resolve to the broken
    * override file.
    */
   async list(): Promise<BuildConfigCatalogListing> {
      const entries = new Map<string, BuildConfigCatalogEntry>();
      const invalid: BuildConfigCatalogInvalid[] = [];
      const claimed = new Set<string>();
      for (const root of this.roots) {
         await this.listRoot(root, entries, invalid, claimed);
      }
      const merged = [...entries.values()];
      merged.sort((a, b) => a.configId.localeCompare(b.configId));
      invalid.sort((a, b) => a.configId.localeCompare(b.configId));
      return { entries: merged, invalid };
   }

   /**
    * Scan one root; ids already claimed by an earlier root (configured roots
    * run first) are skipped — valid entry or invalid notice.
    */
   private async listRoot(
      root: CatalogRoot,
      entries: Map<string, BuildConfigCatalogEntry>,
      invalid: BuildConfigCatalogInvalid[],
      claimed: Set<string>,
   ): Promise<void> {
      const rootDir = root.resolved;
      const dirents = await readdir(rootDir, { withFileTypes: true }).catch(
         () => {
            throw new DetRunReaderError(
               "not-configured",
               root.origin === "configured"
                  ? `${STUDIO_BUILD_PROJECTS_DIR_ENV} is set but cannot be listed.`
                  : "The repository build-config catalogue cannot be listed.",
            );
         },
      );

      for (const dirent of dirents) {
         if (!dirent.isDirectory()) continue;
         if (!RUN_ID_PATTERN.test(dirent.name)) continue;
         if (entries.has(dirent.name) || claimed.has(dirent.name)) continue; // earlier root owns this id
         const entryDir = path.join(rootDir, dirent.name);
         const configPath = path.join(entryDir, BUILD_CONFIG_FILE);
         const configInfo = await stat(configPath).catch(() => null);
         if (configInfo === null || !configInfo.isFile()) continue; // no build-config.json → not an entry
         claimed.add(dirent.name); // the dir claims the id even when the config turns out malformed

         try {
            const raw = await readFile(configPath, "utf8");
            let parsed: unknown;
            try {
               parsed = JSON.parse(raw);
            } catch {
               invalid.push({
                  configId: dirent.name,
                  reason: `${BUILD_CONFIG_FILE}: is not valid JSON.`,
               });
               continue;
            }
            const listing = BuildConfigListingSchema.safeParse(parsed);
            if (!listing.success) {
               const first = listing.error.issues[0];
               invalid.push({
                  configId: dirent.name,
                  reason: `${BUILD_CONFIG_FILE}: ${first?.path?.join(".") ?? "document"} ${first?.message ?? "fails the listing mirror"} (authoritative validation happens in det build).`,
               });
               continue;
            }
            const config = listing.data;

            // Optional project.json metadata; unreadable/invalid metadata falls
            // back to the configId — the build config itself stays listable.
            let label: string = dirent.name;
            let description: string | undefined;
            const metaRaw = await readFile(
               path.join(entryDir, PROJECT_META_FILE),
               "utf8",
            ).catch(() => null);
            if (metaRaw !== null) {
               try {
                  const meta = ProjectMetaSchema.parse(JSON.parse(metaRaw));
                  if (meta.label !== undefined) label = meta.label;
                  if (meta.description !== undefined)
                     description = meta.description;
               } catch {
                  // ignore metadata problems: listing truth comes from build-config.json
               }
            }

            entries.set(dirent.name, {
               configId: dirent.name,
               label,
               ...(description === undefined ? {} : { description }),
               profileId: config.profileId,
               designSource: { ...config.designSource },
               inputSource: config.capabilityProbe
                  ? "capability-probe"
                  : "pinned-registry",
               origin: root.origin,
               declaredPaths: {
                  profile: config.profile,
                  ...(config.capabilityProbe
                     ? { probeProject: config.capabilityProbe.project }
                     : {}),
                  ...(config.registry ? { registry: config.registry } : {}),
                  bindings: config.bindings,
                  content: config.content,
                  ...(config.projection
                     ? { projection: config.projection }
                     : {}),
               },
            });
         } catch (error) {
            if (error instanceof DetRunReaderError) throw error;
            invalid.push({
               configId: dirent.name,
               reason: `entry could not be read (server-side read failure): ${error instanceof Error ? truncateDetail(error.message.slice(0, 60)) : "unknown"}`,
            });
         }
      }
   }

   /**
    * Resolve one entry's config file for the runner. The id is pattern-checked
    * and the resolved path must realpath back inside its catalog root; the
    * file must exist. Configured roots are checked first (a configured entry
    * with the same id wins over the repository example). Throws
    * DetRunReaderError("run-not-found") for unknown ids (the UI maps it to
    * 404) — messages name only the id, never server paths.
    */
   async resolveConfigPath(configId: string): Promise<string> {
      if (typeof configId !== "string" || !RUN_ID_PATTERN.test(configId)) {
         throw new DetRunReaderError(
            "run-not-found",
            `No build-config entry matching the requested id "${echoId(configId)}".`,
         );
      }
      for (const root of this.roots) {
         const joined = path.join(root.resolved, configId, BUILD_CONFIG_FILE);
         const info = await stat(joined).catch(() => null);
         if (info === null || !info.isFile()) continue;
         let resolved: string;
         try {
            resolved = await realpath(joined);
         } catch {
            throw new DetRunReaderError(
               "path-refused",
               "The build-config path was refused: it is not readable.",
            );
         }
         if (!isInsideDir(resolved, root.resolved)) {
            throw new DetRunReaderError(
               "path-refused",
               "The build-config path was refused: it resolves outside its catalog directory.",
            );
         }
         return resolved;
      }
      throw new DetRunReaderError(
         "run-not-found",
         `No build-config entry "${echoId(configId)}" in the build-config catalog.`,
      );
   }
}
