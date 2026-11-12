import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
   ReadinessIndicator,
   resolveStudioReadinessState,
   STUDIO_READINESS_STATE_LABELS_VI,
} from "./readiness-indicator";
import { useStudioReadiness } from "@/src/modules/studio/readiness";
import type { StudioReadinessContextValue } from "@/src/modules/studio/readiness";
import type { StudioReadinessStatus } from "@/src/modules/studio/shared/contracts/build-flow";

/**
 * [70] The header readiness cluster renders exactly the four contract states
 * from the frozen hook, exposes the "Kiểm tra" re-check button, and makes
 * failure details accessible through a click-triggered popover (never
 * hover-only). The hook is mocked — this component owns no fetch logic.
 */

vi.mock("@/src/modules/studio/readiness", () => ({
   useStudioReadiness: vi.fn(),
}));

const NOT_READY_STATUS: StudioReadinessStatus = {
   ready: false,
   checks: {
      claudeCode: { ready: true, version: "2.1.322", reasonCode: "ok" },
      figmaMcp: {
         ready: false,
         listed: false,
         serverName: null,
         reasonCode: "mcp-not-listed",
      },
      detRunsDir: {
         ready: false,
         reasonCode: "not-configured",
         envName: "STUDIO_DET_RUNS_DIR",
      },
   },
};

function mockHook(overrides: Partial<StudioReadinessContextValue>): void {
   vi.mocked(useStudioReadiness).mockReturnValue({
      status: null,
      checking: false,
      error: null,
      recheck: () => {},
      ...overrides,
   });
}

beforeEach(() => {
   mockHook({});
});

afterEach(() => {
   vi.restoreAllMocks();
});

describe("ReadinessIndicator — four display states", () => {
   it("renders Đã kết nối when the status is ready", () => {
      mockHook({ status: { ...NOT_READY_STATUS, ready: true } });
      render(<ReadinessIndicator />);
      expect(screen.getByText("Đã kết nối")).toBeInTheDocument();
      expect(screen.queryByText("Lỗi")).not.toBeInTheDocument();
   });

   it("renders Chưa kiểm tra before the first check completes", () => {
      mockHook({ status: null, checking: false, error: null });
      render(<ReadinessIndicator />);
      expect(screen.getByText("Chưa kiểm tra")).toBeInTheDocument();
   });

   it("renders Đang kiểm tra while a check is in flight (checking wins over a stale failure)", () => {
      mockHook({
         checking: true,
         status: NOT_READY_STATUS,
         error: "stale error",
      });
      render(<ReadinessIndicator />);
      expect(screen.getByText("Đang kiểm tra")).toBeInTheDocument();
      expect(screen.queryByText("Lỗi")).not.toBeInTheDocument();
   });

   it("renders Lỗi on a transport failure", () => {
      mockHook({ error: "Kiểm tra môi trường thất bại (HTTP 500)." });
      render(<ReadinessIndicator />);
      expect(screen.getByText("Lỗi")).toBeInTheDocument();
   });

   it("renders Lỗi when the status exists but is not ready", () => {
      mockHook({ status: NOT_READY_STATUS });
      render(<ReadinessIndicator />);
      expect(screen.getByText("Lỗi")).toBeInTheDocument();
      expect(screen.queryByText("Đã kết nối")).not.toBeInTheDocument();
   });
});

describe("resolveStudioReadinessState", () => {
   it("precedes checking over ready/error/unchecked", () => {
      expect(resolveStudioReadinessState(null, true, null)).toBe("checking");
      expect(resolveStudioReadinessState(NOT_READY_STATUS, true, null)).toBe(
         "checking",
      );
   });

   it("maps the exact contract conditions", () => {
      expect(resolveStudioReadinessState(null, false, null)).toBe("unchecked");
      expect(
         resolveStudioReadinessState(
            { ...NOT_READY_STATUS, ready: true },
            false,
            null,
         ),
      ).toBe("connected");
      expect(resolveStudioReadinessState(null, false, "boom")).toBe("error");
      expect(resolveStudioReadinessState(NOT_READY_STATUS, false, null)).toBe(
         "error",
      );
   });

   it("labels cover every display state", () => {
      expect(Object.keys(STUDIO_READINESS_STATE_LABELS_VI).sort()).toEqual([
         "checking",
         "connected",
         "error",
         "unchecked",
      ]);
      expect(Object.values(STUDIO_READINESS_STATE_LABELS_VI)).toEqual([
         "Đã kết nối",
         "Chưa kiểm tra",
         "Đang kiểm tra",
         "Lỗi",
      ]);
   });
});

describe("ReadinessIndicator — Kiểm tra button", () => {
   it("triggers recheck() on click", async () => {
      const recheck = vi.fn();
      mockHook({ recheck });
      const user = userEvent.setup();
      render(<ReadinessIndicator />);
      await user.click(screen.getByRole("button", { name: "Kiểm tra" }));
      expect(recheck).toHaveBeenCalledTimes(1);
   });
});

describe("ReadinessIndicator — failure popover", () => {
   it("is closed by default and opens on click, listing the three checks with machine tokens verbatim", async () => {
      mockHook({ status: NOT_READY_STATUS });
      const user = userEvent.setup();
      render(<ReadinessIndicator />);

      expect(
         screen.queryByText("Trạng thái môi trường"),
      ).not.toBeInTheDocument();
      await user.click(screen.getByText("Lỗi"));

      expect(
         await screen.findByText("Trạng thái môi trường"),
      ).toBeInTheDocument();
      // Per-check rows: machine tokens verbatim (version, reasonCodes, env NAME).
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
      expect(screen.getByText("2.1.322")).toBeInTheDocument();
      expect(screen.getByText("Figma MCP")).toBeInTheDocument();
      expect(screen.getByText("mcp-not-listed")).toBeInTheDocument();
      expect(screen.getByText("STUDIO_DET_RUNS_DIR")).toBeInTheDocument();
      expect(screen.getByText("not-configured")).toBeInTheDocument();
      // Short Vietnamese explanations per row.
      expect(
         screen.getByText("Figma MCP chưa được khai báo trong Claude Code."),
      ).toBeInTheDocument();
      expect(
         screen.getByText("Chưa cấu hình biến môi trường STUDIO_DET_RUNS_DIR."),
      ).toBeInTheDocument();
   });

   it("falls back to the reasonCode for Figma MCP when no serverName exists", async () => {
      mockHook({ status: NOT_READY_STATUS });
      const user = userEvent.setup();
      render(<ReadinessIndicator />);
      await user.click(screen.getByText("Lỗi"));
      await screen.findByText("Trạng thái môi trường");
      expect(screen.queryByText("figma-plugin")).not.toBeInTheDocument();
      expect(screen.getByText("mcp-not-listed")).toBeInTheDocument();
   });

   it("shows the transport error message when no status body exists", async () => {
      mockHook({ error: "Kiểm tra môi trường thất bại (HTTP 503)." });
      const user = userEvent.setup();
      render(<ReadinessIndicator />);
      await user.click(screen.getByText("Lỗi"));
      expect(
         await screen.findByText("Kiểm tra môi trường thất bại (HTTP 503)."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
   });

   it("stays closed in the connected state (no failure details to disclose)", async () => {
      mockHook({ status: { ...NOT_READY_STATUS, ready: true } });
      const user = userEvent.setup();
      render(<ReadinessIndicator />);
      await user.click(screen.getByText("Đã kết nối"));
      // Give any accidental popover a tick to open.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(
         screen.queryByText("Trạng thái môi trường"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("mcp-not-listed")).not.toBeInTheDocument();
   });
});
