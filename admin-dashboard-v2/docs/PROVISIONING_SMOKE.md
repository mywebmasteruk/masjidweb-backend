# Provisioning smoke checks

Run after deploying admin-dashboard-v2 with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Netlify vars, and applying migrations (including `tenant_registry_email_exists` and optionally `tenant_registry_email_unique`).

## 1. Prerequisites

- `tenant_registry_email_exists` function exists (migration `20260325120000_tenant_registry_email_exists.sql`).
- Dashboard session / auth that passes `isAuthorized` for `POST /api/provision`.
- Optional: `PROVISION_INTERNAL_SECRET` (16+ chars) if you need to call `provision-complete` / `provision-publish-tenant` without a session (header `x-provision-internal`).

## 2. Happy path (unique email)

1. Call `POST /api/provision` with a **new** slug and an email **not** present in `tenant_registry`.
2. Expect `200`, `ok: true`, `tenantId`, `slug`, `siteUrl`, `needsCompletion: true` (phase 1 only: clone + domain), and possibly `warnings`.
3. The dashboard then calls `POST /api/provision-complete` and `POST /api/provision-publish-tenant` in separate requests (same as **Continue setup**), so each Netlify function stays within time limits and YCode publish completes before the user opens the builder.
4. In Supabase: after the full flow, `tenant_registry.status` is `active` and the builder should show template content (draft + published after publish step).
5. Demo parity warnings (template vs tenant row counts, published CMS) are appended during the **publish** step — they are non-fatal.

### Idempotency (retries)

- **Duplicate `POST /api/provision` with the same slug** — still rejected at insert (unique constraint); use a new slug.
- **`completeProvision` when tenant is already `active`** — returns `{ warnings: ["Tenant is already active — skipping."] }` without re-seeding.
- **`completeProvision` for `provisioning`** — safe to retry after timeouts: `seedTenantCmsContent` / translation clone paths skip or overwrite as designed; invite may send again (acceptable for recovery).
- **`publishTenantAfterProvision` for an active tenant** — may be called multiple times; YCode publish is idempotent enough for “publish all” and audit logs a row each time.
- **Continue setup** (dashboard) still chains `provision-complete` then `provision-publish-tenant` for tenants stuck in `provisioning` after a partial failure.

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
- **Orphan cleanup**: `POST /api/cleanup-orphans` (or call `public.cleanup_orphan_tenant_rows()` in SQL) removes rows in YCode tables whose `tenant_id` is not in `tenant_registry` (e.g. after manual DB edits).
