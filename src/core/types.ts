// Shared structural types mirroring the converter contract family (resources/schemas/converter/*, major 1).
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

export type CapabilityCategory =
   "native" | "widget" | "chrome" | "custom-required" | "unsupported";
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
   type:
      | "string"
      | "number"
      | "boolean"
      | "enum"
      | "color"
      | "length"
      | "json"
      | "reference"
      | "unknown";
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
   dataContext: {
      requiresRuntimeData: boolean;
      dataSources?: string[];
      notes?: string;
   };
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

export type SectionStatus =
   "mapped" | "partially-mapped" | "unmapped" | "blocked";

export interface SectionReport {
   sectionId: string;
   order: number;
   name?: string;
   status: SectionStatus;
   candidates: {
      capabilityId: string;
      appearanceId: string;
      confidence: "high" | "medium" | "low";
   }[];
   selected: { capabilityId: string; appearanceId: string } | null;
   unsupportedReasons: {
      code: string;
      message: string;
      evidence?: SourceEvidence;
   }[];
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
   proofStatus: {
      maxClaimedProofLevel: ProofLevel;
      maxJustifiedProofLevel: ProofLevel;
   };
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

// --- G2: design-source structural extraction (resources/schemas/converter/node-ir|page-structure|source-review, major 1) ---
// Materialized at the Structural Mapping gate (issue #14). Same discipline as above: the JSON
// Schemas stay canonical (ajv); these types let the core stay type-checked against what it emits.

export type NodeIRKind =
   | "page-section"
   | "container"
   | "component"
   | "text"
   | "media"
   | "icon"
   | "divider"
   | "spacer"
   | "unknown";

export interface LayoutConstraint {
   axis: "x" | "y" | "width" | "height";
   type: string;
   value: string;
}

export interface LayoutRelativeSize {
   target: string;
   ratio: number;
}

export interface NodeIRLayout {
   direction: "row" | "column" | "grid" | "absolute" | "unknown";
   positioning: "static" | "relative" | "absolute" | "sticky" | "unknown";
   constraints: LayoutConstraint[];
   relativeSizes: LayoutRelativeSize[];
   overflow: "visible" | "hidden" | "scroll" | "unknown";
}

export type ContentSlotKind =
   "text" | "media" | "icon" | "component" | "dynamic";

export interface NodeIRSlot {
   slotId: string;
   kind: ContentSlotKind;
   valueRef: string;
   evidence?: SourceEvidence;
   method?: string;
}

export interface NodeIRNode {
   nodeId: string;
   kind: NodeIRKind;
   name: string;
   role?: string;
   visible?: boolean;
   childrenNodeIds: string[];
   parentNodeId: string | null;
   componentRefNodeId?: string;
   layout: NodeIRLayout;
   contentSlots?: NodeIRSlot[];
   sourceEvidence: SourceEvidence[];
}

export interface NodeIR {
   schemaVersion: number;
   profileId: string;
   generatedAt: string;
   source: SourceRevision;
   rootNodeId: string;
   nodes: NodeIRNode[];
   diagnostics: Diagnostic[];
}

export interface PageStructureInputPins {
   nodeIrContentHash: string;
   registryRevisionId?: string;
   bindingMapContentHash?: string;
}

export interface PageStructureSlot {
   slotId: string;
   contentType: "text" | "media" | "icon" | "dynamic";
   valueRef?: string;
   aliasRef?: string;
   fixtureRef?: string;
}

export interface ResponsiveComposition {
   scope: string;
   effect: string;
}

export interface ElementResolution {
   status: SectionStatus;
   mappingConfidence: "high" | "medium" | "low";
   diagnostics: Diagnostic[];
}

export interface PageStructureElement {
   elementId: string;
   sourceComponentId?: string;
   variantAssignment?: Record<string, string>;
   bindingId?: string;
   target?: { capabilityId: string; appearanceId: string };
   contentSlots?: PageStructureSlot[];
   responsiveComposition?: ResponsiveComposition[];
   childrenElementIds?: string[];
   resolution: ElementResolution;
}

export interface PageStructureSection {
   sectionId: string;
   order: number;
   name: string;
   role?: string;
   layout: NodeIRLayout;
   elements: PageStructureElement[];
   sourceEvidence: SourceEvidence[];
}

export interface PageStructure {
   schemaVersion: number;
   profileId: string;
   generatedAt: string;
   source: SourceRevision;
   inputs: PageStructureInputPins;
   sections: PageStructureSection[];
   diagnostics: Diagnostic[];
}

export type SemanticClass =
   | "SITE_CHROME"
   | "EDITORIAL_SECTION"
   | "SHARED_COMPONENT"
   | "PRESENTATIONAL"
   | "UNKNOWN_OR_AMBIGUOUS";
export type ReviewDisposition =
   | "MAPPED"
   | "EXCLUDED_WITH_REASON"
   | "DECORATION_MERGED"
   | "REFERENCE_ONLY"
   | "NEEDS_REVIEW";

export interface ProvisionalTarget {
   category: CapabilityCategory;
   requiresRuntimeData?: boolean;
   capabilityIds?: string[];
}

export interface SourceReviewEntry {
   nodeId: string;
   semanticClass: SemanticClass;
   disposition: ReviewDisposition;
   reason: string;
   nameHint?: string;
   sectionId?: string;
   provisionalTarget?: ProvisionalTarget;
   evidence?: SourceEvidence[];
}

export interface SourceReviewCounts {
   total: number;
   byClass: Record<SemanticClass, number>;
   byDisposition: Record<ReviewDisposition, number>;
}

export interface SourceReview {
   schemaVersion: number;
   profileId: string;
   generatedAt: string;
   source: SourceRevision;
   inputs: { nodeIrContentHash: string };
   counts: SourceReviewCounts;
   entries: SourceReviewEntry[];
   diagnostics: Diagnostic[];
}

// --- G2: design-source transport snapshot (resources/schemas/cli/design-source-snapshot, major 1) ---
// Adapter-defined (open) vocabulary; the core's extractor maps it onto the closed enums above.

export interface DesignSourceSnapshotNode {
   locator: string;
   kind: string;
   name: string;
   visible?: boolean;
   componentRef?: string;
   properties?: Record<string, unknown>;
   children: string[];
}

export interface DesignSourceSnapshot {
   schemaVersion: number;
   sourceId: string;
   providerId?: string;
   revisionId: string;
   accessedAt: string;
   rootLocator: string;
   nodes: DesignSourceSnapshotNode[];
}
