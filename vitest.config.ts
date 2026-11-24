import { defineConfig } from "vitest/config";
import path from "path";

// Client component tests (jsdom). Server tests keep using node:test (`npm test`).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "client", "src"), "@shared": path.resolve(import.meta.dirname, "shared") } },
  test: { environment: "jsdom", include: ["client/src/**/*.test.tsx"], globals: false },
});
