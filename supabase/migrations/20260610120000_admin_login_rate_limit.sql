-- Persistent admin login rate limiting (admin-dashboard-v2).
-- The dashboard runs on Netlify serverless: in-memory attempt counters reset on
-- cold start and are not shared across instances, so brute-force lockout did not
-- hold. This table + RPC make the counter durable. Service role only; same RLS
-- pattern as tenant_isolation_check_log.

create table if not exists public.admin_login_attempts (
  client_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;

create policy admin_login_attempts_deny_anon on public.admin_login_attempts
  for all to anon using (false);

create policy admin_login_attempts_deny_authenticated on public.admin_login_attempts
  for all to authenticated using (false);

comment on table public.admin_login_attempts is
  'Durable per-IP admin login attempt counters (dashboard /api/auth/login).';

-- Atomically record an attempt and report whether it is allowed.
-- Allows up to p_max_attempts per window; the next attempt is blocked until reset_at.
create or replace function public.admin_login_rate_check(
  p_client_key text,
  p_max_attempts integer,
  p_window_seconds integer
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
begin
  insert into public.admin_login_attempts as a (client_key, count, reset_at, updated_at)
  values (p_client_key, 1, now() + make_interval(secs => p_window_seconds), now())
  on conflict (client_key) do update set
    count = case when a.reset_at <= now() then 1 else a.count + 1 end,
    reset_at = case
      when a.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
      else a.reset_at
    end,
    updated_at = now()
  returning a.count, a.reset_at into v_count, v_reset_at;

  if v_count > p_max_attempts then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_reset_at - now())))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

revoke execute on function public.admin_login_rate_check(text, integer, integer)
  from public, anon, authenticated;

-- Clear the counter after a successful login.
create or replace function public.admin_login_rate_reset(p_client_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.admin_login_attempts where client_key = p_client_key;
$$;

revoke execute on function public.admin_login_rate_reset(text)
  from public, anon, authenticated;
