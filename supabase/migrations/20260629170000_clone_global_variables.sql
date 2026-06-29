-- Phase 0 of the tenant isolation/clone hardening (see TENANT-ISOLATION-AND-CLONE-PLAN.md).
-- Clone site-wide global_variables (template CONTENT) to new tenants, and keep the
-- existing asset-reference remap. NOTE: app_settings is intentionally NEVER cloned —
-- it holds per-tenant integration SECRETS (e.g. the template's MailerLite api_key).
-- global_variables PK is (id, is_published): draft+published share an id, so map each
-- source id to ONE new id across both variants (dedupe ids BEFORE assigning the uuid).

CREATE OR REPLACE FUNCTION public.clone_tenant_global_variables(p_source uuid, p_target uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  with src_ids as (
    select distinct id from public.global_variables where tenant_id = p_source and deleted_at is null
  ),
  idmap as ( select id as src_id, gen_random_uuid() as dst_id from src_ids )
  insert into public.global_variables (id, name, key, type, value, data, "order", is_published, created_at, updated_at, deleted_at, tenant_id)
  select m.dst_id, g.name, g.key, g.type, g.value, g.data, g."order", g.is_published, now(), now(), null, p_target
  from public.global_variables g join idmap m on m.src_id = g.id
  where g.tenant_id = p_source and g.deleted_at is null
  on conflict (id, is_published) do nothing;
  get diagnostics n = row_count;
  return n;
end; $function$


-- clone_cms_for_tenant now also clones global_variables (in addition to the asset remap):
CREATE OR REPLACE FUNCTION public.clone_cms_for_tenant(p_source_tenant uuid, p_target_tenant uuid, p_target_slug text, p_id_map jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_now            timestamptz := now();
  v_items_created  int := 0;
  v_values_created int := 0;
  v_stamps         int := 0;
BEGIN
  CREATE TEMP TABLE _cim (
    src      uuid PRIMARY KEY,
    dst      uuid NOT NULL,
    dst_coll uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _cim (src, dst, dst_coll)
  SELECT ci.id,
         gen_random_uuid(),
         COALESCE((p_id_map ->> ci.collection_id::text)::uuid, ci.collection_id)
  FROM   collection_items ci
  WHERE  ci.tenant_id = p_source_tenant
    AND  ci.is_published = false
    AND  ci.deleted_at IS NULL;

  INSERT INTO _cim (src, dst, dst_coll)
  SELECT ci.id,
         gen_random_uuid(),
         COALESCE((p_id_map ->> ci.collection_id::text)::uuid, ci.collection_id)
  FROM   collection_items ci
  WHERE  ci.tenant_id = p_source_tenant
    AND  ci.is_published = true
    AND  ci.deleted_at IS NULL
    AND  NOT EXISTS (SELECT 1 FROM _cim m WHERE m.src = ci.id)
  ON CONFLICT (src) DO NOTHING;

  INSERT INTO collection_items
         (id, collection_id, manual_order, is_publishable, is_published,
          content_hash, created_at, updated_at, deleted_at, tenant_id)
  SELECT  m.dst, m.dst_coll, 0, true, false,
          NULL, v_now, v_now, NULL, p_target_tenant
  FROM    _cim m
  ON CONFLICT (id, is_published) DO NOTHING;
  GET DIAGNOSTICS v_items_created = ROW_COUNT;

  CREATE TEMP TABLE _rf (fid uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _rf (fid)
  SELECT cf.id
  FROM   collection_fields cf
  WHERE  cf.tenant_id = p_target_tenant
    AND  cf.is_published = false
    AND  cf.deleted_at IS NULL
    AND  cf.key IN ('tenant_id', 'tenant_slug');

  INSERT INTO collection_item_values
         (id, item_id, field_id, value, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  gen_random_uuid(), q.dst_item, q.mapped_fid, q.value, false,
          v_now, v_now, NULL, p_target_tenant
  FROM (
    SELECT DISTINCT ON (m.dst,
                        COALESCE((p_id_map ->> civ.field_id::text)::uuid,
                                 civ.field_id))
           m.dst                                                     AS dst_item,
           COALESCE((p_id_map ->> civ.field_id::text)::uuid,
                    civ.field_id)                                     AS mapped_fid,
           civ.value
    FROM   collection_item_values civ
    JOIN   _cim m ON m.src = civ.item_id
    WHERE  civ.deleted_at IS NULL
    ORDER  BY m.dst,
              COALESCE((p_id_map ->> civ.field_id::text)::uuid, civ.field_id),
              civ.is_published ASC
  ) q
  WHERE NOT EXISTS (SELECT 1 FROM _rf WHERE fid = q.mapped_fid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_values_created = ROW_COUNT;

  INSERT INTO collection_item_values
         (id, item_id, field_id, value, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  gen_random_uuid(), m.dst, cf.id,
          CASE cf.key
            WHEN 'tenant_id'   THEN p_target_tenant::text
            WHEN 'tenant_slug' THEN p_target_slug
          END,
          false, v_now, v_now, NULL, p_target_tenant
  FROM   _cim m
  JOIN   collection_fields cf
    ON   cf.collection_id = m.dst_coll
    AND  cf.tenant_id     = p_target_tenant
    AND  cf.is_published  = false
    AND  cf.deleted_at IS NULL
    AND  cf.key IN ('tenant_id', 'tenant_slug')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_stamps = ROW_COUNT;

  -- MASJIDWEB: remap asset-reference field values (image/document) from the
  -- source template's asset ids to this tenant's cloned assets (matched by
  -- storage_path) so images resolve under tenant isolation.
  PERFORM public.remap_tenant_asset_references(p_source_tenant, p_target_tenant);
  -- MASJIDWEB: clone site-wide global_variables (template content) to the new tenant.
  PERFORM public.clone_tenant_global_variables(p_source_tenant, p_target_tenant);

  RETURN jsonb_build_object(
    'items_created',  v_items_created,
    'values_created', v_values_created + v_stamps
  );
END;
$function$

