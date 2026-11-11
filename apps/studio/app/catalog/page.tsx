import type { Metadata } from "next";
import { connection } from "next/server";

import { DetRunReaderError } from "@/src/shared/contracts";
import {
  getStudioCatalog,
  STUDIO_DATA_DIR_ENV,
  type CatalogProjectView,
  type CatalogRunView,
  type CatalogStats,
} from "@/src/server/catalog/studio-catalog";

import { CatalogView } from "./catalog-view";

export const metadata: Metadata = { title: "Catalog" };

// Catalogue state is read per request (local DB + env) — fully blocking route.
export const instant = false;

/**
 * [50] Catalogue — durable project/run metadata across Studio restarts.
 * Reads ONLY from the opt-in SQLite catalogue (`STUDIO_DATA_DIR`). Without it
 * the page renders an explicit not-connected state — never demo data, never a
 * fake catalogue. Artifact files stay on disk: the catalogue indexes hashes
 * and paths; downloads keep flowing through the file-backed reader, which
 * re-verifies live bytes against the build manifest on every read. Legacy
 * file-backed runs keep appearing in the regular listing — the catalogue adds
 * metadata, it never hides files.
 */
export default async function CatalogPage() {
  // Catalog state comes from local disk/env per request. fs/env are not
  // tracked as dynamic APIs by Cache Components, so signal request-time.
  await connection();

  const configured = process.env[STUDIO_DATA_DIR_ENV] !== undefined;
  let offMessage: string | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let projects: CatalogProjectView[] = [];
  let runs: CatalogRunView[] = [];
  let stats: CatalogStats | null = null;

  if (configured) {
    try {
      const catalog = await getStudioCatalog();
      if (catalog === null) {
        offMessage = "STUDIO_DATA_DIR is not set; the SQLite catalogue is off.";
      } else {
        const runsRoot = process.env.STUDIO_DET_RUNS_DIR;
        if (typeof runsRoot === "string") {
          await catalog.refreshIndex(runsRoot);
        }
        projects = catalog.listProjects();
        runs = catalog.listRuns();
        stats = catalog.stats();
      }
    } catch (error) {
      if (error instanceof DetRunReaderError) {
        errorCode = error.code;
        errorMessage = error.message;
      } else {
        throw error;
      }
    }
  } else {
    offMessage =
      "The SQLite catalogue is off: STUDIO_DATA_DIR is not set. Set it to a local directory to persist project/run metadata across Studio restarts; fixture and file-backed modes are unaffected.";
  }

  return (
    <CatalogView
      configured={configured}
      offMessage={offMessage}
      errorCode={errorCode}
      errorMessage={errorMessage}
      projects={projects}
      runs={runs}
      stats={stats}
    />
  );
}
