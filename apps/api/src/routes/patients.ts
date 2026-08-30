import type { FastifyPluginAsync } from "fastify";
import { forbidden, handleStoreError, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/**
 * Clinician-only roster and per-patient views. Every read of a specific
 * patient's data writes an audit_log entry (G5/F5) — the patient can see
 * exactly when and by whom their data was accessed via GET /audit-log.
 */
export function registerPatientRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.get("/patients", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "clinician") {
      forbidden(reply, "Only clinicians have a patient roster.");
      return;
    }
    reply.send(await store.listPatients(auth.tenantId, auth.userId));
  });

  fastify.get<{ Params: { patientId: string } }>(
    "/patients/:patientId/sessions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      if (auth.role !== "clinician") {
        forbidden(reply, "Only clinicians can view a patient's sessions.");
        return;
      }

      const { patientId } = request.params;
      const linked = await store.isLinked(auth.tenantId, auth.userId, patientId);
      if (!linked) {
        forbidden(reply, "This patient is not on your roster.");
        return;
      }

      await store.recordAccess({
        tenantId: auth.tenantId,
        actorId: auth.userId,
        subjectUserId: patientId,
        action: "view_sessions"
      });

      try {
        reply.send(await store.listSessions(auth.tenantId, patientId));
      } catch (err) {
        if (handleStoreError(err, reply)) return;
        throw err;
      }
    }
  );
}
