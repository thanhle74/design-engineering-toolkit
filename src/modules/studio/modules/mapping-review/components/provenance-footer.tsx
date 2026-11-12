"use client";

/**
 * [29] Studio — provenance footer.
 *
 * Provenance is mandatory: a fixture run is always visibly labeled DEMO, and
 * unknown facts (null source id/revision/timestamps/counts) render "không rõ",
 * never 0, so fixture data can never masquerade as a live conversion.
 *
 * [61] Vietnamese + progressive disclosure ("ít chữ"): the DEMO/LIVE badge and
 * the honest error/warning/info counts stay VISIBLE as a single line; every
 * machine id fact (run id, source, revision, timestamps, profile, platform,
 * exit code, tool command) moves one click away into a stock antd Collapse
 * item "Chi tiết kỹ thuật". The item uses the stock `forceRender` prop so the
 * facts stay present (and testable) in the DOM even while collapsed. Stock
 * light Card; the plain <dl> markup is kept so the provenance facts stay
 * plain, testable label/value pairs. Ids and hashes use antd inline code
 * (`Typography.Text code`).
 */
import type { ReactNode } from "react";
import { Card, Collapse, Flex, Typography } from "antd";
import type { StudioRunView } from "@/src/modules/studio/shared/contracts";
import { RunModeBadge } from "./disposition-badges";

const UNKNOWN = "không rõ";

function unknownIfNull(value: string | null): string {
  return value === null ? UNKNOWN : value;
}

function countOrNull(value: number | null): string {
  return value === null ? UNKNOWN : String(value);
}

function ProvenanceField({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div>
      <dt>
        <Typography.Text type="secondary">{label}</Typography.Text>
      </dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  );
}

export function ProvenanceFooter({ run }: { run: StudioRunView }) {
  return (
    <Card
      size="small"
      data-testid="provenance-footer"
      title={
        <Flex wrap="wrap" align="center" gap="small">
          <span>Nguồn gốc dữ liệu</span>
          <RunModeBadge mode={run.mode} />
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        {run.label}
      </Typography.Paragraph>
      <p data-testid="provenance-counts">
        <Typography.Text type="secondary">
          lỗi: {countOrNull(run.counts.errors)} · cảnh báo:{" "}
          {countOrNull(run.counts.warnings)} · thông tin:{" "}
          {countOrNull(run.counts.infos)}
        </Typography.Text>
      </p>
      <Collapse
        items={[
          {
            key: "chi-tiet-ky-thuat",
            label: "Chi tiết kỹ thuật",
            // Stock antd prop: keep the machine facts in the DOM even while
            // the item is collapsed — present and reachable, not hidden.
            forceRender: true,
            children: (
              <dl>
                <ProvenanceField label="Lần chạy" testId="provenance-run">
                  <Typography.Text code>{run.runId}</Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Nguồn" testId="provenance-source">
                  <Typography.Text code>
                    {unknownIfNull(run.source.sourceId)}
                  </Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Bản sửa" testId="provenance-revision">
                  <Typography.Text code>
                    {unknownIfNull(run.source.revisionId)}
                  </Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Truy cập lúc" testId="provenance-accessed">
                  <Typography.Text code>
                    {unknownIfNull(run.source.accessedAt)}
                  </Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Hồ sơ" testId="provenance-profile">
                  <Typography.Text code>
                    {unknownIfNull(run.profileId)}
                  </Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Nền tảng" testId="provenance-platform">
                  <Typography.Text code>
                    {unknownIfNull(run.platformId)}
                  </Typography.Text>
                </ProvenanceField>
                <ProvenanceField label="Mã thoát" testId="provenance-exit-code">
                  {run.exitCode === null ? UNKNOWN : String(run.exitCode)}
                </ProvenanceField>
                {run.toolCommand && (
                  <ProvenanceField label="Lệnh công cụ" testId="provenance-command">
                    <Typography.Text code>{run.toolCommand}</Typography.Text>
                  </ProvenanceField>
                )}
                {run.generatedAt && (
                  <ProvenanceField label="Tạo lúc" testId="provenance-generated">
                    <Typography.Text code>{run.generatedAt}</Typography.Text>
                  </ProvenanceField>
                )}
              </dl>
            ),
          },
        ]}
      />
    </Card>
  );
}
