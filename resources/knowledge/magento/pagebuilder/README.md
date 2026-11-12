# magento/pagebuilder/ — audited platform capability knowledge ([68])

Populated knowledge domain for the `magento-pagebuilder` platform (Adobe Magento Page Builder +
Secomm_UiWidget as installed in the audited checkout). The records here are the read-only
output of a source-backed capability audit — never hand-invented.

| File | Contract | What it is |
| --- | --- | --- |
| `capability-registry.magento-pagebuilder.example.json` | `capability-registry` (converter family, major 1) | 61 capabilities, all `config-declaration` class: what the installed platform DECLARES it can render (widgets, content types, Secomm UI components), derived by the [5] W-B read-only audit with the [54] config-declaration verification pass (`det inspect`). `source.sourceId slaunch-checkout`, revision-pinned. |
| `component-binding-map.slaunchpad-fashion.example.json` | `component-binding-map` (converter family, major 1) | The example binding map over that registry for the slaunchpad-fashion pilot project. Deliberately carries ZERO proven binding entries: nothing in the audited config-declaration surface has a verified Figma-side target yet, and inventing bindings is forbidden. |

Proof level: audited declarations only (class `config-declaration`, chrome→discovered per
[54]/REG-09). NOT live-rendered, NOT render-verified; the registry does not claim widget
runtime behavior beyond what the declared config carries.

Locked consumers (these suites fail if the files drift):

- `src/modules/core/__tests__/cli-path-resolution-suite.mjs` (T-63-3/T-63-5: foreign-cwd plan over the
  committed inputs),
- `src/modules/core/__tests__/registry-suite.mjs` (registry + bindings validate their contracts),
- `src/modules/core/__tests__/contracts-suite.mjs` (contract + neutrality gates over the registry),
- `src/modules/figma/__tests__/g2-suite.mjs` (extraction over the registry).

Sibling domains: `../` (this tree's index) — `hyva-ui/` and `phtml/` are intentionally absent
until a real, source-backed audit exists (see `../README.md`).
