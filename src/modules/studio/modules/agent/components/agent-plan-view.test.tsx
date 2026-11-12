/**
 * [65] AgentPlanView UI tests — proposals only, never engine verdicts.
 *
 * The grounded plan renders the proposal table + approval collapse; the
 * ungrounded plan renders the honest block and NO approval affordance at
 * all. Machine vocabulary (node ids, roles, mcp-observed-unpinned) stays
 * verbatim per the [61] doctrine.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VALID_AGENT_PLAN } from "@/src/modules/studio/shared/contracts/agent-plan.test";
import type { AgentPlan } from "@/src/modules/studio/shared/contracts";
import type { ApprovalPreview } from "@/src/modules/studio/server/claude-agent/plan-materializer";

import { AgentPlanView } from "./agent-plan-view";

afterEach(cleanup);

const PREVIEW: ApprovalPreview = {
   totalProposedAssignments: 2,
   pinnedAssignments: 2,
   droppedNodeIds: [],
};

function renderView(
   overrides: Partial<Parameters<typeof AgentPlanView>[0]> = {},
): void {
   render(
      <AgentPlanView
         plan={VALID_AGENT_PLAN}
         approvalPreview={PREVIEW}
         approvalPreviewError={null}
         approvable={true}
         approving={false}
         onApprove={() => {}}
         buildLink={null}
         {...overrides}
      />,
   );
}

describe("AgentPlanView — grounded plan", () => {
   it("renders the proposal table with the section and machine vocabulary verbatim", () => {
      renderView();
      expect(screen.getByText("SECTION/Hero/Primary")).toBeInTheDocument();
      expect(screen.getByText("245:5")).toBeInTheDocument();
      expect(screen.getByText(/banner-hero/)).toBeInTheDocument();
      // Verbatim twice: the observation line and the limitation entry.
      expect(
         screen.getAllByText(/mcp-observed-unpinned/).length,
      ).toBeGreaterThanOrEqual(2);
      // Roles render in the summary column.
      expect(screen.getByText(/background-media/)).toBeInTheDocument();
      expect(screen.getByText(/heading/)).toBeInTheDocument();
   });

   it("lists site chrome, unresolved and limitations as data — never as instructions", () => {
      renderView();
      expect(screen.getByText(/SITE\/Header/)).toBeInTheDocument();
      expect(screen.getByText(/245:8/)).toBeInTheDocument();
      expect(
         screen.getByText(/MCP metadata tools expose no revision pin/),
      ).toBeInTheDocument();
   });

   it("shows the pinned-match preview and enables approval only with pinned work", () => {
      renderView();
      fireEvent.click(
         screen.getByText('Duyệt kế hoạch và chạy bản dựng "det build"'),
      );
      expect(screen.getByText(/Khớp nguồn đã ghim:/)).toBeInTheDocument();
      const button = screen.getByRole("button", {
         name: /Duyệt & chạy det build/,
      });
      expect(button).not.toBeDisabled();
   });

   it("disables approval when nothing survives the pinned-source check and reports the drops", () => {
      renderView({
         approvalPreview: {
            totalProposedAssignments: 3,
            pinnedAssignments: 0,
            droppedNodeIds: ["999:999"],
         },
         approvable: false,
      });
      fireEvent.click(
         screen.getByText('Duyệt kế hoạch và chạy bản dựng "det build"'),
      );
      const button = screen.getByRole("button", {
         name: /Duyệt & chạy det build/,
      });
      expect(button).toBeDisabled();
      expect(screen.getByText(/999:999/)).toBeInTheDocument();
      expect(screen.getByText(/Bị loại/)).toBeInTheDocument();
   });

   it("links the deterministic build run after approval", () => {
      renderView({ buildLink: { runId: "build-123456" } });
      fireEvent.click(
         screen.getByText('Duyệt kế hoạch và chạy bản dựng "det build"'),
      );
      const link = screen.getByRole("link", { name: "build-123456" });
      expect(link).toHaveAttribute("href", "/runs/build-123456");
   });

   it("reports an unavailable approval preview honestly", () => {
      renderView({
         approvalPreview: null,
         approvalPreviewError: "base config missing",
         approvable: false,
      });
      fireEvent.click(
         screen.getByText('Duyệt kế hoạch và chạy bản dựng "det build"'),
      );
      expect(
         screen.getByText(/Không tính được phép duyệt — base config missing/),
      ).toBeInTheDocument();
      expect(
         screen.getByRole("button", { name: /Duyệt & chạy det build/ }),
      ).toBeDisabled();
   });
});

describe("AgentPlanView — ungrounded plan", () => {
   const UNGROUNDED = {
      ...VALID_AGENT_PLAN,
      observed: {
         grounded: false,
         rootName: null,
         childCount: null,
         revisionId: null,
      },
      sections: [],
      limitations: ["tool denied"],
   } satisfies AgentPlan;

   it("renders the honest block with NO approval affordance", () => {
      render(
         <AgentPlanView
            plan={UNGROUNDED}
            approvalPreview={null}
            approvalPreviewError={null}
            approvable={false}
            approving={false}
            onApprove={() => {}}
            buildLink={null}
         />,
      );
      expect(screen.getByTestId("plan-ungrounded")).toBeInTheDocument();
      expect(
         screen.getByText(/Không có dữ liệu Figma quan sát được/),
      ).toBeInTheDocument();
      expect(
         screen.queryByText(/Duyệt & chạy det build/),
      ).not.toBeInTheDocument();
      expect(screen.getByText("tool denied")).toBeInTheDocument();
   });

   it("is driven by the schema, not by the operator's approvable prop", () => {
      // Even if a caller (bug or future change) claims approvable=true, an
      // ungrounded plan must never render an approval affordance.
      render(
         <AgentPlanView
            plan={UNGROUNDED}
            approvalPreview={PREVIEW}
            approvalPreviewError={null}
            approvable={true}
            approving={false}
            onApprove={() => {}}
            buildLink={null}
         />,
      );
      expect(
         screen.queryByText(/Duyệt & chạy det build/),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("plan-ungrounded")).toBeInTheDocument();
   });
});
