// Knowledge Engine (issue #15) — explicit read-only bridge: #9 CapabilityRegistry -> KB-1 records.
// The registry file is the ONLY input; the bridge never opens the platform tree. Every mapping is
// an explicit, documented table and every produced record carries its evidence. Proof honesty is
// the core rule (CONTRACTS.md §2.2.1): converter DISCOVERED/REGISTERED/STRUCTURALLY_MAPPED are
// declaration-inspection levels -> DETECTED; not-verified -> UNKNOWN; later-stage claims
// (admin-roundtrip/visual) cannot come from a G1-ceiling registry and fail closed instead of
// being silently downgraded.
import type { CapabilityRegistry, Capability, SourceEvidence } from "../../core/types.js";
import type { KbCapabilityRecord, KbDiagnostic, KbSourceRef } from "./types.js";
import { deriveCapabilityId } from "./ids.js";

// --- explicit mapping tables (documented in docs/knowledge/README.md) -------------------------
const CATEGORY_MAP: Record<string, string> = {
  native: "content",
  widget: "content",
  chrome: "layout",
};
const ORIGIN_MAP: Record<string, "native" | "custom" | "third-party"> = {
  native: "native",
  widget: "custom",
  chrome: "native",
};
const PROOF_MAP: Record<string, "DETECTED" | "UNKNOWN"> = {
  discovered: "DETECTED",
  registered: "DETECTED",
  "structurally-mapped": "DETECTED",
  "not-verified": "UNKNOWN",
};
const ENABLEMENT_MAP: Record<string, { state: "enabled" | "disabled" | "unknown"; source: "config-scan" | "declaration" }> = {
  enabled: { state: "enabled", source: "config-scan" },
  disabled: { state: "disabled", source: "config-scan" },
  unknown: { state: "unknown", source: "declaration" },
  deprecated: { state: "unknown", source: "declaration" },
};

// Registry evidence locators look like `source://<sourceId>/<relative/path>#<selector>` for
// source-backed kinds; the sourceId becomes the portable rootAlias. Unparsed kinds keep their raw
// locator verbatim under locator.raw plus an info diagnostic — nothing is invented.
function mapEvidence(evidence: SourceEvidence[]): { sources: KbSourceRef[]; diagnostics: KbDiagnostic[]; capabilityId: string } {
  const sources: KbSourceRef[] = [];
  const diagnostics: KbDiagnostic[] = [];
  for (const ev of evidence) {
    const m = /^(source:\/\/([^/]+)\/([^#]+))(?:#(.*))?$/.exec(ev.locator);
    if ((ev.kind === "source-file" || ev.kind === "config-declaration") && m) {
      sources.push({ kind: "repo-file", locator: { rootAlias: m[2], path: m[3] }, digest: undefined, capturedAt: ev.retrievedAt });
    } else if (ev.kind === "document" || ev.kind === "test-receipt") {
      sources.push({ kind: "document", locator: { path: ev.locator }, capturedAt: ev.retrievedAt });
    } else {
      sources.push({ kind: "document", locator: { raw: ev.locator } });
      diagnostics.push({ code: "BRIDGE_LOCATOR_KIND_UNMAPPED", severity: "info", message: `Evidence kind '${ev.kind}' of '${ev.evidenceId}' has no typed locator mapping; locator preserved verbatim.`, subject: { type: "record", id: ev.evidenceId } });
    }
  }
  return { sources, diagnostics, capabilityId: evidence[0]?.evidenceId ?? "(unknown)" };
}

const UNCERTAINTY_DECLARATION_ONLY = [
  "Bridged from a det CapabilityRegistry: declaration-level evidence only — installed/enabled is never runtime, Admin-editability or storefront proof.",
  "Store-view scoped enablement values live in the platform database; the registry scan proves file-level state only.",
];

export interface BridgeInput {
  registry: CapabilityRegistry;
  registryPathSpec: string;
  registryDigest: string;
  platformId: string;
  platformVersion?: string;
  scannedAt: string;
}

export interface BridgeResult {
  records: KbCapabilityRecord[];
  diagnostics: KbDiagnostic[];
  skipped: { capabilityId: string; reason: string }[];
}

export function bridgeRegistryToKb(input: BridgeInput): BridgeResult {
  const { registry, scannedAt } = input;
  const diagnostics: KbDiagnostic[] = [];
  const records: KbCapabilityRecord[] = [];
  const skipped: { capabilityId: string; reason: string }[] = [];
  const seen = new Map<string, string>();

  for (const cap of registry.capabilities as Capability[]) {
    // Converter-need classifications (gaps) are not platform capabilities — KB-1 records what the
    // system HAS; gaps surface in planning, never as invented platform facts.
    if (!CATEGORY_MAP[cap.category]) {
      skipped.push({ capabilityId: `${cap.id}@${cap.appearanceId}`, reason: `category '${cap.category}' is a converter-side classification, not a platform capability` });
      continue;
    }
    const proof = PROOF_MAP[cap.proofLevel];
    if (!proof) {
      diagnostics.push({
        code: "BRIDGE_PROOF_LEVEL_UNSUPPORTED",
        severity: "error",
        message: `Capability '${cap.id}@${cap.appearanceId}' claims converter proof '${cap.proofLevel}', which the declaration-only registry bridge cannot justify. KB-1 record refused (fail closed; run a TESTED-evidence audit first).`,
        subject: { type: "record", id: cap.id },
      });
      continue;
    }
    const id = deriveCapabilityId(cap.provider, cap.id, cap.appearanceId);
    if (seen.has(id)) {
      diagnostics.push({
        code: "BRIDGE_ID_COLLISION",
        severity: "error",
        message: `Two registry capabilities derive the same KB-1 id '${id}' ('${seen.get(id)}' and '${cap.id}@${cap.appearanceId}'); identity derivation must stay collision-free.`,
        subject: { type: "record", id },
      });
      continue;
    }
    seen.set(id, `${cap.id}@${cap.appearanceId}`);

    const mapped = mapEvidence(cap.evidence);
    diagnostics.push(...mapped.diagnostics);
    const enablement = ENABLEMENT_MAP[cap.availability];
    const nativeId = cap.appearanceId && cap.appearanceId !== "default" ? `${cap.id}@${cap.appearanceId}` : cap.id;

    records.push({
      schemaVersion: 1,
      recordType: "capability",
      id,
      nativeId,
      namespace: id.split(":")[1],
      platform: input.platformId,
      ...(input.platformVersion ? { platformVersion: input.platformVersion } : registry.platformVersion ? { platformVersion: registry.platformVersion } : {}),
      origin: ORIGIN_MAP[cap.category],
      category: CATEGORY_MAP[cap.category],
      title: cap.displayName || cap.id.split("/").pop() || cap.id,
      semantics: cap.description || `Registry-declared capability (no description captured from the '${cap.evidence[0]?.method ?? "declaration"}' scan); declaration-only evidence.`,
      ...(cap.acceptedProps.length ? { io: { inputs: cap.acceptedProps.map((p) => p.name) } } : {}),
      ...(cap.dependencies?.length ? { dependencies: { hard: cap.dependencies } } : {}),
      ...(enablement ? { enablement } : {}),
      installed: true,
      sourceRef: mapped.sources[0] ?? { kind: "document", locator: { raw: registry.source.revisionId } },
      evidence: {
        proofLevel: proof,
        sources: mapped.sources,
        method: "capability-registry-bridge",
        confidence: cap.proofLevel === "registered" ? "high" : "medium",
        verifiedAt: null,
        uncertainty: cap.availability === "unknown" ? ["Enablement could not be observed from the audited surfaces (availability 'unknown').", ...UNCERTAINTY_DECLARATION_ONLY] : UNCERTAINTY_DECLARATION_ONLY,
      },
      lifecycle: { state: "ACTIVE", reviewStatus: "unreviewed" },
      observed: {
        scannedAt,
        inputDigests: { [input.registryPathSpec]: input.registryDigest },
      },
      notes: `Bridged read-only from det CapabilityRegistry '${registry.source.sourceId}' @ ${registry.source.revisionId}; converter proof '${cap.proofLevel}' (declaration-only, never a runtime/admin claim).`,
    });
  }
  return { records, diagnostics, skipped };
}
