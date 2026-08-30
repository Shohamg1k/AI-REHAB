import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** G2 — adherence calendar, A8 (computed) baseline, and ROM trend, all derived from stored events on read. */
export function registerProjectionRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.get("/projections/adherence", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    reply.send(await store.getAdherence(auth.tenantId, auth.userId));
  });

  fastify.get("/projections/baseline", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    reply.send(await store.getBaseline(auth.tenantId, auth.userId));
  });

  fastify.get("/projections/rom-trend", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    reply.send(await store.getRomTrend(auth.tenantId, auth.userId));
  });
}
