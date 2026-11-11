"use client";

import { SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Flex, List, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

import type { StudioBuildStageView, StudioRunView } from "@/src/shared/contracts";

/**
 * [40] Build-bundle section — rendered ONLY when the run view carries the
 * additive `build` block (i.e. the run is a `det build` bundle). Shows the
 * persisted stage table, the honest gap list, and Studio-side manifest
 * verification truth. Native Page Builder HTML stays source/download only:
 * no Magento storefront or Admin preview is claimed anywhere here.
 *
 * [61] Stock antd light presentation only: Card/Alert/Table/List/Flex and the
 * stock `Text code` inline-code look for mono tokens; no custom CSS or
 * utility classes. The two inline styles are pure layout (documented inline).
 */

type StageRow = Pick<StudioBuildStageView, "stage" | "status" | "exitCode" | "outDir">;

const stageColumns: TableColumnsType<StageRow> = [
  {
    title: "Stage",
    dataIndex: "stage",
    render: (_, record: StageRow) => <Typography.Text code>{record.stage}</Typography.Text>,
  },
  {
    title: "Status",
    dataIndex: "status",
    render: (_, record: StageRow) =>
      record.status === "failed" ? (
        <Tag color="error">{record.status}</Tag>
      ) : (
        <Tag>{record.status}</Tag>
      ),
  },
  {
    title: "Exit code",
    dataIndex: "exitCode",
    render: (_, record: StageRow) => <Typography.Text code>{record.exitCode}</Typography.Text>,
  },
  {
    title: "Output dir",
    dataIndex: "outDir",
    render: (_, record: StageRow) => (
      <Typography.Text code>{record.outDir ?? "—"}</Typography.Text>
    ),
  },
];

export function BuildBundleSection({ run }: { run: StudioRunView }) {
  const build = run.build;
  if (build === undefined) return null;

  const failedStages = build.stages.filter((stage) => stage.status === "failed");

  return (
    <Card
      size="small"
      title={
        <Flex align="center" gap={8}>
          <SafetyCertificateOutlined aria-hidden="true" />
          {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
          <h2 style={{ margin: 0 }}>Build bundle</h2>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Typography.Paragraph type="secondary">
          Assembled from the build-manifest.json bundle written by{" "}
          <Typography.Text code>det build</Typography.Text> (profile{" "}
          <Typography.Text code>{run.profileId ?? "unknown"}</Typography.Text>, platform{" "}
          <Typography.Text code>{run.platformId ?? "unknown"}</Typography.Text>). The root manifest is
          the trust anchor; every declared output is re-checked against its recorded SHA-256 and
          byte size before it is downloadable.
        </Typography.Paragraph>

        {build.manifestVerified ? (
          <Flex align="center" gap={8} wrap="wrap">
            <SafetyCertificateOutlined aria-hidden="true" />
            <Typography.Text type="secondary">
              Manifest verified: every declared output matches its recorded SHA-256 and byte size.
            </Typography.Text>
          </Flex>
        ) : (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Manifest verification failed"
            description="At least one declared output does not match the recorded SHA-256/bytes — the bundle is tampered or stale. Downloads of manifest outputs are refused until the bundle is rebuilt."
          />
        )}

        <Table<StageRow>
          rowKey="stage"
          columns={stageColumns}
          dataSource={build.stages}
          pagination={false}
          size="small"
        />

        <Flex vertical gap={8}>
          {/* layout only: neutralize UA heading margins */}
          <h3 style={{ margin: 0 }}>Gaps {failedStages.length > 0 ? "" : "and boundaries"}</h3>
          <List
            size="small"
            dataSource={build.gaps}
            renderItem={(gap) => (
              <List.Item>
                <Flex vertical gap={4}>
                  <Typography.Text code>
                    {gap.code}
                    {gap.count !== undefined ? ` · count ${gap.count}` : ""}
                  </Typography.Text>
                  <Typography.Text type="secondary">{gap.message}</Typography.Text>
                </Flex>
              </List.Item>
            )}
          />
        </Flex>

        <Typography.Text type="secondary">
          Config identity <Typography.Text code>{build.configContentHash}</Typography.Text> · This
          bundle is an offline build. Native Page Builder HTML is offered as{" "}
          <strong>source/download only</strong> — installing it into a Magento instance and any
          storefront/Admin preview remain operator steps (see the manifest gaps), never claims of
          this UI.
        </Typography.Text>
      </Flex>
    </Card>
  );
}
