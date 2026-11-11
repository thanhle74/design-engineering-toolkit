/**
 * [29] DET Studio — fixture-backed DetRunReader (labeled DEMO mode).
 *
 * Serves the ONE frozen DEMO fixture (`src/shared/fixtures/demo-run.json`) so a
 * developer without a configured DET output root still sees an honest, visibly
 * labeled DEMO run. Fixture artifacts are never downloadable — there are no
 * fixture bytes to serve, and Studio must never fake a download.
 */
import "server-only";

import { DEMO_RUN_FIXTURE } from "@/src/studio/shared/fixtures/demo-run";
import {
  DetRunReaderError,
  type DetRunReader,
  type DetRunSummary,
  type StudioArtifactDownload,
  type StudioRunView,
} from "@/src/studio/shared/contracts";

const FIXTURE_ARTIFACT_REFUSAL =
  "Fixture artifacts carry no downloadable bytes: the DEMO run is schema-shaped demo data, not a live DET output directory.";

/** Truncate + strip control chars before echoing caller input into messages. */
function echoId(value: string): string {
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, "");
  return stripped.length > 100 ? `${stripped.slice(0, 100)}…` : stripped;
}

export class FixtureDetRunReader implements DetRunReader {
  async listRuns(): Promise<readonly DetRunSummary[]> {
    const run = DEMO_RUN_FIXTURE;
    const summary: DetRunSummary = {
      runId: run.runId,
      mode: run.mode,
      label: run.label,
      generatedAt: run.generatedAt,
      sourceId: run.source.sourceId,
      revisionId: run.source.revisionId,
      counts: { ...run.counts },
    };
    return [summary];
  }

  async getRun(runId: string): Promise<StudioRunView> {
    if (runId !== DEMO_RUN_FIXTURE.runId) {
      throw new DetRunReaderError(
        "run-not-found",
        `No DEMO fixture run with id "${echoId(runId)}". The fixture reader serves exactly one labeled run: "${DEMO_RUN_FIXTURE.runId}".`
      );
    }
    // Already validated against StudioRunViewSchema + invariants at import
    // time by the fixture module itself.
    return DEMO_RUN_FIXTURE;
  }

  async readArtifact(runId: string, artifactId: string): Promise<StudioArtifactDownload> {
    void runId;
    void artifactId;
    throw new DetRunReaderError("artifact-not-downloadable", FIXTURE_ARTIFACT_REFUSAL);
  }
}
