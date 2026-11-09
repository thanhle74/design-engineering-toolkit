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
 *    hash stays in the tooltip title, never rendered as if copied out.
 *  - `downloadable: false` renders a disabled control whose tooltip says why,
 *    truthfully: the run reader does not serve this artifact (DEMO/fixture
 *    data or an artifact not exposed for download).
 *  - Empty manifest renders a truthful EMPTY state, not an empty table.
 */
import { Download, Lock, PackageOpen, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

export function ArtifactManifest({ artifacts, onDownload }: ArtifactManifestProps) {
  return (
    <Card size="sm" data-testid="artifact-manifest">
      <CardHeader>
        <CardTitle>
          <h2>Artifacts</h2>
        </CardTitle>
        <CardDescription>
          Artifact manifest from the det run. Downloads are handed to the page
          and served only for reader-validated files.
        </CardDescription>
        {artifacts.length > 0 ? (
          <CardAction>
            <Badge variant="secondary" data-testid="artifact-count">
              {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {artifacts.length === 0 ? (
          <div
            data-testid="artifacts-empty"
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center"
          >
            <PackageOpen aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No artifacts in this run</p>
            <p className="text-xs text-muted-foreground">
              When the run writes validated artifacts, they are listed here with
              their role, schema and content hash.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Role</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Schema</TableHead>
                <TableHead className="w-28">Content hash</TableHead>
                <TableHead className="w-32 text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {artifacts.map((artifact) => (
                <TableRow key={artifact.artifactId} data-artifact-id={artifact.artifactId}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {artifact.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <ArtifactFileCell file={artifact.file} />
                  </TableCell>
                  <TableCell>
                    <SchemaRefCell schemaRef={artifact.schemaRef} />
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={artifact.contentHash}>
                    {artifact.contentHash ? shortHash(artifact.contentHash) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DownloadCell artifact={artifact} onDownload={onDownload} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The relative file path — or, if the value is absolute-looking (a read-model
 * violation), an explicit error badge instead of the path itself.
 */
function ArtifactFileCell({ file }: { file?: string }) {
  if (!file) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (isUnsafeArtifactFile(file)) {
    return (
      <Badge
        variant="destructive"
        data-testid="artifact-file-invalid"
        title={UNSAFE_PATH_TITLE}
      >
        <TriangleAlert aria-hidden="true" />
        Invalid file path withheld
      </Badge>
    );
  }
  return <span className="break-all">{file}</span>;
}

/**
 * schemaRef is a reference string, not guaranteed to be a URL: http(s)
 * references render as external links, everything else as plain text. Both
 * truncate visually and keep the full value in the tooltip title.
 */
function SchemaRefCell({ schemaRef }: { schemaRef: string }) {
  if (/^https?:\/\//i.test(schemaRef)) {
    return (
      <a
        href={schemaRef}
        target="_blank"
        rel="noreferrer"
        title={schemaRef}
        data-testid="artifact-schema-link"
        className="block max-w-48 truncate text-xs underline underline-offset-4"
      >
        {schemaRef}
      </a>
    );
  }
  return (
    <span
      title={schemaRef}
      data-testid="artifact-schema-text"
      className="block max-w-48 truncate text-xs text-muted-foreground"
    >
      {schemaRef}
    </span>
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
        type="button"
        variant="outline"
        size="sm"
        data-testid={`artifact-download-${artifact.artifactId}`}
        onClick={() => onDownload(artifact)}
      >
        <Download aria-hidden="true" />
        Download
      </Button>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            data-testid={`artifact-download-disabled-${artifact.artifactId}`}
            className="inline-flex cursor-not-allowed"
          >
            <Button type="button" variant="outline" size="sm" disabled>
              <Lock aria-hidden="true" />
              Download
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">
          {NOT_DOWNLOADABLE_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
