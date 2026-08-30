import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { verifyToken, type AuthClaims } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the `authenticate` preHandler once a Bearer token verifies. Undefined on public routes. */
    auth?: AuthClaims;
  }
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

/**
 * Decorates every request with an `authenticate` preHandler. Routes that
 * need a signed-in user list it in their route options:
 * `{ preHandler: fastify.authenticate }`. Routes that don't (signup, login,
 * health) simply omit it — there is no global auth gate, so each route's
 * access level is visible at its own definition rather than inferred from
 * a separate allowlist.
 */
const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "unauthorized", message: "Missing bearer token." });
      return;
    }
    try {
      request.auth = verifyToken(header.slice("Bearer ".length));
    } catch {
      reply.code(401).send({ error: "unauthorized", message: "Invalid or expired token." });
    }
  });
};

export default fp(authPlugin);
