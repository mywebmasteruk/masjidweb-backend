import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YCode / CMS tables keyed by tenant_id. Keep aligned with
 * `public.delete_tenant_scoped_data` and `tenant-clone-manifest.ts`.
 */
export const TENANT_SCOPED_CONTENT_TABLES = [
  "collection_item_values",
  "collection_items",
  "collection_fields",
  "collections",
  "page_layers",
  "pages",
  "page_folders",
  "components",
  "layer_styles",
  "assets",
  "asset_folders",
  "fonts",
  "locales",
  "translations",
  "settings",
  "color_variables",
  "versions",
  "webhooks",
  "webhook_deliveries",
  "form_submissions",
  "api_keys",
  "mcp_tokens",
  "tenant_homepage_content",
] as const;

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
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const tenantUsers = (users?.users ?? []).filter(
      (u) => u.user_metadata?.tenant_id === tenantId,
    );
    for (const u of tenantUsers) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) warnings.push(`Failed to delete auth user ${u.email}: ${error.message}`);
    }
  } catch (e) {
    warnings.push(`Auth user cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }
}
