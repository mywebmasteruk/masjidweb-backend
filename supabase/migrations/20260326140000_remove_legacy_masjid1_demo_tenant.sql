-- Retire legacy masjid1 demo tenant seeded by 20260325200000_tenant_registry_demo_masjid1.sql.
-- Create demo sites via admin provision (e.g. slug demo) after updating the template on master.*.
-- BEFORE DELETE on tenant_registry runs tenant-scoped cleanup (tenant_lifecycle_cleanup).

delete from public.tenant_registry
where slug = 'masjid1';
