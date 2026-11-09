/**
 * [29] DET Studio — New Conversion module public interface (lane W-A).
 *
 * Everything the rest of the Studio may consume goes through this barrel:
 * the client form, the honest not-connected result view, the pure input
 * parser and the module-local option constants/types. Internal file paths
 * are not part of the public surface.
 */
export { ConversionForm } from "./components/conversion-form";
export { NotConnectedResult } from "./components/not-connected-result";
export {
  parseFigmaInput,
  type FigmaInputErrorReason,
  type FigmaInputParseResult,
} from "./figma-input";
export {
  DEFAULT_OUTPUT_TARGET,
  DEMO_PROFILES,
  OUTPUT_TARGET_OPTIONS,
  TARGET_LABELS,
  type ConversionOutputTargetOption,
} from "./conversion-options";
export type {
  ConversionOutputTarget,
  ConversionRequestSummary,
  FigmaInputKind,
  StudioProfileOption,
} from "./types";
