import { connection } from "next/server";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";
import { getBuildRunner } from "@/src/modules/studio/server/build-runner";

import { BuildView } from "./build-view";

/**
 * [40] Build Control — real UI-triggered offline `det build` runs (S5).
 *
 * The catalog is the [58] union of the committed repository examples
 * (`resources/examples/build`, listed in place, no copying) plus caller-configured
 * entries from `STUDIO_BUILD_PROJECTS_DIR` when set. The runner additionally
 * requires `STUDIO_DET_RUNS_DIR` (where real bundles are written — the root
 * `npm run dev` launcher defaults it to out/studio-runs). Without a usable
 * catalog/runner the page renders an explicit not-connected/disabled state —
 * NEVER the DEMO fixture: a build-control page must never look like it built
 * something it did not. Builds are offline snapshot builds only; there is no
 * live Figma path.
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
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
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
      if (
         error instanceof DetRunReaderError &&
         error.code === "not-configured"
      ) {
         runnerReady = false;
         runnerReason = error.message;
      } else {
         throw error;
      }
   }

   return (
      <BuildView
         catalogErrorCode={catalogErrorCode}
         catalogErrorMessage={catalogErrorMessage}
         catalogEntries={entries?.entries ?? null}
         catalogInvalid={entries?.invalid ?? []}
         runnerReady={runnerReady}
         runnerReason={runnerReason}
         initialActive={active}
      />
   );
}

// Catalog/runner state is read per request — fully blocking route.
export const instant = false;
