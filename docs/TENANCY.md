# MasjidWeb multi-tenancy

## Model

- **Pooled database**: All tenants share one Supabase Postgres project. Rows are isolated with a `tenant_id` UUID column and **RLS** policies that compare to `auth.jwt() -> 'user_metadata' ->> 'tenant_id'`.
- **Application defense in depth**: When server code uses the **service role** (bypasses RLS), queries must still narrow rows with **`scopeToTenantRow`** — see [`ycode-masjidweb/lib/supabase-server.ts`](../ycode-masjidweb/lib/supabase-server.ts). This matters when [`getSupabaseAdmin`](../ycode-masjidweb/lib/supabase-server.ts) returns the service client (e.g. Host `x-tenant-id` vs JWT `user_metadata.tenant_id` mismatch).

## Request tenant resolution

1. **Subdomain** → [`middleware.ts`](../ycode-masjidweb/middleware.ts) looks up `tenant_registry` and sets `x-tenant-id` / `x-tenant-slug`.
2. **Headers** → [`getTenantIdFromHeaders()`](../ycode-masjidweb/lib/supabase-server.ts) reads `x-tenant-id`, then falls back to the session JWT’s `user_metadata.tenant_id`.
3. **SSR / env** → [`resolveTenantScope()`](../ycode-masjidweb/lib/supabase-server.ts): explicit argument → middleware → `TENANT_ID` / `NEXT_PUBLIC_TENANT_ID` / `TEMPLATE_TENANT_ID` → session.

## Native APIs to use (do not duplicate)

| API | Use when |
|-----|----------|
| `getTenantIdFromHeaders()` | Building PostgREST or Knex queries in route handlers / repositories. |
| `resolveTenantScope()` | Server-rendered pages and [`page-fetcher`](../ycode-masjidweb/lib/page-fetcher.ts)-style loads. |
| `scopeToTenantRow(query, tenantId)` | Chaining `.eq('tenant_id', …)` on Supabase queries for tables that have `tenant_id`. |
| `getSupabaseAdmin()` | Default server client; prefer over raw `getSupabaseServiceRole()` for tenant data. |
| [`addTenantFilter` / `batchUpdateColumn` / `incrementColumn`](../ycode-masjidweb/lib/knex-helpers.ts) | Raw Knex updates so `tenant_id` is not forgotten. |

## Inserts

For tables with `tenant_id`, set `tenant_id` from `getTenantIdFromHeaders()` or `resolveTenantScope()` (see [`settingsRepository`](../ycode-masjidweb/lib/repositories/settingsRepository.ts)).

## Tables without `tenant_id`

Some tables (e.g. `translations`) are linked indirectly (e.g. via `locale_id` → `locales.tenant_id`). Prefer joins or pre-checks so rows cannot cross tenants; see [`docs/NATIVE_SCOPE_AUDIT.md`](NATIVE_SCOPE_AUDIT.md).

## Further reading

- [`docs/YCODE_UPSTREAM.md`](YCODE_UPSTREAM.md) — OSS vs YCode Cloud.
- [`docs/SUBMODULE.md`](SUBMODULE.md) — `ycode-masjidweb` submodule workflow.
- [`docs/UPSTREAM_MERGE_HOTSPOTS.md`](UPSTREAM_MERGE_HOTSPOTS.md) — files to re-verify after merging upstream YCode.
- [`docs/PROVISION_PUBLISH_CONTRACTS.md`](PROVISION_PUBLISH_CONTRACTS.md) — dashboard provision → builder publish headers and payloads.
