"use client";

/**
 * [29] Studio — provenance footer.
 *
 * Provenance is mandatory: a fixture run is always visibly labeled DEMO, and
 * unknown facts (null source id/revision/timestamps/counts) render "unknown",
 * never 0, so fixture data can never masquerade as a live conversion.
 *
 * [61] Ant Design stock light Card; the plain <dl> markup is kept so the
 * provenance facts stay as plain, testable label/value pairs. Ids and hashes
 * use antd inline code (`Typography.Text code`).
 */
import type { ReactNode } from "react";
import { Card, Flex, Typography } from "antd";
import type { StudioRunView } from "@/src/shared/contracts";
import { RunModeBadge } from "./disposition-badges";

const UNKNOWN = "unknown";

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
          <span>Provenance</span>
          <RunModeBadge mode={run.mode} />
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        {run.label}
      </Typography.Paragraph>
      <dl>
        <ProvenanceField label="Run" testId="provenance-run">
          <Typography.Text code>{run.runId}</Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Source ID" testId="provenance-source">
          <Typography.Text code>
            {unknownIfNull(run.source.sourceId)}
          </Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Revision" testId="provenance-revision">
          <Typography.Text code>
            {unknownIfNull(run.source.revisionId)}
          </Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Accessed at" testId="provenance-accessed">
          <Typography.Text code>
            {unknownIfNull(run.source.accessedAt)}
          </Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Profile" testId="provenance-profile">
          <Typography.Text code>
            {unknownIfNull(run.profileId)}
          </Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Platform" testId="provenance-platform">
          <Typography.Text code>
            {unknownIfNull(run.platformId)}
          </Typography.Text>
        </ProvenanceField>
        <ProvenanceField label="Exit code" testId="provenance-exit-code">
          {run.exitCode === null ? UNKNOWN : String(run.exitCode)}
        </ProvenanceField>
        <ProvenanceField label="Diagnostic counts" testId="provenance-counts">
          errors: {countOrNull(run.counts.errors)} · warnings:{" "}
          {countOrNull(run.counts.warnings)} · infos:{" "}
          {countOrNull(run.counts.infos)}
        </ProvenanceField>
        {run.toolCommand && (
          <ProvenanceField label="Tool command" testId="provenance-command">
            <Typography.Text code>{run.toolCommand}</Typography.Text>
          </ProvenanceField>
        )}
        {run.generatedAt && (
          <ProvenanceField label="Generated at" testId="provenance-generated">
            <Typography.Text code>{run.generatedAt}</Typography.Text>
          </ProvenanceField>
        )}
      </dl>
    </Card>
  );
}
