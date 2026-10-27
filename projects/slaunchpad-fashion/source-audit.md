# Source Audit — SECOMM LAUNCHPAD FASHION + PL draft

Read-only audit for [issue #2][i2] step 1, classified per [issue #1][i1] requirement 3
(`REUSE / NORMALIZE / REFERENCE_ONLY / UNKNOWN`). Audit date: **2026-10-27**.

[i1]: https://github.com/thanhle74/design-engineering-toolkit/issues/1
[i2]: https://github.com/thanhle74/design-engineering-toolkit/issues/2

## File: style guide `eVxx3KKeZnS81cOAU09ytg`

Pages: Cover · Getting started · `---` · **Library `1:3`** · **Icons `3:2`** · **Master Components `1:4`** · Page 7 · `---` · Sketch · **Home page `121:14313`**

### Genuine Figma variables (verified via component bindings — `get_design_context`)

The file binds **named variables** in components; these are real tokens, not demonstration swatches.

**Typography variables** (font family + size + line-height + letter-spacing + weight per role):

| Variable root | Resolved values seen | Bound to |
|---|---|---|
| `heading/h1` | Merriweather SemiBold 600 · 40px · lh 48 · ls −1px | Hero headline `171:5598` |
| `heading/h4` | Merriweather Regular 400 · 20px · lh 28 · ls −1px | Hero subcopy `171:5599` |
| `label/lg` | Open Sans Medium 500 · 16px · lh 24 · ls 0 | Button label `76:6870` |
| `label/md` | Open Sans Medium 500 · 14px · lh 20 · ls 0 | Nav items, header labels |
| `other/caption` | Open Sans Medium 500 · 12px · lh 16 | Announcement bar text |
| `other/overline/sm` | Open Sans Regular 400 · 10px · lh 16 · ls 1px | "NEW" tag `127:3040` |

**Color / surface / action variables:**

| Variable | Resolved | Used by |
|---|---|---|
| `surface/inverse` | `#10141c` | Announcement bar (dark) `124:2551` |
| `text/primary` | `#f3f5f8` | Hero copy on dark |
| `text/inverse` | `white` | Button label on secondary, announcement text |
| `action/secondary/background-default` | `white` | Secondary button bg |
| `action/secondary/border-default` | `white` | Secondary button border |

**Spacing variables:** `spacing/zero` 0 · `3xs` 2 · `2xs` 4 · `sm` 8 · `2xl` 16 · `6xl` 40 (px). Larger sizes inferred to exist (Library shows a scale board) but **not yet bound** in audited nodes — see diagnostics.

> Full variable collection enumeration was not possible headlessly (`get_variable_defs` requires an interactive desktop selection). The table above is **evidence-backed from live bindings**, which satisfies "genuine, not demonstration". Remaining unbound values must be confirmed at build time via instance overrides.

### Library `1:3` — mostly demonstration boards

- Font specimens (`181:8470`+): **Merriweather** (serif) + **Open Sans** (sans); weights regular/medium/semibold/bold; sizes 12–72px; "Display xl", "Heading 1–4" rows. These frames are **specimens** — classification REFERENCE_ONLY (documentation), *except* where values match the bound variables above (REUSE).
- Color title/shade boards (`14:846`, `14:845`): REFERENCE_ONLY demonstration swatches. Do **not** transcribe as tokens — genuine tokens come from the variables table.

### Icons `3:2` — Heroicons, 2300 component symbols

- Two sets: `fill-icon 73:547`, `outline-icon 73:3621`; ~460 base icons × sizes 12/16/24/32/40 (+ directional chevrons).
- Naming matches **Heroicons** (`academic-cap`, `adjustments`, …) → MIT license, provenance safe.
- Classification: **REUSE** (instances) — pilot uses outline set at 16px (header) and directional chevrons. Header icons observed: `chevron-outline` (`170:3620`), `user-outline` (`167:3174`), `search-outline`, `shopping-cart-outline`.

### Master Components `1:4` — component sets (REUSE)

| Set (frame id) | Variant axes observed |
|---|---|
| `button` `85:7475` | Hierarchy: Primary/Secondary/Tertiary × State: Default/Hover/Focused/Pressed/Disabled × Style: Label/Leading/Trailing/Icon(Square/Round) × Size: XS–XL |
| `button/base` `76:6885` | Style × Size (base layer feeding the set) |
| `Header/Branding` `169:3282` | Theme: dark/light × BG: transparent/black/White — includes announcement bar + brand header + nav + user actions |
| `Announcement Bar` `171:4129` | Theme: dark/light |
| `Navigation Item` `122:2285`, `127:2869` | active × mode(light/dark); icon none/leading/trailing/only × tag × label × theme |
| `Main Navigation` `127:3709` | theme: light/dark |
| `Search Navigation` `127:3740` | theme: light/dark |
| `Input field` `115:1827` | Type × State (Placeholder/Hover/Active/Filled/Focus/Disabled) × Feedback (None/Error/Warning/Success) × Label × Leading/Trailing icon × Hint text |
| `Base/_Input field {base}` `107:2916`, `_Textarea` `107:3354` | Type × Feedback |
| `Radiobutton` `97:1611`, `Checkbox` `97:2044`, `Base/_CheckRadio` `97:2477` | (states) |
| `Dropdown Menu` `122:2327`, `Language` `122:2327` | (dropdown/language switch) |
| `Logo` `127:2582` | Slaunch logotype (`SLAUNCH LOGO` `127:2572`) |
| `Safari` `124:2458`, `Status bar - iPhone` `124:2428`, `Home Indicator` `124:2449` | Browser/device chrome |
| `Legacy/Input with Label` `120:13999` | Legacy — **NORMALIZE candidate, not reused** |

### Home page `121:14313` — hero-only reference

`Homepage` frame `171:4144` (1440×6398, **content ends ≈y2048; rest empty**): Safari bar `171:4148` → Header/Branding `171:4147` (Theme=dark, BG=transparent, announcement+nav) → Hero `171:4145` (image fill `171:4146` + dark filter `171:4588`) → Content `171:5597` (h1 + h4 + secondary button `171:5600` "SHOP NOW").
Off-canvas `Content 171:4582` (600w) — alternate copy block, REFERENCE_ONLY.

### UNKNOWN / diagnostics

1. **Hero photo license unverified** (`171:4146` fill, two-models campaign photo). Reuse only as-is from source file; do not redistribute. No new photos introduced.
2. Full variable collections (remaining spacing steps, full color ramps) not enumerable headlessly — fill gaps at build time from live bindings.
3. `Page 7` / `Sketch` pages not audited (out of pilot scope).
4. Button component set parent id for the hero instance resolves to `85:9962` (base slot) — instance↔set mapping to be recorded in the pilot manifest at build time.

## File: PL draft `vNPtfBRpYM3PsExirVqhmt` (ARCHIVE — verified intact)

Six pages present, matching issue #2 exactly: `35:2` Homepage V1 · Luxury Fashion (LC + FC) · `152:44` 01 Foundation · `152:45` 02 Components · `152:46` 03 Brand Homepage · `152:47` 04 Promo Homepage · `152:48` 05 States & Handoff. **No writes performed.**

Page `35:2` is the full responsive reference:

- **Desktop `37:2`** 1440×3830: announcement bar → nav → hero split (copy left / media right) → collection heading → 3 category tiles (416×552) → product rail (4× 294×392 cards, instances of `37:91` "Luxury / Product card · Hyvä mapping") → editorial split → brand editorial text → newsletter (input+submit) → footer.
- **Mobile `38:30`** 390×3850: compact header w/ hamburger → hero media + stacked copy → category carousel (260w cards + indicators) → product carousel (294w cards) → editorial stack → quote → newsletter stacked → accordion-style footer.
- **Important**: reference frames are mostly **raw text/rectangle placeholders** ("CMS eyebrow", "Sample brand logotype"), *not* style-guide component instances (only product cards are). Classification: **REFERENCE_ONLY** — layout/spacing/responsive behavior is the reference; components come from the style guide.

## Reuse summary for the pilot

| Pilot need | Source | Class |
|---|---|---|
| Typography scale | `heading/*`, `label/*`, `other/*` variables | REUSE (bind variables) |
| Colors | `surface/inverse`, `text/primary`, `text/inverse`, `action/secondary/*` | REUSE |
| Spacing | `spacing/*` variables | REUSE |
| Button | `button` set `85:7475` | REUSE (instances) |
| Header + announcement | `Header/Branding 169:3282`, `Announcement Bar 171:4129` | REUSE (instances) |
| Icons | Heroicons outline/fill sets `3:2` | REUSE (instances) |
| Logo | `Logo 127:2582` | REUSE |
| Input field | `115:1827` set | REUSE (newsletter) — limited variants needed |
| Homepage layout / responsive behavior | PL `37:2` + `38:30` | REFERENCE_ONLY (rebuild with real components) |
| Library color/typography boards | `1:3` specimen frames | REFERENCE_ONLY |
| `Legacy/Input with Label` | `120:13999` | NORMALIZE (excluded from pilot) |
| Hero photo license | `171:4146` | UNKNOWN (reuse-as-is only) |
