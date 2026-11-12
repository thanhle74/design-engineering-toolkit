# Design Engineering Toolkit

A **multi-project, platform-neutral** foundation for design-system contracts, semantic structure, capability resolution and evidence-led conversion. Magento Page Builder + Hyvä is the **first adapter**, not a required core dependency.

## Quick start — ONE application, one entrypoint ([58], [60], [63])

Requires Node ≥ 22.13 (Fedora/Linux) and pnpm ≥ 12 (`npm install -g pnpm`, pinned in `package.json` `packageManager`). From the repository root:

```bash
pnpm run setup   # ONCE: one root pnpm install --frozen-lockfile (ONE package.json + ONE pnpm-lock.yaml — [63] no workspaces) + builds the det core
pnpm run dev     # DET Studio → http://localhost:3000/build
```

DET is **ONE Node.js / Next.js application rooted at the repository root** ([63]), organized as a modular monolith ([68]): the headless engine is `src/core` plus bounded feature modules `src/modules/{figma,magento,knowledge,studio}` — adapters live INSIDE their owning module (`src/modules/**/adapters/`), tests and fixtures beside their code (`__tests__/`), and the engine core stays React-free (callable via `node bin/det.js` from any cwd). The Next.js App Router (`app/`) is only the Studio UI module's routing layer. Committed data lives in `resources/{schemas,knowledge,examples,profiles,projects}`; specs and receipts in `docs/`. There are no npm workspaces, no `apps/`, no `packages/`, no internal package manifests.

Then in the browser: select **"Slaunchpad Homepage — real-derived (Figma rev
2417494580183108397)"** (the committed repository example, cataloged in place — nothing
is copied) and click **Build**. The run page shows the honest result: **2 of 12 sections
compose** into native Page Builder shapes, 10 carry explicit skip records, `PREVIEW_UNAVAILABLE`
(no Magento render is bound to bundles), and every artifact download is byte-verified
against `build-manifest.json`. **No Magento CMS/Admin/DB writes happen — output is
source/download only.** Production-mode local usage: `pnpm run start`. Headless CLI:
`node bin/det.js --help` (or `pnpm exec det` after setup). Details: the [Studio runbook](docs/runbook-real-derived-studio-build.md)
and [docs/studio/README.md](docs/studio/README.md).

## Current work — Modular Monolith CLI engine (`det`)

The reviewed [Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5) architecture is **integrated and executable**: **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity** ship as gated CLI stages with per-gate receipts (G1 #5 · G2 #14 · KB #15 · G3 #23 · G4 #25). These are structural/contract gates — Magento Admin UI round-trip persistence and visual pixel fidelity carry separate operator gates and are proved only inside the per-gate receipts, never by this ladder. Active work runs as issue-numbered tasks (`[N]`); live status lives on GitHub ([issues](https://github.com/thanhle74/design-engineering-toolkit/issues), [pull requests](https://github.com/thanhle74/design-engineering-toolkit/pulls)) and the [Coordinator handoff](docs/specs/CHATGPT-COORDINATOR-HANDOFF.md) — not in this README.

## Executable CLI — `det` (Issue #9, first implementation gate)

The deterministic engine is real code now (TypeScript on Node per [TECH-ADR](docs/specs/knowledge-foundation/TECH-ADR.md) ADR-1), equally runnable by an agent, a human terminal or CI — no AI required:

```bash
pnpm install && pnpm run build
node bin/det.js validate --profile resources/profiles/magento-pagebuilder.example.json --project /path/to/magento --json
node bin/det.js inspect  --profile resources/profiles/magento-pagebuilder.example.json --project /path/to/magento --out out/
node bin/det.js plan     --profile <p> --registry out/capability-registry.json --bindings <map.json> --input <structure.json> --out out/
```

- **Commands:** `validate` (profile contract + source preflight) · `inspect` (read-only capability probe via an out-of-process adapter; proof ceiling `registered`, `env.php`/`auth.json` deny-listed) · `plan` (deterministic structural mapping → ResolutionReport; pure computation) · plus later gated stages: `extract` ([#14](https://github.com/thanhle74/design-engineering-toolkit/issues/14)), `kb` ([#15](https://github.com/thanhle74/design-engineering-toolkit/issues/15)), `compose` ([#23](https://github.com/thanhle74/design-engineering-toolkit/issues/23), [#25](https://github.com/thanhle74/design-engineering-toolkit/issues/25)).
- **Deterministic:** machine-readable `--json`, `tool-run.json` envelopes with content hashes, exit codes `0` ok / `1` blocking diagnostics / `2` usage / `3` adapter failure; no-write default (`--out` writes, `--dry-run` never does). Source paths come from `--project` > `DET_PROJECT_SOURCE` > gitignored `resources/profiles/*.local.json` — never a default.
- **Boundaries:** no Figma, no CMS/DB writes, no Admin round-trip in this gate. Agents should use the [`det-cli` skill](.claude/skills/det-cli/SKILL.md) instead of reimplementing logic as prompts; the `magento-specs` MCP is optional and never a runtime dependency. Evidence: [docs/converter/RECEIPT-ISSUE9-CLI.md](docs/converter/RECEIPT-ISSUE9-CLI.md).

Start here:
- [Issue #5 architecture spec](docs/specs/ISSUE-5-converter-architecture.md) — **historical G1 record** (integrated; living specs are the product/modular specs below); integrator receipt: [docs/converter/RECEIPT-ISSUE5-G1.md](docs/converter/RECEIPT-ISSUE5-G1.md)
- [Converter contracts](resources/schemas/converter/) (materialized schemas) + [contract reference incl. deferred NodeIR/PageStructure](docs/converter/CONTRACTS.md)
- [Capability matrix — Magento PB + UiWidget + Hyvä](docs/converter/CAPABILITY-MATRIX.md) (proof ceiling REGISTERED; machine-readable sample in `resources/examples/converter/`)
- [Accepted/proposed decisions](docs/converter/DECISIONS.md) (ADR-005-001..016)
- [OSS source selection](docs/research/oss-adoption-for-pagebuilder.md) · [Agent skills selection](docs/research/agent-skills-adoption.md) — verified live against sources
- [Repo hygiene baseline](docs/converter/REPO-HYGIENE-BASELINE.md) (incl. [5] TIP audit addendum)
- **Test gate:** `pnpm test` — 195 checks (build + schema validation for the V1/converter/CLI/KB families, the T-01..T-22 negative/CLI plan, the KB-01..KB-29 knowledge-engine plan, the G2/G3/G4 converter-gate suites, the #41 schema-registry SSOT suite, determinism, neutrality + deny-list scans, and the [63] foreign-cwd root path-resolution suite — the [60] packed-`@det/core` artifact no longer exists and is deliberately not claimed). Also runs in CI (`.github/workflows/validate.yml`). Studio module gate: `pnpm run test:studio` (225 checks) + `pnpm run typecheck` + `pnpm run lint` + `pnpm run build`.
- [Agent rules](AGENTS.md), [Claude Code entry](CLAUDE.md), `.claude/skills/` and `.claude/agents/`

**Task naming:** `[<issue number>] <task title>`; `[5]` is this task's GitHub issue number, **not a version**.

**Portability:** `/home/thanhle/Sites/Magento/slaunchpad` is only the Owner's current local checkout used to develop the first adapter; it is **not** a toolkit dependency or a default path. Future users provide their **own** checkout/profile or use the generic core without Magento.

## Shared Product Architecture and Knowledge Foundation

- [Product scope — Page Builder first, Theme later](docs/specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md): approved product direction and exact boundaries.
- [Modular Monolith + adapters](docs/specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md): one CLI core, bounded platform adapters and stage evidence.
- [Three knowledge domains](docs/specs/knowledge-foundation/README.md) — **architecture/specs only**, not working ingestion yet. [Technology ADR](docs/specs/knowledge-foundation/TECH-ADR.md) recommends TypeScript/Node and JSONL + derived SQLite FTS5 for later implementation.
- [Figma node naming](docs/specs/FIGMA-NODE-SEMANTICS-AND-NAMING.md): root-tree inventory and Page Builder-vs-Theme semantics.
- [ChatGPT Coordinator handoff](docs/specs/CHATGPT-COORDINATOR-HANDOFF.md): live GitHub-first session restore.
- [Executable CLI Issue #9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) — first CLI gate implemented (TypeScript core + `det` + read-only Page Builder adapter); receipt: [docs/converter/RECEIPT-ISSUE9-CLI.md](docs/converter/RECEIPT-ISSUE9-CLI.md). Later stages (Figma extraction, import, Admin round-trip) remain separate gated work.
- [SEO Writer Engine selective lessons](docs/research/seo-writer-engine-patterns-for-toolkit.md) — reuse architectural/workflow principles, not SEO business logic.

**Proof boundary:** #5 G1 contracts/CI do not prove Figma extraction, CMS Admin round-trip or visual fidelity; #7 delivers knowledge **contracts**, not working knowledge ingestion. Merging specs grants no Figma/Magento write authority.

## Existing V1 architecture and manual pilot

**V1 intent:** Discover Figma style guide → normalize versioned design tokens/components → compose an editable Figma page into an approved destination → visual QA receipt.

[Issue #1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) architecture was approved/closed via merged [PR #3](https://github.com/thanhle74/design-engineering-toolkit/pull/3). [Issue #2](https://github.com/thanhle74/design-engineering-toolkit/issues/2) manual Figma pilot was built and closed; **it was not an automated toolkit pipeline**. `resources/projects/slaunchpad-fashion/pilot/pilot-plan.md` documents what was built and which QA gates remain unverified. The orchestrator/runtime importer is **not implemented by that pilot**.

Historic V1 references remain:
- [Architecture](docs/ARCHITECTURE.md) · [Source audit](docs/source-audit/secomm-launchpad-fashion.md)
- [Quality gates](docs/quality-gates.md) · [Safety](docs/safety-and-scope.md) · [Pilot scope](docs/pilot-scope.md)
- [Versioned schemas](resources/schemas/) · [example profiles](resources/profiles/) · [contract examples](resources/examples/)

## Safety

The toolkit must remain shareable across projects and platforms. Keep core free of brand-specific code, fixed source IDs, local user paths and Magento dependencies. Source designs are read-only; do not modify approved Figma files or production storefronts. Preserve V1 pilot/evidence until a source-backed migration or deletion review authorizes changes. No third-party source vendoring without license review and no auto-merge.
