import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { SendMessageRequestSchema } from "@ai-rehab/contracts";
import { forbidden, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/**
 * F9 — patient/clinician messaging.
 *
 * **Not gated by `dataSharingEnabled`.** That flag governs whether a
 * clinician may read the patient's *session data*; a message is not session
 * data. A patient who has paused sharing — quite possibly because something
 * is wrong — is the last person who should also lose the ability to say so.
 * The consent control and the conversation are deliberately separate.
 *
 * A clinician may only reach the thread of a patient on their own roster,
 * which is the same `isLinked` check every other clinician read uses.
 *
 * Reading a thread is *not* written to the G5 audit log. That log answers
 * "who looked at my data"; a clinician reading a message the patient sent
 * them is not an access the patient needs warning about, and logging it
 * would bury the accesses that matter in conversational noise.
 */
export function registerMessageRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  /** Resolves which patient's thread this caller may act on, or null after replying with an error. */
  async function resolveThread(
    request: FastifyRequest,
    reply: FastifyReply,
    requestedPatientId: string | undefined
  ): Promise<{ tenantId: string; patientId: string; userId: string } | null> {
    const auth = requireAuth(request, reply);
    if (!auth) return null;

    if (auth.role === "patient") {
      // A patient always posts to their own thread. An explicit patientId is
      // ignored rather than honoured, so it cannot redirect a message.
      return { tenantId: auth.tenantId, patientId: auth.userId, userId: auth.userId };
    }

    if (!requestedPatientId) {
      reply.code(400).send({ error: "patient_required", message: "Specify which patient's thread." });
      return null;
    }
    const linked = await store.isLinked(auth.tenantId, auth.userId, requestedPatientId);
    if (!linked) {
      forbidden(reply, "This patient is not on your roster.");
      return null;
    }
    return { tenantId: auth.tenantId, patientId: requestedPatientId, userId: auth.userId };
  }

  fastify.get<{ Querystring: { patientId?: string } }>(
    "/messages",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const thread = await resolveThread(request, reply, request.query.patientId);
      if (!thread) return;
      reply.send(await store.listMessages(thread.tenantId, thread.patientId));
    }
  );

  fastify.post("/messages", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = parseBody(SendMessageRequestSchema, request.body, reply);
    if (!body) return;

    const thread = await resolveThread(request, reply, body.patientId);
    if (!thread) return;

    const message = await store.sendMessage({
      tenantId: thread.tenantId,
      patientId: thread.patientId,
      senderId: thread.userId,
      body: body.body
    });
    reply.code(201).send(message);
  });
}
