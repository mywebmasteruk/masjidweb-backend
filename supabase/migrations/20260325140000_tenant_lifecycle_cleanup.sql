-- Tenant status: add "deactivated" (data retained). Full removal only on DELETE from tenant_registry.
-- BEFORE DELETE on tenant_registry: remove all YCode rows for that tenant (dependency order).
-- cleanup_orphan_tenant_rows(): delete rows whose tenant_id no longer exists in tenant_registry.

-- 1) Status constraint
alter table public.tenant_registry drop constraint if exists tenant_registry_status_check;

alter table public.tenant_registry
  add constraint tenant_registry_status_check
  check (
    status in (
      'draft',
      'provisioning',
      'active',
      'failed',
      'suspended',
      'deactivated'
    )
  );

comment on column public.tenant_registry.status is
  'draft | provisioning | active | failed | suspended | deactivated (retain data; no delete).';

-- 2) Delete all YCode / CMS rows for one tenant (FK-safe order; matches provision-tenant-patch table set)
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

comment on function public.delete_tenant_scoped_data(uuid) is
  'Removes YCode/CMS rows for a tenant. Called before tenant_registry row delete; deactivated tenants are not deleted.';

-- 3) Before removing a tenant row, strip scoped data (homepage_content still cascades from tenant_registry FK)
create or replace function public.tenant_registry_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_tenant_scoped_data(old.id);
  return old;
end;
$$;

drop trigger if exists tenant_registry_ycode_cleanup on public.tenant_registry;

create trigger tenant_registry_ycode_cleanup
  before delete on public.tenant_registry
  for each row
  execute procedure public.tenant_registry_before_delete();

-- 4) Orphan cleanup: tenant_id set but no matching tenant_registry row
create or replace function public.cleanup_orphan_tenant_rows()
returns table(table_name text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  -- Same order as delete_tenant_scoped_data; WHERE targets orphan tenant_ids only
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

comment on function public.cleanup_orphan_tenant_rows() is
  'Deletes YCode/CMS rows whose tenant_id does not exist in tenant_registry.';

revoke all on function public.delete_tenant_scoped_data(uuid) from public;
revoke all on function public.cleanup_orphan_tenant_rows() from public;
grant execute on function public.delete_tenant_scoped_data(uuid) to service_role;
grant execute on function public.cleanup_orphan_tenant_rows() to service_role;
