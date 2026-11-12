# resources/ — the engine's committed data surfaces ([68])

Everything the `det` CLI reads or the Knowledge Engine stores that is NOT code lives here,
grouped by what it IS (schema / capability audit / binding map / example / profile / project
data), not by which module consumes it. Contracts stay schema-first: every JSON file under
`resources/schemas/` declares its own absolute `$id` (Ajv registry key — never fetched, never migrated),
and `resources/schemas/registry.json` ([41]) is the single alias → path map.

| Surface | What lives here | Classification |
| --- | --- | --- |
| `resources/schemas/` | Versioned contract families (converter major 1 + cli + kb) and the alias registry. `$id` URIs are frozen identifiers, NOT download URLs. | Contracts (SSOT) |
| `knowledge/` | The Knowledge Engine's data layer: the committed synthetic KB store (`knowledge/store`) and per-domain capability knowledge (`knowledge/magento/pagebuilder`). | Knowledge foundation (KB-1/2/3) |
| `resources/examples/` | Shipped offline examples: the one-shot build config, the real-derived Studio build project, converter compose outputs, the synthetic KB example set, local-preview PHP helpers, the Preview Theme guard. | Generated-output + synthetic examples |
| `resources/profiles/` | Example converter profiles (validation fixtures for the profile contract). | Synthetic inputs |
| `resources/projects/` | Operator project data (currently the slaunchpad-fashion pilot; `pilot/evidence` under it is accepted proof — never delete). | Operator data (read-only to the engine) |

Rules carried over from the pre-`[68]` layout, unchanged:

- The engine reads these paths through `src/core/schema-registry.ts` (`REPO_ROOT`-anchored) and
  explicit caller-supplied arguments — never from `process.cwd()`, never from defaults.
- `resources/projects/…/pilot/evidence` and all accepted receipts under `docs/evidence/` are protected:
  the engine never writes into them, and cleanup must not delete them ([68]).
- No vendor bulk copies and no licensed bytes live under `resources/`; the Hyvä UI and PHTML
  capability domains under `knowledge/` are deliberately ABSENT until audited from real,
  licensed source — absence is stated, never invented ([68]).
