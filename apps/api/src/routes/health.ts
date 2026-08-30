import type { FastifyPluginAsync } from "fastify";

/** Container-orchestration health check — docker-compose and any real deployment probe this. */
export function registerHealthRoute(fastify: Parameters<FastifyPluginAsync>[0]): void {
  fastify.get("/health", async () => ({ status: "ok" }));
}
