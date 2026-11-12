import type { Metadata } from "next";
import { connection } from "next/server";

import { BuildScreen } from "@/src/modules/studio/build-control";

export const metadata: Metadata = { title: "Bản dựng" };

// The one-click Build flow is client-driven against /api/build-flow and
// /api/environment (both re-check server-side per request) — fully blocking
// route, no server-side catalog/runner reads any more.
export const instant = false;

/**
 * [70] Build — ONE one-click flow (rework of the [40]/[61] manual launcher):
 * paste a Figma URL → ONE Build button → truthful pipeline → results. All
 * state lives in the client module; the server-owned readiness gate is
 * re-checked by every /api/build-flow mutation itself.
 */
export default async function BuildPage() {
   // Signal request-time explicitly (client fetches drive everything below).
   await connection();

   return <BuildScreen />;
}
