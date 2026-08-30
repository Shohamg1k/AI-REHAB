import type { FastifyPluginAsync } from "fastify";
import { CreateProgramRequestSchema } from "@ai-rehab/contracts";
import { forbidden, parseBody, requireAuth } from "../http/errors.js";
import { RehabEngineUnavailableError, supervise } from "../rehabEngineClient.js";
import type { Store } from "../store/types.js";

/**
 * F6 (M2 slice) — clinician assigns a program; patient reads their current
 * one. Also where E5 actually gets called (docs/STATUS.md flagged this as
 * built-but-not-wired-up; this route closes that gap): every exercise in a
 * proposed program is checked against the patient's declared
 * contraindications before the program is created. A single blocked
 * exercise rejects the whole assignment — a clinician fixes the program
 * and resubmits, rather than a partial program silently missing one
 * exercise with no clear reason why.
 */
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

    const patient = await store.findUserById(auth.tenantId, body.patientId);
    if (!patient) {
      reply.code(404).send({ error: "not_found", message: "Patient not found." });
      return;
    }

    try {
      for (const exercise of body.exercises) {
        const decision = await supervise({
          exerciseId: exercise.exerciseId,
          targetRegions: exercise.targetRegions,
          intensity: exercise.intensity,
          patientContraindicatedRegions: patient.contraindicatedRegions
        });
        if (decision.blocked) {
          reply.code(422).send({
            error: "exercise_blocked",
            message: `"${exercise.exerciseId}" was not added: ${decision.reason}`,
            exerciseId: exercise.exerciseId,
            riskLevel: decision.riskLevel
          });
          return;
        }
      }
    } catch (err) {
      if (err instanceof RehabEngineUnavailableError) {
        request.log.warn({ err }, "E5 supervisor unreachable — see docs/STATUS.md on the fail-open default");
        // supervise() itself fails open when unconfigured; a thrown error
        // here means it *was* configured but errored — still fail open
        // rather than blocking every program assignment on an outage of a
        // second, coarser safety net that isn't the primary one (E1 is).
      } else {
        throw err;
      }
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
