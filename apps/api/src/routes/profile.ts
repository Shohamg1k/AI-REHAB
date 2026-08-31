import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  UpdateContraindicationsRequestSchema,
  UpdateDataSharingRequestSchema,
  UpdateRoutineRequestSchema
} from "@ai-rehab/contracts";
import { forbidden, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";
import { signToken } from "../auth/jwt.js";

/**
 * A patient's self-declared contraindicated regions — what E5 checks a
 * proposed program against (see routes/programs.ts). Self- or clinician-
 * declared is a real clinical-accuracy gap (this MVP does not verify
 * either against an actual medical record); it exists so E5 has something
 * concrete to check rather than nothing at all. See docs/STATUS.md.
 */
export function registerProfileRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.put("/me/contraindications", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "patient") {
      forbidden(reply, "Only a patient account has contraindications.");
      return;
    }

    const body = parseBody(UpdateContraindicationsRequestSchema, request.body, reply);
    if (!body) return;

    const user = await store.updateContraindications(auth.tenantId, auth.userId, body.contraindicatedRegions);
    reply.send(user);
  });

  /**
   * G5's other half: the audit log (GET /audit-log) tells a patient who
   * looked at their data; this lets them stop a clinician from looking at
   * all. Enforced in GET /patients/:patientId/sessions, not here — this
   * route only flips the flag.
   */
  fastify.put("/me/data-sharing", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "patient") {
      forbidden(reply, "Only a patient account controls data sharing.");
      return;
    }

    const body = parseBody(UpdateDataSharingRequestSchema, request.body, reply);
    if (!body) return;

    const user = await store.updateDataSharing(auth.tenantId, auth.userId, body.dataSharingEnabled);
    reply.send(user);
  });

  /**
   * The patient's own exercise selection, stored server-side so it follows
   * them between devices. Patient-only: a routine is something a patient
   * chooses for themselves, and a clinician expressing what a patient should
   * do is a Program, which goes through the E5 check first.
   */
  fastify.put("/me/routine", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "patient") {
      forbidden(reply, "Only a patient has a routine of their own.");
      return;
    }

    const body = parseBody(UpdateRoutineRequestSchema, request.body, reply);
    if (!body) return;

    const user = await store.updateRoutine(auth.tenantId, auth.userId, body.exerciseIds);
    reply.send(user);
  });

  /**
   * Redeem a clinician's invite code after signup, for a patient who started
   * without one — which is the default, since the whole flow is guest-first.
   * Previously the only chance to enter a code was the signup form.
   */
  fastify.post("/me/join", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "patient") {
      forbidden(reply, "Only a patient can join a clinician with an invite code.");
      return;
    }

    const body = parseBody(z.object({ code: z.string().min(1) }), request.body, reply);
    if (!body) return;

    const user = await store.joinTenantByInvite(auth.userId, body.code);
    if (!user) {
      reply
        .code(400)
        .send({ error: "invalid_invite", message: "That invite code is invalid or has expired." });
      return;
    }

    // The tenant in the caller's existing token is now stale, so a fresh one
    // has to come back with the user or every subsequent request is scoped to
    // the tenant they just left.
    reply.send({ token: signToken({ sub: user.id, tenantId: user.tenantId, role: user.role }), user });
  });
}
