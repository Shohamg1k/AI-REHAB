import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memoryStore.js";

/**
 * Local dev convenience: boots apps/api backed by MemoryStore instead of
 * Postgres — no docker-compose, no database, data lost on restart. Useful
 * for exercising the patient/clinician UI against a real HTTP server
 * without standing up the full stack. NOT for anything beyond a laptop —
 * see docker-compose.yml for the real (Postgres-backed) way to run this.
 *
 * `pnpm --filter @ai-rehab/api run dev:memory`
 */
async function main(): Promise<void> {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "dev-memory-server-not-for-anything-real-xxxxxxxx";
  }
  const store = new MemoryStore();
  const app = await buildApp({ store }); // omitted corsOrigin defaults to allow-all in buildApp
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`apps/api (in-memory, dev only) listening on :${port} — data is NOT persisted`);
}

main().catch((err) => {
  console.error("Failed to start the dev memory server:", err);
  process.exit(1);
});
