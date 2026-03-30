-- Template tenant: slug `manage` for manage.<domain>, business_name `master`.
-- Supersedes 20260327120000_master_tenant_slug_master.sql.

update public.tenant_registry
set slug = 'manage',
    business_name = 'master',
    updated_at = now()
where id = '2fff887d-a78e-4256-9116-6e02fe38c614';
