import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./auth/plugin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerPatientRoutes } from "./routes/patients.js";
import { registerProgramRoutes } from "./routes/programs.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerProjectionRoutes } from "./routes/projections.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerHealthRoute } from "./routes/health.js";
import type { Store } from "./store/types.js";

/**
 * Factory rather than a module-level singleton, specifically so the test
 * suite can build a fresh app around a fresh `MemoryStore` per test file —
 * no shared mutable state leaking between tests, no real network port
 * bound during `vitest run`.
 */
export async function buildApp(opts: { store: Store; corsOrigin?: string | string[] }): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // Never let a landmark array or a raw request body reach the log
      // stream by accident — everything here is scoped to metadata, and
      // the routes below never log `request.body` themselves either.
      redact: ["req.headers.authorization"]
    }
  });

  await fastify.register(helmet);
  await fastify.register(cors, { origin: opts.corsOrigin ?? true });
  await fastify.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await fastify.register(authPlugin);

  registerHealthRoute(fastify);
  registerAuthRoutes(fastify, opts.store);
  registerInviteRoutes(fastify, opts.store);
  registerPatientRoutes(fastify, opts.store);
  registerProgramRoutes(fastify, opts.store);
  registerEventRoutes(fastify, opts.store);
  registerSessionRoutes(fastify, opts.store);
  registerProjectionRoutes(fastify, opts.store);
  registerAuditRoutes(fastify, opts.store);

  return fastify;
}
