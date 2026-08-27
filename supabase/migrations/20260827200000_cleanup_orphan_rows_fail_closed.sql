-- Fail-closed guard for cleanup_orphan_tenant_rows().
--
-- Incident 2026-08-27: a stale PostgREST instance rejected the project's
-- service-role key with PGRST303 "JWT issued at future" for ~9 hours. Every
-- service-role read returned nothing, so the admin dashboard showed "0 tenants"
-- while all 5 tenant_registry rows were perfectly intact.
--
-- cleanup_orphan_tenant_rows() deletes any row whose tenant_id has no matching
-- tenant_registry row. With the registry reading empty, EVERY row in EVERY
-- tenant table looks orphaned. Running this function during that window would
-- have converted a transient key outage into permanent, unrecoverable data loss.
--
-- This migration recreates the function (body captured verbatim from production
-- via pg_get_functiondef, so no drift) with a guard: refuse to run when
-- tenant_registry is empty. A genuinely empty registry has nothing to clean up,
-- so the guard costs nothing in the legitimate case.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_tenant_rows()
 RETURNS TABLE(table_name text, removed bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n bigint;
  registry_count bigint;
begin
  -- FAIL CLOSED (2026-08-27 incident): every delete below treats a row as orphaned
  -- when no tenant_registry row matches its tenant_id. If the registry reads EMPTY,
  -- every row in every tenant table looks orphaned and this function would destroy
  -- the entire database.
  --
  -- An empty registry is almost never real. On 2026-08-27 a stale PostgREST instance
  -- rejected the service-role key ("JWT issued at future") for ~9 hours, so every
  -- registry read returned nothing while all 5 tenants were perfectly intact. Running
  -- this function during that window would have turned a key outage into permanent,
  -- unrecoverable data loss.
  --
  -- Refuse instead. A genuinely empty registry has nothing to clean up anyway, so
  -- this costs nothing in the legitimate case.
  select count(*) into registry_count from public.tenant_registry;
  if registry_count = 0 then
    raise exception
      'cleanup_orphan_tenant_rows: refusing to run - tenant_registry is empty, which indicates a failed registry read rather than a genuinely empty registry. Verify registry access before retrying.';
  end if;
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
$function$
;
