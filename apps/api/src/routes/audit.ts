import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** G5 — the patient-visible access log: every clinician read of this patient's data, self-service. */
export function registerAuditRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.get("/audit-log", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    reply.send(await store.listAccessLog(auth.tenantId, auth.userId));
  });
}
