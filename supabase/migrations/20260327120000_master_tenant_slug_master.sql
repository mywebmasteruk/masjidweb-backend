-- Template tenant: canonical slug `master` for master.<domain> (see ycode-masjidweb middleware.ts).
-- Supersedes 20260325170000_master_tenant_slug_manage.sql for environments that already ran it.

update public.tenant_registry
set slug = 'master', updated_at = now()
where id = '2fff887d-a78e-4256-9116-6e02fe38c614';
