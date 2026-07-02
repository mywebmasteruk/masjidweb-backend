-- Admin-editable mapping of tenant provisioning form fields onto CMS collection
-- fields (the "org" collection by default). Replaces the hardcoded mapping in
-- admin-dashboard-v2 ycode-cms-seed.ts seedOrgCollectionContent so operators can
-- add/edit/remove mappings from the dashboard without code changes.
--
-- Matching semantics (implemented in admin-dashboard-v2 org-field-mappings.ts):
-- a mapping's target_field matches a CMS field when it equals the field's `key`
-- OR its display `name` (both case-insensitive). One mapping may match several
-- fields (e.g. "name" hits the system Name key and the custom "name" field).

create table if not exists public.provision_org_field_mappings (
  id uuid primary key default gen_random_uuid(),
  collection_name text not null default 'org',
  source_field text not null,
  target_field text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provision_org_field_mappings_source check (
    source_field in ('business_name', 'slug', 'address', 'phone', 'email', 'description', 'domain')
  ),
  constraint provision_org_field_mappings_collection_len check (char_length(collection_name) between 1 and 100),
  constraint provision_org_field_mappings_target_len check (char_length(target_field) between 1 and 100),
  constraint provision_org_field_mappings_unique unique (collection_name, target_field)
);

alter table public.provision_org_field_mappings enable row level security;

revoke all on public.provision_org_field_mappings from anon, authenticated;

drop policy if exists "provision_org_field_mappings_no_client_access" on public.provision_org_field_mappings;
create policy "provision_org_field_mappings_no_client_access"
  on public.provision_org_field_mappings
  for all
  using (false)
  with check (false);

-- Seed with the mapping that was previously hardcoded (matches the template's
-- current org collection, including its "addresss" field name).
insert into public.provision_org_field_mappings (collection_name, source_field, target_field)
values
  ('org', 'business_name', 'name'),
  ('org', 'slug', 'slug'),
  ('org', 'address', 'addresss'),
  ('org', 'phone', 'tel'),
  ('org', 'email', 'email'),
  ('org', 'description', 'description')
on conflict (collection_name, target_field) do nothing;
