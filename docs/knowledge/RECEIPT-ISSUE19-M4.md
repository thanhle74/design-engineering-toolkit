# Integrator receipt — Issue #19 M4: read-only Magento + Hyvä UI real-source knowledge ingestion

**Status:** `REAL_KB_READ_ONLY_VERIFIED` — implementer evidence recorded below (real source
identities, versions, digests and retrieval evidence are all named); independent Coordinator
review still required before any M5/GO-3 step. This receipt is **sanitized**: real corpus stays
in the gitignored `local-kb/` private store; this repository receives only schema, code,
synthetic fixtures, counts and this receipt. No Figma access, no CMS/DB/config writes, no
production changes, no source uploads.

| | |
|---|---|
| Issue | [#19 — M4 Read-only Magento + Hyvä UI real-source Knowledge ingestion](https://github.com/thanhle74/design-engineering-toolkit/issues/19) |
| Owner gate | GO-2 (issue #19 comments, 2026-11-04): read-only metadata extraction of the authorized local checkout, `SOURCE_ACCESS_CONDITIONAL_ON_EXPLICIT_ROOTS` |
| Base | `main` tip `185d91c` (task branch `task/19-m4-magento-hyva-kb-ingest`); implementation commits: contract layer `22da369`, W-C `400182e`, W-A `a32fd30`, W-B `3a24ad6` + fix round `def1e0e`, integrator commits through the final tip of this PR |
| Gate | `npm run build` (tsc strict) + `npm test` = **136/136 checks** (95 baseline from #9/#14/#15 + 41 new M4 checks: 12 extract orchestrator, 15 adapter, 7 license-guard, 6 safety/portability, and the flipped module-recordType positive) |
| Worker model | Independent bounded workers (W-A extract orchestrator, W-B scanner adapter, W-C license/safety gates) in isolated worktrees + one integrator; one shared contract layer authored first |
| Private store | `local-kb/<private-dir>/{extract-manifest,ingest-manifest}.json`, `extract/`, `store/` (this run's dir name is machine-local) — gitignored, machine-local, never committed |

## 1. What was delivered

1. **Contract layer (additive, schema major stays 1)** — `kb-capability` gains `recordType:
   "module"` (+ `mod:` id prefix) for installed-module inventory records; ingest-manifest lanes
   become optional with a new `platformRecords` lane; new `kb-extract-manifest` (read-only
   extract plans) and `kb-source-scan` (out-of-process scanner payload) schemas; extract-report
   branch in `kb-engine-output`; `osl`/`afl` license regimes; gitignored `.toolkit/` +
   `local-kb/` conventions.
2. **`det kb extract`** — plan-driven, fail-closed orchestrator: validates the extract manifest,
   resolves root aliases (`--root` > `DET_KB_ROOT_<ALIAS>` > gitignored `.toolkit/local.json` —
   the third portability lane from CONTRACTS §9), spawns the scanner **out-of-process** through
   the adapter runtime, re-validates every emitted record against the KB record contracts and
   the shared record-safety gate, checks digest pins and counts, merges deterministically, and
   writes record files + a schema-valid report only into `--out` (never inside a source root,
   never the KB store). Exit codes: 0 ok / 1 blocking / 2 usage / 3 adapter runtime failure.
3. **`adapters/magento-kb-source`** — one read-only scanner, four kinds: `magento-platform`
   (config.php modules map only + module.xml + composer map), `pagebuilder-native` (content-type
   XML appearances), `secomm-uiwidget` (widget.xml count + di.xml Registry + bounded
   metadata-only PHP definition parse), `hyva-ui` (directory-name census; composer.json +
   composer.lock are the only files opened). Deny-list before every read, realpath containment,
   per-file sha256 digests, unsupported shapes → explicit `UNSUPPORTED_SHAPE` + UNKNOWN
   evidence, never guesses.
4. **License & safety gates (W-C)** — `scripts/kb-license-guard.mjs` byte-level licensed-source
   guard (bounded sampling, redacted findings, absolute-path needles), portability/private-store
   suites, secret-guard-via-`platformRecords`, STALE-via-extract proofs.

## 2. Real-source identities and versions (as observed)

| Source | Observed | Evidence |
|---|---|---|
| Magento CE | **2.4.8-p5** (`composer.json` name `magento/project-community-edition`, license `OSL-3.0`/`AFL-3.0`) | extract platform scan; digest of `composer.json` pinned in payload |
| Page Builder | **2.2.6-p5** (`magento/module-page-builder`, via composer lock) | pb-native scan `sourcePackage.version` |
| Hyvä UI | **2.8.0** (`hyva-themes/hyva-ui`, license pointer "See LICENSE.md or https://hyva.io/license") | hyva-ui census, version pinned from composer.lock (`packages-dev`) |
| `Secomm_UiWidget` | enabled per `app/etc/config.php`; 21 DI-registered component definitions; widget.xml declares 1 widget (`secomm_ui`) | uiwidget scan; config.php digest `0686b069…` |

## 3. Counts reconciliation vs the audited inventory (SOURCE-INVENTORY.md)

| Inventory expectation | Measured | Verdict |
|---|---|---|
| 528 `config.php` module entries (524 enabled / 4 disabled) | **528 records; 524 enabled / 4 disabled** (`Magento_TwoFactorAuth`, `Secomm_Ahamove`, `Secomm_GhnAddressMapper`, `Secomm_GiaoHangNhanh` disabled) | exact |
| 20 PB content types / 33 appearances | **20 records; 33 named `<appearance>` elements** (banner: collage-left/centered/right + poster) | exact |
| 21 `Secomm_UiWidget` component definitions | **21 records, all `DETECTED`** + 1 widget declaration counted as info diagnostic | exact |
| 36 Hyvä UI components / 70 variants | **36 records; 70 variant directories** (name census only) | exact |
| 21 CONFIRMED `adaptedFrom` pairs | **21 edges** (e.g. `uic:secomm-uiwidget:banner-a` → `uic:hyva-ui:banner`, variant path `banner/A-default` + version 2.8.0 pinned in the edge note) | exact |
| Origins | 358 native / 118 custom (`app/code`) / 52 third-party | consistent with 119 custom modules minus 1 unresolvable; see unknowns |
| Module versions | 403/528 carry versions (357 composer-lock, 37 module-xml, 9 both) | honest coverage; see unknowns |

## 4. Demo queries (reproducible against the private store)

```bash
node bin/det.js kb extract --manifest local-kb/<private-dir>/extract-manifest.json \
  --root slaunch=<checkout> --out local-kb/<private-dir>/extract        # exit 0
node bin/det.js kb ingest --manifest local-kb/<private-dir>/ingest-manifest.json \
  --root ex=<out> --out local-kb/<private-dir>/store                    # exit 0, 0 diagnostics
```

- **Q1 — available native Page Builder CMS types:** `kb query --kb ui --where
  sourcePackage.kind=page-builder-native` → **20 hits**, 33 named appearances,
  `behavior.cmsEditable=true`, `license.regime=osl`, proof `DETECTED`.
- **Q2 — which exact Hyvä UI component/variant, and under what constraints:** `…--text banner`
  → `uic:hyva-ui:banner`, variants `A-default / B-split / C-text`, `license {regime: commercial,
  derivedArtifactPolicy: metadata-only}`, `behavior.cmsEditable=false`, version 2.8.0, proof
  `DETECTED` with uncertainty ("licensed package: metadata-only").
- **Q3 — which `Secomm_UiWidget` feature exists, verified vs only declared:** unfiltered →
  **21 `DETECTED`** (declaration-level: di.xml registry + definition metadata, e.g. banner-a
  "Hero Banner" with 17 declared admin fields, availability `imported-runtime`); with
  `--require-proof TESTED` → **0 hits** — nothing is runtime-verified, by contract. The 21
  `adaptedFrom` edges are declaration-level provenance ("rendering equivalence is not verified").
- **Q4 — module inventory:** `--kb platform --where recordType=module` → 528 records
  (524/4 enablement, config-scan only).

## 5. Safety evidence

- **Deny-list before read, containment:** adapter-side gateway (baseline + manifest globs,
  case-insensitive, relpath+basename) and orchestrator gates are covered by M4-04/M4-05/M4-06,
  M4E-04/M4E-05; `auth.json`, `app/etc/env.php`, `var/**` etc. were never opened (denied count 0
  because the scan paths never reach them; the staged-fixture tests prove the deny path works).
- **Byte-level license separation:** `kb-license-guard` store↔`hyva-ui` package → **clean, exit
  0** (367 licensed files sampled, up to 3×96-byte windows each; bounded assertion, not
  exhaustive proof). No licensed source/template/asset bytes exist in the store; Hyvä records
  carry name/variant/license metadata only.
- **Secrets:** the record-safety gate ran on every record at extract and ingest; no credential
  material captured (env.php/auth.json denied; n98-magerun2 `sys:info` output observed during
  environment preflight included the crypt key — it was excluded from all artifacts and is not
  in the store, extract outputs, or this receipt).
- **No source writes:** extract/ingest/sync write only into `local-kb/` and temp dirs; the
  checkout was only ever opened read-only.

## 6. Staleness, determinism, review state

- **Determinism:** two real extract runs byte-identical modulo `scannedAt`/`capturedAt`/
  `recordedAt` across all three record files; 136/136 suite includes determinism checks
  (KB-03/04/20, M4-12, M4E-12).
- **STALE dry-run (scratch copy; the real source and the store were not modified):** syncing
  the store against a scratch copy with one changed intermediate marks **all 528 platform
  records `STALE`** with `SOURCE_DIGEST_CHANGED` (report-only sync), because KB-1 records pin
  the same intermediate file digest — per-file granularity at the intermediate layer; per-record
  source-level digests (config.php, module.xml, installed.json, di.xml, definition PHP,
  composer files) remain pinned inside each record's `observed.inputDigests` for forensics, and
  re-extract re-observes per-record facts. On-disk STALE lifecycle + query exclusion proven by
  KB-M4-S5; unchanged inputs → `stale: 0` (626 checked).
- **Review state:** all real records are `reviewStatus: unreviewed` — no approval is claimed or
  inherited.

## 7. Honest unknowns / limits

1. **43 unresolved module dirs ("ghosts")** — Hyvä (30), Smile Elasticsuite (12), Mollie (1):
   these packages keep `etc/module.xml` under nested layouts (e.g. `src/etc/module.xml`) that
   the bounded resolver does not probe. They carry `installed: false`, `origin: third-party`
   (config.php registration outside `app/code`), no version, and an explicit uncertainty line.
   `Hyva_Theme` (theme-module 1.5.2, in composer lock) is among them — declared enablement
   stands (config.php), package identity is proven by composer metadata, directory resolution is
   the unknown.
2. **`Secomm_UiWidget` version: UNKNOWN** — `app/code` module, no version attribute in
   module.xml, not in composer.lock. Same for 118 `app/code` custom modules without version
   attrs (37 declare versions).
3. **Runtime facts remain UNKNOWN by rule:** DB enablement, active Alpine build variant, PB
   store/website-level enablement, theme consumption state — `installed ≠ enabled ≠ configured ≠
   runtime verified` is encoded in every record's uncertainty, and nothing was queried outside
   files.
4. **`adaptedFrom` is declaration-level** (`DETECTED`, authority `confirmed` from registry
   metadata + definition `sourceComponent`/`sourceVersion`); rendering equivalence is not
   verified — the edge note says so on every edge.
5. **Bounded metadata:** UiWidget definition fields are capped (32 rows / 80 chars / 512 KiB
   file); `configOptions` carries group/schemaVersion + row-grouped field names/types with
   extra declared keys noted — a census, not a full schema dump. PB appearances beyond 24 per
   type would be count-only (not hit at this checkout).
6. **KB-3 not seeded** — GO-2 authorizes the checkout + Hyvä package + UiWidget only; client
   requirements/spec docs (`.ai/specs`) were **not** read and no KB-3 partition exists in the
   private store. Seeding requires a separate Owner GO.
7. **Tool-run role vocabulary:** the extract report artifact reuses the `kb-records` role (the
   frozen role enum has no extract-specific role yet); the report itself validates against the
   `kb-engine-output` extract branch (schemaRef honest).
8. **Fixture-derived enum degradations:** frozen `entrypoints.kind` / `uxSemantics.concept`
   enums do not cover every declaration (webapi → `api`, layouts → `template`, unmapped concepts
   → `other` with the declaration named in the description); a future additive schema minor may
   extend them.
9. **Engine gaps found and fixed during integration** (all covered by tests): safety-gate
   routing for `recordType: "module"`; Composer `install-path` resolution (`../`-relative to
   `vendor/composer/`); adaptedFrom targets component-level census ids (variants are fields,
   not ids — CONTRACTS §1.1); UiWidget named-argument definition style; row-grouped field
   extraction; hyva composer version via composer.lock.

## 8. Exit gate

`REAL_KB_READ_ONLY_VERIFIED` per issue #19: real source identities/versions/digests checked
(§2), retrieval evidence reproducible (§4), license separation asserted (§5), STALE propagation
demonstrated without touching the source (§6), 136/136 CI-equivalent gate green. **Next gates
require new Owner GOs:** M5/GO-3 planning on real data, KB-3 seeding from client material,
any Figma/CMS/admin step.
