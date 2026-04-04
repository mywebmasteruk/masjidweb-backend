import type { SupabaseClient } from "@supabase/supabase-js";
import { removeDomainAlias } from "./netlify-domains";
import { readServerEnv } from "./server-env";
import { deleteTenantScopedData } from "./tenant-delete-data";

/**
 * Remove Netlify alias, delete all tenant-scoped data, and remove the registry row.
 * Used to reclaim a slug after a failed or deactivated provision so a new full run can proceed.
 */
export async function reclaimClientTenantForSlugReuse(
  supabase: SupabaseClient,
  tenant: { id: string; slug: string },
  warnings: string[],
): Promise<void> {
  const token = readServerEnv("NETLIFY_AUTH_TOKEN");
  const siteId = readServerEnv("NETLIFY_SITE_ID");
  const domainSuffix = readServerEnv("TENANT_DOMAIN_SUFFIX") || "masjidweb.com";

  if (token && siteId && tenant.slug) {
    try {
      await removeDomainAlias(token, siteId, `${tenant.slug}.${domainSuffix}`);
    } catch (err) {
      warnings.push(
        `Netlify alias removal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await deleteTenantScopedData(supabase, tenant.id, warnings);

  const { error: deleteErr } = await supabase
    .from("tenant_registry")
    .delete()
    .eq("id", tenant.id);

  if (deleteErr) {
    throw new Error(`Failed to remove tenant registry row: ${deleteErr.message}`);
  }
}
