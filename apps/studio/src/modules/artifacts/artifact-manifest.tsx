"use client";

/**
 * [29] DET Studio — W-C "Preview & Export" lane: artifact manifest + safe export.
 *
 * Presentational only. Data enters as the frozen `run.artifacts` slice; the
 * download affordance hands the WHOLE `StudioArtifactView` to the page via the
 * `onDownload` callback prop. This module performs NO fetch, NO route call and
 * NO blob fabrication of its own — real bytes can only come from the guarded
 * server reader (W-D) that the page wires in.
 *
 * Honesty rules enforced here:
 *  - `file` is a relative path under the run's out dir. Absolute-looking or
 *    parent-escaping values are a read-model contract violation: the path is
 *    WITHHELD and the row shows an explicit error state instead.
 *  - `contentHash` is shortened to its first 10 characters + "…"; the full
 *    hash stays in the row tooltip title, never rendered as if copied out.
 *  - `downloadable: false` renders a disabled control whose tooltip says why,
 *    truthfully: the run reader does not serve this artifact (DEMO/fixture
 *    data or an artifact not exposed for download).
 *  - Empty manifest renders a truthful EMPTY state, never an empty table.
 *
 * [61] Ant Design stock light appearance: Table via the `columns` prop (no
 * dot-notation subcomponents), the hash tooltip rides the cell via `onCell`,
 * ids/hashes are antd inline code, and the empty state stays a custom div so
 * no antd built-in empty table is ever rendered.
 */
import type { HTMLAttributes, ReactNode } from "react";
import {
  DownloadOutlined,
  InboxOutlined,
  LockOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { StudioArtifactView } from "@/src/shared/contracts";

export type ArtifactDownloadHandler = (artifact: StudioArtifactView) => void;

export interface ArtifactManifestProps {
  /** The `run.artifacts` slice of the frozen read model. */
  artifacts: readonly StudioArtifactView[];
  /**
   * Supplied by the page (server reader boundary). Called ONLY for rows whose
   * manifest entry says `downloadable: true`; receives the full artifact view.
   */
  onDownload: ArtifactDownloadHandler;
}

/** Number of leading hash characters rendered in the table. */
const HASH_SHORT_LENGTH = 10;

/**
 * Truthful tooltip for non-downloadable artifacts. A disabled control must
 * always say why: this artifact is not served by the run reader — DEMO/fixture
 * data and reader-unexposed artifacts have no real file to download.
 */
const NOT_DOWNLOADABLE_TOOLTIP =
  "Not downloadable — the run reader does not serve this artifact (DEMO/fixture data, or an artifact not exposed for download). Downloads exist only for reader-validated files.";

/**
 * A manifest `file` must be a relative path under the run's out dir. Anything
 * absolute-looking (POSIX slash, Windows drive/UNC) or parent-escaping is a
 * contract violation and must never be rendered.
 */
export function isUnsafeArtifactFile(file: string): boolean {
  if (file.length === 0) return true;
  if (file.startsWith("/") || file.startsWith("\\")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(file)) return true;
  const normalized = file.replace(/\\/g, "/");
  return normalized === ".." || normalized.startsWith("../");
}

/** `aaaaaaaaaa…` — enough to compare rows, never the full hash. */
function shortHash(hash: string): string {
  return `${hash.slice(0, HASH_SHORT_LENGTH)}…`;
}

const UNSAFE_PATH_TITLE =
  "Manifest files must be relative paths under the run output directory. This absolute-looking path is withheld and never rendered.";

/**
 * antd `onRow` prop bags accept arbitrary DOM attributes, but React's
 * `HTMLAttributes` type has no `data-*` index signature — a narrow cast keeps
 * the test-visible row attribute honest without loosening antd's own typing.
 */
function rowProps(
  props: Record<string, string>
): HTMLAttributes<HTMLTableRowElement> {
  return props as unknown as HTMLAttributes<HTMLTableRowElement>;
}

export function ArtifactManifest({
  artifacts,
  onDownload,
}: ArtifactManifestProps) {
  const columns: ColumnsType<StudioArtifactView> = [
    {
      title: "Role",
      width: 160,
      render: (_, artifact) => <Tag>{artifact.role}</Tag>,
    },
    {
      title: "File",
      render: (_, artifact) => <ArtifactFileCell file={artifact.file} />,
    },
    {
      title: "Schema",
      render: (_, artifact) => <SchemaRefCell schemaRef={artifact.schemaRef} />,
    },
    {
      title: "Content hash",
      width: 112,
      // The full hash stays a cell tooltip — visible on demand, never rendered
      // as if it were copied out.
      onCell: (artifact) => ({ title: artifact.contentHash ?? undefined }),
      render: (_, artifact) =>
        artifact.contentHash ? (
          <Typography.Text code>
            {shortHash(artifact.contentHash)}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "Download",
      width: 128,
      align: "right",
      render: (_, artifact) => (
        <DownloadCell artifact={artifact} onDownload={onDownload} />
      ),
    },
  ];

  return (
    <Card
      size="small"
      data-testid="artifact-manifest"
      title={<h2>Artifacts</h2>}
      extra={
        artifacts.length > 0 ? (
          <Tag data-testid="artifact-count">
            {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"}
          </Tag>
        ) : undefined
      }
    >
      <Typography.Paragraph type="secondary">
        Artifact manifest from the det run. Downloads are handed to the page
        and served only for reader-validated files.
      </Typography.Paragraph>
      {artifacts.length === 0 ? (
        <EmptyManifest />
      ) : (
        <Table<StudioArtifactView>
          rowKey="artifactId"
          columns={columns}
          dataSource={[...artifacts]}
          pagination={false}
          onRow={(artifact) =>
            rowProps({ "data-artifact-id": artifact.artifactId })
          }
        />
      )}
    </Card>
  );
}

/**
 * Truthful EMPTY state for a run without artifacts. A custom div — never the
 * antd Table's built-in empty rendering — so an empty manifest is visibly not
 * a rendered-but-empty table.
 */
function EmptyManifest(): ReactNode {
  return (
    <div data-testid="artifacts-empty">
      <Empty
        image={<InboxOutlined aria-hidden="true" />}
        description={
          <>
            <Typography.Text strong>No artifacts in this run</Typography.Text>
            <Typography.Paragraph type="secondary">
              When the run writes validated artifacts, they are listed here
              with their role, schema and content hash.
            </Typography.Paragraph>
          </>
        }
      />
    </div>
  );
}

/**
 * The relative file path — or, if the value is absolute-looking (a read-model
 * violation), an explicit error badge instead of the path itself.
 */
function ArtifactFileCell({ file }: { file?: string }) {
  if (!file) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  if (isUnsafeArtifactFile(file)) {
    return (
      <Tag
        color="error"
        data-testid="artifact-file-invalid"
        title={UNSAFE_PATH_TITLE}
        icon={<WarningOutlined aria-hidden="true" />}
      >
        Invalid file path withheld
      </Tag>
    );
  }
  return <Typography.Text code>{file}</Typography.Text>;
}

/**
 * schemaRef is a reference string, not guaranteed to be a URL: http(s)
 * references render as external links, everything else as secondary text.
 * Both keep the full value in the tooltip title.
 */
function SchemaRefCell({ schemaRef }: { schemaRef: string }) {
  if (/^https?:\/\//i.test(schemaRef)) {
    return (
      <Typography.Link
        href={schemaRef}
        target="_blank"
        rel="noreferrer"
        title={schemaRef}
        data-testid="artifact-schema-link"
      >
        {schemaRef}
      </Typography.Link>
    );
  }
  return (
    <Typography.Text
      type="secondary"
      title={schemaRef}
      data-testid="artifact-schema-text"
    >
      {schemaRef}
    </Typography.Text>
  );
}

/**
 * Download affordance per manifest truth. Enabled rows delegate to the
 * page-supplied `onDownload` (the module fetches nothing itself); disabled
 * rows are wrapped in a focusable span so the truthful tooltip is reachable
 * by keyboard, since the disabled button itself cannot carry it.
 */
function DownloadCell({
  artifact,
  onDownload,
}: {
  artifact: StudioArtifactView;
  onDownload: ArtifactDownloadHandler;
}) {
  if (artifact.downloadable) {
    return (
      <Button
        size="small"
        icon={<DownloadOutlined aria-hidden="true" />}
        data-testid={`artifact-download-${artifact.artifactId}`}
        onClick={() => onDownload(artifact)}
      >
        Download
      </Button>
    );
  }
  return (
    <Tooltip title={NOT_DOWNLOADABLE_TOOLTIP} trigger={["hover", "focus"]}>
      <span
        tabIndex={0}
        data-testid={`artifact-download-disabled-${artifact.artifactId}`}
      >
        <Button
          size="small"
          icon={<LockOutlined aria-hidden="true" />}
          disabled
        >
          Download
        </Button>
      </span>
    </Tooltip>
  );
}
