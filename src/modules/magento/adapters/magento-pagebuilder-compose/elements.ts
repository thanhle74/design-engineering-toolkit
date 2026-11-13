// [72] Shared deterministic emit helpers for every Page Builder section-shape composer.
// Extracted verbatim from the pre-#72 single-file composer (issue #72 architecture priority:
// no giant multipurpose composer file; one canonical definition per element shape, imported by
// every shape handler). Everything here is PURE: no closure state, no registry access, no
// diagnostics — composers own the accountable records; these builders only emit bytes.
import { createHash } from "node:crypto";

export function sha256Hex(value: string): string {
   return createHash("sha256").update(value).digest("hex");
}

// ---- HTML escaping (fixed; attribute values vs text content) --------------------------------
export const esc = (s: string): string =>
   s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
export const escText = (s: string): string =>
   s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const SEP = "␟"; // canonical separator (U+241F), same convention as the core docs/evidence/derivation ids

// Deterministic master-format style key (issue #25 NaN correction): the Admin stage rehydrates
// element styles EXCLUSIVELY from the `<style>` block keyed by data-pb-style (stage-builder
// convertToInlineStyles -> data-<viewport>-style -> configurable reader), never from inline
// style attributes (which the reader clobbers: `setAttribute("style", getAttribute("data-…-style"))`
// with a null fallback). Keys are 7-char CSS-ident-safe uppercase tokens ("P" + 6 hex of the
// source node id) — deterministic across runs, unique per node, the same shape the platform's
// own uniqueid keys take in stored content (real cms_page rows).
export function pbStyleKey(nodeKeySource: string): string {
   return "P" + sha256Hex(nodeKeySource).slice(0, 6).toUpperCase();
}

// Deterministic auxiliary mapping id for composed structures that have no single source node
// (band/synthesized-complement containers): same 12-hex id space as derived node ids, namespaced
// by the "aux" key prefix so it cannot collide with source-derived ids.
export function auxNodeId(nodeKeySource: string): string {
   return `n-${sha256Hex(`aux${SEP}${nodeKeySource}`).slice(0, 12)}`;
}

// ---- Shared element emit helpers (one definition for every section shape) --------------------
// The image/text bytes are exactly the shapes the G3/G4 shapes have always emitted (extracted
// verbatim so both-column and grid composers share one canonical markup); the buttons block is
// the platform's own declaration-backed pair (buttons appearance "inline" > button-item default,
// declarations verified on the pinned checkout before use) whose persisted shape mirrors the
// canonical editor-saved content in the target checkout (real cms_page: buttons container with
// data-same-width, button-item main keyed {display:inline-block}, link keyed {text-align:center},
// button_type css class on the link, virtual link attributes href/target/data-link-type).
export interface TextRun {
   role: "content-lead" | "heading" | "body";
   text: string;
}
export const imageElementHtml = (mediaUrl: string): string =>
   `<figure data-content-type="image" data-appearance="full-width" data-element="main"><img class="pagebuilder-mobile-hidden" src="${esc(mediaUrl)}" alt="" title="" data-element="desktop_image"></figure>`;
export const textElementHtml = (runs: TextRun[]): string =>
   `<div data-content-type="text" data-appearance="default" data-element="main">${runs.map((run) => (run.role === "heading" ? `<h2>${escText(run.text)}</h2>` : `<p>${escText(run.text)}</p>`)).join("")}</div>`;
// A button composes ONLY with a manifest link entry (no invented targets, no empty-link shell —
// a CTA whose link is missing is an explicit gap, never an unlinked pseudo-button). The variant
// css class maps the manifest buttonVariant to the platform's own button_type classes; the Admin
// button_type field stays fully editable either way.
export const buttonVariantClass = (
   variant: "primary" | "secondary" | undefined,
): string =>
   variant === "secondary"
      ? "pagebuilder-button-secondary"
      : "pagebuilder-button-primary";
export function buttonsElementHtml(
   buttonsSectionNodeId: string,
   buttons: {
      keySource: string;
      label: string;
      linkUrl: string;
      linkTarget?: string;
      variant: "primary" | "secondary" | undefined;
   }[],
): string {
   const styleRules: string[] = [];
   const items = buttons.map((b) => {
      const mainKey = pbStyleKey(`${b.keySource}:button-item`);
      const linkKey = pbStyleKey(`${b.keySource}:button-link`);
      styleRules.push(
         `#html-body [data-pb-style=${mainKey}]{display:inline-block}`,
      );
      styleRules.push(
         `#html-body [data-pb-style=${linkKey}]{text-align:center}`,
      );
      const target = b.linkTarget
         ? ` target="${esc(b.linkTarget)}"`
         : ` target=""`;
      return `<div data-content-type="button-item" data-appearance="default" data-element="main" data-pb-style="${mainKey}"><a class="${buttonVariantClass(b.variant)}" href="${esc(b.linkUrl)}"${target} data-link-type="default" data-element="link" data-pb-style="${linkKey}"><span data-element="link_text">${escText(b.label)}</span></a></div>`;
   });
   return `<style>${styleRules.join("")}</style><div data-content-type="buttons" data-appearance="inline" data-same-width="false" data-element="main">${items.join("")}</div>`;
}
