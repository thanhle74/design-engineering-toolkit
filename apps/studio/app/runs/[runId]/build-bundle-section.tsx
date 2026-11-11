"use client";

import { SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

import type { StudioBuildStageView, StudioRunView } from "@/src/shared/contracts";

/**
 * [40] Build-bundle section — rendered ONLY when the run view carries the
 * additive `build` block (i.e. the run is a `det build` bundle). Shows the
 * persisted stage table, the honest gap list, and Studio-side manifest
 * verification truth. Native Page Builder HTML stays source/download only:
 * no Magento storefront or Admin preview is claimed anywhere here.
 */

type StageRow = Pick<StudioBuildStageView, "stage" | "status" | "exitCode" | "outDir">;

const stageColumns: TableColumnsType<StageRow> = [
  {
    title: "Stage",
    dataIndex: "stage",
    render: (_, record: StageRow) => <span className="font-mono">{record.stage}</span>,
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
    render: (_, record: StageRow) => <span className="font-mono">{record.exitCode}</span>,
  },
  {
    title: "Output dir",
    dataIndex: "outDir",
    render: (_, record: StageRow) => (
      <span className="font-mono text-xs">{record.outDir ?? "—"}</span>
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
        <span className="flex items-center gap-2">
          <SafetyCertificateOutlined aria-hidden="true" />
          <h2 className="text-base font-semibold">Build bundle</h2>
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <Typography.Paragraph type="secondary" className="text-sm">
          Assembled from the build-manifest.json bundle written by{" "}
          <span className="font-mono">det build</span> (profile{" "}
          <span className="font-mono">{run.profileId ?? "unknown"}</span>, platform{" "}
          <span className="font-mono">{run.platformId ?? "unknown"}</span>). The root manifest is
          the trust anchor; every declared output is re-checked against its recorded SHA-256 and
          byte size before it is downloadable.
        </Typography.Paragraph>

        {build.manifestVerified ? (
          <p className="flex items-center gap-2 text-sm">
            <SafetyCertificateOutlined aria-hidden="true" />
            <Typography.Text type="secondary">
              Manifest verified: every declared output matches its recorded SHA-256 and byte size.
            </Typography.Text>
          </p>
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

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Gaps {failedStages.length > 0 ? "" : "and boundaries"}
          </h3>
          <ul className="flex flex-col gap-2">
            {build.gaps.map((gap) => (
              <li key={gap.code} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                <span className="font-mono text-xs font-medium">
                  {gap.code}
                  {gap.count !== undefined ? ` · count ${gap.count}` : ""}
                </span>
                <Typography.Text type="secondary" className="text-sm">
                  {gap.message}
                </Typography.Text>
              </li>
            ))}
          </ul>
        </div>

        <Typography.Text type="secondary" className="text-xs">
          Config identity <span className="font-mono">{build.configContentHash}</span> · This bundle
          is an offline build. Native Page Builder HTML is offered as{" "}
          <strong>source/download only</strong> — installing it into a Magento instance and any
          storefront/Admin preview remain operator steps (see the manifest gaps), never claims of
          this UI.
        </Typography.Text>
      </div>
    </Card>
  );
}
