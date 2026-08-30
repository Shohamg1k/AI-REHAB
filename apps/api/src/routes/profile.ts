import type { FastifyPluginAsync } from "fastify";
import { UpdateContraindicationsRequestSchema } from "@ai-rehab/contracts";
import { forbidden, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

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
}
