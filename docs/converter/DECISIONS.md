# Converter decisions — append-only

Status values distinguish `ACCEPTED_FOR_G1` (current Owner GO), `PROPOSED`, `DEFERRED`. Architectural proposals are not evidence of a working pipeline.

| ADR | Status | Decision | Reason / consequence |
|---|---|---|---|
| ADR-005-001 | ACCEPTED_FOR_G1 | **Capability Registry → Structural Mapping → Functional Round-trip → Visual Fidelity** | Structural correctness and editor semantics must be proven before CSS styling; each later gate requires separate GO. |
| ADR-005-002 | ACCEPTED_FOR_G1 | Platform-neutral core; project-specific profiles; Magento Page Builder + Hyvä as first adapter | Reuse across customers/platforms without leaking business rules, local paths, Figma IDs or Magento classes into core. |
| ADR-005-003 | ACCEPTED_FOR_G1 | Figma design is frozen. **No Figma read/write in G1** | User requests architecture-first; source fixture is a later gated input. |
| ADR-005-004 | ACCEPTED_FOR_G1 | Parallel read-only research W-A..D; single mutating Integrator | Save time without races, inconsistent SSOT or conflicting commits. Task prefix `[5]` is GitHub Issue number. |
| ADR-005-005 | ACCEPTED_FOR_G1 | Native PB / verified UiWidget first; unknown mapped to explicit `UNSUPPORTED` | No arbitrary HTML Code fallback, invented functionality, or one content type per page. |
| ADR-005-006 | ACCEPTED_FOR_G1 | Importer must prove real Admin Edit → Save → Reload → Storefront in isolated G3 | Existing code/registry alone does not prove persistence; prior payload loss remains a risk. |
| ADR-005-007 | ACCEPTED_FOR_G1 | External OSS skills provide patterns, not automatic dependencies | Small maintainable toolkit; license/provenance checks prevent unsafe code reuse. |
| ADR-005-008 | PROPOSED | Preserve V1 pilot/evidence while auditing obsolete docs and references | Historical pilot files are not dead code. Remove only with evidence and approval. |


| ADR-005-009 | ACCEPTED_FOR_G1 | Orca/task titles use `[<GitHub issue number>] <task title>` (current `[5]`) | Issue-based traceability; never treat this as a version or hardcode it into shared tooling. |
| ADR-005-010 | ACCEPTED_FOR_G1 | `/home/thanhle/Sites/Magento/slaunchpad` is an owner's **temporary/local adapter development input only**, not a shared runtime default | Tool must support any user's project path and non-Magento projects via optional per-run/profile configuration. Verify portability with clean environment. |


**Change procedure:** Add an ADR row with evidence and migration/compatibility consequences. Never silently rewrite accepted architecture decisions.
