# Pilot Plan — clean Figma workspace → responsive editable design

[issue #2][i2] steps 2–5. Status: **BUILT 2026-10-27 after an in-session Owner go** — see
"Verification status" and "Approval gate" below.

**This was a manual design proof, not a pipeline run.** The build was executed interactively
(agent-driven Figma sessions), not by an automated S0–S5 toolkit pipeline. It is **not** evidence that
the [PR #3][i3] architecture (`docs/ARCHITECTURE.md`, **merged 2026-10-28 — this plan was written while it was DRAFT/unmerged**; P1 orchestrator + ajv validation
not yet implemented) drives automated execution — that remains [issue #1][i1] scope after contract review.

[i1]: https://github.com/thanhle74/design-engineering-toolkit/issues/1
[i2]: https://github.com/thanhle74/design-engineering-toolkit/issues/2
[i3]: https://github.com/thanhle74/design-engineering-toolkit/pull/3

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
4. QA loop: `get_screenshot` both pages → side-by-side vs `docs/evidence/ref-pl-homepage-*.png` and style-guide hero → fix diffs (layout/spacing/type/media) until within tolerance.
5. Evidence receipt (below) + PR with updated docs. **No self-declared design signoff** — Owner acceptance requested exactly once.

## Evidence receipt (to be filled after build)

| Item | Value |
|---|---|
| Source style guide | `eVxx3KKeZnS81cOAU09ytg` (pages `1:3`, `3:2`, `1:4`, `121:14313`) |
| PL archive (verified intact 2026-10-27, re-verified post-build) | `vNPtfBRpYM3PsExirVqhmt` — six pages (`35:2`, `152:44`–`152:48`), untouched, zero writes |
| Reference screenshots | `pilot/docs/evidence/ref-pl-homepage-desktop.png`, `ref-pl-homepage-mobile.png` |
| New target file | **`kFTfnFix9N6MUd1ojiRgkR`** — "SLAUNCH — V1 Pilot (Toolkit)", SECOMM team, created 2026-10-27 after explicit go. https://www.figma.com/design/kFTfnFix9N6MUd1ojiRgkR |
| Component/instance IDs | Components: `button` set `6:32`, `Announcement Bar` `9:6`, `Input Field` `9:7`, `Product Card` `9:9`, `Category Tile` `9:13`, `Header/Branding` set `10:68`. Pages: Cover `0:1`, Foundation `1:2`, Components `1:3`, Desktop `1:4` (frame `18:2`, hero image `18:4`), Mobile `1:5` (frame `22:2`, hero image `22:4`). Board IDs: color `15:2`, spacing `15:74`, typography `15:121`. Full ledger: token/component IDs in `pilot/state-slaunch-v1-pilot.json` |
| Variant verification | `button` 15 variants (Hierarchy × State, Default state used on pages); `Header/Branding` 2 variants — `Theme=dark,BG=transparent` `10:2` (desktop hero overlay) + `Theme=light,BG=white` `10:35`; `Announcement Bar` dark/light; all page content = instances with text overrides (tiles `18:49/55/61`, cards `18:75/79/83/87`; mobile tiles `22:30/36/42`, cards `22:56/60/64/68`) — no flattened screenshots |
| QA evidence | `pilot/docs/evidence/qa-homepage-desktop-final.png` (pass), `qa-homepage-mobile-final.png` (pass after fix), `qa-components.png`. Mobile fix: 9 copy blocks were auto-width and clipped at 390 → clamped to 342px + `HEIGHT` auto-resize (`22:23`, `22:28`, `22:76`, `22:81`, `22:82`, `22:87`, `22:90`, `22:95`, `22:118`); post-fix sweep found zero overflowing texts |
| Deviations & limitations | (1) All page copy beyond PL's verbatim strings is **authored sample content**: announcement text, product names/prices ("Wool tailored coat € 890"…), tile subtitles, editorial meta, legal lines — flagged for Owner review. (2) Button set trimmed to Hierarchy × State (Style=Label, Size=S/M used) — full 4-axis matrix not rebuilt. (3) Open Sans **Medium unavailable** in the file's fonts → `label/*` styles use Regular (weight diff vs source). (4) Derived tokens added where source bindings were unobservable headlessly: `hairline/100`, `muted/100`, `spacing/md`, `spacing/xl`, `spacing/8xl`. (5) PL reference brand ("MAISON / FORM", cream/olive) replaced by style-guide identity (SLAUNCH ink/white, Merriweather+Open Sans); PL contributes structure + verbatim strings only. (6) Imagery: hero photo reused as-is from source `171:4146` (**license UNKNOWN** — flagged in source audit); all other imagery = `mist` placeholder rects + disclaimer caption, no new external assets. (7) Footer is simple stacked columns, not the PL accordion rows (accordion = prototype interaction, out of V1 static scope). |

| Verification status (G1–G5) | **NOT measured to gate definitions** — see "Verification status" below |

## Verification status (2026-10-28, post Coordinator review)

Status classes: **BUILT** (exists, IDs recorded) · **VERIFIED** (measured by the gate's own method) ·
**NOT_VERIFIED** (not measured — never inferred from screenshots) · **BLOCKED/CONDITIONAL**.
Gates referenced from [PR #3 `docs/quality-gates.md`][i3] (merged 2026-10-28; thresholds were pending contract review when this plan was written).

| Gate | Status | Basis |
|---|---|---|
| G1 Source fidelity | **NOT_VERIFIED** | Gate method (contract↔manifest fidelity report, set intersection) never run; the audit tables + node-ID ledger exist but no per-entry cross-check artifact was produced. |
| G2 Editability | **NOT_VERIFIED (as measured)** | Qualitative evidence only: all composed text is native TEXT layers; sections are instances (Header `10:2`, tiles, cards, buttons); both header variants exist. No % census or layers-panel artifact per the gate method. |
| G3 Reuse | **NOT_VERIFIED** | Instance-ratio census never computed (luxury-editorial example threshold 0.85 unmeasured). |
| G4 Accessibility & responsiveness | **PARTIAL → NOT_VERIFIED overall** | Clause (b) overflow: mobile clipping defect found, fixed (9 texts clamped to 342px), post-fix sweep = 0 overflowing texts, screenshots at both declared breakpoints — matches the gate's screenshot+inspection method. Clauses (a) WCAG contrast table and (c) 44px touch-target spot-check: **NOT_VERIFIED**. |
| G5 Provenance & licensing | **BLOCKED/CONDITIONAL** | Hero photo `171:4146` licenseStatus **UNKNOWN** (reused as-is from source — a first-party fill is not proof of licensed reuse); authored product names/prices/subtitles are fixture content. 100%-confirmed threshold unmet → output is **demo-only; carries no production claims**. |

**Summary: the pilot is BUILT with composition and breakpoint overflow visually verified; G1–G3 and G4(a)(c) are NOT_VERIFIED; G5 is BLOCKED until licensing is confirmed.** A measured gate run is a separate, future activity (pipeline scope, issue #1 / PR #3).

## Approval gate (per issue #2, required before any Figma write)

- [x] Owner approves creating the new file (name, team/workspace). — given **in-session 2026-10-27** via structured prompt ("Go — build pilot now"; file on SECOMM team). **Approval evidence not captured as a GitHub record** — the profile example's `approvalRef` remains `null`; this note is the only record.
- [x] Owner confirms #1 contracts dependency is waived **or** waits for reviewed contracts. — waived in-session to run the manual pilot; the automated pipeline still requires reviewed contracts (issue #1 / PR #3).
- [x] Sources remain read-only regardless of decision. — held: zero writes; PL archive verified six pages twice (pre- and post-build).

## Non-goals honored

No deletion/edits in PL or the style guide · no Magento/Hyvä/Page Builder code · no production data · no touching the local Slaunchpad checkout · Slaunchpad #40/PR #41 untouched.
