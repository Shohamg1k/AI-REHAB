import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, closeDb } from "./client.js";

/**
 * Applies every migration in ./migrations, including the hand-written RLS
 * policies (0001_rls.sql) — see that file's header for why it isn't
 * drizzle-kit-generated, and migrations/meta/_journal.json for how it's
 * registered so drizzle's migrator picks it up in order.
 *
 * Run via `pnpm db:migrate`, or automatically on container start — see
 * apps/api/Dockerfile and docker-compose.yml.
 */
async function main(): Promise<void> {
  const db = createDb();
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: new URL("../../migrations", import.meta.url).pathname });
  console.log("Migrations complete.");
  await closeDb();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
