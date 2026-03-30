-- Defense-in-depth: RLS on all tenant-scoped content tables.
-- Authenticated users can only access rows matching their JWT user_metadata.tenant_id.
-- Service role bypasses RLS (used by provisioning, cloning, admin dashboard).
-- Anonymous users are denied access to all content tables.
--
-- The JWT claim path is: auth.jwt() -> 'user_metadata' ->> 'tenant_id'

-- Helper: extract tenant_id from the current JWT (returns NULL if missing).
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid;
$$;

comment on function public.current_tenant_id() is
  'Returns the tenant_id from the authenticated user JWT user_metadata. NULL if not set.';


-- Macro: enable RLS + add deny-anon + tenant-scoped authenticated policies.
-- Applied to each tenant-scoped table below.

-- ──────────────────────────────────────────────────────────────────────────────
-- pages
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.pages enable row level security;

create policy pages_deny_anon on public.pages
  for all to anon using (false) with check (false);

create policy pages_tenant_select on public.pages
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy pages_tenant_insert on public.pages
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy pages_tenant_update on public.pages
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy pages_tenant_delete on public.pages
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- page_layers
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.page_layers enable row level security;

create policy page_layers_deny_anon on public.page_layers
  for all to anon using (false) with check (false);

create policy page_layers_tenant_select on public.page_layers
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy page_layers_tenant_insert on public.page_layers
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy page_layers_tenant_update on public.page_layers
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy page_layers_tenant_delete on public.page_layers
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- collections
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.collections enable row level security;

create policy collections_deny_anon on public.collections
  for all to anon using (false) with check (false);

create policy collections_tenant_select on public.collections
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy collections_tenant_insert on public.collections
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy collections_tenant_update on public.collections
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy collections_tenant_delete on public.collections
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- collection_fields
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.collection_fields enable row level security;

create policy collection_fields_deny_anon on public.collection_fields
  for all to anon using (false) with check (false);

create policy collection_fields_tenant_select on public.collection_fields
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy collection_fields_tenant_insert on public.collection_fields
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy collection_fields_tenant_update on public.collection_fields
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy collection_fields_tenant_delete on public.collection_fields
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- collection_items
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.collection_items enable row level security;

create policy collection_items_deny_anon on public.collection_items
  for all to anon using (false) with check (false);

create policy collection_items_tenant_select on public.collection_items
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy collection_items_tenant_insert on public.collection_items
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy collection_items_tenant_update on public.collection_items
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy collection_items_tenant_delete on public.collection_items
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- collection_item_values
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.collection_item_values enable row level security;

create policy collection_item_values_deny_anon on public.collection_item_values
  for all to anon using (false) with check (false);

create policy collection_item_values_tenant_select on public.collection_item_values
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy collection_item_values_tenant_insert on public.collection_item_values
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy collection_item_values_tenant_update on public.collection_item_values
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy collection_item_values_tenant_delete on public.collection_item_values
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- components
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.components enable row level security;

create policy components_deny_anon on public.components
  for all to anon using (false) with check (false);

create policy components_tenant_select on public.components
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy components_tenant_insert on public.components
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy components_tenant_update on public.components
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy components_tenant_delete on public.components
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- layer_styles
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.layer_styles enable row level security;

create policy layer_styles_deny_anon on public.layer_styles
  for all to anon using (false) with check (false);

create policy layer_styles_tenant_select on public.layer_styles
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy layer_styles_tenant_insert on public.layer_styles
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy layer_styles_tenant_update on public.layer_styles
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy layer_styles_tenant_delete on public.layer_styles
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- assets
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.assets enable row level security;

create policy assets_deny_anon on public.assets
  for all to anon using (false) with check (false);

create policy assets_tenant_select on public.assets
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy assets_tenant_insert on public.assets
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy assets_tenant_update on public.assets
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy assets_tenant_delete on public.assets
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- asset_folders
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.asset_folders enable row level security;

create policy asset_folders_deny_anon on public.asset_folders
  for all to anon using (false) with check (false);

create policy asset_folders_tenant_select on public.asset_folders
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy asset_folders_tenant_insert on public.asset_folders
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy asset_folders_tenant_update on public.asset_folders
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy asset_folders_tenant_delete on public.asset_folders
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- fonts
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.fonts enable row level security;

create policy fonts_deny_anon on public.fonts
  for all to anon using (false) with check (false);

create policy fonts_tenant_select on public.fonts
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy fonts_tenant_insert on public.fonts
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy fonts_tenant_update on public.fonts
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy fonts_tenant_delete on public.fonts
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- locales
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.locales enable row level security;

create policy locales_deny_anon on public.locales
  for all to anon using (false) with check (false);

create policy locales_tenant_select on public.locales
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy locales_tenant_insert on public.locales
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy locales_tenant_update on public.locales
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy locales_tenant_delete on public.locales
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- settings
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.settings enable row level security;

create policy settings_deny_anon on public.settings
  for all to anon using (false) with check (false);

create policy settings_tenant_select on public.settings
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy settings_tenant_insert on public.settings
  for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy settings_tenant_update on public.settings
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy settings_tenant_delete on public.settings
  for delete to authenticated using (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- color_variables (added via Knex migration, may not exist in all environments)
-- ──────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'color_variables') then
    execute 'alter table public.color_variables enable row level security';

    if not exists (select 1 from pg_policies where tablename = 'color_variables' and policyname = 'color_variables_deny_anon') then
      execute 'create policy color_variables_deny_anon on public.color_variables for all to anon using (false) with check (false)';
    end if;

    if not exists (select 1 from pg_policies where tablename = 'color_variables' and policyname = 'color_variables_tenant_select') then
      execute 'create policy color_variables_tenant_select on public.color_variables for select to authenticated using (tenant_id = public.current_tenant_id())';
    end if;

    if not exists (select 1 from pg_policies where tablename = 'color_variables' and policyname = 'color_variables_tenant_insert') then
      execute 'create policy color_variables_tenant_insert on public.color_variables for insert to authenticated with check (tenant_id = public.current_tenant_id())';
    end if;

    if not exists (select 1 from pg_policies where tablename = 'color_variables' and policyname = 'color_variables_tenant_update') then
      execute 'create policy color_variables_tenant_update on public.color_variables for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())';
    end if;

    if not exists (select 1 from pg_policies where tablename = 'color_variables' and policyname = 'color_variables_tenant_delete') then
      execute 'create policy color_variables_tenant_delete on public.color_variables for delete to authenticated using (tenant_id = public.current_tenant_id())';
    end if;
  end if;
end $$;

-- Grant execute on helper to authenticated (service_role already has it).
grant execute on function public.current_tenant_id() to authenticated;
