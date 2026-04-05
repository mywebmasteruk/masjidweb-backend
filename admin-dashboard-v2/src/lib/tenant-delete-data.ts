import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YCode / CMS tables keyed by tenant_id. Keep aligned with
 * `public.delete_tenant_scoped_data` and `tenant-clone-manifest.ts`.
 * Order respects typical FK direction (children / dependents first).
 */
export const TENANT_SCOPED_CONTENT_TABLES = [
  "webhook_deliveries",
  "webhooks",
  "versions",
  "collection_imports",
  "api_keys",
  "mcp_tokens",
  "app_settings",
  "form_submissions",
  "collection_item_values",
  "collection_items",
  "page_layers",
  "collection_fields",
  "pages",
  "page_folders",
  "collections",
  "components",
  "layer_styles",
  "color_variables",
  "assets",
  "asset_folders",
  "fonts",
  "translations",
  "locales",
  "settings",
  "tenant_homepage_content",
] as const;

function tenantIdFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const raw = metadata?.tenant_id;
  if (raw == null || raw === "") return null;
  return String(raw);
}

/**
 * Delete Supabase Auth users whose `user_metadata.tenant_id` equals the given tenant.
 * Paginates through all users (listUsers defaults are not sufficient for large projects).
 */
async function deleteAuthUsersForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  const perPage = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      warnings.push(`listUsers (page ${page}): ${error.message}`);
      return;
    }
    const users = data?.users ?? [];
    const matches = users.filter((u) => tenantIdFromMetadata(u.user_metadata) === tenantId);
    for (const u of matches) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete auth user ${u.email ?? u.id}: ${delErr.message}`);
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }
}

/**
 * Delete Auth users whose metadata references a tenant id that is not in `tenant_registry`.
 * Use after `cleanup_orphan_tenant_rows` to remove builder accounts for deleted tenants.
 */
export async function deleteAuthUsersForMissingTenants(
  supabase: SupabaseClient,
  warnings: string[],
): Promise<number> {
  const { data: rows, error } = await supabase.from("tenant_registry").select("id");
  if (error) {
    warnings.push(`tenant_registry load for auth cleanup: ${error.message}`);
    return 0;
  }
  const valid = new Set((rows ?? []).map((r) => r.id as string));

  let removed = 0;
  const perPage = 1000;
  let page = 1;
  for (;;) {
    const { data, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      warnings.push(`listUsers (page ${page}): ${listErr.message}`);
      break;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      const tid = tenantIdFromMetadata(u.user_metadata);
      if (!tid || valid.has(tid)) continue;
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete orphan auth user ${u.email ?? u.id}: ${delErr.message}`);
      } else {
        removed += 1;
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return removed;
}

/**
 * Delete all CMS/YCode rows for a tenant and remove Supabase auth users tagged with that tenant_id.
 */
export async function deleteTenantScopedData(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  for (const table of TENANT_SCOPED_CONTENT_TABLES) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error && !error.message.includes("does not exist")) {
      warnings.push(`Failed to clean ${table}: ${error.message}`);
    }
  }

  try {
    await deleteAuthUsersForTenant(supabase, tenantId, warnings);
  } catch (e) {
    warnings.push(`Auth user cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }
}
