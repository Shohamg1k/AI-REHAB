import type { Config } from "drizzle-kit";

/**
 * `db:generate` (drizzle-kit generate) diffs src/db/schema.ts against the
 * snapshots in migrations/meta and emits SQL — it needs no live database
 * connection. `db:migrate` (src/db/migrate.ts) applies those files plus
 * the hand-written RLS policies against a real Postgres, and does need one
 * — see docker-compose.yml at the repo root.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder/placeholder"
  }
} satisfies Config;
