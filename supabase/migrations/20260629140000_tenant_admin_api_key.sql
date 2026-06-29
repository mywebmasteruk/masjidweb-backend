-- Per-tenant platform admin API key, auto-minted on provision.
--
-- Goal: every provisioned tenant gets a full-access API key the platform admin
-- can use to read AND write that tenant's CMS data via the builder's v1 API
-- (https://<slug>.masjidweb.com/ycode/api/v1/... with `Authorization: Bearer <key>`).
-- The v1 API has GET/POST/PUT/PATCH/DELETE and no read/write scopes — a valid key
-- for the tenant can do everything — so the same key reads and writes. The builder
-- validates the key by SHA-256 hash in `api_keys`, scoped to the request's tenant
-- (resolved from the subdomain), so a key only works for its own tenant.
--
-- Mechanism (pure DB — no app/core code, covers every provisioning path):
--  * `api_keys` stores only the SHA-256 hash (what the builder checks) + a new
--    `is_protected` flag.
--  * `tenant_registry.admin_api_key` stores the plaintext for admin retrieval.
--    Safe: tenant_registry RLS denies anon AND authenticated, so only
--    service-role/admin can read it.
--  * A BEFORE INSERT/UPDATE trigger mints the key the first time a tenant is
--    `active` (idempotent via the NULL guard). Provisioning flips status to
--    active in phase 2, which fires this.
--  * A BEFORE DELETE trigger blocks deleting a protected key while its tenant is
--    active — so the tenant admin cannot delete it from the builder's API-keys UI.
--    Reclaim/teardown only runs on failed/deactivated tenants, so it is unaffected.
--
-- pgcrypto lives in the `extensions` schema on this project; search_path covers it.

-- Two mirrors of each tenant for the platform admin / tests:
--  * REST v1 key  -> public/live experience (published content); api_keys (sha256 hash).
--  * MCP token    -> builder/admin experience (drafts) via /ycode/mcp/<token>; mcp_tokens
--                    stores the token PLAINTEXT (that's how the builder validates it).
-- Both stored on the tenant row for retrieval, both flagged is_protected.
alter table public.tenant_registry add column if not exists admin_api_key text;
alter table public.tenant_registry add column if not exists admin_mcp_token text;
alter table public.api_keys   add column if not exists is_protected boolean not null default false;
alter table public.mcp_tokens add column if not exists is_protected boolean not null default false;

create or replace function public.ensure_tenant_admin_api_key()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_key text;
  v_mcp text;
begin
  if NEW.status = 'active' and NEW.id is not null then
    -- REST v1 key (public/live mirror)
    if NEW.admin_api_key is null or NEW.admin_api_key = '' then
      v_key := encode(gen_random_bytes(32), 'hex');               -- 64 hex chars
      insert into public.api_keys (name, key_hash, key_prefix, tenant_id, is_protected)
      values ('platform-admin (managed)', encode(digest(v_key, 'sha256'), 'hex'),
              left(v_key, 8), NEW.id, true);
      NEW.admin_api_key := v_key;
    end if;
    -- MCP token (builder/admin mirror) — mcp_tokens stores plaintext
    if NEW.admin_mcp_token is null or NEW.admin_mcp_token = '' then
      v_mcp := 'ymc_' || encode(gen_random_bytes(24), 'hex');     -- matches generateToken()
      insert into public.mcp_tokens (name, token, token_prefix, tenant_id, is_active, is_protected)
      values ('platform-admin (managed)', v_mcp, left(v_mcp, 12), NEW.id, true, true);
      NEW.admin_mcp_token := v_mcp;
    end if;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_tenant_admin_api_key on public.tenant_registry;
create trigger trg_tenant_admin_api_key
  before insert or update on public.tenant_registry
  for each row execute function public.ensure_tenant_admin_api_key();

-- Protect the MCP token from tenant delete OR disable while the tenant is active.
-- last_used_at updates pass (is_active unchanged); reclaim runs on non-active tenants.
create or replace function public.protect_admin_mcp_token()
returns trigger
language plpgsql
as $fn$
begin
  if TG_OP = 'DELETE' then
    if OLD.is_protected and exists (select 1 from public.tenant_registry r
                                    where r.id = OLD.tenant_id and r.status = 'active') then
      raise exception 'This MCP token is managed by the MasjidWeb platform and cannot be deleted here.'
        using errcode = 'check_violation';
    end if;
    return OLD;
  else
    if OLD.is_protected and OLD.is_active and not NEW.is_active
       and exists (select 1 from public.tenant_registry r
                   where r.id = OLD.tenant_id and r.status = 'active') then
      raise exception 'This MCP token is managed by the MasjidWeb platform and cannot be disabled here.'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;
end;
$fn$;

drop trigger if exists trg_protect_admin_mcp_token_del on public.mcp_tokens;
create trigger trg_protect_admin_mcp_token_del
  before delete on public.mcp_tokens
  for each row execute function public.protect_admin_mcp_token();
drop trigger if exists trg_protect_admin_mcp_token_upd on public.mcp_tokens;
create trigger trg_protect_admin_mcp_token_upd
  before update on public.mcp_tokens
  for each row execute function public.protect_admin_mcp_token();

create or replace function public.protect_admin_api_key_delete()
returns trigger
language plpgsql
as $fn$
begin
  if OLD.is_protected
     and exists (select 1 from public.tenant_registry r
                 where r.id = OLD.tenant_id and r.status = 'active') then
    raise exception 'This API key is managed by the MasjidWeb platform and cannot be deleted here.'
      using errcode = 'check_violation';
  end if;
  return OLD;
end;
$fn$;

drop trigger if exists trg_protect_admin_api_key on public.api_keys;
create trigger trg_protect_admin_api_key
  before delete on public.api_keys
  for each row execute function public.protect_admin_api_key_delete();

-- Backfill any pre-existing active tenants (idempotent).
update public.tenant_registry
  set updated_at = now()
  where status = 'active'
    and (admin_api_key is null or admin_api_key = ''
         or admin_mcp_token is null or admin_mcp_token = '');
