/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional — see docs/STATUS.md and lib/api.ts. Unset keeps the app in local-only, guest-first mode. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
