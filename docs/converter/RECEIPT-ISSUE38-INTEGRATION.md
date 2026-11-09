# Receipt — [38] Integration: accepted DET engine + portable CLI + Studio

**Status:** three Coordinator-ACCEPTed Draft PRs merged into ONE integration branch with full commit provenance, all verification gates EXECUTED and PASS · one Draft PR into `main` opened, **NO AUTO MERGE** (Owner merge GO after independent Coordinator review) · original Draft PRs #34/#37/#33 left unchanged (no force-push, no main merge).
**Branch:** `thanhle74/38-integrate-accepted-det-engine-portable-cli-st` (Orca worktree branch, already at `main` @ `9495f43`, clean at start).
**Integration head:** the merged tip of this branch (merge commits `9a0ce0d` #34 → `5200543` #37 → `c482f7e` #33).

## 1. Verified input heads (live-fetched 2026-11-09, before any merge)

| PR | Issue | Live head | Coordinator status | Matches |
|---|---|---|---|---|
| #34 | [28] | `85432c47c4f148f9a4f76c1a0af72b5f71fb1cb3` | ACCEPT | issue body |
| #37 | [35] Phase 1 | `2397c097dcd5e062f50e9f947680da752dac1f9d` | ACCEPT | coordinator correction comment (supersedes issue-body `b739794` — README-only diff) |
| #33 | [29] | `b4e394524d19e03209c17043552d8c751cccb1a7` | ACCEPT | issue body |

All three: Draft OPEN, base `main`, merge-base `9495f43` (same base, independent histories).
Changed-file sets are pairwise disjoint (#34↔#37, #34↔#33, #37↔#33 all empty) → merges resolved with **zero conflicts**; no reconciliation edits were needed, none made.

## 2. Merge order and provenance

`main @ 9495f43` → merge #34 (`85432c4`) → merge #37 (`2397c09`) → merge #33 (`b4e3945`), each `--no-ff` with a merge commit naming source PR + head SHA. The stated order (#34 → #37 → #33) was mechanically safe because the branches are disjoint, so no reordering was required. Original commits are preserved in history (no squash); no unrelated code touched; no duplicated engine or Studio implementation exists — the pack/build engine is the [28]/[35] engine, Studio is the [29] app.

## 3. Gate receipts (all executed on the integrated tip, 2026-11-09)

### 3.1 Root contract gate
- `npm ci` → clean install, 0 vulnerabilities.
- `npm test` → **123/123 checks PASS** (expected ≥123 baseline after [28]; G2/G3/G4/G28 suites all green on the integrated tree).
- `node bin/det.js build --config examples/build/project.example.json --out out/build-sample` → exit 0; stages `capability-probe: completed, extraction: completed, composition: completed`; `build-manifest.json` schemaVersion 1: 9 outputs, 5 inputs, **4 truthful gaps** (`COMPOSITION_EXCLUSIONS_PRESENT`, `COMPOSITION_GAPS_PRESENT`, `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED`); `native-content.html` sha256 recomputed over exact file bytes → **MATCH** (33146 bytes). Omitting `--out`/`outputDir` fails closed (exit 2, explicit diagnostic) as designed.

### 3.2 Portability gate (critical; issue step 3)
- `npm pack` on the integrated tip → `design-engineering-toolkit-0.1.0.tgz` (75 files: `bin/`, `dist/` 36 files, `schemas/`, 3× `adapters/*/descriptor.json`; `prepack` runs the TS build; **no repo-absolute path leakage in the tarball**).
- Clean temp consumer (`/tmp/det38-portability/consumer`, fresh `npm init`): `npm install --omit=dev <tarball>` → clean, 0 vulnerabilities, ajv resolved as the shipped runtime dependency.
- Caller fixtures copied **outside the packed package** (`/tmp/det38-portability/fixtures/`); caller build config `project.consumer.json` written with paths relative to the config directory only.
- Real packed CLI invoked from the consumer cwd: `node node_modules/design-engineering-toolkit/bin/det.js build --config ../fixtures/project.consumer.json --out ../out/build-consumer` → exit 0; 3 stages completed; **9/9 output byte-hashes recomputed and MATCH**; native Page Builder content on disk (`data-content-type` present).
- **Adapter discovery works from the pack alone**: consumer capability registry lists `magento_pagebuilder/*` capabilities (banner, buttons, button-item, column-group, column-line, column, …) via packed descriptors over the caller fixture XMLs.
- **Byte-determinism across relocation**: `native-content.html` sha256 is **IDENTICAL** (`78b3ad11…afa34f4`) from the repo-root build and the relocated consumer build → no global repo/cwd dependency. (Consumer `npm install` itself resolves ajv from the registry — standard consumer dependency resolution; schema loading is local to the package, no network schema fetch.)

### 3.3 Studio gate (issue step 4)
- `cd apps/studio && npm ci && npm test` → **132/132 tests PASS** (14 files).
- `npm run typecheck` → clean. `npm run lint` → clean. `npm run build` → Next.js production build PASS.
- `.github/workflows/validate.yml` on the integration branch retains both CI jobs: `contracts` (root) and `studio` (isolated `apps/studio` lockfile) → the independent studio job survives the merge unchanged.
- **Studio remains honestly read-only**: grep over `apps/studio/src` finds no `child_process`/`execSync`/`spawn`/`det.js build` invocation — it does **not** execute real builds; that feature belongs to [36].

## 4. Documented boundaries (issue step 5)

- Schema `$id` values may be URIs, but schemas are **loaded locally** from the packed `schemas/` directory — no network schema resolution.
- **No automatic Figma read** anywhere in the engine: design-source input is a caller-supplied snapshot document; Figma access stays a separate later gate.
- **No Magento Admin editability or live-preview claim** is made by this integration: the bundle records `PREVIEW_INSTALL_OPERATOR_GATED`; Admin-UI click-through remains owner-pending from [28], unchanged.
- [35] Phase 2 still requires the local `schemas/registry.json` SSOT task — not started here.
- [36] will add the server-only build runner/UI; Studio in this tree is still the honest read-only MVP.
- No enterprise auth/DB/queues/services introduced; the toolkit remains a trusted local internal tool.

## 5. Known non-blockers / truthful notes

- Build config without `--out` exits 2 by design (stdout-only build is not representable); the example README documents `--out`.
- The consumer-proof used the same fixtures as the root gate (relocated copies); a real consumer project substitutes its own inputs, as `examples/build/README.md` states.
- `/tmp/det38-portability/` artifacts are ephemeral evidence; this receipt is the durable record.

## 6. Downstream handoff

[35] Phase 2 (local schema registry) and [36] (real Studio Build Control) may branch from this exact integrated head after Coordinator ACCEPT, even before Owner merges to `main`, if explicitly approved — that is the success criterion of this issue.
