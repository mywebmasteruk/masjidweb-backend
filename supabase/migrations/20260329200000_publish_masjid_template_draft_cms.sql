-- Mirror all draft CMS + asset rows to published for the canonical Masjid template tenant.
-- Safe to re-run: skips rows that already have a published twin (same id, is_published = true).
--
-- Note: published `collections` rows get a NEW `uuid` (global unique) — draft keeps the original;
-- this matches app publish behaviour (draft/public API keys differ by design).

INSERT INTO public.collections (id, name, uuid, sorting, "order", is_published, created_at, updated_at, deleted_at, tenant_id)
SELECT d.id, d.name, gen_random_uuid(), d.sorting, d."order", true, d.created_at, now(), d.deleted_at, d.tenant_id
FROM public.collections d
WHERE d.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND d.is_published = false
  AND d.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.collections p WHERE p.id = d.id AND p.is_published = true);

INSERT INTO public.collection_fields (
  id, collection_id, reference_collection_id, name, key, type, "default", fillable, "order",
  hidden, is_computed, data, is_published, created_at, updated_at, deleted_at, tenant_id
)
SELECT
  f.id, f.collection_id, f.reference_collection_id, f.name, f.key, f.type, f."default", f.fillable, f."order",
  f.hidden, f.is_computed, f.data, true, f.created_at, now(), f.deleted_at, f.tenant_id
FROM public.collection_fields f
WHERE f.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND f.is_published = false
  AND f.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.collection_fields p WHERE p.id = f.id AND p.is_published = true);

INSERT INTO public.collection_items (
  id, collection_id, manual_order, is_publishable, is_published, content_hash, created_at, updated_at, deleted_at, tenant_id
)
SELECT
  i.id, i.collection_id, i.manual_order, COALESCE(i.is_publishable, true), true, i.content_hash, i.created_at, now(), i.deleted_at, i.tenant_id
FROM public.collection_items i
WHERE i.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND i.is_published = false
  AND i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.collection_items p WHERE p.id = i.id AND p.is_published = true);

INSERT INTO public.collection_item_values (
  id, value, item_id, field_id, is_published, created_at, updated_at, deleted_at, tenant_id
)
SELECT
  v.id, v.value, v.item_id, v.field_id, true, v.created_at, now(), v.deleted_at, v.tenant_id
FROM public.collection_item_values v
WHERE v.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND v.is_published = false
  AND v.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.collection_item_values p WHERE p.id = v.id AND p.is_published = true);

INSERT INTO public.asset_folders (
  id, asset_folder_id, name, depth, "order", is_published, created_at, updated_at, deleted_at, tenant_id
)
SELECT
  af.id, af.asset_folder_id, af.name, af.depth, af."order", true, af.created_at, now(), af.deleted_at, af.tenant_id
FROM public.asset_folders af
WHERE af.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND af.is_published = false
  AND af.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.asset_folders p WHERE p.id = af.id AND p.is_published = true);

INSERT INTO public.assets (
  id, source, filename, storage_path, public_url, file_size, mime_type, width, height,
  content, content_hash, is_published, created_at, updated_at, deleted_at, asset_folder_id, tenant_id
)
SELECT
  a.id, a.source, a.filename, a.storage_path, a.public_url, a.file_size, a.mime_type, a.width, a.height,
  a.content, a.content_hash, true, a.created_at, now(), a.deleted_at, a.asset_folder_id, a.tenant_id
FROM public.assets a
WHERE a.tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid
  AND a.is_published = false
  AND a.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.assets p WHERE p.id = a.id AND p.is_published = true);
