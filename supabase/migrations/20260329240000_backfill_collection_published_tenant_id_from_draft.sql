-- Published collection_items / collection_item_values sometimes had tenant_id NULL while
-- draft rows had the correct tenant (publish upsert omitted tenant_id). SSR scopes reads
-- with .eq('tenant_id', requestTenant) and returned zero items. Fix existing rows;
-- new publishes copy tenant_id in collectionService + publishItem.

UPDATE collection_items pub
SET tenant_id = dr.tenant_id
FROM collection_items dr
WHERE pub.id = dr.id
  AND pub.is_published = true
  AND dr.is_published = false
  AND pub.tenant_id IS NULL
  AND dr.tenant_id IS NOT NULL;

UPDATE collection_item_values pub
SET tenant_id = dr.tenant_id
FROM collection_item_values dr
WHERE pub.id = dr.id
  AND pub.is_published = true
  AND dr.is_published = false
  AND pub.tenant_id IS NULL
  AND dr.tenant_id IS NOT NULL;
