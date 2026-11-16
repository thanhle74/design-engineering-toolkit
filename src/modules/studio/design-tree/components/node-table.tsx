"use client";

/**
 * [29] Studio — design-tree node rows.
 *
 * One compact row per mapping, reused by section groups and the explicit
 * "Not in plan / unassigned" group. Disposition badges are imported from the
 * mapping-review module public interface — the canonical vocabulary is not
 * re-defined here.
 *
 * [61] Ant Design stock light Table (`columns` prop — no dot-notation
 * subcomponents); node ids render as antd inline code. The wrapper div keeps
 * the caller-visible `data-testid` around the table so the grouped row
 * assertions do not depend on antd's internal markup.
 */
import { useMemo, type HTMLAttributes } from "react";
import { Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import {
   ComposeDispositionBadge,
   KindBadge,
   ReviewDispositionBadge,
   mappingRowKeys,
} from "@/src/modules/studio/mapping-review";

/** "không rõ" — a fact the run does not carry is shown, never invented ([61] Vietnamese). */
const UNKNOWN = "không rõ";

/**
 * antd `onRow` prop bags accept arbitrary DOM attributes, but React's
 * `HTMLAttributes` type has no `data-*` index signature — a narrow cast keeps
 * the test-visible row attribute honest without loosening antd's own typing.
 */
function rowProps(
   props: Record<string, string>,
): HTMLAttributes<HTMLTableRowElement> {
   return props as unknown as HTMLAttributes<HTMLTableRowElement>;
}

const columns: ColumnsType<StudioMappingView> = [
   {
      title: "Node id",
      render: (_, mapping) => (
         <Typography.Text code title={mapping.nodeId}>
            {mapping.nodeId}
         </Typography.Text>
      ),
   },
   {
      title: "Tên trong nguồn",
      render: (_, mapping) => (
         <Typography.Text type="secondary">
            {mapping.sourceName ?? UNKNOWN}
         </Typography.Text>
      ),
   },
   {
      title: "Loại",
      render: (_, mapping) => <KindBadge kind={mapping.kind} />,
   },
   {
      title: "Compose",
      render: (_, mapping) => (
         <ComposeDispositionBadge disposition={mapping.composeDisposition} />
      ),
   },
   {
      title: "Review",
      render: (_, mapping) =>
         mapping.reviewDisposition ? (
            <ReviewDispositionBadge disposition={mapping.reviewDisposition} />
         ) : (
            <Typography.Text type="secondary">—</Typography.Text>
         ),
   },
];

export function DesignNodeTable({
   mappings,
   testId,
}: {
   mappings: readonly StudioMappingView[];
   testId: string;
}) {
   /**
    * [74] Fact-based row identity (`mappingRowKeys`, AG-011 follow-up):
    * nodeId + section/disposition/locator/target facts + an occurrence index
    * computed once over THIS table's (unfiltered) source array. Distinct
    * entries with the same nodeId stay distinct; keys survive re-renders.
    */
   const dataWithKeys = useMemo(
      () =>
         mappingRowKeys(mappings).map((rowKey, index) => ({
            ...mappings[index]!,
            rowKey,
         })),
      [mappings],
   );

   return (
      <div data-testid={testId}>
         <Table
            rowKey="rowKey"
            size="small"
            columns={columns}
            dataSource={dataWithKeys}
            pagination={false}
            onRow={() => rowProps({ "data-testid": "design-tree-node" })}
         />
      </div>
   );
}
