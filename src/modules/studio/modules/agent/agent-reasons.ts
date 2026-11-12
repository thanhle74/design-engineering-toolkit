/**
 * [65] Vietnamese operator copy for agent workflow states.
 *
 * Human-readable text is natural Vietnamese; every machine token (reason
 * codes, CLI names, env var names) stays verbatim. Used by both the status
 * card and the blocked-workflow banner. No server imports — client-safe.
 */
import type { ClaudeAgentStatus } from "@/src/modules/studio/server/claude-agent/claude-detect";

/** Human-readable state per reason code; explicit maps, no fallback surprises. */
const CLAUDE_CODE_COPY: Record<string, { state: string; instruction: string }> =
   {
      ok: { state: "Đã kết nối", instruction: "" },
      "not-installed": {
         state: "Chưa sẵn sàng",
         instruction:
            "Chưa phát hiện được Claude Code CLI (lệnh `claude`). Cài đặt Claude Code trên máy này, chạy `claude` để đăng nhập, rồi bấm Kiểm tra lại.",
      },
      "version-unparseable": {
         state: "Chưa sẵn sàng",
         instruction:
            "Lệnh `claude` tồn tại nhưng không đọc được phiên bản. Kiểm tra lại việc cài đặt Claude Code rồi bấm Kiểm tra lại.",
      },
      "auth-status-unparseable": {
         state: "Chưa sẵn sàng",
         instruction:
            "Không đọc được trạng thái đăng nhập từ `claude auth status`. Kiểm tra lại Claude Code rồi bấm Kiểm tra lại.",
      },
      "not-authenticated": {
         state: "Chưa sẵn sàng",
         instruction:
            "Claude Code chưa đăng nhập. Mở terminal, chạy `claude` và đăng nhập, rồi bấm Kiểm tra lại.",
      },
   };

const FIGMA_MCP_COPY: Record<string, { state: string; instruction: string }> = {
   ok: { state: "Đã kết nối", instruction: "" },
   "mcp-list-unparseable": {
      state: "Chưa sẵn sàng",
      instruction:
         "Không đọc được danh sách MCP từ `claude mcp list`. Kiểm tra cấu hình MCP trong Claude Code rồi bấm Kiểm tra lại.",
   },
   "mcp-not-listed": {
      state: "Chưa sẵn sàng",
      instruction:
         "Chưa thấy Figma MCP trong `claude mcp list`. Kết nối Figma MCP trong Claude Code (ví dụ plugin Figma chính thức), rồi bấm Kiểm tra lại.",
   },
   "mcp-not-connected": {
      state: "Chưa sẵn sàng",
      instruction:
         "Figma MCP đã được khai báo nhưng chưa kết nối được (xem `claude mcp list`). Đăng nhập/kiểm tra server rồi bấm Kiểm tra lại.",
   },
};

export interface StatusCopy {
   claudeState: string;
   claudeInstruction: string;
   figmaState: string;
   figmaInstruction: string;
   figmaServerName: string | null;
}

export function agentStatusCopy(status: ClaudeAgentStatus): StatusCopy {
   const claude = CLAUDE_CODE_COPY[status.claudeCode.reasonCode] ?? {
      state: "Chưa sẵn sàng",
      instruction: "Trạng thái Claude Code không xác định — bấm Kiểm tra lại.",
   };
   const figma = FIGMA_MCP_COPY[status.figmaMcp.reasonCode] ?? {
      state: "Chưa sẵn sàng",
      instruction: "Trạng thái Figma MCP không xác định — bấm Kiểm tra lại.",
   };
   return {
      claudeState: claude.state,
      claudeInstruction: claude.instruction,
      figmaState: figma.state,
      figmaInstruction: figma.instruction,
      figmaServerName: status.figmaMcp.serverName,
   };
}

const OUTCOME_COPY: Record<string, { title: string; detail: string }> = {
   "plan-ready": {
      title: "Phân tích xong",
      detail:
         "Đã nhận kế hoạch có dữ liệu Figma quan sát được. Xem lại các đề xuất bên dưới.",
   },
   "plan-ungrounded": {
      title: "Phân tích xong — KHÔNG có dữ liệu Figma",
      detail:
         "Agent trả về kế hoạch nhưng không quan sát được node nào (observed.grounded = false). Không thể duyệt — xem mục limitations.",
   },
   "schema-failed": {
      title: "Kết quả sai schema",
      detail:
         "Đầu ra của agent không khớp hợp đồng kế hoạch (AGENT_PLAN). Không có gì được chấp nhận.",
   },
   "output-missing": {
      title: "Thiếu kết quả có cấu trúc",
      detail:
         "Claude Code chạy xong nhưng không trả về structured_output. Thử lại hoặc kiểm tra phiên bản CLI.",
   },
   "claude-error": {
      title: "Claude Code báo lỗi",
      detail:
         "Tiến trình claude kết thúc với trạng thái lỗi. Xem stderr trong Chi tiết kỹ thuật.",
   },
   "envelope-invalid": {
      title: "Đầu ra không đọc được",
      detail: "stdout của claude không phải envelope JSON như kỳ vọng.",
   },
   "stdout-truncated": {
      title: "Đầu ra vượt giới hạn",
      detail:
         "stdout vượt cap lưu trữ của Studio — không parse để tránh đọc sai.",
   },
};

export function agentOutcomeCopy(outcome: string): {
   title: string;
   detail: string;
} {
   return (
      OUTCOME_COPY[outcome] ?? {
         title: "Kết quả không xác định",
         detail: "Trạng thái kết thúc không nằm trong danh sách đã biết.",
      }
   );
}
