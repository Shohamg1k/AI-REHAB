import type { FastifyPluginAsync } from "fastify";
import { CreateProgramRequestSchema } from "@ai-rehab/contracts";
import { forbidden, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/** F6 (M2 slice) — clinician assigns a program (which exercises, sets/reps); patient reads their current one. */
export function registerProgramRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.post("/programs", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (auth.role !== "clinician") {
      forbidden(reply, "Only clinicians can assign programs.");
      return;
    }

    const body = parseBody(CreateProgramRequestSchema, request.body, reply);
    if (!body) return;

    const linked = await store.isLinked(auth.tenantId, auth.userId, body.patientId);
    if (!linked) {
      forbidden(reply, "This patient is not on your roster.");
      return;
    }

    const program = await store.createProgram({
      tenantId: auth.tenantId,
      patientId: body.patientId,
      createdBy: auth.userId,
      notes: body.notes ?? null,
      exercises: body.exercises.map((ex, i) => ({ ...ex, sortOrder: i }))
    });
    reply.code(201).send(program);
  });

  fastify.get("/programs/mine", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const program = await store.getCurrentProgram(auth.tenantId, auth.userId);
    reply.send(program); // null is a valid, expected response — no program assigned yet
  });
}
