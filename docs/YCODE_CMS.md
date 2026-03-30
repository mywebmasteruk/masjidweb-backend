# Homepage content and YCode CMS

## What the dashboard writes today

The provisioning API upserts **`tenant_homepage_content`** with a JSON document:

- `business_name`
- `address`
- `phone`
- `email`
- `domain`
- `description`

These keys match the tenant form and are easy to bind from your **GitHub** site using `TENANT_ID` / `TENANT_SLUG` (injected as Netlify environment variables on each tenant site).

## YCode “collection” alignment

YCode’s visual CMS typically stores collection rows in **Supabase tables** that YCode manages. This repo does **not** assume the exact table names of your YCode “Homepage” collection.

**Recommended approaches:**

1. **Query bridge (simplest)** — In the shared site code, read `tenant_homepage_content` by `tenant_id` (from `import.meta.env.TENANT_ID` or a lookup by slug). No duplicate storage in a YCode collection.
2. **Sync job** — If marketing must stay inside a YCode collection for editor workflows, add a Supabase **Edge Function** or scheduled job that copies from `tenant_homepage_content` into the YCode collection tables (after you map column IDs from your project).
3. **Dual write** — Extend `runProvisionPipeline` to insert into YCode’s collection table once you document that schema (use the service role only server-side).

There is **no public YCode “publish API”** documented for arbitrary CMS writes in this stack; **Supabase is the integration surface** for automation.

## Verification checklist

- [ ] Confirm `tenant_registry.id` matches `TENANT_ID` on the tenant Netlify site after deploy.
- [ ] Confirm the tenant frontend loads homepage copy from `tenant_homepage_content` or a synced collection.
- [ ] If using RLS for authenticated tenant users later, keep using the **service role** only in trusted server code (this dashboard and Edge Functions).
