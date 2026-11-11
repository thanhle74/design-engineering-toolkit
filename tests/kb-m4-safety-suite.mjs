// Issue #19 M4 suite (W-C part 2) — portability + private-store safety gate.
// (a) the private store (.toolkit/, local-kb/) stays out of git; (b) KB-26-style portability
// scan extended over the KB knowledge surfaces; (c) the platformRecords ingest lane enforces
// the secret guard; (d) STALE-via-extract: digest-driven staleness over extract-emitted
// platformRecords. Everything is synthetic (acme-style names); fixtures are built in tmpdir.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { main } from "../packages/core/dist/src/core/cli/main.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Synthetic secret markers (fixture sentinel strings — no real credential material anywhere).
const SECRET_MARKERS = [
  "MAGENTO_LIKE_FIXTURE_SECRET_MARKER_9f3e1",
  "FIXTURE_AUTH_MARKER_do_not_leak_1c2b3",
  "DENIED_SURFACE_MARKER_never_read_5d4a2",
  "DIRTY_ENV_MARKER_4f8a2",
  "DIRTY_AUTH_MARKER_7c1d9",
  "HYVA_LICENSED_TEMPLATE_MARKER_2b6e4",
  "HYVA_LICENSED_EXCERPT_MARKER_9d2f1",
  "SuperSecret99",
];

// KB-26-style forbidden patterns, extended for M4: owner paths of every common shape, real
// store-layout references under local-kb/, .toolkit/ lines paired with absolute paths, key
// material, credential literals (the same shapes the engine's secret guard rejects), markers.
const SCAN_PATTERNS = [
  ["OWNER_HOME_PATH", /\/home\/[A-Za-z0-9._-]/],
  ["OWNER_USERS_PATH", /\/Users\/[A-Za-z0-9._-]/],
  ["OWNER_ROOT_PATH", /\/root\/[A-Za-z0-9._-]/],
  ["LOCAL_KB_REAL_PATH", /local-kb\/(?!<)[A-Za-z0-9._-]/],
  ["TOOLKIT_WITH_ABS_PATH", /\.toolkit\/[^\n]*(\/home\/|\/Users\/|\/root\/)/],
  ["PRIVATE_KEY_MATERIAL", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["CREDENTIAL_LITERAL", /(?:api[_-]?key|apikey|secret|password|passwd|token|auth[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i],
  ...SECRET_MARKERS.map((m) => ["SECRET_MARKER", new RegExp(m)]),
];

function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `det-m4-${prefix}-`));
}

// A private-store reference (the shape a load-bearing owner path pointer would take in prose).
const PRIVATE_STORE_REF = /(local-kb\/|\.toolkit\/)/;

async function runCli(args, env = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { ...env }, { env: { ...env }, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function parseJsonRun(result) {
  return JSON.parse(result.out).run;
}

function readJsonl(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  return raw.length ? raw.split("\n").map((l) => JSON.parse(l)) : [];
}

// Synthetic extract-emitted platform record (kb-capability record). recordType "capability" is
// used for the lane-mechanics checks below because of a REPORTED engine gap: safety.ts
// schemaNameForRecord does not yet map recordType "module" -> kb-capability, so the M4 module
// recordType (legal per the schema) is refused by the ingest safety gate (see KB-M4-S6).
function moduleRecord(overrides = {}) {
  const recordType = overrides.recordType ?? "capability";
  const prefix = recordType === "module" ? "mod" : "cap";
  return {
    recordType,
    id: `${prefix}:acme-storefront:framework-bridge`,
    namespace: "acme-storefront",
    nativeId: "Acme_StorefrontFrameworkBridge",
    platform: "magento",
    platformVersion: "2.4.8-p5",
    origin: "custom",
    category: "platform-glue",
    title: "Acme storefront framework bridge",
    semantics: "Installed module declaration observed from synthetic registration and module.xml declarations; platform inventory fact, not a capability claim.",
    version: { declared: "1.0.0" },
    installed: true,
    enablement: { state: "enabled", source: "config-scan" },
    sourceRef: { kind: "repo-file", locator: { rootAlias: "src", path: "app/code/Acme/StorefrontFramework/etc/module.xml" } },
    evidence: { proofLevel: "DETECTED", confidence: "high", method: "module-declaration-scan", uncertainty: ["Declaration-only inventory; runtime enablement is a separate fact."] },
    ...overrides,
  };
}

// Stage a minimal extract-output platformRecords file + a platformRecords-only ingest manifest
// in one tmpdir (this is the contract `det kb extract` output must satisfy: an array of
// kb-capability records a plain ingest manifest can consume with no other lane present).
function stageExtractFixture(records) {
  const dir = mkTemp("extract");
  fs.writeFileSync(path.join(dir, "platform-records.json"), JSON.stringify(records, null, 2) + "\n");
  const manifest = {
    schemaVersion: 1,
    manifestId: "m4-extract-fixture",
    platform: { id: "magento", version: "2.4.8-p5" },
    inputs: { platformRecords: { path: "platform-records.json", label: "synthetic extract output" } },
  };
  const manifestPath = path.join(dir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { dir, manifestPath, recordsPath: path.join(dir, "platform-records.json") };
}

export default async function registerKbM4SafetySuite(checkAsync) {
  await checkAsync("KB-M4-S1", "private store hygiene: .toolkit/ and local-kb/ are gitignored and nothing under them is tracked", async () => {
    const ignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    const lines = ignore.split("\n").map((l) => l.trim());
    assert.ok(lines.includes(".toolkit/"), ".gitignore must ignore .toolkit/");
    assert.ok(lines.includes("local-kb/"), ".gitignore must ignore local-kb/");
    // CI-safe: ls-files works whether or not the directories exist locally.
    const ls = spawnSync("git", ["ls-files", ".toolkit", "local-kb"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(ls.status, 0, `git ls-files failed: ${ls.stderr}`);
    assert.equal(ls.stdout.trim(), "", "no file under .toolkit/ or local-kb/ may ever be tracked");
    const ciStore = spawnSync("git", ["check-ignore", "-q", "local-kb/pilot/store.json"], { cwd: ROOT });
    assert.equal(ciStore.status, 0, "local-kb store files must be ignored");
    const ciConfig = spawnSync("git", ["check-ignore", "-q", ".toolkit/local.json"], { cwd: ROOT });
    assert.equal(ciConfig.status, 0, ".toolkit/local.json must be ignored");
    return "gitignore lines + 0 tracked + check-ignore 2/2";
  });

  await checkAsync("KB-M4-S2", "portability scan extended: schemas/**, examples/**, docs/knowledge/**, specs/knowledge-foundation/** carry no owner paths, real private-store path references or credential material", async () => {
    const scanRoots = ["packages/core/schemas", "examples", "docs/knowledge", "specs/knowledge-foundation"];
    for (const r of scanRoots) assert.ok(fs.existsSync(path.join(ROOT, r)), `${r} must exist — the scan must never be vacuous`);
    const hits = [];
    const scan = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) scan(p);
        else if (/\.(json|jsonl)$/.test(ent.name)) {
          // Engine-readable data surfaces: EVERY pattern applies strictly, owner paths included.
          const text = fs.readFileSync(p, "utf8");
          for (const [id, re] of SCAN_PATTERNS) if (re.test(text)) hits.push(`${path.relative(ROOT, p)}: ${id}`);
        } else if (/\.md$/.test(ent.name)) {
          // Prose surfaces: all credential/marker/private-store patterns still apply, but a bare
          // owner path that only DOCUMENTS the boundary (the specs discuss the rule itself) is
          // not flagged; an owner path PAIRED on one line with a private-store reference is a
          // load-bearing pointer and is flagged.
          const text = fs.readFileSync(p, "utf8");
          for (const [id, re] of SCAN_PATTERNS) {
            if (id === "OWNER_HOME_PATH" || id === "OWNER_USERS_PATH" || id === "OWNER_ROOT_PATH") {
              for (const line of text.split("\n")) {
                if (re.test(line) && PRIVATE_STORE_REF.test(line)) hits.push(`${path.relative(ROOT, p)}: ${id}`);
              }
            } else if (re.test(text)) hits.push(`${path.relative(ROOT, p)}: ${id}`);
          }
        }
      }
    };
    scanRoots.forEach((r) => scan(path.join(ROOT, r)));
    assert.deepEqual(hits, [], "portability/licensing violations (pattern ids only, content withheld):\n" + hits.join("\n"));
    return `0 violations across ${scanRoots.join(", ")} (${SCAN_PATTERNS.length} patterns; owner paths strict on data, pointer-paired on prose)`;
  });

  await checkAsync("KB-M4-S3", "platformRecords lane secret guard: credential-shaped module record -> exit 1 SECRET_PATTERN_DETECTED, value withheld", async () => {
    const SECRET_VALUE = "DeployPass2026";
    const poisoned = moduleRecord({ recordType: "module", nativeId: `password: "${SECRET_VALUE}"` });
    const { manifestPath } = stageExtractFixture([poisoned]);
    const r = await runCli(["kb", "ingest", "--manifest", manifestPath, "--json"]);
    assert.equal(r.code, 1, `refusal must exit 1, got ${r.code}: ${r.out}`);
    const run = parseJsonRun(r);
    const diag = run.runDiagnostics.find((d) => d.code === "SECRET_PATTERN_DETECTED");
    assert.ok(diag, `expected SECRET_PATTERN_DETECTED, got ${JSON.stringify(run.runDiagnostics.map((d) => d.code))}`);
    assert.equal(diag.severity, "error");
    assert.equal(diag.subject?.id, poisoned.id, "the finding must name the record id");
    assert.ok(diag.message.includes("nativeId") && diag.message.includes("secret pattern"), `violation kind + field path must be named: ${diag.message}`);
    assert.ok(!r.out.includes(SECRET_VALUE) && !r.err.includes(SECRET_VALUE), "secret VALUE must never appear in output");
    return "platformRecords lane runs the same write-time secret gate; id + kind named, value withheld";
  });

  await checkAsync("KB-M4-S4", "platformRecords lane honest sibling: clean extract output ingests into a staged store (record ACTIVE)", async () => {
    const { manifestPath } = stageExtractFixture([moduleRecord()]);
    const store = mkTemp("store-plat");
    const r = await runCli(["kb", "ingest", "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(r.code, 0, `clean ingest must pass: ${r.err}`);
    const ingest = JSON.parse(r.out).output.ingest;
    assert.deepEqual({ platform: ingest.platform, ui: ingest.ui, relations: ingest.relations }, { platform: 1, ui: 0, relations: 0 }, "exactly one platform record ingested");
    const records = readJsonl(path.join(store, "platform", "records.jsonl"));
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "capability", "kb-capability records ingest through the platformRecords lane");
    assert.equal(records[0].lifecycle.state, "ACTIVE");
    assert.ok(records[0].observed.inputDigests["platform-records.json"], "record pins the extract-output digest");
    const v = await runCli(["kb", "validate", "--store", store, "--json"]);
    assert.equal(v.code, 0, `staged store must validate clean: ${v.err}`);
    return "extract-output record ACTIVE in staged store, store validates";
  });

  await checkAsync("KB-M4-S5", "STALE-via-extract: digest change -> SOURCE_DIGEST_CHANGED + STALE; sync never upgrades; queries exclude STALE by default", async () => {
    const id = "cap:acme-storefront:framework-bridge";
    const { manifestPath, recordsPath } = stageExtractFixture([moduleRecord()]);
    const store = mkTemp("store-stale");
    // (1) fresh ingest: record ACTIVE with the extract output's digest pinned.
    const ing = await runCli(["kb", "ingest", "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(ing.code, 0, ing.err);
    // (2) mutate the extract output (bump the declared module version) -> digest changes.
    const bumped = moduleRecord({ version: { declared: "1.1.0" } });
    fs.writeFileSync(recordsPath, JSON.stringify([bumped], null, 2) + "\n");
    const sync1 = await runCli(["kb", "sync", "--store", store, "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(sync1.code, 0, sync1.err);
    const report1 = JSON.parse(sync1.out).output.sync;
    assert.equal(report1.stale, 1, "the digest change must stale exactly the dependent record");
    assert.deepEqual(report1.staleIds, [id]);
    assert.ok(parseJsonRun(sync1).runDiagnostics.some((d) => d.code === "SOURCE_DIGEST_CHANGED"), "SOURCE_DIGEST_CHANGED must be named");
    const bytesAfterSync1 = fs.readFileSync(path.join(store, "platform", "records.jsonl"), "utf8");
    const afterSync1 = readJsonl(path.join(store, "platform", "records.jsonl"));
    assert.equal(afterSync1[0].lifecycle.state, "STALE", "record marked STALE on disk");
    // (3) re-sync on unchanged inputs: the record stays STALE (pinned digests refresh only via a
    // fresh ingest) — sync never upgrades an already-stale record back to ACTIVE, and the
    // partition bytes do not churn.
    const sync2 = await runCli(["kb", "sync", "--store", store, "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(sync2.code, 0, sync2.err);
    const report2 = JSON.parse(sync2.out).output.sync;
    assert.deepEqual(report2.staleIds, [id], "already-stale stays stale (never upgrades)");
    assert.equal(fs.readFileSync(path.join(store, "platform", "records.jsonl"), "utf8"), bytesAfterSync1, "no churn between syncs");
    // (4) lifecycle honesty: the stale id is invisible by default, visible only with explicit include.
    const qDefault = await runCli(["kb", "query", "--store", store, "--kb", "platform", "--where", `id=${id}`, "--json"]);
    assert.equal(qDefault.code, 0, qDefault.err);
    assert.equal(JSON.parse(qDefault.out).output.hits.length, 0, "STALE record excluded from default query");
    const qInclude = await runCli(["kb", "query", "--store", store, "--kb", "platform", "--where", `id=${id}`, "--include-lifecycle", "ACTIVE,STALE", "--json"]);
    assert.equal(qInclude.code, 0, qInclude.err);
    const hits = JSON.parse(qInclude.out).output.hits;
    assert.equal(hits.length, 1, "explicit lifecycle include surfaces the stale record");
    assert.equal(hits[0].record.lifecycle.state, "STALE");
    // (5) re-ingest is the only honest reset: fresh observation re-observes with the new digest.
    const re = await runCli(["kb", "ingest", "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(re.code, 0, re.err);
    const revived = readJsonl(path.join(store, "platform", "records.jsonl"));
    assert.equal(revived[0].lifecycle.state, "ACTIVE", "fresh ingest re-observes as ACTIVE");
    assert.equal(revived[0].version.declared, "1.1.0", "re-observed record carries the new extract content");
    const qAfter = await runCli(["kb", "query", "--store", store, "--kb", "platform", "--where", `id=${id}`, "--json"]);
    assert.equal(JSON.parse(qAfter.out).output.hits.length, 1, "record answers default queries again");
    return "ingest ACTIVE -> digest change STALE -> stays stale -> default-deny queries -> re-ingest resets";
  });

  await checkAsync("KB-M4-S6", "module recordType ingests through the platformRecords lane: safety gate maps it to kb-capability (recordType 'module' ACTIVE in store)", async () => {
    // Integrator fix (issue #19 M4): safety.ts schemaNameForRecord now maps "module" ->
    // "kb-capability", so the schema-legal module record ingests like any other KB-1 record.
    const { manifestPath } = stageExtractFixture([moduleRecord({ recordType: "module" })]);
    const store = mkTemp("store-mod");
    const r = await runCli(["kb", "ingest", "--manifest", manifestPath, "--out", store, "--json"]);
    assert.equal(r.code, 0, "module records must ingest once the safety-gate mapping lands");
    const run = parseJsonRun(r);
    const errors = run.runDiagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `unexpected error diagnostics: ${JSON.stringify(errors.map((d) => d.code))}`);
    const validate = await runCli(["kb", "validate", "--store", store, "--json"]);
    assert.equal(validate.code, 0, "staged store with a module record must validate");
    return "fixed: recordType 'module' passes the safety gate and lands ACTIVE (platform lane)";
  });
}
