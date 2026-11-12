# [30] DET Long-term Storage + Reusable Knowledge Architecture

**Status:** PROPOSED — architecture review only, not implementation approval · 2026-11-09
**Owner direction:** DET is **one standalone tool**, runnable through CLI without Claude Code or via Next.js Studio. Store resources/projects/config/history durably in SQLite; store reusable Magento/Hyvä understanding in existing **versioned JSON/JSONL knowledge**, not ad-hoc AI chat memory. Preserve large generated artifacts as files.
**Scope:** https://github.com/thanhle74/design-engineering-toolkit/issues/30
**Authority:** `docs/specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md`, `docs/specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md`, existing `det kb ingest/sync/query/validate`, `docs/specs/knowledge-foundation/TECH-ADR.md` ADR-3, and actual KB JSON schemas. Running [28] and [29] retain exclusive code ownership.

## 1. One engine; three persistent concerns, not three engines

```text
       det CLI (no DB required)          DET Studio (Next.js + Ant Design 6, light-only per [61])
                |                                  |
                +------------ DET Engine -----------+
                             |             |
                    Capability/KB APIs    Artifacts
                             |             |
                 versioned JSON/JSONL   immutable files
                 KB-1/KB-2/KB-3        snapshots, IR,
                       |               reports, media,
                optional derived       HTML/PHTML/CSS
                SQLite FTS5 index
                             ^
                             |
             Studio SQLite catalogue (metadata)
             resources/projects/configs/sources/runs/
             KB snapshot refs/artifact hashes
```

**Storage truth boundaries** (never silently promote one into the other):

1. **SQLite = canonical Studio operational metadata.** Durable project list, validated nonsecret configuration, linked Figma roots, which KB versions a project uses, conversion run history/status, and artifact index. A Studio restart must not lose these. One SQLite file on the Studio host, schema-migrated and backed up.
2. **JSON/JSONL = canonical domain Knowledge Base.** Reusable platform capabilities and modules (KB-1), Hyvä UI/Page Builder/UI widget metadata and UI semantics (KB-2), and private project-specific approved requirements/mapping decisions (KB-3). Every record uses existing DET schema, sourceRef, evidence, revision, lifecycle. SQLite FTS5 index (if implemented) is **derived and rebuildable**; it must never become a second truth copy.
3. **Immutable artifact files = output/input bytes.** Figma-scoped source snapshot, NodeIR, PageStructure, SourceReview, mapping/compose reports, native PB content, PHTML, CSS, authorized media, receipts, and export bundles. SQLite indexes hashes/relative paths; do not store huge JSON/media/code as blobs in SQLite.

No central account, cloud agent, queue, PostgreSQL, vector database or three mandatory KB databases for the MVP.

## 2. Knowledge that survives across projects and sessions

**Goal:** A user opens a new Figma-to-Magento project; DET already knows verified native Page Builder shapes, installed Magento module capabilities, current Hyvä UI components/variants/slots, prerequisites and the gaps. It should not blindly re-audit the same pinned versions each run.

Use existing knowledge contracts:

| Knowledge | Canonical JSON/JSONL records | Reuse/isolation |
| --- | --- | --- |
| **KB-1 Platform** | Magento/Adobe Commerce version; enabled/configured modules; Page Builder native types/appearances; module capabilities, source paths, prerequisites, docs/evidence/proof levels | Version- and fingerprint-matched reusable public-safe facts; installed/configured/runtime claims still scoped to the actual target project |
| **KB-2 UI** | Hyvä UI / Page Builder / Secomm_UiWidget component names, variants, slots, usage notes, compatibility, license class and source provenance | Reuse only safe metadata; licensed source/template bytes remain in the authorized local installation, not the shared repo/export |
| **KB-3 Project** | Approved requirements, design-to-component mapping choices, reviewer decisions, exclusions, client-specific constraints and their source revisions | Strict project/tenant access boundaries; never publish project-private context as generic reusable knowledge |

**Incremental refresh:** For each source package/checkout keep provider, Magento/Hyvä/module versions, source revision or content digest (e.g. relevant lock/declaration files), inspectedAt and an evidence status. On a new conversion compare fingerprints; reuse valid unchanged records, re-inspect only changed/dependent sources, mark mismatched records `STALE`/unverified rather than presenting them as proven. Cache/project mapping decisions only with pinned Figma file+node revision and target component/registry revision; if either changes, require revalidation, not silent replay.

**Reuse is evidence-scoped, not magic:** Platform may be installed but not enabled; Magento source declarations are not proof of CMS Admin Save→Reload; a Hyvä UI component at one license/version is not guaranteed present in another project. Missing local proof yields `NOT_VERIFIED` or an explicit gap. AI (if optionally enabled) may recommend a role, but only versioned approved decisions become reusable KB records. Same fixed inputs should generate deterministic artifacts without an AI subscription.

## 3. Minimal SQLite catalogue (proposed V1 schema)

Only **five logical tables**; exact migration SQL/driver chosen in a later implementation slice:

| Table | Purpose / key constraints |
| --- | --- |
| `projects` | `id`, unique `slug`, name, platformId, versioned validated **nonsecret** config JSON/hash, timestamps |
| `design_sources` | `id`, `project_id` FK, provider, fileKey/nodeId, last observed revision; unique per-project source identity |
| `kb_snapshots` | `id`, `scope` (verified shared/public-safe or private project), optional `project_id`, KB namespace (platform/ui/project), relative manifest path, content hash, source fingerprint, schema version, lifecycle/lastChecked; **points to JSON/JSONL, does not duplicate its records** |
| `runs` | `id`, project/source FKs, frozen project config hash + pinned `kb_snapshots` identities and source revision, tool version, `CREATED/RUNNING/SUCCEEDED/PARTIAL/FAILED/INTERRUPTED`, timestamps and diagnostic code |
| `artifacts` | `id`, `run_id` FK, schema/role, relative path, SHA256, byte size, media type; unique (`run_id`, relative_path) |

Only add a `run_kb_snapshots` join table if real runs require multiple independent snapshot versions (likely when KB-1/2/3 are independently pinned); implement this **explicitly and minimally**, not via opaque unvalidated JSON. All FKs/indexes/constraints need migration and tests. Project config edits are versioned: a run's saved config snapshot/KB pins are immutable. Old runs must remain explainable even after current config or module versions change.

**Project boundary:** a design source, private KB snapshot, run or artifact must belong to its referencing project. Verify cross-project FK invariants; safe shared KB contains only sanitized metadata with explicit sharing/license policy. Never use database row IDs as authorization.

## 4. Local storage / backup / recovery

Illustrative private, configured directory (never hardcoded Slaunchpad and never git-tracked):

```text
$DET_DATA_HOME/
  studio.sqlite
  kb/
    platform/*.jsonl
    ui/*.jsonl
    project/<opaque-project-id>/*.jsonl
    manifests/*.json
  artifacts/<opaque-project-id>/<opaque-run-id>/
    manifest.json
    inputs/     # config/source revisions
    source/     # Figma snapshot, NodeIR, PageStructure
    output/     # native PB HTML, PHTML, CSS/assets
    docs/evidence/   # receipts, allowed screenshots
  backups/      # privately stored; not exposed via Studio file routes
```

**Write safety:** a run has a frozen identity. Write files in a run-local staging dir, validate JSON schema + content hashes + relative paths, atomically rename to immutable final path, then commit the DB artifact catalogue and terminal status in a short transaction. A crash may leave `INTERRUPTED` or orphan staging files; reconcile against validated manifests, never turn absence into success. `det` CLI also works in a **files-only/offline mode** with exactly the same result contracts.

**SQLite:** WAL on a local filesystem, FK enforcement, bounded transactions, backup API/online backup and restore tests including the separate artifact/KB files. Avoid direct shared SQLite files on network drives. Run one Studio service for users to access over HTTP, not individual client DB connections. Driver (`node:sqlite` vs `better-sqlite3`) requires an implementation-time compatibility spike on the pinned Node version; avoid speculative ORM/DB migrations in [29].

**Security:** Private Figma snapshots, project profiles and licensed packages are not committed to the repository or exposed by guessable filenames. Store **credential references** (env/secret store), not token values, in project config. Download routes enforce server-side project scope, validated hash and realpath containment; no arbitrary browser-supplied file paths. Multiuser team deployment needs actual authentication/project authorization or verified access gateway first. SQLite alone provides no isolation/auth.

## 5. Execution flow and reuse

1. **Register project once** in Studio; save validated config (SQLite) and source-root pointers.
2. **Inspect target once** with `det inspect` + `det kb ingest` using the local project checkout and authorized UI metadata; persist canonical JSON/JSONL and content hashes.
3. **Convert** selected Figma node: `det extract` → NodeIR/PageStructure/SourceReview JSON → KB/Capability query → `det plan/compose` → native PB/PHTML + preview/export artifacts. The exact `det build` one-shot orchestration is owned by [28], not Studio.
4. **Record conversion** in SQLite with precise hashes/pins, immutable artifacts and honest GAPs. Re-running unchanged inputs reuses verified KB snapshots; changed versions trigger targeted `det kb sync`/re-inspection.
5. **Open any time** in Studio: project → source → previous runs → native mapping/preview/export, without needing Claude Code or repeating analysis.

## 6. Issue boundaries / phased GO

- **[28] ACTIVE:** standalone engine, `det build`, source extraction, bounded Page Builder/PHTML conversion, isolated preview theme and run artifact manifest. **No SQLite dependency**.
- **[29] ACTIVE:** Next.js UI with Ant Design 6 light-only ([61], superseding the earlier shadcn choice) with four parallel workers and **schema-shaped, openly labeled fixtures**; no added DB, migration or worker scope change mid-flight.
- **[30] NOW:** agree on persistence, KB reuse, lifecycle, licensing and multi-project boundaries in a standalone architecture document and review. **No DB code/merge authorization implied.**
- **NEXT only after #28/#29 results and Owner GO:** implement small SQLite catalogue + KB snapshot references/reader + migration/backup/recovery tests, then connect Studio to real run artifacts. Reuse existing `det kb`; do not create another knowledge engine.
- **TEAM sharing gate:** access control, private project/KB authorization, safe downloads, concurrency and backup verified before hosting for multiple people.

### Acceptance of architecture

A reviewer must be able to answer: Where does a Magento module capability live and how is it reused? What makes cached knowledge stale? Can `det` run without SQLite/AI? Can Studio recover historical runs? Does an artifact retain its original hash, source revision and mapping? Can one project read another's private KB? How do we back up/restore both SQLite and JSON/file artifacts? What happens if the target Hyvä version differs?

**Reviewer decision requested:** ACCEPT this three-concern architecture (SQLite operational catalogue / JSONL KB SSOT / immutable file artifacts), then scope a bounded implementation only after active [28]/[29] integration.
