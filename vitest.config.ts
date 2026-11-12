import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// [63]/[68] single application: the Studio module lives at src/modules/studio; the alias root is the
// repository root (matches the root tsconfig paths `@/*` → `./*`).
const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
    ],
    css: false,
  },
  resolve: {
    alias: {
      "@": appRoot,
    },
  },
});
