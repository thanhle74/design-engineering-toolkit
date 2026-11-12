import { connection } from "next/server";

import {
   DetRunReaderError,
   type DetRunSummary,
} from "@/src/modules/studio/shared/contracts";
import { getDetRunReader } from "@/src/modules/studio/server/det-run-reader-factory";

import { OverviewScreen } from "@/src/modules/studio/modules/overview";

export default async function OverviewPage() {
   // Runs are read from local disk/env per request. fs/env are not tracked as
   // dynamic APIs by Cache Components, so signal request-time explicitly.
   await connection();

   let runs: readonly DetRunSummary[];
   let readerErrorCode: string | null = null;
   let readerMessage: string | null = null;

   try {
      const reader = await getDetRunReader();
      runs = await reader.listRuns();
   } catch (error) {
      if (error instanceof DetRunReaderError) {
         readerErrorCode = error.code;
         readerMessage = error.message;
         runs = [];
      } else {
         throw error;
      }
   }

   return (
      <OverviewScreen
         runs={runs}
         readerErrorCode={readerErrorCode}
         readerMessage={readerMessage}
      />
   );
}

// Runs are read from local disk per request — this is a fully blocking,
// request-time route (local operator tool; no cached shell to prerender).
export const instant = false;
