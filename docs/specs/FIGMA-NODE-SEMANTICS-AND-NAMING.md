# Figma Node Naming & Semantic Ownership — Two-way Design/Code Contract

**Status:** OWNER-DIRECTED SPEC · updated 2026-11-06 · **No Figma-write authority from this document**  
**Current checkpoint:** 61 approved Desktop name-only changes under Figma root 245:2 were already completed on 2026-11-03 (Coordinator handoff). **Do not rerun that pass.** New Figma writes require a separately scoped Owner GO; issue #18 is read-only.  
**Related:** [Product scope](PRODUCT-ARCHITECTURE-AND-SCOPE.md), [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5), [Issue #7](https://github.com/thanhle74/design-engineering-toolkit/issues/7).

## 1. Identity: never rename an ID

- A Figma URL `node-id=245-2` usually points to Figma API node ID `245:2`. This ID is an **opaque Figma-assigned identifier**, not a layer name and not a semantic slug. Preserve it exactly.
- `node.name` is a human-editable *label*. The goal is to standardize **labels and hierarchy**, never to reassign node IDs, reparent nodes, create/delete nodes, reshape the frame or create fake metadata inside IDs.
- To identify a revision of an approved design, record `fileKey + nodeId + sourceVersion`. A label is informative, **not a stable primary key**; labels may change and duplicates may exist.
- Keep the initial selected frame (`245:2`) and all children in the **read-only inventory**, including site header/footer, hidden layers, text, images, repeated instances, decorative shapes and unknown nodes. Not all nodes need renaming; not all belong in the Page Builder output.

## 2. Portable, *semantic* naming for newly authored Figma

Preferred human-readable format: `KIND/Role[/VariantOrContext]`, with consistent English semantic roles. This is a **convention**, not an assumption that Figma contains filesystem folders or that slash-separated layers automatically create groups. A project's actual language and naming conventions can be mapped to this canonical taxonomy.

| Kind | Meaning | Examples | Expected target responsibility |
|---|---|---|---|
| `PAGE/` | The design frame representing a page and breakpoint | `PAGE/Home/Desktop`, `PAGE/Home/Mobile` | Design root; not itself a Page Builder widget |
| `SITE/` | Shared site chrome owned by the storefront theme | `SITE/Header`, `SITE/Navigation`, `SITE/Footer` | `THEME_CHROME`; **exclude from Page Builder CMS content** |
| `SECTION/` | Independently editable editorial content section | `SECTION/Hero/Primary`, `SECTION/FeaturedCollections`, `SECTION/BrandStory` | Candidate native Page Builder or installed widget |
| `COMPONENT/` | Reusable UI design component or component set | `COMPONENT/ProductCard`, `COMPONENT/Button` | Capability lookup + component/variant/prop mapping |
| `SLOT/` | Named content/data element inside a section/component | `SLOT/Heading`, `SLOT/Media`, `SLOT/CTA` | Data/media/text slots; editability and binding evidence |
| `DECOR/` | Purely presentational artifact | `DECOR/Gradient`, `DECOR/Ornament` | Map to safe style/media, not automatically a standalone widget |

**Avoid baking `Magento`, `PageBuilder`, specific module names, file-system paths or a target's implementation technology into Figma layer names.** Design should remain portable. A section called `SECTION/ProductGrid` is not proof that a functioning product query/data provider exists. Use a separate Capability Registry to resolve target support.

**Figma component caution:** Existing published component/library names, instance links, variant axes/property names, and naming conventions may be consumed by other designs or code tooling. **Do not bulk rename those without a dependency/consumer audit and separate approval.** Standardize ordinary frame/section labels first; defer riskier shared-component renames. For new components, prefer variant properties and Figma component sets for state/size rather than an explosion of manually duplicated frames.


### Lightweight naming readiness — Owner decision 2026-11-06

This is a **small internal tool to save build time**, not a layer-naming bureaucracy. Before mapping a selected CMS section:

1. Confirm the root and meaningful PAGE / SITE / SECTION / SLOT / DECOR labels, plus the actual parent/child and column layout. Preserve source node IDs. **Do not require every text, vector, instance or decoration to be renamed.**
2. Use the existing normalized Desktop naming as-is. Treat a label as a hint; if a section is unclear, flag it succinctly and continue with supported sections, rather than launching a broad renaming exercise.
3. Rename only if the concrete mapping is blocked and the Owner separately approves the Figma-write scope. Do not repeat the 61-label Desktop pass.

**Enough to proceed:** the selected section's role, order, nesting and basic width ratios are understandable and traceable. Defer detailed styling, complete semantic cleanup of unrelated nodes and Hyvä/Tailwind matching. Follow the lean native Page Builder MVP in [Product scope §4](PRODUCT-ARCHITECTURE-AND-SCOPE.md). Existing #18 source proof and source-write boundaries remain in force.

## 3. Every selected node is inventoried; target output is filtered

The selected top-level frame provides the **scope**. A read-only extractor must recursively inventory every descendant and resolve dependencies where access permits.

**Classification is based on combined evidence** (node type, tree ancestry, geometry, component reference, text/content, repeated site patterns, target page type and proven capabilities). Name prefix is only a strong hint, never sufficient proof by itself.

| Semantic class | Page Builder CMS policy | Reporting policy |
|---|---|---|
| `SITE_CHROME` | Excluded: normal Header/Footer/site navigation | Listed as `THEME_CHROME`, preserve source node ref, give explicit reason |
| `EDITORIAL_SECTION` | Candidate: map to native Page Builder / proven `Secomm_UiWidget` | Record parent/children, order, layout, variants and editable slots |
| `SHARED_COMPONENT` | Reuse if target capability actually supported | Record capability ID/proof/compatibility and required customization |
| `PRESENTATIONAL` | Fold into section styling/assets when safe | Record node treatment; do not silently lose important decoration |
| `UNKNOWN_OR_AMBIGUOUS` | **Do not silently generate, drop or claim PASS** | Human decision required, with candidates and evidence |

Site chrome differs from a **page-local navigation or editorial footer/CTA**. For example, anchor tabs or a campaign's bottom newsletter section may be legitimate CMS content even if named `Footer`. Avoid excluding by label alone.

The mapping report must preserve **all selected nodes** in one of `MAPPED`, `EXCLUDED_WITH_REASON`, `DECORATION_MERGED`, `REFERENCE_ONLY`, or `NEEDS_REVIEW`; no silent omission. A multi-node semantic section may map to one supported Page Builder component. Conversely, if a visual section requires unimplemented business logic, mark `CUSTOM_REQUIRED` / `DATA_PROVIDER_PENDING`, not `FUNCTIONAL_PASS`.

## 4. Workflow when AI **creates** Figma (future separate GO)

1. Use requirements + actual Platform/UI/Project Knowledge to propose site chrome, CMS sections, shared components and editable slots.
2. Build *semantic* frame/section hierarchy and use the canonical naming as part of creation; record roles/variants/data needs in a design receipt.
3. Preserve Figma Auto Layout, constraints, variables/tokens and component instances rather than replacing semantic components with unstructured rectangles just to match screenshots.
4. QA design structure, responsive views, accessibility, and capability gaps. Do not invent implementation capabilities because a design layer exists.
5. **No modification to the currently frozen approved design without an explicit approved design task.**

## 5. Workflow when AI **converts** Figma → Magento Page Builder (first supported output)

```text
Figma URL + selected frame ID (e.g. node-id=245-2)
  → read all descendant nodes (read-only)
  → derive semantic roles + source-backed classification
  → show mapping report, including SITE_CHROME exclusions and UNKNOWNs
  → resolve available native PB / Secomm_UiWidget capabilities
  → generate CMS page-only structural plan
  → later approved isolated CMS import and Admin round-trip
  → visual QA
```

- **Only one root frame/node ID is required from the user.** The agent/tool must discover/classify its descendants, not demand that the user label every section manually.
- For **Page Builder output**, header/footer/nav remain represented in the audit but are excluded from CMS content when they are real shared site chrome. The theme pipeline is separate and future-only.
- A node ID cannot imply whether a section is CMS, Theme, product data or decoration. **Explicit machine-readable IR with source IDs, semantic roles, classification, proof and diagnostics is mandatory.**
- Layout hierarchy (e.g. 40/60, nested rows, responsive order) is proven before CSS/visual parity. A static HTML screenshot cannot establish Page Builder editability.

## 6. Controlled naming policy — historical Desktop execution and future changes

**Completed:** a separately approved 61-label Desktop naming pass on root 245:2 took place on 2026-11-03; IDs, hierarchy and geometry were preserved in the recorded verification. Shared component names and untouched descendants were not mass-renamed.

**For future additions only:** each new renaming action requires its own specific Owner GO and read-only preflight. The following manifest/apply/verify procedure is **not** an instruction to rerun the completed pass. #18 read-only approval is not a Figma-write permission.

1. **Read-only preflight:** confirm target fileKey, access, frame ID, original file version, desktop/mobile linkage, component library dependencies, and whether naming changes are permitted. Get snapshot/reference screenshot.
2. **Create proposed rename manifest:** one row per proposed change with `fileKey`, `nodeId`, `parentId`, `nodeType`, `oldName`, `newName`, `semanticRole`, `reason`, `risk`, `sharedComponent`; also list nodes intentionally unchanged and ambiguous nodes.
3. **Preview for review:** no renaming before reviewing the plan. Flag ambiguous sections and shared published components for human decision; never mass-rename based only on names or position.
4. **Apply approved name-only changes:** only update `name` on approved nodes, with no edits to `id`, parent/children order, component definitions/variant props, layout, styles, text content, assets, link targets, interaction or CMS target. If tooling cannot guarantee a name-only operation, stop.
5. **Verify with before/after evidence:** node ID and hierarchy stable; changed names match approved manifest; no missing nodes; visual screenshots and component resolution remain consistent; report any errors/drift. A Figma rename creates a new file revision even if rendering is unchanged.
6. **Record mapping conventions** as a reusable tool skill/spec and retain a safe receipt. Keep proprietary design dump and licensed media out of public GitHub.

**Explicit current decision (2026-11-06):** use completed Desktop naming as a baseline; **do not rename again without new GO**. Verify each stage in order: naming/source identity → complete structural extraction → canonical NodeIR/semantic ownership → supported native Page Builder mapping → separately approved editable CMS round-trip → visual QA later. This document authorizes no new Figma write, Magento CMS/DB import, G3/G4 implementation or Theme output.
