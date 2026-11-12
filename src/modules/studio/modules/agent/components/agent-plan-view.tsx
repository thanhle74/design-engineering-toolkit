"use client";

/**
 * [65] Read-only render of one agent plan + its approval preview.
 *
 * Truthfulness: this view shows PROPOSALS only — never engine verdicts. The
 * genuine MAPPED/GAP dispositions appear on the ordinary run page of the
 * deterministic build started by approval. Machine vocabulary (node ids,
 * `design://` locators, role names, `observed`/`conjecture`) stays verbatim;
 * labels are natural Vietnamese. The ungrounded plan renders its limitations
 * and no approval affordance.
 */
import * as React from "react";
import { Button, Collapse, Flex, Table, Tag, Typography } from "antd";

import type { AgentPlan } from "@/src/modules/studio/shared/contracts";
import type { ApprovalPreview } from "@/src/modules/studio/server/claude-agent/plan-materializer";

export interface AgentPlanViewProps {
  plan: AgentPlan;
  approvalPreview: ApprovalPreview | null;
  approvalPreviewError: string | null;
  approvable: boolean;
  approving: boolean;
  onApprove: () => void;
  buildLink: { runId: string } | null;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  observed: "đã quan sát",
  conjecture: "suy đoán",
};

export function AgentPlanView(props: AgentPlanViewProps) {
  const { plan, approvalPreview, approvalPreviewError } = props;

  const ungrounded = plan.observed.grounded !== true;

  return (
    <section aria-labelledby="agent-plan-heading">
      <h3 id="agent-plan-heading">Kế hoạch đề xuất</h3>
      <Flex vertical gap="small" wrap="wrap">
        <Typography.Text>
          Nguồn yêu cầu: <Typography.Text code>{plan.requested.fileKey}</Typography.Text> node{" "}
          <Typography.Text code>{plan.requested.nodeId}</Typography.Text>
        </Typography.Text>
        <Typography.Text>
          Quan sát: root <Typography.Text code>{plan.observed.rootName ?? "không rõ"}</Typography.Text>, con trực tiếp:{" "}
          <Typography.Text code>{plan.observed.childCount === null ? "không rõ" : String(plan.observed.childCount)}</Typography.Text>
          {", grounded="}
          <Typography.Text code>{String(plan.observed.grounded)}</Typography.Text>
          {plan.observed.revisionId === null ? (
            <>
              {", revision: "}
              <Typography.Text code>mcp-observed-unpinned</Typography.Text>
            </>
          ) : null}
        </Typography.Text>

        {ungrounded ? (
          <div data-testid="plan-ungrounded">
            <Typography.Text strong>
              Không có dữ liệu Figma quan sát được — kế hoạch không thể duyệt.
            </Typography.Text>
          </div>
        ) : null}

        <SectionTable plan={plan} />

        {plan.siteChrome.length > 0 ? (
          <div>
            <Typography.Text strong>Chrome (loại khỏi Page Builder): </Typography.Text>
            {plan.siteChrome.map((chrome) => (
              <Typography.Paragraph key={`${chrome.sourceNodeId}`} type="secondary" style={{ marginBottom: 4 }}>
                <Typography.Text code>{chrome.name}</Typography.Text> ({chrome.sourceNodeId}) — {chrome.reason}
              </Typography.Paragraph>
            ))}
          </div>
        ) : null}

        {plan.unresolved.length > 0 ? (
          <div>
            <Typography.Text strong>Chưa phân loại được: </Typography.Text>
            {plan.unresolved.map((item, index) => (
              <Typography.Paragraph key={`${item.sourceNodeId}-${index}`} type="secondary" style={{ marginBottom: 4 }}>
                {item.sourceNodeId !== "" ? <Typography.Text code>{item.sourceNodeId}</Typography.Text> : null} — {item.reason}
              </Typography.Paragraph>
            ))}
          </div>
        ) : null}

        {plan.limitations.length > 0 ? (
          <div>
            <Typography.Text strong>Giới hạn quan sát: </Typography.Text>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {plan.limitations.map((limitation, index) => (
                <li key={`limitation-${index}`}>
                  <Typography.Text type="secondary">{limitation}</Typography.Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!ungrounded ? <ApprovalBox {...props} preview={approvalPreview} previewError={approvalPreviewError} /> : null}
      </Flex>
    </section>
  );
}

function SectionTable({ plan }: { plan: AgentPlan }) {
  const columns = [
    {
      title: "Section (tên Figma gốc)",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Typography.Text code>{name}</Typography.Text>,
    },
    { title: "Node", dataIndex: "sourceNodeId", key: "sourceNodeId", render: (id: string) => <Typography.Text code>{id}</Typography.Text> },
    { title: "Bố cục quan sát", dataIndex: "layout", key: "layout" },
    {
      title: "Đề xuất vai trò",
      key: "projection",
      render: (_: unknown, record: AgentPlan["sections"][number]) => (
        <Typography.Text>
          {record.projection.length > 0 ? (
            <>
              {record.projection.length} vai trò: {record.projection.map((a) => a.role).join(", ")}
            </>
          ) : (
            "không có"
          )}
        </Typography.Text>
      ),
    },
    {
      title: "Nội dung / capability",
      key: "extras",
      render: (_: unknown, record: AgentPlan["sections"][number]) => (
        <Flex gap={4} wrap="wrap">
          {record.contentRefs.length > 0 ? <Tag>{record.contentRefs.length} nội dung</Tag> : null}
          {record.capabilityHints.map((hint, index) => (
            <Tag key={`${hint.capabilityId}-${index}`} color={hint.confidence === "observed" ? "blue" : "default"}>
              {hint.capabilityId} · {CONFIDENCE_LABEL[hint.confidence] ?? hint.confidence}
            </Tag>
          ))}
        </Flex>
      ),
    },
  ];

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={plan.sections.map((section) => ({ ...section, key: section.sourceNodeId }))}
      pagination={false}
      expandable={{
        expandedRowRender: (record: AgentPlan["sections"][number]) => <SectionDetail section={record} />,
      }}
      locale={{ emptyText: "Không có section nào được đề xuất" }}
    />
  );
}

function SectionDetail({ section }: { section: AgentPlan["sections"][number] }) {
  return (
    <Flex vertical gap={4}>
      {section.capabilityHints.map((hint, index) => (
        <Typography.Text key={`hint-${index}`} type="secondary">
          <Typography.Text code>{hint.capabilityId}</Typography.Text> ({hint.confidence}) — {hint.reason}
        </Typography.Text>
      ))}
      {section.projection.map((assignment) => (
        <Typography.Text key={assignment.sourceNodeId} type="secondary">
          <Typography.Text code>{assignment.sourceNodeId}</Typography.Text> →{" "}
          <Typography.Text code>{assignment.role}</Typography.Text> — {assignment.reason}
        </Typography.Text>
      ))}
      {section.contentRefs.map((ref, index) => (
        <Typography.Text key={`content-${index}`} type="secondary">
          <Typography.Text code>{ref.sourceNodeId}</Typography.Text> ({ref.kind}
          {ref.excerpt !== "" ? `: “${ref.excerpt}”` : ""})
        </Typography.Text>
      ))}
    </Flex>
  );
}

function ApprovalBox(
  props: AgentPlanViewProps & { preview: ApprovalPreview | null; previewError: string | null }
) {
  const { approvable, approving, onApprove, buildLink, preview, previewError } = props;
  return (
    <Collapse
      items={[
        {
          key: "approve",
          label: 'Duyệt kế hoạch và chạy bản dựng "det build"',
          children: (
            <Flex vertical gap="small">
              {preview !== null ? (
                <Typography.Text>
                  Khớp nguồn đã ghim: <Typography.Text code>{preview.pinnedAssignments}</Typography.Text>/
                  <Typography.Text code>{preview.totalProposedAssignments}</Typography.Text> đề xuất.
                  {preview.droppedNodeIds.length > 0 ? (
                    <>
                      {" "}Bị loại (không có trong snapshot đã ghim): {preview.droppedNodeIds.join(", ")}
                    </>
                  ) : null}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">
                  Không tính được phép duyệt{previewError !== null ? ` — ${previewError}` : "."}
                </Typography.Text>
              )}
              <Typography.Text type="secondary">
                Duyệt chỉ ghi các đề xuất vai trò khớp nguồn đã ghim vào <Typography.Text code>semantic-projection.json</Typography.Text>{" "}
                của bản sao dự án, rồi chạy <Typography.Text code>det build</Typography.Text> deterministic. Nội dung và
                capability chỉ là đề xuất — không được áp dụng. Không có ghi nào vào Figma hay Magento.
              </Typography.Text>
              <Flex gap="small" align="center" wrap="wrap">
                <Button
                  type="primary"
                  onClick={onApprove}
                  disabled={!approvable || preview === null || preview.pinnedAssignments === 0}
                  loading={approving}
                >
                  Duyệt &amp; chạy det build
                </Button>
                {buildLink !== null ? (
                  <Typography.Text>
                    Bản dựng: <Typography.Link href={`/runs/${buildLink.runId}`}>{buildLink.runId}</Typography.Link>
                  </Typography.Text>
                ) : null}
              </Flex>
            </Flex>
          ),
        },
      ]}
    />
  );
}
