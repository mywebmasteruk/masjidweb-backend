-- Classify tenants as template (demo) vs client; record which template a client was cloned from.
-- Rename canonical MasjidWeb demo template row to MasjidDemo1 (masjidemo1).

alter table public.tenant_registry
  add column if not exists tenant_kind text not null default 'client'
    constraint tenant_registry_tenant_kind_check
      check (tenant_kind in ('template', 'client'));

alter table public.tenant_registry
  add column if not exists provisioned_from_template_id uuid
    references public.tenant_registry (id) on delete set null;

create index if not exists tenant_registry_tenant_kind_idx
  on public.tenant_registry (tenant_kind);

create index if not exists tenant_registry_provisioned_from_idx
  on public.tenant_registry (provisioned_from_template_id);

comment on column public.tenant_registry.tenant_kind is
  'template = demo/site used as clone source; client = customer tenant.';
comment on column public.tenant_registry.provisioned_from_template_id is
  'For client tenants: tenant_registry.id of the demo template used at provision time.';

-- Canonical MasjidWeb demo (UUID unchanged — keep TEMPLATE_TENANT_ID / Netlify in sync).
update public.tenant_registry
set
  slug = 'masjidemo1',
  business_name = 'MasjidDemo1',
  email = 'masjidemo1@masjidweb.com',
  tenant_kind = 'template',
  provisioned_from_template_id = null,
  updated_at = now()
where id = '2fff887d-a78e-4256-9116-6e02fe38c614';
