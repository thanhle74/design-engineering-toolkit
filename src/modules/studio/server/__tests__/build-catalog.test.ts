/**
 * [40] Build-config catalog tests — listing integrity, entry validation
 * (light listing mirror only), safe id resolution and containment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";

vi.mock("server-only", () => ({}));

import { BuildConfigCatalog } from "../build-catalog";

let projectsRoot: string;

const VALID_CONFIG = {
   schemaVersion: 1,
   profileId: "g28-home-preview",
   profile: "../../tests/fixtures/profile.json",
   designSource: {
      mode: "snapshot",
      project: "../../tests/fixtures/project",
      designFile: "design-tree-home-desktop.fixture.json",
      designNode: "245:2",
   },
   capabilityProbe: { project: "../../tests/fixtures/probe" },
   bindings: "../../tests/fixtures/bindings.json",
   content: "../../tests/fixtures/content.json",
   projection: "../../tests/fixtures/projection.json",
};

async function writeJson(filePath: string, data: unknown): Promise<void> {
   await mkdir(path.dirname(filePath), { recursive: true });
   await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

beforeEach(async () => {
   projectsRoot = await mkdtemp(path.join(os.tmpdir(), "det40-catalog-"));
});

afterEach(async () => {
   await rm(projectsRoot, { recursive: true, force: true });
});

describe("catalog configuration", () => {
   it("fails closed for an explicitly invalid configured root", async () => {
      await expect(
         BuildConfigCatalog.open(path.join(projectsRoot, "missing-dir")),
      ).rejects.toMatchObject({ code: "not-configured" });
      await writeFile(path.join(projectsRoot, "afile"), "not a dir", "utf8");
      await expect(
         BuildConfigCatalog.open(path.join(projectsRoot, "afile")),
      ).rejects.toMatchObject({
         code: "not-configured",
      });
   });
});

describe("repository catalogue ([58])", () => {
   it("lists the committed real-derived example IN PLACE when no env dir is set", async () => {
      const catalog = await BuildConfigCatalog.open("");
      const listing = await catalog.list();
      const entry = listing.entries.find(
         (e) => e.configId === "slaunchpad-home-real-derived",
      );
      expect(entry).toBeDefined();
      expect(entry!.origin).toBe("repository");
      expect(entry!.label).toContain("real-derived"); // committed project.json label
      expect(entry!.inputSource).toBe("pinned-registry");
      expect(entry!.profileId).toBe("slaunchpad-fashion");
      // provenance paths stay as declared (config-relative), never absolute server paths
      expect(entry!.declaredPaths.profile).toBe("profile.json");
      expect(entry!.declaredPaths.registry).toBe("capability-registry.json");
      expect(JSON.stringify(entry!)).not.toContain(os.tmpdir());
   });

   it("resolves the repository entry's config inside resources/examples/build", async () => {
      const catalog = await BuildConfigCatalog.open("");
      const resolved = await catalog.resolveConfigPath(
         "slaunchpad-home-real-derived",
      );
      expect(resolved).toContain(
         path.join(
            "examples",
            "build",
            "slaunchpad-home-real-derived",
            "build-config.json",
         ),
      );
      expect(fs.existsSync(resolved)).toBe(true);
   });

   it("a configured dir adds its entries alongside the repository catalogue", async () => {
      await writeJson(
         path.join(projectsRoot, "mine", "build-config.json"),
         VALID_CONFIG,
      );
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      const mine = listing.entries.find((e) => e.configId === "mine");
      expect(mine).toBeDefined();
      expect(mine!.origin).toBe("configured");
      expect(listing.entries.some((e) => e.origin === "repository")).toBe(true);
   });

   it("a configured entry with the same id overrides the repository example", async () => {
      await writeJson(
         path.join(
            projectsRoot,
            "slaunchpad-home-real-derived",
            "build-config.json",
         ),
         VALID_CONFIG,
      );
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      const duplicates = listing.entries.filter(
         (e) => e.configId === "slaunchpad-home-real-derived",
      );
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.origin).toBe("configured");
      const resolved = await catalog.resolveConfigPath(
         "slaunchpad-home-real-derived",
      );
      expect(resolved.startsWith(projectsRoot)).toBe(true);
   });

   // C58-2 regression: a MALFORMED configured copy must claim the id the same
   // way a valid one does — the listing then surfaces only the invalid notice
   // and never advertises the repository example as buildable, while
   // resolution still resolves to that same (rejected) configured file.
   // Listing and resolution can never silently disagree about the config.
   it("an invalid configured duplicate claims the id: no repo entry is advertised for a build that would read the broken override", async () => {
      const dupDir = path.join(projectsRoot, "slaunchpad-home-real-derived");
      await mkdir(dupDir, { recursive: true });
      await writeFile(
         path.join(dupDir, "build-config.json"),
         "{broken json",
         "utf8",
      );

      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      // the listing never offers a buildable entry whose Build would resolve to the invalid override
      expect(
         listing.entries.some(
            (e) => e.configId === "slaunchpad-home-real-derived",
         ),
      ).toBe(false);
      // the malformed configured copy is surfaced explicitly, with a safe reason
      const surfaced = listing.invalid.find(
         (e) => e.configId === "slaunchpad-home-real-derived",
      );
      expect(surfaced).toBeDefined();
      expect(surfaced!.reason).toContain("build-config.json");
      expect(surfaced!.reason).not.toContain(projectsRoot);
      // resolution stays consistent with the listing: the id resolves to the SAME
      // rejected configured file, never silently to the repository copy
      const resolved = await catalog.resolveConfigPath(
         "slaunchpad-home-real-derived",
      );
      expect(resolved.startsWith(projectsRoot)).toBe(true);
   });

   it("still resolves other entries and stays fail-closed on ids across the union", async () => {
      await writeJson(
         path.join(projectsRoot, "g28-example", "build-config.json"),
         VALID_CONFIG,
      );
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      await expect(catalog.resolveConfigPath("nope")).rejects.toMatchObject({
         code: "run-not-found",
      });
   });
});

describe("listing", () => {
   it("lists a valid entry with optional project.json metadata", async () => {
      await writeJson(
         path.join(projectsRoot, "g28-example", "build-config.json"),
         VALID_CONFIG,
      );
      await writeJson(path.join(projectsRoot, "g28-example", "project.json"), {
         label: "G28 example",
         description: "The accepted offline example build.",
      });

      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      expect(listing.invalid).toHaveLength(0);
      // [58] the committed repository catalogue rides alongside the configured dir
      // ([72] adds the offline-only extended-variants entry)
      expect(listing.entries.map((e) => e.configId).sort()).toEqual([
         "g28-example",
         "slaunchpad-home-72-extended",
         "slaunchpad-home-real-derived",
      ]);
      const entry = listing.entries.find((e) => e.configId === "g28-example")!;
      expect(entry.origin).toBe("configured");
      expect(entry.label).toBe("G28 example");
      expect(entry.description).toBe("The accepted offline example build.");
      expect(entry.profileId).toBe("g28-home-preview");
      expect(entry.designSource.mode).toBe("snapshot");
      expect(entry.designSource.designNode).toBe("245:2");
      expect(entry.inputSource).toBe("capability-probe");
      // declared paths are echoed verbatim, never resolved to absolutes
      expect(entry.declaredPaths.profile).toBe(
         "../../tests/fixtures/profile.json",
      );
      expect(entry.declaredPaths.probeProject).toBe(
         "../../tests/fixtures/probe",
      );
   });

   it("falls back to pinned-registry and configId label without metadata", async () => {
      await writeJson(path.join(projectsRoot, "pinned", "build-config.json"), {
         ...VALID_CONFIG,
         capabilityProbe: undefined,
         registry: "../../tests/fixtures/registry.json",
      });
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      const entry = listing.entries.find((e) => e.configId === "pinned")!;
      expect(entry.inputSource).toBe("pinned-registry");
      expect(entry.label).toBe("pinned");
      expect(entry.declaredPaths.registry).toBe(
         "../../tests/fixtures/registry.json",
      );
   });

   it("surfaces broken entries in invalid without hiding the rest", async () => {
      await writeJson(
         path.join(projectsRoot, "good", "build-config.json"),
         VALID_CONFIG,
      );
      await mkdir(path.join(projectsRoot, "badjson"), { recursive: true });
      await writeFile(
         path.join(projectsRoot, "badjson", "build-config.json"),
         "{not json",
         "utf8",
      );
      await writeJson(
         path.join(projectsRoot, "missingfield", "build-config.json"),
         {
            schemaVersion: 1,
            profileId: "x",
         },
      );
      // no build-config.json → not an entry at all
      await mkdir(path.join(projectsRoot, "emptydir"), { recursive: true });
      // bad id pattern → structurally ignored
      await mkdir(path.join(projectsRoot, ".hidden"), { recursive: true });

      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const listing = await catalog.list();
      expect(listing.entries.map((e) => e.configId)).toEqual([
         "good",
         "slaunchpad-home-72-extended",
         "slaunchpad-home-real-derived",
      ]);
      expect(listing.invalid.map((e) => e.configId).sort()).toEqual([
         "badjson",
         "missingfield",
      ]);
      // reasons are safe: no absolute server paths
      for (const bad of listing.invalid) {
         expect(bad.reason).not.toContain(path.sep === "/" ? "/tmp" : "\\tmp");
         expect(bad.reason).not.toMatch(projectsRoot);
      }
   });
});

describe("resolveConfigPath", () => {
   it("resolves an existing entry inside the root", async () => {
      await writeJson(
         path.join(projectsRoot, "g28-example", "build-config.json"),
         VALID_CONFIG,
      );
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      const resolved = await catalog.resolveConfigPath("g28-example");
      expect(
         resolved.endsWith(path.join("g28-example", "build-config.json")),
      ).toBe(true);
      expect(resolved.startsWith(projectsRoot)).toBe(true);
   });

   it("throws run-not-found for unknown or unsafe ids (never echoes server paths)", async () => {
      const catalog = await BuildConfigCatalog.open(projectsRoot);
      await expect(catalog.resolveConfigPath("nope")).rejects.toMatchObject({
         code: "run-not-found",
      });
      await expect(
         catalog.resolveConfigPath("../escape"),
      ).rejects.toMatchObject({
         code: "run-not-found",
      });
      await expect(catalog.resolveConfigPath("a/b")).rejects.toMatchObject({
         code: "run-not-found",
      });
   });

   it("refuses a symlinked config that resolves outside the catalog root", async () => {
      await writeJson(
         path.join(projectsRoot, "real-entry", "build-config.json"),
         VALID_CONFIG,
      );
      const outside = await mkdtemp(path.join(os.tmpdir(), "det40-outside-"));
      const outsideConfig = path.join(outside, "build-config.json");
      await writeFile(outsideConfig, JSON.stringify(VALID_CONFIG), "utf8");
      await mkdir(path.join(projectsRoot, "linked-entry"), { recursive: true });
      await symlink(
         outsideConfig,
         path.join(projectsRoot, "linked-entry", "build-config.json"),
      );

      const catalog = await BuildConfigCatalog.open(projectsRoot);
      await expect(
         catalog.resolveConfigPath("linked-entry"),
      ).rejects.toMatchObject({
         code: "path-refused",
      });
      await rm(outside, { recursive: true, force: true });
   });
});
