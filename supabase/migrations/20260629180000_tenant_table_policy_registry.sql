-- Phase 2 foundation (see TENANT-ISOLATION-AND-CLONE-PLAN.md): classification registry +
-- tripwire. Every public table is classified clone | never_clone | global | system.
-- mw_unclassified_tables() flags any NEW table (e.g. introduced by a Ycode core update)
-- or any policy/schema mismatch. Run it after every core update; non-empty = STOP and
-- classify before shipping. This is the source of truth for Phase 1 (clone) + Phase 3 (gate).

create table if not exists public.mw_table_policy (
  table_name text primary key,
  policy text not null check (policy in ('clone','never_clone','global','system')),
  is_tenant_scoped boolean not null,
  note text,
  recorded_at timestamptz not null default now()
);

insert into public.mw_table_policy (table_name, policy, is_tenant_scoped, note) values
('assets','clone',true,null),
('asset_folders','clone',true,null),
('collections','clone',true,null),
('collection_fields','clone',true,null),
('collection_items','clone',true,null),
('collection_item_values','clone',true,null),
('components','clone',true,null),
('layer_styles','clone',true,null),
('color_variables','clone',true,null),
('page_folders','clone',true,null),
('page_layers','clone',true,null),
('pages','clone',true,null),
('fonts','clone',true,null),
('locales','clone',true,null),
('settings','clone',true,null),
('tenant_homepage_content','clone',true,null),
('translations','clone',true,null),
('global_variables','clone',true,'site-wide content - cloned via clone_tenant_global_variables'),
('api_keys','never_clone',true,null),
('mcp_tokens','never_clone',true,null),
('app_settings','never_clone',true,'per-tenant integration secrets (e.g. MailerLite api_key) - never copy'),
('provisioning_audit_log','never_clone',true,null),
('form_submissions','never_clone',true,null),
('versions','never_clone',true,'page version history (runtime)'),
('webhooks','never_clone',true,null),
('webhook_deliveries','never_clone',true,null),
('collection_imports','never_clone',true,null),
('admin_ai_provider_settings','global',false,null),
('mcp_oauth_clients','global',false,'REVIEW: MCP OAuth, no tenant_id'),
('mcp_oauth_codes','global',false,'REVIEW: MCP OAuth codes, no tenant_id'),
('tenant_registry','system',false,null),
('core_update_audit_log','system',false,null),
('migrations','system',false,null),
('tenant_isolation_check_log','system',false,null),
('mw_table_policy','system',false,null)
on conflict (table_name) do update set policy=excluded.policy, is_tenant_scoped=excluded.is_tenant_scoped, note=excluded.note;

CREATE OR REPLACE FUNCTION public.mw_unclassified_tables()
 RETURNS TABLE(table_name text, has_tenant_id boolean, issue text)
 LANGUAGE sql
 STABLE
AS $function$
  select t.table_name,
    exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='tenant_id'),
    case
      when p.table_name is null then 'UNCLASSIFIED: new table - classify in mw_table_policy (clone/never_clone/global/system)'
      when p.is_tenant_scoped and not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='tenant_id') then 'MISMATCH: marked tenant-scoped but has no tenant_id'
      when (not p.is_tenant_scoped) and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='tenant_id') then 'MISMATCH: has tenant_id but classified non-tenant - confirm isolation'
    end
  from information_schema.tables t
  left join public.mw_table_policy p on p.table_name=t.table_name
  where t.table_schema='public' and t.table_type='BASE TABLE'
    and (p.table_name is null
      or (p.is_tenant_scoped <> exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='tenant_id')))
  order by 1;
$function$;
