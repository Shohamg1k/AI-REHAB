import { buildApp } from "./app.js";
import { createDb, closeDb } from "./db/client.js";
import { PostgresStore } from "./store/postgresStore.js";

async function main(): Promise<void> {
  const db = createDb();
  const store = new PostgresStore(db);
  const app = await buildApp({ store, corsOrigin: process.env.CORS_ORIGIN?.split(",") });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app
        .close()
        .then(() => closeDb())
        .finally(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error("Failed to start apps/api:", err);
  process.exit(1);
});
