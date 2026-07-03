-- Test-debris cleanup (admin-managed daily cron; see admin dashboard Maintenance page).
--
-- Two passes, both driven by the mw_table_policy registry + information_schema
-- introspection (never a hardcoded table list):
--   Pass A (designated TEST tenants only, resolved from mw_cleanup_config.test_tenant_slugs):
--     (a) hard-delete ALL soft-deleted rows, any age;
--     (b) delete live canary-pattern leftovers (collections/pages/folders whose name
--         matches test_name_patterns), children first — these are rows orphaned when a
--         canary/test run crashed before its own cleanup.
--   Pass B (ALL tenants): hard-delete rows soft-deleted more than retention_days ago.
--
-- Fail-closed: enabled=false by default; a disabled config makes real runs no-op
-- (dry-run previews always allowed). Function + tables are service_role-only and
-- called via PostgREST RPC from the admin dashboard (same pattern as
-- cleanup_orphan_tenant_rows / mw_unclassified_tables).

create table if not exists public.mw_cleanup_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  retention_days int not null default 30 check (retention_days >= 1),
  test_tenant_slugs text[] not null default '{high900,assasx7}',
  test_name_patterns text[] not null default '{"Canary %","canary-%","Repro %"}',
  updated_at timestamptz not null default now()
);

insert into public.mw_cleanup_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.mw_cleanup_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  mode text not null check (mode in ('scheduled','manual','preview')),
  dry_run boolean not null,
  status text not null check (status in ('ok','skipped','error')),
  deleted_counts jsonb,
  duration_ms int,
  error text
);

insert into public.mw_table_policy (table_name, policy, is_tenant_scoped, note) values
('mw_cleanup_config','system',false,'test-debris cleanup config (admin dashboard)'),
('mw_cleanup_log','system',false,'test-debris cleanup run log (admin dashboard)')
on conflict (table_name) do update set policy=excluded.policy, is_tenant_scoped=excluded.is_tenant_scoped, note=excluded.note;

create or replace function public.mw_cleanup_run(p_dry_run boolean default true, p_mode text default 'preview')
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $function$
declare
  cfg record;
  tenant_ids uuid[];
  sel_collections uuid[];
  sel_pages uuid[];
  counts_a jsonb := '{}'::jsonb;
  counts_b jsonb := '{}'::jsonb;
  n bigint;
  t record;
  started timestamptz := clock_timestamp();
  result jsonb;
begin
  select * into cfg from public.mw_cleanup_config where id = 1;
  if cfg is null then
    return jsonb_build_object('skipped', 'no-config');
  end if;

  if (not cfg.enabled) and (not p_dry_run) then
    insert into public.mw_cleanup_log (mode, dry_run, status, deleted_counts, duration_ms)
    values (p_mode, p_dry_run, 'skipped', jsonb_build_object('skipped','disabled'), 0);
    return jsonb_build_object('skipped', 'disabled');
  end if;

  select coalesce(array_agg(id), '{}') into tenant_ids
  from public.tenant_registry where slug = any(cfg.test_tenant_slugs);

  -- Registry+introspection-driven table loop: tenant-scoped tables that really
  -- exist and have BOTH tenant_id and deleted_at columns. Tables without
  -- deleted_at (versions, form_submissions, ...) are skipped by construction.
  for t in
    select p.table_name from public.mw_table_policy p
    where p.is_tenant_scoped
      and exists (select 1 from information_schema.tables it
                  where it.table_schema = 'public' and it.table_name = p.table_name)
      and exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p.table_name and c.column_name = 'tenant_id')
      and exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p.table_name and c.column_name = 'deleted_at')
    order by p.table_name
  loop
    -- Pass A(a): purge every soft-deleted row on the test tenants
    if cardinality(tenant_ids) > 0 then
      if p_dry_run then
        execute format('select count(*) from public.%I where tenant_id = any($1) and deleted_at is not null', t.table_name)
          into n using tenant_ids;
      else
        execute format('delete from public.%I where tenant_id = any($1) and deleted_at is not null', t.table_name)
          using tenant_ids;
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object(t.table_name, n); end if;
    end if;

    -- Pass B: retention purge for ALL tenants
    if p_dry_run then
      execute format('select count(*) from public.%I where deleted_at < now() - make_interval(days => $1)', t.table_name)
        into n using cfg.retention_days;
    else
      execute format('delete from public.%I where deleted_at < now() - make_interval(days => $1)', t.table_name)
        using cfg.retention_days;
      get diagnostics n = row_count;
    end if;
    if n > 0 then counts_b := counts_b || jsonb_build_object(t.table_name, n); end if;
  end loop;

  -- Pass A(b): live canary-pattern leftovers on the test tenants, children first.
  if cardinality(tenant_ids) > 0 then
    sel_collections := array(
      select distinct c.id from public.collections c
      where c.tenant_id = any(tenant_ids) and c.name like any(cfg.test_name_patterns)
    );
    if cardinality(sel_collections) > 0 then
      if p_dry_run then
        select count(*) into n from public.collection_item_values v
        where v.tenant_id = any(tenant_ids)
          and v.item_id in (select ci.id from public.collection_items ci
                            where ci.tenant_id = any(tenant_ids) and ci.collection_id = any(sel_collections));
      else
        delete from public.collection_item_values v
        where v.tenant_id = any(tenant_ids)
          and v.item_id in (select ci.id from public.collection_items ci
                            where ci.tenant_id = any(tenant_ids) and ci.collection_id = any(sel_collections));
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_item_values', n); end if;

      if p_dry_run then
        select count(*) into n from public.collection_items ci
        where ci.tenant_id = any(tenant_ids) and ci.collection_id = any(sel_collections);
      else
        delete from public.collection_items ci
        where ci.tenant_id = any(tenant_ids) and ci.collection_id = any(sel_collections);
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_collection_items', n); end if;

      if p_dry_run then
        select count(*) into n from public.collection_fields f
        where f.tenant_id = any(tenant_ids) and f.collection_id = any(sel_collections);
      else
        delete from public.collection_fields f
        where f.tenant_id = any(tenant_ids) and f.collection_id = any(sel_collections);
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_collection_fields', n); end if;

      if p_dry_run then
        select count(*) into n from public.collections c
        where c.tenant_id = any(tenant_ids) and c.id = any(sel_collections);
      else
        delete from public.collections c
        where c.tenant_id = any(tenant_ids) and c.id = any(sel_collections);
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_collections', n); end if;
    end if;

    sel_pages := array(
      select distinct p.id from public.pages p
      where p.tenant_id = any(tenant_ids) and p.name like any(cfg.test_name_patterns)
    );
    if cardinality(sel_pages) > 0 then
      if p_dry_run then
        select count(*) into n from public.page_layers l
        where l.tenant_id = any(tenant_ids) and l.page_id = any(sel_pages);
      else
        delete from public.page_layers l
        where l.tenant_id = any(tenant_ids) and l.page_id = any(sel_pages);
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_page_layers', n); end if;

      if p_dry_run then
        select count(*) into n from public.pages p
        where p.tenant_id = any(tenant_ids) and p.id = any(sel_pages);
      else
        delete from public.pages p
        where p.tenant_id = any(tenant_ids) and p.id = any(sel_pages);
        get diagnostics n = row_count;
      end if;
      if n > 0 then counts_a := counts_a || jsonb_build_object('canary_pages', n); end if;
    end if;

    -- Folders matching the patterns, only when no remaining page references them.
    if p_dry_run then
      select count(*) into n from public.page_folders f
      where f.tenant_id = any(tenant_ids) and f.name like any(cfg.test_name_patterns)
        and not exists (select 1 from public.pages p where p.page_folder_id = f.id);
    else
      delete from public.page_folders f
      where f.tenant_id = any(tenant_ids) and f.name like any(cfg.test_name_patterns)
        and not exists (select 1 from public.pages p where p.page_folder_id = f.id);
      get diagnostics n = row_count;
    end if;
    if n > 0 then counts_a := counts_a || jsonb_build_object('canary_page_folders', n); end if;
  end if;

  result := jsonb_build_object(
    'dryRun', p_dry_run,
    'testTenantSlugs', to_jsonb(cfg.test_tenant_slugs),
    'retentionDays', cfg.retention_days,
    'passA', counts_a,
    'passB', counts_b
  );

  insert into public.mw_cleanup_log (mode, dry_run, status, deleted_counts, duration_ms)
  values (p_mode, p_dry_run, 'ok', result,
          round(extract(epoch from clock_timestamp() - started) * 1000)::int);

  return result;
exception when others then
  insert into public.mw_cleanup_log (mode, dry_run, status, error, duration_ms)
  values (p_mode, p_dry_run, 'error', SQLERRM,
          round(extract(epoch from clock_timestamp() - started) * 1000)::int);
  return jsonb_build_object('error', SQLERRM);
end;
$function$;

-- Lock everything to the admin dashboard's service-role path (same pattern as
-- mw_unclassified_tables / cleanup_orphan_tenant_rows).
revoke all on function public.mw_cleanup_run(boolean, text) from public;
revoke all on function public.mw_cleanup_run(boolean, text) from anon;
revoke all on function public.mw_cleanup_run(boolean, text) from authenticated;
grant execute on function public.mw_cleanup_run(boolean, text) to service_role;

revoke all on table public.mw_cleanup_config from anon;
revoke all on table public.mw_cleanup_config from authenticated;
grant select, insert, update on table public.mw_cleanup_config to service_role;

revoke all on table public.mw_cleanup_log from anon;
revoke all on table public.mw_cleanup_log from authenticated;
grant select, insert on table public.mw_cleanup_log to service_role;

notify pgrst, 'reload schema';
