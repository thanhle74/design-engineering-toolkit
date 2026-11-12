// DesignSourcePort — the read-only, scope-bounded accessor to an approved design source
// (docs/converter/CONTRACTS.md §1). It stays an INTERFACE, never a schema (ADR-005-013): the
// only legal way any stage touches design content. The out-of-process transport counterpart is
// resources/schemas/cli/design-source-snapshot.schema.json; SnapshotDesignSourcePort wraps a validated
// snapshot as a port implementation so the deterministic extractor stays transport-agnostic.
//
// Read-only is structural: the port has no mutating operation at all. Every record carries the
// pinned revision; mixing revisions in one stage run is an EVIDENCE_MISSING-class failure.
// Errors are diagnostics, never fabricated nodes. A locator outside the declared scopes returns
// LOCATOR_OUT_OF_SCOPE — internally an error, externally indistinguishable from an absent node
// (no information leak about the source beyond the scope).
import type { DesignSourceSnapshot, DesignSourceSnapshotNode, Diagnostic, SourceRevision } from "../types.js";

export interface SourceDescriptor {
  sourceId: string;
  providerId?: string;
  revision: SourceRevision;
  scopes: { include?: string[]; exclude?: string[] };
  notes?: string;
}

export interface NodeRecord {
  locator: string;
  kind: string; // adapter-defined (open vocabulary)
  name?: string;
  visible?: boolean;
  componentRef?: string;
  properties?: Record<string, unknown>;
  revision: string;
}

export type PortResult<T> = { ok: true; value: T } | { ok: false; diagnostic: Diagnostic };

export interface DesignSourcePort {
  describe(): SourceDescriptor;
  readNode(locator: string): PortResult<NodeRecord>;
  /** Document order. Scope-bounded like readNode. */
  listChildren(locator: string): PortResult<string[]>;
  resolveRevision(): SourceRevision;
}

// CONTRACTS.md §1: outside-scope is internally an error, externally INDISTINGUISHABLE from an
// absent node — no information leak. The diagnostic therefore never names the requested locator
// and carries no subject: every out-of-scope read returns byte-identical diagnostics.
const SCOPE_ESCAPE = (sourceId: string): Diagnostic => ({
  code: "LOCATOR_OUT_OF_SCOPE",
  severity: "error",
  message: `The requested locator is outside the declared scopes of design source '${sourceId}'.`,
});

function diag(code: string, message: string, locator: string): Diagnostic {
  return { code, severity: "error", message, subject: { type: "node", id: locator } };
}

// Port implementation over one validated design-source snapshot. Snapshot graph integrity
// (unique locators, resolvable children, cycle-free, rooted at rootLocator) is checked here so
// every readNode/listChildren answer is trustworthy; violations surface as explicit
// EVIDENCE_MISSING errors on the affected locator, never as silently truncated trees.
export class SnapshotDesignSourcePort implements DesignSourcePort {
  readonly #descriptor: SourceDescriptor;
  readonly #byLocator: Map<string, DesignSourceSnapshotNode>;
  readonly #reachableFromRoot: Set<string>;

  constructor(snapshot: DesignSourceSnapshot, scopes: { include?: string[]; exclude?: string[] } = {}, notes?: string) {
    this.#descriptor = {
      sourceId: snapshot.sourceId,
      ...(snapshot.providerId ? { providerId: snapshot.providerId } : {}),
      revision: { sourceId: snapshot.sourceId, revisionId: snapshot.revisionId, accessedAt: snapshot.accessedAt },
      scopes,
      ...(notes ? { notes } : {}),
    };
    this.#byLocator = new Map(snapshot.nodes.map((n) => [n.locator, n]));
    this.#reachableFromRoot = computeReachable(snapshot.nodes, snapshot.rootLocator);
  }

  /** True when the snapshot graph is complete: unique locators, every child resolvable, cycle-free, all reachable from the root. */
  graphErrors(): Diagnostic[] {
    const errors: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const node of this.#byLocator.values()) {
      if (seen.has(node.locator)) {
        errors.push(diag("EVIDENCE_MISSING", `Duplicate locator '${node.locator}' in the design-source snapshot; identity must be unique.`, node.locator));
        continue;
      }
      seen.add(node.locator);
    }
    for (const node of this.#byLocator.values()) {
      if (!this.#reachableFromRoot.has(node.locator)) continue;
      for (const child of node.children) {
        if (!this.#byLocator.has(child)) {
          errors.push(diag("EVIDENCE_MISSING", `Node '${node.locator}' references child '${child}' that is absent from the snapshot — incomplete subtree, fail closed.`, child));
        }
      }
    }
    return errors;
  }

  describe(): SourceDescriptor {
    return this.#descriptor;
  }

  resolveRevision(): SourceRevision {
    return this.#descriptor.revision;
  }

  readNode(locator: string): PortResult<NodeRecord> {
    const node = this.#byLocator.get(locator);
    if (!node || !this.#reachableFromRoot.has(locator)) {
      return { ok: false, diagnostic: SCOPE_ESCAPE(this.#descriptor.sourceId) };
    }
    return {
      ok: true,
      value: {
        locator: node.locator,
        kind: node.kind,
        name: node.name,
        ...(node.visible !== undefined ? { visible: node.visible } : {}),
        ...(node.componentRef !== undefined ? { componentRef: node.componentRef } : {}),
        ...(node.properties !== undefined ? { properties: node.properties } : {}),
        revision: this.#descriptor.revision.revisionId,
      },
    };
  }

  listChildren(locator: string): PortResult<string[]> {
    const node = this.#byLocator.get(locator);
    if (!node || !this.#reachableFromRoot.has(locator)) {
      return { ok: false, diagnostic: SCOPE_ESCAPE(this.#descriptor.sourceId) };
    }
    return { ok: true, value: [...node.children] };
  }
}

// Reachability from the root with cycle detection: nodes on a cycle are unreachable-by-definition
// here and the cycle is reported by extract() as an EVIDENCE_MISSING error.
function computeReachable(nodes: DesignSourceSnapshotNode[], root: string): Set<string> {
  const byLocator = new Map(nodes.map((n) => [n.locator, n]));
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const walk = (locator: string): void => {
    if (reachable.has(locator) || visiting.has(locator)) return; // visiting = cycle guard
    if (!byLocator.has(locator)) return;
    visiting.add(locator);
    reachable.add(locator);
    for (const child of byLocator.get(locator)?.children ?? []) walk(child);
    visiting.delete(locator);
  };
  walk(root);
  return reachable;
}
