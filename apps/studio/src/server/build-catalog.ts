/**
 * [40] DET Studio — read-only build-config catalog (S1).
 *
 * Enumerates caller-configured project/build-config entries from ONE flat
 * directory named by `STUDIO_BUILD_PROJECTS_DIR`. Each entry is a
 * subdirectory `<configId>/build-config.json` (plus an optional
 * `<configId>/project.json` carrying `{label, description}`).
 *
 * Boundaries:
 *  - Studio-side validation is a LIGHT mirror of BuildConfig v1 used ONLY to
 *    render the listing; authoritative validation stays with `det build`
 *    itself (exit 2 INPUT_SCHEMA_INVALID). The JSON Schema is never
 *    duplicated or re-implemented here, and a mirror-accepted config that
 *    det rejects still surfaces det's own diagnostics at build time.
 *  - No hardcoded project ids/paths, no defaults, no network fetches.
 *    Provenance paths are shown AS DECLARED in the config (config-relative
 *    strings) — never resolved or echoed as absolute server paths.
 *  - designSource.mode is schema-const "snapshot": the catalog can only ever
 *    list offline snapshot builds, and the UI must not offer anything else.
 */
import "server-only";

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { DetRunReaderError } from "@/src/shared/contracts";

import { RUN_ID_PATTERN, isInsideDir } from "./artifact-access";
import { echoId, truncateDetail } from "./det-payload-parsing";

export const STUDIO_BUILD_PROJECTS_DIR_ENV = "STUDIO_BUILD_PROJECTS_DIR";

const BUILD_CONFIG_FILE = "build-config.json";
const PROJECT_META_FILE = "project.json";

/**
 * Light zod mirror of schemas/cli/build-config.schema.json v1 — listing only
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
  designSource: { mode: "snapshot"; project: string; designFile: string; designNode: string };
  /** How the capability registry is provided, as declared in the config. */
  inputSource: "capability-probe" | "pinned-registry";
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

export class BuildConfigCatalog {
  private readonly configuredRoot: string;
  private rootRealPromise: Promise<string> | null = null;

  private constructor(configuredRoot: string) {
    this.configuredRoot = configuredRoot;
  }

  /** Validate + realpath the configured root exactly once, then cache it. */
  static async open(configuredRoot: string): Promise<BuildConfigCatalog> {
    if (typeof configuredRoot !== "string" || configuredRoot.trim() === "") {
      throw new DetRunReaderError(
        "not-configured",
        "STUDIO_BUILD_PROJECTS_DIR is set but empty; it must point at a directory of build-config entries."
      );
    }
    const catalog = new BuildConfigCatalog(configuredRoot);
    await catalog.rootReal();
    return catalog;
  }

  private rootReal(): Promise<string> {
    if (this.rootRealPromise === null) {
      this.rootRealPromise = (async () => {
        let resolved: string;
        try {
          resolved = await realpath(this.configuredRoot);
        } catch {
          throw new DetRunReaderError(
            "not-configured",
            "STUDIO_BUILD_PROJECTS_DIR is set but does not point to a readable directory."
          );
        }
        const info = await stat(resolved).catch(() => null);
        if (info === null || !info.isDirectory()) {
          throw new DetRunReaderError(
            "not-configured",
            "STUDIO_BUILD_PROJECTS_DIR is set but is not a directory."
          );
        }
        return resolved;
      })();
    }
    return this.rootRealPromise;
  }

  /** List every entry; broken entries surface in `invalid` with a safe reason. */
  async list(): Promise<BuildConfigCatalogListing> {
    const root = await this.rootReal();
    const dirents = await readdir(root, { withFileTypes: true }).catch(() => {
      throw new DetRunReaderError("not-configured", "STUDIO_BUILD_PROJECTS_DIR is set but cannot be listed.");
    });

    const entries: BuildConfigCatalogEntry[] = [];
    const invalid: BuildConfigCatalogInvalid[] = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      if (!RUN_ID_PATTERN.test(dirent.name)) continue;
      const entryDir = path.join(root, dirent.name);
      const configPath = path.join(entryDir, BUILD_CONFIG_FILE);
      const configInfo = await stat(configPath).catch(() => null);
      if (configInfo === null || !configInfo.isFile()) continue; // no build-config.json → not an entry

      try {
        const raw = await readFile(configPath, "utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          invalid.push({ configId: dirent.name, reason: `${BUILD_CONFIG_FILE}: is not valid JSON.` });
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
        const metaRaw = await readFile(path.join(entryDir, PROJECT_META_FILE), "utf8").catch(() => null);
        if (metaRaw !== null) {
          try {
            const meta = ProjectMetaSchema.parse(JSON.parse(metaRaw));
            if (meta.label !== undefined) label = meta.label;
            if (meta.description !== undefined) description = meta.description;
          } catch {
            // ignore metadata problems: listing truth comes from build-config.json
          }
        }

        entries.push({
          configId: dirent.name,
          label,
          ...(description === undefined ? {} : { description }),
          profileId: config.profileId,
          designSource: { ...config.designSource },
          inputSource: config.capabilityProbe ? "capability-probe" : "pinned-registry",
          declaredPaths: {
            profile: config.profile,
            ...(config.capabilityProbe ? { probeProject: config.capabilityProbe.project } : {}),
            ...(config.registry ? { registry: config.registry } : {}),
            bindings: config.bindings,
            content: config.content,
            ...(config.projection ? { projection: config.projection } : {}),
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

    entries.sort((a, b) => a.configId.localeCompare(b.configId));
    invalid.sort((a, b) => a.configId.localeCompare(b.configId));
    return { entries, invalid };
  }

  /**
   * Resolve one entry's config file for the runner. The id is pattern-checked
   * and the resolved path must realpath back inside the catalog root; the
   * file must exist. Throws DetRunReaderError("run-not-found") for unknown
   * ids (the UI maps it to 404) — messages name only the id, never server paths.
   */
  async resolveConfigPath(configId: string): Promise<string> {
    const root = await this.rootReal();
    if (typeof configId !== "string" || !RUN_ID_PATTERN.test(configId)) {
      throw new DetRunReaderError(
        "run-not-found",
        `No build-config entry matching the requested id "${echoId(configId)}".`
      );
    }
    const joined = path.join(root, configId, BUILD_CONFIG_FILE);
    const info = await stat(joined).catch(() => null);
    if (info === null || !info.isFile()) {
      throw new DetRunReaderError(
        "run-not-found",
        `No build-config entry "${echoId(configId)}" in the configured ${STUDIO_BUILD_PROJECTS_DIR_ENV} catalog.`
      );
    }
    let resolved: string;
    try {
      resolved = await realpath(joined);
    } catch {
      throw new DetRunReaderError("path-refused", "The build-config path was refused: it is not readable.");
    }
    if (!isInsideDir(resolved, root)) {
      throw new DetRunReaderError(
        "path-refused",
        "The build-config path was refused: it resolves outside the configured catalog directory."
      );
    }
    return resolved;
  }
}
