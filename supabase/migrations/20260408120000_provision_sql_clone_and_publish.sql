-- Server-side SQL functions for tenant provisioning.
--
-- clone_cms_for_tenant  — replaces the JS HTTP-round-trip CMS seed
--   (copyTemplateContentToTenant) with a single bulk INSERT…SELECT.
--
-- publish_tenant_drafts — replaces the webhook POST /ycode/api/publish
--   by copying every versioned table's draft rows to published in one TX.
--
-- Together they drop provision wall time from 3+ min to a few seconds.

----------------------------------------------------------------------------
-- 1. clone_cms_for_tenant
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_cms_for_tenant(
  p_source_tenant uuid,
  p_target_tenant uuid,
  p_target_slug  text,
  p_id_map       jsonb          -- structure id mapping {"old_uuid":"new_uuid"}
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
  -- Item mapping: source → new id + mapped collection
  CREATE TEMP TABLE _cim (
    src      uuid PRIMARY KEY,
    dst      uuid NOT NULL,
    dst_coll uuid NOT NULL
  ) ON COMMIT DROP;

  -- Draft items first (preferred source)
  INSERT INTO _cim (src, dst, dst_coll)
  SELECT ci.id,
         gen_random_uuid(),
         COALESCE((p_id_map ->> ci.collection_id::text)::uuid, ci.collection_id)
  FROM   collection_items ci
  WHERE  ci.tenant_id = p_source_tenant
    AND  ci.is_published = false
    AND  ci.deleted_at IS NULL;

  -- Published-only items (no draft counterpart)
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

  -- Bulk-insert new items as drafts
  INSERT INTO collection_items
         (id, collection_id, manual_order, is_publishable, is_published,
          content_hash, created_at, updated_at, deleted_at, tenant_id)
  SELECT  m.dst, m.dst_coll, 0, true, false,
          NULL, v_now, v_now, NULL, p_target_tenant
  FROM    _cim m
  ON CONFLICT (id, is_published) DO NOTHING;
  GET DIAGNOSTICS v_items_created = ROW_COUNT;

  -- Reserved field IDs on the target tenant (tenant_id / tenant_slug CMS fields)
  CREATE TEMP TABLE _rf (fid uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _rf (fid)
  SELECT cf.id
  FROM   collection_fields cf
  WHERE  cf.tenant_id = p_target_tenant
    AND  cf.is_published = false
    AND  cf.deleted_at IS NULL
    AND  cf.key IN ('tenant_id', 'tenant_slug');

  -- Bulk-copy values; remap item_id + field_id; skip reserved fields
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
              civ.is_published ASC          -- false < true → prefer draft
  ) q
  WHERE NOT EXISTS (SELECT 1 FROM _rf WHERE fid = q.mapped_fid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_values_created = ROW_COUNT;

  -- Stamp tenant_id / tenant_slug on every cloned item
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
  'Bulk-clone CMS items + values from a template tenant. Called from provision-pipeline after structure clone.';

----------------------------------------------------------------------------
-- 2. publish_tenant_drafts
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_tenant_drafts(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_counts jsonb := '{}'::jsonb;
  v_cnt    int;
BEGIN
  -- ── asset_folders ──
  DELETE FROM asset_folders WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO asset_folders
         (id, asset_folder_id, name, depth, "order",
          is_published, created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, asset_folder_id, name, depth, "order",
          true, v_now, v_now, deleted_at, tenant_id
  FROM    asset_folders
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('asset_folders', v_cnt);

  -- ── assets ──
  DELETE FROM assets WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO assets
         (id, source, filename, storage_path, public_url, file_size, mime_type,
          width, height, content, content_hash, is_published,
          created_at, updated_at, deleted_at, asset_folder_id, tenant_id)
  SELECT  id, source, filename, storage_path, public_url, file_size, mime_type,
          width, height, content, NULL, true,
          v_now, v_now, deleted_at, asset_folder_id, tenant_id
  FROM    assets
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('assets', v_cnt);

  -- ── collections (uuid must be globally unique → new uuid for published copy) ──
  DELETE FROM collections WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO collections
         (id, name, uuid, sorting, "order",
          is_published, created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, name, gen_random_uuid(), sorting, "order",
          true, v_now, v_now, deleted_at, tenant_id
  FROM    collections
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('collections', v_cnt);

  -- ── collection_fields ──
  DELETE FROM collection_fields WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO collection_fields
         (id, collection_id, reference_collection_id, name, key, type, "default",
          fillable, "order", hidden, is_computed, data, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, collection_id, reference_collection_id, name, key, type, "default",
          fillable, "order", hidden, is_computed, data, true,
          v_now, v_now, deleted_at, tenant_id
  FROM    collection_fields
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('collection_fields', v_cnt);

  -- ── collection_items ──
  DELETE FROM collection_items WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO collection_items
         (id, collection_id, manual_order, is_publishable, is_published,
          content_hash, created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, collection_id, manual_order, is_publishable, true,
          NULL, v_now, v_now, deleted_at, tenant_id
  FROM    collection_items
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('collection_items', v_cnt);

  -- ── collection_item_values ──
  DELETE FROM collection_item_values WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO collection_item_values
         (id, item_id, field_id, value, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  gen_random_uuid(), item_id, field_id, value, true,
          v_now, v_now, deleted_at, tenant_id
  FROM    collection_item_values
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('collection_item_values', v_cnt);

  -- ── components ──
  DELETE FROM components WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO components
         (id, name, layers, variables, is_published, content_hash,
          thumbnail_url, created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, name, layers, variables, true, NULL,
          thumbnail_url, v_now, v_now, deleted_at, tenant_id
  FROM    components
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('components', v_cnt);

  -- ── fonts ──
  DELETE FROM fonts WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO fonts
         (id, name, family, type, variants, weights, category, kind, url,
          storage_path, file_hash, content_hash, is_published,
          created_at, updated_at, deleted_at, axes, tenant_id)
  SELECT  id, name, family, type, variants, weights, category, kind, url,
          storage_path, file_hash, NULL, true,
          v_now, v_now, deleted_at, axes, tenant_id
  FROM    fonts
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fonts', v_cnt);

  -- ── layer_styles ──
  DELETE FROM layer_styles WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO layer_styles
         (id, name, classes, design, is_published, content_hash,
          created_at, updated_at, deleted_at, "group", tenant_id)
  SELECT  id, name, classes, design, true, NULL,
          v_now, v_now, deleted_at, "group", tenant_id
  FROM    layer_styles
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('layer_styles', v_cnt);

  -- ── locales ──
  DELETE FROM locales WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO locales
         (id, code, label, is_default, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, code, label, is_default, true,
          v_now, v_now, deleted_at, tenant_id
  FROM    locales
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('locales', v_cnt);

  -- ── page_folders ──
  DELETE FROM page_folders WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO page_folders
         (id, page_folder_id, name, slug, depth, "order", settings,
          is_published, created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, page_folder_id, name, slug, depth, "order", settings,
          true, v_now, v_now, deleted_at, tenant_id
  FROM    page_folders
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('page_folders', v_cnt);

  -- ── page_layers ──
  DELETE FROM page_layers WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO page_layers
         (id, page_id, layers, is_published, content_hash,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, page_id, layers, true, NULL,
          v_now, v_now, deleted_at, tenant_id
  FROM    page_layers
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('page_layers', v_cnt);

  -- ── pages ──
  DELETE FROM pages WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO pages
         (id, page_folder_id, name, slug, "order", depth, is_index, is_dynamic,
          error_page, settings, is_published, content_hash,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  id, page_folder_id, name, slug, "order", depth, is_index, is_dynamic,
          error_page, settings, true, NULL,
          v_now, v_now, deleted_at, tenant_id
  FROM    pages
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('pages', v_cnt);

  -- ── translations ──
  DELETE FROM translations WHERE tenant_id = p_tenant_id AND is_published = true;
  INSERT INTO translations
         (id, locale_id, source_type, source_id, content_key, content_type,
          content_value, is_completed, is_published,
          created_at, updated_at, deleted_at, tenant_id)
  SELECT  gen_random_uuid(), locale_id, source_type, source_id, content_key,
          content_type, content_value, is_completed, true,
          v_now, v_now, deleted_at, tenant_id
  FROM    translations
  WHERE   tenant_id = p_tenant_id AND is_published = false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('translations', v_cnt);

  -- ── CSS: copy draft_css → published_css ──
  INSERT INTO settings (id, key, value, created_at, updated_at, tenant_id)
  SELECT gen_random_uuid(), 'published_css', s.value, v_now, v_now, p_tenant_id
  FROM   settings s
  WHERE  s.tenant_id = p_tenant_id AND s.key = 'draft_css'
  ON CONFLICT (tenant_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  -- ── published_at timestamp ──
  INSERT INTO settings (id, key, value, created_at, updated_at, tenant_id)
  VALUES (gen_random_uuid(), 'published_at', to_jsonb(v_now::text), v_now, v_now, p_tenant_id)
  ON CONFLICT (tenant_id, key)
  DO UPDATE SET value = to_jsonb(v_now::text), updated_at = v_now;

  RETURN v_counts;
END;
$$;

COMMENT ON FUNCTION public.publish_tenant_drafts IS
  'Copy every versioned table''s draft rows to published for one tenant. Replaces the webhook-based publish for provisioning.';
