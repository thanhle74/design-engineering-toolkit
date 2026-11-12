/**
 * [29] DET Studio — the ONE public factory for the server-only DET boundary.
 *
 *   import { getDetRunReader } from "@/src/modules/studio/server/det-run-reader-factory";
 *
 * Environment contract (read-only, one variable):
 *   - `STUDIO_DET_RUNS_DIR` unset          → FixtureDetRunReader. Local dev
 *     sees the single labeled DEMO run; nothing pretends to be live.
 *   - `STUDIO_DET_RUNS_DIR` set + valid    → DirectoryDetRunReader over that
 *     realpath'd DET output root.
 *   - `STUDIO_DET_RUNS_DIR` set + invalid  → DetRunReaderError("not-configured")
 *     with a clear message (routes render this as 503). The env VALUE is never
 *     echoed into any message.
 *
 * UI modules must never import a concrete reader — pages/routes compose
 * through this factory only.
 */
import "server-only";

import {
   DetRunReaderError,
   type DetRunReader,
} from "@/src/modules/studio/shared/contracts";

import { DirectoryDetRunReader } from "./directory-det-run-reader";
import { FixtureDetRunReader } from "./fixture-det-run-reader";

export const STUDIO_DET_RUNS_DIR_ENV = "STUDIO_DET_RUNS_DIR";

export async function getDetRunReader(): Promise<DetRunReader> {
   const configuredRoot = process.env[STUDIO_DET_RUNS_DIR_ENV];
   if (configuredRoot === undefined) {
      return new FixtureDetRunReader();
   }
   try {
      return await DirectoryDetRunReader.open(configuredRoot);
   } catch (error) {
      if (error instanceof DetRunReaderError) throw error;
      throw new DetRunReaderError(
         "not-configured",
         "STUDIO_DET_RUNS_DIR is set but does not point to a usable DET output root directory.",
      );
   }
}
