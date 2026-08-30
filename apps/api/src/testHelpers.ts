import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memoryStore.js";

// A fixed, sufficiently-long test secret — never read from the real
// environment so a test run can never accidentally depend on (or leak into)
// a real deployment's JWT_SECRET.
process.env.JWT_SECRET = "test-only-secret-do-not-use-in-production-xxxx";

export async function buildTestApp(): Promise<{ app: FastifyInstance; store: MemoryStore }> {
  const store = new MemoryStore();
  const app = await buildApp({ store });
  return { app, store };
}

export async function signup(
  app: FastifyInstance,
  body: { email: string; password: string; displayName: string; role: "patient" | "clinician"; inviteCode?: string }
) {
  const res = await app.inject({ method: "POST", url: "/auth/signup", payload: body });
  return { status: res.statusCode, body: res.json() };
}

export async function login(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  return { status: res.statusCode, body: res.json() };
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}
