# Quality gates

Measurable gates for the V1 pipeline ([docs/ARCHITECTURE.md](ARCHITECTURE.md) §7). Every gate names **what is measured, how, the default threshold, the evidence artifact, and what happens on failure**. Profiles may tighten thresholds; loosening them fails S0 Preflight.

Gate results are reported as a table in the S5 evidence receipt with measured values — never as prose claims like "looks consistent with the source".

## G1 — Source fidelity

| | |
|---|---|
| **Question** | Does the output contain only what the audited sources justify? |
| **Measured** | % of contract entries (tokens, components, icon sets) carrying a `sourceRef` that resolves to a real node in an in-scope audited source; count of brand assets (colors, fonts, logos, imagery) with no source provenance. |
| **Method** | Cross-check of `design-tokens` + `component-defs` against `source-manifest` (scriptable set intersection in P1); manual spot-check of 10 random entries against live Figma in the pilot. |
| **Threshold** | **100%** traceable; **0** invented brand assets. (No tolerance: fabrication is qualitative, not a ratio.) |
| **Evidence** | Fidelity report listing every contract entry → source node pair. |
| **On failure** | Entry is removed or its provenance is corrected. An `illustrative`-class token reaching S4 is an automatic failure. |

## G2 — Editability

| | |
|---|---|
| **Question** | Is the composed Figma page genuinely editable by a designer? |
| **Measured** | % of text layers that are native Figma text (not outlined/vectorized/imagery); % of placed UI that is live component instances (not detached groups); variants selectable via the variant picker. |
| **Method** | Destination-side metadata inspection (`get_metadata`/node inspection via `use_figma` read queries): text nodes counted vs text-bearing content; instance vs frame counts. |
| **Threshold** | **100%** native text; **100%** instances where a source component exists; ≥ 1 working variant switch demonstrated per composed component. |
| **Evidence** | Editability report + a screenshot of the Figma layers/variants panel showing live instances. |
| **On failure** | S4 re-runs for the offending elements. |

## G3 — Reuse

| | |
|---|---|
| **Question** | Is the page composed from the audited system rather than redrawn one-offs? |
| **Measured** | Instance ratio = placed UI elements that are instances of `component-defs` components ÷ all placed UI elements. One-off vectors and ad-hoc shapes count against it. Icons must come from the audited icon sets (any other glyph is a one-off). |
| **Method** | Layer inventory of the destination page, classified against `component-defs`. |
| **Threshold** | **≥ 80%** default (profiles raise it; `luxury-editorial` example sets 0.85). |
| **Evidence** | Reuse report: instance census + list of every non-instance element with a reason (allowed: media fills, fixture content blocks not modeled in source). |
| **On failure** | Redraw offenders as instances, or (if a genuine system gap) add the component to `component-defs` with full provenance and re-run. |

## G4 — Accessibility & responsiveness

| | |
|---|---|
| **Question** | Is it readable and correct at every declared breakpoint? |
| **Measured** | (a) WCAG contrast for every `contrastPairs` declaration in `design-tokens`; (b) rendered frames exist and contain no overflowing/clipped content at each profile breakpoint; (c) touch targets ≥ 44px on mobile-composed controls (spot-check). |
| **Method** | (a) computed from token values (scriptable in P1 — tokens carry both hex values via aliases); (b) `get_screenshot` of each breakpoint frame + layout inspection; (c) spot-check of interactive instances. |
| **Threshold** | **AA** (4.5:1 body, 3:1 large text) for (a); **0** overflow/clipping defects at declared breakpoints for (b); no observed sub-44px touch target for (c). |
| **Evidence** | Contrast table per pair; screenshot pair per breakpoint; defect list. |
| **On failure** | Token value or composition fixed before receipt; a knowingly-shipped AA failure must be an explicit, documented waiver by the human reviewer. |

## G5 — Provenance & licensing

| | |
|---|---|
| **Question** | Is every external thing legal and traceable? |
| **Measured** | % of composed assets (fonts, imagery, icons, logos) with `licenseStatus = confirmed` in `source-manifest.contentProvenance` + profile `content.licensing`; count of content elements violating the profile's `fixturePolicy`. |
| **Method** | Manifest sweep before S4; nothing composes with `unconfirmed`/`incompatible` status. |
| **Threshold** | **100%** confirmed or `not-applicable`; **0** fixture-policy violations (fake prices/claims/reviews/countdowns are always violations). |
| **Evidence** | Provenance table in the receipt, with license references. |
| **On failure** | Asset replaced (e.g. licensed equivalent font) or dropped. `incompatible` blocks composition outright. |

## Reporting rules

- Every measured gate reports **measured value, threshold, pass/fail/waived**. Waivers name the human who granted them and where.
- The S5 evidence receipt fails as a whole if any gate is unreported — silence is failure, not success.
- Gates run against the **destination file as it exists at receipt time**; later manual edits by humans are out of scope for gate accounting (note them in the receipt instead).
