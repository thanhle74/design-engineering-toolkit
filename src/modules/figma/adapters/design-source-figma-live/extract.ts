// Live design-source adapter — bounded read-only reader for ONE caller-selected design-source
// subtree over the provider's versioned HTTP API (issue #18 live pilot; out-of-process
// subprocess). Outgrows the fixture transport (#14): same contracts, real transport.
//
// Contract: stdin = one AdapterInput JSON document (schemas/cli/adapter-input.schema.json),
// stdout = one DesignSourceSnapshot payload (schemas/cli/design-source-snapshot.schema.json).
// The det core never imports this file; it spawns it per the adapter descriptor.
//
// Rules:
// - options.designFile carries the caller-supplied provider file key and options.designNode the
//   caller-selected root node id. Both are explicit CLI input upstream — no defaults, no bundled
//   identifiers, and no file key or node id is ever hardcoded in this adapter or its descriptor.
// - The credential comes ONLY from the caller's environment (DET lives by "credentials from the
//   caller's environment, never on the command line, in profiles or in receipts"). A missing
//   token fails closed with the exact blocker; the token is never echoed anywhere.
// - Scope contract: when the profile declares include selectors for this source, the requested
//   root must EQUAL one of them — the Owner-approved subtree is enforced at the transport, not
//   by convention. Any other root is refused (scope escape).
// - Bounded read: one GET for the requested root only, a hard response-size cap, a node budget,
//   no redirects followed, no geometry/vector-path download, no asset or image bytes ever read.
// - Read-only: no design-source mutation exists on this path; the adapter writes nothing anywhere.
// - Revision pin: the provider's returned version token pins the snapshot; without one (and no
//   lastModified fallback) the read fails closed — a snapshot without a revision is not evidence.
import fs from "node:fs";
import { validateContract } from "../../../../core/schema-registry.js";
import { MAX_NODES, toSnapshotNodes, type FigmaDocNode } from "./figma-map.js";

interface AdapterInput {
  schemaVersion: number;
  profileId: string;
  platformId: string;
  source: { sourceId: string; kind?: string; path: string; scopes?: { include?: string[]; exclude?: string[] } };
  options: { designFile?: string; designNode?: string };
}

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024; // hard honesty cap for one subtree read
const FETCH_TIMEOUT_MS = 30_000;
const FILE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{9,63}$/; // provider file keys: letters/digits/_/-, never URL-active
const NODE_ID_RE = /^[0-9]{1,10}:[0-9]{1,10}$/;
const DEFAULT_API_BASE = "https://api.figma.com";

function fail(message: string): never {
  console.error(`design-source-figma-live adapter: ${message}`);
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

const fileKey = input.options?.designFile;
const designNode = input.options?.designNode;
if (typeof fileKey !== "string" || fileKey.length === 0) fail("options.designFile is required (the provider file key of the approved source file).");
if (typeof designNode !== "string" || designNode.length === 0) fail("options.designNode is required (the caller-selected root node id).");
if (!FILE_KEY_RE.test(fileKey)) fail(`designFile '${fileKey}' is not a plausible file key (letters/digits/_/-, 10-64 chars, no separators) — refusing.`);
if (!NODE_ID_RE.test(designNode)) fail(`designNode '${designNode}' is not a plain node id (<number>:<number>) — refusing.`);

// Scope gate: the profile's include selectors (if any) are the exact set of approvable roots.
const include = Array.isArray(input.source.scopes?.include) ? (input.source.scopes?.include as string[]) : [];
if (include.length > 0 && !include.includes(designNode)) {
  fail(`designNode '${designNode}' is not inside the declared include scopes of source '${input.source.sourceId}' — scope escape, refusing.`);
}

// Credential: environment only. Never argv, never profile, never echoed.
const token = process.env["FIGMA_TOKEN"];
if (typeof token !== "string" || token.length === 0) {
  fail("FIGMA_TOKEN is not set in the environment — the live provider read requires a caller-supplied read-only token; failing closed (credentials are never accepted on argv, in profiles or in receipts).");
}

// API base: default provider endpoint; an explicit env override exists for tests and private
// gateways. Must be a plain http(s) origin/path without query or fragment.
const baseRaw = typeof process.env["FIGMA_API_BASE"] === "string" && process.env["FIGMA_API_BASE"].length > 0 ? (process.env["FIGMA_API_BASE"] as string) : DEFAULT_API_BASE;
let base: URL;
try {
  base = new URL(baseRaw);
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.search || base.hash) throw new Error("must be a plain http(s) origin/path without query or fragment");
} catch (e) {
  fail(`FIGMA_API_BASE '${baseRaw}' is not a usable API base (${(e as Error).message}) — refusing.`);
}

const prefix = base.pathname.replace(/\/+$/, "");
const url = new URL(`${base.origin}${prefix}/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(designNode)}`);

async function readBoundedBody(res: globalThis.Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) fail(`provider response for node '${designNode}' has no body (HTTP ${res.status}).`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        fail(`provider response for node '${designNode}' exceeded the ${MAX_RESPONSE_BYTES}-byte cap — bounded reads only, refusing.`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

let res: globalThis.Response;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  res = await fetch(url, {
    method: "GET",
    headers: { "X-Figma-Token": token, Accept: "application/json" },
    redirect: "manual", // never follow redirects with a credential attached
    signal: controller.signal,
  });
  clearTimeout(timer);
} catch (e) {
  fail(`provider request for node '${designNode}' failed: ${(e as Error).name === "AbortError" ? `timed out after ${FETCH_TIMEOUT_MS}ms` : (e as Error).message}`);
}
if (res.status >= 300 && res.status < 400) fail(`provider returned an unexpected redirect (HTTP ${res.status}) — redirects are never followed with a credential attached.`);
if (res.status === 401 || res.status === 403) fail(`provider rejected the read (HTTP ${res.status}) — token missing scope, expired, or not valid for this file; failing closed.`);
if (res.status === 404) fail(`provider returned 404 for node '${designNode}' — file or node not found or not readable by this token; failing closed.`);
if (res.status === 429) fail(`provider rate-limited the read (HTTP 429${res.headers.get("retry-after") ? `, retry-after ${res.headers.get("retry-after")}` : ""}) — reduce budget and retry later.`);
if (!res.ok) fail(`provider returned HTTP ${res.status} for node '${designNode}' — failing closed.`);

const body = await readBoundedBody(res);
let payload: unknown;
try {
  payload = JSON.parse(body);
} catch {
  fail("provider response body is not valid JSON — refusing.");
}
if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("provider response is not a JSON object — refusing.");
const doc = payload as { error?: unknown; version?: unknown; lastModified?: unknown; nodes?: Record<string, { document?: FigmaDocNode } | string> };
if (typeof doc.error === "string" && doc.error.length > 0) fail(`provider reported an error reading the source: ${doc.error.slice(0, 200)}`);

// Revision pin: the provider's version token; lastModified is the documented fallback. Neither
// present -> no pin is possible -> fail closed (a snapshot without a revision is not evidence).
let revisionId: string | null = null;
if (typeof doc.version === "string" && doc.version.length > 0) revisionId = doc.version;
else if (typeof doc.lastModified === "string" && doc.lastModified.length > 0) revisionId = doc.lastModified;
if (!revisionId) fail("provider response carries neither a version nor a lastModified token — no revision pin is possible; failing closed.");

const entry = doc.nodes?.[designNode];
const document = entry && typeof entry === "object" ? entry.document : undefined;
if (!document || typeof document !== "object") {
  fail(`provider response does not contain the requested node '${designNode}' — nothing was read; failing closed (the selected root must exist and be readable by this token).`);
}

let subtree;
try {
  subtree = toSnapshotNodes(document);
} catch (e) {
  fail(`provider subtree for node '${designNode}' cannot be transported: ${(e as Error).message}`);
}
if (subtree.nodes.length > MAX_NODES) fail(`provider subtree for node '${designNode}' exceeds the ${MAX_NODES}-node budget — bounded reads only.`);

const snapshot = {
  schemaVersion: 1,
  sourceId: input.source.sourceId,
  providerId: "figma-rest-v1",
  revisionId,
  accessedAt: new Date().toISOString(),
  rootLocator: designNode,
  nodes: subtree.nodes,
};
const outCheck = validateContract("design-source-snapshot", snapshot);
if (!outCheck.valid) fail(`constructed snapshot fails its contract: ${outCheck.errors[0] ?? "unknown"}`);
// Terminal-only operator note (never persisted into receipts by the det core).
console.error(`figma-live: pinned revision '${revisionId}', ${snapshot.nodes.length} node(s) under '${designNode}' (source '${input.source.sourceId}').`);
process.stdout.write(JSON.stringify(snapshot));
