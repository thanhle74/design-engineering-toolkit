# Design Engineering Toolkit

Reusable, project-agnostic Design Engineering workflows for transforming Figma design systems into consistent, editable designs.

## V1 scope

- Audit design tokens, styles, components, variants, and icons from existing Figma sources.
- Define versioned, platform-neutral JSON contracts with traceable source references.
- Build and visually verify one responsive, editable Figma pilot design.
- Keep each project's brand, business rules, source assets, and target platform in its own project profile.

## Work tracking

- [Issue #1 — Architecture & Design System](https://github.com/thanhle74/design-engineering-toolkit/issues/1)
- [Issue #2 — Figma Pilot](https://github.com/thanhle74/design-engineering-toolkit/issues/2)

Both issues may run concurrently in Orca, each with multiple internal workers. Issue #2 can research and prepare independently, but must wait for the relevant reviewed contracts from #1 before writing the Figma pilot. Coordinate shared dependencies via GitHub issue comments.

## Safety

Preserve existing Figma files as read-only references until an explicitly approved write target is established. Do not delete existing Figma pages. No Magento/Hyvä implementation or Page Builder importer in V1.

## Status

Bootstrap README only. Architecture and implementation remain tracked in the GitHub issues.
