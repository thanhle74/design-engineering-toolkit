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
//
// W-B registration (step 4): the three structural handlers, in the contract order above —
// every one of them silently declines any subtree carrying a projected decision role, so the
// dispatcher's projected legacy shapes ahead of this loop and this loop agree by construction.
// W-C's projected products / slider-slide handlers slot in AHEAD of these (order rule 1).
// [#72] Integrator registration: products (recorded products-grid/carousel decisions) and
// slider-slide (recorded slide decisions) registered ahead of the structural handlers per
// order rule 1; the standalone heading unit keeps its first-of-structural position (it
// declines any subtree carrying projected decision roles, so the products/slider decisions
// always outrank it by construction).
import { cardGridHandler } from "./card-grid.js";
import { headerBandHandler } from "./header-band.js";
import { headingSectionHandler } from "./heading.js";
import { productsHandler } from "./products.js";
import { sliderSlideHandler } from "./slider-slide.js";
import type { SectionShapeHandler } from "../handler-context.js";

export const SECTION_SHAPE_HANDLERS: SectionShapeHandler[] = [
   productsHandler,
   sliderSlideHandler,
   headingSectionHandler,
   headerBandHandler,
   cardGridHandler,
];
