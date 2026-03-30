-- Enforces one admin email per tenant at the database level (normalized).
-- Apply only after removing duplicate emails from tenant_registry, or this will fail.

create unique index if not exists tenant_registry_email_lower_unique
  on public.tenant_registry (lower(trim(email)))
  where email is not null;

comment on index public.tenant_registry_email_lower_unique is
  'Unique non-null admin emails per tenant (trimmed, case-insensitive).';
