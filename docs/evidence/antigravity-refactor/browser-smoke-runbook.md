# Studio browser smoke RUNBOOK — for the Integrator (W-D plan + verified curl baseline)

Scope: local Studio smoke on THIS machine for the #74 integration receipt. The browser portion is intentionally NOT executed by W-D (read-only lane); every API/curl assertion below WAS executed live by W-D on `5bf41d3` in the audit worktree and is marked **[W-D verified]**. Browser steps are ready-to-run.

**Machine constraints honored here:** Wayland screenshot portal is DENIED — use `google-chrome --headless=new --screenshot` only. Orca's embedded browser renders slaunchpad UNSTYLED — storefront evidence must be scoped DOM checks + one screenshot, never visual styling judgment. MCP `db_query` is broken — use `magento-spec` CLI tools or mysql directly. Admin secret-key forging FAILED on 2026-11-13 rerun — drive the real admin grid UI, don't forge URLs.

## 0. Where to run

Worktree with the integration result (any lane worktree or a fresh checkout of the integration branch at the receipt SHA):

```bash
cd <worktree-root>
pnpm install --frozen-lockfile        # if node_modules missing
pnpm run build:core                   # det dist for the build runner + CLI (scripts/studio.mjs also auto-builds when stale)
```

## 1. Env vars that matter (from `scripts/studio.mjs` + `server/environment/gate.ts`)

| Var | Semantics | Smoke setting |
| --- | --- | --- |
| `PORT` | Next port (default 3000) | **3100** (the #72-era studio flake workaround; keeps 3000 free) |
| `STUDIO_DET_RUNS_DIR` | Runs root. Launcher defaults to `<root>/out/studio-runs` when unset; gate `checkDetRunsDir()` requires set AND existing dir, else mutations 503 `environment-not-ready` | Point at a dedicated dir (below). If you rely on the default, start via `node scripts/studio.mjs` so it gets created |
| `STUDIO_BUILD_PROJECTS_DIR` | Build-config catalog override; **unset discovers the committed `resources/examples/build` in place** | leave unset |
| `STUDIO_DATA_DIR` | ⚠ dual-purpose: project-catalog location AND "use SQLite catalog" flag (needs Node ≥ 22.13) | **leave unset** for smoke (JSON store + committed catalog discovery) |
| `STUDIO_DET_CLI`, `STUDIO_BUILD_TIMEOUT_MS` | optional pass-through | unset |

Node must be ≥ 22.13 (launcher hard-fails otherwise). `node scripts/studio.mjs print-env` prints the resolved layout as one JSON line without starting anything — run it first.

## 2. Produce the fixture run (no committed run dir exists)

**There is NO committed run** — `build-1794544715541` quoted in the AG log exists only in the log text; `out/` is not committed. Generate the canonical offline bundle (exit 0 verified by W-D):

```bash
node bin/det.js build \
  --config resources/examples/build/slaunchpad-home-72-extended/build-config.json \
  --out "$HOME/tmp-runs/build-72extended" --json
export STUDIO_DET_RUNS_DIR="$HOME/tmp-runs"
```

Expected bundle at the run dir (W-D verified): `build-manifest.json`, `pagebuilder-content.html`, `install-homepage.php`, `mapping-and-gaps.json`, `README.md`, `02-extraction/` (node-ir, page-structure, source-review, tool-run), `03-composition/` (compose-report, native-content, tool-run), `media/wysiwyg/slaunchpad-home-real-derived/` (4 placeholder JPGs). Manifest gaps: `COMPOSITION_SKIPS_PRESENT` count **7**, `COMPOSITION_GAPS_PRESENT` count **21**; page-structure has **12 sections**.

## 3. Start

```bash
PORT=3100 STUDIO_DET_RUNS_DIR="$HOME/tmp-runs" node scripts/studio.mjs dev     # fast lane
# For the RECEIPT use start (prod bundle — Turbopack prod-only issues like trackDynamicImport only show here):
PORT=3100 STUDIO_DET_RUNS_DIR="$HOME/tmp-runs" node scripts/studio.mjs start
```

Wait for `Ready in` on stderr (dev). **[W-D verified]** `GET /api/environment` → `{"ready":true,"checks":{claudeCode:{version:"2.1.325",reasonCode:"ok"},figmaMcp:{ready:true,serverName:"plugin:figma:figma"},detRunsDir:{reasonCode:"ok"}}}` — on this box readiness is green; a red `figmaMcp` here does NOT block read-only smoke (GETs are ungated; only new Builds/AI/approve get 503).

## 4. curl assertions (all **[W-D verified]** on dev @ `5bf41d3`)

| # | Command | Expect |
| --- | --- | --- |
| 1 | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/` | `200` (442 KB SSR; contains `studio-header`, `Tổng quan Studio`) |
| 2 | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/build` | `200` (client-rendered lane; `studio-header` present in SSR) |
| 3 | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/catalog` | `200` |
| 4 | `curl -s localhost:3100/api/runs` | JSON lists `runId:"build-72extended"`, `mode:"live"`, `revisionId:"2417494580183108397"` |
| 5 | `curl -s localhost:3100/api/runs/build-72extended` | 200; `sections.length === 12`, `artifacts.length === 12`, `preview` unavailable, diagnostics `EVIDENCE_MISSING`/`NOT_VERIFIED` (honest, never faked) |
| 6 | `curl -s -o /tmp/b.zip -w "%{http_code} %{content_type} %{size_download}" localhost:3100/api/runs/build-72extended/download-bundle` | `200 application/zip` (~1.2 MB); `unzip -l` shows 9 entries: 5 root files + 4 media JPGs, timestamps zeroed `00-00-1980` |
| 7 | `curl -s -o /dev/null -w "%{http_code}" "localhost:3100/api/runs/..%2Fetc/download-bundle"` | `400` (`RUN_ID_PATTERN` rejects) |
| 8 | `curl -s localhost:3100/api/projects` | seeded project `slaunchpad-fashion` ("Slaunchpad Fashion", 3 pages) |

## 5. Browser assertions (Integrator executes; headless Chrome, NO portal)

```bash
mkdir -p /tmp/wd-shots
google-chrome --headless=new --disable-gpu --screenshot=/tmp/wd-shots/home.png \
  --window-size=1440,900 --virtual-time-budget=15000 "http://localhost:3100/" 2>/dev/null
# repeat for /build, /catalog, /runs/build-72extended
```

DOM checks (scoped, one page each — styling out of scope):
- **`/`**: `.studio-header` full-width present; 3 quick-action cards; recent-runs card lists `build-72extended`.
- **`/build`**: two-column layout; preset buttons (Hero 245:2 / Extended 245:16 / PLP 301:4); vertical Steps; NO console warning `[antd: Steps] 'direction' is deprecated` (verify by dumping console: `--enable-logging --v=1` is unreliable headless — instead grep the served JS? No: run a real Chrome with `--headless=new` and `--dump-dom`, then rely on the vitest lanes for deprecation warnings; the AG-010/011 console claims were already covered by `pnpm exec vitest run src/modules/studio/mapping-review src/modules/studio/design-tree` = 16/16 with clean stderr [AG-011 log claim, spot-checked]).
- **`/catalog`**: Card Tabs, "Dự án & Trang Figma" tab, seeded "Slaunchpad Fashion", "Tạo dự án mới" opens Modal with `destroyOnHidden` (no `[antd: Modal] destroyOnClose` warning).
- **`/runs/build-72extended`**: 4 KPI cards; ZIP button `Tải trọn bộ Gói cài đặt (ZIP)` (`href` ends `/download-bundle`); "Các phân đoạn giao diện đã chuyển đổi (12)" — **note the audit finding**: every row is hardcoded green "Đã ghép thành công" although only 5/12 compose (`COMPOSITION_SKIPS_PRESENT` count 7). Record the count AS RENDERED and the manifest truth side by side in the receipt; do NOT accept "12 composed" as PASS.
- Copy button: clipboard needs permissions in headless — assert the button renders and is disabled/enabled per `htmlCode` fetch, skip actual clipboard.
- `/agent?analysis=X`: expect navigation to `/build?analysis=X` (server redirect shim; unit-tested in `app/agent/page.test.ts`; in dev W-D observed an app-level 200 redirect — judge in browser).

## 6. Slaunchpad PHP installer — **BLOCKED unless a safe test store is verified first**

`install-homepage.php` from `build-72extended` targets the **isolated QA store 5 (`det_preview`)** only (`build-config.json` `cmsInstall`). Steps IF (and only if) a local test store is verified this session:
1. `php -l install-homepage.php` (syntax only — safe).
2. `php install-homepage.php --dry-run` against a COPY of the bundle in an empty dir; assert exit 0 and that the target dir has no new/changed files (snapshot before/after).
3. Admin Save→Reload proof on the isolated test page ONLY (real admin grid UI via browser; Content tab = fieldset-wrapper #2 per #18 memory; never forge admin secret-key URLs).
4. Cleanup proof + restore.
If any precondition fails (no verified test store, broken MCP, admin blocked): **record BLOCKED, not PASS** — same as the #72 receipt. Never touch store 0 or the default homepage. Orca browser renders slaunchpad unstyled — use scoped DOM (CMS block/container ids in HTML) + one screenshot.

## 7. Known flaky bits (from this audit)

- `pnpm run test:studio` under default file-parallelism is **load-flaky on this box** (4 distinct single-test failures across 4 parallel runs; all green serialized: `pnpm exec vitest run --fileParallelism=false` = 61 files / 631 tests). Run receipt gates serialized or on a quiet box.
- Root `pnpm test` (201 checks) stayed green in every run.
- Keep `STUDIO_DATA_DIR` unset; do not run two Studio instances against the same runs dir.
