import { defineConfig } from "vitest/config";
// @ts-expect-error — plain-JS build helper, shared with apps/patient/vite.config.ts.
import { poseModelTierPlugin } from "./scripts/vite-plugin-pose-tier.mjs";

// Root config so `pnpm test` from the repo root discovers every package's
// tests in one run. Individual packages may still run `vitest` locally.
export default defineConfig({
  // A test run resolves modules through its own plugin set, so apps/patient's
  // virtual pose-tier module has to be registered here too — otherwise every
  // test that transitively imports the live-session hook fails to resolve it.
  plugins: [poseModelTierPlugin()],
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
    /*
     * Well above vitest's 5s default, because several apps/api tests create
     * three or four accounts and bcrypt is *deliberately* slow — that cost is
     * the security property, not waste.
     *
     * They passed at the default only while the rest of the suite was light
     * enough to leave them a core. Adding upper-body exercises made the
     * fixture replay heavier, and the same unchanged tests started timing out
     * under contention while passing in isolation. Raising the budget fixes
     * the actual problem; trimming real coverage to fit a default would not.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false
  }
});
