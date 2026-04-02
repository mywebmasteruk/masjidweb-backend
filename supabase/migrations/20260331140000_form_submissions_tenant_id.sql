-- Tenant-scope form submissions (admin reads use service role; must not leak cross-tenant).

alter table public.form_submissions
  add column if not exists tenant_id uuid references public.tenant_registry (id) on delete set null;

create index if not exists idx_form_submissions_tenant_id
  on public.form_submissions (tenant_id);

create index if not exists idx_form_submissions_tenant_form_created
  on public.form_submissions (tenant_id, form_id, created_at desc);

-- Backfill existing rows to primary demo tenant (same pattern as other content backfills).
update public.form_submissions
set tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
where tenant_id is null;

-- Include in tenant purge (before registry row delete).
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

-- Orphan cleanup for form_submissions
create or replace function public.cleanup_orphan_tenant_rows()
returns table(table_name text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
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
