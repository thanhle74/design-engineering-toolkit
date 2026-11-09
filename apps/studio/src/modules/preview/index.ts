/**
 * [29] DET Studio — preview module public interface (W-C lane).
 *
 * Consumers (the composed page) import only from here. The module is fully
 * presentational: it takes frozen read-model slices as props and performs no
 * data access of its own.
 */
export { PreviewPanel, type PreviewPanelProps } from "./preview-panel";
