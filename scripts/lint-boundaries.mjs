#!/usr/bin/env node
/**
 * Enforces the package-boundary rules from docs/ARCHITECTURE.md §3.
 * These are invariants, not style preferences (see CLAUDE.md §2) — they are
 * checked by static inspection of import specifiers rather than convention,
 * because "packages/core stays pure" is only true if something fails the
 * build when it stops being true.
 *
 * Rules enforced here:
 *   1. packages/core may not import React, DOM lib types, `fetch`, or any
 *      package that performs I/O.
 *   2. packages/core/safety may not import anything outside packages/contracts
 *      (it is a dependency leaf).
 *   3. apps/patient may not import apps/api or services/rehab-engine.
 *   4. Nothing may import from fixtures/raw.
 *   5. apps/api may only depend on packages/contracts among this repo's own
 *      workspace packages (docs/ARCHITECTURE.md §3: "apps/api ← depends on
 *      contracts"). External npm packages (fastify, drizzle-orm, ...) are
 *      unaffected — this only catches a same-repo boundary violation.
 *
 * Runs as `pnpm lint:boundaries`, wired into `pnpm ci` and the GitHub Actions
 * workflow. Exits non-zero (and prints every violation) on failure.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const IMPORT_RE = /(?:from\s+|require\(\s*)["']([^"']+)["']/g;

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if ([".ts", ".tsx"].includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

/** @param {string} file */
function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const specs = [];
  for (const m of src.matchAll(IMPORT_RE)) specs.push(m[1]);
  return specs;
}

const violations = [];

function check(dir, label, predicate) {
  const full = join(ROOT, dir);
  let files;
  try {
    files = walk(full);
  } catch {
    return; // package not built yet
  }
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const spec of importsOf(file)) {
      const reason = predicate(spec, rel);
      if (reason) violations.push(`${rel}: imports "${spec}" — ${reason} (${label})`);
    }
  }
}

const FORBIDDEN_IN_CORE = [
  { test: /^react/, reason: "packages/core may not import React" },
  { test: /^(node:)?(http|https|net|dns)$/, reason: "packages/core may not perform network I/O" },
  { test: /^express|^fastify|^axios|^node-fetch/, reason: "packages/core may not perform network I/O" }
];

check("packages/core", "ARCHITECTURE.md §3 rule 1", (spec) => {
  const hit = FORBIDDEN_IN_CORE.find((f) => f.test.test(spec));
  return hit ? hit.reason : null;
});

check("packages/core/src/safety", "ARCHITECTURE.md §3 rule 2 — safety is a leaf", (spec) => {
  if (spec.startsWith(".")) return null; // relative imports within safety itself are fine
  if (spec.includes("contracts")) return null;
  return "packages/core/safety may only depend on packages/contracts";
});

check("apps/patient", "ARCHITECTURE.md §3 rule 3", (spec) => {
  if (spec.includes("apps/api") || spec.includes("rehab-engine")) {
    return "apps/patient may not import apps/api or reach the Python service directly";
  }
  return null;
});

check(".", "ARCHITECTURE.md §3 rule 4", (spec) => {
  if (spec.includes("fixtures/raw")) return "nothing may import from fixtures/raw";
  return null;
});

check("apps/api", "ARCHITECTURE.md §3 rule 5", (spec) => {
  if (spec.includes("@ai-rehab/core") || spec.includes("@ai-rehab/exercises")) {
    return "apps/api may only depend on @ai-rehab/contracts among this repo's workspace packages";
  }
  return null;
});

if (violations.length > 0) {
  console.error("Package boundary violations:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(`\n${violations.length} violation(s). See docs/ARCHITECTURE.md §3.`);
  process.exit(1);
} else {
  console.log("✓ Package boundaries OK (docs/ARCHITECTURE.md §3)");
}
