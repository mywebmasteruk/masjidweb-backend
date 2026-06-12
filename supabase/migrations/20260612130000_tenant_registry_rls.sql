-- Close anon-key data exposure on dashboard-owned tables.
-- tenant_registry had RLS disabled while exposed to PostgREST, so the public
-- anon key (shipped in browser bundles) could read every tenant's email, slug
-- and business name. Both readers (proxy tenant lookup, update-tenant-access)
-- use the service role, which bypasses RLS — so deny-all is safe and changes
-- nothing for the app. Same deny pattern as admin_login_attempts /
-- tenant_isolation_check_log.

alter table public.tenant_registry enable row level security;

drop policy if exists tenant_registry_deny_anon on public.tenant_registry;
create policy tenant_registry_deny_anon on public.tenant_registry
  for all to anon using (false) with check (false);

drop policy if exists tenant_registry_deny_authenticated on public.tenant_registry;
create policy tenant_registry_deny_authenticated on public.tenant_registry
  for all to authenticated using (false) with check (false);

-- provisioning_audit_log already had RLS enabled but no policy (deny-by-default,
-- already safe). Add explicit deny policies so intent is recorded and the
-- advisor INFO clears.
alter table public.provisioning_audit_log enable row level security;

drop policy if exists provisioning_audit_log_deny_anon on public.provisioning_audit_log;
create policy provisioning_audit_log_deny_anon on public.provisioning_audit_log
  for all to anon using (false) with check (false);

drop policy if exists provisioning_audit_log_deny_authenticated on public.provisioning_audit_log;
create policy provisioning_audit_log_deny_authenticated on public.provisioning_audit_log
  for all to authenticated using (false) with check (false);
