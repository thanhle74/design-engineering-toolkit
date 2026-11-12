# Receipt — Issue #44: integrate accepted M4 (issue #19) onto integrated main

**Status:** INTEGRATION_COMPLETE_LOCAL_GATES_GREEN · exact-tip CI recorded on the Draft PR (see §6).
**Merge base:** `main` @ `b242973c97565c503ee9fd77cc9b6543288f610a` (PR #32 tip — the same main tip
named in issue #44). **Merged source:** original PR #22 head `3f924ad4d0ba6c032e782d2b44069081e81b618a`
(branch `task/19-m4-magento-hyva-kb-ingest`, base `185d91c`), brought in as a **normal two-parent Git
merge — no force-push, no history rewrite of PR #22**. PR #22 remains OPEN and is superseded only
after this integration's merge acceptance.

## 1. What came in (M4 accepted scope, unchanged semantics)

All accepted issue-#19 M4 content applies verbatim except where §3 documents a deliberate
reconciliation:

- `det kb extract` verb (plan-driven read-only source extraction, fail-closed, report-only
  without `--out`), `src/core/kb/extract.ts` + KB record-safety/digest/merge gates.
- `adapters/magento-kb-source` out-of-process scanner (descriptor + `scan.ts`, 4 scan kinds:
  `magento-platform`, `pagebuilder-native`, `secomm-uiwidget`, `hyva-ui`; metadata-only,
  deny-before-read, realpath containment, per-file sha256 digests).
- KB contract family 1.1.0 additive evolution: `kb-capability` `recordType: "module"` + `mod:` ids,
  optional ingest lanes + `inputs.platformRecords`, `kb-ui-component` `osl`/`afl` license regimes,
  new `kb-extract-manifest` + `kb-source-scan` schemas, `kb-engine-output` extract branch.
- `scripts/kb-license-guard.mjs`, synthetic `tests/fixtures/m4/**` checkout (no real source, no
  licensed bytes, no client data — every fixture is a labeled synthetic dummy), 4 M4 test suites
  (adapter / extract / license / safety), docs (`docs/knowledge/README.md`, this family's receipts,
  `resources/schemas/kb/README.md` 1.1.0 history), gitignored local lanes (`.toolkit/`, `local-kb/`).

Nothing was rebuilt or refactored: G2/G3/G4/G28/Studio, the build orchestrator and the #41/#42
package-local schema-registry SSOT are untouched by this integration beyond the additive
registrations in §3.

## 2. Conflict ledger (all textual conflicts + their resolutions)

Overlap audit first: of PR #22's 70 files, exactly 6 overlap files main changed since `185d91c`;
no add/add, no delete/modify cases existed.

| File | Main side (since 185d91c) | PR #22 side | Resolution |
|---|---|---|---|
| `.gitignore` | + `out/` block | + `.toolkit/` + `local-kb/` block | Both blocks kept — orthogonal local-lane ignore lists |
| `src/core/cli/args.ts` | `compose`/`build` commands + value flags | kb verb `extract` + header comment | Both; comment de-duplicated (merge artifact); `KB_VERBS` = ingest\|sync\|query\|validate\|extract |
| `src/core/cli/main.ts` | `compose`/`build` usage + imports + switch cases | `det kb extract` usage + 3-lane root-alias precedence paragraph (`--root` > `DET_KB_ROOT_*` > gitignored `.toolkit/local.json`) | Both usage sections; precedence paragraph keeps the PR's superset wording (covers all kb verbs) |
| `src/core/cli/commands/kb.ts` | `SCHEMA_REFS` removed — schema identity now solely registry-resolved (#41) | `extract` verb + `kbExtract()` + `runExtract` import | Auto-merged coherently: `kbExtract` uses the existing `kbArtifact(role, payload)` helper; no schema URL re-declared anywhere |
| `src/core/schema-registry.ts` | rewritten to registry-SSOT loader + `contractId()` alias→path→$id (#41/#42) | + two hardcoded ids (`kb-extract-manifest`, `kb-source-scan`) + own `contractId()` on the old map | **Main's version taken verbatim**; PR's hardcoded-map hunk dropped (obsolete — would have resurrected the pre-#41 architecture). The two contract names enter through `resources/schemas/registry.json` aliases instead (§3) |
| `tests/run-all.mjs` | G3/G4/G28/build/#41-registry suite blocks | 4 M4 suite blocks | Both blocks, in order: baseline → G2 → KB → G3 → G4 → G28 → build → #41 registry → M4 (license, safety, extract, adapter) |

## 3. Post-merge reconciliations (main-side gates the accepted M4 work pre-dates)

The #41 registry gate (`tests/registry-suite.mjs`) was merged to main **after** PR #22 branched, so
the accepted M4 work never faced it. Two bounded, additive reconciliations — no gate weakened:

1. **Registry SSOT aliases (REG-01/REG-02 golden set).** `resources/schemas/registry.json` gains
   `kb-extract-manifest`, `kb-source-scan` (substituting for the dropped hardcoded ids) and
   `kb-source-scan-request`; `GOLDEN_IDS` in the registry suite gains the same three. New schema
   files under `resources/schemas/kb/` load into Ajv via the existing directory scan; `contractId()` needs no
   code change.
2. **Adapter input transport declared (REG-06).** Every shipped adapter descriptor must name a
   registered `inputContract`. The M4 scanner's stdin shape was already pinned in code
   (`KbScanRequest`, defensively hand-validated by `scan.ts`, exact-payload-asserted by M4E-10) but
   had no declared contract — the descriptor schema itself made `inputContract` optional pre-#41.
   Resolution: new `resources/schemas/kb/kb-source-scan-request.schema.json` materializing exactly that wire
   format (verified against `extract.ts` construction and `scan.ts` validation, no behavior change,
   `runAdapter` still validates only the output contract), registered in the SSOT, and declared in
   `adapters/magento-kb-source/descriptor.json`. `resources/schemas/kb/README.md` table rows added for the
   three M4 engine contracts.

## 4. What was explicitly NOT done

- No fresh scan of any real local Magento/Hyvä checkout; **no claim of a fresh rescan**. Every M4
  run in this integration used the committed synthetic fixture. The sanitized real-source receipt
  remains [RECEIPT-ISSUE19-M4.md](RECEIPT-ISSUE19-M4.md) (its evidence status: `DETECTED`-level
  metadata-only, honestly separated from `TESTED`).
- No licensed source, client data, secrets or owner-local paths committed; `DETECTED` vs `TESTED`
  vocabulary untouched; deny-list/leak-guard suites re-run green on the integrated tip.
- PR #22 untouched (no force-push); PR #21 (Figma REST pilot) not part of this task.

## 5. Local verification receipts (integrated tip, before push)

| Gate | Result |
|---|---|
| Root `npm test` (build + all suites) | **172/172 checks passed** (131 integrated-main baseline + 41 M4: adapter 15, extract 12, license, safety, ingest-interop) |
| Studio `npm ci && npm test` | **184/184 vitest tests, 21 files passed** (incl. real det-output interop + real det build E2E) |
| Studio `typecheck` / `lint` / `build` | clean / clean / production build OK |
| `det build --config` offline (root) | exit 0; 3 stages completed; 9/9 per-file-byte hashes MATCH |
| npm-pack relocation sanity | tarball 82 files: all 10 `resources/schemas/kb/*.json` + `resources/schemas/registry.json` + 4 adapter descriptors present; **no owner-absolute path in any runtime surface** (`dist/`, `resources/schemas/`, `adapters/`, `bin/` — README's documented policy-disclosure line pre-dates this task and is not a runtime surface); fresh consumer `npm install --omit=dev` clean (0 vulnerabilities); `det build` from consumer cwd: exit 0, 9/9 hashes MATCH, `native-content.html` sha256 identical to the repo-root build (`78b3ad118a3d8a29…`, matching the #38 receipt head) — byte-determinism across relocation |
| M4 gates specifically | license + safety + extract + adapter suites all green (deny-before-read, leak markers absent from every payload, symlink escape skipped, fail-closed writes, digest pins, byte-determinism) |

## 6. Exact-tip CI (Draft PR)

Recorded on the Draft PR head after push: GitHub Actions `contracts` and `studio` — statuses are
stated only from the actual check runs; pending runs are never reported as PASS.

## 7. Provenance & supersession

- The integration is a two-parent merge commit: parent 1 = `main` @ `b242973`, parent 2 = PR #22
  head `3f924ad`. Both lineages remain navigable (`git log --first-parent main` vs the PR branch).
- **PR #22 is superseded only if/after this integration PR is ACCEPTed and merged**; until then it
  stays open as the dated accepted-M4 record. Closing/archiving it with a traceable link to this
  receipt is a Coordinator action under the issue-#44 policy, not an automatic one.
