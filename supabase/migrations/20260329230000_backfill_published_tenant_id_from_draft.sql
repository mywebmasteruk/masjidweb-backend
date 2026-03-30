-- Published rows for pages/page_layers sometimes had tenant_id NULL while draft rows
-- had the correct tenant (publish upsert omitted tenant_id). SSR scopes by tenant and
-- would not find the homepage. Fix existing rows; new publishes are fixed in app code.

UPDATE pages pub
SET tenant_id = dr.tenant_id
FROM pages dr
WHERE pub.id = dr.id
  AND pub.is_published = true
  AND dr.is_published = false
  AND pub.tenant_id IS NULL
  AND dr.tenant_id IS NOT NULL;

UPDATE page_layers pub
SET tenant_id = dr.tenant_id
FROM page_layers dr
WHERE pub.id = dr.id
  AND pub.page_id = dr.page_id
  AND pub.is_published = true
  AND dr.is_published = false
  AND pub.tenant_id IS NULL
  AND dr.tenant_id IS NOT NULL;
