/**
 * [50] BuildRunner × catalogue integration — the REAL runner (real spawn,
 * real example build, same as the [40] E2E) driving the OPTIONAL catalogue:
 * RUNNING row at start, truthful indexed bundle at terminal, and a restart
 * (fresh StudioCatalog) reading the same durable history. Proves the additive
 * hooks never block or alter the build itself (exit 0, bundle verified).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { BuildRunner, type BuildJobSnapshot } from "../../build-runner";
import { exampleBuildConfigBody, requireDetCli } from "../../test-helpers/det-cli";

import { StudioCatalog } from "../studio-catalog";

const TERMINAL = new Set(["exited", "timeout", "spawn-failed", "interrupted"]);

let root: string;
let runsRoot: string;
let projectsRoot: string;
let dataDir: string;
let catalog: StudioCatalog;

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

async function awaitTerminal(
   runner: BuildRunner,
   runId: string,
   timeoutMs = 60_000,
): Promise<BuildJobSnapshot> {
   const deadline = Date.now() + timeoutMs;
   let snap = await runner.snapshot(runId);
   while (snap !== null && !TERMINAL.has(snap.state)) {
      if (Date.now() > deadline)
         throw new Error(
            `build ${runId} did not reach a terminal state in time`,
         );
      await sleep(150);
      snap = await runner.snapshot(runId);
   }
   if (snap === null) throw new Error(`build ${runId} lost its snapshot`);
   // The catalogue hooks run inside the terminal handler before the slot frees.
   while (runner.activeSnapshot() !== null) {
      if (Date.now() > deadline)
         throw new Error(`build ${runId} never released the job slot`);
      await sleep(100);
   }
   return snap;
}

beforeAll(async () => {
   requireDetCli();
   root = await mkdtemp(path.join(os.tmpdir(), "det50-runner-int-"));
   runsRoot = path.join(root, "runs");
   projectsRoot = path.join(root, "projects");
   dataDir = path.join(root, "data");
   await mkdir(runsRoot, { recursive: true });
   await mkdir(projectsRoot, { recursive: true });
   const entryDir = path.join(projectsRoot, "g28-example");
   await mkdir(entryDir, { recursive: true });
   await writeFile(
      path.join(entryDir, "build-config.json"),
      exampleBuildConfigBody(),
      "utf8",
   );
   catalog = await StudioCatalog.open(dataDir);
});

afterAll(async () => {
   try {
      catalog.close();
   } catch {
      /* already closed */
   }
   await rm(root, { recursive: true, force: true });
});

describe("BuildRunner with an optional catalogue", () => {
   it("catalogues a real build end-to-end: RUNNING → SUCCEEDED bundle → restart-stable", async () => {
      const runner = await BuildRunner.open(runsRoot, { catalog });
      const configPath = path.join(
         projectsRoot,
         "g28-example",
         "build-config.json",
      );

      const started = await runner.start("g28-example", configPath);
      const runId = started.runId;
      // The RUNNING row exists as soon as the job is accepted (restart sweep safety).
      const liveRow = catalog.getRun(runId);
      expect(liveRow).not.toBeNull();
      expect(liveRow!.status).toBe("RUNNING");
      expect(liveRow!.origin).toBe("build-runner");
      expect(liveRow!.pid).toBe(started.pid);

      const terminal = await awaitTerminal(runner, runId);
      expect(terminal.state).toBe("exited");
      expect(terminal.exitCode).toBe(0);
      expect(terminal.manifestSummary).not.toBeNull();

      // Disk truth indexed from the runner's terminal path.
      const indexed = catalog.getRun(runId)!;
      expect(indexed.status).toBe("SUCCEEDED");
      expect(indexed.integrity).toBe("verified");
      expect(indexed.bundlePresent).toBe(true);
      expect(indexed.projectId).toBe("g28-home-preview");
      expect(indexed.startedAt).toBe(started.startedAt);
      expect(indexed.artifactCount).toBe(catalog.listArtifacts(runId).length);
      expect(indexed.artifactCount).toBeGreaterThan(0);
      expect(catalog.listProjects().map((p) => p.id)).toContain(
         "g28-home-preview",
      );
      expect(runner.activeSnapshot()).toBeNull();

      // Restart: a fresh catalogue handle reads the same durable history.
      const reopened = await StudioCatalog.open(dataDir);
      try {
         const after = reopened.getRun(runId)!;
         expect(after.status).toBe("SUCCEEDED");
         expect(after.integrity).toBe("verified");
         expect(after.artifactCount).toBe(indexed.artifactCount);
         // The sweep must NOT have misread the finished row as interrupted.
         expect(after.finishedAt).not.toBeNull();
      } finally {
         reopened.close();
      }
   });
});
