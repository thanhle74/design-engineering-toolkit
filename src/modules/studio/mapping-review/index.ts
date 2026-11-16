/**
 * [29] Studio — mapping-review module public interface.
 *
 * Compose dispositions, review dispositions and severity/origin vocabulary
 * belong to this module; the design-tree module reuses the badge leaves below
 * through this explicit export instead of re-defining them.
 *
 * Presentational only: components receive a validated `StudioRunView` (or the
 * relevant slices) as props and never fetch or import server code.
 */
export { MappingReview } from "./components/mapping-review";
export {
   keyedMappings,
   mappingRowKeys,
   type KeyedMapping,
} from "./mapping-row-identity";
export { MappingReviewTable } from "./components/mapping-review-table";
export { DiagnosticsPanel } from "./components/diagnostics-panel";
export { ProvenanceFooter } from "./components/provenance-footer";
export {
   ComposeDispositionBadge,
   ReviewDispositionBadge,
   KindBadge,
   SeverityBadge,
   OriginBadge,
   RunModeBadge,
} from "./components/disposition-badges";
