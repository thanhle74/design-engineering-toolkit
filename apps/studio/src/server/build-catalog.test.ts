/**
 * [40] Build-config catalog tests — listing integrity, entry validation
 * (light listing mirror only), safe id resolution and containment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { BuildConfigCatalog } from "./build-catalog";

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
  it("reports not-configured for an unset/empty/invalid root", async () => {
    await expect(BuildConfigCatalog.open("")).rejects.toMatchObject({ code: "not-configured" });
    await expect(
      BuildConfigCatalog.open(path.join(projectsRoot, "missing-dir"))
    ).rejects.toMatchObject({ code: "not-configured" });
    await writeFile(path.join(projectsRoot, "afile"), "not a dir", "utf8");
    await expect(BuildConfigCatalog.open(path.join(projectsRoot, "afile"))).rejects.toMatchObject({
      code: "not-configured",
    });
  });
});

describe("listing", () => {
  it("lists a valid entry with optional project.json metadata", async () => {
    await writeJson(path.join(projectsRoot, "g28-example", "build-config.json"), VALID_CONFIG);
    await writeJson(path.join(projectsRoot, "g28-example", "project.json"), {
      label: "G28 example",
      description: "The accepted offline example build.",
    });

    const catalog = await BuildConfigCatalog.open(projectsRoot);
    const listing = await catalog.list();
    expect(listing.invalid).toHaveLength(0);
    expect(listing.entries).toHaveLength(1);
    const entry = listing.entries[0]!;
    expect(entry.configId).toBe("g28-example");
    expect(entry.label).toBe("G28 example");
    expect(entry.description).toBe("The accepted offline example build.");
    expect(entry.profileId).toBe("g28-home-preview");
    expect(entry.designSource.mode).toBe("snapshot");
    expect(entry.designSource.designNode).toBe("245:2");
    expect(entry.inputSource).toBe("capability-probe");
    // declared paths are echoed verbatim, never resolved to absolutes
    expect(entry.declaredPaths.profile).toBe("../../tests/fixtures/profile.json");
    expect(entry.declaredPaths.probeProject).toBe("../../tests/fixtures/probe");
  });

  it("falls back to pinned-registry and configId label without metadata", async () => {
    await writeJson(path.join(projectsRoot, "pinned", "build-config.json"), {
      ...VALID_CONFIG,
      capabilityProbe: undefined,
      registry: "../../tests/fixtures/registry.json",
    });
    const catalog = await BuildConfigCatalog.open(projectsRoot);
    const listing = await catalog.list();
    expect(listing.entries[0]!.inputSource).toBe("pinned-registry");
    expect(listing.entries[0]!.label).toBe("pinned");
    expect(listing.entries[0]!.declaredPaths.registry).toBe("../../tests/fixtures/registry.json");
  });

  it("surfaces broken entries in invalid without hiding the rest", async () => {
    await writeJson(path.join(projectsRoot, "good", "build-config.json"), VALID_CONFIG);
    await mkdir(path.join(projectsRoot, "badjson"), { recursive: true });
    await writeFile(path.join(projectsRoot, "badjson", "build-config.json"), "{not json", "utf8");
    await writeJson(path.join(projectsRoot, "missingfield", "build-config.json"), {
      schemaVersion: 1,
      profileId: "x",
    });
    // no build-config.json → not an entry at all
    await mkdir(path.join(projectsRoot, "emptydir"), { recursive: true });
    // bad id pattern → structurally ignored
    await mkdir(path.join(projectsRoot, ".hidden"), { recursive: true });

    const catalog = await BuildConfigCatalog.open(projectsRoot);
    const listing = await catalog.list();
    expect(listing.entries.map((e) => e.configId)).toEqual(["good"]);
    expect(listing.invalid.map((e) => e.configId).sort()).toEqual(["badjson", "missingfield"]);
    // reasons are safe: no absolute server paths
    for (const bad of listing.invalid) {
      expect(bad.reason).not.toContain(path.sep === "/" ? "/tmp" : "\\tmp");
      expect(bad.reason).not.toMatch(projectsRoot);
    }
  });
});

describe("resolveConfigPath", () => {
  it("resolves an existing entry inside the root", async () => {
    await writeJson(path.join(projectsRoot, "g28-example", "build-config.json"), VALID_CONFIG);
    const catalog = await BuildConfigCatalog.open(projectsRoot);
    const resolved = await catalog.resolveConfigPath("g28-example");
    expect(resolved.endsWith(path.join("g28-example", "build-config.json"))).toBe(true);
    expect(resolved.startsWith(projectsRoot)).toBe(true);
  });

  it("throws run-not-found for unknown or unsafe ids (never echoes server paths)", async () => {
    const catalog = await BuildConfigCatalog.open(projectsRoot);
    await expect(catalog.resolveConfigPath("nope")).rejects.toMatchObject({ code: "run-not-found" });
    await expect(catalog.resolveConfigPath("../escape")).rejects.toMatchObject({
      code: "run-not-found",
    });
    await expect(catalog.resolveConfigPath("a/b")).rejects.toMatchObject({ code: "run-not-found" });
  });

  it("refuses a symlinked config that resolves outside the catalog root", async () => {
    await writeJson(path.join(projectsRoot, "real-entry", "build-config.json"), VALID_CONFIG);
    const outside = await mkdtemp(path.join(os.tmpdir(), "det40-outside-"));
    const outsideConfig = path.join(outside, "build-config.json");
    await writeFile(outsideConfig, JSON.stringify(VALID_CONFIG), "utf8");
    await mkdir(path.join(projectsRoot, "linked-entry"), { recursive: true });
    await symlink(outsideConfig, path.join(projectsRoot, "linked-entry", "build-config.json"));

    const catalog = await BuildConfigCatalog.open(projectsRoot);
    await expect(catalog.resolveConfigPath("linked-entry")).rejects.toMatchObject({
      code: "path-refused",
    });
    await rm(outside, { recursive: true, force: true });
  });
});
