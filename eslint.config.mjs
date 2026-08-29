// @ts-check
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

/**
 * Flat ESLint config for the whole monorepo.
 *
 * Package-boundary rules (packages/core must not import React/DOM/fetch,
 * packages/core/safety must not import outside contracts, nothing imports
 * fixtures/raw) are enforced by `scripts/lint-boundaries.mjs`, not here —
 * ESLint's `no-restricted-imports` can't see across package roots the way
 * we need without a much heavier dependency-graph plugin. Boundary lint
 * runs as its own `pnpm lint:boundaries` step in CI.
 */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "apps/patient/src/vite-env.d.ts"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  },
  {
    // CLI entry points — printing to stdout is the whole point.
    files: ["**/bin/**/*.ts"],
    rules: {
      "no-console": "off"
    }
  },
  prettierConfig
];
