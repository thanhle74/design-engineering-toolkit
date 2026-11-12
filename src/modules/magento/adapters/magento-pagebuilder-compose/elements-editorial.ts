// [72] Editorial element emit helpers — native heading + the structural chain openers the
// editorial shape handlers share. Pure bytes only: no closure state, no registry access, no
// diagnostics — handlers own the accountable records; these builders only emit markup that
// mirrors the platform's own persisted master format (VERIFIED-REAL-ROW shapes in
// docs/evidence/issue-72/source/native-declarations-observed.md).
import { escText } from "./elements.js";

// The heading declaration is VERIFIED-REAL-ROW: single element, no children, the text is the
// element CONTENT (tag-escaper converter over the heading_text html field), the tag itself is
// the heading_type carrier (h1..h6). Real admin-saved rows add theme css classes and optional
// data-pb-style keys as styling carriers; the declaration core above is the shape the Admin
// reader populates the Heading form from.
export const headingElementHtml = (
   level: 1 | 2 | 3 | 4 | 5 | 6,
   text: string,
): string =>
   `<h${level} data-content-type="heading" data-appearance="default" data-element="main">${escText(text)}</h${level}>`;

// ---- Structural chain openers (byte-identical to the legacy composers in compose.ts) --------
// row(contained) top-level container; the inner div is the platform's own row inner element
// (parallax/video defaults the Admin form owns). The optional style key persists the row inner
// min-height through the platform's rehydratable style-block mechanism (issue #25 correction).
export const rowContainedOpenHtml = (): string =>
   `<div data-content-type="row" data-appearance="contained" data-element="main">`;
export const rowInnerOpenHtml = (styleKey?: string): string =>
   `<div data-enable-parallax="0" data-parallax-speed="0.5" data-background-images="{}" data-background-type="image" data-video-loop="true" data-video-play-only-visible="true" data-video-lazy-load="true" data-video-fallback-src="" data-element="inner"${styleKey !== undefined ? ` data-pb-style="${styleKey}"` : ""}>`;
export const rowContainedCloseHtml = (): string => `</div></div>`;

// The only declaration-backed multi-column chain (column-group children policy is the
// declaration intersection's mandate: a column's parents allow only column-line/column, so
// column-line is the mandated bridge under the group; column-line's children policy allows
// column with NO count cap — vendor content_type/column-line.xml — so N columns of any count
// share one line). Byte-identical to the legacy grid composers in compose.ts.
export const columnGroupOpenHtml = (): string =>
   `<div class="pagebuilder-column-group" data-content-type="column-group" data-appearance="default" data-grid-size="12" data-background-images="{}" data-element="main">`;
export const columnGroupCloseHtml = (): string => `</div>`;
export const columnLineOpenHtml = (styleKey: string): string =>
   `<div class="pagebuilder-column-line" data-content-type="column-line" data-element="main" data-pb-style="${styleKey}">`;
export const columnLineCloseHtml = (): string => `</div>`;
export const columnOpenHtml = (styleKey: string): string =>
   `<div class="pagebuilder-column" data-content-type="column" data-appearance="full-height" data-background-images="{}" data-element="main" data-pb-style="${styleKey}">`;
export const columnCloseHtml = (): string => `</div>`;

// Style-block rules (the platform's rehydratable style mechanism; identical rule shapes to the
// legacy composers — no inline style attributes on composed structural elements, ever).
export const styleBlockHtml = (rules: string[]): string =>
   rules.length > 0 ? `<style>${rules.join("")}</style>` : "";
export const rowInnerMinHeightRule = (styleKey: string, px: number): string =>
   `#html-body [data-pb-style=${styleKey}]{min-height:${px}px}`;
export const columnLineFlexRule = (styleKey: string): string =>
   `#html-body [data-pb-style=${styleKey}]{display:flex;width:100%}`;
export const columnWidthRule = (styleKey: string, pct: number): string =>
   `#html-body [data-pb-style=${styleKey}]{justify-content:flex-start;display:flex;flex-direction:column;width:${pct}%;align-self:stretch}`;
