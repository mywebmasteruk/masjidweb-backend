-- Wipe YCode builder/CMS rows for the master template tenant and legacy NULL-tenant rows.
-- Preserves public.tenant_registry (manage / master) — only content tables are cleared.

begin;

create temporary table _wipe_tenants (tenant_id uuid) on commit drop;
insert into _wipe_tenants values
  ('2fff887d-a78e-4256-9116-6e02fe38c614'::uuid),
  (null);

-- Translations → locales
delete from public.translations t
using _wipe_tenants w
where t.locale_id in (
  select l.id from public.locales l
  where l.tenant_id is not distinct from w.tenant_id
);

delete from public.locales l
using _wipe_tenants w
where l.tenant_id is not distinct from w.tenant_id;

-- Collections cascade to fields / items / item_values
delete from public.collections c
using _wipe_tenants w
where c.tenant_id is not distinct from w.tenant_id;

-- Pages cascade to page_layers
delete from public.pages p
using _wipe_tenants w
where p.tenant_id is not distinct from w.tenant_id;

delete from public.page_folders pf
using _wipe_tenants w
where pf.tenant_id is not distinct from w.tenant_id;

delete from public.components c
using _wipe_tenants w
where c.tenant_id is not distinct from w.tenant_id;

delete from public.fonts f
using _wipe_tenants w
where f.tenant_id is not distinct from w.tenant_id;

delete from public.layer_styles ls
using _wipe_tenants w
where ls.tenant_id is not distinct from w.tenant_id;

delete from public.color_variables cv
using _wipe_tenants w
where cv.tenant_id is not distinct from w.tenant_id;

delete from public.settings s
using _wipe_tenants w
where s.tenant_id is not distinct from w.tenant_id;

delete from public.assets a
using _wipe_tenants w
where a.tenant_id is not distinct from w.tenant_id;

delete from public.asset_folders af
using _wipe_tenants w
where af.tenant_id is not distinct from w.tenant_id;

-- Admin dashboard homepage bundle for master only (no NULL rows — table requires tenant)
delete from public.tenant_homepage_content
where tenant_id = '2fff887d-a78e-4256-9116-6e02fe38c614';

commit;
