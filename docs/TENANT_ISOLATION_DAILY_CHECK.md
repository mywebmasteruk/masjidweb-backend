# Daily tenant isolation check

Automated guard against tenant-scoping regressions in the YCode builder fork (`ycode-mw-tenant`).

## What runs

| Item | Location |
| --- | --- |
| Script | `ycode-mw-tenant/scripts/check-tenant-isolation.sh` |
| Workflow | `ycode-mw-tenant/.github/workflows/tenant-isolation-daily.yml` |
| Schedule | **07:00 UTC daily** (one hour after core-update at 06:00 UTC) |
| Manual run | GitHub Actions → **Daily tenant isolation check** → Run workflow |

The script runs Vitest unit tests only. No Supabase credentials or live tenants are required.

## What the tests cover

| Area | Test files (representative) |
| --- | --- |
| Subdomain → tenant routing helpers | `lib/tenant/middleware-utils.test.ts` |
| JWT vs `x-tenant-id` alignment | `lib/masjidweb/tenant-session-alignment.test.ts` |
| Auth user list scoped to tenant | `lib/masjidweb/auth-users-tenant-scope.test.ts` |
| Provisioned tenant RBAC / owner bootstrap | `lib/masjidweb/bootstrap-tenant-owner.test.ts`, `provisioned-tenant-rbac.test.ts` |
| PostgREST `tenant_id` filters | `apply-tenant-eq`, `tenant-or-legacy-scope`, repository tests |
| API keys / form submissions / MCP tokens | `lib/repositories/*.test.ts`, `mcp-token-route-tenant-context.test.ts` |
| Collection timestamp updates | `collection-item-timestamp-scope.test.ts` |
| Cache tag separation | `tenant-cache-tags.test.ts` |
| RLS migration SQL shape | `api-keys-form-submissions-rls-migration.test.ts` |
| Update / merge safety | `update-safety-check.test.ts` |

## Known gaps (not caught by daily automation)

- Live cross-tenant HTTP/API calls (needs two deployed tenants).
- Full repository audit for every `getSupabaseAdmin()` call site.
- Builder UI spot-check (collection layers, Members invite, published SSR).
- Knex field-sort / `ECIRCUITBREAKER` runtime paths.

Use [`MT_VALIDATION_CHECKLIST.md`](MT_VALIDATION_CHECKLIST.md) for deploy-time validation.

## Local reproduction

```bash
cd ycode-mw-tenant
npm ci
bash scripts/check-tenant-isolation.sh
```

PR CI also runs the same script via `.github/workflows/ci-build-check.yml` (tenant step before build).

## When the daily job fails

1. Open the failed GitHub Actions run and expand **Run tenant isolation tests**.
2. Reproduce locally with the command above.
3. Read [`AGENT_INCIDENT_PLAYBOOK.md`](AGENT_INCIDENT_PLAYBOOK.md) if symptoms match collection layers, invite/RBAC, OAuth allowlists, or post-merge seam drift.
4. Read [`TENANCY.md`](TENANCY.md) and [`NATIVE_SCOPE_AUDIT.md`](NATIVE_SCOPE_AUDIT.md) before changing repository scoping.
5. Fix the regression; do not remove tenant filters to make tests pass.

**If the symptom is a LIVE outage** (Users page empty, admin ops failing, or a suspected cross-tenant leak — not a failed CI job) rather than a daily-check failure, this may be the app-path RLS enforcement flag (`MW_TENANT_RLS_ENFORCE`). See `AGENT_INCIDENT_PLAYBOOK.md` Incident 5 and the full **GO-BACK PROTOCOL** in `../../TENANT-ISOLATION-AND-CLONE-PLAN.md` (project root) — immediate action is unsetting that env var on Netlify and redeploying.


## Admin log history

Every daily run (pass **and** fail) can be recorded in the admin dashboard:

| Item | Location |
| --- | --- |
| UI tab | [Logs → Isolation checks](https://admin.masjidweb.com/dashboard/logs#isolation) |
| Table | Supabase `tenant_isolation_check_log` (migration `20260608120000_tenant_isolation_check_log.sql`) |
| Ingest API | `POST https://admin.masjidweb.com/api/isolation-check-log` |
| Auth header | `X-Core-Update-Notify-Secret: <CORE_UPDATE_NOTIFY_SECRET>` (same as core-update notify) |

Each row shows date/time, pass/fail badge, duration, commit SHA, branch, GitHub Actions run link, and on failure an expandable Vitest output block (paste-ready for an AI agent).

### GitHub repo configuration (`ycode-mw-tenant`)

| Name | Type | Value |
| --- | --- | --- |
| `ADMIN_DASHBOARD_ISOLATION_LOG_URL` | Actions **variable** | `https://admin.masjidweb.com/api/isolation-check-log` |
| `CORE_UPDATE_NOTIFY_SECRET` | Actions **secret** | Same value as Netlify `CORE_UPDATE_NOTIFY_SECRET` on admin dashboard |

The workflow step **Report result to admin dashboard** runs `if: always()` so successful days appear in history too.

### Apply `tenant_isolation_check_log` (production Supabase)

Production project: **ycode-masjidweb** (`jofgypmriaqphnsyxiks`). Migration file: `supabase/migrations/20260608120000_tenant_isolation_check_log.sql`.

**Preferred (agent / local): Supabase MCP**

1. Cursor MCP config must target production: `https://mcp.supabase.com/mcp?project_ref=jofgypmriaqphnsyxiks` (see repo `.cursor/mcp.json` and user `~/.cursor/mcp.json`).
2. Authenticate Supabase MCP once (OAuth) with the Supabase account that **owns** `jofgypmriaqphnsyxiks`. The CLI account that only sees `iovviomnvlfjhyqdkvqu` cannot link or migrate production.
3. Call MCP `apply_migration` with name `tenant_isolation_check_log` and the migration SQL (idempotent `CREATE TABLE IF NOT EXISTS` is fine).
4. Verify: MCP `list_tables` or REST `GET /rest/v1/tenant_isolation_check_log?select=id&limit=1` with service role (expect 200, not `PGRST205`).

**Fallback: Management API**

```bash
export SUPABASE_ACCESS_TOKEN='sbp_...'   # account token for ycode-masjidweb org
export SUPABASE_PROJECT_REF='jofgypmriaqphnsyxiks'
bash scripts/apply-supabase-migration-api.sh supabase/migrations/20260608120000_tenant_isolation_check_log.sql
```

**Report step errors**

| HTTP | Meaning |
| --- | --- |
| 401 | `CORE_UPDATE_NOTIFY_SECRET` mismatch between GitHub Actions and Netlify admin dashboard |
| 500 | Table missing or Supabase insert failed — apply migration above |

Admin Netlify (`masjidweb-backend` site) already uses `SUPABASE_URL=https://jofgypmriaqphnsyxiks.supabase.co/`; a 500 on ingest is the missing table, not the wrong Supabase project.

## Alerts (v1)

- **Default:** failed workflow + job summary on the Actions run.
- **Email:** enable GitHub notifications for Actions failures on `ycode-mw-tenant`.
- **Optional webhook:** if `ADMIN_DASHBOARD_NOTIFY_URL` and `CORE_UPDATE_NOTIFY_SECRET` are set (same as core-update operator), the workflow POSTs a `tenant_isolation_failed` event on failure with full Vitest output for email forwarding to an AI agent.

## Manual two-tenant spot-check (fallback)

When automation passes but you suspect a leak, verify on preview or production:

1. Confirm tenants A and B are **active** in `tenant_registry`.
2. Open builder on A subdomain — pages/CMS must show **only A** data.
3. Repeat on B subdomain.
4. Public sites: A must not render B published content.
5. Cross-tenant access by object ID must **fail or return empty** (API or Supabase with tenant A session + tenant B resource id).

Record results in [`MT_VALIDATION_CHECKLIST.md`](MT_VALIDATION_CHECKLIST.md).
