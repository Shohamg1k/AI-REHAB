import type { FastifyPluginAsync } from "fastify";
import { forbidden, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** Default reporting window when the caller doesn't specify one. */
const DEFAULT_PERIOD_DAYS = 7;

function defaultPeriod(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * F1 — the periodic progress report.
 *
 * Two rules shape these routes:
 *
 * 1. **The patient can read their own report, in exactly the form the
 *    clinician gets it.** G5 already lets a patient see *who* opened their
 *    data; letting them see *what was said about them* is the same
 *    principle. A report a patient cannot check is a report that can be
 *    wrong about them silently.
 * 2. **A clinician's read is gated by `dataSharingEnabled` and written to
 *    the audit log**, exactly like reading their sessions — because it is
 *    the same data, aggregated. Gating the raw sessions but not the summary
 *    of them would be a hole, not a feature.
 */
export function registerReportRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.get<{ Querystring: { days?: string } }>(
    "/me/report",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      if (auth.role !== "patient") {
        forbidden(reply, "Only a patient has a report of their own.");
        return;
      }
      const days = Number(request.query.days) || DEFAULT_PERIOD_DAYS;
      reply.send(await store.getReport(auth.tenantId, auth.userId, defaultPeriod(days)));
    }
  );

  fastify.get<{ Params: { patientId: string }; Querystring: { days?: string } }>(
    "/patients/:patientId/report",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      if (auth.role !== "clinician") {
        forbidden(reply, "Only clinicians can read a patient's report.");
        return;
      }

      const { patientId } = request.params;
      const linked = await store.isLinked(auth.tenantId, auth.userId, patientId);
      if (!linked) {
        forbidden(reply, "This patient is not on your roster.");
        return;
      }

      const patient = await store.findUserById(auth.tenantId, patientId);
      if (!patient?.dataSharingEnabled) {
        forbidden(reply, "This patient has turned off data sharing with their clinician.");
        return;
      }

      // Checked *before* logging: a refused read is not a read, and logging
      // it would tell the patient their data was opened when it was not.
      await store.recordAccess({
        tenantId: auth.tenantId,
        actorId: auth.userId,
        subjectUserId: patientId,
        action: "view_report"
      });

      const days = Number(request.query.days) || DEFAULT_PERIOD_DAYS;
      reply.send(await store.getReport(auth.tenantId, patientId, defaultPeriod(days)));
    }
  );
}
