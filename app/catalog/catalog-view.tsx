"use client";

import { ApiOutlined, DatabaseOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Flex, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

import type {
  CatalogIntegrity,
  CatalogProjectView,
  CatalogRunStatus,
  CatalogRunView,
  CatalogStats,
} from "@/src/studio/server/catalog/studio-catalog";

/**
 * [61] Client view child for the Catalogue server page: stock antd light
 * heading, off/unavailable alerts, stats row and the two catalogue tables.
 * Terse Vietnamese operator copy ("ít chữ"); machine vocabulary stays
 * verbatim — run status enums (SUCCEEDED/PARTIAL/…), the integrity verdict
 * labels (verified/unverified/TAMPERED/files missing/manifest corrupt) and
 * mono ids/hashes in the stock `Typography.Text code` look. Table rows render
 * only when data exists, so empty-state messages below are real content. No
 * custom CSS or utility classes; inline heading styles are layout-only.
 */

function shortHash(hash: string): string {
  return hash.length > 19 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

const STATUS_TAG_COLOR: Record<CatalogRunStatus, "success" | "gold" | "processing" | "error" | "default"> = {
  SUCCEEDED: "success",
  PARTIAL: "gold",
  FAILED: "error",
  INTERRUPTED: "default",
  RUNNING: "processing",
};

/** Integrity badges never lie: the label always states the last-index state. */
const INTEGRITY_LABEL: Record<CatalogIntegrity, string> = {
  verified: "verified",
  unverified: "unverified",
  tampered: "TAMPERED",
  missing: "files missing",
  corrupt: "manifest corrupt",
};

const INTEGRITY_TAG_COLOR: Record<CatalogIntegrity, "success" | "default" | "error"> = {
  verified: "success",
  unverified: "default",
  tampered: "error",
  missing: "error",
  corrupt: "error",
};

const projectColumns: TableColumnsType<CatalogProjectView> = [
  {
    title: "Dự án",
    dataIndex: "id",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{record.id}</Typography.Text>
    ),
  },
  {
    title: "Nền tảng",
    dataIndex: "platformId",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{record.platformId}</Typography.Text>
    ),
  },
  {
    title: "Hash cấu hình (lần chạm cuối)",
    dataIndex: "configHash",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{shortHash(record.configHash)}</Typography.Text>
    ),
  },
  {
    title: "Lịch sử cấu hình",
    dataIndex: "configHistoryCount",
  },
  {
    title: "Số lần chạy",
    dataIndex: "runCount",
  },
  {
    title: "Lần đầu thấy",
    dataIndex: "firstSeenAt",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text type="secondary">{record.firstSeenAt}</Typography.Text>
    ),
  },
];

const runColumns: TableColumnsType<CatalogRunView> = [
  {
    title: "Lần chạy",
    dataIndex: "id",
    render: (_, record: CatalogRunView) =>
      record.bundlePresent ? (
        <Typography.Link href={`/runs/${encodeURIComponent(record.id)}`}>
          <Typography.Text code>{record.id}</Typography.Text>
        </Typography.Link>
      ) : (
        <Typography.Text code>{record.id}</Typography.Text>
      ),
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    render: (_, record: CatalogRunView) => (
      <Tag color={STATUS_TAG_COLOR[record.status]}>{record.status}</Tag>
    ),
  },
  {
    title: "Toàn vẹn (lần index cuối)",
    dataIndex: "integrity",
    render: (_, record: CatalogRunView) => (
      <Tag color={INTEGRITY_TAG_COLOR[record.integrity]}>{INTEGRITY_LABEL[record.integrity]}</Tag>
    ),
  },
  {
    title: "Dự án",
    dataIndex: "projectId",
    render: (_, record: CatalogRunView) =>
      record.projectId ?? (
        <Typography.Text type="secondary">không rõ (bản dựng đã bắt đầu)</Typography.Text>
      ),
  },
  {
    title: "Nguồn",
    dataIndex: "sourceId",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.sourceId ?? "—"}</Typography.Text>
    ),
  },
  {
    title: "Bản sửa",
    dataIndex: "revisionId",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.revisionId ?? "—"}</Typography.Text>
    ),
  },
  {
    title: "Ghim cấu hình",
    dataIndex: "configHash",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.configHash === "" ? "—" : shortHash(record.configHash)}</Typography.Text>
    ),
  },
  {
    title: "Số artifacts",
    dataIndex: "artifactCount",
  },
  {
    title: "Thời điểm",
    dataIndex: "indexedAt",
    render: (_, record: CatalogRunView) => (
      <Typography.Text type="secondary">
        {record.startedAt ?? "—"}
        {record.finishedAt !== null ? ` → ${record.finishedAt}` : ""}
        {record.startedAt === null && record.finishedAt === null ? `lưu danh mục ${record.indexedAt}` : ""}
      </Typography.Text>
    ),
  },
];

export interface CatalogViewProps {
  configured: boolean;
  offMessage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  projects: CatalogProjectView[];
  runs: CatalogRunView[];
  stats: CatalogStats | null;
}

export function CatalogView({
  configured,
  offMessage,
  errorCode,
  errorMessage,
  projects,
  runs,
  stats,
}: CatalogViewProps) {
  return (
    <Flex vertical gap={32}>
      <section aria-labelledby="catalog-heading">
        <Flex align="center" gap={8}>
          <DatabaseOutlined aria-hidden="true" />
          {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
          <h1 id="catalog-heading" style={{ margin: 0 }}>
            Dự án &amp; lần chạy
          </h1>
        </Flex>
      </section>

      {!configured ? (
        <Alert
          type="info"
          showIcon
          icon={<ApiOutlined aria-hidden="true" />}
          message="Catalog đang tắt"
          description={offMessage}
        />
      ) : errorCode !== null ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message={`Không đọc được catalog (${errorCode})`}
          description={errorMessage}
        />
      ) : (
        <>
          <Flex wrap="wrap" gap={16}>
            <span>
              <Typography.Text strong>{stats?.projects ?? 0}</Typography.Text> dự án
            </span>
            <span>
              <Typography.Text strong>{stats?.runs ?? 0}</Typography.Text> lần chạy (
              {stats
                ? `${stats.byStatus.SUCCEEDED} succeeded · ${stats.byStatus.PARTIAL} partial · ${stats.byStatus.FAILED} failed · ${stats.byStatus.INTERRUPTED} interrupted`
                : "—"}
              )
            </span>
            <span>
              <Typography.Text strong>{stats?.artifacts ?? 0}</Typography.Text> artifacts đã lưu
              danh mục
            </span>
          </Flex>

          <Card size="small" title={<h2 style={{ margin: 0 }}>Dự án</h2>}>
            {projects.length === 0 ? (
              <Typography.Text type="secondary">
                Chưa có dự án nào trong catalog. Chạy một bản dựng với catalog bật (xem trang Bản
                dựng) hoặc đặt một bundle hoàn tất vào thư mục runs đã cấu hình.
              </Typography.Text>
            ) : (
              <Table<CatalogProjectView>
                rowKey="id"
                columns={projectColumns}
                dataSource={projects}
                pagination={false}
                size="small"
              />
            )}
          </Card>

          <Card size="small" title={<h2 style={{ margin: 0 }}>Lần chạy</h2>}>
            {runs.length === 0 ? (
              <Typography.Text type="secondary">Chưa có lần chạy nào trong catalog.</Typography.Text>
            ) : (
              <Table<CatalogRunView>
                rowKey="id"
                columns={runColumns}
                dataSource={runs}
                pagination={false}
                size="small"
              />
            )}
          </Card>
        </>
      )}
    </Flex>
  );
}
