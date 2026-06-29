-- Phase 1 (see TENANT-ISOLATION-AND-CLONE-PLAN.md): fail-closed clone-coverage check.
--
-- The template clone engine (ycode-template-clone.ts + clone_cms_for_tenant) currently
-- covers every populated tenant-scoped table. The risk is LATENT: a Ycode core update
-- adds a new table classified 'clone' in mw_table_policy, but the clone code isn't
-- extended, so new tenants silently miss it once the template gets data there.
--
-- mw_tenant_clone_gaps(source, target) is registry-driven: for every table classified
-- 'clone', it flags any where the template (source) HAS rows but the tenant (target) has
-- ZERO — i.e. a table that was not cloned at all. The zero-vs-nonzero signal is
-- deliberately coarse (no draft/published/deleted filtering) so it never false-positives
-- on publish history or a tenant's own edits; it only catches "this table never cloned".
--
-- Read-only. Locked to service_role (called by the admin dashboard, same as the Phase 2
-- tripwire). Idempotent.

create or replace function public.mw_tenant_clone_gaps(p_source uuid, p_target uuid)
returns table(table_name text, source_rows bigint, target_rows bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  s bigint;
  t bigint;
begin
  for r in
    select p.table_name
    from public.mw_table_policy p
    where p.policy = 'clone'
    order by p.table_name
  loop
    execute format('select count(*) from public.%I where tenant_id = $1', r.table_name)
      into s using p_source;
    execute format('select count(*) from public.%I where tenant_id = $1', r.table_name)
      into t using p_target;
    if s > 0 and t = 0 then
      table_name := r.table_name;
      source_rows := s;
      target_rows := t;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.mw_tenant_clone_gaps(uuid, uuid) from public;
revoke all on function public.mw_tenant_clone_gaps(uuid, uuid) from anon;
revoke all on function public.mw_tenant_clone_gaps(uuid, uuid) from authenticated;
grant execute on function public.mw_tenant_clone_gaps(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
