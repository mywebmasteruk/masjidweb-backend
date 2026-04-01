/**
 * Tenant template clone — inventory, exclusions, and post-publish patch list.
 *
 * Keep this file aligned with `public.delete_tenant_scoped_data` in Supabase migrations
 * and with `cloneTemplateForTenant` / `seedTenantCmsContent` (and translation clone when present).
 *
 * ## Tables carrying tenant_id (tenant-scoped rows)
 *
 * **Deleted by** `delete_tenant_scoped_data` (order matters for FKs): webhook_deliveries,
 * webhooks, versions, collection_imports, api_keys, mcp_tokens, app_settings, translations,
 * color_variables, form_submissions, collection_item_values, collection_items, page_layers,
 * collection_fields, pages, collections, components, layer_styles, assets, asset_folders,
 * fonts, locales, settings.
 *
 * **Also tenant-scoped** (see backfill migrations): page_folders. It is not listed in
 * `delete_tenant_scoped_data` today — a merge hotspot if you tighten tenant teardown.
 *
 * ## What we copy from the demo template when provisioning a client tenant
 *
 * 1. **Structure** — `cloneTemplateForTenant` in `ycode-template-clone.ts` (see that file for
 *    the exact ordered steps; order is load-bearing when JSONB embeds UUIDs).
 * 2. **CMS rows** — `ycode-cms-seed.ts`: collection_items, collection_item_values (with
 *    reference remapping across collections where implemented).
  * 3. **i18n** — After CMS seed, clone template `translations` rows (remap `source_id` / keys). Some branches use `cloneTranslationsForTenant` in `completeProvision` before `patchNullTenantIds`.
 *
 * **Schema vs clone gaps to watch:** `color_variables` and `page_folders` carry `tenant_id`
 * in migrations but may not yet be cloned in every branch — extend `cloneTemplateForTenant`
 * when the builder depends on them for new tenants.
 *
 * ## Intentionally never cloned from the template
 *
 * New tenants start without these; they are secrets, audit, or empty operational state.
 * A generic "copy all tenant_id rows" copier must exclude them — see `NEVER_CLONE_FROM_TEMPLATE`.
 */

/** Registry, credentials, webhooks, version history, submissions — never duplicate from demo. */
export const NEVER_CLONE_FROM_TEMPLATE = [
  "tenant_registry",
  "provisioning_audit_log",
  "form_submissions",
  "mcp_tokens",
  "api_keys",
  "app_settings",
  "webhooks",
  "webhook_deliveries",
  "collection_imports",
  "versions",
] as const;

export type NeverCloneFromTemplateTable =
  (typeof NEVER_CLONE_FROM_TEMPLATE)[number];

/**
 * Tables with (id, is_published) versioning: after publish, published snapshots may have
 * null tenant_id while draft has the correct value. patchNullTenantIds copies tenant_id from
 * draft to published for the same id.
 */
export const DRAFT_PUBLISHED_PATCH_TABLES = [
  "collection_items",
  "collection_item_values",
  "collections",
  "collection_fields",
  "pages",
  "page_folders",
  "page_layers",
  "components",
  "layer_styles",
  "locales",
  "fonts",
  "assets",
  "asset_folders",
  "translations",
] as const;

export type DraftPublishedPatchTable = (typeof DRAFT_PUBLISHED_PATCH_TABLES)[number];
