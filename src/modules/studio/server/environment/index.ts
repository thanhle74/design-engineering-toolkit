/**
 * [70] Studio server environment gate — public API (frozen contract; lane
 * W-B owns the implementation behind these names).
 */
export {
   StudioEnvironmentError,
   assertStudioEnvironmentReady,
   environmentNotReadyResponse,
   getStudioReadiness,
} from "./gate";
