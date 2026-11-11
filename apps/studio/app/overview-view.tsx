"use client";

import {
  ApiOutlined,
  FolderOpenOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Flex, Tag, Typography } from "antd";

import type { DetRunSummary } from "@/src/shared/contracts";
import { RunModeBadge } from "@/src/modules/mapping-review";
import { ConversionForm, DEMO_PROFILES } from "@/src/modules/conversions";

/**
 * [61] Client view child for the Overview server page: stock antd light
 * presentation (Flex/Typography/Card/Alert only — no custom CSS, no utility
 * classes) for the heading, conversion form, Build Control and Runs cards.
 * All copy, heading ids and semantics are carried over verbatim from the
 * previous markup; the raw h1/h2 elements keep their aria-labelledby targets.
 */

function unknownCount(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function RunRow({ run }: { run: DetRunSummary }) {
  return (
    <Typography.Link href={`/runs/${encodeURIComponent(run.runId)}`}>
      <Flex wrap="wrap" justify="space-between" align="center" gap={8}>
        <Flex align="center" gap={8} wrap="wrap">
          <Typography.Text strong>{run.label}</Typography.Text>
          <RunModeBadge mode={run.mode} />
        </Flex>
        <Flex align="center" gap={8} wrap="wrap">
          <Typography.Text type="secondary">
            errors {unknownCount(run.counts.errors)} · warnings{" "}
            {unknownCount(run.counts.warnings)} · infos {unknownCount(run.counts.infos)}
          </Typography.Text>
          <Typography.Text type="secondary" code>
            {run.runId}
          </Typography.Text>
        </Flex>
      </Flex>
    </Typography.Link>
  );
}

export interface OverviewViewProps {
  runs: readonly DetRunSummary[];
  readerErrorCode: string | null;
  readerMessage: string | null;
}

export function OverviewView({ runs, readerErrorCode, readerMessage }: OverviewViewProps) {
  return (
    <Flex vertical gap={32}>
      <section aria-labelledby="studio-overview-heading">
        {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
        <h1 id="studio-overview-heading" style={{ margin: 0 }}>
          DET Studio
        </h1>
        <Typography.Paragraph type="secondary">
          Review layer over the deterministic det CLI: inspect a conversion run,
          its mapping dispositions and diagnostics, and download validated
          artifacts. The engine owns all conversion logic — Studio never regenerates it.
        </Typography.Paragraph>
      </section>

      <ConversionForm profiles={DEMO_PROFILES} />

      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            <ToolOutlined aria-hidden="true" />
            {/* layout only: neutralize UA heading margins */}
            <h2 style={{ margin: 0 }}>Build Control</h2>
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          Trigger a real offline <Typography.Text code>det build</Typography.Text> through the local
          runner and download verified bundle artifacts. Requires configured env vars; without
          them the Build page shows an explicit not-connected state — never demo data.
        </Typography.Paragraph>
        <Button type="default" href="/build" icon={<ToolOutlined aria-hidden="true" />}>
          Open Build Control
        </Button>
      </Card>

      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            <FolderOpenOutlined aria-hidden="true" />
            {/* layout only: neutralize UA heading margins */}
            <h2 style={{ margin: 0 }}>Runs</h2>
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          Conversion runs this Studio instance can read. Fixture runs are
          visibly labeled DEMO; live runs come from a configured DET output
          root.
        </Typography.Paragraph>
        {readerErrorCode !== null ? (
          <Alert
            type="warning"
            showIcon
            icon={<ApiOutlined aria-hidden="true" />}
            message={`Reader not configured (${readerErrorCode})`}
            description={
              <>
                {readerMessage} Set the STUDIO_DET_RUNS_DIR environment variable
                to a DET run output root — or leave it unset to browse the DEMO
                fixture.
              </>
            }
          />
        ) : runs.length === 0 ? (
          <Flex align="center" gap={8} wrap="wrap">
            <WarningOutlined aria-hidden="true" />
            <Typography.Text type="secondary">
              No runs available. Configure STUDIO_DET_RUNS_DIR to point at real
              det output, or unset it for the DEMO fixture.
            </Typography.Text>
          </Flex>
        ) : (
          <Flex vertical gap={8}>
            {runs.map((run) => (
              <RunRow key={run.runId} run={run} />
            ))}
          </Flex>
        )}
      </Card>

      <Typography.Text type="secondary">
        Single local trusted operator UI — not a public/multi-user deployment.
        Starting a real conversion is intentionally not connected: issue [28]
        owns the engine bridge.
      </Typography.Text>
      <Tag>MVP scope: review · preview · export</Tag>
    </Flex>
  );
}
