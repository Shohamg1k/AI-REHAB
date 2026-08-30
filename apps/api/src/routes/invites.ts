import type { FastifyPluginAsync } from "fastify";
import { forbidden, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** Clinician-only: mint an invite code a patient redeems at signup to join this clinician's tenant. */
export function registerInviteRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.post("/invites", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "clinician") {
      forbidden(reply, "Only clinicians can create invite codes.");
      return;
    }

    const invite = await store.createInvite({ tenantId: auth.tenantId, createdBy: auth.userId });
    reply.code(201).send(invite);
  });
}
