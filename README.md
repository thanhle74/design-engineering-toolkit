# Design Engineering Toolkit

A **multi-project, platform-neutral** foundation for design-system contracts, semantic structure, capability resolution and evidence-led conversion. Magento Page Builder + Hyvä is the **first adapter**, not a required core dependency.

## Current work — [5] converter architecture

**[Issue #5](https://github.com/thanhle74/design-engineering-toolkit/issues/5)** is architecture-first: **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity**.

**Current gate (G1):** source-backed capability inventory, neutral contracts/schema decisions, reusable skills/agents and evidence-based repo hygiene. **No Figma access, no CMS import, no CSS pixel-perfect, no production writes.** Later G2–G4 require separate decisions.

## Executable CLI — `det` (Issue #9, first implementation gate)

The deterministic engine is real code now (TypeScript on Node per [TECH-ADR](specs/knowledge-foundation/TECH-ADR.md) ADR-1), equally runnable by an agent, a human terminal or CI — no AI required:

```bash
npm ci && npm run build
node bin/det.js validate --profile profiles/magento-pagebuilder.example.json --project /path/to/magento --json
node bin/det.js inspect  --profile profiles/magento-pagebuilder.example.json --project /path/to/magento --out out/
node bin/det.js plan     --profile <p> --registry out/capability-registry.json --bindings <map.json> --input <structure.json> --out out/
```

- **Commands:** `validate` (profile contract + source preflight) · `inspect` (read-only capability probe via an out-of-process adapter; proof ceiling `registered`, `env.php`/`auth.json` deny-listed) · `plan` (deterministic structural mapping → ResolutionReport; pure computation).
- **Deterministic:** machine-readable `--json`, `tool-run.json` envelopes with content hashes, exit codes `0` ok / `1` blocking diagnostics / `2` usage / `3` adapter failure; no-write default (`--out` writes, `--dry-run` never does). Source paths come from `--project` > `DET_PROJECT_SOURCE` > gitignored `profiles/*.local.json` — never a default.
- **Boundaries:** no Figma, no CMS/DB writes, no Admin round-trip in this gate. Agents should use the [`det-cli` skill](.claude/skills/det-cli/SKILL.md) instead of reimplementing logic as prompts; the `magento-specs` MCP is optional and never a runtime dependency. Evidence: [docs/converter/RECEIPT-ISSUE9-CLI.md](docs/converter/RECEIPT-ISSUE9-CLI.md).

Start here:
- [Current architecture/spec](specs/ISSUE-5-converter-architecture.md) — INTEGRATED_FOR_G1_REVIEW (2026-11-03); integrator receipt: [docs/converter/RECEIPT-ISSUE5-G1.md](docs/converter/RECEIPT-ISSUE5-G1.md)
- [Converter contracts](schemas/converter/) (materialized schemas) + [contract reference incl. deferred NodeIR/PageStructure](docs/converter/CONTRACTS.md)
- [Capability matrix — Magento PB + UiWidget + Hyvä](docs/converter/CAPABILITY-MATRIX.md) (proof ceiling REGISTERED; machine-readable sample in `examples/converter/`)
- [Accepted/proposed decisions](docs/converter/DECISIONS.md) (ADR-005-001..016)
- [OSS source selection](docs/research/oss-adoption-for-pagebuilder.md) · [Agent skills selection](docs/research/agent-skills-adoption.md) — verified live against sources
- [Repo hygiene baseline](docs/converter/REPO-HYGIENE-BASELINE.md) (incl. [5] TIP audit addendum)
- **Test gate:** `npm test` — 78 checks (build + schema validation for the V1/converter/CLI/KB families, the T-01..T-22 negative/CLI plan, the KB-01..KB-27 knowledge-engine plan, determinism, neutrality + deny-list scans). Also runs in CI (`.github/workflows/validate.yml`).
- [Agent rules](AGENTS.md), [Claude Code entry](CLAUDE.md), `.claude/skills/` and `.claude/agents/`

**Task naming:** `[<issue number>] <task title>`; `[5]` is this task's GitHub issue number, **not a version**.

**Portability:** `/home/thanhle/Sites/Magento/slaunchpad` is only the Owner's current local checkout used to develop the first adapter; it is **not** a toolkit dependency or a default path. Future users provide their **own** checkout/profile or use the generic core without Magento.

## Shared Product Architecture and Knowledge Foundation

- [Product scope — Page Builder first, Theme later](specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md): approved product direction and exact boundaries.
- [Modular Monolith + adapters](specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md): one CLI core, bounded platform adapters and stage evidence.
- [Three knowledge domains](specs/knowledge-foundation/README.md) — **architecture/specs only**, not working ingestion yet. [Technology ADR](specs/knowledge-foundation/TECH-ADR.md) recommends TypeScript/Node and JSONL + derived SQLite FTS5 for later implementation.
- [Figma node naming](specs/FIGMA-NODE-SEMANTICS-AND-NAMING.md): root-tree inventory and Page Builder-vs-Theme semantics.
- [ChatGPT Coordinator handoff](specs/CHATGPT-COORDINATOR-HANDOFF.md): live GitHub-first session restore.
- [Executable CLI Issue #9](https://github.com/thanhle74/design-engineering-toolkit/issues/9) — first CLI gate implemented (TypeScript core + `det` + read-only Page Builder adapter); receipt: [docs/converter/RECEIPT-ISSUE9-CLI.md](docs/converter/RECEIPT-ISSUE9-CLI.md). Later stages (Figma extraction, import, Admin round-trip) remain separate gated work.
- [SEO Writer Engine selective lessons](docs/research/seo-writer-engine-patterns-for-toolkit.md) — reuse architectural/workflow principles, not SEO business logic.

**Proof boundary:** #5 G1 contracts/CI do not prove Figma extraction, CMS Admin round-trip or visual fidelity; #7 delivers knowledge **contracts**, not working knowledge ingestion. Merging specs grants no Figma/Magento write authority.

## Existing V1 architecture and manual pilot

**V1 intent:** Discover Figma style guide → normalize versioned design tokens/components → compose an editable Figma page into an approved destination → visual QA receipt.

[Issue #1](https://github.com/thanhle74/design-engineering-toolkit/issues/1) architecture was approved/closed via merged [PR #3](https://github.com/thanhle74/design-engineering-toolkit/pull/3). [Issue #2](https://github.com/thanhle74/design-engineering-toolkit/issues/2) manual Figma pilot was built and closed; **it was not an automated toolkit pipeline**. `projects/slaunchpad-fashion/pilot/pilot-plan.md` documents what was built and which QA gates remain unverified. The orchestrator/runtime importer is **not implemented by that pilot**.

Historic V1 references remain:
- [Architecture](docs/ARCHITECTURE.md) · [Source audit](docs/source-audit/secomm-launchpad-fashion.md)
- [Quality gates](docs/quality-gates.md) · [Safety](docs/safety-and-scope.md) · [Pilot scope](docs/pilot-scope.md)
- [Versioned schemas](schemas/) · [example profiles](profiles/) · [contract examples](examples/)

## Safety

The toolkit must remain shareable across projects and platforms. Keep core free of brand-specific code, fixed source IDs, local user paths and Magento dependencies. Source designs are read-only; do not modify approved Figma files or production storefronts. Preserve V1 pilot/evidence until a source-backed migration or deletion review authorizes changes. No third-party source vendoring without license review and no auto-merge.
