// [72] Frozen seam between the compose dispatcher and modular section-shape handlers.
//
// Issue #72 architecture priority: one canonical compose engine, many small shape handlers.
// A handler owns ONE deterministic structural signature (peer repeated groups, media slots,
// role-resolved subtrees) and emits declaration-backed native Page Builder master-format
// markup through the shared pure builders in ./elements.ts. Handlers never branch on source
// identity (section names, node ids, customer paths), never print, and never mutate compose
// state outside the appended accountable records on the context.
//
// The dispatcher (compose.ts) builds ONE context per run and offers it to registered handlers
// in a deterministic order; the first handler that matches a section composes it. A handler
// that does not match returns null WITHOUT recording — the dispatcher's own fallback scan
// stays the single source of honest skip/gap accounting.
import type {
   Capability,
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../core/types.js";

// Explicit semantic projection vocabulary (single source of truth for every shape handler and
// the compose dispatcher; extended in #72 from the pre-#72 compose-local union).
export type ComposerRole =
   | "background-media"
   | "content-lead"
   | "heading"
   | "body"
   | "cta"
   | "decoration"
   | "column-primary"
   | "column-secondary"
   | "inline-media"
   | "grid-column"
   | "grid-caption"
   // [#72] v1.5.0 additive vocabulary: carousel-of-slides and native products listing
   // decisions. Carousel intent is NOT decidable from NodeIR geometry alone (peer repeated
   // groups are structurally identical to grids), so these roles exist to carry the recorded
   // decision instead of a structural guess.
   | "slide"
   | "products-grid"
   | "products-carousel";

export interface MappingEntry {
   sourceNodeId: string;
   sourceName?: string;
   sourceLocator?: string;
   disposition: "mapped" | "gap" | "decoration-merged" | "excluded" | "skipped";
   target?: {
      capabilityId: string;
      appearanceId: string;
      nativeElement?: string;
      nativeField?: string;
   };
   note?: string;
}

/**
 * [#72 C72-2 correction] The recorded product-selection binding a products decision MUST
 * carry before the executable catalog widget is emitted. Only the two native modes with
 * vendor-verified storefront semantics are accepted (PageBuilder's products form +
 * conditions-data-processor synthesize the same rule; real admin-saved cms_page row 8
 * `demo-landing-page` is the byte reference for category_ids mode):
 * - `category_ids`: the widget's rule filters to those categories (anchor expansion and
 *   visibility are native runtime behavior).
 * - `sku`: the widget's rule filters to those SKUs.
 * `condition` mode is deliberately NOT accepted: a free-form rule payload can encode any
 * vendor-specific condition class, which is exactly the C72-1 portability hazard. An
 * unbound products decision (no selection) composes NOTHING — a rule-less widget directive
 * is a REAL executable listing (vendor-verified: an empty combine attaches no SQL
 * constraints and the base collection lists newest products), so emitting one without an
 * explicit recorded selection would silently publish arbitrary live products.
 */
export interface ProductsSelectionBinding {
   kind: "category_ids" | "sku";
   /** Non-empty, trimmed, comma-separated id/sku string — the admin form's raw value shape. */
   value: string;
}

export interface SectionComposeContext {
   // ---- node inventory + document-order helpers (read-only views of the compose input) ----
   nodesById: Map<string, NodeIRNode>;
   locatorOf(node: NodeIRNode): string | null;
   walkSubtree(rootId: string, visit: (node: NodeIRNode) => void): void;

   // ---- registry gate: declaration-backed native only, fail-closed diagnostics ----
   requireCap(id: string, appearanceId: string): boolean;

   // ---- content manifest lookups ----
   textByRef: Map<string, string>;
   mediaByRef: Map<string, { mediaUrl: string; assetLabel?: string }>;
   linkByRef: Map<
      string,
      {
         linkUrl: string;
         linkTarget?: string;
         variant?: "primary" | "secondary";
      }
   >;

   // ---- explicit semantic projection ----
   roleByLocator: Map<string, ComposerRole>;
   /**
    * [#72 C72-2 correction] Recorded product-selection bindings by locator (only
    * products-grid/products-carousel assignments may carry one). Absent -> products
    * composes NOTHING (typed gap; never an unbound executable widget).
    */
   selectionByLocator: ReadonlyMap<string, ProductsSelectionBinding>;
   /** Locators excluded as decoration-projected (their whole subtrees are pre-excluded). */
   excludedLocators: Set<string>;
   /** Locators composing THROUGH a projected CTA instance (subtrees accounted once there). */
   ctaSubtreeLocators: Set<string>;

   // ---- accountable records (append-only; handlers NEVER print) ----
   pushDiagnostic(d: Diagnostic): void;
   pushMapping(m: MappingEntry): void;
}

export interface SectionShapeHandler {
   /** Stable handler identity; surfaces in mapping notes and diagnostics. */
   readonly id: string;
   /**
    * Attempt to compose `sectionNodeId` as this handler's structural signature.
    * Returns the master-format fragment, or null when the section does not carry the
    * signature — null MUST be silent (no diagnostics/mapping); the dispatcher's fallback
    * scan owns honest skip accounting.
    */
   compose(
      section: PageStructureSection,
      sectionNodeId: string,
      ctx: SectionComposeContext,
   ): string | null;
}
