"use client";

/**
 * [29]/[68] Run detail screen — composes the run sections from their module
 * lanes. Pure presentation over a resolved `StudioRunView`: the route (see
 * `app/runs/[runId]/page.tsx`) owns request-time reading and the failure
 * mapping (`ReaderProblemState`); this screen renders only a successfully
 * read run. Server imports stay in the route; antd primitives + lane public
 * APIs only.
 */
import { Col, Flex, Row } from "antd";

import type { StudioRunView } from "@/src/modules/studio/shared/contracts";
import { DesignTree } from "@/src/modules/studio/modules/design-tree";
import {
   MappingReview,
   ProvenanceFooter,
} from "@/src/modules/studio/modules/mapping-review";
import { PreviewPanel } from "@/src/modules/studio/modules/preview";

import { ClientArtifactManifest } from "../components/client-artifact-manifest";
import { BuildBundleSection } from "../components/build-bundle-section";
import { RunHeader } from "../components/run-header";

export function RunScreen({ run }: { run: StudioRunView }) {
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
