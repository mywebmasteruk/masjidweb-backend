-- Phase 2 enforcement (see TENANT-ISOLATION-AND-CLONE-PLAN.md): expose the
-- tenant-isolation tripwire to the admin dashboard ONLY.
--
-- The admin dashboard (admin-dashboard-v2) reads public.mw_unclassified_tables()
-- via PostgREST RPC using the service-role key (same pattern as
-- count_orphan_tenant_rows). Lock the tripwire function + registry table to
-- service_role so they are NOT reachable from the public anon/authenticated API
-- (they only expose internal table names, but there is no reason to publish them).
-- Idempotent.

revoke all on function public.mw_unclassified_tables() from public;
revoke all on function public.mw_unclassified_tables() from anon;
revoke all on function public.mw_unclassified_tables() from authenticated;
grant execute on function public.mw_unclassified_tables() to service_role;

revoke all on table public.mw_table_policy from anon;
revoke all on table public.mw_table_policy from authenticated;
grant select on table public.mw_table_policy to service_role;

-- Refresh PostgREST's schema cache so the function is callable as an RPC.
notify pgrst, 'reload schema';
