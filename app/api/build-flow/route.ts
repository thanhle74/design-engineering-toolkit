/**
 * [70] DET Studio — /api/build-flow (the ONE-CLICK Build flow).
 *
 * Frozen contract: src/modules/studio/shared/contracts/build-flow.ts —
 *   POST /api/build-flow  body {figmaInput: string; target: string}
 *                         → 202 {flowId, state} | 4xx/5xx {error:{code,message}, ...}
 *   GET  /api/build-flow  → 200 {active: BuildFlowRunSnapshot | null} (never gated)
 *
 * POST order (fail fast before anything expensive):
 *  (a) JSON body parse + {figmaInput, target} shape → 400 `invalid-input`;
 *  (b) target not "magento-page-builder" (hyva-phtml or unknown) → 422
 *      `unsupported-target` — the honest "Chưa hỗ trợ" selector entry;
 *  (c) `parseFigmaInput` failure → 400 `invalid-input` with the parser's
 *      Vietnamese message;
 *  (d) `assertStudioEnvironmentReady()` → canonical `environment-not-ready`
 *      503 (server-side truth; UI state is never authorization);
 *  (e) orchestrator start → busy → 409 `flow-busy` + `{active}`; accepted →
 *      202 `{flowId, state}`.
 *
 * Source-pin matching is NOT a sync HTTP error: it happens inside pipeline
 * stage 1 (verify-source) and surfaces through the flow snapshot.
 */
import { parseFigmaInput } from "@/src/modules/studio/conversions/figma-input";
import {
   StudioEnvironmentError,
   assertStudioEnvironmentReady,
   environmentNotReadyResponse,
} from "@/src/modules/studio/server/environment";
import { buildFlowErrorResponse } from "@/src/modules/studio/server/build-flow/build-flow-errors";
import { getBuildFlowOrchestrator } from "@/src/modules/studio/server/build-flow/build-flow-orchestrator";

/** The ONLY enabled output target of this milestone. */
const ENABLED_TARGET = "magento-page-builder";

interface BuildFlowStartBody {
   figmaInput?: unknown;
   target?: unknown;
}

export async function POST(request: Request): Promise<Response> {
   void request.headers.get("accept");

   let body: BuildFlowStartBody;
   try {
      body = (await request.json()) as BuildFlowStartBody;
   } catch {
      return Response.json(
         {
            error: {
               code: "invalid-input",
               message:
                  'Request body must be JSON: {"figmaInput": string, "target": string}.',
            },
         },
         { status: 400 },
      );
   }
   const figmaInput = body?.figmaInput;
   const target = body?.target;
   if (
      typeof figmaInput !== "string" ||
      figmaInput.trim() === "" ||
      typeof target !== "string" ||
      target === ""
   ) {
      return Response.json(
         {
            error: {
               code: "invalid-input",
               message:
                  'figmaInput and target are required non-empty strings: {"figmaInput": string, "target": string}.',
            },
         },
         { status: 400 },
      );
   }
   // (b) closed target vocabulary BEFORE anything expensive.
   if (target !== ENABLED_TARGET) {
      return Response.json(
         {
            error: {
               code: "unsupported-target",
               message: `Output target "${target}" chưa được hỗ trợ (Chưa hỗ trợ) — hiện chỉ hỗ trợ "${ENABLED_TARGET}".`,
            },
         },
         { status: 422 },
      );
   }
   // (c) the parser's own Vietnamese message, verbatim.
   const parsed = parseFigmaInput(figmaInput);
   if (!parsed.ok) {
      return Response.json(
         { error: { code: "invalid-input", message: parsed.message } },
         { status: 400 },
      );
   }

   try {
      // (d) authoritative server-side readiness gate, immediately before
      // accepting work.
      await assertStudioEnvironmentReady();
      // (e) the orchestrator re-checks readiness itself before reserving the
      // pipeline; a taken flow slot answers 409 flow-busy with the active
      // flow snapshot.
      const orchestrator = await getBuildFlowOrchestrator();
      const snapshot = await orchestrator.start({
         figmaInput,
         target: ENABLED_TARGET,
      });
      return Response.json(
         { flowId: snapshot.flowId, state: snapshot.state },
         { status: 202 },
      );
   } catch (error) {
      if (error instanceof StudioEnvironmentError) {
         return environmentNotReadyResponse(error);
      }
      return buildFlowErrorResponse(error);
   }
}

export async function GET(request: Request): Promise<Response> {
   void request.headers.get("accept");

   try {
      const orchestrator = await getBuildFlowOrchestrator();
      return Response.json({ active: orchestrator.activeSnapshot() });
   } catch (error) {
      return buildFlowErrorResponse(error);
   }
}
