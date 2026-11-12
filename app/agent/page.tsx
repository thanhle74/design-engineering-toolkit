import { redirect } from "next/navigation";

// The redirect target depends on the request URL — fully blocking route.
export const instant = false;

/**
 * [70] `/agent` no longer has a page of its own: the one-click Build flow
 * replaces the standalone AI-analysis screen, so every deep link keeps
 * working as a server redirect to the Build lane (`/agent?analysis=X` →
 * `/build?analysis=X`). The whole query string is preserved verbatim
 * (`searchParams` per the Next 16 async-params convention), not just the
 * `analysis` key. `redirect()` throws `NEXT_REDIRECT`, so this component
 * never renders UI.
 */
export default async function AgentPage({
   searchParams,
}: {
   searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
   const params = await searchParams;
   const query = new URLSearchParams();
   for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
         query.set(key, value);
      } else if (Array.isArray(value)) {
         for (const entry of value) query.append(key, entry);
      }
   }
   const queryString = query.toString();
   redirect(queryString === "" ? "/build" : `/build?${queryString}`);
}
