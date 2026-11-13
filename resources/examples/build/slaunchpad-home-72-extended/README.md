# slaunchpad-home-72-extended — offline-only extended-capabilities build project ([72])

A **derived variant** of [`slaunchpad-home-real-derived`](../slaunchpad-home-real-derived/)
(same pinned source: Slaunchpad Homepage Figma root `245:2`, revision
`2417494580183108397`, committed #18 live-read evidence, 337 nodes, 12 sections),
materialized to prove the [#72] generalized native Page Builder handlers end to end
offline.

## Differences from the canonical real-derived project

| File | Delta |
| --- | --- |
| `semantic-projection.json` | keeps the committed 11 assignments byte-verbatim; adds the [72] recorded decisions: 8 header-band roles (FeaturedCollections / FeaturedProducts / Lookbook / EditorialMosaic section headers; W-D draft, node-id-cited reasons), 1 `products-grid` decision (FeaturedProducts container `254:71`), and the CampaignEditorial two-column slot decisions (`299:301` / `299:302`). **No `slide` roles**: carousel intent is not decidable from NodeIR geometry — the slider capability ships tested but composes nothing on this source. |
| `content-manifest.json` | keeps the committed 7 entries byte-verbatim; appends 8 text entries whose text equals the committed NodeIR node names verbatim (the R56 honesty lock — placeholder band labels are observed instance names like "OVERLINE" / "Section Title", **NOT final copy**). |
| `build-config.json` | `cmsInstall` targets the isolated QA store only: identifier `det-qa-72-home`, storeId **5** (`det_preview`) — never store 0, never the store default homepage. |
| `source-identity.json` | **deliberately absent**: this project is offline-only. The one-click Studio Build flow binds to exactly ONE canonical source identity (`slaunchpad-home-real-derived`); a derived variant must never claim the same one-click binding. Do not add a source-identity here. |
| everything else | byte-identical copies of the canonical project's pinned inputs (`snapshot-project/`, `tools/`, `profile.json`, `capability-registry.json`). |

## Expected composition (the [72] AFTER state, C72-corrected)

5 of 12 sections compose through legacy + #72 handlers (hero banner, BrandStatement text-band,
CampaignEditorial + Craftsmanship two-columns, Newsletter text-band); the other 7 carry
explicit honest-skip records (Lookbook hotspot/widget domain, Newsletter form GAP,
ProductSpotlight double-CTA banner limit, BrandStatement/ThePeople/FeaturedCollections mixed
shapes without a dedicated composer, and — since the **C72 correction** — FeaturedProducts:
its recorded `products-grid` decision carries no category_ids/sku selection binding, and the
native catalog-widget directive is a REAL executable storefront listing, so it composes ONLY
from a recorded selection — 19 markers: row×5, banner×1, text×2, column-group×2,
column-line×2, column×4, image×3). See `docs/evidence/issue-72/source/mapping-table.md`
and the C72 section of `docs/evidence/issue-72/integrator-receipt.md`.

## Run

```bash
pnpm run build:core
node bin/det.js build \
  --config resources/examples/build/slaunchpad-home-72-extended/build-config.json \
  --out /tmp/det72-after --json
```

The generated `install-homepage.php` addresses ONLY the isolated `det_preview` store 5 and
is executed by an operator following `scripts/proof/issue72/README.md` — never the
store-0 demo target.
