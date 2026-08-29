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
    // jsdom for every project, not just apps/patient: it's a superset of
    // node's globals plus DOM ones, so packages/*'s pure-function tests are
    // unaffected, and this avoids needing a per-project environment split
    // just for the one app that renders React components.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: false
  }
});
