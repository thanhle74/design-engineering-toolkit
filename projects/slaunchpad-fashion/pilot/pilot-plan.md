# Pilot Plan — clean Figma workspace → responsive editable design

[issue #2][i2] steps 2–5. **Blocked on Owner go** (see "Approval gate").
Contracts dependency: [issue #1][i1] has **no reviewed contracts yet** (no PRs, no issue comments as of 2026-10-27).
This plan follows the repo README rule: research/prep ran independently; the Figma write waits for the
Owner. The Owner may waive the #1 dependency explicitly.

[i1]: https://github.com/thanhle74/design-engineering-toolkit/issues/1
[i2]: https://github.com/thanhle74/design-engineering-toolkit/issues/2

## Target file architecture (proposed)

New Figma **Design** file — suggested name: `SLAUNCH — V1 Pilot (Toolkit)` — five pages:

| # | Page | Contents |
|---|---|---|
| 1 | `00 Cover` | File title, source links (style guide + PL archive), provenance note, pilot scope |
| 2 | `01 Foundation` | Token boards **bound to real values** audited in source-audit.md: typography specimens (heading/h1…label/md…), color roles, spacing scale — rebuilt small and honest, labeled with variable names where live variables are recreated |
| 3 | `02 Components` | Local component sets rebuilt from source masters so the pilot file is self-contained: `button` (Hierarchy × State × Style × Size — trimmed to used axes: Hierarchy × State, Style=Label, Size=S/M), `Header/Branding` (dark/light × BG), `Announcement Bar`, nav item, newsletter input; Heroicons instances where needed |
| 4 | `03 Homepage — Desktop` | 1440w responsive layout: announcement bar + header (instances) → hero (image fill + dark filter + editable h1/h4/CTA) → collection heading → 3 category tiles (editable labels, image fills) → product rail (4 component cards) → editorial split → newsletter (input + button) → footer |
| 5 | `04 Homepage — Mobile` | 390w counterpart: compact header, stacked hero, category carousel, product carousel, editorial stack, newsletter, footer |

Everything on pages 4–5 is **real components + editable text layers + image fills + variant instances** — no flattened screenshots.

## Responsive contract (desktop ↔ mobile)

From reference `37:2` ↔ `38:30`: 1440→390 container; gutters 72px→24px; header collapses to hamburger; hero split→stacked media+copy; category tiles 416px→260px carousel with indicators; product grid 4-col→horizontal carousel; editorial split→stacked; newsletter inline→stacked full-width; footer 3-col→accordion rows. Type steps down per audited variables (h1 40→smaller step at mobile per reference proportions).

## Execution steps (after go)

1. Load `/figma-use` skill; `create_new_file` (Owner-approved name/team); `create_session`.
2. Rebuild Foundation boards + local component sets (`use_figma`), binding the audited token values.
3. Compose desktop page, then mobile page, from those components with editable overrides.
4. QA loop: `get_screenshot` both pages → side-by-side vs `evidence/ref-pl-homepage-*.png` and style-guide hero → fix diffs (layout/spacing/type/media) until within tolerance.
5. Evidence receipt (below) + PR with updated docs. **No self-declared design signoff** — Owner acceptance requested exactly once.

## Evidence receipt (to be filled after build)

| Item | Value |
|---|---|
| Source style guide | `eVxx3KKeZnS81cOAU09ytg` (pages `1:3`, `3:2`, `1:4`, `121:14313`) |
| PL archive (verified intact 2026-10-27) | `vNPtfBRpYM3PsExirVqhmt` — six pages, untouched |
| Reference screenshots | `pilot/evidence/ref-pl-homepage-desktop.png`, `ref-pl-homepage-mobile.png` |
| New target file | _pending go_ |
| Component/instance IDs | _pending build_ |
| Variant verification | _pending build_ |
| Deviations & limitations | _pending QA_ |

## Approval gate (per issue #2, required before any Figma write)

- [ ] Owner approves creating the new file (name, team/workspace).
- [ ] Owner confirms #1 contracts dependency is waived **or** waits for reviewed contracts.
- [ ] Sources remain read-only regardless of decision.

## Non-goals honored

No deletion/edits in PL or the style guide · no Magento/Hyvä/Page Builder code · no production data · no touching the local Slaunchpad checkout · Slaunchpad #40/PR #41 untouched.
