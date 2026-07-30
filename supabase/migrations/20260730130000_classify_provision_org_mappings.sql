-- Classify platform tables that landed after mw_table_policy was introduced
-- without a registry row. The Maintenance schema-drift tripwire flags these as
-- "unclassified" and blocks confidence before core updates.
--
-- provision_org_field_mappings: admin-global CMS seed mapping (no tenant_id).
-- admin_login_attempts: dashboard rate-limit store (no tenant_id).

insert into public.mw_table_policy (table_name, policy, is_tenant_scoped, note) values
  (
    'provision_org_field_mappings',
    'system',
    false,
    'Admin-editable org CMS field mappings used during provisioning — platform-wide, not per-tenant'
  ),
  (
    'admin_login_attempts',
    'system',
    false,
    'Admin dashboard login rate-limit counters — platform-wide, not per-tenant'
  )
on conflict (table_name) do update
set
  policy = excluded.policy,
  is_tenant_scoped = excluded.is_tenant_scoped,
  note = excluded.note;
