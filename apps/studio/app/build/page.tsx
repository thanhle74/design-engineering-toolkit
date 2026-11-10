import { connection } from "next/server";
import { CircleAlert, Hammer, Unplug } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DetRunReaderError } from "@/src/shared/contracts";
import { BuildConfigCatalog, STUDIO_BUILD_PROJECTS_DIR_ENV } from "@/src/server/build-catalog";
import { getBuildRunner } from "@/src/server/build-runner";

import { BuildLauncher } from "./build-launcher";

/**
 * [40] Build Control — real UI-triggered offline `det build` runs (S5).
 *
 * Requires BOTH configured env vars: `STUDIO_BUILD_PROJECTS_DIR` (the catalog
 * of caller-configured build-config entries) and `STUDIO_DET_RUNS_DIR` (where
 * the thin local runner writes real bundles). An unconfigured environment
 * renders an explicit not-connected state — NEVER the DEMO fixture: a
 * build-control page must never look like it built something it did not.
 * Builds are offline snapshot builds only; there is no live Figma path.
 */
export default async function BuildPage() {
  // Catalog/runner state comes from local disk/env per request. fs/env are not
  // tracked as dynamic APIs by Cache Components, so signal request-time
  // explicitly.
  await connection();

  let entries: Awaited<ReturnType<BuildConfigCatalog["list"]>> | null = null;
  let catalogErrorCode: string | null = null;
  let catalogErrorMessage: string | null = null;
  try {
    const catalog = await BuildConfigCatalog.open(process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "");
    entries = await catalog.list();
  } catch (error) {
    if (error instanceof DetRunReaderError) {
      catalogErrorCode = error.code;
      catalogErrorMessage = error.message;
    } else {
      throw error;
    }
  }

  let runnerReady = true;
  let runnerReason: string | undefined;
  let active = null;
  try {
    const runner = await getBuildRunner();
    active = runner.activeSnapshot();
  } catch (error) {
    if (error instanceof DetRunReaderError && error.code === "not-configured") {
      runnerReady = false;
      runnerReason = error.message;
    } else {
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="build-control-heading">
        <h1
          id="build-control-heading"
          className="flex items-center gap-2.5 text-xl font-semibold tracking-tight md:text-2xl"
        >
          <Hammer className="size-5 text-muted-foreground" aria-hidden="true" />
          Build Control
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Trigger a real offline <span className="font-mono">det build --config</span> run through
          the thin local runner and follow it to a verified bundle. Builds run from{" "}
          <strong>offline snapshot sources only</strong> (the build config pins the design source);
          one build at a time; the engine owns every conversion decision — this page only starts it
          and reports what actually happened.
        </p>
      </section>

      {catalogErrorCode !== null ? (
        <Alert>
          <Unplug className="size-4" aria-hidden="true" />
          <AlertTitle>Build catalog not configured ({catalogErrorCode})</AlertTitle>
          <AlertDescription>
            <p>{catalogErrorMessage}</p>
            <p className="mt-2 text-muted-foreground">
              Set the {STUDIO_BUILD_PROJECTS_DIR_ENV} environment variable to a directory of
              build-config entries (one subdirectory per entry with a{" "}
              <span className="font-mono">build-config.json</span>) and STUDIO_DET_RUNS_DIR to the
              DET output root. See the local build-control setup in{" "}
              <span className="font-mono">apps/studio/README.md</span>. This page intentionally
              shows no demo data: a build-control UI must never look like it built something it
              did not.
            </p>
          </AlertDescription>
        </Alert>
      ) : entries !== null ? (
        <BuildLauncher
          entries={entries.entries}
          invalid={entries.invalid}
          runnerReady={runnerReady}
          runnerReason={runnerReason}
          initialActive={active}
        />
      ) : (
        <Alert>
          <CircleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Build catalog unavailable</AlertTitle>
          <AlertDescription>The catalog could not be read on this server.</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Single local trusted operator UI · one build at a time (a request while busy fails with
        409 and the live job state) · no auth/DB/queue. The bundle lands in the configured DET
        output root and is then listed as a live run — verified against the build manifest before
        any artifact downloads.
      </p>
    </div>
  );
}

// Catalog/runner state is read per request — fully blocking route.
export const instant = false;
