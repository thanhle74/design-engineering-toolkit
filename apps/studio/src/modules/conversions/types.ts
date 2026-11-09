/**
 * [29] DET Studio — New Conversion module types (module-local, lane W-A).
 *
 * These types describe only what the conversion FORM collects. They are not
 * engine contracts and must never be confused with the frozen StudioRunView
 * read model (`@/src/shared/contracts`), which no conversion has ever
 * produced — execution is not connected in this MVP.
 */

/** Where the operator wants the conversion to land. Labels live in `conversion-options.ts`. */
export type ConversionOutputTarget = "native-page-builder" | "hyva-phtml" | "auto";

/**
 * A project profile option handed to the form by the host page (integrator).
 * Real profiles come from local DET profile configuration; demo entries carry
 * `demo: true` (and a `demo-` id prefix) so they can never read as real config.
 */
export interface StudioProfileOption {
  id: string;
  name: string;
  demo?: boolean;
}

/** How the Figma source was supplied: a full design-file URL or a bare node id. */
export type FigmaInputKind = "url" | "bare";

/**
 * The validated request the form can honestly summarize. `fileKey` is null
 * when only a bare node id was provided — an unknown file key stays unknown,
 * it is never invented.
 */
export interface ConversionRequestSummary {
  fileKey: string | null;
  nodeId: string;
  inputKind: FigmaInputKind;
  target: ConversionOutputTarget;
  profileId: string | null;
  profileName: string | null;
}
