import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import * as studioProvidersModule from "./studio-providers";
import { StudioProviders } from "./studio-providers";

/**
 * [61] Provider contract after the antd-default-light correction:
 * the module must not export or configure any custom antd theme (stock
 * out-of-the-box light only), and children must render inside a real antd
 * `App` context so `App.useApp()` resolves to the working message API.
 */
describe("StudioProviders", () => {
   it("exports no custom antd theme — StudioProviders is the only export", () => {
      expect(Object.keys(studioProvidersModule).sort()).toEqual([
         "StudioProviders",
      ]);
      expect(Object.hasOwn(studioProvidersModule, "STUDIO_ANTD_THEME")).toBe(
         false,
      );
   });

   it("renders children through the antd App wrapper", () => {
      render(
         <StudioProviders>
            <p data-testid="provider-probe">studio content</p>
         </StudioProviders>,
      );
      expect(screen.getByTestId("provider-probe")).toHaveTextContent(
         "studio content",
      );
   });

   /**
    * antd's `App.useApp()` returns a bare `{}`-shaped context OUTSIDE a real
    * `<App>` (no methods) and the live message API inside one. A probe child
    * that reaches `message.open` proves StudioProviders wraps its children in
    * the antd `App` — the regression this guards is the wrapper being dropped.
    */
   it("puts children inside a real antd App context (useApp resolves the live message API)", () => {
      function AppContextProbe() {
         const { message } = AntdApp.useApp();
         return (
            <p data-testid="provider-probe">
               {typeof message?.open === "function"
                  ? "antd-app-context"
                  : "no-context"}
            </p>
         );
      }
      render(
         <StudioProviders>
            <AppContextProbe />
         </StudioProviders>,
      );
      expect(screen.getByTestId("provider-probe")).toHaveTextContent(
         "antd-app-context",
      );
   });
});
