-- Backfill tenant_id on all content table rows where it is NULL.
-- Sets to the template tenant (MasjidDemo1) which is the only active tenant.
-- The translations table does NOT have a tenant_id column and is excluded.

DO $$
DECLARE
  tid uuid := '2fff887d-a78e-4256-9116-6e02fe38c614';
BEGIN
  UPDATE pages SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE page_layers SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE page_folders SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE collections SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE collection_fields SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE collection_items SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE collection_item_values SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE components SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE layer_styles SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE assets SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE asset_folders SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE fonts SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE locales SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE color_variables SET tenant_id = tid WHERE tenant_id IS NULL;
  UPDATE settings SET tenant_id = tid WHERE tenant_id IS NULL;
END $$;
