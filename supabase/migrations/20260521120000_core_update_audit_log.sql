-- Audit trail for safe Ycode core updates (approve + rollback checkpoints).
-- Service role only; same pattern as provisioning_audit_log.

create table if not exists public.core_update_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('approve_merge', 'rollback_deploy', 'rollback_full')),
  pr_number integer,
  before_main_sha text,
  after_main_sha text,
  before_deploy_id text,
  after_deploy_id text,
  before_package_version text,
  after_package_version text,
  upstream_ref text,
  safety_level text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists core_update_audit_log_created_idx
  on public.core_update_audit_log (created_at desc);

create index if not exists core_update_audit_log_action_idx
  on public.core_update_audit_log (action, created_at desc);

alter table public.core_update_audit_log enable row level security;

create policy core_update_audit_deny_anon on public.core_update_audit_log
  for all to anon using (false);

create policy core_update_audit_deny_authenticated on public.core_update_audit_log
  for all to authenticated using (false);

comment on table public.core_update_audit_log is
  'Checkpoints for safe Ycode core updates: records pre/post main SHA and Netlify deploy id on approve, and rollback actions.';
