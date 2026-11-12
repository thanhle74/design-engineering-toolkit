/**
 * [29] DET Studio — New Conversion module options (module-local, lane W-A).
 *
 * `OUTPUT_TARGET_OPTIONS` and `TARGET_LABELS` are the closed vocabulary for the
 * output-target selector. `DEMO_PROFILES` is a visibly demo-labeled local
 * constant for tests and demo wiring only — real profiles come from local DET
 * profile configuration and are passed in by the host page via the `profiles`
 * prop. Nothing here is persisted or sent anywhere.
 */
import type { ConversionOutputTarget, StudioProfileOption } from "./types";

export interface ConversionOutputTargetOption {
   value: ConversionOutputTarget;
   label: string;
}

export const OUTPUT_TARGET_OPTIONS: readonly ConversionOutputTargetOption[] = [
   { value: "native-page-builder", label: "Native Page Builder" },
   { value: "hyva-phtml", label: "Hyvä PHTML (frontend-only)" },
   { value: "auto", label: "Tự động" },
];

export const DEFAULT_OUTPUT_TARGET: ConversionOutputTarget =
   "native-page-builder";

/** Label lookup for summaries — keeps rendered copy consistent with the selector. */
export const TARGET_LABELS: Record<ConversionOutputTarget, string> =
   Object.fromEntries(
      OUTPUT_TARGET_OPTIONS.map((option) => [option.value, option.label]),
   ) as Record<ConversionOutputTarget, string>;

/**
 * Module-local demo profiles. Ids are `demo-` prefixed and names carry an
 * explicit DEMO marker so they can never pass as real DET profile
 * configuration. Used by tests; the integrator may wire them for the demo page.
 */
export const DEMO_PROFILES: readonly StudioProfileOption[] = [
   {
      id: "demo-fashion-storefront",
      name: "DEMO — Cửa hàng thời trang",
      demo: true,
   },
   { id: "demo-content-site", name: "DEMO — Trang nội dung", demo: true },
];
