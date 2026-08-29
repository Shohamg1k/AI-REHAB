import { defineConfig } from "vitest/config";

// Root config so `pnpm test` from the repo root discovers every package's
// tests in one run. Individual packages may still run `vitest` locally.
export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.{ts,tsx}"
    ],
    environment: "node",
    passWithNoTests: false
  }
});
