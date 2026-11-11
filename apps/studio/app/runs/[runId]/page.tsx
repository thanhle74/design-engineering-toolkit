import { Col, Flex, Row } from "antd";
import { connection } from "next/server";

import { DetRunReaderError, type StudioRunView } from "@/src/shared/contracts";
import { getDetRunReader } from "@/src/server/det-run-reader-factory";
import { DesignTree } from "@/src/modules/design-tree";
import {
  MappingReview,
  ProvenanceFooter,
} from "@/src/modules/mapping-review";
import { PreviewPanel } from "@/src/modules/preview";
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
      if (error.code === "run-not-found") {
        return (
          <ReaderProblemState
            title="Run not found"
            message={`No run with id "${runId}" is readable by this Studio instance.`}
            hint="Pick a run from the overview list; run ids come from the configured DET output root (or the DEMO fixture)."
          />
        );
      }
      return (
        <ReaderProblemState
          title={`Reader error (${error.code})`}
          message={error.message}
          hint="Check the STUDIO_DET_RUNS_DIR configuration — or unset it to browse the DEMO fixture."
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
          <PreviewPanel preview={run.preview} mode={run.mode} label={run.label} />
        </Col>
        <Col xs={24} lg={12}>
          <ClientArtifactManifest runId={run.runId} artifacts={run.artifacts} />
        </Col>
      </Row>

      <ProvenanceFooter run={run} />
    </Flex>
  );
}

// Run data is read from local disk per request — fully blocking route.
export const instant = false;
