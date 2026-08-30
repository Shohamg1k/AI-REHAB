import type { FastifyPluginAsync } from "fastify";
import { AuthResponseSchema, LoginRequestSchema, SignupRequestSchema } from "@ai-rehab/contracts";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { handleStoreError, parseBody, requireAuth } from "../http/errors.js";
import type { Store } from "../store/types.js";

/**
 * G3/G4 — signup, login, `me`. A patient signup either creates a
 * standalone tenant-of-one (self-service, no clinician yet — preserves the
 * "usable without a clinician" spirit of H7 guest sessions, just with a
 * durable account this time) or, given a clinician's invite code, joins
 * that clinician's tenant and is linked to them directly. A clinician
 * signup always creates a brand-new tenant.
 */
export function registerAuthRoutes(fastify: Parameters<FastifyPluginAsync>[0], store: Store): void {
  fastify.post("/auth/signup", async (request, reply) => {
    const body = parseBody(SignupRequestSchema, request.body, reply);
    if (!body) return;

    if (body.role === "clinician" && body.inviteCode) {
      reply.code(400).send({ error: "validation_failed", message: "A clinician account cannot use an invite code." });
      return;
    }

    let tenantId: string;
    let linkTo: string | null = null;

    if (body.role === "patient" && body.inviteCode) {
      const invite = await store.consumeInvite(body.inviteCode);
      if (!invite) {
        reply.code(400).send({ error: "invalid_invite", message: "That invite code is invalid or has expired." });
        return;
      }
      tenantId = invite.tenantId;
      linkTo = invite.createdBy;
    } else {
      const tenantName =
        body.role === "clinician" ? `${body.displayName}'s clinic` : `${body.displayName} (personal)`;
      const tenant = await store.createTenant(tenantName);
      tenantId = tenant.id;
    }

    try {
      const passwordHash = await hashPassword(body.password);
      const user = await store.createUser({
        tenantId,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: body.role
      });

      if (linkTo) {
        await store.linkPatient({ tenantId, clinicianId: linkTo, patientId: user.id });
      }

      const token = signToken({ sub: user.id, tenantId, role: user.role });
      reply.code(201).send(AuthResponseSchema.parse({ token, user }));
    } catch (err) {
      if (handleStoreError(err, reply)) return;
      throw err;
    }
  });

  fastify.post("/auth/login", async (request, reply) => {
    const body = parseBody(LoginRequestSchema, request.body, reply);
    if (!body) return;

    const found = await store.findUserByEmail(body.email);
    if (!found || !(await verifyPassword(body.password, found.passwordHash))) {
      // Same message for "no such user" and "wrong password" — distinguishing
      // them lets an attacker enumerate registered emails.
      reply.code(401).send({ error: "invalid_credentials", message: "Incorrect email or password." });
      return;
    }

    const { passwordHash: _passwordHash, ...user } = found;
    const token = signToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
    reply.send(AuthResponseSchema.parse({ token, user }));
  });

  fastify.get("/auth/me", { preHandler: fastify.authenticate }, async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const user = await store.findUserById(auth.tenantId, auth.userId);
    if (!user) {
      reply.code(404).send({ error: "not_found", message: "User not found." });
      return;
    }
    reply.send(user);
  });
}
