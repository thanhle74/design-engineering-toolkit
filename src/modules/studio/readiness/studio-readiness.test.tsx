import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
   StudioReadinessProvider,
   isStudioReadinessStatus,
   useStudioReadiness,
} from "./studio-readiness";
import type { StudioReadinessStatus } from "@/src/modules/studio/shared/contracts/build-flow";

/**
 * [70] Provider contract (frozen four fields) + W-A refinements: the mount
 * auto-check, the manual `recheck()` fetch, fail-closed handling of HTTP /
 * transport / malformed-body failures, and stale-response dropping.
 */

const READY_STATUS: StudioReadinessStatus = {
   ready: true,
   checks: {
      claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
      figmaMcp: {
         ready: true,
         listed: true,
         serverName: "figma-plugin",
         reasonCode: "ok",
      },
      detRunsDir: {
         ready: true,
         reasonCode: "ok",
         envName: "STUDIO_DET_RUNS_DIR",
      },
   },
};

function Probe() {
   const { status, checking, error, recheck } = useStudioReadiness();
   return (
      <div>
         <span data-testid="probe-status">
            {status === null ? "null" : String(status.ready)}
         </span>
         <span data-testid="probe-checking">{String(checking)}</span>
         <span data-testid="probe-error">
            {error === null ? "null" : error}
         </span>
         <button type="button" onClick={recheck}>
            recheck-probe
         </button>
      </div>
   );
}

function renderProvider() {
   return render(
      <StudioReadinessProvider>
         <Probe />
      </StudioReadinessProvider>,
   );
}

type FetchHandler = (url: string) => Response | Promise<Response>;

function stubFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
   const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
         typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
      return Promise.resolve(handler(url));
   });
   vi.stubGlobal("fetch", fetchMock);
   return fetchMock;
}

afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

describe("StudioReadinessProvider", () => {
   it("auto-checks GET /api/environment once on mount and stores the status", async () => {
      const fetchMock = stubFetch((url) => {
         expect(url).toBe("/api/environment");
         return Response.json(READY_STATUS);
      });
      renderProvider();
      expect(screen.getByTestId("probe-status")).toHaveTextContent("null");
      await waitFor(() =>
         expect(screen.getByTestId("probe-checking")).toHaveTextContent(
            "false",
         ),
      );
      expect(screen.getByTestId("probe-status")).toHaveTextContent("true");
      expect(screen.getByTestId("probe-error")).toHaveTextContent("null");
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it("recheck() issues a second fetch", async () => {
      const fetchMock = stubFetch(() => Response.json(READY_STATUS));
      const user = userEvent.setup();
      renderProvider();
      await waitFor(() =>
         expect(screen.getByTestId("probe-checking")).toHaveTextContent(
            "false",
         ),
      );
      await user.click(screen.getByRole("button", { name: "recheck-probe" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(
         fetchMock.mock.calls.every((call) =>
            String(call[0]).endsWith("/api/environment"),
         ),
      ).toBe(true);
   });

   it("maps an HTTP failure to the error state with the Vietnamese message", async () => {
      stubFetch(() => new Response("server down", { status: 503 }));
      renderProvider();
      await waitFor(() =>
         expect(screen.getByTestId("probe-error")).toHaveTextContent(
            "Kiểm tra môi trường thất bại (HTTP 503).",
         ),
      );
      expect(screen.getByTestId("probe-checking")).toHaveTextContent("false");
      expect(screen.getByTestId("probe-status")).toHaveTextContent("null");
   });

   it("fails closed on a malformed response body instead of storing it", async () => {
      stubFetch(() =>
         Response.json({ ready: true, checks: { claudeCode: {} } }),
      );
      renderProvider();
      await waitFor(() =>
         expect(screen.getByTestId("probe-error")).toHaveTextContent(
            "Phản hồi kiểm tra môi trường không đúng định dạng.",
         ),
      );
      expect(screen.getByTestId("probe-status")).toHaveTextContent("null");
   });

   it("maps a transport failure to the error state", async () => {
      const fetchMock = vi.fn(() =>
         Promise.reject(new Error("network unreachable")),
      );
      vi.stubGlobal("fetch", fetchMock);
      renderProvider();
      await waitFor(() =>
         expect(screen.getByTestId("probe-error")).toHaveTextContent(
            "network unreachable",
         ),
      );
   });

   it("drops a stale in-flight response that resolves after a newer recheck", async () => {
      let releaseFirst!: (response: Response) => void;
      const firstGate = new Promise<Response>((resolve) => {
         releaseFirst = resolve;
      });
      let calls = 0;
      const fetchMock = vi.fn(() => {
         calls += 1;
         if (calls === 1) {
            // The mount check hangs until the test releases it — by then a
            // recheck() has already completed, so the stale result must lose.
            return firstGate;
         }
         return Promise.resolve(
            Response.json({
               ...READY_STATUS,
               ready: true,
            }),
         );
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderProvider();
      await waitFor(() =>
         expect(screen.getByTestId("probe-checking")).toHaveTextContent("true"),
      );
      await user.click(screen.getByRole("button", { name: "recheck-probe" }));
      await waitFor(() => {
         expect(screen.getByTestId("probe-status")).toHaveTextContent("true");
         expect(screen.getByTestId("probe-checking")).toHaveTextContent(
            "false",
         );
      });
      // Now resolve the stale mount check (failure result) — it must NOT
      // overwrite the newer recheck result nor resurrect an error state.
      releaseFirst(new Response("late failure", { status: 500 }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.getByTestId("probe-status")).toHaveTextContent("true");
      expect(screen.getByTestId("probe-error")).toHaveTextContent("null");
   });
});

describe("isStudioReadinessStatus", () => {
   it("accepts the frozen contract shape", () => {
      expect(isStudioReadinessStatus(READY_STATUS)).toBe(true);
   });

   it.each<{ description: string; value: unknown }>([
      { description: "null", value: null },
      { description: "undefined", value: undefined },
      { description: "a bare string", value: "ready" },
      {
         description: "a non-boolean ready flag",
         value: { ready: "yes", checks: {} },
      },
      { description: "a body without checks", value: { ready: true } },
      {
         description: "a body missing the detRunsDir check",
         value: {
            ready: true,
            checks: {
               claudeCode: { ready: true },
               figmaMcp: { ready: true },
            },
         },
      },
      {
         description: "a body whose claudeCode lacks ready",
         value: {
            ready: true,
            checks: {
               claudeCode: { version: "2.1.322" },
               figmaMcp: { ready: true },
               detRunsDir: { ready: true },
            },
         },
      },
   ])("rejects $description", ({ value }) => {
      expect(isStudioReadinessStatus(value)).toBe(false);
   });
});
