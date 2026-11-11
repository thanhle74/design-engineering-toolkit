"use client";

import {
  ApiOutlined,
  FolderOpenOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Flex, Typography } from "antd";

import type { DetRunSummary } from "@/src/shared/contracts";
import { RunModeBadge } from "@/src/modules/mapping-review";
import { ConversionForm, DEMO_PROFILES } from "@/src/modules/conversions";

/**
 * [61] Client view child for the Overview server page: stock antd light
 * presentation (Flex/Typography/Card/Button/Alert only — no custom CSS, no
 * utility classes), terse Vietnamese operator copy ("ít chữ"). Machine tokens
 * (ids, error codes, STUDIO_DET_RUNS_DIR) stay verbatim; raw h1/h2 keep their
 * aria-labelledby targets. The inline heading styles are layout-only.
 */

function unknownCount(value: number | null): string {
  return value === null ? "không rõ" : String(value);
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
            lỗi {unknownCount(run.counts.errors)} · cảnh báo{" "}
            {unknownCount(run.counts.warnings)} · thông tin {unknownCount(run.counts.infos)}
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
        <Flex vertical gap={12} align="flex-start">
          {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
          <h1 id="studio-overview-heading" style={{ margin: 0 }}>
            Tổng quan
          </h1>
          <Button type="default" href="/build" icon={<ToolOutlined aria-hidden="true" />}>
            Tạo bản dựng
          </Button>
        </Flex>
      </section>

      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            <FolderOpenOutlined aria-hidden="true" />
            {/* layout only: neutralize UA heading margins */}
            <h2 style={{ margin: 0 }}>Lần chạy gần đây</h2>
          </Flex>
        }
      >
        {readerErrorCode !== null ? (
          <Alert
            type="warning"
            showIcon
            icon={<ApiOutlined aria-hidden="true" />}
            message={`Chưa cấu hình trình đọc lần chạy (${readerErrorCode})`}
            description={
              <>
                {readerMessage} Đặt biến môi trường{" "}
                <Typography.Text code>STUDIO_DET_RUNS_DIR</Typography.Text> trỏ tới thư mục output
                det, hoặc bỏ trống để xem fixture DEMO.
              </>
            }
          />
        ) : runs.length === 0 ? (
          <Flex align="center" gap={8} wrap="wrap">
            <WarningOutlined aria-hidden="true" />
            <Typography.Text type="secondary">
              Chưa có lần chạy nào. Đặt{" "}
              <Typography.Text code>STUDIO_DET_RUNS_DIR</Typography.Text> trỏ tới output det thật,
              hoặc bỏ trống để dùng fixture DEMO.
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

      {/* No Card title on purpose: ConversionForm renders its own h2 "Chuyển đổi mới" */}
      <Card size="small">
        <Flex vertical gap={8}>
          <ConversionForm profiles={DEMO_PROFILES} />
          <Typography.Text type="secondary">Chưa hỗ trợ chạy trực tiếp.</Typography.Text>
        </Flex>
      </Card>
    </Flex>
  );
}
