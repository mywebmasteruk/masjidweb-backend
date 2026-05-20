# Template tenants + per-tenant subdomains

## Roles

| Role | Host | `tenant_registry` | Notes |
|------|------|---------------------|--------|
| Demo template | `masjidemo1.<suffix>` | `tenant_kind = template`, slug e.g. `masjidemo1` | Source for clones; edit at **`https://masjidemo1.<suffix>/ycode`**, then **Publish**. |
| Customer site | `{slug}.<suffix>` | `tenant_kind = 'client'` | Provision from dashboard; pick **Demo template** in the form (`provisioned_from_template_id`). Builder + live site: **`https://{slug}.<suffix>/ycode`** and **`https://{slug}.<suffix>/`**. |
| Extra demos | `{slug}.<suffix>` | `tenant_kind = 'template'` | Add more template rows in Supabase; they appear in the provision form. |

There is **no separate global “manage” builder host** in this setup: each tenant (including demos) uses **their own subdomain** for YCode and the public site.

## Canonical UUIDs (code)

Defined in [`master-tenant-constants.ts`](../src/lib/master-tenant-constants.ts):

- **Template tenant** — `DEFAULT_TEMPLATE_TENANT_ID` (`2fff887d-a78e-4256-9116-6e02fe38c614`). Override with env `TEMPLATE_TENANT_ID` if needed.

## Supabase migrations

- `20260329100000_tenant_kind_and_provision_source.sql` — `tenant_kind` (`template` \| `client`), `provisioned_from_template_id`, renames primary demo to **MasjidDemo1** / `masjidemo1` / `masjidemo1@masjidweb.com`.
- Older slug renames are superseded by the row above; apply migrations in order.

Apply with `supabase db push` or the SQL editor.

## Netlify: multi-tenant YCode site (`ycode-masjidweb`)

1. Add domain aliases **`{slug}.<domain>`** for each tenant (including `masjidemo1` and customer slugs) on the **tenant pool** Netlify site.
2. Env (minimum):

| Variable | Purpose |
|----------|---------|
| `TENANT_DOMAIN_SUFFIX` | e.g. `masjidweb.com` — used by `middleware.ts` for subdomain → tenant. |
| `TEMPLATE_TENANT_ID` | Template tenant UUID for cloning and optional legacy behavior. |
| `MASTER_BUILDER_SUBDOMAIN` | **Leave unset.** Only set if you still use a legacy single host label that maps to `TEMPLATE_TENANT_ID` (not recommended for new installs). |
| `PROVISIONING_WEBHOOK_SECRET` | **Same value** as on the admin dashboard (16+ chars). Used for `POST /ycode/api/publish` from provisioning (header `X-Provisioning-Secret`). |

See [`ycode-masjidweb/.env.example`](../../ycode-masjidweb/.env.example).

## Netlify: tenant admin dashboard (`admin-dashboard-v2`)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Service role for RPC + registry + clone. |
| `TEMPLATE_TENANT_ID` | Same UUID as YCode `TEMPLATE_TENANT_ID`. |
| `TENANT_DOMAIN_SUFFIX` | Same as YCode. |
| `PROVISIONING_WEBHOOK_SECRET` | **Identical** to the YCode site (validates `POST /api/provision` publish callbacks). |

See [`.env.example`](../.env.example).

## Flow: new tenant provisioning

Implemented in [`provision-pipeline.ts`](../src/lib/provision-pipeline.ts): registry row → `cloneTemplateForTenant` → publish → `seedTenantCmsContent` → publish → patch → verify → `inviteUserByEmail` to `https://{slug}.{domain}/ycode/accept-invite`.

## Manual builder content (template) and a new demo

1. Author on **`https://masjidemo1.<suffix>/ycode`**, then **Publish**.
2. **New client:** use the dashboard form and choose which **demo template** to copy from.
3. **Another demo template:** insert a `tenant_registry` row with `tenant_kind = 'template'`, add its subdomain on Netlify, build content in YCode under that slug, **Publish**.

## Safe core update preview (MasjidDemo1)

GitHub PR **deploy previews** use a Netlify hostname such as `https://deploy-preview-N--masjidweb-tenants.netlify.app`, **not** `masjidemo1.masjidweb.com` (that subdomain always serves **production** `main`).

Before approving a core update merge from **Maintenance**:

1. Open the deploy preview **builder**: `…/ycode` on that hostname.
2. Log in as **`masjidemo1@masjidweb.com`** on the preview host (session cookies do not carry from `masjidweb.com`).
3. Optionally open the deploy preview **homepage** (`/`) — it uses template tenant data via `TEMPLATE_TENANT_ID` on the builder site.
4. Do **not** publish throwaway content (same Supabase as live).

Optional env on the admin dashboard: `PREVIEW_TENANT_SLUG` (default `masjidemo1`). A tenant picker in Maintenance is planned later.

## Verification checklist (smoke)

**A — Template publish**

1. Open `https://masjidemo1.<suffix>/ycode`, make a visible change, **Publish**.
2. Confirm publish succeeds (UI and/or `POST .../ycode/api/publish` response).

**B — New tenant**

1. Submit provision form for a test slug.
2. Confirm registry row, pages match template, and CMS seed fields match the form where applicable.
3. Optional: confirm `inviteUserByEmail` warning is absent in provision response when SMTP is configured.

## Invite email → builder (Supabase)

- Configure **Auth → SMTP** (or provider) so invite emails send.
- **Redirect URLs**: allow `https://*.masjidweb.com/**` (or your `TENANT_DOMAIN_SUFFIX`) for `/ycode/accept-invite` and login.
- Duplicate-email policy: see `provision-email-policy` / unique index on `tenant_registry.email`.

## Builder account for the primary demo

Use **`masjidemo1@masjidweb.com`** (or your template admin email) in **Supabase Auth**. Set `user_metadata.tenant_id` / `tenant_slug` to match the template tenant row. Sign in via **`https://masjidemo1.<suffix>/ycode`**.

## DNS note (masjidweb.com)

The admin UI is intended at **`admin.<domain>`** (see `scripts/cloudflare_masjidweb_dns.sh`). YCode runs on **wildcard `*.<domain>`** to the multi-tenant Netlify site.

## Full test matrix

Automated commands, manual E2E steps, regression matrix, and failure triage: [`TEST_PLAN.md`](../../TEST_PLAN.md) (repository root).
