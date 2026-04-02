-- Tenant-scope remaining service-role tables: MCP/API tokens, app settings, webhooks,
-- import jobs, version history, translations (denormalized from locales), webhook deliveries.

-- ─── mcp_tokens ─────────────────────────────────────────────────────────────
alter table public.mcp_tokens
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_mcp_tokens_tenant_id on public.mcp_tokens (tenant_id);

update public.mcp_tokens m
set tenant_id = coalesce(
  m.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where m.tenant_id is null;

-- ─── api_keys ───────────────────────────────────────────────────────────────
alter table public.api_keys
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_api_keys_tenant_id on public.api_keys (tenant_id);

update public.api_keys k
set tenant_id = coalesce(
  k.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where k.tenant_id is null;

-- ─── app_settings: composite unique becomes (tenant_id, app_id, key) ─────────
alter table public.app_settings
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

update public.app_settings s
set tenant_id = coalesce(
  s.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where s.tenant_id is null;

alter table public.app_settings drop constraint if exists app_settings_app_id_key_unique;

create unique index if not exists app_settings_tenant_app_key_uq
  on public.app_settings (tenant_id, app_id, key);

-- ─── webhooks ───────────────────────────────────────────────────────────────
alter table public.webhooks
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_webhooks_tenant_id on public.webhooks (tenant_id);

update public.webhooks w
set tenant_id = coalesce(
  w.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where w.tenant_id is null;

-- ─── webhook_deliveries (denormalized tenant for scoped cleanup) ────────────
alter table public.webhook_deliveries
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_webhook_deliveries_tenant_id on public.webhook_deliveries (tenant_id);

update public.webhook_deliveries d
set tenant_id = w.tenant_id
from public.webhooks w
where d.webhook_id = w.id
  and d.tenant_id is null;

update public.webhook_deliveries d
set tenant_id = coalesce(
  d.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where d.tenant_id is null;

-- ─── collection_imports ─────────────────────────────────────────────────────
alter table public.collection_imports
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_collection_imports_tenant_id on public.collection_imports (tenant_id);

update public.collection_imports ci
set tenant_id = sub.tenant_id
from (
  select distinct on (c.id) c.id, c.tenant_id
  from public.collections c
  order by c.id, c.is_published
) sub
where ci.collection_id = sub.id
  and ci.tenant_id is null;

-- ─── versions (entity types: page_layers, component, layer_style) ───────────
alter table public.versions
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_versions_tenant_id on public.versions (tenant_id);
create index if not exists idx_versions_tenant_entity on public.versions (tenant_id, entity_type, entity_id);

update public.versions v
set tenant_id = sub.tenant_id
from (
  select distinct on (pl.id) pl.id, pl.tenant_id
  from public.page_layers pl
  order by pl.id, pl.is_published
) sub
where v.entity_type = 'page_layers'
  and v.entity_id = sub.id
  and v.tenant_id is null;

update public.versions v
set tenant_id = sub.tenant_id
from (
  select distinct on (c.id) c.id, c.tenant_id
  from public.components c
  order by c.id, c.is_published
) sub
where v.entity_type = 'component'
  and v.entity_id = sub.id
  and v.tenant_id is null;

update public.versions v
set tenant_id = sub.tenant_id
from (
  select distinct on (ls.id) ls.id, ls.tenant_id
  from public.layer_styles ls
  order by ls.id, ls.is_published
) sub
where v.entity_type = 'layer_style'
  and v.entity_id = sub.id
  and v.tenant_id is null;

update public.versions v
set tenant_id = coalesce(
  v.tenant_id,
  (select id from public.tenant_registry order by created_at asc limit 1)
)
where v.tenant_id is null;

-- ─── translations (denormalized from locales) ──────────────────────────────
alter table public.translations
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_translations_tenant_id on public.translations (tenant_id);
create index if not exists idx_translations_tenant_locale on public.translations (tenant_id, locale_id);

update public.translations t
set tenant_id = l.tenant_id
from public.locales l
where t.locale_id = l.id
  and t.is_published = l.is_published
  and t.tenant_id is null;

-- Extend tenant purge (FK-safe: children before parents where needed)
create or replace function public.delete_tenant_scoped_data(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    return;
  end if;

  delete from public.webhook_deliveries where tenant_id = p_tenant_id;
  delete from public.webhooks where tenant_id = p_tenant_id;
  delete from public.versions where tenant_id = p_tenant_id;
  delete from public.collection_imports where tenant_id = p_tenant_id;
  delete from public.api_keys where tenant_id = p_tenant_id;
  delete from public.mcp_tokens where tenant_id = p_tenant_id;
  delete from public.app_settings where tenant_id = p_tenant_id;
  delete from public.translations where tenant_id = p_tenant_id;
  delete from public.color_variables where tenant_id = p_tenant_id;

  delete from public.form_submissions where tenant_id = p_tenant_id;
  delete from public.collection_item_values where tenant_id = p_tenant_id;
  delete from public.collection_items where tenant_id = p_tenant_id;
  delete from public.page_layers where tenant_id = p_tenant_id;
  delete from public.collection_fields where tenant_id = p_tenant_id;
  delete from public.pages where tenant_id = p_tenant_id;
  delete from public.collections where tenant_id = p_tenant_id;
  delete from public.components where tenant_id = p_tenant_id;
  delete from public.layer_styles where tenant_id = p_tenant_id;
  delete from public.assets where tenant_id = p_tenant_id;
  delete from public.asset_folders where tenant_id = p_tenant_id;
  delete from public.fonts where tenant_id = p_tenant_id;
  delete from public.locales where tenant_id = p_tenant_id;
  delete from public.settings where tenant_id = p_tenant_id;
end;
$$;

create or replace function public.cleanup_orphan_tenant_rows()
returns table(table_name text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.webhook_deliveries c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'webhook_deliveries'; removed := n; return next;
  end if;

  delete from public.webhooks c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'webhooks'; removed := n; return next;
  end if;

  delete from public.versions c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'versions'; removed := n; return next;
  end if;

  delete from public.collection_imports c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'collection_imports'; removed := n; return next;
  end if;

  delete from public.api_keys c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'api_keys'; removed := n; return next;
  end if;

  delete from public.mcp_tokens c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'mcp_tokens'; removed := n; return next;
  end if;

  delete from public.app_settings c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'app_settings'; removed := n; return next;
  end if;

  delete from public.translations c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'translations'; removed := n; return next;
  end if;

  delete from public.color_variables c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'color_variables'; removed := n; return next;
  end if;

  delete from public.form_submissions c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'form_submissions'; removed := n; return next;
  end if;

  delete from public.collection_item_values c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'collection_item_values'; removed := n; return next;
  end if;

  delete from public.collection_items c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'collection_items'; removed := n; return next;
  end if;

  delete from public.page_layers c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'page_layers'; removed := n; return next;
  end if;

  delete from public.collection_fields c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'collection_fields'; removed := n; return next;
  end if;

  delete from public.pages c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'pages'; removed := n; return next;
  end if;

  delete from public.collections c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'collections'; removed := n; return next;
  end if;

  delete from public.components c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'components'; removed := n; return next;
  end if;

  delete from public.layer_styles c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'layer_styles'; removed := n; return next;
  end if;

  delete from public.assets c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'assets'; removed := n; return next;
  end if;

  delete from public.asset_folders c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'asset_folders'; removed := n; return next;
  end if;

  delete from public.fonts c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'fonts'; removed := n; return next;
  end if;

  delete from public.locales c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'locales'; removed := n; return next;
  end if;

  delete from public.settings c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'settings'; removed := n; return next;
  end if;

  return;
end;
$$;

comment on function public.delete_tenant_scoped_data(uuid) is
  'Removes YCode/CMS rows for a tenant. Called before tenant_registry row delete; deactivated tenants are not deleted.';

comment on function public.cleanup_orphan_tenant_rows() is
  'Deletes YCode/CMS rows whose tenant_id does not exist in tenant_registry.';

revoke all on function public.delete_tenant_scoped_data(uuid) from public;
revoke all on function public.cleanup_orphan_tenant_rows() from public;
grant execute on function public.delete_tenant_scoped_data(uuid) to service_role;
grant execute on function public.cleanup_orphan_tenant_rows() to service_role;
