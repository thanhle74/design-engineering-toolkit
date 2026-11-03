---
name: pagebuilder-capability-audit
description: Source-backed inventory of Magento Page Builder content types, appearances, structure and Secomm_UiWidget capabilities. Use whenever defining or verifying a Magento Page Builder adapter, capability registry, editable Admin fields, or widget mapping. Do not run Magento or modify Figma during the architecture-only gate.
---

# Page Builder capability audit

## Preconditions

Read repository `AGENTS.md`, the selected `[<issue>]` spec, and the **calling project's** rules. Local Magento checkout is **optional**, supplied by current project profile / CLI / environment; it must never default to a developer's home directory. If absent, return `PROJECT_SOURCE_NOT_CONFIGURED` and stop source-backed claims. Current SLAUNCH checkout is for adapter development only, **not** a portable dependency.

## Read-only workflow

1. Identify installed Magento version, module status, Page Builder source modules, and actual `content_type.xml` registrations. Record exact source path/version.
2. For each registered type, capture **appearance**, master/preview renderer, form fields, property converters, responsive behavior, nesting/allowed children and whether Admin can change it.
3. Inspect `Secomm_UiWidget` registry/schema/codec/providers and the actual enabled components. Cross-check the approved B1/B2 matrix, but do not count a spec as runtime enablement.
4. Record theme chrome (header/footer/nav/cart), dynamic Magento catalog dependencies, and CMS/Page Builder boundaries separately; do not try to map global chrome into a CMS page.
5. Enumerate persistent data and round-trip risks (`{{widget}}` payload loss, editor escaping, master HTML). **No Admin writes in G1.**
6. Emit a capability matrix / machine-readable proposal with provider, type, appearance, props, nesting, responsive, editor editing, requirements, source provenance and proof status.

## Proof statuses

`DISCOVERED` → `REGISTERED` → `STRUCTURALLY_MAPPED` → `ADMIN_ROUNDTRIP_VERIFIED` → `VISUALLY_VERIFIED`.

Never promote beyond the evidence. Return `NOT_VERIFIED` for Admin persistence without actual G3 receipts. Unsupported native/widget variants are explicit, not approximated through HTML Code.

## Output

`[<issue>] W-B` receipt: source revision, file paths and exact fields, coverage count, capability statuses, constraints and blockers. Read-only; no Magento DB/cache changes or direct SQL.
