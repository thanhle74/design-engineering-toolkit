/**
 * [29] DET Studio — server-only DET run reader contract.
 *
 * Implementations live under `src/server/**` (owned by the read-boundary lane).
 * UI modules depend ONLY on this interface — never on a concrete reader, the
 * filesystem, or child processes. No implementation may invoke the det CLI,
 * the Figma API, or any shell built from request input.
 */
import type {
   DetRunSummary,
   StudioArtifactView,
   StudioRunView,
} from "./studio-run-view";

/** Machine-readable failure kinds a reader may surface to the UI. */
export type DetRunReaderErrorCode =
   | "run-not-found"
   | "artifact-not-found"
   | "artifact-not-downloadable"
   | "path-refused"
   | "invalid-payload"
   | "not-configured";

/** Typed error so lanes can render NOT_CONFIGURED / empty / error states honestly. */
export class DetRunReaderError extends Error {
   readonly code: DetRunReaderErrorCode;
   readonly details?: string;

   constructor(code: DetRunReaderErrorCode, message: string, details?: string) {
      super(message);
      this.name = "DetRunReaderError";
      this.code = code;
      this.details = details;
   }
}

/** A validated, allowlisted artifact file the reader agreed to hand out. */
export interface StudioArtifactDownload {
   artifactId: string;
   /** Basename only — never a server path. */
   fileName: string;
   contentType: string;
   bytes: Uint8Array;
}

/** What a reader told the UI about a run's artifacts (for download affordances). */
export type DetRunArtifactsIndex = readonly StudioArtifactView[];

/**
 * The one boundary between Studio UI and DET-generated data.
 *
 * Contract obligations for every implementation:
 *  - Returned runs validate against StudioRunViewSchema and pass
 *    assertStudioRunViewInvariants; fixture runs carry mode "fixture".
 *  - File access is server-only, allowlisted, realpath-contained, extension and
 *    size checked; path traversal and symlink escape attempts raise
 *    DetRunReaderError("path-refused").
 *  - Downloads are served only for artifacts whose manifest entry the reader
 *    validated; everything else raises "artifact-not-downloadable".
 *  - An unconfigured environment raises DetRunReaderError("not-configured")
 *    rather than returning fabricated data.
 */
export interface DetRunReader {
   /** Runs available to this Studio instance, newest first. */
   listRuns(): Promise<readonly DetRunSummary[]>;
   /** The full read model for one run. Throws DetRunReaderError("run-not-found"). */
   getRun(runId: string): Promise<StudioRunView>;
   /** Serve one validated artifact file. Throws DetRunReaderError otherwise. */
   readArtifact(
      runId: string,
      artifactId: string,
   ): Promise<StudioArtifactDownload>;
}
