// Shared structural types mirroring the converter contract family (schemas/converter/*, major 1).
// The JSON Schemas stay the canonical validation layer (ajv); these types exist so the
// TypeScript core is type-checked against the same shapes it validates at runtime.
// Platform-neutral by construction: no platform literals, no design-source ids, no filesystem paths.

export type DiagnosticSeverity = "info" | "warning" | "error";

export type EvidenceKind =
  | "source-file"
  | "config-declaration"
  | "document"
  | "rendered-artifact"
  | "runtime-observation"
  | "test-receipt";

export interface SourceEvidence {
  evidenceId: string;
  kind: EvidenceKind;
  locator: string;
  retrievedAt: string;
  sourceRevisionId?: string;
  method?: string;
  note?: string;
}

export type DiagnosticSubjectType =
  | "capability"
  | "appearance"
  | "binding"
  | "section"
  | "node"
  | "prop"
  | "profile"
  | "source";

export interface DiagnosticSubject {
  type: DiagnosticSubjectType;
  id: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  subject?: DiagnosticSubject;
  evidence?: SourceEvidence;
}

export interface SourceRevision {
  sourceId: string;
  revisionId: string;
  accessedAt: string;
}

export type CapabilityCategory = "native" | "widget" | "chrome" | "custom-required" | "unsupported";
export type Availability = "enabled" | "disabled" | "deprecated" | "unknown";
export type ProofLevel =
  | "not-verified"
  | "discovered"
  | "registered"
  | "structurally-mapped"
  | "admin-roundtrip-verified"
  | "visually-verified";

export interface Prop {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "color" | "length" | "json" | "reference" | "unknown";
  required: boolean;
  values?: string[];
  default?: unknown;
  description?: string;
  responsive?: boolean;
}

export interface NestingRule {
  capabilityId?: string;
  appearances?: string[];
  maxChildren?: number;
  policy?: "allow-all" | "deny-all";
  except?: string[];
}

export interface ResponsiveRule {
  scope: string;
  effect: string;
  evidence?: SourceEvidence;
}

export interface Capability {
  id: string;
  appearanceId: string;
  provider: string;
  category: CapabilityCategory;
  displayName?: string;
  availability: Availability;
  acceptedProps: Prop[];
  allowedChildren?: NestingRule[];
  allowedParents?: NestingRule[];
  responsiveRules?: ResponsiveRule[];
  responsiveDeterministic?: boolean;
  dataContext: { requiresRuntimeData: boolean; dataSources?: string[]; notes?: string };
  editorEditingMode: "form" | "wysiwyg" | "code" | "none" | "unknown";
  editorRestrictions?: string[];
  dependencies?: string[];
  evidence: SourceEvidence[];
  proofLevel: ProofLevel;
  unsupportedReason?: string;
  description?: string;
}

export interface RegistrySummary {
  byCategory: Record<CapabilityCategory, number>;
  byProofLevel: Record<ProofLevel, number>;
  byAvailability: Record<Availability, number>;
}

export interface CapabilityRegistry {
  schemaVersion: number;
  platformId: string;
  platformVersion?: string;
  profileId?: string;
  generatedAt: string;
  source: SourceRevision;
  generator?: { tool: string; toolVersion?: string };
  capabilities: Capability[];
  summary: RegistrySummary;
  diagnostics: Diagnostic[];
}

export interface VariantCondition {
  prop: string;
  op?: "eq" | "neq" | "in";
  value: string;
}

export interface PropTransform {
  from: string;
  to: string;
  transform?: "identity" | "map" | "template" | "constant" | "omit";
  map?: Record<string, unknown>;
  constant?: string;
  template?: string;
  required?: boolean;
}

export interface Binding {
  bindingId?: string;
  sourceComponentId: string;
  sourceEvidence: SourceEvidence[];
  variantConditions: VariantCondition[];
  target: { capabilityId: string; appearanceId: string };
  propsTransform: PropTransform[];
  fallbackPolicy: "fail-unsupported" | "degrade-advisory" | "omit";
  fallbackNote?: string;
  description?: string;
}

export interface BindingMap {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  generatedAt: string;
  registry: { platformId: string; registryRevisionId: string };
  bindings: Binding[];
  diagnostics: Diagnostic[];
}

// G1 harness structure shape (docs/converter/CONTRACTS.md §Harness) — tests-only until the
// Structural Mapping gate materializes PageStructure.
export interface HarnessElement {
  elementId: string;
  sourceComponentId: string;
  variantAssignment?: Record<string, string>;
  childrenElementIds?: string[];
}

export interface HarnessSection {
  sectionId: string;
  order: number;
  name: string;
  elements: HarnessElement[];
}

export interface PageStructureHarness {
  profileId: string;
  platformId: string;
  source: SourceRevision;
  sections: HarnessSection[];
}

export type SectionStatus = "mapped" | "partially-mapped" | "unmapped" | "blocked";

export interface SectionReport {
  sectionId: string;
  order: number;
  name?: string;
  status: SectionStatus;
  candidates: { capabilityId: string; appearanceId: string; confidence: "high" | "medium" | "low" }[];
  selected: { capabilityId: string; appearanceId: string } | null;
  unsupportedReasons: { code: string; message: string; evidence?: SourceEvidence }[];
  mappingConfidence: "high" | "medium" | "low";
  proofLevel: ProofLevel;
  evidence: SourceEvidence[];
}

export interface ResolutionReport {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  generatedAt: string;
  inputs: {
    registryRevisionId: string;
    bindingMapContentHash?: string;
    nodeIrContentHash?: string;
    pageStructureContentHash?: string;
  };
  sections: SectionReport[];
  coverage: Record<CapabilityCategory | "total", number>;
  counts: { errors: number; warnings: number; infos: number };
  proofStatus: { maxClaimedProofLevel: ProofLevel; maxJustifiedProofLevel: ProofLevel };
  diagnostics: Diagnostic[];
}

export interface ProjectSource {
  sourceId: string;
  kind: string;
  path?: string;
  notes?: string;
}

export interface ProfileScope {
  sourceId: string;
  include?: string[];
  exclude?: string[];
}

export interface ConverterProfile {
  schemaVersion: number;
  profile: {
    id: string;
    name: string;
    description?: string;
    platformId: string;
    platformVersionConstraint?: string;
    projectSources?: ProjectSource[];
    scopes?: ProfileScope[];
    gates?: { responsiveDeterministicRequired?: boolean };
    safety: { approvedWriteTargets: never[]; notes?: string };
  };
}
