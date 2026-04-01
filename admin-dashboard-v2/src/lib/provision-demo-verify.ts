import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplateTenantId } from "./master-tenant-constants";

async function countTenantRows(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
  isPublished: boolean,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_published", isPublished)
    .is("deleted_at", null);

  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

/** After auto-publish, confirm collection items have a published snapshot. */
export async function appendPublishedCollectionDemoWarning(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  const ciNew = await countTenantRows(
    supabase,
    "collection_items",
    tenantId,
    false,
  );
  const pubNew = await countTenantRows(
    supabase,
    "collection_items",
    tenantId,
    true,
  );
  if (pubNew === 0 && ciNew > 0) {
    warnings.push(
      "Demo check — No published collection items yet; run Publish in the builder or confirm auto-publish succeeded.",
    );
  }
}

/**
 * Compare cloned site + CMS seed against the template tenant.
 * Appends human-readable gaps to `warnings` (non-fatal).
 */
export async function verifyTenantDemoData(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
  templateTenantId?: string,
  options?: { skipPublishedCollectionCheck?: boolean },
): Promise<void> {
  const tpl = templateTenantId ?? getTemplateTenantId();

  const pairs: [string, string][] = [
    ["pages", "Draft pages"],
    ["page_layers", "Draft page layers"],
    ["components", "Draft components"],
    ["collections", "Draft collections"],
    ["assets", "Draft assets"],
    ["layer_styles", "Draft layer styles"],
    ["locales", "Draft locales"],
    ["fonts", "Draft fonts"],
  ];

  for (const [table, label] of pairs) {
    const t = await countTenantRows(supabase, table, tpl, false);
    const n = await countTenantRows(supabase, table, tenantId, false);
    if (t > 0 && n !== t) {
      warnings.push(
        `Demo check — ${label}: template has ${t}, new tenant has ${n} (expected ${t}).`,
      );
    }
  }

  const ciTpl = await countTenantRows(supabase, "collection_items", tpl, false);
  const ciNew = await countTenantRows(supabase, "collection_items", tenantId, false);

  if (ciNew < 4) {
    warnings.push(
      `Demo check — CMS: only ${ciNew} draft collection items (expected several across Blog, Homepage, Navigation, Tenants).`,
    );
  } else if (ciTpl > 0 && ciNew < Math.min(ciTpl, 8)) {
    warnings.push(
      `Demo check — CMS draft items: template has ${ciTpl}, new tenant has ${ciNew} (may be OK if template was edited).`,
    );
  }

  if (!options?.skipPublishedCollectionCheck) {
    await appendPublishedCollectionDemoWarning(supabase, tenantId, warnings);
  }
}
