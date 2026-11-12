// [72] Modular section-shape handler registry (frozen seam, ../handler-context.ts).
//
// The compose dispatcher offers every registered handler to each planned section in ARRAY
// ORDER; the first handler whose compose() returns a non-null fragment wins and its fragment
// becomes the section output. A null return is a silent shape-miss (no diagnostics, no
// mapping) — the dispatcher's legacy fallback owns honest skip accounting.
//
// Registration-order contract (deterministic; document this when adding handlers):
// 1. Handlers keyed on an EXPLICIT semantic projection decision (a recorded human role
//    assignment) come FIRST: a projection is the recorded decision and must override a
//    structural guess. (W-C's products / slider-slide handlers belong ahead of the structural
//    handlers below — projected slide/products decisions override structural readings.)
// 2. Structural handlers (card-grid, header-band) come after: they detect peer-repeated groups
//    and loose band text from structure alone, and both DECLINE any section whose subtree
//    carries a projected column/grid/slide/products role, so the two orders agree.
//
// An empty array is byte-identical to the pre-#72 dispatcher (the handler loop no-ops).
// Populated by the #72 handler lanes through the Integrator's registration step.
import type { SectionShapeHandler } from "../handler-context.js";

export const SECTION_SHAPE_HANDLERS: SectionShapeHandler[] = [];
