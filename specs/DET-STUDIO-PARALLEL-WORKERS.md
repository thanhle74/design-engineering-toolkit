# [29] DET Studio — Parallel Orca Worker Contract

**Status:** binding execution plan for [Issue #29](https://github.com/thanhle74/design-engineering-toolkit/issues/29). **Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, official shadcn/ui/Radix, Lucide. **Source of truth:** `specs/DET-STUDIO-MVP.md`, live #29, and the actual DET schemas. This is a **single product change** with parallel **file-disjoint subworkers**, not multiple competing UIs.

## 0. One-time bootstrap gate — integrator only

**DO THIS BEFORE fan-out** (short bounded implementation, not a large audit):

1. In the existing Orca issue workspace / `task/29-det-studio-nextjs-mvp` branch, verify Git HEAD and preserve unrelated work. Review `specs/DET-STUDIO-MVP.md` and current `schemas/cli/tool-run.schema.json` / `schemas/cli/compose-output.schema.json` / converter NodeIR/PageStructure contracts. Avoid editing any Engine source or Issue #28 worktree.
2. Scaffold **one** `apps/studio` Next.js App Router project, compatible Tailwind v4 + shadcn/ui, real `components.json`, basic `app/` shell, `components/ui/` primitives, shared `cn()`, necessary dependency lockfile. Use current package management conventions; do not replace DET root toolchain without concrete need.
3. Create/freeze the **typed UI-facing read model** under `apps/studio/src/shared/contracts/`, with a single `StudioRunView` and public function interfaces to consume. Derive its fields from actual DET artifact schemas, not UI workers' inventions. Preserve canonical mapping dispositions exactly: `mapped | gap | decoration-merged | excluded | skipped`; treat `NEEDS_REVIEW` as a derived review state/diagnostic, **not** a new persisted compose disposition. Carry source revision, diagnostics and artifact provenance, and distinguish fixture/live. Represent preview explicitly as available/verified versus unavailable; never invent URLs or success.
4. Add at most **one** schema-shaped, visibly labeled **DEMO fixture** under `apps/studio/src/shared/fixtures/` with stable test identifiers; create a read-model adapter interface that workers can import. Commit a **bootstrap checkpoint** or produce a clean verified baseline, then publish its SHA and exact export paths in #29 before releasing workers. If the interface is not ready, **NO PARALLEL FAN-OUT**.

Bootstrap shared APIs expected by lanes (name refinements may happen **before the gate**): `StudioRunView`, `StudioSectionView`, `StudioMappingView`, `StudioDiagnosticView`, `StudioArtifactView`, `StudioPreviewState` and a server-only `DetRunReader`. The integrator publishes their final import paths/export names; no worker redefines a competing type.

## 1. Parallel worker lanes — file ownership

Once the bootstrap gate is open, **four workers may execute simultaneously**. They consume the frozen read model and fixture contract; they do not modify them.

| Lane | Implementation | Exclusive writable paths | Output / focused proof |
| --- | --- | --- | --- |
| **W-A — New Conversion** | Figma URL/node input, local configured project/target selectors, invalid and not-connected UI state. UI must not advertise working live conversion without [28]. | `apps/studio/src/modules/conversions/**` | Input validation, keyboard form, unconnected action state; unit/render tests in this module |
| **W-B — Source & Mapping Review** | Render section tree and mapped/gap/excluded/skipped rows, diagnostics and provenance from fixture/read model; honest NEEDS_REVIEW. | `apps/studio/src/modules/design-tree/**`; `apps/studio/src/modules/mapping-review/**` | Tree/mapping/partial/empty states and targeted tests inside owned modules |
| **W-C — Preview & Export** | Preview available/unavailable UI; artifact list with safe handoff/download actions supplied by server reader. Do not render a demo screenshot as Magento proof. | `apps/studio/src/modules/preview/**`; `apps/studio/src/modules/artifacts/**` | Empty/verified-preview UI, no fake download, target tests inside owned modules |
| **W-D — Read-only DET boundary** | Server-side parser/validator for existing JSON artifacts, provenance, bounded path access/allowlisted artifact download, typed `DetRunReader` implementing bootstrap contract. Fixture mode clearly identified; **no CLI invocation, no Figma API, no CMS writes**. | `apps/studio/src/server/**`; `apps/studio/app/api/runs/**` | Schema/invalid JSON, path traversal, symlink/escape, missing artifacts and error-handling tests inside owned modules |

**Integrator only:** `apps/studio/app/**` **except `app/api/runs/**`**, `apps/studio/components/**`, `apps/studio/src/shared/**`, `apps/studio/package.json`, lockfile, `components.json`, Tailwind/Next/TS/config files, root workspace tooling/CI, screenshots, issue updates and all canonical specs. If W-A/B/C/D needs an extra shadcn primitive, dependency, route or shared type change, **request integrator to make it; do not edit those files**. No worker writes outside its owned directories, including fixes “noticed along the way.”

## 2. Coordination and Git discipline

- **One [29] Orca task, one integration owner, one Draft PR.** The integrator gives each worker the frozen bootstrap SHA, interfaces, acceptance cases and ownership boundary. Workers may work in the same Orca-managed task workspace **only if file ownership is enforced and all git operations/commits are reserved to the integrator**. Integrator is the sole actor for staging, commits, rebases, merges and push to [29] branch. Don't let four agents run simultaneous `npm install`, `shadcn add`, `git checkout`, broad formatters or repo-wide fixes.
- If the available Orca/agent execution cannot reliably enforce exclusive paths, use **separate named Git task branches/worktrees** per worker from the **same frozen bootstrap SHA**, restricted to owned paths, and let the integrator cherry-pick/reconcile their tested commits **serially**. No force-push, nested accidental worktree, dirty-file destruction or separate PRs. State which isolation mode was actually used in the receipt; do not claim agents ran in parallel without evidence.
- Parallelize **after**, not **during**, the bootstrap. No parallel architecture rewriting. Shared contract freeze eliminates W-B/C waiting on W-D's server implementation: they render the **same schema-backed fixture** while W-D connects real artifact reads.
- Each worker posts a compact handoff to the integrator: exact branch/SHA or changed paths, which `StudioRunView` fields it used, test command/results, blockers and no-out-of-scope edits. Workers do **not** mark accepted or merge.
- Integrator checks import parity, composes pages/routes/layout, connects W-D, resolves conflicts, runs the **full build/test/lint/typecheck only once at integration** (repeat if defects), then captures responsive screenshots. If a worker is blocked, do not silently substitute fake functionality; continue the other nondependent lanes and record the truthful block.

## 3. Integration gates

1. **File separation:** disjoint worker paths; one shared read model; no duplicate `StudioRunView` or fake data/API implementation in UI modules.
2. **Functional:** Figma URL form validation; section list; disposition mapping + diagnostics; preview status; artifact handling; explicit demo/not-connected/partial/empty/error UI.
3. **Security:** no filesystem/client path injection; server-only `fs`; deny traversal/symlinks/nonallowlisted files; no secrets in GET/query or UI; no arbitrary subprocess command; local trusted MVP not production multi-user.
4. **Runtime:** `apps/studio` boots with documented dev command and actual Next+shadcn rendering. Targeted tests + TypeScript + lint + build; responsive/keyboard proof and a small UI receipt.
5. **Boundaries:** [28] owns conversion, generated native Page Builder/PHTML and Magento Preview Theme. [29] never mutates Figma, Magento, theme or Engine. No new backend framework.
6. **Delivery:** one integration Draft PR #29 branch, exact-tip CI evidence, `READY_FOR_COORDINATOR_REVIEW` handoff. Coordinator independent verdict; Owner merge GO.

## 4. Orchestrator task prompt (for Orca)

> Continue **[29] DET Studio** on existing issue branch. First read `specs/DET-STUDIO-MVP.md`, this worker contract, live #29 and `schemas/cli/`. **As lead integrator**, perform a minimal Next+shadcn bootstrap and freeze/export the schema-backed `StudioRunView` plus one clearly marked demo fixture; publish the bootstrap SHA. **Only then** start **four bounded parallel coding workers** W-A through W-D above. Give each exact owned directories and prohibit shared file edits, package installs, commits and global formatting by workers. Let each use the frozen types and fixture. Integrate once, run real targeted + final CI/UI verification, open a **single Draft PR**, report real evidence and blockers. No new Engine, CMS/Figma writes or production claims. If parallel execution/isolation isn't supported, use separate named worker branches or sequential execution with the same boundaries; never fake concurrency.
