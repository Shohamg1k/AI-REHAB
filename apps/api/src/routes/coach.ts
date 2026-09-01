import type { FastifyPluginAsync } from "fastify";
import { CoachQuestionRequestSchema } from "@ai-rehab/contracts";
import { parseBody, requireAuth } from "../http/errors.js";
import { askCoach, CoachUnavailableError, isCoachConfigured } from "../coach/groqClient.js";

/**
 * C1/C3 — the between-sets coach (ADR-0009).
 *
 * The route sends only the derived facts the client passed, validated
 * against `CoachSessionFactsSchema`. That schema has no field for a
 * landmark, a frame, a name, or an email, so the shape of the request is
 * what stops identifying data reaching Groq — not the good intentions of
 * whoever writes the next caller.
 *
 * Signed-in only. Not for privacy reasons — a guest's data is no more
 * sensitive — but because this spends money against an API key, and an
 * unauthenticated endpoint that does that is a bill waiting to happen.
 */
export function registerCoachRoutes(fastify: Parameters<FastifyPluginAsync>[0], _store: unknown): void {
  fastify.get("/coach/status", async (_request, reply) => {
    reply.send({ available: isCoachConfigured() });
  });

  fastify.post("/coach/ask", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;

    const body = parseBody(CoachQuestionRequestSchema, request.body, reply);
    if (!body) return;

    try {
      reply.send(await askCoach(body.question, body.facts));
    } catch (err) {
      if (err instanceof CoachUnavailableError) {
        request.log.warn({ err }, "coach unavailable — see docs/adr/0009-llm-coaching-assistant.md");
        reply.code(503).send({
          error: "coach_unavailable",
          message: "The coach isn't available right now. Your session is saved either way."
        });
        return;
      }
      throw err;
    }
  });
}
