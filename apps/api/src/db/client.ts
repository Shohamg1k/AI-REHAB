import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export type Db = NodePgDatabase<typeof schema>;

/**
 * Runs `fn` inside a transaction with the RLS tenant variable set for its
 * duration — every tenant-scoped query inside `fn` is therefore filtered by
 * Postgres itself (see migrations/0001_rls.sql), on top of the application-
 * level `tenantId` scoping every `Store` method already does. `SET LOCAL`
 * rather than `SET` so the value cannot leak onto a pooled connection reused
 * by a different request after this transaction commits.
 *
 * Creating a brand-new tenant at signup needs no tenant context (`tenants`
 * carries no RLS policy — nothing queries it by tenant_id). The user row
 * created immediately after it is written via `withTenant(db, newTenant.id,
 * ...)`, which works because the tenant already exists by that point;
 * there is no window where a write needs to happen with no tenant known at
 * all. Consuming an invite code is the one read that genuinely can't know
 * its tenant in advance — that's handled with narrower policies on
 * `invite_codes` itself (see migrations/0001_rls.sql), not by bypassing
 * RLS at the connection level.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  // `SET LOCAL` does not accept a bind parameter for its value in Postgres,
  // so this has to be string-built — validated shape first rather than
  // trusting that tenantId (from a verified JWT, always a UUID we minted)
  // can never be attacker-controlled by the time it gets here.
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`refusing to set RLS tenant context to non-UUID value: ${tenantId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx as unknown as Db);
  });
}

export function createDb(): Db {
  return drizzle(getPool(), { schema });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
