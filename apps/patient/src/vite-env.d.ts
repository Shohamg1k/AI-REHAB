/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional — see docs/STATUS.md and lib/api.ts. Unset keeps the app in local-only, guest-first mode. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Supplied by the `pose-model-tier` plugin in vite.config.ts — which pose
 * model tier `scripts/fetch-pose-assets.mjs` staged, or "unknown" when no
 * manifest was found. See scripts/pose-tiers.mjs.
 */
declare module "virtual:pose-model-tier" {
  export const POSE_MODEL_TIER: string;
}
