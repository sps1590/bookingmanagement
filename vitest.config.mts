import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// .mts so Vite loads this as ESM; a .ts config is loaded as CommonJS, which
// warns today and breaks in a future Vite major.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // E2E lives in Playwright; DB assertions run through psql in CI.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["lib/**", "components/**"],
      exclude: ["components/ui/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
