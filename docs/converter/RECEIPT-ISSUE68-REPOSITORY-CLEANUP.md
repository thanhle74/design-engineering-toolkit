# RECEIPT — [68] DET repository cleanup: `src/modules` + grouped Magento capability knowledge

> **Status: DRAFT PR only — STOP for independent Coordinator review. No self-merge.**
> Base: `main` @ `cd91c72de7cf2b0f8fcaa3e22d51aaffd14b5338` (owner GO on issue #68: "DEPENDENCY
> CLEAR / OWNER GO READY", one Orca workspace, #68 scope kept whole). Executed 2026-11-12.
> Branch: `thanhle74/68-det-repository-cleanup-src-modules-grouped-ma`.
> No Figma writes, no Magento CMS/Admin/DB writes, no client theme changes, no production
> writes. Owner-untracked/live data untouched (inspected, per the GO: "Do not auto-delete
> local untracked directories or live run/DB data").

## 1. What changed (one sentence)

The repository is reorganized into SEO-Writer-Engine-style bounded feature modules
(`src/modules/{figma,magento,knowledge,studio}` with module-owned adapters and co-located
tests), a small `src/core`, and a grouped data layer `resources/{schemas,knowledge,examples,
profiles,projects}` — with the root `tests/`, `adapters/`, `kb/`, `specs/`, `evidence/`,
`examples/`, `profiles/`, `projects/` roots gone, superseded KB schema drafts and Next starter
assets deleted, and every gate re-proven green.

## 2. Before → after tree (top level)

| Before (`cd91c72`) | After (this branch) |
| --- | --- |
| `adapters/` (5 adapters, root) | `src/modules/{figma,magento,knowledge}/adapters/<id>/` |
| `app/` (thin Next routes) | `app/` (unchanged role: Studio routing layer only) |
| `components/` (Studio UI parts) | `src/modules/studio/` (components/layout inside the module) |
| `docs/` | `docs/` + `docs/specs/` (from `specs/`) + `docs/evidence/` (from `evidence/`) |
| `examples/` | `resources/examples/` (2 knowledge files → `resources/knowledge/magento/pagebuilder/`) |
| `kb/` (committed KB store) | `resources/knowledge/store/` |
| `profiles/` | `resources/profiles/` |
| `projects/` | `resources/projects/` (pilot evidence untouched) |
| `public/` (5 Next starter svgs + nothing used) | removed (deleted; `app/favicon.ico` remains) |
| `schemas/` | `resources/schemas/` |
| `specs/` | `docs/specs/` |
| `src/core/` (+ `src/core/kb`, `src/studio`) | `src/core/` (smaller) + `src/modules/knowledge/`, `src/modules/studio/` |
| `tests/` (16 suites + fixtures + run-all) | **removed** — suites + fixtures co-located under `src/**/__tests__/` |
| tracked files | 606 → 602 (−10 deleted, +6 new: 3 knowledge READMEs, `repo-root.mjs`, `contracts-suite.mjs`, `run-contract-tests.mjs`) |

## 3. Per-module ownership map (code + tests + adapters + fixtures)

| Module | Code | Adapter(s) (source + descriptor) | Tests (`__tests__/`) | Fixtures (`__tests__/fixtures/` or `__fixtures__/`) |
| --- | --- | --- | --- | --- |
| `src/core` | engine core: `schema-registry`, `run-envelope`, `adapter-runtime`, `design-source/`, `cli/` | none (discovers module adapters) | `contracts-suite` (30, incl. T-09/T-18b neutrality), `cli-suite` (21), `registry-suite` (9), `cli-path-resolution-suite` (4) | `synthetic-flatcms/`, `negative/`, `synthetic-magento-like/`, `adapter-escape-outside/`, `fake-adapter/` |
| `src/modules/figma` | design-source Figma adapter support | `fixture-tree` | `g2-suite` (22) | `g2-design-source/`, `g2-figma-live/` |
| `src/modules/magento` | Page Builder compose pipeline | `magento-pagebuilder` (probe), `magento-pagebuilder-compose` | `build-suite` (6), `g28-suite` (7), `g3-suite` (8), `g4-suite` (7) | `g28-home-design-source/`, `g3-hero-design-source/`, `g3-magento-like/`, `g4-craftsmanship-design-source/` |
| `src/modules/knowledge` | KB engine (ingest/sync/query/extract/safety) | `magento-kb-source` | `kb-suite` (29), `kb-m4-adapter` (16), `kb-m4-extract` (12), `kb-m4-license` (7), `kb-m4-safety` (6) | `kb/`, `m4/` (relative symlinks preserved) |
| `src/modules/studio` | Studio server + UI module (`build-runner`, `build-catalog`, components) | spawn-only coupling to `bin/det.js` (zero imports) | vitest 375 tests / 37 files (`*.test.ts(x)`) + `real-derived-suite` (6), `studio-startup-suite` (5) | `__fixtures__/real-det-runs/` etc. |

Contract tests are discovered by `scripts/run-contract-tests.mjs` (discovery + harness ONLY —
no test cases, no domain logic, no root-`tests/` references; deterministic path-sorted
`src/**/__tests__/*-suite.mjs` discovery; report format byte-identical to the pre-[68] gate).

## 4. Ledger — KEEP / MOVE / DELETE (with consumer evidence)

### MOVE (all verified pure renames unless noted)
- `adapters/*` → `src/modules/{figma,magento,knowledge,magento?}/adapters/*` — consumers:
  `loadAdapters` walk rewritten (`src/core/adapter-runtime.ts`); 5 × `descriptor.json` `entry`
  values → `dist/src/modules/...`; discovery order contract preserved (adapter-id-first sort;
  `magento-pagebuilder` probe before its composer sibling — locked by the suite table 195/195).
- `src/core/kb` → `src/modules/knowledge` (+ new module `index.ts` re-export; `cli/commands/kb.ts`
  imports updated; KB-1/2/3 semantics untouched).
- `src/studio` + `components/layout` → `src/modules/studio` (spawn-only studio→core coupling
  preserved; `app/` imports via the existing `@/src/modules/studio/` alias; depth-math audited:
  only `resolveDetEntry` default and `det-cli.ts` REPO_ROOT ups changed).
- `tests/*` → `src/{core,modules/*}/__tests__/*` + fixtures → `__tests__/fixtures/` (3 relative
  symlinks preserved, depth verified). Root `tests/` REMOVED (issue acceptance blocker).
- `schemas/` → `resources/schemas/` — 27 `registry.json` alias VALUES repointed; **every
  contract `$id` URI byte-identical** (schema JSONs are 0-byte-delta pure renames — verified
  `git diff -M`; $ids are Ajv registry keys, never download URLs, never migrated).
- `kb/` → `resources/knowledge/store/` (store files unchanged; suite `KB_STORE` repointed).
- `examples/` → `resources/examples/`; `examples/converter/capability-registry…
  +component-binding-map…` → `resources/knowledge/magento/pagebuilder/` (classified as audited
  platform knowledge; 6 locked consumers repointed).
- `profiles/` → `resources/profiles/`; `projects/` → `resources/projects/`; `evidence/` →
  `docs/evidence/`; `specs/` → `docs/specs/`.
- `resources/examples/build/project.example.json` internal fixture paths re-depthed (config-
  relative, 3 ups) — content otherwise unchanged; T32e absolutization base updated to match.

### DELETE (10 files, with rationale)
- `public/{file,globe,next,vercel,window}.svg` — Next.js starter assets; zero consumers (no
  import/reference in `app/`, `src/`, CSS; favicon.ico lives in `app/`). Git history preserves.
- `docs/specs/knowledge-foundation/schemas/{4 drafts + README}` — pre-freeze KB schema drafts,
  superseded by the frozen `resources/schemas/kb/` major-1 family (delta list in that family's
  README); the issue-#7 review record stays in git history at the pre-[68] path
  `specs/knowledge-foundation/schemas/`. NOT V1 contracts (V1 = converter family, untouched).
  `CONTRACTS.md` companion link + `kb/README.md` narratives repointed truthfully;
  `INTEGRATION-RECEIPT` carries a clearly-marked [68] layout note (history not rewritten).
- Root `tests/run-all.mjs` — replaced by `scripts/run-contract-tests.mjs` (same report format,
  discovery-only).

### KEEP (explicitly protected, verified untouched in content)
- `AGENTS.md`, `CLAUDE.md`, `.claude/skills/**` (paths repointed only), all accepted receipts
  (`docs/converter/RECEIPT-ISSUE*.md`, `docs/knowledge/RECEIPT-*`), and
  `resources/projects/slaunchpad-fashion/pilot/evidence` — accepted proof, never deleted.
- `docs/specs/knowledge-foundation/CONTRACTS.md` — ratified normative KB contract prose,
  §-cited by the integration receipt; not dead weight.
- `resources/examples/preview-theme/` — the guarded Preview Theme scripts the GO says preserve.
- `docs/converter/evidence/` (21 committed receipt images) — untouched; note: an early docs
  sweep briefly repointed its receipt links to `docs/evidence/`; restored (that dir was NOT
  moved) and the link checker confirms 0 broken links repo-wide.

### New
- `resources/README.md` — surface index + classification (schema / capability audit / binding
  map / example / profile / project data / receipts).
- `resources/knowledge/README.md` — KB data layer: `store/` + `magento/pagebuilder/` populated;
  **`hyva-ui/` and `phtml/` intentionally ABSENT** — no audited Hyvä/PHTML source exists;
  inventing records is forbidden (KB honesty rules). Absence documented, never faked.
- `resources/knowledge/magento/pagebuilder/README.md` — provenance ([5] W-B audit + [54]
  config-declaration pass), proof level (audited declarations, zero proven bindings), locked
  consumers.
- `scripts/run-contract-tests.mjs`, `src/core/__tests__/{repo-root.mjs,contracts-suite.mjs}`.
- `package.json` `"clean"` — bounded: `dist .next tsconfig.tsbuildinfo .eslintcache coverage`
  ONLY; never touches operator data (verified: clean + full gate from scratch passes).

## 5. Test inventory — before vs after (no skips, no drops)

| Gate | Before (`cd91c72`) | After |
| --- | --- | --- |
| `npm test` (contract gate) | **195/195** (`.tmp` receipt log) | **195/195** — per-suite counts identical to the baseline decomposition: 4/21/30/9 (core) · 22 (figma) · 29+16/12/7/6 (knowledge) · 6/7/8/7 (magento) · 6/5 (studio) |
| `npm run test:studio` (vitest) | 375/375 (37 files) | 375/375 (37 files) — 1 transient 5 s timeout in `studio-catalog` lifecycle observed once under clean+rebuild I/O load; green on immediate rerun and in every other run (passed 4× today) |
| `npm run build` (core dist + Next) | exit 0 | exit 0 (also re-proven after `npm run clean`) |
| `npm run typecheck` / `lint` | exit 0 / 0 | exit 0 / 0 (1 stale unused import dropped in the studio-startup suite) |
| CLI from foreign cwd | locked by T-63 suite | locked by `src/core/__tests__/cli-path-resolution-suite.mjs` (4 checks) + manual foreign-cwd smoke (`--version`, `inspect --help` exit 0 from `/tmp`) |
| Studio startup | R58 suite | `studio-startup-suite` 5/5 + `npm run dev/start` wiring unchanged |
| exact-head CI | `validate.yml` unchanged in shape | find list → `resources src`; suite-glob comment fixed (`*-suite.mjs`); studio job unchanged |

## 6. Contract integrity statement

- **Changed contract ids: NONE.** All schema `$id` URIs are byte-identical (pure renames,
  verified). `schemas/registry.json` [41] remains the SSOT; only its 27 alias VALUES were
  repointed to the new package-relative paths (`resources/schemas/…`) — REG-01 re-proves every
  alias resolves on disk; REG-08 re-proves the fail-loud error text names the new location.
- Adapter registry [54]/REG-09: the composer-registry example files moved with their domain;
  their content (55 config-declaration capabilities, chrome→discovered, dash-namespace
  fail-closed semantics) is untouched.
- Neutrality gates re-proven at the new layout: T-18b dist/ownerPath sweeps (compiled adapter
  dirs guarded at source, `entry` field redacted in the T-28 fixture-descriptor check),
  T-09, G2-T28, KB-M4-S2 portability scan remapped to the new data homes
  (`resources/schemas`, `resources/examples`, `resources/knowledge`, `docs/knowledge`,
  `docs/specs/knowledge-foundation`) with the same owner-path/credential semantics and a
  non-vacuous-root assertion.
- Docs integrity: a link checker over every committed `.md` reports **0 broken relative
  links** (57 genuinely broken post-move links repaired; 5 receipt-image link sets into
  `docs/converter/evidence/` restored after an over-broad rule).

## 7. Notes for the independent reviewer

1. **Commit attribution:** P1/P2 predate this session's attribution trailer requirement; a
   `git filter-branch --msg-filter` pass appended
   `Co-Authored-By: Claude Code <noreply@anthropic.com>` to them (shas rewritten, nothing
   pushed). All commits carry the trailer now.
2. **Untracked owner dirs:** `apps/`, `packages/`, `dist/` named in the GO are not tracked and
   do not exist in this Orca worktree (only this worktree exists locally); nothing auto-deleted.
   `out/`, `.tmp/` receipts dir, `node_modules/` are gitignored; the P1–P6 gate logs live in
   `.tmp/issue68-receipts/` (untracked, cited by path in this receipt).
3. **`examples/build/README.md` packaging claim** contradicted the [63] receipt (advertised the
   removed `npm pack --workspace` artifact); corrected to the [63] truth (no distributable is
   claimed; protection preserved by the foreign-cwd suite).
4. **Root `tests/` gone** — issue acceptance blocker satisfied; nothing discovers it (CI sweep
   find list, suites, and docs verified free of root-`tests/` lookups).
5. Pre-existing minor: vitest `build-catalog.test.ts` synthetic config bodies still carry
   `"../../tests/fixtures/…"` as opaque literal strings (never resolved on disk; assertions are
   self-consistent). Left as-is to keep assertions identical; flagged for a future pass.

## 8. Gate reruns on the exact PR tip

Executed 2026-11-12 on the branch tip (logs: `.tmp/issue68-receipts/final-*.log`): `npm test`
**195/195** · `test:studio` **375/375** (37 files) · `build` **exit 0** · `typecheck` **exit 0** ·
`lint` **exit 0** · foreign-cwd `bin/det.js --version` **exit 0**. Studio startup locked by
`studio-startup-suite` 5/5 inside the gate.
**STOP — awaiting independent Coordinator review. No merge, no Figma/Magento operations.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
