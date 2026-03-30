-- Case-insensitive duplicate check for tenant admin emails (used by admin-dashboard-v2 provisioning).

create or replace function public.tenant_registry_email_exists(p_email text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(
    select 1
    from public.tenant_registry
    where email is not null
      and lower(trim(email)) = lower(trim(p_email))
  );
$$;

comment on function public.tenant_registry_email_exists(text) is
  'Returns true if tenant_registry already has this email (trimmed, case-insensitive).';

grant execute on function public.tenant_registry_email_exists(text) to service_role;
