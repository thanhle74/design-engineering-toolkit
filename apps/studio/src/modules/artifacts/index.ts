/**
 * [29] DET Studio — artifacts module public interface (W-C lane).
 *
 * Consumers (the composed page) import only from here. The module is fully
 * presentational: it takes the frozen `run.artifacts` slice plus a
 * page-supplied `onDownload` callback and performs no data access of its own.
 */
export {
  ArtifactManifest,
  isUnsafeArtifactFile,
  type ArtifactDownloadHandler,
  type ArtifactManifestProps,
} from "./artifact-manifest";
