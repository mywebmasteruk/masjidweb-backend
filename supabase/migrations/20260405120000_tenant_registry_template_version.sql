-- Record which version of the template was cloned at provision time.
-- Populated from the template's settings `published_at` value during provisioning.
-- Existing rows get NULL (template version unknown retroactively).

alter table public.tenant_registry
  add column if not exists provisioned_template_version text;

comment on column public.tenant_registry.provisioned_template_version is
  'Template published_at timestamp at provision time, so support can tell which version a tenant was cloned from.';
