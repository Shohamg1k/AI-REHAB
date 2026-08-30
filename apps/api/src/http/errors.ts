import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodSchema } from "zod";
import { ConflictError, NotFoundError } from "../store/types.js";

/**
 * Every route parses its body/query through here instead of trusting
 * Fastify's own JSON parsing alone — `packages/contracts`' Zod schemas are
 * the single source of truth for shape, shared with the browser client, so
 * validation never drifts between the two ends of the wire.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({ error: "validation_failed", details: result.error.flatten() });
    return null;
  }
  return result.data;
}

export function handleStoreError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof NotFoundError) {
    reply.code(404).send({ error: "not_found", message: err.message });
    return true;
  }
  if (err instanceof ConflictError) {
    reply.code(409).send({ error: "conflict", message: err.message });
    return true;
  }
  return false;
}

export function unauthorized(reply: FastifyReply, message = "Authentication required."): void {
  reply.code(401).send({ error: "unauthorized", message });
}

export function forbidden(reply: FastifyReply, message = "Not allowed."): void {
  reply.code(403).send({ error: "forbidden", message });
}

/** Narrow helper so route handlers don't repeat the same `if (!request.auth)` guard. */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): { userId: string; tenantId: string; role: "patient" | "clinician" } | null {
  if (!request.auth) {
    unauthorized(reply);
    return null;
  }
  return { userId: request.auth.sub, tenantId: request.auth.tenantId, role: request.auth.role };
}
