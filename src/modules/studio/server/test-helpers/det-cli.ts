/**
 * [40] Studio test helper — drive the REAL det CLI for build-control E2E.
 *
 * The build-control tests deliberately run the shipped offline engine
 * (`node bin/det.js build --config examples/build/project.example.json`,
 * ~1s, fully offline) instead of synthetic fixtures, so verified downloads,
 * stage truth and tamper refusals are proven against actual engine output
 * exactly as issue #40 requires. Dist must be built first — the helper fails
 * with a directing message, never a fake pass.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo root, resolved by walking up from this helper dir
 * (src/modules/studio/server/test-helpers → 5 levels to the checkout root) and
 * verified against bin/det.js so a moved layout fails loudly, not silently.
 */
const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HELPER_DIR, "..", "..", "..", "..", "..");

export const DET_ENTRY = path.join(REPO_ROOT, "bin", "det.js");
export const EXAMPLE_BUILD_CONFIG = path.join(REPO_ROOT, "examples", "build", "project.example.json");

/** G28 fixture inputs ([68]: fixtures co-located with the owning magento module's suites). */
export const G28_FIXTURE_DIR = path.join(
  REPO_ROOT,
  "src",
  "modules",
  "magento",
  "__tests__",
  "fixtures",
  "g28-home-design-source"
);
/** G3 probe fixture, same co-location rule. */
const G3_PROBE_DIR = path.join(
  REPO_ROOT,
  "src",
  "modules",
  "magento",
  "__tests__",
  "fixtures",
  "g3-magento-like"
);

export function requireDetCli(): void {
  if (!existsSync(DET_ENTRY)) {
    throw new Error(`det CLI entry not found at ${DET_ENTRY} (expected the toolkit checkout layout).`);
  }
  if (!existsSync(path.join(REPO_ROOT, "dist"))) {
    throw new Error(
      "det CLI dist/ is missing (expected at <root>/dist — [63] single-application layout): run `npm ci && npm run build` at the REPO ROOT before the studio test suite (see docs/studio/README.md → Local build-control setup). The [40] build-control tests drive the real CLI."
    );
  }
}

/** Run the accepted example build into `outDir`; returns the CLI exit code. */
export function runExampleBuild(outDir: string): number {
  requireDetCli();
  const proc = spawnSync(
    process.execPath,
    [DET_ENTRY, "build", "--config", EXAMPLE_BUILD_CONFIG, "--out", outDir, "--json"],
    { encoding: "utf8", timeout: 60_000 }
  );
  if (proc.error !== undefined) throw proc.error;
  return proc.status ?? -1;
}

/** Build the example config content pointing at repo fixtures (runtime tmp configs). */
export function exampleBuildConfigBody(): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      profileId: "g28-home-preview",
      profile: path.join(G28_FIXTURE_DIR, "profile-g28-home-fixture.json"),
      designSource: {
        mode: "snapshot",
        project: G28_FIXTURE_DIR,
        designFile: "design-tree-home-desktop.fixture.json",
        designNode: "245:2",
      },
      capabilityProbe: { project: G3_PROBE_DIR },
      bindings: path.join(G28_FIXTURE_DIR, "g28-component-bindings.fixture.json"),
      content: path.join(G28_FIXTURE_DIR, "g28-home-content.fixture.json"),
      projection: path.join(G28_FIXTURE_DIR, "g28-home-projection.fixture.json"),
    },
    null,
    2
  );
}
