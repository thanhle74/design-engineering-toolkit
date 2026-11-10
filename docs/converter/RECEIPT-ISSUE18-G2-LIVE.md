# RECEIPT — Issue #18: G2 Live Figma read-only extraction pilot (245:2)

**Date:** 2026-11-06 · **Branch:** `task/18-figma-live-readonly-pilot` · **Base:** `main` @ `185d91c`
**Gate status:** `LIVE_FIGMA_READ_ONLY_VERIFIED` (2026-11-10, §8) — supersedes the blocked attempts recorded in §3/§7
**Authorization:** Owner GO `OWNER_GO_RECEIVED / READ_ONLY_EXECUTION_AUTHORIZED` (issue #18 comment, 2026-11-04): read-only access to the selected Desktop root `245:2` of file `vNPtfBRpYM3PsExirVqhmt` only; no edits, no mobile `245:16`, no CMS/DB writes, one workspace/one PR, stop at plan.

---

## 1. What shipped (source-implemented, gate-tested)

**Live design-source adapter `design-source-figma-live`** — the bounded read-only provider transport behind the existing #14 seam (no core changes, no schema changes):

- `adapters/design-source-figma-live/extract.ts` — out-of-process subprocess: stdin = `adapter-input`, stdout = validated `design-source-snapshot`. One GET for the caller-selected subtree only; revision pinned from the provider's version token (`lastModified` documented fallback); **no revision pin → fail closed**; response cap 32 MiB (streamed, abort on overflow); node budget 100 000; redirects never followed (a credential must not leak to another host); no geometry/vector-path download; no image/asset bytes ever read; text content, fill values and image references never copied.
- **Credentials:** only from the caller's `FIGMA_TOKEN` environment variable — never argv, never profile, never receipts, never echoed. Missing token fails closed naming the exact blocker. `FIGMA_API_BASE` env override exists for offline tests/private gateways (default provider endpoint).
- **Scope gate at the transport:** the profile's `scopes.include` selectors are the exact set of approvable roots; any other requested root is refused (scope escape). The Owner-GOed root is pinned in the local (gitignored) profile, not in any committed file.
- `adapters/design-source-figma-live/figma-map.ts` — pure, deterministic provider→snapshot normalization with a **documented kind table** (`SECTION`/`FRAME`→frame-family containers, `COMPONENT_SET`→component, shape family→`shape`, **image-fill leaf → honest `media`** from declared fill type only, unknown provider types carried verbatim for the core's closed `unknown` mapping), verbatim layout primitives (auto-layout axis → row/column, non-flow containers → absolute, child positioning derived from the parent's flow, `clipsContent` → overflow, provider constraint tokens verbatim, measured fill-grow fractions rounded to 4 decimals), declared instance variant assignments, external component references passed through verbatim for honest core accounting. Iterative walk: a pathologically deep subtree hits the budget, not the JS stack.
- **Descriptor** registered beside the fixture adapter under the same snapshot output contract; `permissions.readOnly: true` (declarative, not OS sandbox — same trust boundary note as the runtime); no provider identifiers bundled anywhere in the adapter or descriptor.

**Gate:** `npm test` = build + **102/102 checks** (was 95 on merged main: 51 baseline + 15 G2 + 29 KB; **+7 new G2 checks T31a–T31g** for this adapter). All previous checks unchanged and green.

## 2. New gate checks (offline, deterministic — no network, no credentials, no provider identifiers committed)

| Check | Proves |
|---|---|
| G2-T31a | live adapter registers beside the fixture adapter under the same snapshot contract; read-only; identifier-free descriptor |
| G2-T31b | normalization: kind table, verbatim layout primitives (40/60 measured fill fractions), variants, image-fill media, empty-name fallback, hidden carried, 100 000-node budget fails the walk before the stack |
| G2-T31c | end-to-end adapter over a stubbed provider API: revision-pinned snapshot, source identity echo, document order, credential never echoed |
| G2-T31d | **13 blocked paths fail closed**: missing token, 401, 404, 429, response over cap, malformed body, in-band provider error, redirect refused, requested node absent, no revision pin, root outside include scopes, traversal-shaped file key, non-numeric node id |
| G2-T31e | full CLI extract: full inventory (18/18), chrome excluded from plan, media slot derived, honest custom-required instances, byte-stable determinism across runs |
| G2-T31f | live extract→plan chain: registry + binding pins accepted on a live-derived `PageStructure`; zero proven bindings honestly reported (`coverage.total = 0`) |
| G2-T31g | new surfaces stay free of secrets/owner identifiers; evidence/receipt policy (provider provenance pins allowed, token-shaped secrets never) enforced by scan |

## 3. Live execution attempt — exact evidence

Local (gitignored) profile pinned to the Owner-GOed scope (`scopes.include = ["245:2"]`, source id `figma-home-desktop`, target platform `magento-pagebuilder` so the existing #9 registry stays usable downstream). Executed command:

```
node bin/det.js extract \
  --profile projects/slaunchpad-fashion/local/figma-live-245.profile.json \
  --project <local-cache-dir> \
  --adapter design-source-figma-live \
  --design-file <file-key> --design-node 245:2 --json
```

**Result: exit 3, zero artifacts, fail closed.** Terminal-only adapter stderr named the exact blocker:

> `FIGMA_TOKEN is not set in the environment — the live provider read requires a caller-supplied read-only token; failing closed (credentials are never accepted on argv, in profiles or in receipts).`

Sanitized run envelope (no paths, no credentials, no source data): [`evidence/issue-18/live-read-blocked.tool-run.json`](../../evidence/issue-18/live-read-blocked.tool-run.json).

## 4. Why BLOCKED, and the single unblock action

The Owner's own contract on issue #18: *"if API credentials/provider revision are unavailable, fail closed and report exact blocker."* No Figma REST token exists in this execution environment (the earlier connected-Coordinator `get_metadata` probe carries **no revision pin** and only 162 of the descendants — it is explicitly not sufficient evidence for this gate, per the probe receipt).

**One action unblocks the proof — Owner provisions a read-only provider token:**

1. Create a personal access token with **read-only** file scope (no write scopes).
2. Make it available to the CLI process, e.g. `export FIGMA_TOKEN=...` in the shell before running (or a local gitignored `.env` mechanism of the operator's choice). The token never enters the repository.
3. Re-run the exact command in §3 (worktree `task/18-figma-live-readonly-pilot`). Expected on success: exit 0, three artifacts (`node-ir.json`, `page-structure.json`, `source-review.json`) + `tool-run.json`, every node accounted, revision pinned from the provider's version token, `SITE/` chrome excluded from the plan with container evidence, unknown/unsupported nodes inventoried with `NOT_VERIFIED`, and a mapping inventory receipt appended here. Only sanitized derived artifacts are committed — never raw provider responses, assets or credentials.

## 5. Decision log (this task)

- **ADR-018-001 — Adapter seam, not a core engine.** The live read is one more out-of-process `DesignSourcePort` transport behind the #14 snapshot boundary; the deterministic extractor, schemas and CLI are untouched; core stays provider-neutral (neutrality scans still ban provider terms from core/schemas/fixtures).
- **ADR-018-002 — Credentials via environment only.** Extends the existing "credentials from the caller's environment" rule: `FIGMA_TOKEN` (token never echoed; `FIGMA_API_BASE` overridable for tests). A missing token is a fail-closed blocker, not a degraded read.
- **ADR-018-003 — Scope enforcement at the transport.** Profile include selectors gate the approvable roots at the adapter (exact-match), so the Owner-GOed subtree is enforced where the read happens, not by convention. Any other root = scope escape.
- **ADR-018-004 — Honest kind normalization.** Provider types map through one documented table; an image-fill **leaf** is honest `media` (declared fill type only); a media node with children stays its container kind; unknown provider types stay unknown at the core (+`NOT_VERIFIED`), never a near-miss bucket.
- **ADR-018-005 — Revision pin or nothing.** The snapshot requires the provider's version token (lastModified fallback). Without a pin the read fails closed — a snapshot without a revision is not evidence, and the gate may only claim `LIVE_FIGMA_READ_ONLY_VERIFIED` when source + revision + full-tree coverage are proved.
- **ADR-018-006 — Evidence policy.** Committed evidence may carry provider provenance pins (file key, node id, revision — already public on the owning issue) and derived sanitized structures; raw provider responses, assets, text content and credentials are never committed; scans (G2-T31g) enforce this.

## 6. Boundaries honored

No Figma read/write beyond the single fail-closed attempt above; no `245:16`; no design mutations; no CMS/DB/storefront writes; nothing written by the CLI without `--out`; **stop at plan** — Page Builder serialization, CMS creation and Admin Edit→Save→Reload remain separately Owner-gated G3/G4. No claim of `LIVE_FIGMA_READ_ONLY_VERIFIED` is made.

## 7. Re-attempt 2026-11-10 — provisioned token is EXPIRED (still BLOCKED)

Following the §4 unblock action, the Owner provisioned a provider token into the execution environment. The §3 command was re-run unchanged on this branch (`7c4ccc2` lineage), scope `scopes.include = ["245:2"]`, with `FIGMA_TOKEN` present in the CLI process environment (loaded locally, never argv/profile/receipt).

**Result: exit 3, zero design artifacts, fail closed.** Terminal-only adapter stderr named the exact blocker: `provider rejected the read (HTTP 403) — token missing scope, expired, or not valid for this file; failing closed.` Read-only operator diagnosis via the provider identity endpoint (`GET /v1/me`, no design file touched): **HTTP 401 with provider reason `Token has expired`** — the provisioned token is expired, not missing and not mis-scoped.

Sanitized run envelope (no paths, no credentials, no source data): [`evidence/issue-18/live-read-blocked-2026-11-10.tool-run.json`](../../evidence/issue-18/live-read-blocked-2026-11-10.tool-run.json).

**Status: `BLOCKED_WITH_REASON: FIGMA_TOKEN_EXPIRED` — `LIVE_FIGMA_READ_ONLY_VERIFIED` NOT claimed** (same issue rule as §4: credentials/revision unavailable → fail closed and report the exact blocker). One design-source read attempt was made (the bounded single GET); the identity-endpoint check was token health only; no other page/frame/node was accessed; no writes anywhere.

**Unblock action unchanged (Owner):** provision a **currently valid** read-only token (expiry in the future; file-read scope only) and re-run the §3 command unchanged. Everything else in §4's success expectation applies as written.

## 8. LIVE PROOF — `LIVE_FIGMA_READ_ONLY_VERIFIED` (2026-11-10)

The Owner provisioned a currently valid read-only provider token (identity check HTTP 200; loaded locally into the CLI process environment, never argv/profile/receipt/committed). The §3 command was executed unchanged on the Owner-GOed scope (file `vNPtfBRpYM3PsExirVqhmt`, Desktop root `245:2` + descendants only), on the PR branch reconciled with `main` @ `1cc90b5` (merge `075a6ca`).

**Result: exit 0, every §4 success expectation met.**

- **Revision pin:** provider version token `2417494580183108397` on every node's source evidence.
- **Full subtree:** **337/337 nodes inventoried** under root `PAGE/Home/Desktop` — this authoritative full REST read supersedes the earlier 162-entry metadata probe (which the §0 probe receipt itself flagged as partial). Zero unaccounted nodes.
- **Accountability (source-review):** `MAPPED 168 · EXCLUDED_WITH_REASON 92 (all SITE_CHROME, theme-owned) · DECORATION_MERGED 49 · NEEDS_REVIEW 28 (external/unbound instances, honest custom-required) · REFERENCE_ONLY 0`; classes `SITE_CHROME 92 / EDITORIAL_SECTION 168 / SHARED_COMPONENT 28 / PRESENTATIONAL 49 / UNKNOWN 0`.
- **Plan:** **12 sections** planned (Hero/Primary, BrandStatement, Hero/Secondary, FeaturedCollections, FeaturedProducts, CampaignEditorial, Lookbook, EditorialMosaic, Craftsmanship, ThePeople, ProductSpotlight, Newsletter) — exactly the 12 SECTION frames of the Owner GO metadata probe; `SITE/` chrome inventoried but excluded from the plan with container evidence. PageStructure carries honest zero capability bindings.
- **Honest diagnostics:** `NOT_VERIFIED` warnings present for unaudited fields — reported, not smoothed.
- **Determinism:** two independent live runs → identical `volatileContentHash` per artifact role, identical revision, identical 337-node order.
- **Gate:** `npm test` = **179/179** (172 on merged main + the 7 #18 live-adapter offline checks); CI `contracts` SUCCESS on the pushed tip.

**Committed evidence (sanitized — no token, no raw provider response, no assets; file key/node/revision pins only):**
`evidence/issue-18/live-read-verified/{node-ir,page-structure,source-review}.json` + [`evidence/issue-18/live-read-verified.tool-run.json`](../../evidence/issue-18/live-read-verified.tool-run.json).

**Known follow-up gap (pre-existing on `main`, not introduced here, not required by this gate):** `examples/converter/capability-registry.magento-pagebuilder.example.json` (the #9 registry) fails `validateRegistry` — 61× `EVIDENCE_MISSING` (`proofLevel: registered` without `config-declaration` evidence kind). Live `det plan` resolution against a repaired real registry is therefore deferred; the extract→plan chain itself is proven offline (G2-T31f, part of the 179 checks), and the live-derived `PageStructure` is plan-ready with honest zero bindings.

**Boundaries honored:** read-only one bounded GET per run (adapter has no write path); no layer rename/edit; no mobile `245:16`; no CMS/DB/storefront writes; nothing written without `--out`; **stop at plan** — Page Builder serialization, CMS creation and Admin Edit→Save→Reload remain separately Owner-gated G3/G4.
