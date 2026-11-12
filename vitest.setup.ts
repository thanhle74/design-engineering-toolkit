import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom lacks ResizeObserver, which antd's rc-resize-observer needs
 * (artifact manifest tooltips, select popovers, table measure rows).
 * Provide a stub for all lanes.
 */
class ResizeObserverStub {
   observe(): void {}
   unobserve(): void {}
   disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
   globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
}

/**
 * jsdom lacks window.matchMedia, which antd's responsiveObserve (Table, Grid,
 * Menu overflow, Form) requires. The matches answer mirrors antd's own test
 * setup: only max-width queries are considered matching.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
   Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
         matches: query.includes("max-width"),
         media: query,
         onchange: null,
         addListener(): void {},
         removeListener(): void {},
         addEventListener(): void {},
         removeEventListener(): void {},
         dispatchEvent(): boolean {
            return false;
         },
      }),
   });
}

/**
 * antd motion/overflow helpers call scrollIntoView on focused elements.
 */
if (
   typeof HTMLElement !== "undefined" &&
   typeof HTMLElement.prototype.scrollIntoView !== "function"
) {
   HTMLElement.prototype.scrollIntoView = (): void => {};
}

/**
 * Global RTL cleanup so lanes that render repeatedly don't leak DOM between
 * tests even if a lane forgot its own afterEach(cleanup).
 */
afterEach(() => {
   cleanup();
});
