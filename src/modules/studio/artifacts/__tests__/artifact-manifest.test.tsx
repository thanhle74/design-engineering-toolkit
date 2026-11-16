import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEMO_RUN_FIXTURE } from "@/src/modules/studio/shared/fixtures/demo-run";
import type { StudioArtifactView } from "@/src/modules/studio/shared/contracts";

import { ArtifactManifest } from "../artifact-manifest";

// vitest runs without `globals`, so RTL auto-cleanup never registers itself.
afterEach(cleanup);

// jsdom has no ResizeObserver; Radix Popper (Tooltip content) measures itself.
beforeAll(() => {
   if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
         observe(): void {}
         unobserve(): void {}
         disconnect(): void {}
      };
   }
});

const user = userEvent.setup();

/** Fixture rows are all honestly non-downloadable: no bytes exist for them. */
const FIXTURE_ARTIFACTS = DEMO_RUN_FIXTURE.artifacts;

function renderManifest(
   artifacts: readonly StudioArtifactView[],
   onDownload: (artifact: StudioArtifactView) => void = vi.fn(),
) {
   return render(
      <ArtifactManifest artifacts={artifacts} onDownload={onDownload} />,
   );
}

describe("ArtifactManifest", () => {
   it("renders fixture rows with roles, relative files, schema refs and shortened hashes", () => {
      renderManifest(FIXTURE_ARTIFACTS);

      // Every manifest row is present, keyed by its canonical role string.
      for (const artifact of FIXTURE_ARTIFACTS) {
         expect(screen.getByText(artifact.role)).toBeInTheDocument();
         if (artifact.file !== undefined) {
            expect(screen.getByText(artifact.file)).toBeInTheDocument();
         }
         expect(screen.getByTitle(artifact.schemaRef)).toBeInTheDocument();
      }

      // Hashes are shortened: first 10 chars + ellipsis, never the full value.
      const first = FIXTURE_ARTIFACTS[0];
      expect(first.contentHash).toBeDefined();
      const hash = first.contentHash as string;
      expect(screen.getByText(`${hash.slice(0, 10)}…`)).toBeInTheDocument();
      expect(screen.queryByText(hash)).not.toBeInTheDocument();

      expect(screen.getByTestId("artifact-count")).toHaveTextContent(
         `${FIXTURE_ARTIFACTS.length} artifact`,
      );
   });

   it("renders non-downloadable rows as disabled controls whose tooltip explains why", async () => {
      renderManifest(FIXTURE_ARTIFACTS);

      const buttons = screen.getAllByRole("button", { name: /tải xuống/i });
      expect(buttons).toHaveLength(FIXTURE_ARTIFACTS.length);
      for (const button of buttons) {
         expect(button).toBeDisabled();
      }

      // The disabled control must always say why: hover its focusable wrapper.
      const wrapper = screen.getAllByTestId(/^artifact-download-disabled-/)[0];
      expect(wrapper).not.toBeNull();
      await user.hover(wrapper as HTMLElement);

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent(
         /run reader không phục vụ artifact này/i,
      );
      expect(tooltip).toHaveTextContent(
         /Chỉ file đã được reader xác thực mới tải được\./i,
      );
   });

   it("never calls onDownload for non-downloadable rows", async () => {
      const onDownload = vi.fn();
      renderManifest(FIXTURE_ARTIFACTS, onDownload);

      for (const button of screen.getAllByRole("button", {
         name: /tải xuống/i,
      })) {
         await user.click(button);
      }
      expect(onDownload).not.toHaveBeenCalled();
   });

   it("calls onDownload with the full artifact for a downloadable row", async () => {
      const onDownload = vi.fn();
      const downloadable: StudioArtifactView = {
         ...FIXTURE_ARTIFACTS[0],
         downloadable: true,
      };
      renderManifest([downloadable], onDownload);

      const button = screen.getByRole("button", { name: /tải xuống/i });
      expect(button).toBeEnabled();

      await user.click(button);
      expect(onDownload).toHaveBeenCalledTimes(1);
      expect(onDownload).toHaveBeenCalledWith(downloadable);
   });

   it("renders an error state and withholds an absolute-looking file path", () => {
      const unsafe: StudioArtifactView = {
         ...FIXTURE_ARTIFACTS[0],
         file: "/etc/passwd",
      };
      renderManifest([unsafe]);

      // The absolute path is never rendered anywhere in the table.
      expect(screen.queryByText("/etc/passwd")).not.toBeInTheDocument();
      expect(screen.getByTestId("artifact-file-invalid")).toHaveTextContent(
         "Đã ẩn đường dẫn không hợp lệ",
      );
   });

   it("renders a truthful EMPTY state for a run without artifacts", () => {
      renderManifest([]);

      expect(
         screen.getByText("Chưa có artifact nào trong lần chạy này"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
         screen.queryByRole("button", { name: /tải xuống/i }),
      ).not.toBeInTheDocument();
   });
});
