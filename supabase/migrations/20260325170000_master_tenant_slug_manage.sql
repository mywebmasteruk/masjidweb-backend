-- Master / demo builder tenant: canonical slug `manage` for manage.<domain> (see ycode-masjidweb middleware.ts).
-- UUID matches TEMPLATE_TENANT_ID / clone source in admin-dashboard-v2.

update public.tenant_registry
set slug = 'manage', updated_at = now()
where id = '2fff887d-a78e-4256-9116-6e02fe38c614';
