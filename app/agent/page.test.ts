import { describe, expect, it, vi } from "vitest";

/**
 * [70] /agent is a pure server redirect to /build that preserves the query
 * string (deep links like /agent?analysis=X keep working). `redirect()` is
 * mocked to mirror its real semantics: it throws NEXT_REDIRECT and terminates
 * rendering, so the redirect target is asserted through the thrown marker.
 */

vi.mock("next/navigation", () => ({
   redirect: (url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
   },
}));

import AgentPage from "./page";

async function redirectTargetFor(
   searchParams: Record<string, string | string[] | undefined>,
): Promise<string> {
   const thrown = await AgentPage({
      searchParams: Promise.resolve(searchParams),
   }).catch((error: unknown) =>
      error instanceof Error
         ? error.message
         : Promise.reject(new Error("AgentPage did not throw")),
   );
   if (typeof thrown !== "string" || !thrown.startsWith("NEXT_REDIRECT:")) {
      throw new Error(
         `AgentPage did not redirect as expected (got: ${String(thrown)})`,
      );
   }
   return thrown.slice("NEXT_REDIRECT:".length);
}

describe("AgentPage — server redirect to /build", () => {
   it("preserves the analysis deep link: /agent?analysis=X → /build?analysis=X", async () => {
      expect(await redirectTargetFor({ analysis: "agent-910001" })).toBe(
         "/build?analysis=agent-910001",
      );
   });

   it("redirects bare /agent to /build with no query string", async () => {
      expect(await redirectTargetFor({})).toBe("/build");
   });

   it("preserves the whole query string, not just the analysis key", async () => {
      expect(
         await redirectTargetFor({ analysis: "agent-910001", view: "plan" }),
      ).toBe("/build?analysis=agent-910001&view=plan");
   });

   it("drops undefined values and repeats array values as multiple keys", async () => {
      expect(
         await redirectTargetFor({
            analysis: undefined,
            tags: ["a", "b"],
         }),
      ).toBe("/build?tags=a&tags=b");
   });

   it("throws NEXT_REDIRECT like the real redirect() (rendering terminates)", async () => {
      await expect(
         AgentPage({
            searchParams: Promise.resolve({ analysis: "agent-910001" }),
         }),
      ).rejects.toThrow("NEXT_REDIRECT:");
   });
});
