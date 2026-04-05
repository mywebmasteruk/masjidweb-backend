-- Restore delete_tenant_scoped_data / cleanup_orphan_tenant_rows / count_orphan_tenant_rows
-- to include integration + submission tables dropped by 20260402140000_expand_orphan_cleanup_and_preview.sql.
-- Aligns with admin TENANT_SCOPED_CONTENT_TABLES and 20260331150000_misc_tables_tenant_id.sql.

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

  delete from public.translations t
  using public.locales l
  where l.tenant_id = p_tenant_id
    and t.locale_id = l.id
    and t.is_published = l.is_published;

  delete from public.translations where tenant_id = p_tenant_id;

  delete from public.form_submissions where tenant_id = p_tenant_id;

  delete from public.collection_item_values where tenant_id = p_tenant_id;
  delete from public.collection_items where tenant_id = p_tenant_id;
  delete from public.page_layers where tenant_id = p_tenant_id;
  delete from public.collection_fields where tenant_id = p_tenant_id;
  delete from public.pages where tenant_id = p_tenant_id;
  delete from public.page_folders where tenant_id = p_tenant_id;
  delete from public.collections where tenant_id = p_tenant_id;
  delete from public.components where tenant_id = p_tenant_id;
  delete from public.layer_styles where tenant_id = p_tenant_id;
  delete from public.color_variables where tenant_id = p_tenant_id;
  delete from public.assets where tenant_id = p_tenant_id;
  delete from public.asset_folders where tenant_id = p_tenant_id;
  delete from public.fonts where tenant_id = p_tenant_id;
  delete from public.locales where tenant_id = p_tenant_id;
  delete from public.settings where tenant_id = p_tenant_id;
  delete from public.tenant_homepage_content where tenant_id = p_tenant_id;
end;
$$;

comment on function public.delete_tenant_scoped_data(uuid) is
  'Removes YCode/CMS, integrations, submissions, and homepage rows for a tenant. Called before tenant_registry row delete.';

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

  delete from public.translations t
  where (
    exists (
      select 1
      from public.locales l
      where l.id = t.locale_id
        and l.is_published = t.is_published
        and l.tenant_id is not null
        and not exists (select 1 from public.tenant_registry tr where tr.id = l.tenant_id)
    )
    or (
      t.tenant_id is not null
      and not exists (select 1 from public.tenant_registry tr where tr.id = t.tenant_id)
    )
  );
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'translations'; removed := n; return next;
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

  delete from public.page_folders c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'page_folders'; removed := n; return next;
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

  delete from public.color_variables c
  where c.tenant_id is not null
    and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'color_variables'; removed := n; return next;
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

  delete from public.tenant_homepage_content c
  where not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'tenant_homepage_content'; removed := n; return next;
  end if;

  return;
end;
$$;

comment on function public.cleanup_orphan_tenant_rows() is
  'Deletes rows whose tenant_id (or translation/locale chain) has no tenant_registry row.';

create or replace function public.count_orphan_tenant_rows()
returns table(table_name text, pending bigint)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select 'webhook_deliveries'::text as t,
      (select count(*)::bigint from public.webhook_deliveries c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id)) as p
    union all
    select 'webhooks',
      (select count(*)::bigint from public.webhooks c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'versions',
      (select count(*)::bigint from public.versions c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'collection_imports',
      (select count(*)::bigint from public.collection_imports c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'api_keys',
      (select count(*)::bigint from public.api_keys c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'mcp_tokens',
      (select count(*)::bigint from public.mcp_tokens c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'app_settings',
      (select count(*)::bigint from public.app_settings c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'translations',
      (select count(*)::bigint from public.translations t
       where (
         exists (
           select 1 from public.locales l
           where l.id = t.locale_id
             and l.is_published = t.is_published
             and l.tenant_id is not null
             and not exists (select 1 from public.tenant_registry tr where tr.id = l.tenant_id)
         )
         or (
           t.tenant_id is not null
           and not exists (select 1 from public.tenant_registry tr where tr.id = t.tenant_id)
         )
       ))
    union all
    select 'form_submissions',
      (select count(*)::bigint from public.form_submissions c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'collection_item_values',
      (select count(*)::bigint from public.collection_item_values c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'collection_items',
      (select count(*)::bigint from public.collection_items c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'page_layers',
      (select count(*)::bigint from public.page_layers c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'collection_fields',
      (select count(*)::bigint from public.collection_fields c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'pages',
      (select count(*)::bigint from public.pages c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'page_folders',
      (select count(*)::bigint from public.page_folders c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'collections',
      (select count(*)::bigint from public.collections c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'components',
      (select count(*)::bigint from public.components c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'layer_styles',
      (select count(*)::bigint from public.layer_styles c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'color_variables',
      (select count(*)::bigint from public.color_variables c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'assets',
      (select count(*)::bigint from public.assets c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'asset_folders',
      (select count(*)::bigint from public.asset_folders c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'fonts',
      (select count(*)::bigint from public.fonts c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'locales',
      (select count(*)::bigint from public.locales c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'settings',
      (select count(*)::bigint from public.settings c
       where c.tenant_id is not null
         and not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
    union all
    select 'tenant_homepage_content',
      (select count(*)::bigint from public.tenant_homepage_content c
       where not exists (select 1 from public.tenant_registry tr where tr.id = c.tenant_id))
  )
  select counts.t as table_name, counts.p as pending
  from counts
  where counts.p > 0
  order by counts.t;
$$;

comment on function public.count_orphan_tenant_rows() is
  'Returns per-table row counts that cleanup_orphan_tenant_rows() would delete (preview only).';

revoke all on function public.delete_tenant_scoped_data(uuid) from public;
revoke all on function public.cleanup_orphan_tenant_rows() from public;
revoke all on function public.count_orphan_tenant_rows() from public;
grant execute on function public.delete_tenant_scoped_data(uuid) to service_role;
grant execute on function public.cleanup_orphan_tenant_rows() to service_role;
grant execute on function public.count_orphan_tenant_rows() to service_role;
