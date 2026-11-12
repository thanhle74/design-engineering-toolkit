import { Col, Flex, Row } from "antd";
import { connection } from "next/server";

import {
   DetRunReaderError,
   type StudioRunView,
} from "@/src/modules/studio/shared/contracts";
import { getDetRunReader } from "@/src/modules/studio/server/det-run-reader-factory";
import { DesignTree } from "@/src/modules/studio/modules/design-tree";
import {
   MappingReview,
   ProvenanceFooter,
} from "@/src/modules/studio/modules/mapping-review";
import { PreviewPanel } from "@/src/modules/studio/modules/preview";
import { ClientArtifactManifest } from "./client-artifact-manifest";
import { BuildBundleSection } from "./build-bundle-section";
import { RunHeader } from "./run-header";
import { ReaderProblemState } from "./reader-problem-state";

interface RunPageProps {
   params: Promise<{ runId: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
   // Run data is read from local disk per request. fs/env are not tracked as
   // dynamic APIs by Cache Components, so signal request-time explicitly.
   await connection();

   const { runId: rawRunId } = await params;
   const runId = decodeURIComponent(rawRunId);

   let run: StudioRunView;
   try {
      const reader = await getDetRunReader();
      run = await reader.getRun(runId);
   } catch (error) {
      if (error instanceof DetRunReaderError) {
         // [61] operator-facing copy is Vietnamese; machine tokens (the raw run
         // id, the reader error code, STUDIO_DET_RUNS_DIR) stay verbatim. The
         // reader's own English message renders verbatim — never paraphrased.
         if (error.code === "run-not-found") {
            return (
               <ReaderProblemState
                  kind="run-not-found"
                  title="Không tìm thấy lần chạy"
                  message={`Không có lần chạy nào với id "${runId}" mà Studio này đọc được.`}
                  hint="Hãy chọn một lần chạy trong danh sách tổng quan; run id lấy từ thư mục output DET đã cấu hình (hoặc từ fixture DEMO)."
               />
            );
         }
         return (
            <ReaderProblemState
               kind="reader-error"
               title={`Lỗi đọc lần chạy (${error.code})`}
               message={error.message}
               hint="Kiểm tra cấu hình STUDIO_DET_RUNS_DIR — hoặc bỏ nó để xem fixture DEMO."
            />
         );
      }
      throw error;
   }

   return (
      <Flex vertical gap={32}>
         <RunHeader label={run.label} mode={run.mode} runId={run.runId} />

         <BuildBundleSection run={run} />

         <DesignTree run={run} />

         <MappingReview run={run} />

         <Row gutter={[32, 32]}>
            <Col xs={24} lg={12}>
               <PreviewPanel
                  preview={run.preview}
                  mode={run.mode}
                  label={run.label}
               />
            </Col>
            <Col xs={24} lg={12}>
               <ClientArtifactManifest
                  runId={run.runId}
                  artifacts={run.artifacts}
               />
            </Col>
         </Row>

         <ProvenanceFooter run={run} />
      </Flex>
   );
}

// Run data is read from local disk per request — fully blocking route.
export const instant = false;
