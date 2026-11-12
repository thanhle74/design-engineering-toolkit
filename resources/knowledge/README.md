# knowledge/ — the Knowledge Engine's data layer ([68])

Per the Three-KB architecture (`docs/specs/knowledge-foundation/README.md`): KB-1 platform,
KB-2 project, KB-3 relations — one store, explicit partitions, zero guessing.

| Domain | Status | Contents |
| --- | --- | --- |
| `store/` | **Populated (synthetic)** | The committed KB store consumed by `det kb query`: `store.json` + `platform/`, `project/` (aurora-tea, synthetic-fashion), `ui/`, `relations/`. The public example manifest that seeds a fresh copy of it lives at `../examples/kb/manifest.json`. |
| `magento/pagebuilder/` | **Populated (audited example)** | The shipped capability registry + component binding map for the `magento-pagebuilder` platform (see README below). |
| `hyva-ui/` | **Intentionally absent** | No Hyvä UI capability audit exists yet; a real one requires read access to licensed Hyvä theme source. Inventing records here is forbidden ([68], KB honesty rules). |
| `phtml/` | **Intentionally absent** | Same rule: no audited PHTML-template capability census exists yet. |

A domain directory is created ONLY when its records come from a source-backed audit of real
platform files (the `pagebuilder-capability-audit` skill's evidence standard). Absence is the
truthful state until then.
