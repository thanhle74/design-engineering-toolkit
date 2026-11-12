import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DEMO_RUN_FIXTURE } from "@/src/modules/studio/shared/fixtures/demo-run";
import type { StudioPreviewState } from "@/src/modules/studio/shared/contracts";

import { PreviewPanel } from "./preview-panel";

// vitest runs without `globals`, so RTL auto-cleanup never registers itself.
afterEach(cleanup);

/**
 * Minimal typed AVAILABLE preview built inside the test only — the frozen
 * union allows `available` exclusively with `verified: true`, and Studio never
 * receives one from fixture data (the DEMO fixture is honestly unavailable).
 */
const AVAILABLE_PREVIEW: StudioPreviewState = {
   status: "available",
   verified: true,
   url: "http://127.0.0.1:8042/preview/demo-run-245-2/",
   label: "DET Preview Theme — verified render",
};

describe("PreviewPanel", () => {
   it("renders the unavailable reason verbatim plus a DEMO badge on the fixture run", () => {
      const fixturePreview = DEMO_RUN_FIXTURE.preview;
      if (fixturePreview.status !== "unavailable") {
         throw new Error("DEMO fixture must carry an unavailable preview");
      }

      render(
         <PreviewPanel
            preview={fixturePreview}
            mode={DEMO_RUN_FIXTURE.mode}
            label={DEMO_RUN_FIXTURE.label}
         />,
      );

      // The reader's reason text, verbatim — no paraphrase, no truncation.
      expect(
         screen.getByTestId("preview-unavailable-reason"),
      ).toHaveTextContent(fixturePreview.reason);

      // Calm informational state vocabulary, not an alarming error banner: the
      // Vietnamese label rides next to the raw machine code, still in the DOM.
      expect(screen.getByText("PREVIEW_UNAVAILABLE")).toBeInTheDocument();
      expect(screen.getByText("Không thể xem trước")).toBeInTheDocument();
      expect(
         screen.getByText(/Bản xem trước chỉ xuất hiện khi/),
      ).toBeInTheDocument();

      // DEMO fixture runs must be visibly labeled.
      expect(screen.getByTestId("preview-demo-badge")).toHaveTextContent(
         "DEMO",
      );
   });

   it("never renders an iframe or image as preview proof in the unavailable state", () => {
      const { container } = render(
         <PreviewPanel
            preview={DEMO_RUN_FIXTURE.preview}
            mode={DEMO_RUN_FIXTURE.mode}
            label={DEMO_RUN_FIXTURE.label}
         />,
      );

      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("video")).toBeNull();
   });

   it("renders label, url link with safe rel, and a verified badge for an available preview", () => {
      render(
         <PreviewPanel
            preview={AVAILABLE_PREVIEW}
            mode="live"
            label="Live run label"
         />,
      );

      expect(screen.getByText("Live run label")).toBeInTheDocument();

      const link = screen.getByTestId("preview-url-link");
      expect(link).toHaveAttribute("href", AVAILABLE_PREVIEW.url);
      expect(link).toHaveTextContent(AVAILABLE_PREVIEW.url);

      const newTab = screen.getByTestId("preview-new-tab-link");
      expect(newTab).toHaveAttribute("href", AVAILABLE_PREVIEW.url);
      expect(newTab).toHaveAttribute("target", "_blank");
      expect(newTab.getAttribute("rel")).toContain("noreferrer");

      expect(screen.getByTestId("preview-verified-badge")).toHaveTextContent(
         "Đã xác minh",
      );

      // A live run never carries the DEMO badge.
      expect(
         screen.queryByTestId("preview-demo-badge"),
      ).not.toBeInTheDocument();
   });

   it("never renders an iframe or image as preview proof in the available state", () => {
      const { container } = render(
         <PreviewPanel
            preview={AVAILABLE_PREVIEW}
            mode="live"
            label="Live run label"
         />,
      );

      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("video")).toBeNull();
   });
});
