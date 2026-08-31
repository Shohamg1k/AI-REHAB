import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error — plain-JS build helper, shared with the root vitest config.
import { poseModelTierPlugin } from "../../scripts/vite-plugin-pose-tier.mjs";

export default defineConfig({
  plugins: [react(), poseModelTierPlugin()],
  worker: {
    format: "es"
  },
  server: {
    // No hardcoded port: nothing here needs a fixed origin (no OAuth
    // callback, webhook, or CORS allowlist — the app talks to no server at
    // all). Honouring PORT lets a harness assign a free one instead of
    // colliding with whatever already holds 5173.
    port: process.env.PORT ? Number(process.env.PORT) : undefined
  }
});
