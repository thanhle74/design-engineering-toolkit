/**
 * [70] BuildScreen one-click flow tests — hermetic: fetch is stubbed globally,
 * no server, no child processes, no real flow. The honesty contract is the
 * subject: readiness gating of the ONE Build button (four frozen states),
 * disabled Hyvä option, instant parser feedback, 202→2s polling through real
 * snapshot transitions (fake timers), 409 busy ADOPTION, 503 environment
 * alert with the server checks + Kiểm tra action, cancel happy/409, terminal
 * results link, `?analysis=` prefill + read-only summary, and remount
 * resumption of an active flow via GET /api/build-flow.
 *
 * The screen consumes the globally-mounted StudioReadinessProvider
 * (app/layout.tsx, W-A's shell commit) — tests mount it explicitly.
 * Interactions use fireEvent + act-wrapped timer flushes: state updates from
 * deferred timers/intervals must run inside act to reach the DOM.
 */
import {
   act,
   cleanup,
   fireEvent,
   render,
   screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
   BUILD_FLOW_STAGES,
   type BuildFlowRunSnapshot,
   type BuildFlowStageName,
   type BuildFlowStageRecord,
   type StudioReadinessStatus,
} from "@/src/modules/studio/shared/contracts/build-flow";
import type { AgentAnalysisSnapshot } from "@/src/modules/studio/shared/contracts";
import { StudioReadinessProvider } from "@/src/modules/studio/readiness";

import { DEMO_FIGMA_SOURCE } from "../components/build-flow-view";
import { BuildScreen } from "./build.screen";

const FLOW_ID = "flow-910001";
const BUILD_RUN_ID = "run-424242";
const T0 = "2026-11-12T00:00:00.000Z";
const T1 = "2026-11-12T00:00:01.000Z";
const T2 = "2026-11-12T00:00:02.000Z";
const T3 = "2026-11-12T00:01:00.000Z";

const READY_STATUS: StudioReadinessStatus = {
   ready: true,
   checks: {
      claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
      figmaMcp: {
         ready: true,
         listed: true,
         serverName: "plugin:figma:figma",
         reasonCode: "ok",
      },
      detRunsDir: {
         ready: true,
         reasonCode: "ok",
         envName: "STUDIO_DET_RUNS_DIR",
      },
   },
};

const NOT_READY_STATUS: StudioReadinessStatus = {
   ready: false,
   checks: {
      claudeCode: READY_STATUS.checks.claudeCode,
      figmaMcp: READY_STATUS.checks.figmaMcp,
      detRunsDir: {
         ready: false,
         reasonCode: "not-configured",
         envName: "STUDIO_DET_RUNS_DIR",
      },
   },
};

function stage(
   name: BuildFlowStageName,
   overrides: Partial<BuildFlowStageRecord> = {},
): BuildFlowStageRecord {
   return {
      stage: name,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      analysisId: null,
      buildRunId: null,
      message: null,
      ...overrides,
   };
}

function stages(
   spec: Partial<Record<BuildFlowStageName, Partial<BuildFlowStageRecord>>>,
): BuildFlowStageRecord[] {
   return BUILD_FLOW_STAGES.map((name) => stage(name, spec[name] ?? {}));
}

function snapshot(
   state: BuildFlowRunSnapshot["state"],
   stageSpec: Partial<
      Record<BuildFlowStageName, Partial<BuildFlowStageRecord>>
   >,
   extra: Partial<BuildFlowRunSnapshot> = {},
): BuildFlowRunSnapshot {
   return {
      flowId: FLOW_ID,
      journalSchemaVersion: 1,
      state,
      request: {
         fileKey: "vNPtfBRpYM3PsExirVqhmt",
         nodeId: "245:2",
         baseConfigId: "slaunchpad-home-real-derived",
         target: "magento-page-builder",
      },
      stages: stages(stageSpec),
      currentStage: null,
      error: null,
      startedAt: T0,
      finishedAt: null,
      pid: 424242,
      ...extra,
   };
}

const RUNNING = snapshot(
   "running",
   {
      "verify-source": {
         status: "success",
         startedAt: T0,
         finishedAt: T1,
         message: "Đã khớp bản ghi source-identity đã commit.",
      },
      snapshot: {
         status: "success",
         startedAt: T1,
         finishedAt: T2,
         message: "Dùng lại snapshot đã ghim.",
      },
      "ai-analysis": {
         status: "running",
         startedAt: T2,
         analysisId: "agent-910001",
      },
   },
   { currentStage: "ai-analysis" },
);

const RUNNING_MAPPING = snapshot(
   "running",
   {
      "verify-source": {
         status: "success",
         startedAt: T0,
         finishedAt: T1,
      },
      snapshot: { status: "success", startedAt: T1, finishedAt: T2 },
      "ai-analysis": {
         status: "success",
         startedAt: T2,
         finishedAt: T3,
         analysisId: "agent-910001",
      },
      mapping: { status: "running", startedAt: T3 },
   },
   { currentStage: "mapping" },
);

const COMPLETED = snapshot(
   "completed",
   {
      "verify-source": {
         status: "success",
         startedAt: T0,
         finishedAt: T1,
      },
      snapshot: { status: "success", startedAt: T1, finishedAt: T2 },
      "ai-analysis": {
         status: "success",
         startedAt: T2,
         finishedAt: T3,
         analysisId: "agent-910001",
      },
      mapping: { status: "success", startedAt: T3, finishedAt: T3 },
      compose: {
         status: "success",
         startedAt: T3,
         finishedAt: T3,
         buildRunId: BUILD_RUN_ID,
      },
      results: {
         status: "success",
         startedAt: T3,
         finishedAt: T3,
         buildRunId: BUILD_RUN_ID,
         message: "Bundle đã xác minh build-manifest.json.",
      },
   },
   { currentStage: "results", finishedAt: T3 },
);

const CANCELLED = snapshot("cancelled", {
   "verify-source": {
      status: "success",
      startedAt: T0,
      finishedAt: T1,
   },
   snapshot: { status: "success", startedAt: T1, finishedAt: T2 },
   "ai-analysis": {
      status: "cancelled",
      startedAt: T2,
      message: "Người dùng đã hủy.",
   },
});

const ANALYSIS_SNAPSHOT: AgentAnalysisSnapshot = {
   analysisId: "agent-910001",
   state: "exited",
   request: {
      fileKey: "vNPtfBRpYM3PsExirVqhmt",
      nodeId: "245:2",
      baseConfigId: "slaunchpad-home-real-derived",
   },
   baseConfigPath: "/tmp/base/build-config.json",
   allowedFigmaTool: "mcp__plugin_figma_figma__get_metadata",
   claudeVersion: "2.1.322",
   command: ["claude"],
   exitCode: 0,
   signal: null,
   timedOut: false,
   cancelled: false,
   startedAt: T0,
   finishedAt: T1,
   pid: 424242,
   stdoutTail: "",
   stderrTail: "",
   spawnError: null,
   outcome: "plan-ready",
   envelopeSafe: null,
   grounded: true,
};

interface Route {
   test: (url: string, init: RequestInit | undefined) => boolean;
   respond: (
      url: string,
      init: RequestInit | undefined,
   ) => Response | Promise<Response>;
}

function stubFetch(routes: Route[]): ReturnType<typeof vi.fn> {
   const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
         typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
      for (const route of routes) {
         if (route.test(url, init)) {
            return Promise.resolve(route.respond(url, init));
         }
      }
      return Promise.resolve(
         Response.json(
            { error: { code: "unexpected", message: `unexpected ${url}` } },
            { status: 500 },
         ),
      );
   });
   vi.stubGlobal("fetch", fetchMock);
   return fetchMock;
}

const envRoute = (
   status: StudioReadinessStatus = READY_STATUS,
   httpStatus = 200,
   hang = false,
): Route => ({
   test: (url) => url.endsWith("/api/environment"),
   respond: () =>
      hang
         ? new Promise<Response>(() => {})
         : Response.json(status, { status: httpStatus }),
});

const activeFlowRoute = (active: BuildFlowRunSnapshot | null): Route => ({
   test: (url, init) =>
      url.endsWith("/api/build-flow") && (init?.method ?? "GET") !== "POST",
   respond: () => Response.json({ active }),
});

const startRoute = (respond: () => Response): Route => ({
   test: (url, init) =>
      url.endsWith("/api/build-flow") && init?.method === "POST",
   respond: () => respond(),
});

const flowDetailRoute = (next: () => BuildFlowRunSnapshot): Route => ({
   test: (url) => url === `/api/build-flow/${FLOW_ID}`,
   respond: () => Response.json(next()),
});

const cancelRoute = (respond: () => Response): Route => ({
   test: (url, init) =>
      url === `/api/build-flow/${FLOW_ID}/cancel` && init?.method === "POST",
   respond: () => respond(),
});

const analysisRoute = (id: string, respond: () => Response): Route => ({
   test: (url) => url === `/api/agent/analyses/${id}`,
   respond: () => respond(),
});

function renderScreen() {
   return render(
      <StudioReadinessProvider>
         <BuildScreen />
      </StudioReadinessProvider>,
   );
}

/** Fire pending timers (and their async fetch continuations) inside act. */
async function flush(ms = 1) {
   await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
   });
}

function buildButton() {
   return screen.getByRole("button", { name: "Build" }) as HTMLButtonElement;
}

function envFetchCalls(fetchMock: ReturnType<typeof vi.fn>): number {
   return fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/environment"),
   ).length;
}

function typeSource(value: string) {
   fireEvent.change(screen.getByLabelText("Nguồn thiết kế Figma"), {
      target: { value },
   });
}

beforeEach(() => {
   vi.useFakeTimers();
   window.history.replaceState(null, "", "/build");
});

afterEach(() => {
   cleanup();
   vi.useRealTimers();
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
});

describe("readiness gating of the ONE Build button", () => {
   it("blocks while the environment check is in flight (Đang kiểm tra)", async () => {
      stubFetch([envRoute(READY_STATUS, 200, true), activeFlowRoute(null)]);
      renderScreen();
      await flush();
      expect(buildButton()).toBeDisabled();
      expect(screen.getByText("Đang kiểm tra")).toBeInTheDocument();
      // Name matched by regex: the recheck Button's own real loading state
      // (loading={checking}) prefixes the accessible name with "loading".
      expect(
         screen.getByRole("button", { name: /Kiểm tra lại/ }),
      ).toBeInTheDocument();
   });

   it("blocks with Lỗi when the check transport fails", async () => {
      stubFetch([envRoute(READY_STATUS, 500), activeFlowRoute(null)]);
      renderScreen();
      await flush();
      expect(buildButton()).toBeDisabled();
      expect(screen.getByText("Lỗi")).toBeInTheDocument();
   });

   it("blocks with Chưa sẵn sàng when a check fails, naming the reason", async () => {
      stubFetch([envRoute(NOT_READY_STATUS), activeFlowRoute(null)]);
      renderScreen();
      await flush();
      expect(buildButton()).toBeDisabled();
      expect(screen.getByText("Chưa sẵn sàng")).toBeInTheDocument();
   });

   it("enables Build when ready and the prefilled demo source parses", async () => {
      stubFetch([envRoute(), activeFlowRoute(null)]);
      renderScreen();
      await flush();
      expect(buildButton()).toBeEnabled();
      expect(screen.getByLabelText("Nguồn thiết kế Figma")).toHaveValue(
         DEMO_FIGMA_SOURCE,
      );
      expect(
         screen.getByText(/Nguồn Homepage Slaunchpad đã xác minh/),
      ).toBeInTheDocument();
   });
});

describe("output selector", () => {
   it("offers Magento Page Builder enabled and Hyvä PHTML honestly disabled", async () => {
      stubFetch([envRoute(), activeFlowRoute(null)]);
      renderScreen();
      await flush();

      fireEvent.mouseDown(screen.getByLabelText("Đầu ra"));
      await flush();

      const disabledOption = screen.getByRole("option", {
         name: "Hyvä PHTML — Chưa hỗ trợ",
      });
      expect(disabledOption).toHaveAttribute("aria-disabled", "true");
      const enabledOption = screen.getByRole("option", {
         name: "Magento Page Builder",
      });
      expect(enabledOption).not.toHaveAttribute("aria-disabled", "true");
   });
});

describe("instant source validation", () => {
   it("shows the parser's Vietnamese message and disables Build for bad input", async () => {
      stubFetch([envRoute(), activeFlowRoute(null)]);
      renderScreen();
      await flush();
      expect(buildButton()).toBeEnabled();

      typeSource("");
      expect(buildButton()).toBeDisabled();

      typeSource("https://example.com/not-figma");
      expect(
         screen.getByText(/Đây không phải URL figma\.com/),
      ).toBeInTheDocument();
      expect(buildButton()).toBeDisabled();

      // A bare node id is acceptable input too.
      typeSource("245:2");
      expect(buildButton()).toBeEnabled();
   });
});

describe("start + 2s polling through real snapshot transitions", () => {
   it("posts the figmaInput, polls every 2s, and renders the completed results", async () => {
      const queue: BuildFlowRunSnapshot[] = [
         RUNNING,
         RUNNING_MAPPING,
         COMPLETED,
      ];
      const fetchMock = stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               { flowId: FLOW_ID, state: "queued" },
               { status: 202 },
            ),
         ),
         flowDetailRoute(() => queue.shift() ?? COMPLETED),
      ]);
      renderScreen();
      await flush();

      fireEvent.click(buildButton());
      await flush();

      const postCall = fetchMock.mock.calls.find(
         ([url, init]) =>
            String(url).endsWith("/api/build-flow") && init?.method === "POST",
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
         figmaInput: DEMO_FIGMA_SOURCE,
         target: "magento-page-builder",
      });

      // First poll renders the running pipeline with the analysis token.
      expect(screen.getByText(FLOW_ID)).toBeInTheDocument();
      expect(screen.getByText("agent-910001")).toBeInTheDocument();
      expect(screen.getByTestId("build-stage-detail")).toHaveTextContent(
         "AI phân tích",
      );
      expect(screen.getByTestId("build-stage-detail")).toHaveTextContent(
         "Đang chạy",
      );
      expect(screen.getByRole("button", { name: /Hủy/ })).toBeInTheDocument();

      // Two more 2s ticks: mapping runs, then the flow completes.
      await flush(2000);
      expect(screen.getByTestId("build-stage-detail")).toHaveTextContent(
         "Chuẩn hóa & mapping",
      );

      await flush(2000);
      const resultsLink = screen.getByRole("link", { name: "Xem kết quả" });
      expect(resultsLink).toHaveAttribute("href", `/runs/${BUILD_RUN_ID}`);
      // The run id appears both in the detail panel and the results panel.
      expect(screen.getAllByText(BUILD_RUN_ID).length).toBeGreaterThan(0);
      expect(screen.getByText("install-homepage.php")).toBeInTheDocument();
      expect(screen.getByText("pagebuilder-content.html")).toBeInTheDocument();
      expect(screen.getByText("build-manifest.json")).toBeInTheDocument();
      expect(screen.getByText("mapping-and-gaps.json")).toBeInTheDocument();
      expect(
         screen.getByRole("button", { name: /Chạy lại/ }),
      ).toBeInTheDocument();
      expect(
         screen.queryByRole("button", { name: /Hủy/ }),
      ).not.toBeInTheDocument();
   });

   it("clicking a step shows that stage's detail", async () => {
      const queue: BuildFlowRunSnapshot[] = [RUNNING];
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               { flowId: FLOW_ID, state: "queued" },
               { status: 202 },
            ),
         ),
         flowDetailRoute(() => queue.shift() ?? RUNNING),
      ]);
      renderScreen();
      await flush();
      fireEvent.click(buildButton());
      await flush();

      // Default detail follows currentStage (ai-analysis).
      expect(screen.getByTestId("build-stage-detail")).toHaveTextContent(
         "AI phân tích",
      );

      // Click the finished first step: its real times + message show.
      fireEvent.click(screen.getByText("Xác thực nguồn"));
      const detail = screen.getByTestId("build-stage-detail");
      expect(detail).toHaveTextContent("Xác thực nguồn");
      expect(detail).toHaveTextContent("Hoàn tất");
      expect(detail).toHaveTextContent(T0);
      expect(detail).toHaveTextContent(T1);
      expect(detail).toHaveTextContent(
         "Đã khớp bản ghi source-identity đã commit.",
      );
   });
});

describe("409 flow-busy adoption", () => {
   it("adopts the active snapshot and resumes polling it", async () => {
      const queue: BuildFlowRunSnapshot[] = [RUNNING_MAPPING, COMPLETED];
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               {
                  error: {
                     code: "flow-busy",
                     message: "Một luồng Build khác đang chạy.",
                  },
                  active: RUNNING,
               },
               { status: 409 },
            ),
         ),
         flowDetailRoute(() => queue.shift() ?? COMPLETED),
      ]);
      renderScreen();
      await flush();

      fireEvent.click(buildButton());
      await flush();

      expect(
         screen.getByText(
            "Đã có luồng Build đang chạy — hiển thị trạng thái thật của luồng đó.",
         ),
      ).toBeInTheDocument();
      expect(screen.getByText(FLOW_ID)).toBeInTheDocument();

      // Polling continues on the adopted flow.
      await flush(2000);
      expect(screen.getByTestId("build-stage-detail")).toHaveTextContent(
         "Chuẩn hóa & mapping",
      );
   });
});

describe("503 environment-not-ready", () => {
   it("renders the server checks with a Kiểm tra action", async () => {
      const fetchMock = stubFetch([
         envRoute(READY_STATUS),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               {
                  error: {
                     code: "environment-not-ready",
                     message: "Môi trường Studio chưa sẵn sàng.",
                  },
                  checks: NOT_READY_STATUS.checks,
               },
               { status: 503 },
            ),
         ),
      ]);
      renderScreen();
      await flush();
      const envCallsAfterMount = envFetchCalls(fetchMock);

      fireEvent.click(buildButton());
      await flush();

      expect(
         screen.getByText(
            "Môi trường chưa sẵn sàng (mã: environment-not-ready)",
         ),
      ).toBeInTheDocument();
      expect(
         screen.getByText("Môi trường Studio chưa sẵn sàng."),
      ).toBeInTheDocument();
      expect(screen.getByText("claudeCode")).toBeInTheDocument();
      expect(screen.getByText("figmaMcp")).toBeInTheDocument();
      expect(screen.getByText(/detRunsDir/)).toBeInTheDocument();
      expect(screen.getByText(/not-configured/)).toBeInTheDocument();

      // The Kiểm tra action re-runs the environment check.
      fireEvent.click(screen.getByRole("button", { name: /^Kiểm tra$/ }));
      await flush();
      expect(envFetchCalls(fetchMock)).toBeGreaterThan(envCallsAfterMount);
   });
});

describe("400 invalid-input", () => {
   it("renders the machine code verbatim with the server message", async () => {
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               {
                  error: {
                     code: "invalid-input",
                     message: "Không phân tích được nguồn Figma.",
                  },
               },
               { status: 400 },
            ),
         ),
      ]);
      renderScreen();
      await flush();

      fireEvent.click(buildButton());
      await flush();

      expect(
         screen.getByText("Khởi chạy luồng Build thất bại (mã: invalid-input)"),
      ).toBeInTheDocument();
      expect(
         screen.getByText("Không phân tích được nguồn Figma."),
      ).toBeInTheDocument();
      // No pipeline was started.
      expect(screen.queryByText(/Quy trình Build/)).not.toBeInTheDocument();
   });
});

describe("cancel", () => {
   async function startRunningFlow() {
      const queue: BuildFlowRunSnapshot[] = [RUNNING];
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               { flowId: FLOW_ID, state: "queued" },
               { status: 202 },
            ),
         ),
         flowDetailRoute(() => queue.shift() ?? RUNNING),
      ]);
      renderScreen();
      await flush();
      fireEvent.click(buildButton());
      await flush();
      expect(screen.getByRole("button", { name: /Hủy/ })).toBeInTheDocument();
   }

   it("200 → refreshes the snapshot to the cancelled terminal state", async () => {
      await startRunningFlow();
      // Re-stub: the cancel route plus a detail route that agrees with it.
      stubFetch([
         cancelRoute(() => Response.json({ snapshot: CANCELLED })),
         flowDetailRoute(() => CANCELLED),
      ]);
      fireEvent.click(screen.getByRole("button", { name: /Hủy/ }));
      await flush();

      expect(screen.getByText("Luồng Build đã bị hủy")).toBeInTheDocument();
      expect(
         screen.getByRole("button", { name: /Chạy lại/ }),
      ).toBeInTheDocument();
      expect(
         screen.queryByRole("button", { name: /Hủy/ }),
      ).not.toBeInTheDocument();
   });

   it("409 → shows the server message with the code verbatim", async () => {
      await startRunningFlow();
      stubFetch([
         cancelRoute(() =>
            Response.json(
               {
                  error: {
                     code: "flow-not-cancellable",
                     message: "Luồng đã kết thúc.",
                  },
               },
               { status: 409 },
            ),
         ),
         flowDetailRoute(() => RUNNING),
      ]);
      fireEvent.click(screen.getByRole("button", { name: /Hủy/ }));
      await flush();
      expect(
         screen.getByText("Luồng đã kết thúc. (mã: flow-not-cancellable)"),
      ).toBeInTheDocument();
      // The flow stays live and cancellable. Name matched by regex on purpose:
      // antd's leaving loading-icon motion can briefly prefix the accessible
      // name ("loading Hủy") after the cancel request settles.
      expect(screen.getByRole("button", { name: /Hủy/ })).toBeInTheDocument();
   });
});

describe("Chạy lại after a terminal flow", () => {
   it("starts a new flow with the same source input", async () => {
      const queue: BuildFlowRunSnapshot[] = [COMPLETED, RUNNING];
      const fetchMock = stubFetch([
         envRoute(),
         activeFlowRoute(null),
         startRoute(() =>
            Response.json(
               { flowId: FLOW_ID, state: "queued" },
               { status: 202 },
            ),
         ),
         flowDetailRoute(() => queue.shift() ?? RUNNING),
      ]);
      renderScreen();
      await flush();
      fireEvent.click(buildButton());
      await flush();
      expect(
         screen.getByRole("button", { name: /Chạy lại/ }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Chạy lại/ }));
      await flush();

      const posts = fetchMock.mock.calls.filter(
         ([url, init]) =>
            String(url).endsWith("/api/build-flow") && init?.method === "POST",
      );
      expect(posts).toHaveLength(2);
      expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({
         figmaInput: DEMO_FIGMA_SOURCE,
         target: "magento-page-builder",
      });
      expect(screen.getByRole("button", { name: /Hủy/ })).toBeInTheDocument();
      expect(
         screen.queryByRole("button", { name: /Chạy lại/ }),
      ).not.toBeInTheDocument();
   });
});

describe("?analysis= deep link", () => {
   it("prefills the source and renders the read-only summary card", async () => {
      window.history.replaceState(null, "", "/build?analysis=agent-910001");
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         analysisRoute("agent-910001", () =>
            Response.json({
               snapshot: ANALYSIS_SNAPSHOT,
               plan: null,
               approval: null,
            }),
         ),
      ]);
      renderScreen();
      await flush();

      expect(screen.getByLabelText("Nguồn thiết kế Figma")).toHaveValue(
         DEMO_FIGMA_SOURCE,
      );
      expect(
         screen.getByText("Phân tích nguồn (từ /agent)"),
      ).toBeInTheDocument();
      expect(screen.getByText("agent-910001")).toBeInTheDocument();
      expect(screen.getByText("plan-ready")).toBeInTheDocument();
      expect(
         screen.getByText(/không còn bước duyệt riêng/),
      ).toBeInTheDocument();
      // No approval affordance anywhere.
      expect(
         screen.queryByRole("button", { name: /Duyệt/ }),
      ).not.toBeInTheDocument();
   });

   it("renders an honest empty state for an unknown id", async () => {
      window.history.replaceState(null, "", "/build?analysis=agent-404");
      stubFetch([
         envRoute(),
         activeFlowRoute(null),
         analysisRoute("agent-404", () =>
            Response.json(
               {
                  error: {
                     code: "analysis-not-found",
                     message: "No analysis matches the requested id.",
                  },
               },
               { status: 404 },
            ),
         ),
      ]);
      renderScreen();
      await flush();
      expect(
         screen.getByText("Không đọc được phân tích agent-404"),
      ).toBeInTheDocument();
   });
});

describe("page reload mid-flow", () => {
   it("restores the active flow from GET /api/build-flow without a POST", async () => {
      const fetchMock = stubFetch([
         envRoute(),
         activeFlowRoute(RUNNING),
         flowDetailRoute(() => COMPLETED),
      ]);
      renderScreen();
      await flush();

      expect(screen.getByText(FLOW_ID)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Hủy/ })).toBeInTheDocument();

      const posts = fetchMock.mock.calls.filter(
         ([url, init]) =>
            String(url).endsWith("/api/build-flow") && init?.method === "POST",
      );
      expect(posts).toHaveLength(0);
   });
});
