import type { Metadata } from "next";
import { connection } from "next/server";

import { DetRunReaderError } from "@/src/modules/studio/shared/contracts";
import {
   BuildConfigCatalog,
   STUDIO_BUILD_PROJECTS_DIR_ENV,
} from "@/src/modules/studio/server/build-catalog";

import { AgentWorkflow } from "@/src/modules/studio/agent";

export const metadata: Metadata = { title: "Phân tích Figma bằng AI" };

// Catalog + env are read per request (local operator tool) — fully blocking route.
export const instant = false;

/**
 * [65] The AI analysis page. The page itself is server-only and does the
 * same catalog read the Build page does — the base build-config list the
 * operator picks the pinned source project from. All workflow state lives
 * in the client module; the page renders honestly even with zero configs
 * (the workflow cannot start without a base project).
 */
export default async function AgentPage() {
   await connection();

   let configs: { configId: string; label: string; designNode: string }[] = [];
   let catalogError: string | null = null;
   try {
      const catalog = await BuildConfigCatalog.open(
         process.env[STUDIO_BUILD_PROJECTS_DIR_ENV] ?? "",
      );
      const listing = await catalog.list();
      configs = listing.entries.map((entry) => ({
         configId: entry.configId,
         label: entry.label,
         designNode: entry.designSource.designNode,
      }));
   } catch (error) {
      if (error instanceof DetRunReaderError) {
         catalogError = error.message;
      } else {
         throw error;
      }
   }

   return (
      <AgentWorkflow
         configs={configs}
         {...(catalogError !== null ? { catalogError } : {})}
      />
   );
}
