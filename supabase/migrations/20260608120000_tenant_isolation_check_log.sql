-- Daily tenant isolation check run history (GitHub Actions → admin dashboard).
-- Service role only; same pattern as core_update_audit_log.

create table if not exists public.tenant_isolation_check_log (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('pass', 'fail')),
  duration_ms integer,
  repository text,
  branch text,
  commit_sha text,
  workflow_run_id text,
  workflow_run_url text,
  workflow_name text,
  summary text,
  failure_output text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenant_isolation_check_log_created_idx
  on public.tenant_isolation_check_log (created_at desc);

create index if not exists tenant_isolation_check_log_status_idx
  on public.tenant_isolation_check_log (status, created_at desc);

alter table public.tenant_isolation_check_log enable row level security;

create policy tenant_isolation_check_deny_anon on public.tenant_isolation_check_log
  for all to anon using (false);

create policy tenant_isolation_check_deny_authenticated on public.tenant_isolation_check_log
  for all to authenticated using (false);

comment on table public.tenant_isolation_check_log is
  'Run history for daily tenant isolation Vitest checks (ycode-mw-tenant GitHub Actions).';
