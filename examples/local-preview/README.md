# Isolated local preview — guarded install runbook (issue #28 / C3)

The one-shot `det build --config` (see `examples/build/`) is **offline computation only**: it
never writes to any Magento checkout, CMS, store configuration or theme — that boundary is
recorded as the `PREVIEW_INSTALL_OPERATOR_GATED` gap in every build manifest. The steps below
are the **operator-executed, guarded** preparation that turns a build bundle into the isolated
rendering preview, exactly as executed and verified for [28]. They require a local Magento
checkout you own; they must NEVER target a client's active theme, a live Homepage, or any store
view you did not create for this purpose.

## What is here

| File | Purpose |
|---|---|
| `det-preview-setup.php` | Guarded setup/rollback for the preview store view, the scoped theme assignment (`design/theme/theme_id @ stores/<id>`), the scoped homepage config, the optional `det-announcement` CMS block, and the scoped Hyvä demo-content / demo-notice flags. Idempotent actions: `store-theme` · `announcement` · `homepage` · `status` · `rollback`. Every identifier collision aborts; rollback is content-guarded and never deletes records it did not create. |
| `det-preview-import.php` | Guarded CMS page importer (actions `import` · `verify` · `edit-check` · `restore` · `rollback`) using `Magento\Cms\Api\PageRepositoryInterface`; identifier collision aborts; the content must carry the composed Page Builder markers before import; byte-integrity (sha256) is asserted on read-back. |

Both carry an explicit **CONFIG block** at the top — edit it per checkout (store view code/id,
theme path/registration id, block id/content, homepage identifier). CLI `--key=value` overrides
exist for one-off runs. These are the same scripts that produced the verified [28] local preview
(gitignored originals at the operator's checkout root; the committed copies are the reusable
form).

## Runbook (operator, on your own checkout)

```bash
# 0. Build the content bundle offline (no checkout access happens here):
node bin/det.js build --config examples/build/project.example.json --out out/build-sample
#    → 03-composition/native-content.html (+ build-manifest.json; read its gaps first)

# 1. Install the preview theme source (examples/preview-theme/det-preview/ — see its README):
cp -r examples/preview-theme/det-preview <checkout>/app/design/frontend/DET/preview
cd <checkout> && bin/magento setup:upgrade && bin/magento cache:flush
#    note the theme_id assigned for DET/preview (bin/magento currently has no list output; check
#    the theme table or Admin) — put it into the setup script's CONFIG block ($themeId).

# 2. Create the isolated preview store view (operator decision: code/id/website/group):
#    e.g. n98-magerun2 sys:store:create det_preview "DET Preview" --group-id=1
#    (verify with the setup script; `store-theme` corrects website/active through the store
#    model — the Admin's own persistence path.)

# 3. Copy the two guarded scripts to the checkout root, adjust their CONFIG blocks, then:
php det-preview-setup.php store-theme     # scoped theme + Hyvä demo/notice flags off (preview view only)
php det-preview-setup.php announcement    # optional MOCK announcement strip (scoped to the preview view)
cp out/build-sample/03-composition/native-content.html <checkout>/out/det-home-preview/
php det-preview-import.php import out/det-home-preview/native-content.html
php det-preview-setup.php homepage        # scoped cms_home_page -> the imported page

# 4. Verify (render on the isolated store view only, e.g.):
#    https://<your-local-host>/?___store=det_preview
#    Scoped DOM checks: body.det-preview class, 12 composed sections, images loaded; then the
#    Admin UI gate (OWNER/OPERATOR): open the page in Admin → Save → Reload → storefront.

# 5. Rollback (removes exactly what this runbook created; guarded):
php det-preview-import.php rollback
php det-preview-setup.php rollback
#    + rm -rf app/design/frontend/DET && bin/magento setup:upgrade && bin/magento cache:flush
```

## Guardrails (enforced by the scripts, not by discipline)

- Store view/theme/announcement/homepage writes are **scoped** to the preview store view id in
  the CONFIG block; baseline store views keep their values (verified in [28] after every step).
- CMS import: identifier collision **aborts** (never overwrites); content markers are required;
  sha256 read-back must equal the composed bytes; `rollback` deletes only its own identifier.
- Announcement rollback is **content-guarded** (a modified block is never deleted).
- No direct SQL writes anywhere: store corrections use the store model save (the Admin's own
  path), config writes use the config `WriterInterface`, CMS via `PageRepositoryInterface`,
  blocks via `BlockRepositoryInterface`.
- Commerce BE is never created or wired: composed CTA labels are presentation-only MOCK content.
