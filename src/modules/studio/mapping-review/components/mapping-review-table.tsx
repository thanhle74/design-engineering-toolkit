"use client";

/**
 * [29] Studio — mapping review table (one row per run.mappings entry).
 *
 * [61] Ant Design stock light appearance: Table via the `columns` prop (no
 * dot-notation subcomponents), default light theme, no custom row styling.
 * The derived `needsReview` fact is carried ONLY as the row's
 * `data-needs-review` attribute plus the gold NEEDS_REVIEW review badge —
 * no row highlight class is applied.
 *
 * Data honesty rules enforced here:
 *  - node ids render verbatim (n-… / s-…);
 *  - optional fields render "unknown", never 0 and never a fabricated value;
 *  - compose dispositions are the exact engine vocabulary;
 *  - `needsReview` is presented only as the DERIVED review flag + review
 *    badge — it is never shown as a compose disposition;
 *  - every GAP / EXCLUDED / SKIPPED row stays in the table with its reasons.
 */
import { useMemo, useState } from "react";
import type { HTMLAttributes } from "react";
import {
   ApartmentOutlined,
   CheckCircleFilled,
   CopyOutlined,
   ExclamationCircleFilled,
   EyeOutlined,
   MinusCircleFilled,
   SearchOutlined,
   WarningFilled,
} from "@ant-design/icons";
import {
   Button,
   Card,
   Col,
   Flex,
   Input,
   Row,
   Segmented,
   Table,
   Tooltip,
   Typography,
   message,
} from "antd";
import type { ColumnsType } from "antd/es/table";

import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import { keyedMappings } from "../mapping-row-identity";
import { MappingInspector } from "./mapping-inspector";
import {
   ComposeDispositionBadge,
   KindBadge,
   ReviewDispositionBadge,
} from "./disposition-badges";

/** Muted stand-in for a fact the run does not carry. Never a zero ([61] Vietnamese). */
const UNKNOWN = "không rõ";

/**
 * antd `onRow` prop bags accept arbitrary DOM attributes, but React's
 * `HTMLAttributes` type has no `data-*` index signature — a narrow cast keeps
 * the test-visible row attributes honest without loosening antd's own typing.
 */
function rowProps(
   props: Record<string, unknown>,
): HTMLAttributes<HTMLTableRowElement> {
   return props as unknown as HTMLAttributes<HTMLTableRowElement>;
}

/** Muted stand-in for a fact the run does not carry. Never a zero. */
function UnknownText() {
   return <Typography.Text type="secondary">{UNKNOWN}</Typography.Text>;
}

function TargetCell({ mapping }: { mapping: StudioMappingView }) {
   if (mapping.target) {
      const { capabilityId, appearanceId, nativeElement, nativeField } =
         mapping.target;
      return (
         <Flex vertical gap={2}>
            <Typography.Text code strong style={{ fontSize: 12 }}>
               {capabilityId}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
               {appearanceId}
            </Typography.Text>
            {(nativeElement || nativeField) && (
               <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {nativeElement ?? UNKNOWN} · {nativeField ?? UNKNOWN}
               </Typography.Text>
            )}
         </Flex>
      );
   }
   if (mapping.composeDisposition === "mapped") {
      // The engine contract requires a target on every mapped row; render the
      // missing fact as unknown instead of inventing or hiding it.
      return <UnknownText />;
   }
   return <Typography.Text type="secondary">—</Typography.Text>;
}

function NotesCell({ mapping }: { mapping: StudioMappingView }) {
   const hasNote = Boolean(mapping.note);
   const hasReasons = mapping.reasons.length > 0;
   if (!hasNote && !hasReasons) {
      return <Typography.Text type="secondary">—</Typography.Text>;
   }
   return (
      <Flex vertical gap={4}>
         {mapping.note && (
            <p style={{ margin: 0, fontSize: 12 }}>{mapping.note}</p>
         )}
         {hasReasons && (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
               {mapping.reasons.map((reason, index) => (
                  <li key={index}>
                     <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {reason}
                     </Typography.Text>
                  </li>
               ))}
            </ul>
         )}
      </Flex>
   );
}

/** The review table proper: exactly one row per mapping, in run order. */
export function MappingReviewTable({
   mappings,
}: {
   mappings: readonly StudioMappingView[];
}) {
   const [searchQuery, setSearchQuery] = useState("");
   const [dispositionFilter, setDispositionFilter] = useState<string>("all");
   const [activeDrawerNode, setActiveDrawerNode] =
      useState<StudioMappingView | null>(null);
   const [copied, setCopied] = useState(false);

   // Summary counts — one pass, always over the UNFILTERED run order.
   const counts = useMemo(() => {
      let mapped = 0;
      let gap = 0;
      let skipped = 0;
      let needsReview = 0;
      let merged = 0;
      let excluded = 0;
      for (const m of mappings) {
         if (m.composeDisposition === "mapped") mapped += 1;
         else if (m.composeDisposition === "gap") gap += 1;
         else if (m.composeDisposition === "skipped") skipped += 1;
         else if (m.composeDisposition === "decoration-merged") merged += 1;
         else if (m.composeDisposition === "excluded") excluded += 1;
         if (m.needsReview) needsReview += 1;
      }
      return {
         total: mappings.length,
         mapped,
         // The Gaps card counts gap + skipped: both are "not composed" facts.
         gap: gap + skipped,
         needsReview,
         merged,
         excluded,
      };
   }, [mappings]);

   /**
    * [74] Row identity is computed ONCE over the UNFILTERED source array
    * (`keyedMappings`), so a row's key never changes when the search or
    * disposition filter changes — no remounts, no selection loss. The drawer
    * inspector binds to the exact filtered entry object, i.e. the exact
    * occurrence even when duplicate nodeIds exist.
    */
   const filteredMappings = useMemo(() => {
      return (
         keyedMappings(mappings)
            .filter(({ mapping: m }) => {
               if (dispositionFilter === "needs_review") {
                  if (!m.needsReview) return false;
               } else if (
                  dispositionFilter !== "all" &&
                  m.composeDisposition !== dispositionFilter
               ) {
                  return false;
               }

               if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase();
                  const matchId = m.nodeId.toLowerCase().includes(q);
                  const matchName = m.sourceName?.toLowerCase().includes(q);
                  const matchLoc = m.sourceLocator?.toLowerCase().includes(q);
                  const matchTarget = m.target?.capabilityId
                     .toLowerCase()
                     .includes(q);
                  const matchNote = m.note?.toLowerCase().includes(q);
                  return (
                     matchId ||
                     matchName ||
                     matchLoc ||
                     matchTarget ||
                     matchNote
                  );
               }
               return true;
            })
            // Rows stay StudioMappingView-shaped (spread + rowKey) so the
            // `rowKey="rowKey"` string-prop API and the column renderers are
            // untouched; only the identity source changed.
            .map(({ mapping, rowKey }) => ({ ...mapping, rowKey }))
      );
   }, [mappings, dispositionFilter, searchQuery]);

   const handleCopy = (text: string) => {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      void message.success("Đã sao chép vào bộ nhớ tạm");
      window.setTimeout(() => setCopied(false), 2000);
   };

   const columns: ColumnsType<StudioMappingView> = [
      {
         title: "Node",
         render: (_, mapping) => (
            <Flex vertical gap={2}>
               <Flex align="center" gap={4}>
                  <Typography.Text code title={mapping.nodeId}>
                     {mapping.nodeId}
                  </Typography.Text>
                  <Tooltip title="Sao chép Node ID">
                     <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined style={{ fontSize: 11 }} />}
                        onClick={(e) => {
                           e.stopPropagation();
                           handleCopy(mapping.nodeId);
                        }}
                     />
                  </Tooltip>
               </Flex>
               <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {mapping.sourceName ?? UNKNOWN}
               </Typography.Text>
            </Flex>
         ),
      },
      {
         title: "Vị trí trong nguồn",
         render: (_, mapping) =>
            mapping.sourceLocator ? (
               <Typography.Text code ellipsis title={mapping.sourceLocator}>
                  {mapping.sourceLocator}
               </Typography.Text>
            ) : (
               <UnknownText />
            ),
      },
      {
         title: "Loại",
         render: (_, mapping) => <KindBadge kind={mapping.kind} />,
      },
      {
         title: "Lớp ngữ nghĩa",
         render: (_, mapping) => (
            <Typography.Text code type="secondary">
               {mapping.semanticClass ?? UNKNOWN}
            </Typography.Text>
         ),
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
               <ReviewDispositionBadge
                  disposition={mapping.reviewDisposition}
               />
            ) : (
               <Typography.Text type="secondary">—</Typography.Text>
            ),
      },
      {
         title: "Đích",
         render: (_, mapping) => <TargetCell mapping={mapping} />,
      },
      {
         title: "Ghi chú / lý do",
         render: (_, mapping) => <NotesCell mapping={mapping} />,
      },
      {
         title: "Chi tiết",
         key: "action",
         render: (_, mapping) => (
            <Button
               size="small"
               icon={<EyeOutlined />}
               onClick={(e) => {
                  e.stopPropagation();
                  setActiveDrawerNode(mapping);
               }}
            >
               Xem
            </Button>
         ),
      },
   ];

   return (
      <Flex vertical gap="middle">
         {/* 1. Metric Summary Cards */}
         <Row gutter={[12, 12]}>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Tổng số Node
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <ApartmentOutlined
                           style={{ color: "#1677ff", fontSize: 16 }}
                        />
                        <Typography.Title level={4} style={{ margin: 0 }}>
                           {counts.total}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Đã ánh xạ (Mapped)
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <CheckCircleFilled
                           style={{ color: "#52c41a", fontSize: 16 }}
                        />
                        <Typography.Title
                           level={4}
                           style={{ margin: 0, color: "#52c41a" }}
                        >
                           {counts.mapped}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Khoảng trống (Gaps)
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <ExclamationCircleFilled
                           style={{ color: "#faad14", fontSize: 16 }}
                        />
                        <Typography.Title
                           level={4}
                           style={{ margin: 0, color: "#d48806" }}
                        >
                           {counts.gap}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Cần rà soát (Review)
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <WarningFilled
                           style={{ color: "#fa8c16", fontSize: 16 }}
                        />
                        <Typography.Title
                           level={4}
                           style={{ margin: 0, color: "#fa8c16" }}
                        >
                           {counts.needsReview}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Hợp nhất (Merged)
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <MinusCircleFilled
                           style={{ color: "#13c2c2", fontSize: 16 }}
                        />
                        <Typography.Title level={4} style={{ margin: 0 }}>
                           {counts.merged}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
            <Col xs={12} sm={6} lg={4}>
               <Card size="small">
                  <Flex vertical gap={2}>
                     <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Loại trừ (Excluded)
                     </Typography.Text>
                     <Flex align="center" gap={6}>
                        <Typography.Text
                           type="secondary"
                           style={{ fontSize: 16 }}
                        >
                           —
                        </Typography.Text>
                        <Typography.Title
                           level={4}
                           style={{ margin: 0, color: "#8c8c8c" }}
                        >
                           {counts.excluded}
                        </Typography.Title>
                     </Flex>
                  </Flex>
               </Card>
            </Col>
         </Row>

         {/* 2. Interactive Filter & Search Bar */}
         <Card size="small">
            <Row gutter={[12, 12]} align="middle">
               <Col xs={24} md={10}>
                  <Input
                     placeholder="Tìm Node ID, tên nguồn, locator, đích..."
                     prefix={<SearchOutlined style={{ color: "#8c8c8c" }} />}
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     allowClear
                  />
               </Col>
               <Col xs={24} md={14}>
                  <Segmented
                     value={dispositionFilter}
                     onChange={(val) => setDispositionFilter(val as string)}
                     options={[
                        { label: `Tất cả (${counts.total})`, value: "all" },
                        { label: `Đã map (${counts.mapped})`, value: "mapped" },
                        { label: `Gaps (${counts.gap})`, value: "gap" },
                        {
                           label: `Cần review (${counts.needsReview})`,
                           value: "needs_review",
                        },
                        {
                           label: `Hợp nhất (${counts.merged})`,
                           value: "decoration-merged",
                        },
                        {
                           label: `Loại trừ (${counts.excluded})`,
                           value: "excluded",
                        },
                     ]}
                  />
               </Col>
            </Row>
         </Card>

         {/* 3. The Main Table */}
         <div data-testid="mapping-review-table">
            <Table
               rowKey="rowKey"
               size="small"
               columns={columns}
               dataSource={filteredMappings}
               pagination={false}
               onRow={(mapping) =>
                  rowProps({
                     "data-testid": "mapping-row",
                     "data-node-id": mapping.nodeId,
                     "data-needs-review": mapping.needsReview
                        ? "true"
                        : "false",
                     style: { cursor: "pointer" },
                     onClick: () => setActiveDrawerNode(mapping),
                  })
               }
            />
         </div>

         {/* 4. Side Drawer Inspector — [74] exact-occurrence binding */}
         <MappingInspector
            mapping={activeDrawerNode}
            copied={copied}
            onCopyId={handleCopy}
            onClose={() => setActiveDrawerNode(null)}
         />
      </Flex>
   );
}
