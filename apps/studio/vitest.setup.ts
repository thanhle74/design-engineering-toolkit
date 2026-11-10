import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom lacks ResizeObserver, which Radix Popper/Tooltip positioning needs
 * (artifact manifest tooltips, select popovers). Provide a stub for all lanes.
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
 * Global RTL cleanup so lanes that render repeatedly don't leak DOM between
 * tests even if a lane forgot its own afterEach(cleanup).
 */
afterEach(() => {
  cleanup();
});
