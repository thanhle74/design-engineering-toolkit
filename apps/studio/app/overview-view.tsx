"use client";

import Link from "next/link";
import {
  ApiOutlined,
  FolderOpenOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Tag, Typography } from "antd";

import type { DetRunSummary } from "@/src/shared/contracts";
import { RunModeBadge } from "@/src/modules/mapping-review";
import { ConversionForm, DEMO_PROFILES } from "@/src/modules/conversions";

/**
 * [61] Client view child for the Overview server page: antd light-only
 * presentation for the heading, conversion form, Build Control and Runs
 * cards. All copy, heading ids and hit-target sizes are carried over
 * verbatim from the previous shadcn markup.
 */

function unknownCount(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function RunRow({ run }: { run: DetRunSummary }) {
  return (
    <Link
      href={`/runs/${encodeURIComponent(run.runId)}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-4 py-3 text-sm transition-colors"
    >
      <span className="font-medium">{run.label}</span>
      <RunModeBadge mode={run.mode} />
      <span className="ml-auto flex items-center gap-2 text-xs">
        <Typography.Text type="secondary">
          errors {unknownCount(run.counts.errors)} · warnings{" "}
          {unknownCount(run.counts.warnings)} · infos {unknownCount(run.counts.infos)}
        </Typography.Text>
        <Typography.Text type="secondary" className="font-mono">
          {run.runId}
        </Typography.Text>
      </span>
    </Link>
  );
}

export interface OverviewViewProps {
  runs: readonly DetRunSummary[];
  readerErrorCode: string | null;
  readerMessage: string | null;
}

export function OverviewView({ runs, readerErrorCode, readerMessage }: OverviewViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="studio-overview-heading">
        <h1
          id="studio-overview-heading"
          className="text-xl font-semibold tracking-tight md:text-2xl"
        >
          DET Studio
        </h1>
        <Typography.Paragraph type="secondary" className="mt-2 max-w-3xl text-sm">
          Review layer over the deterministic det CLI: inspect a conversion run,
          its mapping dispositions and diagnostics, and download validated
          artifacts. The engine owns all conversion logic — Studio never regenerates it.
        </Typography.Paragraph>
      </section>

      <ConversionForm profiles={DEMO_PROFILES} />

      <Card
        size="small"
        title={
          <span className="flex items-center gap-2">
            <ToolOutlined aria-hidden="true" />
            <h2 className="text-base font-semibold">Build Control</h2>
          </span>
        }
      >
        <Typography.Paragraph type="secondary" className="text-sm">
          Trigger a real offline <span className="font-mono">det build</span> through the local
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
          <span className="flex items-center gap-2">
            <FolderOpenOutlined aria-hidden="true" />
            <h2 className="text-base font-semibold">Runs</h2>
          </span>
        }
      >
        <Typography.Paragraph type="secondary" className="text-sm">
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
          <p className="flex items-center gap-2 text-sm">
            <WarningOutlined aria-hidden="true" />
            <Typography.Text type="secondary">
              No runs available. Configure STUDIO_DET_RUNS_DIR to point at real
              det output, or unset it for the DEMO fixture.
            </Typography.Text>
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {runs.map((run) => (
              <RunRow key={run.runId} run={run} />
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs">
        <Typography.Text type="secondary">
          Single local trusted operator UI — not a public/multi-user deployment.
          Starting a real conversion is intentionally not connected: issue [28]
          owns the engine bridge.
        </Typography.Text>
      </p>
      <Tag className="w-fit">MVP scope: review · preview · export</Tag>
    </div>
  );
}
