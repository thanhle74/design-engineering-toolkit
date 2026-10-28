# Source audit — `-SECOMM--LAUNCHPAD_FASHION`

> **Read-only audit**, performed 2026-10-27 for issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) using Figma MCP tools `get_metadata`, `search_design_system`, `get_screenshot`. **No node, page, or file was modified.**
> File: https://www.figma.com/design/eVxx3KKeZnS81cOAU09ytg/-SECOMM--LAUNCHPAD_FASHION (`fileKey: eVxx3KKeZnS81cOAU09ytg`)

## Headline findings

1. **The file contains zero Figma variables and zero Figma styles.** `search_design_system` for variables (`color`, `spacing`, `typography`) and styles (`color`, `text`) returned empty across the file. Everything on the "Library" page is **documentation artwork** — tokens must be *derived and normalized*, never harvested. This is the single most architecture-shaping fact about this source.
2. **Components are real and variant-rich** — 23 component groups, ≈ 1,400 variant definitions on `Master Components` — but variant naming is inconsistent across groups and needs normalization.
3. **Icons are systematic and reusable** — 2,300 symbols across fill/outline sets, ~96 glyphs × 5 sizes, heroicons-style naming.
4. **The `Home page` is a partial draft** — a 1440×6398 frame whose content occupies only the top ≈ 2,048 px (hero + announcement bar + header); the lower ≈ 4,350 px is empty (screenshot-verified) and there is no mobile frame. It is context, not a complete page reference.
5. Color "themes" exist as *component variants* (`Style = light/dark` swatch tiles), not as variable modes — light/dark support in contracts is aspirational until real modes are authored.

## Page inventory

| Page | ID | Class | Evidence |
|---|---|---|---|
| Cover | `0:1` | IGNORE | Cover artwork |
| Getting started | `1:5` | IGNORE | Empty canvas (no nodes) |
| `---` | `1:2` | IGNORE | Separator |
| **Library** | `1:3` | **NORMALIZE** | See §Library |
| **Icons** | `3:2` | **REUSE** | See §Icons |
| **Master Components** | `1:4` | **REUSE + NORMALIZE** | See §Master Components |
| Page 7 | `3:3` | IGNORE | Empty canvas |
| `---` | `3:4` | IGNORE | Separator |
| Sketch | `3:5` | REFERENCE_ONLY | Exploratory drafts (see §Sketch) |
| Home page | `121:14313` | REFERENCE_ONLY | Partial draft (see §Home page) |

## Library (`1:3`) — NORMALIZE

Statistics: 505 frames, 488 text nodes, 2 component symbols, 11 instances.

| Group | ID | What it actually is |
|---|---|---|
| `Color tittle` | `14:846` | A swatch **component** with variants `Style = light` (`14:778`) / `Style = dark` (`14:847`) — a demonstration tile, not a color style or variable |
| `Color shade` | `14:845` | 11 instances of the swatch component in a row — a shade ramp drawn for humans |
| Typography artwork | `181:10085` (frame `Frame 25`, 5258×2512; detail frame `181:10089`) | Spec sheet of 488 text nodes documenting the type system (see below) |

**Typography system documented by the artwork** (visual read of `181:10089`, exact family/size values to be extracted via `get_design_context` in the pilot):

- **Font pairing:** serif for Display/Heading roles, sans-serif for Price/Body/Label/Eyebrow (spec labels suggest "Open Sans"; **unconfirmed** — see Open question 2 in ARCHITECTURE.md).
- **Roles:** `Display xl/lg/md/sm` · `Heading H1–H4` · `Price lg/md/sm` · `Body lg/md/sm` · `Label lg/md/sm` · `Eyebrow` (+ medium/semibold) · `Caption`.
- **Weights:** regular / medium / semibold / bold. **Scales:** font size (xs→3xl), letter spacing, line height documented per role.

Diagnostics: `NO_FIGMA_VARIABLES`, `NO_FIGMA_STYLES`, `SOURCE_DATA_ARTWORK_ONLY`.

## Icons (`3:2`) — REUSE

Two top-level `Fill Icon Sets` frames containing:

| Set | Symbols | Structure |
|---|---|---|
| `fill-icon` | 1,155 | ~96 glyphs × sizes **12 / 16 / 24 / 32 / 40**, alphabetical groups (`A-B` … `U-V-W-X-Z`) |
| `outline-icon` | 1,145 | same structure |

- Glyph naming: kebab-case + style suffix (`academic-cap-fill`, `zoom-out-outline`) — consistent with **Heroicons** naming; 93 fill + 96 outline unique glyph names. **License unconfirmed** (`LICENSE_UNCONFIRMED`) — matches ARCHITECTURE.md open question 1.
- One minor irregularity: occasional variant-name spacing variants (`Size = 16,Direction= Down` vs `Size = 16, Direction= Down`) — cosmetic, `VARIANT_NAMING_INCONSISTENT` (info-level for icons).

## Master Components (`1:4`) — REUSE + NORMALIZE

23 component groups, ≈ 1,400 variant symbols. Genuine component sets with real variant properties:

| Group | ID | Variants | Properties observed |
|---|---|---|---|
| `button` | `85:7475` | 375 | `Hierarchy` × `State` × `Style` × `Size` |
| `button/base` | `76:6885` | 25 | `Style` × `Size` |
| `Input field` | `115:1827` | 600 | `Type` × `State` × `Feedback` × `Label` × `Leading icon` × `Trailing icon` × `Hint text` |
| `Checkbox` | `97:2044` | 72 | `Size` × `State` × `Checked` × `Text` |
| `Radiobutton` | `97:1611` | 72 | `Size` × `State` × `Checked` × `Text` |
| `Base/_CheckRadio` | `97:2477` | 72 | `Type` × `Size` × `Checked` × `State` |
| `Base/_Input field {base}` | `107:2916` | 16 | `Type` × `Feedback` |
| `Base/_Textarea input field {base}` | `107:3354` | 4 | `Feedback` |
| `Navigation Action` | `127:2783` | 28 | `active` × `icon` × `tag` × `label` × `theme` |
| `Navigation Item` | `122:2285` | 4 | `active` × `mode` |
| `Dropdown Menu` | `122:2298` | 8 | `Active` × `mode` × `media` |
| `Language` | `122:2327` | 4 | `Language` × `Theme` |
| `Status bar - iPhone` | `124:2428` | 2 | `Theme` |
| `Home Indicator` | `124:2449` | 4 | `Device` × `Orientation` |
| `Safari` | `124:2458` | 8 | `Type` × `Position` × `Orientation` × `Scrolled` |
| `Logo` | `127:2582` | 2 | `Theme` |
| `Brand Header` | `127:3547` | 2 | `theme` |
| `Main Navigation` | `127:3709` | 2 | `theme` |
| `Search Navigation` | `127:3740` | 2 | `theme` |
| `Header` | `127:3840` | 2 | `theme` |
| `Header/Branding` | `169:3282` | 4 | `Theme` × `BG` |
| `Announcement Bar` | `171:4129` | 2 | `Theme` |
| `Legacy/Input with Label` | `120:13999` | 2 | `Orientation` |

**Normalization requirements (all `NORMALIZE`-class within REUSE pages):**

- **Theme property chaos:** `theme`, `Theme`, and value casing differ across groups (`theme = light` vs `Theme = light`). The contract's `props` records names *as observed* plus a normalized toolkit `id`, with `VARIANT_NAMING_INCONSISTENT` diagnostics.
- **Duplicate groups:** `button` vs `button/base` (foundation vs full matrix), `Base/_CheckRadio` vs `Checkbox`/`Radiobutton` (shared base vs specialized). Contract resolves via component `aliases` — `button` lists `button/base`; base groups are excluded from composition.
- **Legacy group:** `Legacy/Input with Label` — excluded from composition, diagnosed `LEGACY_GROUP_PRESENT`.
- **Mobile chrome components** (`Status bar`, `Safari`, `Home Indicator`) are device mockup chrome — tracked, but composed pages use them only if the profile asks for device-framed presentation.

Diagnostics: `VARIANT_NAMING_INCONSISTENT`, `DUPLICATE_COMPONENT_GROUPS`, `LEGACY_GROUP_PRESENT`.

## Sketch (`3:5`) — REFERENCE_ONLY

Exploratory drafts: `Branding` ×3 (`32:560`, `53:4638`, `8:412`), `Promotion` ×2 (`3:7`, `53:2714`), `Desktop - 1` (`32:519`). 1,253 frames / 576 texts / 60 instances / **0 symbols** — flat illustration work, no system. Useful only as aesthetic context.

## Home page (`121:14313`) — REFERENCE_ONLY

Single desktop frame `Homepage` (`171:4144`, 1440×6398) verified by screenshot:

- **Present:** `Safari web bar` instance (`171:4148`), `Header/Branding` instance (`171:4147`), hero image + filter (`171:4145`), content block (`171:5597`: eyebrow text `171:5598`, body text `171:5599`, `button` instance `171:5600`), one empty 1440×1024 placeholder frame (`171:4558`).
- **Absent:** everything below y ≈ 2,048 — the remaining ≈ 4,350 px of the frame is empty, and **no mobile (390) frame exists**.

Consequence for the pilot (issue #2): the source provides a hero direction and component vocabulary, **not** a page to copy. Composing the remaining sections is the pilot's design work under the profile's aesthetic direction. Diagnostics: `SOURCE_PAGE_PARTIAL`.

## Content provenance (initial)

| Asset | Where | License status |
|---|---|---|
| Fashion photography (hero imagery) | Home page hero, Library samples | **unconfirmed** — first-party or stock? must be resolved before composition |
| Icon glyphs (`fill`/`outline` sets) | Icons page | **unconfirmed** — naming matches Heroicons (MIT) but provenance unverified |
| Typefaces (serif display + sans) | Library artwork | **unconfirmed** — exact families not yet extracted |
| Copy ("SCENES FROM FALL", …) | Home page | first-party demo copy; reusable as fixture per profile policy |

## Reproducibility

Audited via official Figma MCP in read-only mode: `get_metadata` (pages `1:3`, `1:4`, `3:2`, `3:3`, `3:5`, `1:5`, `121:14313`), `search_design_system` (variables/styles probes), `get_screenshot` (`171:4144`, `181:10089`). Counts derive from the metadata XML (node-type tallies), not visual estimation. Re-running the same queries should reproduce this manifest modulo file edits by the design team; the manifest records `accessedAt` as the pin (ARCHITECTURE.md open question 4).
