# Provisioning and publish contracts

Cross-repo handshake between **admin-dashboard-v2** (provision) and **ycode-masjidweb** (builder publish).

## Phase 2 publish (after CMS seed)

Dashboard calls the builder’s publish endpoint with shared secret and tenant slug. Implementation: [`admin-dashboard-v2/src/lib/provision-publish.ts`](../admin-dashboard-v2/src/lib/provision-publish.ts).

| Item | Value |
|------|--------|
| Method | `POST` |
| Path | `/ycode/api/publish` |
| Body | `{ "publishAll": true }` (JSON) |
| Headers | `Content-Type: application/json`, `X-Provisioning-Secret` (matches env on both sites), `X-Tenant-Slug` (tenant slug), optional `Host` when using `YCODE_SITE_INTERNAL_URL` |

Env vars (documented in dashboard code): `PROVISIONING_WEBHOOK_SECRET` (16+ chars), `YCODE_SITE_INTERNAL_URL` (optional `.netlify.app` base to avoid SSL delay on new subdomains).

## Publish body schema (builder)

Validated in the fork by [`ycode-masjidweb/lib/masjidweb/contracts/publish-request.ts`](../ycode-masjidweb/lib/masjidweb/contracts/publish-request.ts) (`strict` — unknown keys are rejected; invalid types fall back to `{}` for the handler).

## Provision intake (dashboard)

Tenant create payload is validated with Zod in [`admin-dashboard-v2/src/lib/tenant-schema.ts`](../admin-dashboard-v2/src/lib/tenant-schema.ts) (`createTenantSchema`), used by [`provision-pipeline.ts`](../admin-dashboard-v2/src/lib/provision-pipeline.ts).

## Automated tests

| Location | What |
|----------|------|
| [`admin-dashboard-v2/src/lib/provision-publish.test.ts`](../admin-dashboard-v2/src/lib/provision-publish.test.ts) | Asserts `fetch` URL, `{ "publishAll": true }` body, and headers match this contract. |
| [`ycode-masjidweb/lib/masjidweb/contracts/publish-request.test.ts`](../ycode-masjidweb/lib/masjidweb/contracts/publish-request.test.ts) | Zod `strict` schema and `parsePublishRequestBody` behavior (including dashboard JSON round-trip). |
| [`admin-dashboard-v2/src/lib/tenant-schema.test.ts`](../admin-dashboard-v2/src/lib/tenant-schema.test.ts) | `createTenantSchema` for provision intake. |

## Related

- [`docs/TENANCY.md`](TENANCY.md) — tenant model and headers.
- [`docs/SUBMODULE.md`](SUBMODULE.md) — bumping `ycode-masjidweb`.
