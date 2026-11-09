# DET Preview Theme (`DET/preview`)

The toolkit's **one independent, reusable** Hyvä child preview theme (issue #28). It renders and
QA-s converter-generated CMS/Page Builder output and converter-generated frontend artifacts —
**never** a customer/child theme. "Independent" = independent from any client theme's code and
from local theme configuration; it lawfully **extends the licensed Hyvä base** (`Hyva/default`)
already installed in the operator's checkout. One theme serves every conversion run. No Hyvä
source is bundled in this repository — the theme directory carries only toolkit-authored files.

## Files

| File | Purpose |
|---|---|
| `theme.xml` | Declares `DET/preview`, parent `Hyva/default` (the checkout's installed Hyvä base). |
| `registration.php` | Registers `frontend/DET/preview`. |
| `Magento_Theme/layout/default_head_blocks.xml` | Loads exactly one scoped stylesheet. |
| `Magento_Theme/layout/default.xml` | `det-preview` body class (CSS namespace) + optional `det-announcement` CMS block in `top.container` (renders nothing when the block is absent). |
| `web/css/det-preview.css` | Scoped presentational CSS: `det-*` preview-content hooks + approximation styles for the composer's native Page Builder structures. Plain CSS — no build chain. |

## Install (local operator; isolated preview target)

```bash
# 1. Copy into the checkout (never into a customer theme):
cp -r examples/preview-theme/det-preview <magento-checkout>/app/design/frontend/DET/preview

# 2. Register + flush:
bin/magento setup:upgrade && bin/magento cache:flush
```

Then create/verify the **isolated preview store view** and assign this theme + homepage to it
(scoped, reversible — the default store views and the live Homepage stay untouched). The [28]
receipt documents the exact local commands used and their rollback.

## Porting rules (developer handoff)

- The scoped CSS is a **preview approximation**, not a production contract. Port selected rules
  into the target theme's own Tailwind/CSS pipeline; never assign `DET/preview` to a store.
- The composed Page Builder content itself is native and portable: structural fields, widths and
  `data-pb-style` rules are the platform's own mechanism (Admin-editable). Do not replace them
  with theme CSS.
- The announcement strip is preview MOCK content; merchants replace the CMS block's text.
- Fonts are imported from Google Fonts for preview convenience only; production must self-host.
