// Knowledge Engine (issue #15) — shared KB record types.
// The JSON Schemas in schemas/kb/ stay the canonical validation layer (ajv); these structural
// types exist so the TypeScript core is type-checked against the shapes it validates at runtime.
// Platform-neutral: platform/source identifiers appear as VALUES, never as structure.
import type { RunDiagnostic } from "../../core/adapter-runtime.js";

// KB domain diagnostics are process-level/open-vocabulary (tool-run runDiagnostics lane) —
// they never extend the closed converter diagnostic registry.
export type KbDiagnostic = RunDiagnostic;

export type KbName = "platform" | "ui" | "project" | "relations";

export type ProofLevelKb = "DETECTED" | "ASSUMED" | "TESTED" | "UNKNOWN";
export type LifecycleState = "ACTIVE" | "STALE" | "INVALIDATED" | "ARCHIVED";
export type ReviewStatus = "unreviewed" | "reviewed" | "approved";

export interface KbSourceRef {
  kind: "figma-node" | "repo-file" | "package" | "document" | "issue-ref" | "db-config";
  locator: Record<string, string>;
  lineRange?: string;
  capturedAt?: string;
  digest?: string;
}

export interface KbEvidence {
  proofLevel: ProofLevelKb;
  sources?: KbSourceRef[];
  method?: string;
  confidence?: "high" | "medium" | "low";
  verifiedAt?: string | null;
  uncertainty: string[];
}

export interface KbLifecycle {
  state: LifecycleState;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewRef?: string;
}

export interface KbObserved {
  scannedAt: string;
  inputDigests?: Record<string, string>;
}

export interface KbDiagnosticEntry {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourceRef?: KbSourceRef;
}

// ---- KB-1 (platform capability / data-provider / module inventory) --------------------------
export interface KbEnablement {
  state: "enabled" | "disabled" | "not-registered" | "unknown";
  source: "declaration" | "config-scan" | "runtime-check";
}

export interface KbCapabilityRecord {
  schemaVersion: 1;
  recordType: "capability" | "data-provider" | "module";
  id: string;
  nativeId?: string;
  namespace?: string;
  platform?: string;
  platformVersion?: string;
  origin?: "native" | "custom" | "third-party";
  category?: string;
  title: string;
  semantics?: string;
  entrypoints?: { kind: string; ref: string }[];
  io?: { inputs?: string[]; outputs?: string[]; context?: string[] };
  prerequisites?: string[];
  dependencies?: { hard?: string[]; soft?: string[] };
  scope?: string;
  enablement?: KbEnablement;
  installed?: boolean;
  version?: { declared?: string; locked?: string; source?: string; schema?: number };
  restrictions?: string[];
  sourceRef: KbSourceRef;
  evidence: KbEvidence;
  lifecycle: KbLifecycle;
  observed: KbObserved;
  diagnostics?: KbDiagnosticEntry[];
  notes?: string;
}

// ---- KB-2 (UI component, license-bounded metadata) -------------------------------------------
export interface KbUiComponentRecord {
  schemaVersion: 1;
  recordType: "ui-component";
  id: string;
  nativeId?: string;
  sourcePackage: { kind: "hyva-ui" | "secomm-uiwidget" | "page-builder-native" | "other"; name: string; version: string; locator?: string };
  title: string;
  uxSemantics: { concept: string; description: string; notSupported?: string[] };
  availability: { state: string; eligibility?: string; eligibilityReason?: string };
  usageLinks?: { kind: "secomm-widget" | "theme-native" | "page-builder"; refId: string; pointer?: string }[];
  variants?: { name: string; availability?: string; notes?: string }[];
  slots?: string[];
  configOptions?: { name: string; kind?: string; notes?: string }[];
  behavior?: { interactive?: boolean; jsModel?: string; cssSystem?: string; breakpoints?: number[]; cmsEditable?: boolean; a11yNotes?: string };
  dependencies?: string[];
  license: { status: string; regime: string; licenseRef?: string; derivedArtifactPolicy?: string };
  sourceRef: KbSourceRef;
  evidence: KbEvidence;
  lifecycle: KbLifecycle;
  observed: KbObserved;
  diagnostics?: KbDiagnosticEntry[];
  notes?: string;
}

// ---- KB-3 (project record; per-type fields stay loosely typed — schema is canonical) ---------
export interface KbProjectRecord {
  schemaVersion: 1;
  recordType: string;
  id: string;
  projectId: string;
  tenantId: string;
  environment?: string;
  title: string;
  statement: string;
  rationale?: string;
  owner?: string;
  source: { kind: string; locator: string; quote?: string; accessedAt?: string };
  status: string;
  version?: number;
  supersedes?: string[];
  supersededBy?: string[];
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  visibility: "private" | "sanitized" | "example";
  evidence?: KbEvidence;
  lifecycle: KbLifecycle;
  observed: KbObserved;
  diagnostics?: KbDiagnosticEntry[];
  notes?: string;
  [typeField: string]: unknown; // per-recordType fields (kind/page/likelihood/...) — ajv branch validates them
}

// ---- relations --------------------------------------------------------------------------------
export interface KbRelationEndpoint {
  kb: "KB1" | "KB2" | "KB3" | "evidence";
  id: string;
}

export interface KbRelationRecord {
  schemaVersion: 1;
  recordType: "relation";
  id: string;
  edgeType: string;
  from: KbRelationEndpoint;
  to: KbRelationEndpoint;
  authority: "confirmed" | "probable";
  evidence: { proofLevel: ProofLevelKb; sources: KbSourceRef[]; confidence?: "high" | "medium" | "low"; method?: string; uncertainty: string[] };
  recordedAt: string;
  recordedBy?: string;
  projectId?: string;
  lifecycle?: { state: LifecycleState; reviewStatus?: ReviewStatus };
  observed: KbObserved;
  note?: string;
  diagnostics?: KbDiagnosticEntry[];
}

export type KbRecord = KbCapabilityRecord | KbUiComponentRecord | KbProjectRecord | KbRelationRecord;

export function isRelationRecord(r: KbRecord): r is KbRelationRecord {
  return r.recordType === "relation";
}
export function isProjectRecord(r: KbRecord): r is KbProjectRecord {
  return !isRelationRecord(r) && ["requirement", "ux-intent", "composition", "decision", "approval", "risk", "open-question", "constraint", "source-document"].includes(r.recordType);
}

// ---- store -------------------------------------------------------------------------------------
export interface StoredRecord<R extends KbRecord = KbRecord> {
  kb: KbName;
  partition?: string; // KB-3 project partition id
  file: string; // store-relative path, e.g. "project/p/records.jsonl"
  line: number; // 1-based line in the JSONL file
  record: R;
}

export interface KbStoreData {
  platform: KbCapabilityRecord[];
  ui: KbUiComponentRecord[];
  project: Map<string, KbProjectRecord[]>;
  relations: KbRelationRecord[];
}

export interface StoreDescriptor {
  schemaVersion: 1;
  storeId: string;
  generator: { tool: string; toolVersion?: string };
  platforms: { id: string; version?: string }[];
  projects: string[];
  counts: { platform: number; ui: number; project: number; relations: number };
  notes?: string;
}

// ---- ingest manifest ---------------------------------------------------------------------------
// M4 (issue #19): lanes are optional (at least one input required) and `platformRecords` was
// added for KB-1 records emitted by read-only source extracts. Existing manifests that supply
// all four original lanes remain valid — additive evolution within major 1.
export interface KbIngestManifest {
  schemaVersion: 1;
  manifestId: string;
  platform: { id: string; version?: string };
  visibilityPolicy?: "example-only" | "any";
  inputs: {
    capabilityRegistry?: ManifestInput;
    platformRecords?: ManifestInput;
    uiInventory?: ManifestInput;
    projectRecords?: ManifestInput[];
    relations?: ManifestInput;
  };
  denyGlobs?: string[];
  notes?: string;
}

// ---- extract manifest + source scan payload (issue #19 M4) --------------------------------------
export interface KbExtractManifest {
  schemaVersion: 1;
  extractId: string;
  platform: { id: string; version?: string };
  rootAliases: Record<string, { description: string }>;
  scans: {
    scanId: string;
    kind: KbScanKind;
    rootAlias: string;
    subPath?: string;
    options?: Record<string, string | number | boolean>;
    denyGlobs?: string[];
  }[];
  output: {
    platformRecords: string | null;
    uiRecords: string | null;
    relations: string | null;
    report: string | null;
  };
  denyGlobs?: string[];
  notes?: string;
}

export type KbScanKind = "magento-platform" | "pagebuilder-native" | "secomm-uiwidget" | "hyva-ui";

export interface KbSourceScanPayload {
  schemaVersion: 1;
  adapterId: "magento-kb-source";
  scanId: string;
  kind: KbScanKind;
  rootAlias: string;
  platform: { id: string; version?: string };
  capabilities: unknown[];
  uiComponents: unknown[];
  relations: unknown[];
  digests: Record<string, string>;
  scanMetadata: { scannedAt: string; fileCount: number; deniedCount: number; unknownShapes: number };
  diagnostics: KbDiagnosticEntry[];
  counts: { capabilities: number; modules: number; uiComponents: number; relations: number };
}

export interface ManifestInput {
  path: string;
  rootAlias?: string;
  label?: string;
}

// Digest-key convention: `${rootAlias}:${path}` when an alias is used, else `${path}` — stable
// across runs and self-describing for sync.
export function digestKey(input: ManifestInput): string {
  return input.rootAlias ? `${input.rootAlias}:${input.path}` : input.path;
}
