"use client";

/**
 * [74] Mapping inspector drawer (extracted from
 * `components/mapping-review-table.tsx` along its real seam: the per-entry
 * detail view).
 *
 * The drawer binds to ONE exact `StudioMappingView` object — the occurrence
 * the operator clicked ([74] row-identity work), so duplicate nodeIds can
 * never cross-bind. Facts render verbatim; optional facts render "không rõ",
 * never a fabricated value; the raw JSON block keeps the full entry
 * inspectable. [61] Ant Design stock light Drawer/Descriptions.
 */
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import {
   Button,
   Card,
   Descriptions,
   Drawer,
   Flex,
   Tag,
   Typography,
} from "antd";

import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import {
   ComposeDispositionBadge,
   KindBadge,
   ReviewDispositionBadge,
} from "./disposition-badges";

/** Muted stand-in for a fact the run does not carry. Never a zero. */
const UNKNOWN = "không rõ";

export function MappingInspector({
   mapping,
   copied,
   onCopyId,
   onClose,
}: {
   mapping: StudioMappingView | null;
   copied: boolean;
   onCopyId: (nodeId: string) => void;
   onClose: () => void;
}) {
   return (
      <Drawer
         title={
            mapping ? (
               <Flex align="center" gap={8}>
                  <span>Chi tiết ánh xạ:</span>
                  <Typography.Text code>{mapping.nodeId}</Typography.Text>
               </Flex>
            ) : (
               "Chi tiết Node"
            )
         }
         open={mapping !== null}
         onClose={onClose}
         size={520}
      >
         {mapping && (
            <Flex vertical gap="middle">
               <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Node ID">
                     <Flex justify="space-between" align="center">
                        <Typography.Text code copyable={false}>
                           {mapping.nodeId}
                        </Typography.Text>
                        <Button
                           size="small"
                           type="text"
                           icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                           onClick={() => onCopyId(mapping.nodeId)}
                        >
                           Copy ID
                        </Button>
                     </Flex>
                  </Descriptions.Item>
                  <Descriptions.Item label="Tên lớp trong Figma">
                     <Typography.Text strong>
                        {mapping.sourceName || UNKNOWN}
                     </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Loại (Kind)">
                     <KindBadge kind={mapping.kind} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Lớp ngữ nghĩa">
                     <Typography.Text code>
                        {mapping.semanticClass || UNKNOWN}
                     </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Vị trí nguồn (Locator)">
                     <Typography.Text code style={{ wordBreak: "break-all" }}>
                        {mapping.sourceLocator || UNKNOWN}
                     </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Compose Disposition">
                     <ComposeDispositionBadge
                        disposition={mapping.composeDisposition}
                     />
                  </Descriptions.Item>
                  <Descriptions.Item label="Review Disposition">
                     {mapping.reviewDisposition ? (
                        <ReviewDispositionBadge
                           disposition={mapping.reviewDisposition}
                        />
                     ) : (
                        <Typography.Text type="secondary">—</Typography.Text>
                     )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Cần rà soát (needsReview)">
                     <Tag color={mapping.needsReview ? "warning" : "default"}>
                        {mapping.needsReview ? "CẦN RÀ SOÁT" : "Bình thường"}
                     </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Đích Magento Page Builder">
                     {mapping.target ? (
                        <Flex vertical gap={4}>
                           <div>
                              <b>Capability:</b>{" "}
                              <Typography.Text code>
                                 {mapping.target.capabilityId}
                              </Typography.Text>
                           </div>
                           <div>
                              <b>Appearance:</b>{" "}
                              <Tag>{mapping.target.appearanceId}</Tag>
                           </div>
                           {(mapping.target.nativeElement ||
                              mapping.target.nativeField) && (
                              <div>
                                 <b>Element / Field:</b>{" "}
                                 <Typography.Text type="secondary">
                                    {mapping.target.nativeElement ?? UNKNOWN} ·{" "}
                                    {mapping.target.nativeField ?? UNKNOWN}
                                 </Typography.Text>
                              </div>
                           )}
                        </Flex>
                     ) : (
                        <Typography.Text type="secondary">
                           {mapping.composeDisposition === "mapped"
                              ? UNKNOWN
                              : "Chưa gắn đích"}
                        </Typography.Text>
                     )}
                  </Descriptions.Item>
                  {mapping.note && (
                     <Descriptions.Item label="Ghi chú">
                        <Typography.Text>{mapping.note}</Typography.Text>
                     </Descriptions.Item>
                  )}
                  {mapping.reasons.length > 0 && (
                     <Descriptions.Item label="Danh sách lý do">
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                           {mapping.reasons.map((r, i) => (
                              <li key={i}>
                                 <Typography.Text type="secondary">
                                    {r}
                                 </Typography.Text>
                              </li>
                           ))}
                        </ul>
                     </Descriptions.Item>
                  )}
               </Descriptions>

               <Card size="small" title="Dữ liệu JSON thô">
                  <pre
                     style={{
                        fontSize: 11,
                        margin: 0,
                        background: "#fafafa",
                        padding: 8,
                        borderRadius: 4,
                        overflowX: "auto",
                     }}
                  >
                     {JSON.stringify(mapping, null, 2)}
                  </pre>
               </Card>
            </Flex>
         )}
      </Drawer>
   );
}
