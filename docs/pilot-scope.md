# Pilot scope confirmation (feeds issue #2)

> Bounded scope for the V1 pilot, prepared by issue [#1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) for execution under issue [#2](https://github.com/thanhle74/design-engineering-toolkit/issues/2). This document is the **"pilot scope confirmed"** item of #1's definition of ready. It commits #1 to contracts and audit inputs; it does **not** authorize any Figma write — #2's own gates still apply.

## Pilot objective (one sentence)

Prove the toolkit can take an audited Figma style guide and compose **one responsive, fully editable page** in a **fresh, approved** Figma file, passing all five gates with an evidence receipt.

## Confirmed scope

| Item | Decision | Basis |
|---|---|---|
| Source of truth | `-SECOMM--LAUNCHPAD_FASHION` (`eVxx3KKeZnS81cOAU09ytg`), scopes: Library `1:3`, Icons `3:2`, Master Components `1:4`, Home page `121:14313` | Read-only audit complete: [source-audit/secomm-launchpad-fashion.md](source-audit/secomm-launchpad-fashion.md) |
| Profile | `luxury-editorial` (example in [`resources/profiles/`](../resources/profiles/)) | Matches the source's brand-first editorial direction |
| Destination | **Fresh dedicated Figma Design file** — created only after the recorded human GO | #2's user direction + [safety-and-scope.md](safety-and-scope.md) §1.3; the PL file (`vNPtfBRpYM3PsExirVqhmt`) is **not** reused and stays untouched as archive/reference |
| Pages in destination | `01 — Foundation` (token mirror) + `02 — Homepage (responsive)` at 1440 and 390 | Bounded to one page per the pilot objective |
| Page composition | Announcement bar → header (`header-branding` instance) → editorial hero (per source draft `171:4144` pattern: media + filter + eyebrow/copy/CTA) → collection story → curated product moment → newsletter. **All UI as audited component instances; all text native and editable.** | Source provides hero + component vocabulary; the sections below the hero are pilot design work under the profile aesthetic — the source Home page is a **hero-only draft** (lower ~4,350 px verified empty, no mobile frame) and must not be treated as a page to copy |
| Component set in play | `button`, `header-branding`, `announcement-bar`, plus the `hero-editorial` composition pattern; icons only from `icon-fill`/`icon-outline` after license confirmation | [resources/examples/components.secomm-fashion.example.json](../resources/examples/components.secomm-fashion.example.json) |
| Tokens | Semantic roles from the audit (Display/Heading/Body/Eyebrow/Price; serif+sans pairing); **all `illustrative` values must be re-extracted via `get_design_context` and become `observed`/`derived` before S4** | Gate G1 allows zero illustrative entries at composition |
| Mobile | 390 frame required; 768 optional stretch | Profile breakpoints `[1440, 390]` |
| Visual QA | Side-by-side source vs destination screenshots (hero region + full page), gate table G1–G5, deviations & limitations documented | [quality-gates.md](quality-gates.md) |

## Preconditions #2 inherits (all currently open)

1. **PR review of this architecture** — #2 starts only from approved contracts (its stated dependency on #1).
2. **Destination GO** — human approval naming the team/space for the new file; recorded in the profile's `approvalRef` before `create_new_file`.
3. **License confirmations** — fonts (exact serif family + UI sans) and icon set provenance must reach `confirmed`; photography license confirmed or replaced with licensed equivalents.
4. **Token extraction** — one `get_design_context` pass over Library typography/color artwork and the Home page draft to replace `illustrative` values.

## Explicitly out of pilot scope

Second profile execution (commerce-promotional stays an example until P3), multi-page sites, dark mode (source evidences light only), Magento/Hyvä/Page Builder anything, modifying the SECOMM source or PL archive, and any production system.

## Handoff checklist (what #2 owes back)

- [ ] Destination file link + approval ref recorded
- [ ] `design-tokens` / `component-defs` re-issued with observed values (no `illustrative`)
- [ ] Gate table G1–G5 with measured values in the evidence receipt
- [ ] Source↔destination screenshot comparisons (hero + full page, 1440 + 390)
- [ ] Deviation & limitation log; single Owner acceptance request (no self-signoff)
