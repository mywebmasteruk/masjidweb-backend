# Provisioning smoke checks

Run after deploying admin-dashboard-v2 with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Netlify vars, and applying migrations (including `tenant_registry_email_exists` and optionally `tenant_registry_email_unique`).

## 1. Prerequisites

- `tenant_registry_email_exists` function exists (migration `20260325120000_tenant_registry_email_exists.sql`).
- Dashboard session / auth that passes `isAuthorized` for `POST /api/provision`.

## 2. Happy path (unique email)

1. Call provision with a **new** slug and an email **not** present in `tenant_registry`.
2. Expect `200`, `ok: true`, `tenantId`, `slug`, `siteUrl`, and possibly `warnings` (e.g. auto-publish, domain alias).
3. In Supabase: confirm `tenant_registry.email` matches the normalized (lowercase, trimmed) address.
4. Confirm demo-related warnings in `warnings` are acceptable for your environment, or fix `PROVISIONING_WEBHOOK_SECRET` / tenant URL if publish was skipped.

## 3. Duplicate email (must fail)

1. Repeat provision with the **same** email as step 2 but a **different** `business_name` / slug (or same form email only).
2. Expect **`400`** with body containing: `This email is already used by another tenant. Use a different email.`

Example (replace cookie / auth as your setup requires):

```http
POST /api/provision
Content-Type: application/json

{
  "business_name": "Duplicate Test",
  "email": "already-used@example.com",
  "slug": "duplicate-test-slug"
}
```

## 4. Optional: re-seed CMS only

For existing tenants: `npm run reseed:cms` with appropriate env (see `scripts/reseed-cms-cli.ts`).

## 5. Tenant lifecycle (deactivate vs delete)

Apply migration `20260325140000_tenant_lifecycle_cleanup.sql`.

- **Deactivated** (`PATCH /api/tenants` with `{ "id": "<uuid>", "status": "deactivated" }`): keeps the `tenant_registry` row and all YCode/CMS data; email stays reserved.
- **Reactivate**: `{ "status": "active" }` for the same `id`.
- **Delete** (`DELETE /api/tenants` with `{ "id" }`): removes the Netlify subdomain alias, deletes the `tenant_registry` row, and a **before-delete trigger** runs `delete_tenant_scoped_data` so all YCode/CMS rows for that tenant are removed. `tenant_homepage_content` cascades via FK; audit log rows keep `tenant_id` null.
- **Orphan cleanup**: `GET /api/cleanup-orphans` previews counts (`count_orphan_tenant_rows`). `POST /api/cleanup-orphans` (or `public.cleanup_orphan_tenant_rows()` in SQL) removes rows whose tenant is missing from `tenant_registry`, including translations on orphan locales, `page_folders`, `color_variables`, and `tenant_homepage_content` where applicable.
