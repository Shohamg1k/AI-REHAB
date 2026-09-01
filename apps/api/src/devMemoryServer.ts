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
/**
 * Load the repo-root `.env` if there is one.
 *
 * `.env.example` has always documented these variables, but nothing outside
 * docker-compose ever read them — so running this server directly meant
 * putting secrets on the command line, where they end up in shell history.
 * `.env` is gitignored (CLAUDE.md §5), which makes it the right place for a
 * real `GROQ_API_KEY`.
 *
 * Dev-only, and deliberately only here: the production entry point takes its
 * environment from whatever orchestrates it, and should not start reading
 * files off disk to find secrets.
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    console.log("Loaded .env");
  } catch {
    // No .env, or this Node is too old for loadEnvFile. Neither is a
    // problem: every variable has a working default or a documented
    // fallback, and the coach simply stays unavailable without a key.
  }
}

async function main(): Promise<void> {
  loadDotEnv();

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
