-- Tenant provisioning tables for the admin dashboard + homepage content bridge.
-- Apply in your Supabase project (SQL editor or supabase db push).
-- Service role (used by Netlify serverless) bypasses RLS; public roles are denied.

create extension if not exists pgcrypto;

-- Named tenant_registry to avoid clashing with YCode-managed table names.
create table if not exists public.tenant_registry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  business_name text not null,
  address text,
  phone text,
  email text,
  domain text,
  description text,
  netlify_site_id text,
  netlify_site_url text,
  status text not null default 'draft'
    check (status in ('draft', 'provisioning', 'active', 'failed', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_registry_status_idx on public.tenant_registry (status);
create index if not exists tenant_registry_created_idx on public.tenant_registry (created_at desc);

-- Homepage / hero copy keyed by tenant. YCode sites can query by TENANT_ID at runtime
-- or you can map these fields into a YCode collection via Edge Function / sync job.
create table if not exists public.tenant_homepage_content (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_registry (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create index if not exists tenant_homepage_content_tenant_idx
  on public.tenant_homepage_content (tenant_id);

create table if not exists public.provisioning_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenant_registry (id) on delete set null,
  action text not null,
  actor text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists provisioning_audit_log_tenant_idx
  on public.provisioning_audit_log (tenant_id);
create index if not exists provisioning_audit_log_created_idx
  on public.provisioning_audit_log (created_at desc);

alter table public.tenant_registry enable row level security;
alter table public.tenant_homepage_content enable row level security;
alter table public.provisioning_audit_log enable row level security;

create policy tenant_registry_deny_anon on public.tenant_registry
  for all to anon using (false) with check (false);

create policy tenant_registry_deny_authenticated on public.tenant_registry
  for all to authenticated using (false) with check (false);

create policy tenant_homepage_deny_anon on public.tenant_homepage_content
  for all to anon using (false) with check (false);

create policy tenant_homepage_deny_authenticated on public.tenant_homepage_content
  for all to authenticated using (false) with check (false);

create policy audit_deny_anon on public.provisioning_audit_log
  for all to anon using (false) with check (false);

create policy audit_deny_authenticated on public.provisioning_audit_log
  for all to authenticated using (false) with check (false);

comment on table public.tenant_registry is 'Per-tenant profile and Netlify site linkage (admin-provisioned).';
comment on table public.tenant_homepage_content is 'Homepage field bundle; map to YCode CMS or consume from the app.';
comment on table public.provisioning_audit_log is 'Audit trail for provisioning actions.';
