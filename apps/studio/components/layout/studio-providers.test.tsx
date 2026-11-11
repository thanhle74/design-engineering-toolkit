import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { theme } from "antd";
import { StudioProviders, STUDIO_ANTD_THEME } from "./studio-providers";

/**
 * [61] Focused light-theme/provider tests: the provider must be light-only
 * (defaultAlgorithm), carry the 44px operator control height, and render its
 * children inside the antd App wrapper without error.
 */
describe("StudioProviders", () => {
  it("is light-only: the configured algorithm is the default (light) algorithm", () => {
    expect(STUDIO_ANTD_THEME.algorithm).toBe(theme.defaultAlgorithm);
    expect(STUDIO_ANTD_THEME.algorithm).not.toBe(theme.darkAlgorithm);
    expect(STUDIO_ANTD_THEME.algorithm).not.toBe(theme.compactAlgorithm);
  });

  it("carries the generous 44px operator control height", () => {
    expect(STUDIO_ANTD_THEME.token?.controlHeight).toBe(44);
  });

  it("does not define a dark color scheme anywhere in the theme config", () => {
    const serialized = JSON.stringify(STUDIO_ANTD_THEME);
    expect(serialized).not.toMatch(/dark/i);
  });

  it("renders children through ConfigProvider + antd App", () => {
    render(
      <StudioProviders>
        <p data-testid="provider-probe">studio content</p>
      </StudioProviders>
    );
    expect(screen.getByTestId("provider-probe")).toBeVisible();
    expect(screen.getByTestId("provider-probe")).toHaveTextContent(
      "studio content"
    );
  });
});
