"use client";

import { useState } from "react";

import { Flex, Typography } from "antd";

import { ArtifactManifest } from "@/src/modules/studio/modules/artifacts";
import type { StudioArtifactView } from "@/src/modules/studio/shared/contracts";

/**
 * Integrator-owned client bridge between the presentational ArtifactManifest
 * and the guarded download route. The manifest only calls `onDownload` for
 * rows whose manifest entry says `downloadable: true`; failures surface as an
 * inline error — never a fake success.
 */

interface ClientArtifactManifestProps {
   runId: string;
   artifacts: readonly StudioArtifactView[];
}

function fileNameFromDisposition(
   disposition: string | null,
   artifact: StudioArtifactView,
): string {
   const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(
      disposition ?? "",
   );
   if (match?.[1]) return decodeURIComponent(match[1]);
   return artifact.artifactId.split("/").pop() ?? "artifact";
}

export function ClientArtifactManifest({
   runId,
   artifacts,
}: ClientArtifactManifestProps) {
   const [error, setError] = useState<string | null>(null);

   async function onDownload(artifact: StudioArtifactView): Promise<void> {
      setError(null);
      try {
         const response = await fetch(
            `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`,
         );
         if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
               error?: { code?: string; message?: string };
            } | null;
            setError(
               `Tải xuống bị từ chối (HTTP ${response.status}${body?.error?.code ? ` · ${body.error.code}` : ""}).`,
            );
            return;
         }
         const blob = await response.blob();
         const url = URL.createObjectURL(blob);
         const anchor = document.createElement("a");
         anchor.href = url;
         anchor.download = fileNameFromDisposition(
            response.headers.get("content-disposition"),
            artifact,
         );
         document.body.append(anchor);
         anchor.click();
         anchor.remove();
         URL.revokeObjectURL(url);
      } catch {
         setError("Tải xuống thất bại — route artifact không truy cập được.");
      }
   }

   return (
      <Flex vertical gap={8}>
         <ArtifactManifest artifacts={artifacts} onDownload={onDownload} />
         {error !== null ? (
            <p role="alert">
               <Typography.Text type="danger">{error}</Typography.Text>
            </p>
         ) : null}
      </Flex>
   );
}
