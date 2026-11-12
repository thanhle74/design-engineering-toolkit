# Issue #72 proof scripts — W-E (local Magento, store 5 only)

Companion evidence: `docs/evidence/issue-72/browser/` (baseline snapshot, frontend screenshot + DOM dump, environment discovery).

## Safety rules (binding for every use)

1. **Store 5 (`det_preview`) ONLY.** Every write targets the declared `--store` explicitly; store 0 (all-store scope) is refused in mutating modes. Store 5 is the #70 isolated QA store; stores 1/4 and the default scope are never touched.
2. **Explicit test identifier.** Mutating modes (`create`, `update`, `cleanup`) require an identifier with the `det-qa-` prefix — a typo can never match a real page (`home`, `det-home-preview`, … are unreachable by these modes).
3. **No raw SQL writes, ever.** PDO SELECTs are fine for evidence; any WRITE goes through Magento's service layer (`\Magento\Cms\Api\PageRepositoryInterface::save()` / `::deleteById()`), ported byte-faithfully from the [70] generated-installer write path (`src/modules/magento/adapters/magento-cms-installer/render-cms-installer.ts`), proven live in [70] C70-2. Alternatively the generated installer itself when the proof uses a `det build` bundle.
4. **Fail closed.** Any same-identifier page under a different store scope, or an ambiguous duplicate, is a loud REFUSAL with nothing written (`exit 1`). `create` never overwrites; `update` never creates; `cleanup` of a missing page is a no-op `action=none`.
5. **Explicit consent flag.** Mutating modes additionally require `--yes`; without it they exit 2 having touched nothing.
6. **Pre-existing #70 artifacts are frozen**: page 35 (`home-6ad89b83d8c5d`), page 36 (`home`), page 42 (`det-home-preview`, the store-5 homepage) and page 45 (`det-pb-roundtrip-46`) — fingerprinted in `baseline-fingerprints.json`, never modified.
7. **Never execute the committed store-0 demo installer** (`resources/examples/build/slaunchpad-home-real-derived/` is not runnable material for this machine's DB).
8. Before and after any mutating proof run: `php scripts/proof/issue72/snapshot-fingerprints.php` and diff the `fingerprint` payload against `baseline-fingerprints.json` — the delta must contain ONLY the declared `det-qa-*` page.

## Scripts

### `snapshot-fingerprints.php` — read-only isolation snapshot

```bash
php scripts/proof/issue72/snapshot-fingerprints.php            # default magento root
php scripts/proof/issue72/snapshot-fingerprints.php --magento-root=/path   # override
```

Prints JSON to stdout (SELECT-only PDO via `app/etc/env.php`): every `cms_page` row (`page_id`, `identifier`, `title`, `is_active`, `store_ids` from `cms_page_store`, `content_sha256`, `updated_at`), all `core_config_data` rows for `scope='stores' scope_id=5` (+ inherited default-scope base URLs), row counts (`cms_page`, `cms_page_store`, per-store), and a `preexisting_issue70_artifacts` index. Idempotent: repeat runs change nothing and the `fingerprint` payload is deterministic (only `meta.generated_at_utc` differs). Exit 0 / non-zero on error (no partial snapshots).

First-run output saved as `docs/evidence/issue-72/browser/baseline-fingerprints.json`.

### `cms-page-proof.php` — CMS write driver (READY; write modes NOT executed in the discovery mission)

```bash
# READ-ONLY verify (safe anywhere, any identifier):
php scripts/proof/issue72/cms-page-proof.php --mode=verify --identifier=det-qa-72 --store=5

# WRITE modes (proof time only; see safety rules):
php scripts/proof/issue72/cms-page-proof.php --mode=create  --identifier=det-qa-72 --store=5 --file=<master-format.html> --title="<t>" --yes
php scripts/proof/issue72/cms-page-proof.php --mode=update  --identifier=det-qa-72 --store=5 --file=<master-format.html> --title="<t>" --yes
php scripts/proof/issue72/cms-page-proof.php --mode=cleanup --identifier=det-qa-72 --store=5 --yes
# options: --magento-root=<path> (default /home/thanhle/Sites/Magento/slaunchpad), --help
```

- `verify` → JSON: page row + `content_sha256` + Page Builder structure summary (`data-content-type` counts by type) + `scope_match`. Exit 0 found / 1 not found.
- `create`/`update` print the plan JSON (identifier, store, title, content bytes + sha256) BEFORE booting Magento, then write through `PageRepositoryInterface` in the [70] CLI-app shape (crontab area, REAL `Console\Response`, one exit-decision point).
- `cleanup` deletes via `deleteById`, strictly scoped; `action=none` + exit 0 when nothing matches.

Status: `php -l` clean. Verify mode executed (page 42 cross-checked against the baseline sha256). Boot + fail-closed resolution proven dry with zero writes (nonexistent `det-qa-72`: cleanup → `action=none` exit 0; update → loud `REFUSING` exit 1). The actual `save()`/`deleteById()` calls are the [70] live-proven code and run only at authorized proof time.

## Evidence files (`docs/evidence/issue-72/browser/`)

| File | What it is |
|---|---|
| `baseline-fingerprints.json` | first-run snapshot output (2026-11-12); re-verified identical to the live DB after every probe in the session |
| `store5-home-frontend.png` | headless-Chrome screenshot (1440x2000) of the store-5 home (`/?___store=det_preview`), largely styled render |
| `store5-home-dom.html` | DOM dump backing the Page Builder marker counts in the discovery doc |
| `environment-discovery.md` | full browser + admin tooling discovery, store URLs, admin facts |
