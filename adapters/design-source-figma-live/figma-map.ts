// Pure normalization for the live design-source adapter (issue #18): provider REST document
// nodes -> the platform-neutral design-source snapshot vocabulary. This module is the adapter's
// ONLY place that knows the provider wire shape; the subprocess entry wraps it in transport
// validation, and the det core never imports any of it.
//
// Normalization rules (deterministic, evidence-based, nothing invented):
// - KIND TABLE (provider type -> adapter-defined snapshot kind; the core's closed mapping table
//   consumes these): CANVAS->page, FRAME/GROUP/SECTION->frame-family containers (frame, group),
//   COMPONENT/COMPONENT_SET->component, INSTANCE->instance, TEXT->text, VECTOR->vector,
//   LINE->line. The remaining shape family (RECTANGLE, ROUNDED_RECTANGLE, ELLIPSE, REGULAR_POLYGON,
//   STAR) maps to "shape" — UNLESS the node is a leaf carrying an image fill, in which case it is
//   honest media ("media"): image evidence comes only from the declared fill type, never guessed
//   from geometry or naming. Anything outside the table keeps its provider type verbatim; the
//   core maps unmappable kinds to unknown + NOT_VERIFIED (never a near-miss bucket).
// - LAYOUT primitives are preserved verbatim into properties.layout (the core's exact vocabulary):
//   direction row/column from the declared auto-layout axis; a non-auto-layout container means
//   its children are positioned absolutely, so direction stays "absolute"; positioning derives
//   from the PARENT's auto-layout (a child of a flow container is static unless it declares
//   absolute positioning; a child of a non-flow container is absolute); overflow from
//   clipsContent; constraints carry the provider's per-axis tokens verbatim; relativeSizes
//   records a stretch (fill-grow) child as its observed fraction of the parent's bounding box —
//   measured, rounded to 4 decimals, never inferred.
// - Instance variant properties (declared variant assignments) are copied into properties.variants;
//   the instance's definition reference is carried as componentRef verbatim and may point outside
//   the extracted subtree — the core records that honestly, never resolves it by guessing.
// - Text content, fill values, image references and bytes are NEVER copied: the snapshot carries
//   structure, kinds, names, visibility and layout facts only.
// - The walk is bounded (MAX_NODES) and emits every node of the requested subtree — hidden nodes,
//   instances, decorations and unknown kinds included; the adapter never pre-filters semantics.
export const MAX_NODES = 100_000;

export interface FigmaVector {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FigmaFill {
  type?: string;
}

export interface FigmaComponentProperty {
  type?: string;
  value?: unknown;
}

// Deliberately loose: the provider's document node is read defensively field-by-field; unknown
// provider fields are simply never read. Nothing here trusts the wire beyond what it uses.
export interface FigmaDocNode {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  children?: FigmaDocNode[];
  componentId?: string;
  componentProperties?: Record<string, FigmaComponentProperty>;
  constraints?: { horizontal?: string; vertical?: string };
  layoutMode?: string;
  layoutPositioning?: string;
  clipsContent?: boolean;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutGrow?: number;
  absoluteBoundingBox?: FigmaVector;
  fills?: FigmaFill[];
}

export interface SnapshotNode {
  locator: string;
  kind: string;
  name: string;
  visible?: boolean;
  componentRef?: string;
  properties?: Record<string, unknown>;
  children: string[];
}

const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "SECTION", "COMPONENT", "COMPONENT_SET", "CANVAS", "BOOLEAN_OPERATION"]);
const SHAPE_TYPES = new Set(["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE", "REGULAR_POLYGON", "STAR"]);
const NAME_CAP = 512;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// The documented kind table. `imageFillLeaf` marks a childless node whose declared fills include
// an IMAGE entry — honest media evidence from the source, not a guess.
export function kindOf(type: string, imageFillLeaf: boolean): string {
  if (type === "CANVAS") return "page";
  if (type === "FRAME" || type === "SECTION") return "frame";
  if (type === "GROUP" || type === "BOOLEAN_OPERATION") return "group";
  if (type === "COMPONENT" || type === "COMPONENT_SET") return "component";
  if (type === "INSTANCE") return "instance";
  if (type === "TEXT") return "text";
  if (type === "VECTOR") return "vector";
  if (type === "LINE") return "line";
  if (type === "SLICE") return "slice";
  if (SHAPE_TYPES.has(type)) return imageFillLeaf ? "media" : "shape";
  return type.toLowerCase();
}

function hasImageFill(node: FigmaDocNode): boolean {
  if (!Array.isArray(node.fills)) return false;
  return node.fills.some((f) => isRecord(f as unknown) && (f as FigmaFill).type === "IMAGE");
}

// Layout primitives in the core's exact vocabulary. `parentFlow` = the parent declares a
// row/column auto-layout; children of non-flow parents are absolutely positioned by definition.
function layoutOf(node: FigmaDocNode, parentFlow: boolean): Record<string, unknown> | undefined {
  const isContainer = CONTAINER_TYPES.has(node.type ?? "") || Array.isArray(node.children);
  const flow = node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";
  if (!isContainer && !flow && node.clipsContent === undefined && node.constraints === undefined) return undefined;
  const direction = flow ? (node.layoutMode === "HORIZONTAL" ? "row" : "column") : isContainer ? "absolute" : "unknown";
  const positioning = node.layoutPositioning === "ABSOLUTE" ? "absolute" : parentFlow ? "static" : isContainer ? "static" : "absolute";
  const overflow = node.clipsContent === true ? "hidden" : node.clipsContent === false ? "visible" : "unknown";
  const constraints: { axis: string; type: string; value: string }[] = [];
  if (typeof node.constraints?.horizontal === "string" && node.constraints.horizontal.length > 0) constraints.push({ axis: "x", type: node.constraints.horizontal, value: "constraint" });
  if (typeof node.constraints?.vertical === "string" && node.constraints.vertical.length > 0) constraints.push({ axis: "y", type: node.constraints.vertical, value: "constraint" });
  constraints.sort((a, b) => a.axis.localeCompare(b.axis) || a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  return { direction, positioning, overflow, constraints };
}

// A stretch child (fill-grow) measured against its parent's bounding box — an observed fraction,
// recorded only when both widths/heights are finite and positive.
function relativeSizesOf(node: FigmaDocNode, parentBox: FigmaVector | undefined): { target: string; ratio: number }[] {
  const out: { target: string; ratio: number }[] = [];
  const fillsHorizontally = node.layoutSizingHorizontal === "FILL" || node.layoutGrow === 1;
  const fillsVertically = node.layoutSizingVertical === "FILL";
  const box = node.absoluteBoundingBox;
  if (fillsHorizontally && box && parentBox && finite(box.width) && finite(parentBox.width) && box.width > 0 && parentBox.width > 0) {
    out.push({ target: "parent-width", ratio: round4(box.width / parentBox.width) });
  }
  if (fillsVertically && box && parentBox && finite(box.height) && finite(parentBox.height) && box.height > 0 && parentBox.height > 0) {
    out.push({ target: "parent-height", ratio: round4(box.height / parentBox.height) });
  }
  out.sort((a, b) => a.target.localeCompare(b.target));
  return out;
}

// Declared variant assignments on an instance: only VARIANT-typed component properties, values
// verbatim (stringified). Other property kinds (text/boolean/swap) are content or state — never
// copied into the snapshot.
function variantsOf(node: FigmaDocNode): Record<string, string> | undefined {
  if (!isRecord(node.componentProperties as unknown)) return undefined;
  const out: Record<string, string> = {};
  for (const [prop, spec] of Object.entries(node.componentProperties as Record<string, FigmaComponentProperty>)) {
    if (!isRecord(spec as unknown)) continue;
    if (spec.type !== "VARIANT") continue;
    out[prop] = typeof spec.value === "string" ? spec.value : JSON.stringify(spec.value ?? null);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface SnapshotSubtree {
  nodes: SnapshotNode[];
}

// Bounded walk of the requested subtree, in document order — iterative (explicit stack), so a
// pathologically deep provider chain hits the node budget instead of the JS stack. Throws when
// the subtree exceeds MAX_NODES — the caller fails closed (bounded reads, no unbounded walks).
export function toSnapshotNodes(root: FigmaDocNode): SnapshotSubtree {
  const nodes: SnapshotNode[] = [];
  const stack: { node: FigmaDocNode; parentFlow: boolean; parentBox: FigmaVector | undefined }[] = [{ node: root, parentFlow: false, parentBox: undefined }];
  while (stack.length > 0) {
    if (nodes.length >= MAX_NODES) throw new Error(`subtree exceeds the ${MAX_NODES}-node budget`);
    const { node, parentFlow, parentBox } = stack.pop() as { node: FigmaDocNode; parentFlow: boolean; parentBox: FigmaVector | undefined };
    const locator = typeof node.id === "string" && node.id.length > 0 ? node.id : "";
    if (!locator) throw new Error("a provider node is missing its identifier — refusing to transport an unidentifiable node");
    const childNodes = Array.isArray(node.children) ? node.children : [];
    const type = typeof node.type === "string" && node.type.length > 0 ? node.type : "UNKNOWN";
    const leafImage = childNodes.length === 0 && hasImageFill(node);
    const layout = layoutOf(node, parentFlow);
    const relativeSizes = relativeSizesOf(node, parentBox);
    const variants = variantsOf(node);
    const properties: Record<string, unknown> = {};
    if (layout) properties["layout"] = layout;
    if (relativeSizes.length > 0 && layout) (layout as Record<string, unknown>)["relativeSizes"] = relativeSizes;
    if (variants) properties["variants"] = variants;
    nodes.push({
      locator,
      kind: kindOf(type, leafImage),
      name: (typeof node.name === "string" && node.name.length > 0 ? node.name : type).slice(0, NAME_CAP),
      ...(node.visible === false ? { visible: false } : {}),
      ...(typeof node.componentId === "string" && node.componentId.length > 0 ? { componentRef: node.componentId.slice(0, NAME_CAP) } : {}),
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      children: childNodes.map((c) => (typeof c.id === "string" ? c.id : "")),
    });
    // Push in reverse so children pop in document order.
    const flow = node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";
    for (let i = childNodes.length - 1; i >= 0; i--) stack.push({ node: childNodes[i], parentFlow: flow, parentBox: node.absoluteBoundingBox });
  }
  return { nodes };
}
