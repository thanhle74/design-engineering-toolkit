/**
 * [65] Agent plan contract — the structured output the local Claude Code
 * Figma-analysis agent must return (enforced twice: by the CLI's
 * `--json-schema` structured-output mechanism, then again here with the same
 * zod schema before Studio accepts anything).
 *
 * This contract is PROPOSAL-shaped on purpose: it carries what the AI agent
 * OBSERVED (sections, roles, content refs, capability hints, limitations) and
 * never engine verdicts. Genuine MAPPED/GAP/NEEDS_REVIEW dispositions only
 * ever come from the deterministic `det build` compose stage — the agent can
 * neither produce nor influence them. `observed.grounded` is the honesty
 * anchor: a plan that never observed the requested node is `plan-ungrounded`,
 * never a mapping source.
 *
 * The JSON Schema handed to `claude --json-schema` is derived from this zod
 * schema with zod's draft-07 target (the Claude Code structured-output
 * validator validates against draft-07). Single source of truth: edit the
 * zod schema, never a second hand-written JSON Schema.
 */
import { z } from "zod";

/** The 11 composition roles of the core `semantic-projection` schema (v1.4.0). */
export const AGENT_PROJECTION_ROLES = [
   "background-media",
   "content-lead",
   "heading",
   "body",
   "cta",
   "decoration",
   "column-primary",
   "column-secondary",
   "inline-media",
   "grid-column",
   "grid-caption",
] as const;

export const AGENT_CONTENT_KINDS = ["text", "media", "link"] as const;

export const AgentPlanSchema = z.object({
   schemaVersion: z.literal(1),
   /** Echo of the requested locator — must equal the analysis request (host-checked). */
   requested: z.object({
      fileKey: z.string().min(1).max(64),
      nodeId: z.string().min(1).max(40),
   }),
   /**
    * What the agent actually observed. `grounded` is true only when the
    * allowed read-only Figma MCP tool returned data for the requested node;
    * `revisionId` is null for MCP observations (the MCP metadata tools expose
    * no revision pin — `mcp-observed-unpinned`, the documented limitation).
    */
   observed: z.object({
      grounded: z.boolean(),
      rootName: z.string().max(200).nullable(),
      childCount: z.number().int().nonnegative().nullable(),
      revisionId: z.string().max(80).nullable(),
   }),
   /** Direct children classified as editorial sections, with proposals. */
   sections: z
      .array(
         z.object({
            /** Observed Figma layer name, verbatim. */
            name: z.string().min(1).max(160),
            /** The direct-child node id this section was observed at. */
            sourceNodeId: z.string().min(1).max(80),
            /** Observed layout intent from geometry, e.g. "two columns 50/50". */
            layout: z.string().max(400),
            /** Generic capability ideas; `observed` only when structure shows it. */
            capabilityHints: z
               .array(
                  z.object({
                     capabilityId: z.string().min(1).max(120),
                     confidence: z.enum(["observed", "conjecture"]),
                     reason: z.string().min(1).max(400),
                  }),
               )
               .max(8),
            /** Proposed composition-role assignments for concrete node ids. */
            projection: z
               .array(
                  z.object({
                     sourceNodeId: z.string().min(1).max(120),
                     role: z.enum(AGENT_PROJECTION_ROLES),
                     reason: z.string().min(1).max(400),
                  }),
               )
               .max(60),
            /** Observed content, bounded excerpts. Media: node id only, never URLs. */
            contentRefs: z
               .array(
                  z.object({
                     sourceNodeId: z.string().min(1).max(120),
                     kind: z.enum(AGENT_CONTENT_KINDS),
                     excerpt: z.string().max(200),
                  }),
               )
               .max(24),
         }),
      )
      .max(30),
   /** Header/footer/global-nav children with the reason they are chrome. */
   siteChrome: z
      .array(
         z.object({
            name: z.string().min(1).max(160),
            sourceNodeId: z.string().min(1).max(80),
            reason: z.string().min(1).max(400),
         }),
      )
      .max(10),
   /** Anything the agent could not classify — never silently dropped. */
   unresolved: z
      .array(
         z.object({
            sourceNodeId: z.string().max(80),
            reason: z.string().min(1).max(400),
         }),
      )
      .max(60),
   /** Honest record of what could NOT be observed or is missing. */
   limitations: z.array(z.string().min(1).max(400)).max(24),
});

export type AgentPlan = z.infer<typeof AgentPlanSchema>;

/**
 * Draft-07 JSON Schema for `claude --json-schema` — derived, never
 * hand-maintained. The module-level computation runs once per process.
 */
let cachedJsonSchema: string | null = null;
export function agentPlanJsonSchemaString(): string {
   if (cachedJsonSchema === null) {
      cachedJsonSchema = JSON.stringify(
         z.toJSONSchema(AgentPlanSchema, { target: "draft-7" }),
      );
   }
   return cachedJsonSchema;
}

/* --------------------------- analysis transport --------------------------- */

/** The request record carried by every analysis snapshot + API payload. */
export interface AgentAnalysisRequest {
   fileKey: string;
   nodeId: string;
   baseConfigId: string;
}

/** Runner/process state + provenance for one analysis (API transport shape). */
export interface AgentAnalysisSnapshot {
   analysisId: string;
   state: AgentRunState;
   request: AgentAnalysisRequest;
   /** Catalog-resolved, containment-checked base build config path. */
   baseConfigPath: string | null;
   allowedFigmaTool: string;
   claudeVersion: string | null;
   /** The exact argv the runner executed (local operator provenance). */
   command: string[];
   exitCode: number | null;
   signal: string | null;
   timedOut: boolean;
   cancelled: boolean;
   startedAt: string | null;
   finishedAt: string | null;
   pid: number | null;
   stdoutTail: string;
   stderrTail: string;
   spawnError: string | null;
   outcome: AgentOutcome | null;
   envelopeSafe: ClaudeEnvelopeSafeView | null;
   /** Plan observed.grounded — null until a terminal classification exists. */
   grounded: boolean | null;
}

/* ------------------------- Claude result envelope ------------------------- */

/**
 * SAFE subset of the `claude --output-format json` result envelope (verified
 * live against Claude Code 2.1.322 and the official structured-outputs doc):
 * the fields Studio persists for provenance. The raw envelope (full provider
 * result text, model usage dumps) is never persisted — bounded tails only,
 * like every other child-process surface in Studio.
 */
export interface ClaudeEnvelopeSafeView {
   subtype: string | null;
   isError: boolean;
   sessionId: string | null;
   numTurns: number | null;
   durationMs: number | null;
   totalCostUsd: number | null;
   /** Count of permission denials (audit signal; with `--permission-prompts none` every would-be prompt is denied). */
   permissionDenialCount: number;
   hasStructuredOutput: boolean;
}

/** Terminal classification of one analysis run. */
export type AgentOutcome =
   | "plan-ready" // envelope ok + schema ok + grounded=true
   | "plan-ungrounded" // envelope ok + schema ok, but no Figma data was observed
   | "schema-failed" // structured_output present but fails this contract
   | "output-missing" // envelope ok, no structured_output field
   | "claude-error" // envelope is_error or error subtype
   | "envelope-invalid" // stdout not a parseable result envelope
   | "stdout-truncated"; // output cap hit — never parsed as a plan

export type AgentRunState =
   | "queued"
   | "running"
   | "exited"
   | "timeout"
   | "cancelled"
   | "spawn-failed"
   | "interrupted";

/** True when the analysis can proceed to operator review + approval. */
export function isApprovableOutcome(outcome: AgentOutcome): boolean {
   return outcome === "plan-ready";
}

/** Cross-field invariants asserted after every parse (mirrors studio-run-view). */
export function assertAgentPlanInvariants(
   plan: AgentPlan,
   request: { fileKey: string; nodeId: string },
): void {
   if (
      plan.requested.fileKey !== request.fileKey ||
      plan.requested.nodeId !== request.nodeId
   ) {
      throw new Error(
         `AGENT_PLAN_LOCATOR_MISMATCH: plan echoes ${plan.requested.fileKey}/${plan.requested.nodeId}, requested ${request.fileKey}/${request.nodeId}`,
      );
   }
   const seen = new Set<string>();
   for (const section of plan.sections) {
      for (const assignment of section.projection) {
         const key = `${section.sourceNodeId}::${assignment.sourceNodeId}`;
         if (seen.has(key)) {
            throw new Error(`AGENT_PLAN_DUPLICATE_PROJECTION: ${key}`);
         }
         seen.add(key);
      }
   }
}
