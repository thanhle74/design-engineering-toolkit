# Receipt — [46] DET local Magento Page Builder round-trip (Studio Build → Admin proof)

**Status:** EXECUTED end-to-end on the isolated local/dev Magento (owner's `slaunchpad` checkout, 2.4.8-p5 CE developer mode) with honest boundaries — **Studio Build Control, bundle verification, guarded import, storefront render and the literal Admin-UI Page Builder load + live edit all PASS; the literal Admin-UI Save→Reload→persist is BLOCKED by a pre-existing checkout-local infrastructure defect (nginx request-body limit), diagnosed exhaustively and independent of DET, of the composed content, and of the merchant's own records.** One docs-only Draft PR; no engine code changed. Original brief asked for smallest-focused-fix-if-defect — both defects found are checkout-local (owner's own module XML + local nginx layer), documented with exact operator fixes, NOT patched in this repo beyond the repo's own surfaces.

**Branch:** `thanhle74/46-det-local-magento-page-builder-round-trip-stu` (Orca worktree branch, base = `main` @ `451c26c` = PR #45 merge, clean at start).
**Gate:** `npm test` → **172/172** root checks and `apps/studio` → **184/184** tests (21 files), both PASS on the exact tip; docs-only diff here (no behavior change to re-verify).
**Fixture discipline:** all conversion input is the committed offline `FIXTURE` (`tests/fixtures/g28-home-design-source`, design node `245:2` snapshot, `mcp-observed-unpinned` provenance from [28]) — **not** a live Figma read (no Figma token used, none needed), **not** real client requirements; product copy/CTA labels remain the design's MOCK placeholders. Real-data boundary honored: pre-write `db:dump` backup, one new namespaced CMS page on the isolated `det_preview` store view only, temp admin created then deleted with proof, baseline invariants verified after every step.

## 1. PASS / FAIL / BLOCKED matrix

| # | Gate (issue procedure step) | Verdict | Primary evidence |
|---|---|---|---|
| 1 | Read-only preflight (PB/Hyvä installed, admin accounts, CMS identifiers, runbook, backups) | **PASS** | §2.1 — incl. `Magento_PageBuilder => 1` (config.php; absent from `setup_module` is normal — module has no install schema), `DET/preview` theme id 7, `det_preview` store 5, DET namespace pages 38–42/block 32; **no pre-existing backups found** → backup taken before any write |
| 2 | Studio Build via the ACTUAL Build UI (not CLI) from a configured local project entry | **PASS** | §2.2 — UI click on `/build`, entry `g28-example`, real `det build` spawn; journal + manifest on disk |
| 3 | Journal, root `build-manifest.json`, SHA/bytes, screenshot of successful run, 3 stages, truthful gaps | **PASS** | §2.3 — 3/3 stages `completed` exit 0; 4 truthful gaps incl. `PREVIEW_INSTALL_OPERATOR_GATED`, `PREVIEW_ASSETS_NOT_GENERATED`; [screenshot](evidence/46-studio-run-stages.png) |
| 4 | Verified native-content download HTTP 200 + SHA match | **PASS** | §2.4 — `GET /api/runs/<id>/artifacts/...native-content.html` → **HTTP 200, 33146 bytes**, sha256 recomputed `78b3ad11…afa34f4` = manifest value = **byte-identical to the #38 integration receipt's relocation proof** (engine determinism across machines re-confirmed) |
| 5 | Tamper refusal on an isolated scratch bundle | **PASS** | §2.4 — 1 byte flipped in a copy bundle → download hard-refused **HTTP 500 `invalid-payload`** ("nothing is served while verification fails"); copy deleted afterwards; real bundle untouched |
| 6 | Guarded import into a namespaced NEW test CMS page/block (collision check, ownership proof) | **PASS** | §2.5 — `det-pb-roundtrip-46` (**page_id 45**, stores=[5]) via committed `examples/local-preview/det-preview-import.php`; marker check passed; read-back sha = bundle sha (integrity PASS); collision guard present |
| 7 | Storefront preview on the same isolated target | **PASS** | §2.6 — HTTP 200 on `?___store=det_preview`; live DOM: 12 rows / banner / 25 columns / 9 buttons groups / 30 images; `body.det-preview` theme class; **Magento_PageBuilder storefront script injected into the page** (module live); [screenshot](evidence/46-storefront-initial.png) |
| 8 | Admin UI: load Page Builder on the round-tripped page | **PASS** | §2.7 — real login (temp admin), CMS grid → page 45 → PB stage renders the composed structure natively (**1 banner / 12 rows / 25 columns**); [screenshot](evidence/46-admin-pb-stage-loaded.png) — first-ever Admin-UI evidence on this box ([28] left `ADMIN_UI_FORM_CLICKTHROUGH_PENDING`) |
| 9 | Admin UI: edit a native Row/Column/Banner element | **PASS** | §2.7 — PB full-screen live-edit opened on the **banner** message; typed "The Quiet Grandeur — DET46 ROUNDTRIP EDIT" through the real TinyMCE stage editor; [screenshot](evidence/46-admin-pb-live-edit-typed.png) |
| 10 | **Admin UI: Save → Reload → verify edit persists** | **BLOCKED** (pre-existing checkout-local infra defect) | §3 — the page-save POST dies in the **local nginx layer above ≈16 KB request body** (worker killed before PHP completes; no PHP-FPM log, no Magento report). Exhaustively proven independent of DET: trivial `x`-filler payloads, bulk moved to the `title` field, direct-origin vs Cloudflare replay — all reproduce; the merchant's own 48 KB homepages (ids 2/36) are equally unsavable today. DET's service-layer save path with the FULL composed content is proven working (gates 6 + §2.8) |
| 11 | Rollback + post-rollback invariant | **PASS** | §2.8/§4 — service-layer `edit-check` (edit→restore, sha `78b3ad11…` → `95f5dd24…` → `78b3ad11…`), `restore` after the save-probes returned the page to composed bytes, guarded `rollback` ownership guards present (store-assignment + content-sha, refusal proven in [28] R2), baseline invariants re-verified at close (§4) |
| 12 | Run tests / exact-tip CI (files changed) | **PASS** | docs-only diff; root 172/172 + studio 184/184 green on this exact tip; PR CI runs the same contracts job |

## 2. Executed procedure (single task, fail closed)

### 2.1 Read-only preflight (no writes)
`sys_info` (2.4.8-p5 CE, developer, Hyvä installed, admin URI), `admin_user_list` (15 active accounts), `cms_page`/`cms_block` listings (DET namespace: pages 38–42, block 32), store list (`det_preview` id 5), theme table (`DET/preview` id 7, parent `Hyva/default`), config.php module status (`Magento_PageBuilder => 1`, third-party `Magezon_PageBuilder` also installed — noted as possible Admin interference, none observed), filesystem check: **zero backups existed** (`var/backups` absent, no `.sql` anywhere). Storefront + admin reachable (HTTPS via Cloudflare proxy).

### 2.2 Studio Build UI trigger
Per `apps/studio/README.md` [40] setup: root `npm ci && npm run build` (det CLI `dist/`), `STUDIO_DET_RUNS_DIR=out/studio-runs`, `STUDIO_BUILD_PROJECTS_DIR=out/studio-build-projects` with the `g28-example` catalog entry (absolute-path config over the committed fixture), Studio dev server on :3000. Driven through the Orca embedded browser: `/build` → **Build button clicked in the UI** → real `det build --config … --json` spawn (server-only runner, argv array, no shell).

### 2.3 Bundle + journal
Run `build-1794273838314`: journal `.build-jobs/build-1794273838314.json` (state `exited`, exit 0, exact argv recorded); bundle = `01-capability-probe/ 02-extraction/ 03-composition/ + build-manifest.json` (9 outputs, 5 inputs, 4 truthful gaps); stages `capability-probe / extraction / composition` all `completed` exit 0. UI run page re-checks every declared output against its recorded SHA-256 + byte size before any download ("Manifest verified" badge) — [screenshot](evidence/46-studio-run-stages.png).

### 2.4 Download verification + tamper refusal
- Download: `HTTP 200`, 33146 bytes, recomputed sha256 **matches** manifest (`78b3ad11…afa34f4`).
- Determinism: identical hash to the [38] integration receipt's relocation build — same bytes on another machine/run.
- Tamper: copied bundle → flipped 1 byte in `native-content.html` → download → **refused, HTTP 500 `invalid-payload`**, explicit message ("the bundle is tampered or stale — rebuild it; nothing is served"); tamper copy deleted; real bundle untouched.

### 2.5 Guarded import (operator-gated runbook, GO'd by owner)
Pre-write `db:dump` backup `var/backups/det46-pre-roundtrip-20261110.sql.gz` (4.0 MB gz, 598 CREATE TABLE, gzip-verified). Committed scripts copied to the checkout root per `examples/local-preview/README.md`; `det-preview-setup.php status` snapshot (baselines: store 1 theme 5, store 4 homepage home|36, store 5 theme 7 + homepage det-home-preview — all [28] state intact). Import: `php det-preview-import.php import --identifier=det-pb-roundtrip-46 "--title=DET PB Roundtrip 46 (Local Only)" --store-id=5 <studio-bundle>/native-content.html` → `page_id=45 stores=[5] … integrity PASS (read-back equals composed bytes)`. Content came **directly from the verified Studio bundle** — one sha chain from UI click to DB.

### 2.6 Storefront preview (isolated store view only)
`https://slaunchpad.thanhaloha.io.vn/det-pb-roundtrip-46?___store=det_preview` → 200; scoped DOM checks as in the table above; the PB module's own storefront script (`[data-content-type="banner"],[data-content-type="slider"]` handler) is served on the page. Fixture images 404 **by declared design**: the committed offline fixture uses labeled `*-placeholder.jpg` asset names (`PREVIEW_ASSETS_NOT_GENERATED` manifest gap); the real-asset variant was already proven live by [28]'s page 42 (still serving its 31 real assets).

### 2.7 Admin UI proof (temp admin, GO'd, deleted afterwards)
Owner-approved temp admin `det46_roundtrip` created via Magento's own `admin:user:create` (role `Administrators`, auto-assigned `authorization_role` row; random password, printed once, never committed; 2FA off verified in preflight). Real login → CMS grid → page 45 → **Page Builder stage rendered the composed page natively** (1 banner / 12 rows / 25 columns counted in the live stage DOM) — [screenshot](evidence/46-admin-pb-stage-loaded.png). Clicking the banner opened the **PB full-screen live editor** (TinyMCE in-stage on the banner message); the heading was typed to "The Quiet Grandeur — DET46 ROUNDTRIP EDIT" **through the real merchant editing UI** — [screenshot](evidence/46-admin-pb-live-edit-typed.png).

### 2.8 Rollback / restore invariants
- `edit-check` (service layer, before the Admin phase): edit → sha `78b3ad11…`→`95f5dd24…` → restore → `78b3ad11…` — **PASS**.
- After the save probes (§3), `restore` → `restored content_sha256=78b3ad11…` — page back to composed bytes; storefront unchanged; **page kept as evidence per owner choice** (store 5 only, namespaced title, guarded `rollback` command documented — refuses to delete unless store assignment AND exact content sha both match, proven by live refusals in [28] R2).
- Baseline at close: `cms_page` count 43 (42 baseline + page 45 only); page 42 sha unchanged (`14e8126e…`); store configs unchanged; announcement block 32 intact; admin users exactly the original 15 (temp `det46_roundtrip` deleted, `authorization_role` leftover rows: none); operator scripts removed from the checkout root.

## 3. The Admin Save→Reload BLOCKER — pre-existing, exhaustively diagnosed

**Symptom:** clicking Save in the Admin UI (and any replay of the exact captured form POST) returns nginx's plain **500** before persisting (DB sha unchanged).

**Diagnosis chain (all reproducible):**
1. The admin save controller wraps `pageRepository->save()` in `catch (\Throwable)` — a caught exception would show an Admin message, not a 500. The 500 page is **nginx's own default error page** (177 B), meaning the PHP worker died mid-request (no PHP-FPM log, no Magento `var/report`, no exception log entry) — an uncatchable kill in the **local server layer**, before/around request body handling.
2. Content-independence: the exact captured Admin POST with content replaced by `'<p>'+'x'.repeat(N)+'</p>'` fails for N ≥ ~10–12 KB and succeeds below (curl direct-to-origin binary search: 10000→302, 12000→500). A 20 KB trivial payload fails identically.
3. Field-independence: the same 12 KB bulk moved into the `title` field → 500; 9 KB content → 302. Purely **total request-body size**.
4. Layer-independence of DET: direct-origin (`https://127.0.0.1` + Host header, bypassing Cloudflare) fails identically to the proxied URL → **local nginx + PHP-FPM layer**, not the CDN.
5. Independence from DET content and from the merchant's data: the merchant's own homepage records (page 2 = 48 400 B, page 36 = 48 032 B) and `careers` (13 KB) are far above the boundary — **their Admin saves are equally broken today**. This defect pre-dates [46] (nothing in this task's writes could alter nginx/PHP layers).
6. Most likely root cause (needs root to confirm): SELinux is **Enforcing** on this Fedora host; nginx's default `client_body_buffer_size` (16 K) is exceeded by these POSTs, forcing a spill to `client_body_temp` (`/var/lib/nginx/tmp`), which is blocked (classic AVC denial) → worker abort → nginx 500. Shop is served through Cloudflare; the proxied path shows the boundary at lower content sizes consistent with chunked re-encoding.

**Exact operator fix (root, run by the owner when ready):**
```bash
sudo ausearch -m avc -i --start today | grep -i nginx      # confirm the denial
sudo restorecon -Rv /var/lib/nginx                          # fix contexts
sudo ls -la /var/lib/nginx/tmp                              # dir must exist, nginx-owned
```
After the fix, re-running the [46] Save→Reload step is a ~2-minute UI pass on page 45 (the same steps in §2.7, ending with Save → reopen → verify the banner heading → storefront). This receipt does **not** claim `ADMIN_UI_SAVE_RELOAD_PASS` until then; the service-layer round-trip with the full content remains proven (gate 6 + §2.8), so the DET side of the round-trip is not in question.

## 4. Other checkout-local findings (honest, out-of-repo, operator-actionable)

1. **`Secomm_SizeFinder` menu.xml breaks the whole Admin** (found during this task, fixed locally with owner GO): `app/code/Secomm/SizeFinder/etc/adminhtml/menu.xml` had root `<menu>` instead of `<config><menu>`; with `Menu\Dom`'s merge rules any cold admin-menu rebuild crashed (`appendChild() on null`, `Config/Dom.php:218`) — the module was added 2026-11-09 19:09, after the last known-good admin login. Minimal structural fix applied locally (wrap in `<config>`, 4 directives unchanged; original bytes preserved at the worktree's `out/evidence-46/menu.xml.Secomm_SizeFinder.ORIGINAL` — **not committed**: private Magento source stays out of this public repo). The owner should apply the same wrapper fix in their module source.
2. **Media-gallery validation logs `IntegrationException` on CMS save** for referenced-but-missing asset paths (`There is no such media asset with path …placeholder.jpg`): caught-and-logged in the service path (save succeeds), consistent with the fixture's declared `PREVIEW_ASSETS_NOT_GENERATED` gap; worth knowing when saving content with unregistered media paths.
3. **Magezon_PageBuilder + native Page Builder coexist** on this checkout; no interference observed in the CMS admin form or the PB stage during this proof.
4. The CMS page edit form on this checkout is a **checkout-local customization** (no `<form id="edit_form">`, extra "Generate Hyvä Styles"/`is_tailwindcss_jit_enabled` per-page toggle, "Apply/Save as Template" buttons) — noted because it changes the save-path surface that §3 diagnoses.

## 5. Boundaries honored / state left behind

- No Figma access (offline committed fixture only, labeled FIXTURE); no staging/production/client-site writes; no auto-deploy; no auto-merge.
- Magento writes confined to: backup file, the two committed guarded scripts' own operations (one new page 45), temp admin lifecycle, and the GO'd `Secomm_SizeFinder` menu.xml structural fix (backed up). Homepage vi/en, pages 1–42, block 32, stores 1/4: untouched, verified.
- Left in place (evidence, owner choice): page 45 on store view 5 (restore/rollback one-liners in `examples/local-preview/README.md`); pre-write DB backup at `var/backups/det46-pre-roundtrip-20261110.sql.gz`.
- Removed: temp admin, operator script copies, diagnostic scripts, tamper copy.
- Toolkit repo diff: **docs-only** (this receipt + five evidence screenshots).
