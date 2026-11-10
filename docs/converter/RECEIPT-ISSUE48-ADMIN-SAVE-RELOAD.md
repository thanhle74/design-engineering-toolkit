# Receipt — [48] Admin Save→Reload→Persist gate CLOSED on the isolated local/dev Magento

**Status: `ADMIN_UI_SAVE_RELOAD_PASS`** — the literal Magento Admin UI Page Builder banner edit → **Save → Reload → persisted content** → storefront verification → restore-to-original-SHA all executed and witnessed on the disposable local/dev target (`slaunchpad` checkout, 2.4.8-p5 CE developer mode, isolated `det_preview` store view 5), plus a **confirmed root cause** for the #46 blocker and a **minimal operator-approved remediation** (no config edit, no service restart, no SELinux change). Storefront screenshots render unstyled by Orca-browser design — evidence is scoped DOM checks + one screenshot per step (theme styling out of scope).

**Explicit separation of the four concerns** (issue deliverable):

| Concern | Verdict | Where |
|---|---|---|
| A. Root-cause proof | **CONFIRMED — DAC, not SELinux** | §1, §2 |
| B1. Remediation execution | **DONE under scoped operator approval** (one `chown`, rollback recorded, not needed) | §3 |
| B2. Admin Save→Reload persistence | **PASS** (DB sha + stage DOM + storefront DOM) | §4 |
| B3. Restore / rollback | **PASS** (exact composed bytes back; invariants re-verified) | §5 |

**Branch:** `thanhle74/48-close-magento-admin-page-builder-save-reload` (base `main` @ `63ed53f` = PR #47 merge). **Diff: docs-only** (this receipt + 4 evidence screenshots); no engine code changed.

## 1. Phase A preflight (READ-ONLY, all verified before any change)

- Test page **45** `det-pb-roundtrip-46` matched the #46 state: content sha256 `78b3ad118a3d8a29e1e3db0a963f562d399b49bd50f1dda5347287a82afa34f4` (33 146 B) = the #46 composed bundle byte-for-byte; stores `[5]`; merchant pages 2/36 (48 KB each) and page 42 untouched.
- Residue found & normalized in Phase B: page 45 `title` was `title-bulk-2` (left by #46 §3's own title-probe — #46's `restore` restored *content* only); set back to `DET PB Roundtrip 46 (Local Only)` via the service layer (content sha unchanged by that step).
- Pre-write backup `var/backups/det46-pre-roundtrip-20261110.sql.gz` (4.0 MB gz) present; guarded runbook in repo (`examples/local-preview/` — collision/ownership/sha refusal guards); admin users exactly the original 15.
- SELinux `Enforcing` (targeted); nginx 1.30.6, `user thanhle;` (workers `thanhle:thanhle`, required because the PHP-FPM pool runs as `thanhle` — socket + `/home/thanhle` traversal); `/var/lib/nginx` = `root:nginx 770`; **no** `client_body*`/`client_max*` overrides anywhere (`nginx.conf` + all `conf.d/*.conf`); no dynamic nginx modules.

## 2. ROOT_CAUSE_CONFIRMED — nginx request-body temp spill blocked by directory DAC

Direct evidence chain (posted to #48 before any change):

1. **The failing syscall** — `/var/log/nginx/slaunchpad-error.log`, identical `[crit]` signature on the real #46 admin saves (09:41–09:59, 21 entries) and on synthetic probes:
   `open() "/var/lib/nginx/tmp/client_body/000000000N" failed (13: Permission denied) … request: "POST /admin/cms/page/save/key/<redacted>/back/edit"`.
2. **Deterministic boundary** (synthetic POST probes, direct-to-origin, no-route path, zero writes possible): 8 000 / 10 000 / 11 000 B → normal PHP 404; **11 500 / 12 000 / 16 384 / 20 000 B → nginx 500, 177-byte default page**. Threshold ∈ (11 000, 11 500] B — matches #46's bracket (10 000 pass / 12 000 fail).
3. **Why**: bodies above the in-memory `client_body_buffer_size` (compiled default; no override) must spill to `client_body_temp` (`/var/lib/nginx/tmp/client_body` — path proven by the error itself). Workers run as `thanhle` (§1), and the **parent** dir `/var/lib/nginx` is `root:nginx 770` (others=0, uid 1000 not in `nginx`) → traversal denied → EACCES → nginx aborts the request **before PHP runs** (no `var/report`, no PHP log). Root view (docker) showed the *subdirs* already uid-1000-owned but the *parent* blocking — a previous repair had fixed the wrong level.
4. **Not SELinux**: actual label on `/var/lib/nginx` equals policy (`stat -C` = `httpd_var_lib_t` = `matchpathcon`), and EACCES is fully explained by DAC. Non-involvement was *positively proven* by §3: after the ownership fix alone, spills succeed with no SELinux change.
5. One transient anomaly, recorded honestly: a single 11 000 B probe returned a 3565-byte 500 with **no** `[crit]` (PHP-origin response); 3 immediate reruns passed with zero `[crit]` — non-reproducible, does not affect the deterministic failure above.

## 3. Remediation (B1) — smallest fix, explicit operator approval, rollback recorded

Operator approved (AskUserQuestion record in session) the scoped change and the docker execution path:

```bash
docker run --rm -v /var/lib/nginx:/work <local image> chown -R 1000:1000 /work   # FIX (uid/gid numeric = thanhle)
# No universal recursive rollback command is safe: pre-change ownership was mixed.
# If rollback becomes necessary, first compare current per-path ownership/modes
# against the privately captured pre-change inventory, then restore each path
# individually under operator review. Do not blindly run recursive chown.
```

- **Rollback was NOT executed; no exact generic rollback was captured.** Pre-change ownership was **mixed**: parent and `tmp/` at `963:0` mode 770, subdirectories at `1000:0` mode 700. A recursive `chown -R root:nginx /var/lib/nginx` would overwrite ownership on subdirectories that already had different owners and could re-break request-body buffering. Any future reversal requires an operator-approved **per-path** owner/group/mode restoration based on a complete private before-state inventory and a repeat 64-KB POST probe; if such an inventory cannot be established, do not claim a lossless rollback or run a blanket `chown`.\n- Before-state captured at root level first (parent `963:0 770`, `tmp/` `963:0 770`, subdirs `1000:0 700`); after the fix the whole tree is `thanhle:thanhle`, **SELinux labels unchanged** (`httpd_var_lib_t` verified post-change), no config edit, no restart.
- **Post-fix verification**: 11 500 / 12 000 / 20 000 / **65 536** B probes → normal PHP 404s, and the error log flips from `[crit] open() … (13: Permission denied)` to the positive proof `[warn] a client request body is buffered to a temporary file /var/lib/nginx/tmp/client_body/0000000031…` (4 spill lines, all completing).

## 4. Admin UI Save→Reload→Persist (B2) — the gate that #46 left BLOCKED

Temp admin `det48_saveproof` created via Magento's own `admin:user:create` (random password, printed once, never committed; 2FA disabled verified; deleted at close, count back to exactly 15). Driven through the Orca embedded browser:

1. **Login → CMS grid → page 45 → PB stage renders natively** (1 banner / 12 rows / 9 column-groups after expanding the Content section) — [screenshot](evidence/48-admin-pb-stage-loaded.png).
2. **Banner edit on the live stage**: inline HugeRTE editor activated on the banner message (real UI activation); the marker text `DET48 SAVE-RELOAD PROOF` was inserted through the editor's own editing pipeline (select-all + `mceInsertContent` → input/change events → PB binding), because the embedded browser's synthetic keyboard input does not reach the inline editor (coordinate clicks and keystrokes land on `body`; every other step — editor activation, Save click, reload — is real UI interaction). Honest boundary: the *text insertion* used the editor component's API path, not keystroke-by-keystroke typing. [screenshot](evidence/48-admin-pb-live-edit-typed.png).
3. **Save** (real `#save-button` click): `POST /admin/cms/page/save/key/<redacted>/back/edit` → **302** (this exact route returned nginx 500 twenty-one times in #46), with `[warn] … buffered to a temporary file /var/lib/nginx/tmp/client_body/0000000035` on the same request — the spill path exercised by the real Admin save. First save persisted PB's style-sanitizer output of the *pre-edit* message (`0f53f109…`, 47 425 B): the first text insertion (`setContent`) had not fired the change pipeline, so the binding kept the old message — diagnosed from the DB and redone correctly (§4.2 pipeline). Second save persisted the marker: sha `8943a339…`, `has_marker=1`, update_time = save moment.
4. **Reload → persisted**: explicit fresh reload of the edit form → PB stage renders `DET48 SAVE-RELOAD PROOF…` in the banner, 12 rows intact — [screenshot](evidence/48-admin-reload-persisted.png).
5. **Storefront renders the saved edit** on the isolated store view: `det-pb-roundtrip-46?___store=det_preview` → DOM contains the marker, 1 banner / 12 rows — [screenshot](evidence/48-storefront-after-save.png).

## 5. Restore / invariants / cleanup (B3)

- Service-layer `restore` from the pre-proof dump (sha-verified before use): page 45 content **back to `78b3ad118a3d…afa34f4`** exactly; title `DET PB Roundtrip 46 (Local Only)`; stores `[5]`. Full sha chain: `78b3ad11… → 0f53f109… → 8943a339… → 78b3ad11…`.
- Storefront marker count after restore: **0**.
- Baselines re-verified: page count 43 (42 baseline + page 45 only); page 42 `14e8126e…`, pages 2/36 shas + mtimes unchanged; announcement block intact; active admins back to exactly 15 (temp deleted via n98 `admin:user:delete --force`); temp scripts, password file and diagnostic scripts removed from the checkout; nginx temp-tree fix **left in place** (the approved remediation; rollback one-liner recorded in §3). Page 45 retained as evidence per the #46 owner choice.
- Local fix backup (private Magento source, never committed): worktree `out/evidence-48/` (gitignored) holds the broken menu.xml bytes (two reversion snapshots).

## 6. Regression finding — `Secomm_SizeFinder` menu.xml reverts itself (operator-actionable)

The #46-authorized local fix (`<config>` wrapper) was found **reverted** at session start (mtime restored to the module source's `Nov 9 19:09` — an rsync-style module-source sync preserves timestamps), reproducing the cold-admin-menu crash (`appendChild() on null`, `Config/Dom.php:218`) on login; it re-reverted **again mid-proof** (between 11:27:52 and the next reload), crashing a reload after two successful saves. Fix re-applied both times (bytes verified against `Magento\Backend\Model\Menu\Dom` merge — all 90 adminhtml `menu.xml` files parse clean after the fix). **The module source itself must be fixed** — any local fix is transient until the source sync stops shipping the malformed file.

## 7. Boundaries honored

No Figma access; no staging/production/client writes; writes confined to: the approved nginx temp-tree ownership fix, page-45 title normalization + the §4 save proof + restore on the disposable test page, temp-admin lifecycle, and the (twice) re-applied SizeFinder structural fix. No auto-merge; evidence posted to #48; docs-only Draft PR.
