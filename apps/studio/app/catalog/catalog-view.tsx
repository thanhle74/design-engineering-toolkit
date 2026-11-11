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
} from "@/src/server/catalog/studio-catalog";

/**
 * [61] Client view child for the Catalogue server page: stock antd light
 * heading, off/unavailable alerts, stats row and the two catalogue tables.
 * Labels, integrity vocabulary and the "never lie" rule are carried over
 * verbatim from the previous markup; the empty paragraphs remain real content
 * (the antd Tables render only when rows exist). No custom CSS or utility
 * classes — mono tokens use the stock `Typography.Text code` look and the
 * status/integrity Tags keep antd's built-in color presets.
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
    title: "Project",
    dataIndex: "id",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{record.id}</Typography.Text>
    ),
  },
  {
    title: "Platform",
    dataIndex: "platformId",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{record.platformId}</Typography.Text>
    ),
  },
  {
    title: "Config hash (last observed)",
    dataIndex: "configHash",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text code>{shortHash(record.configHash)}</Typography.Text>
    ),
  },
  {
    title: "Config history",
    dataIndex: "configHistoryCount",
  },
  {
    title: "Runs",
    dataIndex: "runCount",
  },
  {
    title: "First seen",
    dataIndex: "firstSeenAt",
    render: (_, record: CatalogProjectView) => (
      <Typography.Text type="secondary">{record.firstSeenAt}</Typography.Text>
    ),
  },
];

const runColumns: TableColumnsType<CatalogRunView> = [
  {
    title: "Run",
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
    title: "Status",
    dataIndex: "status",
    render: (_, record: CatalogRunView) => (
      <Tag color={STATUS_TAG_COLOR[record.status]}>{record.status}</Tag>
    ),
  },
  {
    title: "Integrity (last index)",
    dataIndex: "integrity",
    render: (_, record: CatalogRunView) => (
      <Tag color={INTEGRITY_TAG_COLOR[record.integrity]}>{INTEGRITY_LABEL[record.integrity]}</Tag>
    ),
  },
  {
    title: "Project",
    dataIndex: "projectId",
    render: (_, record: CatalogRunView) =>
      record.projectId ?? <Typography.Text type="secondary">unknown (job started)</Typography.Text>,
  },
  {
    title: "Source",
    dataIndex: "sourceId",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.sourceId ?? "—"}</Typography.Text>
    ),
  },
  {
    title: "Revision",
    dataIndex: "revisionId",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.revisionId ?? "—"}</Typography.Text>
    ),
  },
  {
    title: "Config pin",
    dataIndex: "configHash",
    render: (_, record: CatalogRunView) => (
      <Typography.Text code>{record.configHash === "" ? "—" : shortHash(record.configHash)}</Typography.Text>
    ),
  },
  {
    title: "Artifacts",
    dataIndex: "artifactCount",
  },
  {
    title: "Timing",
    dataIndex: "indexedAt",
    render: (_, record: CatalogRunView) => (
      <Typography.Text type="secondary">
        {record.startedAt ?? "—"}
        {record.finishedAt !== null ? ` → ${record.finishedAt}` : ""}
        {record.startedAt === null && record.finishedAt === null ? `catalogued ${record.indexedAt}` : ""}
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
            Project / Run Catalog
          </h1>
        </Flex>
        <Typography.Paragraph type="secondary">
          Durable, inspectable metadata about known projects, builds and their verified artifacts,
          persisted across Studio restarts. Files remain the truth: the catalogue indexes what the
          build manifest declared and what the on-disk bytes verified — it never makes a missing or
          tampered artifact downloadable.
        </Typography.Paragraph>
      </section>

      {!configured ? (
        <Alert
          type="info"
          showIcon
          icon={<ApiOutlined aria-hidden="true" />}
          message="Catalogue off"
          description={offMessage}
        />
      ) : errorCode !== null ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message={`Catalogue unavailable (${errorCode})`}
          description={errorMessage}
        />
      ) : (
        <>
          <Flex wrap="wrap" gap={16}>
            <span>
              <Typography.Text strong>{stats?.projects ?? 0}</Typography.Text> projects
            </span>
            <span>
              <Typography.Text strong>{stats?.runs ?? 0}</Typography.Text> runs (
              {stats
                ? `${stats.byStatus.SUCCEEDED} succeeded · ${stats.byStatus.PARTIAL} partial · ${stats.byStatus.FAILED} failed · ${stats.byStatus.INTERRUPTED} interrupted`
                : "—"}
              )
            </span>
            <span>
              <Typography.Text strong>{stats?.artifacts ?? 0}</Typography.Text> catalogued
              artifacts
            </span>
          </Flex>

          <Card size="small" title={<h2 style={{ margin: 0 }}>Projects</h2>}>
            <Typography.Paragraph type="secondary">
              Identity comes from the validated build manifests (profile id = project id). The
              config hash is the last observed validated value; every historical hash stays in
              the per-run pins and the config history.
            </Typography.Paragraph>
            {projects.length === 0 ? (
              <Typography.Text type="secondary">
                No projects catalogued yet. Run a build with the catalogue enabled (see Build) or
                place a finished bundle in the configured runs root.
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

          <Card size="small" title={<h2 style={{ margin: 0 }}>Runs</h2>}>
            <Typography.Paragraph type="secondary">
              Build jobs and indexed bundles with their frozen pins (config hash, source identity)
              and the last index&apos;s integrity verdict. Bundle runs open in the normal run view —
              downloads there are re-verified against the manifest bytes, exactly as without the
              catalogue.
            </Typography.Paragraph>
            {runs.length === 0 ? (
              <Typography.Text type="secondary">No catalogued runs yet.</Typography.Text>
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
