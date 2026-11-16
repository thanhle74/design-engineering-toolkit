/**
 * [74] RunOverviewPanel — honest status/metrics regression tests (scope E).
 *
 * The #72 extended reality is 5 of 12 sections composed with 7 skipped
 * entries (COMPOSITION_SKIPS_PRESENT). These tests pin that the panel
 * DERIVES every count/status from the run data instead of the old blanket
 * claims (per-row "Đã ghép thành công", unconditional "Hoàn tất thành
 * công", invented "SECTION" role, "Tệp sẵn sàng" for non-downloadable
 * artifacts), while GAP/SKIPPED stay visible and no fake HTML/preview
 * appears when the run has none.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
   StudioRunViewSchema,
   type StudioRunView,
} from "@/src/modules/studio/shared/contracts";
import { DEMO_RUN_FIXTURE } from "@/src/modules/studio/shared/fixtures/demo-run";
import { RunOverviewPanel } from "../components/run-overview-panel";

afterEach(cleanup);

function onQuickDownload(): void {
   /* not under test here */
}

/** Minimal typed run builder for status states. */
function buildRun(overrides: {
   exitCode?: number | null;
   sections?: StudioRunView["sections"];
   mappings?: StudioRunView["mappings"];
   build?: StudioRunView["build"];
   artifacts?: StudioRunView["artifacts"];
}): StudioRunView {
   return StudioRunViewSchema.parse({
      runId: "run-overview-honest-test",
      mode: "fixture",
      label: "DEMO — honest overview test run",
      generatedAt: null,
      exitCode: overrides.exitCode === undefined ? 0 : overrides.exitCode,
      toolCommand: null,
      profileId: null,
      platformId: null,
      source: { sourceId: null, revisionId: null, accessedAt: null },
      counts: { errors: null, warnings: null, infos: null },
      sections: overrides.sections ?? [],
      mappings: overrides.mappings ?? [],
      diagnostics: [],
      artifacts: overrides.artifacts ?? [],
      preview: {
         status: "unavailable",
         reason: "No verified preview exists for this test run.",
      },
      ...(overrides.build ? { build: overrides.build } : {}),
   });
}

function section(
   order: number,
   sectionId: string,
   elementCount: number,
   name = `Section ${order}`,
): StudioRunView["sections"][number] {
   return {
      sectionId,
      order,
      name,
      elementCount,
      sourceLocators: [`design://x/${order}:0`],
   };
}

function mapping(
   nodeId: string,
   sectionId: string | undefined,
   composeDisposition: StudioRunView["mappings"][number]["composeDisposition"],
): StudioRunView["mappings"][number] {
   return {
      nodeId,
      ...(sectionId ? { sectionId } : {}),
      composeDisposition,
      reasons: [],
      needsReview: false,
   };
}

describe("RunOverviewPanel — derived overall status", () => {
   it("reports partial completion with the composed fraction when skips exist", () => {
      const sections = [
         section(0, "s-a", 3),
         section(1, "s-b", 2),
         section(2, "s-c", 0),
      ];
      const mappings = [
         mapping("n-1", "s-a", "mapped"),
         mapping("n-2", "s-b", "gap"),
         mapping("n-3", "s-c", "skipped"),
      ];
      render(
         <RunOverviewPanel
            run={buildRun({ sections, mappings })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.getByText("Hoàn tất — còn mục chưa ghép")).toBeInTheDocument();
      expect(
         screen.getByText(
            "Mã thoát 0 · Đã ghép 2/3 phân đoạn · 2 mục gap/bỏ qua/loại trừ",
         ),
      ).toBeInTheDocument();
   });

   it("reports full success only when every section composed and no gaps remain", () => {
      const sections = [section(0, "s-a", 2)];
      const mappings = [mapping("n-1", "s-a", "mapped")];
      render(
         <RunOverviewPanel
            run={buildRun({ sections, mappings })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.getByText("Hoàn tất thành công")).toBeInTheDocument();
      expect(
         screen.getByText("Mã thoát 0 · Đã ghép 1/1 phân đoạn"),
      ).toBeInTheDocument();
   });

   it("reports failure for a non-zero exit code and never masks it", () => {
      const sections = [section(0, "s-a", 2)];
      render(
         <RunOverviewPanel
            run={buildRun({ exitCode: 1, sections })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.getByText("Chưa hoàn tất")).toBeInTheDocument();
      expect(
         screen.getByText(/Mã thoát 1 · Đã ghép 1\/1 phân đoạn/),
      ).toBeInTheDocument();
   });

   it("keeps an unknown exit code unknown", () => {
      render(
         <RunOverviewPanel
            run={buildRun({ exitCode: null })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.getByText("Chưa rõ trạng thái")).toBeInTheDocument();
      expect(screen.getByText(/Mã thoát không rõ/)).toBeInTheDocument();
   });
});

describe("RunOverviewPanel — derived section statuses", () => {
   it("marks each section from its own data, not a blanket success", () => {
      const sections = [
         section(0, "s-a", 3),
         section(1, "s-b", 0),
      ];
      const mappings = [
         mapping("n-1", "s-a", "mapped"),
         mapping("n-2", "s-b", "skipped"),
         mapping("n-3", "s-b", "skipped"),
      ];
      render(
         <RunOverviewPanel
            run={buildRun({ sections, mappings })}
            onQuickDownload={onQuickDownload}
         />,
      );
      const rows = screen.getAllByRole("row");
      const composedRow = rows.find((r) => within(r).queryByText("Section 0"));
      expect(composedRow).toBeDefined();
      expect(within(composedRow!).getByText("Đã ghép")).toBeInTheDocument();

      const skippedRow = rows.find((r) => within(r).queryByText("Section 1"));
      expect(skippedRow).toBeDefined();
      expect(
         within(skippedRow!).getByText("CHƯA GHÉP"),
      ).toBeInTheDocument();
      // The section's own skipped entries stay visible per row.
      expect(within(skippedRow!).getByText("2 skipped")).toBeInTheDocument();
      // No invented blanket per-row claim remains.
      expect(screen.queryByText("Đã ghép thành công")).toBeNull();
   });

   it("shows the real composed fraction for a 5-of-12 extended run", () => {
      const sections = [
         section(0, "s-0", 3),
         section(1, "s-1", 5),
         section(2, "s-2", 2),
         section(3, "s-3", 1),
         section(4, "s-4", 2),
         ...Array.from({ length: 7 }, (_, i) => section(5 + i, `s-${5 + i}`, 0)),
      ];
      const mappings = [
         ...Array.from({ length: 5 }, (_, i) =>
            mapping(`n-map-${i}`, `s-${i}`, "mapped"),
         ),
         ...Array.from({ length: 7 }, (_, i) =>
            mapping(`n-skip-${i}`, `s-${5 + i}`, "skipped"),
         ),
      ];
      render(
         <RunOverviewPanel
            run={buildRun({ sections, mappings })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(
         screen.getByText("Các phân đoạn giao diện (đã ghép 5/12)"),
      ).toBeInTheDocument();
      expect(
         screen.getByText(
            "Mã thoát 0 · Đã ghép 5/12 phân đoạn · 7 mục gap/bỏ qua/loại trừ",
         ),
      ).toBeInTheDocument();
      expect(screen.getAllByText("CHƯA GHÉP")).toHaveLength(7);
      expect(screen.getAllByText("Đã ghép")).toHaveLength(5);
   });

   it("renders an absent section role as unknown, never an invented label", () => {
      const sections = [
         {
            sectionId: "s-a",
            order: 0,
            name: "No role",
            elementCount: 1,
            sourceLocators: [],
         },
      ];
      render(
         <RunOverviewPanel
            run={buildRun({ sections })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.queryByText("SECTION")).not.toBeInTheDocument();
      expect(screen.getAllByText("không rõ").length).toBeGreaterThan(0);
   });
});

describe("RunOverviewPanel — artifact & integrity honesty", () => {
   it("counts only downloadable artifacts as downloadable", () => {
      const artifacts = [
         {
            artifactId: "node-ir/node-ir.json",
            role: "node-ir",
            file: "node-ir.json",
            schemaRef: "node-ir.schema.json",
            downloadable: false,
         },
         {
            artifactId: "native-content/page.html",
            role: "native-content",
            file: "page.html",
            schemaRef: "native-content.schema.json",
            downloadable: true,
         },
      ];
      render(
         <RunOverviewPanel
            run={buildRun({ artifacts })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(screen.getByText("1/2 Tệp tải được")).toBeInTheDocument();
   });

   it("never claims SHA-256 verification when the run carries no build bundle", () => {
      render(
         <RunOverviewPanel
            run={buildRun({})}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(
         screen.getByText("Chưa có gói build — chưa xác minh SHA-256"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Đã xác minh gói")).toBeNull();
   });

   it("surfaces a failed manifest verification instead of masking it", () => {
      render(
         <RunOverviewPanel
            run={buildRun({
               build: {
                  manifestVerified: false,
                  configContentHash: "a".repeat(64),
                  stages: [],
                  gaps: [],
               },
            })}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(
         screen.getByText("Xác minh toàn vẹn THẤT BẠI"),
      ).toBeInTheDocument();
   });
});

describe("RunOverviewPanel — DEMO fixture and fake-content refusal", () => {
   it("derives 3/4 composed for the DEMO fixture with skipped entries visible", () => {
      render(
         <RunOverviewPanel
            run={DEMO_RUN_FIXTURE}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(
         screen.getByText("Các phân đoạn giao diện (đã ghép 3/4)"),
      ).toBeInTheDocument();
      expect(screen.getAllByText("CHƯA GHÉP")).toHaveLength(1);
      expect(screen.getByText("2 skipped")).toBeInTheDocument();
      // The Hero row carries the run's single gap entry ("4 mapped · 1 gap
      // · 1 decoration-merged" rendered as one fragment).
      expect(screen.getByText(/1 gap/)).toBeInTheDocument();
   });

   it("shows the honest missing-HTML state instead of fake code", () => {
      render(
         <RunOverviewPanel
            run={buildRun({})}
            onQuickDownload={onQuickDownload}
         />,
      );
      expect(
         screen.getByText("Không tìm thấy file HTML đầu ra"),
      ).toBeInTheDocument();
      const copyButton = screen
         .getByText("Sao chép toàn bộ HTML")
         .closest("button");
      expect(copyButton).not.toBeNull();
      expect(copyButton).toBeDisabled();
      expect(screen.queryByText(/data-content-type/)).toBeNull();
   });
});
