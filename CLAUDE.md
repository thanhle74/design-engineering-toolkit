# Claude Code — Design Engineering Toolkit

Read [AGENTS.md](AGENTS.md) as the universal agent router. For a **new ChatGPT Coordinator session**, read [Coordinator Handoff](docs/specs/CHATGPT-COORDINATOR-HANDOFF.md) and refresh GitHub Issue/PR/ref/CI truth.

**Product:** code-first, agent-optional **Modular Monolith CLI Engine**. First target is **Figma → editable Magento Page Builder CMS content**; Hyvä Theme and requirements-to-Figma are later. [Product scope](docs/specs/PRODUCT-ARCHITECTURE-AND-SCOPE.md) · [Modular adapters](docs/specs/MODULAR-ARCHITECTURE-AND-ADAPTERS.md) · [Three-KB architecture](docs/specs/knowledge-foundation/README.md) · [Figma node naming](docs/specs/FIGMA-NODE-SEMANTICS-AND-NAMING.md).

Use task labels `[<GitHub issue number>] <title>`; #5 G1 was architecture-only and must not be replayed. Read relevant `.claude/skills/*/SKILL.md`, use independent bounded workers and one integrator. Prefer tested deterministic code over prompt-only mapping. Owner's `magento-specs` MCP is optional when actually available.

**Protected:** no Figma writes or Page Builder CMS/DB mutations without separate GO; no licensed Hyvä source distribution, production writes, auto-merge or invented approval.
