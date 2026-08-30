import type { FastifyPluginAsync } from "fastify";
import { SyncRequestSchema, SyncResponseSchema } from "@ai-rehab/contracts";
import { handleStoreError, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/**
 * G6 — the sync endpoint the patient app's `lib/sync.ts` flushes to after a
 * session ends. Accepts exactly the derived `SessionEvent`s IndexedDB
 * already holds; nothing pixel-derived can be expressed in this request
 * body because `SessionEventSchema` doesn't have a shape for it — see
 * apps/patient/src/lib/privacy.test.ts, which checks the request-building
 * side of this same boundary.
 */
export function registerEventRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.post("/events", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const body = parseBody(SyncRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const result = await store.appendEvents({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: body.sessionId,
        events: body.events
      });
      reply.send(SyncResponseSchema.parse(result));
    } catch (err) {
      if (handleStoreError(err, reply)) return;
      throw err;
    }
  });
}
