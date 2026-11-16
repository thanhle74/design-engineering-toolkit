"use client";

/**
 * [74] Pure tree model for the Figma design tree (extracted from
 * `components/figma-tree-view.tsx` along its one real seam: turning
 * sections + grouped mappings into antd `TreeDataNode[]` plus the
 * key→item lookup the inspector binds to).
 *
 * Row identity ([74] AG-011 follow-up): the caller supplies the row key per
 * mapping — computed ONCE over the UNFILTERED mappings array by
 * `mappingRowKeys` (mapping-review lane). Tree node keys therefore stay
 * stable across search/disposition filtering: a filter change re-renders
 * fewer nodes but never renames one, so selection survives and no row
 * remounts. Duplicate nodeIds stay distinct because the identity includes
 * the entry's source facts + occurrence index.
 */
import {
   AppstoreOutlined,
   CheckCircleFilled,
   ExclamationCircleFilled,
   FileTextOutlined,
   FolderOpenOutlined,
   FolderOutlined,
   FontSizeOutlined,
   MinusCircleFilled,
   PictureOutlined,
   QuestionCircleFilled,
   TagOutlined,
} from "@ant-design/icons";
import { Tag, Typography } from "antd";
import type { TreeDataNode } from "antd";

import type {
   StudioMappingView,
   StudioSectionView,
} from "@/src/modules/studio/shared/contracts";
import { ComposeDispositionBadge } from "@/src/modules/studio/mapping-review";

/** What the inspector panel renders for a selected tree key. */
export type SelectedTreeItem =
   | { type: "section"; section: StudioSectionView }
   | { type: "mapping"; mapping: StudioMappingView }
   | { type: "unassigned-group" };

/** The model `FigmaTreeView` consumes: tree data plus the exact-bind lookup. */
export interface FigmaTreeModel {
   treeData: TreeDataNode[];
   treeItemsByKey: Map<string, SelectedTreeItem>;
   /** Section group keys (plus "unassigned-group"), used as expand defaults. */
   allSectionKeys: string[];
}

export interface FigmaTreeModelInput {
   sections: readonly StudioSectionView[];
   /** Filtered mappings grouped by sectionId (section-attached entries only). */
   mappingsBySection: ReadonlyMap<string, StudioMappingView[]>;
   /** Filtered mappings without a sectionId ("Chưa gán" group). */
   filteredUnassigned: readonly StudioMappingView[];
   /** [74] Stable row key per mapping, from the unfiltered identity pass. */
   rowKeys: ReadonlyMap<StudioMappingView, string>;
}

function getNodeIcon(kind?: string) {
   switch (kind) {
      case "text":
         return <FontSizeOutlined style={{ color: "#1677ff" }} />;
      case "media":
         return <PictureOutlined style={{ color: "#52c41a" }} />;
      case "container":
      case "page-section":
         return <FolderOutlined style={{ color: "#fa8c16" }} />;
      case "component":
         return <AppstoreOutlined style={{ color: "#722ed1" }} />;
      case "icon":
         return <TagOutlined style={{ color: "#13c2c2" }} />;
      default:
         return <FileTextOutlined style={{ color: "#8c8c8c" }} />;
   }
}

/** Leaf title shared by section children and the unassigned group. */
function MappingTreeTitle({ mapping }: { mapping: StudioMappingView }) {
   return (
      <span
         style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            overflow: "hidden",
            whiteSpace: "nowrap",
         }}
      >
         <span
            style={{
               display: "inline-flex",
               alignItems: "center",
               fontSize: 14,
               flexShrink: 0,
            }}
         >
            {getNodeIcon(mapping.kind)}
         </span>
         <span
            style={{
               fontWeight: 500,
               maxWidth: 240,
               overflow: "hidden",
               textOverflow: "ellipsis",
               whiteSpace: "nowrap",
               fontSize: 13,
            }}
            title={mapping.sourceName || mapping.nodeId}
         >
            {mapping.sourceName || mapping.nodeId}
         </span>
         <Typography.Text
            code
            style={{
               fontSize: 11,
               color: "#8c8c8c",
               padding: "0 4px",
               background: "#f5f5f5",
               flexShrink: 0,
            }}
         >
            {mapping.nodeId}
         </Typography.Text>
         <span style={{ flexShrink: 0 }}>
            <ComposeDispositionBadge disposition={mapping.composeDisposition} />
         </span>
      </span>
   );
}

function mappingLeaf(
   mapping: StudioMappingView,
   rowKeys: ReadonlyMap<StudioMappingView, string>,
   itemsMap: Map<string, SelectedTreeItem>,
): TreeDataNode {
   // Every mapping passed in comes from the same run.mappings array the
   // caller keyed, so the lookup always hits; the nodeId fallback keeps the
   // function total if a caller ever violates that contract.
   const key = rowKeys.get(mapping) ?? mapping.nodeId;
   itemsMap.set(key, { type: "mapping", mapping });
   return {
      key,
      isLeaf: true,
      title: <MappingTreeTitle mapping={mapping} />,
   };
}

/**
 * Build the section tree: one group per section (engine order) with its
 * filtered mapping leaves, then the explicit "Chưa gán vào mục nào" group.
 * Pure — no hooks, no state; safe inside a single useMemo.
 */
export function buildFigmaTreeData(
   input: FigmaTreeModelInput,
): FigmaTreeModel {
   const { sections, mappingsBySection, filteredUnassigned, rowKeys } = input;
   const itemsMap = new Map<string, SelectedTreeItem>();
   const sectionKeys: string[] = [];

   const sectionNodes: TreeDataNode[] = sections.map((sec) => {
      sectionKeys.push(sec.sectionId);
      itemsMap.set(sec.sectionId, { type: "section", section: sec });

      const secMappings = mappingsBySection.get(sec.sectionId) || [];
      const children = secMappings.map((m) =>
         mappingLeaf(m, rowKeys, itemsMap),
      );

      return {
         key: sec.sectionId,
         title: (
            <span
               style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
               }}
            >
               <FolderOpenOutlined
                  style={{ color: "#1677ff", fontSize: 14, flexShrink: 0 }}
               />
               <Typography.Text
                  strong
                  style={{ fontSize: 13, flexShrink: 0 }}
               >
                  #{sec.order} {sec.name}
               </Typography.Text>
               <Typography.Text
                  code
                  style={{ fontSize: 11, color: "#8c8c8c", flexShrink: 0 }}
               >
                  {sec.sectionId}
               </Typography.Text>
               <Tag
                  color={sec.elementCount > 0 ? "blue" : "gold"}
                  style={{ margin: 0, fontSize: 11, flexShrink: 0 }}
               >
                  {sec.elementCount} phần tử
               </Tag>
               {sec.elementCount === 0 && (
                  <Tag
                     color="warning"
                     style={{ margin: 0, fontSize: 11, flexShrink: 0 }}
                  >
                     PARTIAL
                  </Tag>
               )}
            </span>
         ),
         children,
      };
   });

   if (filteredUnassigned.length > 0) {
      sectionKeys.push("unassigned-group");
      itemsMap.set("unassigned-group", { type: "unassigned-group" });
      sectionNodes.push({
         key: "unassigned-group",
         title: (
            <span
               style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
               }}
            >
               <FolderOutlined
                  style={{ color: "#faad14", fontSize: 14, flexShrink: 0 }}
               />
               <Typography.Text
                  strong
                  style={{ fontSize: 13, flexShrink: 0 }}
               >
                  Chưa gán vào mục nào
               </Typography.Text>
               <Tag
                  color="orange"
                  style={{ margin: 0, fontSize: 11, flexShrink: 0 }}
               >
                  {filteredUnassigned.length} node
               </Tag>
            </span>
         ),
         children: filteredUnassigned.map((m) =>
            mappingLeaf(m, rowKeys, itemsMap),
         ),
      });
   }

   return {
      treeData: sectionNodes,
      treeItemsByKey: itemsMap,
      allSectionKeys: sectionKeys,
   };
}
