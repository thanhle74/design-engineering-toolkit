"use client";

/**
 * [74] Figma design tree (tree view) — state, filtering and inspector.
 *
 * The pure section→`TreeDataNode` model lives in `../tree-model` (extracted
 * along its one real seam); this component owns the interactive state.
 *
 * [74] Row identity (AG-011 follow-up): tree keys come from `mappingRowKeys`
 * — computed ONCE over the UNFILTERED mappings — instead of the positional
 * `${sectionId}::${nodeId}::${idx}` format, so a key never changes when the
 * search/disposition filter changes and duplicate nodeIds stay distinct
 * (AG-009 saw `n-f18f7c3e5cd3` twice in one run). The inspector binds via
 * the identity map (`mappingByKey`), never via a nodeId-only map, so it
 * always shows the exact occurrence the operator clicked — including when a
 * filter later hides the selected node.
 *
 * [61] Ant Design stock light appearance: stock Tree/Card/Tag styling, no
 * theme overrides, layout preserved exactly.
 */
import React, { useMemo, useState } from "react";
import {
   ApartmentOutlined,
   CheckCircleFilled,
   CheckOutlined,
   CloseCircleFilled,
   CopyOutlined,
   ExclamationCircleFilled,
   FileTextOutlined,
   MinusCircleFilled,
   QuestionCircleFilled,
   SearchOutlined,
} from "@ant-design/icons";
import {
   Button,
   Card,
   Col,
   Descriptions,
   Empty,
   Flex,
   Input,
   Row,
   Segmented,
   Space,
   Tag,
   Tree,
   Typography,
   message,
} from "antd";

import type {
   StudioMappingView,
   StudioSectionView,
} from "@/src/modules/studio/shared/contracts";
import {
   ComposeDispositionBadge,
   KindBadge,
   ReviewDispositionBadge,
   keyedMappings,
} from "@/src/modules/studio/mapping-review";

import { buildFigmaTreeData } from "../tree-model";

interface FigmaTreeViewProps {
   sections: readonly StudioSectionView[];
   mappings: readonly StudioMappingView[];
   unassigned: readonly StudioMappingView[];
}

function getDispositionIcon(disposition: string) {
   switch (disposition) {
      case "mapped":
         return (
            <CheckCircleFilled style={{ color: "#52c41a", fontSize: 12 }} />
         );
      case "gap":
         return (
            <ExclamationCircleFilled
               style={{ color: "#faad14", fontSize: 12 }}
            />
         );
      case "excluded":
         return (
            <CloseCircleFilled style={{ color: "#8c8c8c", fontSize: 12 }} />
         );
      case "decoration-merged":
         return (
            <MinusCircleFilled style={{ color: "#13c2c2", fontSize: 12 }} />
         );
      case "skipped":
         return (
            <QuestionCircleFilled style={{ color: "#1677ff", fontSize: 12 }} />
         );
      default:
         return null;
   }
}

export function FigmaTreeView({
   sections,
   mappings,
   unassigned,
}: FigmaTreeViewProps) {
   const [searchQuery, setSearchQuery] = useState("");
   const [dispositionFilter, setDispositionFilter] = useState<string>("all");
   const [selectedKey, setSelectedKey] = useState<string | null>(null);
   const [copied, setCopied] = useState(false);

   /**
    * [74] Identity, computed ONCE over the UNFILTERED mappings (the
    * `unassigned` subset shares the same array entries). `rowKeys` keys the
    * tree model; `mappingByKey` is the exact-occurrence inspector lookup —
    * replacing the old nodeId-only `mappingMap`, which silently returned the
    * LAST occurrence for duplicate nodeIds.
    */
   const { rowKeys, mappingByKey } = useMemo(() => {
      const keys = new Map<StudioMappingView, string>();
      const byKey = new Map<string, StudioMappingView>();
      for (const { mapping, rowKey } of keyedMappings(mappings)) {
         keys.set(mapping, rowKey);
         byKey.set(rowKey, mapping);
      }
      return { rowKeys: keys, mappingByKey: byKey };
   }, [mappings]);

   const sectionMap = useMemo(() => {
      const map = new Map<string, StudioSectionView>();
      for (const s of sections) {
         map.set(s.sectionId, s);
      }
      return map;
   }, [sections]);

   // Filtered mappings
   const filteredMappings = useMemo(() => {
      return mappings.filter((m) => {
         if (
            dispositionFilter !== "all" &&
            m.composeDisposition !== dispositionFilter
         ) {
            return false;
         }
         if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchName = m.sourceName?.toLowerCase().includes(q);
            const matchId = m.nodeId.toLowerCase().includes(q);
            const matchLoc = m.sourceLocator?.toLowerCase().includes(q);
            const matchKind = m.kind?.toLowerCase().includes(q);
            return matchName || matchId || matchLoc || matchKind;
         }
         return true;
      });
   }, [mappings, dispositionFilter, searchQuery]);

   // Group filtered mappings by sectionId
   const mappingsBySection = useMemo(() => {
      const map = new Map<string, StudioMappingView[]>();
      for (const m of filteredMappings) {
         if (m.sectionId) {
            const list = map.get(m.sectionId) || [];
            list.push(m);
            map.set(m.sectionId, list);
         }
      }
      return map;
   }, [filteredMappings]);

   const filteredUnassigned = useMemo(() => {
      return unassigned.filter((m) => {
         if (
            dispositionFilter !== "all" &&
            m.composeDisposition !== dispositionFilter
         ) {
            return false;
         }
         if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchName = m.sourceName?.toLowerCase().includes(q);
            const matchId = m.nodeId.toLowerCase().includes(q);
            return matchName || matchId;
         }
         return true;
      });
   }, [unassigned, dispositionFilter, searchQuery]);

   // Pure tree model (sections + filtered groups + stable row identity).
   const { treeData, treeItemsByKey, allSectionKeys } = useMemo(
      () =>
         buildFigmaTreeData({
            sections,
            mappingsBySection,
            filteredUnassigned,
            rowKeys,
         }),
      [sections, mappingsBySection, filteredUnassigned, rowKeys],
   );

   // Selected item details: the tree lookup first (exact item), then the
   // [74] identity map by the full stable row key — never a nodeId-only
   // fallback, which could show the WRONG occurrence of a duplicated node.
   const selectedItem = selectedKey ? treeItemsByKey.get(selectedKey) : null;
   const selectedNode = selectedItem?.type === "mapping"
      ? selectedItem.mapping
      : selectedKey
        ? (mappingByKey.get(selectedKey) ?? null)
        : null;
   const selectedSection =
      selectedItem?.type === "section"
         ? selectedItem.section
         : selectedKey
           ? (sectionMap.get(selectedKey) ?? null)
           : null;

   const [userExpandedKeys, setUserExpandedKeys] = useState<React.Key[] | null>(
      null,
   );
   const expandedKeys = userExpandedKeys ?? allSectionKeys;

   const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      if (q.trim()) {
         setUserExpandedKeys(allSectionKeys);
      }
   };

   const handleCopy = (text: string) => {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      void message.success("Đã sao chép vào bộ nhớ tạm");
      window.setTimeout(() => setCopied(false), 2000);
   };

   return (
      <Flex vertical gap="middle">
         {/* Filter and Search Bar */}
         <Card size="small">
            <Row gutter={[12, 12]} align="middle">
               <Col xs={24} md={8}>
                  <Input
                     placeholder="Tìm kiếm node Figma (tên, ID, loại)..."
                     prefix={<SearchOutlined style={{ color: "#8c8c8c" }} />}
                     value={searchQuery}
                     onChange={handleSearch}
                     allowClear
                  />
               </Col>
               <Col xs={24} md={12}>
                  <Segmented
                     value={dispositionFilter}
                     onChange={(val) => setDispositionFilter(val as string)}
                     options={[
                        { label: "Tất cả", value: "all" },
                        { label: "Đã map (Mapped)", value: "mapped" },
                        { label: "Khoảng trống (Gap)", value: "gap" },
                        { label: "Hợp nhất", value: "decoration-merged" },
                        { label: "Loại trừ", value: "excluded" },
                     ]}
                  />
               </Col>
               <Col xs={24} md={4} style={{ textAlign: "right" }}>
                  <Space size="small">
                     <Button
                        size="small"
                        onClick={() => setUserExpandedKeys(allSectionKeys)}
                     >
                        Mở hết
                     </Button>
                     <Button
                        size="small"
                        onClick={() => setUserExpandedKeys([])}
                     >
                        Thu gọn
                     </Button>
                  </Space>
               </Col>
            </Row>
         </Card>

         {/* 2-Column Layout: Tree on Left, Inspector on Right */}
         <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
               <Card
                  size="small"
                  title={
                     <Flex align="center" gap={8}>
                        <ApartmentOutlined style={{ color: "#1677ff" }} />
                        <span style={{ fontWeight: 600 }}>
                           Cây thiết kế Figma (Figma Design Tree)
                        </span>
                        <Tag color="cyan">
                           {filteredMappings.length} / {mappings.length} node
                        </Tag>
                     </Flex>
                  }
                  style={{ minHeight: 480 }}
               >
                  {treeData.length === 0 ? (
                     <Empty description="Không tìm thấy node nào phù hợp với bộ lọc" />
                  ) : (
                     <Tree
                        showLine={{ showLeafIcon: false }}
                        blockNode
                        expandedKeys={expandedKeys}
                        onExpand={(keys) => setUserExpandedKeys(keys)}
                        selectedKeys={selectedKey ? [selectedKey] : []}
                        onSelect={(keys) => {
                           if (keys.length > 0) {
                              setSelectedKey(String(keys[0]));
                           }
                        }}
                        treeData={treeData}
                        style={{ background: "transparent" }}
                     />
                  )}
               </Card>
            </Col>

            <Col xs={24} lg={10}>
               <Card
                  size="small"
                  title={
                     <Flex align="center" gap={8}>
                        <FileTextOutlined style={{ color: "#52c41a" }} />
                        <span style={{ fontWeight: 600 }}>
                           Chi tiết thành phần được chọn
                        </span>
                     </Flex>
                  }
                  style={{ minHeight: 480 }}
               >
                  {selectedNode ? (
                     <Flex vertical gap="middle">
                        <Flex
                           justify="space-between"
                           align="center"
                           wrap="wrap"
                        >
                           <Typography.Title level={5} style={{ margin: 0 }}>
                              {selectedNode.sourceName || "Không có tên"}
                           </Typography.Title>
                           <KindBadge kind={selectedNode.kind} />
                        </Flex>

                        <Descriptions
                           size="small"
                           column={1}
                           bordered
                           layout="vertical"
                        >
                           <Descriptions.Item label="Node ID">
                              <Flex align="center" justify="space-between">
                                 <Typography.Text code copyable={false}>
                                    {selectedNode.nodeId}
                                 </Typography.Text>
                                 <Button
                                    size="small"
                                    type="text"
                                    icon={
                                       copied ? (
                                          <CheckOutlined />
                                       ) : (
                                          <CopyOutlined />
                                       )
                                    }
                                    onClick={() =>
                                       handleCopy(selectedNode.nodeId)
                                    }
                                 >
                                    Copy ID
                                 </Button>
                              </Flex>
                           </Descriptions.Item>
                           <Descriptions.Item label="Figma Locator">
                              <Typography.Text
                                 code
                                 ellipsis
                                 style={{ maxWidth: 300 }}
                              >
                                 {selectedNode.sourceLocator || "không rõ"}
                              </Typography.Text>
                           </Descriptions.Item>
                           <Descriptions.Item label="Trạng thái Compose">
                              <Flex align="center" gap={6}>
                                 {getDispositionIcon(
                                    selectedNode.composeDisposition,
                                 )}
                                 <ComposeDispositionBadge
                                    disposition={
                                       selectedNode.composeDisposition
                                    }
                                 />
                              </Flex>
                           </Descriptions.Item>
                           {selectedNode.reviewDisposition && (
                              <Descriptions.Item label="Trạng thái Review">
                                 <ReviewDispositionBadge
                                    disposition={selectedNode.reviewDisposition}
                                 />
                              </Descriptions.Item>
                           )}
                           <Descriptions.Item label="Đích Magento Page Builder">
                              {selectedNode.target ? (
                                 <Flex vertical gap={2}>
                                    <Typography.Text strong code>
                                       {selectedNode.target.capabilityId}
                                    </Typography.Text>
                                    <Typography.Text
                                       type="secondary"
                                       style={{ fontSize: 12 }}
                                    >
                                       Appearance:{" "}
                                       {selectedNode.target.appearanceId}
                                    </Typography.Text>
                                    {(selectedNode.target.nativeElement ||
                                       selectedNode.target.nativeField) && (
                                       <Typography.Text
                                          type="secondary"
                                          style={{ fontSize: 12 }}
                                       >
                                          {selectedNode.target.nativeElement} ·{" "}
                                          {selectedNode.target.nativeField}
                                       </Typography.Text>
                                    )}
                                 </Flex>
                              ) : selectedItem?.type === "unassigned-group" ? (
                                 <Flex vertical gap="middle">
                                    <Typography.Title
                                       level={5}
                                       style={{ margin: 0 }}
                                    >
                                       Chưa gán vào mục nào
                                    </Typography.Title>
                                    <Descriptions
                                       size="small"
                                       column={1}
                                       bordered
                                    >
                                       <Descriptions.Item label="Tổng số node">
                                          <Tag color="orange">
                                             {filteredUnassigned.length} node
                                          </Tag>
                                       </Descriptions.Item>
                                       <Descriptions.Item label="Mô tả">
                                          Các mapping mà kế hoạch ghép chưa gán
                                          vào section nào (như SCROLL, Header,
                                          Footer toàn trang). Tất cả vẫn được
                                          bảo toàn nguyên vẹn trong báo cáo.
                                       </Descriptions.Item>
                                    </Descriptions>
                                 </Flex>
                              ) : (
                                 <Typography.Text type="secondary">
                                    {selectedNode.composeDisposition ===
                                    "mapped"
                                       ? "không rõ"
                                       : "Chưa gắn đích"}
                                 </Typography.Text>
                              )}
                           </Descriptions.Item>
                           {selectedNode.note && (
                              <Descriptions.Item label="Ghi chú">
                                 <Typography.Text>
                                    {selectedNode.note}
                                 </Typography.Text>
                              </Descriptions.Item>
                           )}
                           {selectedNode.reasons.length > 0 && (
                              <Descriptions.Item label="Lý do / Giải thích">
                                 <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {selectedNode.reasons.map((r, i) => (
                                       <li key={i}>
                                          <Typography.Text
                                             type="secondary"
                                             style={{ fontSize: 12 }}
                                          >
                                             {r}
                                          </Typography.Text>
                                       </li>
                                    ))}
                                 </ul>
                              </Descriptions.Item>
                           )}
                        </Descriptions>
                     </Flex>
                  ) : selectedSection ? (
                     <Flex vertical gap="middle">
                        <Typography.Title level={5} style={{ margin: 0 }}>
                           #{selectedSection.order} {selectedSection.name}
                        </Typography.Title>
                        <Descriptions size="small" column={1} bordered>
                           <Descriptions.Item label="Section ID">
                              <Typography.Text code>
                                 {selectedSection.sectionId}
                              </Typography.Text>
                           </Descriptions.Item>
                           <Descriptions.Item label="Thứ tự">
                              {selectedSection.order}
                           </Descriptions.Item>
                           <Descriptions.Item label="Số phần tử đã ghép">
                              <Tag
                                 color={
                                    selectedSection.elementCount > 0
                                       ? "blue"
                                       : "gold"
                                 }
                              >
                                 {selectedSection.elementCount} phần tử
                              </Tag>
                           </Descriptions.Item>
                           <Descriptions.Item label="Source Locators">
                              {selectedSection.sourceLocators.length > 0
                                 ? selectedSection.sourceLocators.join(", ")
                                 : "không rõ"}
                           </Descriptions.Item>
                        </Descriptions>
                     </Flex>
                  ) : (
                     <Flex
                        vertical
                        align="center"
                        justify="center"
                        style={{ height: 320, color: "#8c8c8c" }}
                     >
                        <ApartmentOutlined
                           style={{
                              fontSize: 48,
                              marginBottom: 16,
                              color: "#d9d9d9",
                           }}
                        />
                        <Typography.Text type="secondary">
                           Bấm chọn một node hoặc section trong cây thiết kế bên
                           trái để xem chi tiết ánh xạ.
                        </Typography.Text>
                     </Flex>
                  )}
               </Card>
            </Col>
         </Row>
      </Flex>
   );
}
