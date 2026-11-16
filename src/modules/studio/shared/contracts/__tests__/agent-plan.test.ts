/**
 * [65] Agent plan contract tests: the zod schema is the single source of the
 * `--json-schema` handed to the claude CLI (draft-07 derived), and the
 * invariants (locator echo + projection uniqueness) are enforced before any
 * plan is accepted.
 */
import { describe, expect, it } from "vitest";

import {
   AgentPlanSchema,
   agentPlanJsonSchemaString,
   assertAgentPlanInvariants,
   isApprovableOutcome,
   type AgentPlan,
} from "../agent-plan";

export const VALID_AGENT_PLAN: AgentPlan = {
   schemaVersion: 1,
   requested: { fileKey: "vNPtfBRpYM3PsExirVqhmt", nodeId: "245:2" },
   observed: {
      grounded: true,
      rootName: "PAGE/Home/Desktop",
      childCount: 15,
      revisionId: null,
   },
   sections: [
      {
         name: "SECTION/Hero/Primary",
         sourceNodeId: "245:5",
         layout: "full-bleed poster with overlay content column",
         capabilityHints: [
            {
               capabilityId: "banner-hero",
               confidence: "observed",
               reason: "media slot behind content",
            },
         ],
         projection: [
            {
               sourceNodeId: "254:40",
               role: "background-media",
               reason: "full-bleed media slot frame",
            },
            {
               sourceNodeId: "254:44",
               role: "heading",
               reason: "display heading text in content column",
            },
         ],
         contentRefs: [
            {
               sourceNodeId: "254:44",
               kind: "text",
               excerpt: "The Quiet Grandeur",
            },
         ],
      },
   ],
   siteChrome: [
      {
         name: "SITE/Header",
         sourceNodeId: "245:3",
         reason: "global navigation band above sections",
      },
   ],
   unresolved: [{ sourceNodeId: "245:8", reason: "ambiguous decorative band" }],
   limitations: [
      "MCP metadata tools expose no revision pin (mcp-observed-unpinned)",
   ],
};

describe("AgentPlanSchema", () => {
   it("accepts a valid grounded plan", () => {
      const parsed = AgentPlanSchema.safeParse(VALID_AGENT_PLAN);
      expect(parsed.success).toBe(true);
   });

   it("accepts an ungrounded plan (honest no-observation path)", () => {
      const parsed = AgentPlanSchema.safeParse({
         ...VALID_AGENT_PLAN,
         observed: {
            grounded: false,
            rootName: null,
            childCount: null,
            revisionId: null,
         },
         sections: [],
         limitations: ["tool missing"],
      });
      expect(parsed.success).toBe(true);
   });

   it("rejects an unknown role", () => {
      const bad = structuredClone(VALID_AGENT_PLAN);
      bad.sections[0].projection[0].role = "hero-widget" as never;
      expect(AgentPlanSchema.safeParse(bad).success).toBe(false);
   });

   it("rejects a schemaVersion other than 1", () => {
      expect(
         AgentPlanSchema.safeParse({ ...VALID_AGENT_PLAN, schemaVersion: 2 })
            .success,
      ).toBe(false);
   });

   it("rejects excerpts beyond the bounded length", () => {
      const bad = structuredClone(VALID_AGENT_PLAN);
      bad.sections[0].contentRefs[0].excerpt = "x".repeat(201);
      expect(AgentPlanSchema.safeParse(bad).success).toBe(false);
   });
});

describe("agentPlanJsonSchemaString", () => {
   it("derives a draft-07 schema document from the zod contract", () => {
      const derived = JSON.parse(agentPlanJsonSchemaString()) as Record<
         string,
         unknown
      >;
      expect(derived["$schema"]).toContain("draft-07");
      expect(derived["type"]).toBe("object");
      const serialized = agentPlanJsonSchemaString();
      expect(serialized).toContain("background-media");
      expect(serialized).toContain("grid-caption");
      // Bounded output: the schema string stays small enough for an argv flag.
      expect(serialized.length).toBeLessThan(20_000);
   });
});

describe("assertAgentPlanInvariants", () => {
   it("passes for a plan echoing the request exactly", () => {
      expect(() =>
         assertAgentPlanInvariants(VALID_AGENT_PLAN, {
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:2",
         }),
      ).not.toThrow();
   });

   it("throws AGENT_PLAN_LOCATOR_MISMATCH on a locator echo mismatch", () => {
      expect(() =>
         assertAgentPlanInvariants(VALID_AGENT_PLAN, {
            fileKey: "other-file",
            nodeId: "245:2",
         }),
      ).toThrow(/AGENT_PLAN_LOCATOR_MISMATCH/);
      expect(() =>
         assertAgentPlanInvariants(VALID_AGENT_PLAN, {
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "999:1",
         }),
      ).toThrow(/AGENT_PLAN_LOCATOR_MISMATCH/);
   });

   it("throws AGENT_PLAN_DUPLICATE_PROJECTION on duplicate locators in one section", () => {
      const bad = structuredClone(VALID_AGENT_PLAN);
      bad.sections[0].projection.push({ ...bad.sections[0].projection[0] });
      expect(() =>
         assertAgentPlanInvariants(bad, {
            fileKey: "vNPtfBRpYM3PsExirVqhmt",
            nodeId: "245:2",
         }),
      ).toThrow(/AGENT_PLAN_DUPLICATE_PROJECTION/);
   });
});

describe("isApprovableOutcome", () => {
   it("approves only plan-ready", () => {
      expect(isApprovableOutcome("plan-ready")).toBe(true);
      expect(isApprovableOutcome("plan-ungrounded")).toBe(false);
      expect(isApprovableOutcome("schema-failed")).toBe(false);
      expect(isApprovableOutcome("claude-error")).toBe(false);
      expect(isApprovableOutcome("envelope-invalid")).toBe(false);
      expect(isApprovableOutcome("output-missing")).toBe(false);
      expect(isApprovableOutcome("stdout-truncated")).toBe(false);
   });
});
