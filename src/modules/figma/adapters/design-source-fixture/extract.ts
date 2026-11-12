// Design-source FIXTURE adapter — bounded read-only reader for synthetic design-source tree
// documents (out-of-process subprocess; issue #14 G2 synthetic gate).
//
// Contract: stdin = one AdapterInput JSON document (resources/schemas/cli/adapter-input.schema.json),
// stdout = one DesignSourceSnapshot payload (resources/schemas/cli/design-source-snapshot.schema.json).
// The det core never imports this file; it spawns it per the adapter descriptor.
//
// Rules:
// - The caller-selected root comes ONLY from options.designNode (plus options.designFile naming
//   the tree document inside the resolved source path). No defaults, no bundled trees.
// - The returned snapshot is BOUNDED to the requested subtree: nodes outside it are never read
//   into the payload. Children arrays are emitted as declared — a dangling child reference is
//   passed through so the core's graph-integrity check fails closed (EVIDENCE_MISSING).
// - designFile must be a plain filename inside the source path (no directory segments, no
//   traversal); the resolved file must realpath-contain inside the source root.
// - Node budget: a tree larger than MAX_NODES fails closed (bounded reads, no unbounded walks).
// - Read-only: this adapter writes nothing anywhere; it is a fixture transport, NOT a generic
//   plugin host, and it deliberately contains no provider-specific knowledge.
import fs from "node:fs";
import path from "node:path";
import { validateContract } from "../../../core/schema-registry.js";

const MAX_NODES = 100_000;

interface AdapterInput {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  source: { sourceId: string; kind?: string; path: string; scopes?: { include?: string[]; exclude?: string[] } };
  options: { designFile?: string; designNode?: string };
}

interface TreeDocNode {
  locator: string;
  kind: string;
  name: string;
  visible?: boolean;
  componentRef?: string;
  properties?: Record<string, unknown>;
  children: string[];
}

interface TreeDoc {
  revisionId: string;
  nodes: TreeDocNode[];
}

function fail(message: string): never {
  console.error(`design-source-fixture adapter: ${message}`);
  process.exit(1);
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (e) {
    fail(`cannot read stdin: ${(e as Error).message}`);
  }
}

const raw = readStdin();
let input: AdapterInput;
try {
  input = JSON.parse(raw) as AdapterInput;
} catch (e) {
  fail(`stdin is not valid JSON: ${(e as Error).message}`);
}
const inputCheck = validateContract("adapter-input", input);
if (!inputCheck.valid) fail(`stdin fails the adapter-input contract: ${inputCheck.errors[0] ?? "unknown"}`);

const designFile = input.options?.designFile;
const designNode = input.options?.designNode;
if (typeof designFile !== "string" || designFile.length === 0) fail("options.designFile is required (the tree document filename inside the source path).");
if (typeof designNode !== "string" || designNode.length === 0) fail("options.designNode is required (the caller-selected root locator).");
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(designFile)) fail(`designFile '${designFile}' must be a plain filename (no directory segments, no traversal).`);

let sourceRoot: string;
let treePath: string;
try {
  sourceRoot = fs.realpathSync(input.source.path);
  treePath = path.join(sourceRoot, designFile);
  const treeReal = fs.realpathSync(treePath);
  const rel = path.relative(sourceRoot, treeReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail(`designFile '${designFile}' resolves outside the source root — scope escape, refusing.`);
} catch (e) {
  fail(`cannot resolve tree document '${designFile}' under '${input.source.path}': ${(e as Error).message}`);
}

let tree: TreeDoc;
try {
  tree = JSON.parse(fs.readFileSync(treePath, "utf8")) as TreeDoc;
} catch (e) {
  fail(`tree document '${designFile}' is not valid JSON: ${(e as Error).message}`);
}
if (!tree || typeof tree.revisionId !== "string" || tree.revisionId.length === 0 || !Array.isArray(tree.nodes)) {
  fail(`tree document '${designFile}' must carry a revisionId and a nodes array.`);
}
if (tree.nodes.length > MAX_NODES) fail(`tree '${designFile}' exceeds the ${MAX_NODES}-node budget (${tree.nodes.length}); bounded reads only.`);

const byLocator = new Map<string, TreeDocNode>();
for (const n of tree.nodes) {
  if (!n || typeof n.locator !== "string" || n.locator.length === 0 || typeof n.kind !== "string" || n.kind.length === 0 || typeof n.name !== "string" || n.name.length === 0 || !Array.isArray(n.children)) {
    fail(`tree '${designFile}' has a malformed node entry (locator/kind/name/children are required).`);
  }
  if (!byLocator.has(n.locator)) byLocator.set(n.locator, n); // duplicates pass through verbatim; the core's graph check rejects them
}
if (!byLocator.has(designNode)) {
  fail(`designNode '${designNode}' does not exist in tree '${designFile}' — outside the readable source scope; refusing (caller selection must match the source).`);
}

// Bounded subtree: reachable set from the requested root over the declared graph.
const reachable: TreeDocNode[] = [];
const seen = new Set<string>();
const walk = (locator: string): void => {
  if (seen.has(locator) || reachable.length > MAX_NODES) return;
  const node = byLocator.get(locator);
  if (!node) return; // dangling child references pass through the parent's children array
  seen.add(locator);
  reachable.push(node);
  for (const child of node.children) walk(child);
};
walk(designNode);

const snapshot = {
  schemaVersion: 1,
  sourceId: input.source.sourceId,
  providerId: "fixture-tree",
  revisionId: tree.revisionId,
  accessedAt: new Date().toISOString(),
  rootLocator: designNode,
  nodes: reachable.map((n) => ({
    locator: n.locator,
    kind: n.kind,
    name: n.name,
    ...(n.visible !== undefined ? { visible: n.visible } : {}),
    ...(n.componentRef !== undefined ? { componentRef: n.componentRef } : {}),
    ...(n.properties !== undefined ? { properties: n.properties } : {}),
    children: [...n.children],
  })),
};

const outCheck = validateContract("design-source-snapshot", snapshot);
if (!outCheck.valid) fail(`constructed snapshot fails its contract: ${outCheck.errors[0] ?? "unknown"}`);
process.stdout.write(JSON.stringify(snapshot));
