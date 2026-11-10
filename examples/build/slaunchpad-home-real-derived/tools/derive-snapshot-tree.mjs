#!/usr/bin/env node
// [56] Derive the offline design-source tree document from a committed live-read NodeIR.
//
// This is the provenance tool behind examples/build/slaunchpad-home-real-derived: the #18
// live Figma extraction produced NodeIR/PageStructure/SourceReview (sanitized derived
// artifacts; the raw provider snapshot is not committed), while `det build` major 1 consumes
// an OFFLINE snapshot/tree document through the fixture transport adapter. This script
// materializes the equivalent tree document VERBATIM from the committed NodeIR, so the
// offline build re-derives the same inventory at the same pinned revision — the "real-derived,
// revision-pinned" port, never a re-extraction and never a fixture stand-in.
//
// Faithfulness contract (each step reproduces the core's own derivation, see
// src/core/design-source/extract.ts):
// - locator        <- the node's sourceEvidence locator (strip the `design://<sourceId>/` prefix)
// - kind           <- an adapter-vocabulary kind whose core kind-table mapping equals the
//                     committed NodeIR kind; node identity hashes the MAPPED kind, so ids,
//                     section ids and evidence ids reproduce exactly.
// - componentRef   <- recovered verbatim from the committed NodeIR diagnostics (one
//                     NOT_VERIFIED warning per unresolvable component reference carries the
//                     exact ref string; message shape is the core's own).
// - layout         <- the committed (already-coerced) layout primitives, idempotent under
//                     the core's coerceLayout.
// - visible/children <- verbatim; children mapped back to locators in document order.
//
// Deterministic output: fixed key order, 1-space indent, trailing newline. Re-running the
// script over the same NodeIR reproduces the committed tree document byte-for-byte (locked
// by tests/real-derived-suite.mjs R56-T1).
//
// Usage: node derive-snapshot-tree.mjs <node-ir.json> <out-tree.json> <sourceId> <revisionId>
import fs from "node:fs";

const [nodeIrPath, outPath, sourceId, revisionId] = process.argv.slice(2);
if (!nodeIrPath || !outPath || !sourceId || !revisionId) {
  console.error("usage: node derive-snapshot-tree.mjs <node-ir.json> <out-tree.json> <sourceId> <revisionId>");
  process.exit(2);
}

const ir = JSON.parse(fs.readFileSync(nodeIrPath, "utf8"));
if (ir.schemaVersion !== 1 || !Array.isArray(ir.nodes) || ir.nodes.length === 0) {
  console.error("input does not look like a NodeIR v1 document (nodes[] required)");
  process.exit(1);
}

// componentRef per nodeId, from the committed diagnostics. The core emits exactly one
// dangling-ref NOT_VERIFIED warning per unresolvable component reference, naming the exact
// ref string; conflicting recoveries are a hard error (never guessed).
const refs = new Map();
const danglingRe = /^Component reference '([^']+)' on '.*' does not resolve to an inventoried component definition/;
for (const d of ir.diagnostics ?? []) {
  const m = danglingRe.exec(d.message ?? "");
  if (!m) continue;
  const nodeId = d.subject?.id;
  if (!nodeId) {
    console.error("dangling-ref diagnostic without a node subject; refusing to guess");
    process.exit(1);
  }
  if (refs.has(nodeId) && refs.get(nodeId) !== m[1]) {
    console.error(`conflicting componentRef recovery for ${nodeId}`);
    process.exit(1);
  }
  refs.set(nodeId, m[1]);
}

const prefix = `design://${sourceId}/`;
const locatorOf = new Map();
for (const n of ir.nodes) {
  const locator = n.sourceEvidence?.[0]?.locator ?? null;
  if (typeof locator !== "string" || !locator.startsWith(prefix)) {
    console.error(`node ${n.nodeId} carries no '${prefix}*' evidence locator; refusing`);
    process.exit(1);
  }
  locatorOf.set(n.nodeId, locator.slice(prefix.length));
}

// Adapter kind per committed (mapped) NodeIR kind. Any alias of the same mapping works —
// identity hashes the mapped kind — these are the transport-canonical choices.
const KIND_OF_MAPPED = {
  container: "frame",
  component: "component",
  text: "text",
  icon: "vector",
  media: "media",
  "page-section": "page",
  divider: "line",
  spacer: "spacer",
};

const nodes = ir.nodes.map((n) => {
  const kind = KIND_OF_MAPPED[n.kind];
  if (!kind) {
    console.error(`no adapter kind maps to NodeIR kind '${n.kind}'; extend KIND_OF_MAPPED explicitly — never guess`);
    process.exit(1);
  }
  const entry = { locator: locatorOf.get(n.nodeId), kind, name: n.name };
  if (n.visible === false) entry.visible = false;
  if (refs.has(n.nodeId)) entry.componentRef = refs.get(n.nodeId);
  entry.properties = { layout: n.layout };
  entry.children = (n.childrenNodeIds ?? []).map((c) => {
    const loc = locatorOf.get(c);
    if (!loc) {
      console.error(`child ${c} of ${n.nodeId} has no locator mapping`);
      process.exit(1);
    }
    return loc;
  });
  return entry;
});

const doc = { revisionId, nodes };
fs.writeFileSync(outPath, JSON.stringify(doc, null, 1) + "\n");
console.error(`derive-snapshot-tree: wrote ${nodes.length} node(s); root locator ${locatorOf.get(ir.rootNodeId)} @ revision ${revisionId}`);
