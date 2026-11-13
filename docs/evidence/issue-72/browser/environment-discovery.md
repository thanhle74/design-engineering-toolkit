# Environment discovery — issue #72 W-E (local Magento + browser tooling)

Date: 2026-11-12 · Worktree: `72-det-modular-page-builder-capabilities-p2-over` · Operator: W-E
Scope: discovery ONLY. No CMS write, no Magento config change, no Figma write, no store-0 installer run. Every probe below is a read (HTTP GET, PDO SELECT, CLI list) or a local screenshot.

## 1. Local Magento facts (verified live)

| Fact | Value | How verified |
|---|---|---|
| Magento root | `/home/thanhle/Sites/Magento/slaunchpad` | `php bin/magento` works |
| Version | 2.4.8-p5 | [70] receipt + `env.php` frontName read |
| DB | host `127.0.0.1`, db `slaunchpad`, user `magento` (password present in `app/etc/env.php`) | PDO SELECT works (used by `snapshot-fingerprints.php`) |
| magento-spec MCP `db_query` | NOT used (errors per Coordinator brief); all DB reads are PDO | — |
| Store views | 1=`vi` (default), 4=`en`, 5=`det_preview` ("DET Preview", issue-#70 isolated QA store) | PDO `SELECT ... FROM store` |
| Store-5 homepage config | `core_config_data` `stores/5` → `web/default/cms_home_page = det-home-preview` (page_id 42, active, store_ids `[5]`, sha256 `14e8126e…`) | PDO SELECT + `cms-page-proof.php --mode=verify` |
| Store-5 config overrides | only 4 rows: `design/head/demonotice=0`, `design/theme/theme_id=7`, `hyva_theme_general/demo_content/show_homepage_demo_content=0`, `web/default/cms_home_page=det-home-preview` | PDO SELECT all `scope='stores' AND scope_id=5` |
| Base URLs | default scope only: `https://slaunchpad.thanhaloha.io.vn/` (unsecure = secure; NO store-scoped base_url override — store 5 inherits) | PDO SELECT + curl |
| Store-5 frontend URL forms | `https://slaunchpad.thanhaloha.io.vn/det_preview` → HTTP 200, title `DET Home Preview (Local Only)`; `/?___store=det_preview` → HTTP 200, same title. `/det_preview` is the canonical store-code path. | curl GET + headless-Chrome DOM dump |
| CMS pages | 43 `cms_page` rows, 45 `cms_page_store` rows (store 5 has exactly 2 assignments: page 42 `det-home-preview`, page 45 `det-pb-roundtrip-46`) | `baseline-fingerprints.json` |
| Pre-existing #70 artifacts | page 35 `home-6ad89b83d8c5d` (store 1, INACTIVE, title "Home Page old VI"), page 36 `home` (store 4, ACTIVE, "Home Page EN") — fingerprinted in `baseline-fingerprints.json`, NEVER modified. NOTE: page 45 `det-pb-roundtrip-46` (store 5) is an additional leftover #70-era proof page — flagged here for the Coordinator. | snapshot + verify |
| Frontend render | REAL Page Builder DOM: 125 `data-content-type` markers in the served HTML (image 30, text 25, column 25, row 12, button-item 10, column-line 9, column-group 9, buttons 9, banner 2, slider 1) — `slider` present in DOM but not in DB-content count (PB slider renders slides dynamically) | headless-Chrome `--dump-dom` + DB verify |

Evidence files in this directory:
- `baseline-fingerprints.json` — first-run output of `snapshot-fingerprints.php` (re-verified byte-identical modulo `meta.generated_at_utc` against the live DB after every probe in this session).
- `store5-home-frontend.png` — headless-Chrome screenshot (1440x2000) of `/?___store=det_preview`. Render is largely STYLED (banner images, buttons, typography all applied) — NOT the "unstyled Orca render" from memory; headless Chrome loads the CSS fine. Good for frontend QA evidence.
- `store5-home-dom.html` — the DOM dump backing the counts above.

## 2. Browser tooling verdict

| Tool | State | Verdict |
|---|---|---|
| Playwright / Puppeteer | NOT installed (no worktree dep, none in `~/.cache/ms-playwright`, none global npm) | Do not rely on it for #72 |
| `google-chrome` headless (`/usr/bin/google-chrome`, Chrome 157) | WORKS — screenshot + `--dump-dom` against the live HTTPS frontend, exit 0 | Use for single-shot frontend screenshots + DOM checks (`--headless=new --screenshot=... --window-size=1440,2000 --virtual-time-budget=15000`) |
| Orca CLI browser (`orca tab …`, `orca snapshot/eval/screenshot/goto/click/fill/exec …`) | Runtime REACHABLE (`orca tab list` → "No browser tabs open") — full agent-browser command set (element refs, eval, storage, download, profiles) | Use for any multi-step browser QA (Admin login flow, Page Builder DOM interaction, localStorage checks). Memory caveat: Orca embedded browser may render the storefront unstyled — prefer scoped DOM checks + `orca screenshot`; use `google-chrome --headless=new` when a styled PNG is needed |

Recommended split for the Coordinator:
- **Frontend QA (store 5):** headless Chrome for one-shot screenshot/DOM; Orca browser for interactive flows (store switcher, lazy-loaded blocks, `data-amsrc` checks).
- **Admin QA:** Orca browser (needs real login POST + navigation; coordinate `mouse click` + synthetic keystrokes known-flaky — use element-ref `click`, `fill`, `eval` per the #48 memory).

## 3. Admin access (discovery only — NO user created in this mission)

| Fact | Value | How verified |
|---|---|---|
| Admin URI | `/admin` (env.php `backend.frontName=admin`; `php bin/magento info:adminuri` → `/admin`) | both checked |
| Login page reachable | GET `https://slaunchpad.thanhaloha.io.vn/admin/` → HTTP 200, `<title>Magento Admin</title>`, login form present (`id="login"`, `id="username"`) | read-only curl GET |
| 2FA / captcha | OFF (per #48 memory: "2FA off, no captcha, admin URI `/admin`") | prior receipt |
| Existing admin users | 21 active rows in `admin_user` (read-only SELECT): `secomm` + 14 named `secomm_*`, `uixreview`, `uat64_admin`, plus LEFTOVER temp QA accounts `qa_r6aha8`, `qa_r6aha8_noacl`, and `uixreview_noacl`/`uixreview_noassign` from earlier proofs — flagged for the Coordinator (not cleaned here, out of scope) | PDO SELECT `admin_user` |
| Credential plan at proof time | Create a dedicated temp admin with the Magento-native CLI: `php bin/magento admin:user:create --admin-user=det-qa-72 --admin-password=<generated> --admin-email=det-qa-72@example.invalid --admin-firstname=DET --admin-lastname=QA72` (2.4.8 has NO core `admin:user:delete` — delete afterwards with `php ~/.local/bin/n98-magerun2.phar -r admin:user:delete --force det-qa-72`, binary verified present at `/home/thanhle/.local/bin/n98-magerun2.phar`; also remove its `authorization_role` row per the #70 receipt cleanup). Credentials are generated at proof time, never committed; the DB is the source of truth for existence (`admin_user` SELECT) and the CLI is the only write path. | memory (#48) + #70 receipt step 8b/9 + binary check |

Read-only verification available right now (done): admin URI resolves, login form renders, admin accounts exist, n98 delete path exists. Nothing was logged into in this mission; the first login happens at proof time with the documented temp user.

## 4. Scripts delivered (see `scripts/proof/issue72/README.md` for commands + safety rules)

- `scripts/proof/issue72/snapshot-fingerprints.php` — read-only isolation snapshot (RUN, output = `baseline-fingerprints.json`).
- `scripts/proof/issue72/cms-page-proof.php` — READY CMS write driver (verify mode RUN read-only; write modes ported from the [70] live-proven `PageRepositoryInterface` pattern, NOT executed; boot + fail-closed resolution proven dry with zero writes: cleanup of a nonexistent id → `action=none` exit 0; update of a nonexistent id → loud REFUSING exit 1).
- Baseline re-check after every probe: `fingerprint` payload identical to the live DB → **nothing was mutated during discovery**.
