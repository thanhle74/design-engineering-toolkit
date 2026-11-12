// [72] Hand-built test harness for the section-shape handlers: an in-memory
// SectionComposeContext (+ the dispatcher-provided role resolver) over synthesized NodeIR
// fixtures. Fixture locators are `design://fixture/<nodeId>`; role resolution mirrors the
// production precedence (explicit projection > SLOT naming-contract table for text nodes).
import type {
   Diagnostic,
   NodeIRNode,
   PageStructureSection,
} from "../../../../../core/types.js";
import type { ComposerRole, MappingEntry } from "../../handler-context.js";
import type { HandlerContext } from "../../shapes/handler-support.js";

export const ALL_CAPS = [
   "magento_pagebuilder/row#contained",
   "magento_pagebuilder/heading#default",
   "magento_pagebuilder/text#default",
   "magento_pagebuilder/image#full-width",
   "magento_pagebuilder/column-group#default",
   "magento_pagebuilder/column-line#default",
   "magento_pagebuilder/column#full-height",
   "magento_pagebuilder/buttons#inline",
   "magento_pagebuilder/button-item#default",
];

export function fixtureNode(
   nodeId: string,
   kind: NodeIRNode["kind"],
   name: string,
   extra: Partial<NodeIRNode> = {},
): NodeIRNode {
   return {
      childrenNodeIds: [],
      parentNodeId: null,
      layout: {
         direction: "column",
         positioning: "static",
         constraints: [],
         relativeSizes: [],
         overflow: "visible",
      },
      sourceEvidence: [
         {
            evidenceId: "e-000000000000",
            kind: "document",
            locator: `design://fixture/${nodeId}`,
            retrievedAt: "2026-01-01T00:00:00.000Z",
            method: "test-fixture",
         },
      ],
      ...extra,
      nodeId,
      kind,
      name,
   };
}

export function fixtureSection(
   name: string,
   constraints: { axis: "width" | "height"; value: string }[] = [],
): PageStructureSection {
   return {
      sectionId: "s-000000000000",
      order: 0,
      name,
      layout: {
         direction: "column",
         positioning: "static",
         constraints: constraints.map((c) => ({ ...c, type: "fixed" })),
         relativeSizes: [],
         overflow: "visible",
      },
      elements: [],
      sourceEvidence: [
         {
            evidenceId: "e-000000000000",
            kind: "document",
            locator: `design://fixture/section-node`,
            retrievedAt: "2026-01-01T00:00:00.000Z",
            method: "test-fixture",
         },
      ],
   };
}

// SLOT naming-contract table (mirrors compose.ts's TEXT_ROLE_TABLE — fixture semantics only).
const SLOT_TABLE: Record<string, ComposerRole> = {
   overline: "content-lead",
   heading: "heading",
   body: "body",
   bodycopy: "body",
   cta: "cta",
   ctalabel: "cta",
};

export interface CtxOptions {
   deniedCaps?: string[];
   texts?: Record<string, string>; // locator -> manifest text
   media?: Record<string, { mediaUrl: string; assetLabel?: string }>;
   links?: Record<
      string,
      {
         linkUrl: string;
         linkTarget?: string;
         variant?: "primary" | "secondary";
      }
   >;
   roles?: Record<string, ComposerRole>; // locator -> explicit projection
}

export function makeCtx(
   nodes: NodeIRNode[],
   opts: CtxOptions = {},
): HandlerContext & {
   diagnostics: Diagnostic[];
   mapping: MappingEntry[];
} {
   const diagnostics: Diagnostic[] = [];
   const mapping: MappingEntry[] = [];
   const nodesById = new Map<string, NodeIRNode>();
   for (const n of nodes) nodesById.set(n.nodeId, n);
   const locatorOf = (n: NodeIRNode): string | null =>
      n.sourceEvidence?.[0]?.locator ?? null;
   const walkSubtree = (
      rootId: string,
      visit: (node: NodeIRNode) => void,
   ): void => {
      const visitChildren = (id: string): void => {
         for (const childId of nodesById.get(id)?.childrenNodeIds ?? []) {
            const child = nodesById.get(childId);
            if (!child) continue;
            visit(child);
            visitChildren(childId);
         }
      };
      visitChildren(rootId);
   };
   const allowed = new Set(
      ALL_CAPS.filter((c) => !(opts.deniedCaps ?? []).includes(c)),
   );
   const requireCap = (id: string, appearanceId: string): boolean => {
      if (!allowed.has(`${id}#${appearanceId}`)) {
         diagnostics.push({
            code: "UNSUPPORTED_CAPABILITY",
            severity: "error",
            message: `Capability '${id}#${appearanceId}' is absent from the pinned registry (test fixture).`,
            subject: { type: "capability", id },
         });
         return false;
      }
      return true;
   };
   const excludedLocators = new Set<string>();
   const ctaSubtreeLocators = new Set<string>();
   for (const [loc, role] of Object.entries(opts.roles ?? {})) {
      if (role === "decoration") {
         excludedLocators.add(loc);
         const nodeId = loc.replace("design://fixture/", "");
         walkSubtree(nodeId, (n) => {
            const l = locatorOf(n);
            if (l) excludedLocators.add(l);
         });
      }
      if (role === "cta") {
         const nodeId = loc.replace("design://fixture/", "");
         walkSubtree(nodeId, (n) => {
            const l = locatorOf(n);
            if (l) ctaSubtreeLocators.add(l);
         });
      }
   }
   const resolveComposerRole = (node: NodeIRNode): ComposerRole | undefined => {
      const loc = locatorOf(node);
      const projected = loc ? opts.roles?.[loc] : undefined;
      if (projected && projected !== "decoration") return projected;
      if (node.kind !== "text") return undefined;
      const slash = node.name.indexOf("/");
      if (slash <= 0 || slash === node.name.length - 1) return undefined;
      const r = node.name
         .slice(slash + 1)
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "");
      return r ? SLOT_TABLE[r] : undefined;
   };
   return {
      nodesById,
      locatorOf,
      walkSubtree,
      requireCap,
      textByRef: new Map(Object.entries(opts.texts ?? {})),
      mediaByRef: new Map(Object.entries(opts.media ?? {})),
      linkByRef: new Map(Object.entries(opts.links ?? {})),
      roleByLocator: new Map(Object.entries(opts.roles ?? {})),
      excludedLocators,
      ctaSubtreeLocators,
      pushDiagnostic: (d: Diagnostic): void => {
         diagnostics.push(d);
      },
      pushMapping: (m: MappingEntry): void => {
         mapping.push(m);
      },
      resolveComposerRole,
      diagnostics,
      mapping,
   };
}
