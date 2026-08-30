-- M2 — tenant isolation via Postgres row-level security (docs/ARCHITECTURE.md
-- "Postgres + Drizzle, RLS, tenant-scoped from migration one").
--
-- Every tenant-scoped table gets the same policy: a row is visible/writable
-- only when its tenant_id matches the current request's tenant, set per
-- transaction via `SET LOCAL app.tenant_id = '<uuid>'` — see
-- src/db/client.ts `withTenant()`. This is enforced at the database level,
-- independent of and in addition to the tenantId checks every Store method
-- already does in application code (src/store/types.ts) — a bug in one
-- layer should not silently become a cross-tenant leak.
--
-- `tenants` itself has no policy: nothing queries it by tenant_id (a tenant
-- doesn't belong to itself), and every row a user could reach through it is
-- already gated by the tables below.

-- Same bootstrapping problem as invite_codes, for the same reason: logging
-- in looks a user up BY EMAIL to discover which tenant they belong to, so a
-- tenant-scoped SELECT would make login impossible. This does not expose
-- data externally — only apps/api holds DATABASE_URL, there is no direct
-- client connection to Postgres — it only narrows the *second* defense-in-
-- depth layer for this one lookup path, same as invite redemption above.
-- Writes stay strictly tenant-scoped.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read_for_login ON "users"
  FOR SELECT USING (true);
CREATE POLICY users_insert_tenant_scoped ON "users"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY users_update_tenant_scoped ON "users"
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY users_delete_tenant_scoped ON "users"
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- invite_codes is deliberately NOT a single blanket policy like the tables
-- below. Redeeming a code (POST /auth/signup with inviteCode) happens
-- before the prospective patient's tenant is known — that's the whole
-- point of the lookup — so a tenant-scoped SELECT would make redemption
-- impossible: you cannot filter by the tenant you are trying to discover.
-- Possession of the code itself is the credential (a random 8-char token,
-- ~4 billion values — thin for a production posture, adequate for the M2
-- demo scope this is built for; a production hardening pass should add
-- rate limiting on redemption attempts). Creating an invite, by contrast,
-- always happens inside an authenticated clinician's own tenant context
-- and stays scoped.
ALTER TABLE "invite_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_read_by_code ON "invite_codes"
  FOR SELECT USING (true);
CREATE POLICY invite_delete_by_code ON "invite_codes"
  FOR DELETE USING (true);
CREATE POLICY invite_insert_tenant_scoped ON "invite_codes"
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "clinician_patient_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clinician_patient_links"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "programs"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "program_exercises" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "program_exercises"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "session_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "session_events"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_log"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- The application's own Postgres role must NOT have BYPASSRLS, or every
-- policy above is a no-op. Migration runs as the table owner (which does
-- bypass RLS by default in Postgres) specifically so it *can* create these
-- policies; the runtime connection in src/db/client.ts must use a
-- lower-privileged role. See docker-compose.yml for how the two are split
-- locally, and docs/STATUS.md for why this specific line has not been
-- exercised against a live database in this environment.
