/**
 * [29] Studio — design-tree module public interface.
 *
 * Presentational source inventory: ordered PageStructure sections with their
 * grouped node mappings, PARTIAL markers and truthful empty states. Receives a
 * validated `StudioRunView` as a prop; never fetches and never imports server
 * code.
 */
export { DesignTree } from "./components/design-tree";
export { SectionCard } from "./components/section-card";
export { DesignNodeTable } from "./components/node-table";
