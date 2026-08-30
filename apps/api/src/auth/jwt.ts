import jwt from "jsonwebtoken";
import type { Role } from "@ai-rehab/contracts";

export type AuthClaims = {
  sub: string; // userId
  tenantId: string;
  role: Role;
};

const EXPIRES_IN = "7d";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is not set or is too short (need >= 32 chars). " +
        "See .env.example — never use the placeholder value outside local dev."
    );
  }
  return secret;
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): AuthClaims {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded === "string") throw new Error("malformed token payload");
  const { sub, tenantId, role } = decoded as Partial<AuthClaims>;
  if (!sub || !tenantId || !role) throw new Error("token missing required claims");
  return { sub, tenantId, role };
}
