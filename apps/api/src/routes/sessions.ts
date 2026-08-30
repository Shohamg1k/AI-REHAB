import type { FastifyPluginAsync } from "fastify";
import { handleStoreError, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** G2 session list, and A9 (re-scoped) replay — see docs/STATUS.md on why this replays angles, not skeletons. */
export function registerSessionRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.get("/sessions", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    reply.send(await store.listSessions(auth.tenantId, auth.userId));
  });

  fastify.get<{ Params: { sessionId: string } }>(
    "/sessions/:sessionId/events",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      try {
        reply.send(await store.listSessionEvents(auth.tenantId, auth.userId, request.params.sessionId));
      } catch (err) {
        if (handleStoreError(err, reply)) return;
        throw err;
      }
    }
  );
}
