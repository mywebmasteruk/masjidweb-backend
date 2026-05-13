-- Keep CMS item cloning aligned with the canonical collection clone.
--
-- If a template collection or field is absent from p_id_map, it was not cloned
-- into the target tenant (for example stale published-only collections hidden in
-- the template builder). Do not fall back to the original template IDs, otherwise
-- the new tenant receives orphaned collection_items / collection_item_values.

CREATE OR REPLACE FUNCTION public.clone_cms_for_tenant(
  p_source_tenant uuid,
  p_target_tenant uuid,
  p_target_slug  text,
  p_id_map       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
         (p_id_map ->> ci.collection_id::text)::uuid
  FROM   collection_items ci
  WHERE  ci.tenant_id = p_source_tenant
    AND  ci.is_published = false
    AND  ci.deleted_at IS NULL
    AND  p_id_map ? ci.collection_id::text;

  INSERT INTO _cim (src, dst, dst_coll)
  SELECT ci.id,
         gen_random_uuid(),
         (p_id_map ->> ci.collection_id::text)::uuid
  FROM   collection_items ci
  WHERE  ci.tenant_id = p_source_tenant
    AND  ci.is_published = true
    AND  ci.deleted_at IS NULL
    AND  p_id_map ? ci.collection_id::text
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
    SELECT DISTINCT ON (m.dst, (p_id_map ->> civ.field_id::text)::uuid)
           m.dst                                      AS dst_item,
           (p_id_map ->> civ.field_id::text)::uuid    AS mapped_fid,
           civ.value
    FROM   collection_item_values civ
    JOIN   _cim m ON m.src = civ.item_id
    WHERE  civ.deleted_at IS NULL
      AND  p_id_map ? civ.field_id::text
    ORDER  BY m.dst,
              (p_id_map ->> civ.field_id::text)::uuid,
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

  RETURN jsonb_build_object(
    'items_created',  v_items_created,
    'values_created', v_values_created + v_stamps
  );
END;
$$;

COMMENT ON FUNCTION public.clone_cms_for_tenant IS
  'Bulk-clone CMS items + values from a template tenant. Only mapped collections/fields are cloned so stale hidden template structures do not leak into new tenants.';
